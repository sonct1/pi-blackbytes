import { ALL_TOOL_NAMES } from "../config/resource-metadata.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Pi-provided tools that sub-agents can reference in allowlists.
 * These are host-managed — not registered by the extension.
 */
export const PI_DEFAULT_TOOLS: ReadonlySet<string> = new Set(["read"]);

/**
 * Complete set of tool names valid for sub-agent delegation.
 * Union of extension-managed tools and Pi defaults.
 */
export const DELEGABLE_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ALL_TOOL_NAMES,
  ...PI_DEFAULT_TOOLS,
]);

/** Check whether a tool name is known to the delegable registry. */
export function isDelegableTool(name: string): boolean {
  return DELEGABLE_TOOL_NAMES.has(name);
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
