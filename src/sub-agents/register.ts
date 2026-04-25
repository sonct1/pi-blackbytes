import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getEnabledSet } from "../config/enabled-set.js";
import { getLogger } from "../shared/logger.js";
import type { SubAgentDeclaration } from "./declaration.js";
import { finalizeNestedTools } from "./delegable-tools.js";
import { type FallbackResult, executeWithFallback, formatAttempts } from "./fallback.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { type SpawnFn, formatDelegateFailure, runNestedPi } from "./runner.js";
import { getAgentSnapshotFor } from "./snapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RegisterSubAgentOptions {
  /** Override the default spawn function (for testing). */
  spawnFn?: SpawnFn;
}

/**
 * Register a sub-agent with the Pi host based on its declaration.
 * Skips registration silently when the agent is not in the enabled set.
 *
 * This is the generic replacement for per-agent `registerDelegate*Tool()`
 * functions. It reads the system prompt, resolves allowed tools and model
 * overrides from the declaration, then delegates to `runNestedPi()`.
 */
export function registerSubAgent(
  pi: ExtensionAPI,
  declaration: SubAgentDeclaration,
  options?: RegisterSubAgentOptions,
): void {
  if (!getEnabledSet().subAgents.has(declaration.name)) return;

  const { spawnFn } = options ?? {};

  (pi.registerTool as (def: unknown) => void)({
    name: declaration.toolName,
    description: declaration.description,
    parameters: declaration.parameters,
    execute: async (
      _toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
      _onUpdate?: unknown,
      ctx?: { cwd?: string },
    ) => {
      try {
        const baseSystemPrompt =
          declaration.systemPrompt ??
          (declaration.systemPromptPath
            ? await readFile(join(__dirname, "..", declaration.systemPromptPath), "utf-8")
            : undefined);

        if (!baseSystemPrompt) {
          throw new Error(
            `Sub-agent "${declaration.name}" has neither systemPrompt nor systemPromptPath`,
          );
        }

        // Resolve the per-agent snapshot up front so promptMode (which may
        // be overridden via JSON config) can flow into the prompt builder.
        const snapshot = getAgentSnapshotFor(declaration.name);

        // Build the system prompt through the centralised assembler. In static
        // mode (the only currently supported mode) this is a no-op pass-through.
        // append mode throws immediately so callers fail loudly.
        const builtPrompt = buildSystemPrompt({
          basePrompt: baseSystemPrompt,
          declaration: {
            name: declaration.name,
            promptMode: snapshot?.promptMode ?? declaration.promptMode,
          },
        });

        const userPrompt = declaration.buildUserPrompt(params);

        const rawAllowedTools =
          typeof declaration.allowedTools === "function"
            ? [...declaration.allowedTools()]
            : [...declaration.allowedTools];

        const finalized = finalizeNestedTools({
          tools: rawAllowedTools,
          globalDisabled: getEnabledSet().disabledTools,
          mutability: declaration.mutability ?? "read-only",
          mode: declaration.finalizeMode ?? "strict",
          context: `sub-agent ${declaration.name}`,
        });
        const allowedTools = [...finalized.tools];

        if (finalized.droppedGlobalDisabled.length > 0) {
          getLogger().warn("Sub-agent dropped globally disabled tools", {
            agent: declaration.name,
            dropped: [...finalized.droppedGlobalDisabled],
          });
        }
        if (finalized.droppedMutability.length > 0) {
          getLogger().warn("Sub-agent dropped mutating tools (read-only policy)", {
            agent: declaration.name,
            dropped: [...finalized.droppedMutability],
          });
        }
        if (finalized.droppedUnknown.length > 0) {
          // strict mode already threw above; this branch is reached only in lenient mode.
          getLogger().warn("Sub-agent dropped unknown / delegate tool names", {
            agent: declaration.name,
            dropped: [...finalized.droppedUnknown],
          });
        }

        // Apply any declaration-level prepend overlay (e.g. General safety).
        let finalSystemPrompt = builtPrompt;
        if (declaration.prependSystemPrompt) {
          try {
            const overlay = await declaration.prependSystemPrompt({
              cwd: ctx?.cwd,
              finalizedTools: allowedTools,
            });
            if (overlay && overlay.length > 0) {
              finalSystemPrompt = `${overlay}\n\n${builtPrompt}`;
            }
          } catch (err) {
            getLogger().warn("Sub-agent prependSystemPrompt builder failed; using base prompt", {
              agent: declaration.name,
              error: (err as Error).message,
            });
          }
        }

        // Centralized per-agent config: snapshot resolved above. Fall back to
        // the legacy dynamic resolver only when the snapshot is unavailable
        // (e.g. older tests that don't init the snapshot).
        const overrides = snapshot
          ? {
              model: snapshot.model,
              reasoningEffort: snapshot.reasoningEffort,
              timeoutMs: snapshot.timeoutMs,
            }
          : ((await declaration.resolveModelOverrides?.()) ?? {});

        const baseRunOpts = {
          systemPrompt: finalSystemPrompt,
          userPrompt,
          model: overrides.model,
          reasoningEffort: overrides.reasoningEffort,
          timeoutMs: overrides.timeoutMs,
          allowedTools,
          cwd: ctx?.cwd,
          signal,
        };

        let result: FallbackResult;
        if (snapshot) {
          if (
            snapshot.fallbackModels &&
            snapshot.fallbackModels.length > 0 &&
            !snapshot.fallbackEligible
          ) {
            getLogger().warn(
              "Sub-agent has fallbackModels configured but is ineligible; ignoring fallback chain",
              {
                agent: declaration.name,
                fallbackModels: [...snapshot.fallbackModels],
              },
            );
          }
          result = await executeWithFallback({
            snapshot,
            runOpts: baseRunOpts,
            runner: (o) => runNestedPi(o, spawnFn),
          });
        } else {
          // Legacy path: no snapshot available (e.g. older tests).
          const r = await runNestedPi(baseRunOpts, spawnFn);
          result = {
            ...r,
            attemptedModels: [
              {
                model: overrides.model,
                status: r.success ? "success" : (r.failureKind ?? "failed"),
                retriable: false,
                durationMs: 0,
              },
            ],
          };
        }

        let text: string;
        if (result.success) {
          // On multi-attempt success, append a brief attempt summary so the
          // caller can see which model finally succeeded.
          if (result.attemptedModels.length > 1) {
            text = `${result.content}\n\n_Attempted models: ${formatAttempts(result.attemptedModels)}_`;
          } else {
            text = result.content;
          }
        } else {
          text = formatDelegateFailure(result);
          if (result.attemptedModels.length > 1) {
            text += `\nAttempted models: ${formatAttempts(result.attemptedModels)}`;
          }
        }
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        // Convert any setup-time error (prompt load, prompt-builder append throw,
        // strict finalizer rejection, dynamic allowedTools throwing, snapshot lookup,
        // etc.) into a controlled tool result so the host never sees a raw throw.
        const message = err instanceof Error ? err.message : String(err);
        getLogger().warn("Sub-agent delegate execution failed before nested Pi", {
          agent: declaration.name,
          error: message,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Sub-agent "${declaration.name}" failed before nested Pi execution\nDetails:\n${message}`,
            },
          ],
        };
      }
    },
  });
}
