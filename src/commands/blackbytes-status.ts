import { type EnabledSet, getEnabledSet } from "../config/enabled-set.js";
import { loadBlackbytesConfig } from "../config/loader.js";

const SECRET_KEYS = ["api_key", "exa_api_key", "tavily_api_key", "authorization"];

function redactValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && SECRET_KEYS.some((k) => key.toLowerCase().includes(k))) {
    return "[REDACTED]";
  }
  return value;
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = redactConfig(value as Record<string, unknown>);
    } else {
      result[key] = redactValue(key, value);
    }
  }
  return result;
}

export async function handleBlackbytesStatus(): Promise<string> {
  let enabledSet: EnabledSet | undefined;
  try {
    enabledSet = getEnabledSet();
  } catch {
    return "Blackbytes not initialized. Run a session first.";
  }

  const config = await loadBlackbytesConfig();
  const redacted = redactConfig(config as unknown as Record<string, unknown>);

  const lines: string[] = [
    "## Blackbytes Status",
    "",
    "### Enabled Tools",
    ...[...enabledSet.tools].map((t) => `- ${t}`),
    "",
    "### Enabled Sub-Agents",
    ...[...enabledSet.subAgents].map((a) => `- ${a}`),
    "",
    "### Enabled Skills",
    ...[...enabledSet.skills].map((s) => `- ${s}`),
    "",
    "### Config",
    "```json",
    JSON.stringify(redacted, null, 2),
    "```",
  ];

  return lines.join("\n");
}
