export type DelegateFailureKind =
  | "failed"
  | "timed_out"
  | "cancelled"
  | "spawn_error"
  | "recursion_refused"
  | "cli_usage_error"
  | "invalid_tool_allowlist"
  | "provider_or_model_unavailable";

export interface RunNestedPiOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  reasoningEffort?: string;
  allowedTools: string[];
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number; // default 300000 (5min)
  /**
   * Internal-only stdout callback for testing and diagnostic purposes.
   *
   * @internal
   *
   * Why this is NOT wired to the Pi host `onUpdate` (AgentToolUpdateCallback):
   *
   * Pi's `ToolDefinition.execute` receives an `onUpdate: AgentToolUpdateCallback<TDetails>`
   * callback that streams partial `AgentToolResult` objects to the TUI. The bash tool uses
   * this surface to show live command output in the UI. Calling `onUpdate` does NOT append
   * content to the final tool result that the LLM sees — it is a pure UI streaming surface.
   *
   * Despite the surface being technically safe (no LLM context leakage), we do NOT wire
   * nested-Pi stdout through `onUpdate` for the following reasons:
   *
   * 1. **Verbose raw output**: nested-Pi stdout is the full agent conversation — reasoning
   *    tokens, intermediate tool calls, tool results, and final output. Streaming this into
   *    the TUI would be overwhelming and meaningless to the user.
   *
   * 2. **No secret redaction on the streaming path**: `redactFailureText` is applied only to
   *    failure detail strings. Raw stdout may contain API keys, tokens, or other sensitive
   *    values surfaced by nested tool calls. Without a redaction pass on every chunk, wiring
   *    this is unsafe.
   *
   * 3. **"Do not dump nested stdout into parent context"**: the TUI is part of the parent
   *    context. Streaming thousands of lines of nested conversation into the parent TUI
   *    violates this design constraint even if the LLM context remains clean.
   *
   * Streaming would become supportable if Pi exposes a structured progress surface
   * (e.g. typed progress events) and a chunk-level redaction utility, or if the nested
   * session emits structured events (status lines, tool-name updates) rather than raw
   * conversation text.
   */
  onUpdate?: (chunk: string) => void;
  killGraceMs?: number;
}

export interface DelegateResult {
  success: boolean;
  content: string;
  details?: string;
  failureKind?: DelegateFailureKind;
}
