import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@sinclair/typebox";
import { getEnabledSet } from "../config/enabled-set.js";
import { loadBlackbytesConfig } from "../config/loader.js";
import type { ExtensionAPI } from "../types/pi.js";
import { type SpawnFn, runNestedPi } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ORACLE_ALLOWLIST = ["read", "grep", "glob", "ast_grep_search"];

export function registerDelegateOracleTool(pi: ExtensionAPI, spawnFn?: SpawnFn): void {
  if (!getEnabledSet().subAgents.has("oracle")) return;

  pi.registerTool({
    name: "delegate_oracle",
    description:
      "Delegate a hard reasoning or architecture problem to the Oracle sub-agent — a " +
      "high-IQ read-only consultation specialist. Use for debugging complex issues, " +
      "architecture design decisions, or any question that requires deep analytical " +
      "reasoning. The sub-agent has read-only access and uses elevated reasoning effort.",
    parameters: Type.Object({
      question: Type.String({
        description:
          "The question or problem to reason about. Include all relevant context " +
          "inline. Be precise about what decision or insight you need.",
      }),
      context: Type.Optional(
        Type.String({
          description:
            "Additional context (code snippets, error messages, constraints) to " +
            "include with the question.",
        }),
      ),
    }),
    execute: async (params: { question: string; context?: string }) => {
      const [prompt, config] = await Promise.all([
        readFile(join(__dirname, "../prompts/oracle.md"), "utf-8"),
        loadBlackbytesConfig(),
      ]);

      const oracleOverrides = config.sub_agents?.oracle ?? {};
      const model = oracleOverrides.model;
      const reasoningEffort = oracleOverrides.reasoningEffort ?? "high";

      const userPrompt = params.context
        ? `${params.question}\n\n---\n\nAdditional context:\n${params.context}`
        : params.question;

      const result = await runNestedPi(
        {
          systemPrompt: prompt,
          userPrompt,
          model,
          reasoningEffort,
          allowedTools: ORACLE_ALLOWLIST,
        },
        spawnFn,
      );
      return {
        content: result.success ? result.content : `Error: ${result.content}`,
      };
    },
  });
}
