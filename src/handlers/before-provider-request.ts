import type { ModelFamily } from "../shared/model-capability.js";

function mapClaudeThinking(reasoningEffort: string): Record<string, unknown> {
  if (reasoningEffort === "low") {
    return { type: "disabled" };
  }
  const budgetTokens = reasoningEffort === "high" ? 50000 : 5000;
  return { type: "enabled", budget_tokens: budgetTokens };
}

function mapGeminiThinking(reasoningEffort: string): Record<string, unknown> {
  if (reasoningEffort === "low") {
    return { thinking_mode: "disabled" };
  }
  const budget = reasoningEffort === "high" ? 50000 : 5000;
  return { thinking_mode: "enabled", budget_tokens: budget };
}

export function mapReasoningEffort(
  payload: Record<string, unknown>,
  reasoningEffort: string | undefined,
  family: ModelFamily,
): void {
  if (!reasoningEffort) return;

  switch (family) {
    case "claude":
      if (!("thinking" in payload)) {
        payload.thinking = mapClaudeThinking(reasoningEffort);
      }
      break;
    case "gpt":
      if (!("reasoning_effort" in payload)) {
        payload.reasoning_effort = reasoningEffort;
      }
      break;
    case "gemini":
      if (!("thinking_config" in payload)) {
        payload.thinking_config = mapGeminiThinking(reasoningEffort);
      }
      break;
    case "other":
      break;
  }
}
