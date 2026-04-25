import { ALL_TOOL_NAMES, TOOL_NAMES } from "../config/resource-metadata.js";

// ---------------------------------------------------------------------------
// Tool classes — single source of truth for nested allowlist composition
// ---------------------------------------------------------------------------

/**
 * Extension-managed tools registered by this package.
 * Mirrors `ALL_TOOL_NAMES` from `resource-metadata.ts`.
 */
export const EXTENSION_TOOL_NAMES: ReadonlySet<string> = new Set(ALL_TOOL_NAMES);

/**
 * Pi host built-in tools confirmed by the Pi CLI compatibility evidence
 * captured in `runner.test.ts` (Pi 0.67.x). These are NOT registered by this
 * extension; they are owned by the Pi host process and become available to
 * nested sessions when listed in `--tools`.
 */
export const PI_BUILTIN_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
]);

/**
 * Subset of `PI_BUILTIN_TOOLS` that is always considered safe to include in
 * any allowlist regardless of the agent's mutability policy. Today this is
 * just `read` — every sub-agent (read-only or write-capable) needs it.
 */
export const PI_DEFAULT_TOOLS: ReadonlySet<string> = new Set(["read"]);

/**
 * Read / search / docs tools spanning Pi built-ins and extension tools.
 * Safe to expose to read-only sub-agents (explore, oracle, librarian, and
 * YAML-defined sub-agents that don't opt in to write access).
 */
export const READ_SEARCH_DOCS_TOOLS: ReadonlySet<string> = new Set([
  // Pi-side read/search
  "read",
  "grep",
  "find",
  "ls",
  // Extension-side read/search
  TOOL_NAMES.GLOB,
  TOOL_NAMES.AST_SEARCH,
  // Docs/web/code-search (no side effects)
  TOOL_NAMES.WEB_SEARCH,
  TOOL_NAMES.WEB_FETCH,
  TOOL_NAMES.DOCS_RESOLVE,
  TOOL_NAMES.DOCS_QUERY,
  TOOL_NAMES.GH_SEARCH,
]);

/**
 * Mutating / executing tools spanning Pi built-ins and extension tools.
 * Only sub-agents declared `full-access` may receive any of these.
 */
export const MUTATING_EXEC_TOOLS: ReadonlySet<string> = new Set([
  // Pi-side
  "bash",
  "edit",
  "write",
  // Extension-side
  TOOL_NAMES.HASHLINE_EDIT,
  TOOL_NAMES.AST_REPLACE,
]);

/**
 * Complete set of tool names valid for sub-agent delegation.
 * Union of extension-managed tools and Pi built-ins.
 */
export const DELEGABLE_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...EXTENSION_TOOL_NAMES,
  ...PI_BUILTIN_TOOLS,
]);

/** Check whether a tool name is known to the delegable registry. */
export function isDelegableTool(name: string): boolean {
  return DELEGABLE_TOOL_NAMES.has(name);
}

/** Check whether a tool name is on the mutating/exec list. */
export function isMutatingTool(name: string): boolean {
  return MUTATING_EXEC_TOOLS.has(name);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ToolValidationResult {
  readonly valid: readonly string[];
  readonly unknown: readonly string[];
}

/**
 * Partition tool names into valid (known, non-delegate) and unknown.
 * `delegate_*` names are always placed in `unknown` — recursive delegation
 * is never allowed.
 */
export function validateToolNames(names: readonly string[]): ToolValidationResult {
  const valid: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    if (name.startsWith("delegate_") || !isDelegableTool(name)) {
      unknown.push(name);
    } else {
      valid.push(name);
    }
  }
  return { valid, unknown };
}

/**
 * Strict validation for builtin declarations.
 * Throws if any name is unknown or is a delegate tool.
 */
export function validateBuiltinToolNames(names: readonly string[]): readonly string[] {
  const { valid, unknown } = validateToolNames(names);
  if (unknown.length > 0) {
    throw new Error(`Unknown tool names in builtin allowlist: ${unknown.join(", ")}`);
  }
  return valid;
}

// ---------------------------------------------------------------------------
// Resolution strategies
// ---------------------------------------------------------------------------

export type ToolResolutionStrategy =
  | { readonly kind: "allowlist"; readonly tools: readonly string[] }
  | { readonly kind: "denylist"; readonly tools: readonly string[] }
  | { readonly kind: "all-except-delegates" };

/**
 * Resolve the final tool set from a strategy and the current enabled tools.
 *
 * - `allowlist` — returns the explicit list as-is (caller validates first).
 * - `denylist`  — (enabledTools ∪ PI_DEFAULT_TOOLS) minus denied, minus delegate_*.
 * - `all-except-delegates` — enabledTools minus delegate_*.
 *
 * NOTE: This function is left intentionally narrow. The global
 * `blackbytes.disabled_tools` denylist, mutability enforcement, and
 * deterministic ordering are applied separately by `finalizeNestedTools()`.
 */
