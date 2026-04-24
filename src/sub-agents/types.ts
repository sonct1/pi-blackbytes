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
  onUpdate?: (chunk: string) => void;
  killGraceMs?: number;
}

export interface DelegateResult {
  success: boolean;
  content: string;
  details?: string;
  failureKind?: DelegateFailureKind;
}
