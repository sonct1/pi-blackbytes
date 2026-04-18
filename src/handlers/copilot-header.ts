import type { ExtensionAPI } from "../types/pi.js";

export function registerCopilotHeader(
  pi: ExtensionAPI,
  config: { copilot_initiator_header: boolean },
): void {
  if (!config.copilot_initiator_header) return;
  pi.registerProvider("github-copilot", { headers: { "x-initiator": "agent" } });
}