export function resolveToolStrategy(
  strategy: ToolResolutionStrategy,
  enabledTools: ReadonlySet<string>,
): readonly string[] {
  switch (strategy.kind) {
    case "allowlist":
      return [...strategy.tools];
    case "denylist": {
      const denied = new Set(strategy.tools);
      const base = new Set([...enabledTools, ...PI_DEFAULT_TOOLS]);
      return [...base].filter((t) => !denied.has(t) && !t.startsWith("delegate_"));
    }
    case "all-except-delegates":
      return [...enabledTools].filter((t) => !t.startsWith("delegate_"));
  }
}

// ---------------------------------------------------------------------------
// Nested-tool finalizer
// ---------------------------------------------------------------------------

/**
 * Mutability classification for a sub-agent. Determines which Pi/extension
 * tools the finalizer is allowed to keep.
 *
 * - `read-only` — only `READ_SEARCH_DOCS_TOOLS` are permitted; mutating /
 *   executing tools are stripped even if explicitly listed.
 * - `full-access` — both read-only and mutating/exec tools are permitted.
 */
export type AgentMutability = "read-only" | "full-access";

/** Strict mode throws on unknown / delegate names; lenient mode drops them. */
export type FinalizeMode = "strict" | "lenient";

export interface FinalizeNestedToolsInput {
  /** Candidate tool names from the agent declaration / strategy resolver. */
  readonly tools: readonly string[];
  /**
   * Global denylist sourced from `blackbytes.disabled_tools`. Applied to both
   * extension tools and Pi built-ins (Pi will warn-and-drop unknown names if
   * a built-in is excluded, but excluding it from `--tools` is the safest
   * enforcement mechanism we control).
   */
  readonly globalDisabled: ReadonlySet<string>;
  /** Per-agent mutability policy. */
  readonly mutability: AgentMutability;
  /**
   * Validation mode:
   * - `strict`   — used by builtin declarations; throws on unknown / delegate.
   * - `lenient`  — used by dynamic / YAML allowlists; silently drops them.
   */
  readonly mode: FinalizeMode;
  /**
   * Optional context label included in error messages (e.g. agent name).
   */
  readonly context?: string;
}

export interface FinalizeNestedToolsResult {
  /** Final, deduplicated, deterministically-ordered tool names. */
  readonly tools: readonly string[];
  /** Names dropped because they were unknown or `delegate_*`. */
  readonly droppedUnknown: readonly string[];
  /** Names dropped by the global `blackbytes.disabled_tools` denylist. */
  readonly droppedGlobalDisabled: readonly string[];
  /** Names dropped by the agent's mutability policy. */
  readonly droppedMutability: readonly string[];
}

/**
 * Central finalization step every sub-agent path must call before invoking
 * `runNestedPi()`. Performs, in order:
 *
 *   1. Deduplicate input names (preserve first occurrence).
 *   2. Reject `delegate_*` and unknown names (throw in strict mode, drop in
 *      lenient mode).
 *   3. Apply the global `blackbytes.disabled_tools` denylist.
 *   4. Enforce per-agent mutability: read-only agents may only keep tools in
 *      `READ_SEARCH_DOCS_TOOLS`; mutating/exec tools are stripped.
 *   5. Sort the result for deterministic `--tools` argument output.
 */
export function finalizeNestedTools(input: FinalizeNestedToolsInput): FinalizeNestedToolsResult {
  const { tools, globalDisabled, mutability, mode, context } = input;

  // 1. Dedupe (preserve first occurrence order for deterministic diagnostics).
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of tools) {
    if (!seen.has(name)) {
      seen.add(name);
      deduped.push(name);
    }
  }

  // 2. Validate names — partition into valid vs unknown/delegate.
  const droppedUnknown: string[] = [];
  const validated: string[] = [];
  for (const name of deduped) {
    if (name.startsWith("delegate_") || !isDelegableTool(name)) {
      droppedUnknown.push(name);
    } else {
      validated.push(name);
    }
  }
  if (droppedUnknown.length > 0 && mode === "strict") {
    const where = context ? ` (${context})` : "";
    throw new Error(
      `Unknown or delegate tool names in nested allowlist${where}: ${droppedUnknown.join(", ")}`,
    );
  }

  // 3. Apply the global denylist (extension tools + Pi built-ins).
  const droppedGlobalDisabled: string[] = [];
  const afterGlobalDisable: string[] = [];
  for (const name of validated) {
    if (globalDisabled.has(name)) {
      droppedGlobalDisabled.push(name);
    } else {
      afterGlobalDisable.push(name);
    }
  }

  // 4. Enforce per-agent mutability.
  const droppedMutability: string[] = [];
  const afterMutability: string[] = [];
  for (const name of afterGlobalDisable) {
    if (mutability === "read-only" && isMutatingTool(name)) {
      droppedMutability.push(name);
    } else {
      afterMutability.push(name);
    }
  }

  // 5. Deterministic ordering.
  const sorted = [...afterMutability].sort();

  return {
    tools: sorted,
    droppedUnknown,
    droppedGlobalDisabled,
    droppedMutability,
  };
}
