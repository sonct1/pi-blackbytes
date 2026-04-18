export type ModelFamily = "claude" | "gpt" | "gemini" | "other";

export function classifyModel(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes("claude")) return "claude";
  if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("o4"))
    return "gpt";
  if (id.includes("gemini")) return "gemini";
  return "other";
}

// Module-level cache
let _cachedFamily: ModelFamily = "other";

export function setModelFamily(modelId: string): ModelFamily {
  _cachedFamily = classifyModel(modelId);
  return _cachedFamily;
}

export function getModelFamily(): ModelFamily {
  return _cachedFamily;
}

// For testing
export function _resetModelFamily(): void {
  _cachedFamily = "other";
}
