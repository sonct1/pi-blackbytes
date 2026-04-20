import type { TObject } from "@sinclair/typebox";
import type { SubAgentMeta } from "../config/resource-metadata.js";

/** Model and reasoning-effort overrides resolved at execution time. */
export interface ModelOverrides {
  model?: string;
  reasoningEffort?: string;
}

/**
 * Static tool allowlist or a function that resolves it at execution time.
 * Dynamic resolvers are called per invocation so config changes are picked up.
 */
export type AllowedToolsResolver = readonly string[] | (() => readonly string[]);

/**
 * Declaration contract shared by builtin and YAML-defined sub-agents.
 *
 * Builtins supply explicit `parameters` and `buildUserPrompt` hooks;
 * YAML-loaded agents may use a simpler `{ prompt: string }` shape,
 * but the registrar must never assume that.
 */
export interface SubAgentDeclaration<
  TParams extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Sub-agent identity, e.g. "explore", "oracle". */
  readonly name: string;

  /** Delegate tool name registered with the host, e.g. "delegate_explore". */
  readonly toolName: string;

  /** Human-readable description shown in tool metadata. */
  readonly description: string;

  /** TypeBox parameter schema for the delegate tool. */
  readonly parameters: TObject;

  /** Inline system-prompt text. Takes precedence over systemPromptPath. */
  readonly systemPrompt?: string;

  /** Path to the system-prompt file (resolved from the prompts directory). */
  readonly systemPromptPath?: string;

  /** Static tool allowlist or a function that resolves it at execution time. */
  readonly allowedTools: AllowedToolsResolver;

  /**
   * Builds the user-prompt string from validated call parameters.
   * Method syntax enables bivariant checking for heterogeneous declaration arrays.
   */
  buildUserPrompt(params: TParams): string;

  /**
   * Resolve model and reasoning-effort overrides at execution time
   * so config changes are picked up dynamically.
   * May return a plain object or a Promise for async config loading.
   */
  readonly resolveModelOverrides?: () => ModelOverrides | Promise<ModelOverrides>;
}

/**
 * Creates an immutable sub-agent declaration with full type inference
 * over the parameters shape.
 */
export function defineSubAgent<TParams extends Record<string, unknown>>(
  declaration: SubAgentDeclaration<TParams>,
): SubAgentDeclaration<TParams> {
  return Object.freeze(declaration);
}

/** Derives a {@link SubAgentMeta} from a declaration for runtime registration. */
export function declarationToMeta(decl: SubAgentDeclaration): SubAgentMeta {
  return {
    name: decl.name,
    description: decl.description,
    promptFeatures: ["subagentDelegation"],
  };
}
