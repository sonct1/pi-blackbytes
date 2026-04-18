import { getEnabledSet } from "../config/enabled-set.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTINEL_START = "<!-- pi-blackbytes:resources:start -->";
const SENTINEL_END = "<!-- pi-blackbytes:resources:end -->";

const BUNDLED_TOOLS = new Set([
  "hashline_edit",
  "ast_grep_search",
  "ast_grep_replace",
  "grep",
  "glob",
]);

interface McpServer {
  readonly name: string;
  readonly description: string;
  readonly tools: readonly string[];
}

const MCP_SERVERS: readonly McpServer[] = [
  {
    name: "websearch",
    description: "web search and page fetching",
    tools: ["websearch_search", "websearch_fetch"],
  },
  {
    name: "context7",
    description: "library/framework documentation lookup",
    tools: ["context7_resolve_library_id", "context7_query_docs"],
  },
  {
    name: "grep_app",
    description: "GitHub code search across public repositories",
    tools: ["grep_app_search_github"],
  },
];

interface SubAgentInfo {
  readonly name: string;
  readonly description: string;
}

const SUB_AGENTS: readonly SubAgentInfo[] = [
  { name: "explore", description: "Contextual grep for codebases" },
  { name: "oracle", description: "Read-only consultation agent for debugging and architecture" },
  { name: "librarian", description: "Multi-repo analysis, documentation lookup" },
  { name: "general", description: "Implementation executor for heavy multi-file work" },
];

// ---------------------------------------------------------------------------
// Block builder
// ---------------------------------------------------------------------------

function buildResourcesBlock(
  enabledTools: ReadonlySet<string>,
  enabledSubAgents: ReadonlySet<string>,
): string {
  const lines: string[] = [
    "You have access to a set of tools you can use to answer the user's question.",
    "",
  ];

  // Bundled tools
  const activeBundled = [...BUNDLED_TOOLS].filter((t) => enabledTools.has(t));
  if (activeBundled.length > 0) {
    lines.push(`Bundled tools: ${activeBundled.join(", ")}`);
  }

  // MCP servers
  for (const server of MCP_SERVERS) {
    const activeTools = server.tools.filter((t) => enabledTools.has(t));
    if (activeTools.length === 0) continue;
    lines.push(`MCP servers: ${server.name} (${server.description})`);
    lines.push(`MCP tools namespaced as {server}_{tool}: ${activeTools.join(", ")}`);
  }

  // Available agents
  const activeAgents = SUB_AGENTS.filter((a) => enabledSubAgents.has(a.name));
  if (activeAgents.length > 0) {
    lines.push("");
    lines.push("Available agents:");
    for (const agent of activeAgents) {
      lines.push(`- ${agent.name}: ${agent.description}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function injectAvailableResources(systemPrompt: string): string {
  const { tools, subAgents } = getEnabledSet();
  const inner = buildResourcesBlock(tools, subAgents);

  const block = [
    SENTINEL_START,
    "<available_resources>",
    inner,
    "</available_resources>",
    SENTINEL_END,
  ].join("\n");

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
