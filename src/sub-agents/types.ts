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
}

export interface DelegateResult {
  success: boolean;
  content: string;
  details?: string;
}
