import type { BlackbytesConfig } from "./schema.js";

export interface EnabledSet {
  readonly tools: ReadonlySet<string>;
  readonly subAgents: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
}

const DEFAULT_TOOLS = [
  "hashline_edit",
  "ast_grep_search",
  "ast_grep_replace",
  "grep",
  "glob",
  "websearch_search",
  "websearch_fetch",
  "context7_resolve_library_id",
  "context7_query_docs",
  "grep_app_search_github",
];

const DEFAULT_SUB_AGENTS = ["explore", "oracle", "librarian", "general"];

const DEFAULT_SKILLS = [
  "implementing-beads",
  "planning-from-spec",
  "reviewing-plan",
  "converting-plan-to-beads",
  "polishing-beads",
  "doc-coauthoring",
  "skill-creator",
  "find-skills",
  "swarm-beads",
];

export function computeEnabledSet(config: BlackbytesConfig): EnabledSet {
  const disabledTools = new Set(config.disabled_tools ?? []);
  const disabledSubAgents = new Set<string>(config.disabled_sub_agents ?? []);

  const tools = new Set(DEFAULT_TOOLS.filter((t) => !disabledTools.has(t)));
  const subAgents = new Set(DEFAULT_SUB_AGENTS.filter((a) => !disabledSubAgents.has(a)));
  const skills = new Set(DEFAULT_SKILLS);

  return Object.freeze({ tools, subAgents, skills });
}

let sessionSet: EnabledSet | null = null;

export function initEnabledSet(config: BlackbytesConfig): EnabledSet {
  if (sessionSet !== null) {
    throw new Error("EnabledSet already initialized for this session");
  }
  sessionSet = computeEnabledSet(config);
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
