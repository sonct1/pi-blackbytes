import { getEnabledSet } from "../config/enabled-set.js";
import { getRegisteredSubAgents } from "../config/resource-metadata.js";
import { createBytesPromptRenderContext } from "../prompts/bytes/shared.js";
import { renderBytesPrompt } from "../prompts/loader.js";
import { resolvePromptModelFamily } from "../shared/model-capability.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTINEL_START = "<!-- pi-blackbytes:resources:start -->";
const SENTINEL_END = "<!-- pi-blackbytes:resources:end -->";

// ---------------------------------------------------------------------------
// Block builder
// ---------------------------------------------------------------------------

function buildResourcesBlock(enabledSubAgents: ReadonlySet<string>): string {
  const activeAgents = getRegisteredSubAgents().filter((a) => enabledSubAgents.has(a.name));
  if (activeAgents.length === 0) return "";

  const lines: string[] = ["Available agents:"];
  for (const agent of activeAgents) {
    lines.push(`- ${agent.name}: ${agent.description}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function injectPromptAugmentation(systemPrompt: string, modelId?: string): string {
  let enabledTools = new Set<string>();
  let enabledSubAgents = new Set<string>();

  try {
    const enabledSet = getEnabledSet();
    enabledTools = new Set(enabledSet.tools);
    enabledSubAgents = new Set(enabledSet.subAgents);
  } catch {
    // Fall back to a minimal safe overlay when runtime state is unavailable.
  }

  const family = resolvePromptModelFamily(modelId);
  const resourcesInner = buildResourcesBlock(enabledSubAgents);
  const bytesPrompt = renderBytesPrompt(
    createBytesPromptRenderContext(family, enabledTools, enabledSubAgents),
  );

  const parts: string[] = [SENTINEL_START, bytesPrompt];
  if (resourcesInner) {
    if (family === "claude" || family === "other") {
      parts.push("", "<available_resources>", resourcesInner, "</available_resources>");
    } else {
      parts.push("", resourcesInner);
    }
  }
  parts.push(SENTINEL_END);

  const block = parts.join("\n");

  const startIdx = systemPrompt.indexOf(SENTINEL_START);
  const endIdx = systemPrompt.indexOf(SENTINEL_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block in-place
    return (
      systemPrompt.slice(0, startIdx) + block + systemPrompt.slice(endIdx + SENTINEL_END.length)
    );
  }

  // Append
  return `${systemPrompt}\n${block}`;
}
