import { ALL_SUB_AGENT_NAMES, ALL_TOOL_NAMES, DEFAULT_SKILLS } from "./resource-metadata.js";
import type { BlackbytesConfig } from "./schema.js";

export interface EnabledSet {
  readonly tools: ReadonlySet<string>;
  readonly subAgents: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
}

export function computeEnabledSet(
  config: BlackbytesConfig,
  knownAgentNames?: readonly string[],
): EnabledSet {
  const disabledTools = new Set(config.disabled_tools ?? []);
  const disabledSubAgents = new Set<string>(config.disabled_sub_agents ?? []);

  const tools = new Set(ALL_TOOL_NAMES.filter((t) => !disabledTools.has(t)));
  const agentNames = knownAgentNames ?? ALL_SUB_AGENT_NAMES;
  const subAgents = new Set(agentNames.filter((a) => !disabledSubAgents.has(a)));
  const skills = new Set(DEFAULT_SKILLS);

  return Object.freeze({ tools, subAgents, skills });
}

let sessionSet: EnabledSet | null = null;

export function initEnabledSet(
  config: BlackbytesConfig,
  knownAgentNames?: readonly string[],
): EnabledSet {
  if (sessionSet !== null) {
    throw new Error("EnabledSet already initialized for this session");
  }
  sessionSet = computeEnabledSet(config, knownAgentNames);
  return sessionSet;
}

export function getEnabledSet(): EnabledSet {
  if (sessionSet === null) {
    throw new Error("EnabledSet not initialized — call initEnabledSet first");
  }
  return sessionSet;
}

// For testing only
export function _resetEnabledSet(): void {
  sessionSet = null;
}
