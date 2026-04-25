# Spec: Subagent Declaration Abstraction

**Status**: Draft  
**Author**: Bytes  
**Date**: 2026-04-20

> **Phase 1 implementation status (2026-04-25):** The internal refactor described in Phase 1 of this spec has landed. `SubAgentDeclaration`, `defineSubAgent()`, and the generic `registerSubAgent()` exist and are used by all four builtins. YAML loading (`loadYamlDeclarations()`) is live with skip-and-warn conflict handling. The hardcoded `disabled_sub_agents` enum has been replaced with `z.array(z.string())`. Key additions beyond the original spec: a canonical delegable-tool registry and `finalizeNestedTools` pipeline, an immutable per-agent config snapshot resolved at `session_start`, a general-agent safety overlay, idempotent session-state reset, YAML diagnostics surfaced in `/blackbytes-status`, and failure classification with secret redaction. Phase 2 and Phase 3 items remain open. `timeoutMs` per-agent config is not yet wired. Tool naming cleanup was handled separately (canonical names: `ast_search`, `ast_replace`, `web_search`, `web_fetch`, `docs_resolve`, `docs_query`, `gh_search`).

## Problem

The current subagent system has four hardcoded agents (`explore`, `oracle`, `librarian`, `general`), each implemented as a separate file repeating the same pattern: check enabled set → register tool → load `.md` prompt → call `runNestedPi()`. This creates several issues:

1. **No extensibility** — Users cannot define custom subagents without forking the extension.
2. **Scattered metadata** — Agent name/description lives in `resource-metadata.ts`, allowlists and tool descriptions live in each agent file, system prompts live in `src/prompts/*.md`.
3. **Duplication** — Every agent file repeats identical boilerplate (~80% shared logic).
4. **Hardcoded enum** — `disabled_sub_agents` uses `z.enum(["explore","oracle","librarian","general"])`, blocking any new agents.

## Goals

1. Define a `SubAgentDeclaration` type that captures everything needed to register and run a subagent.
2. Consolidate the 4 builtin agents into declaration objects using this type.
3. Allow users to define custom subagents via YAML files in `$PI_AGENT_DIR/sub-agents/` (defaulting to `~/.pi/agent/sub-agents/`).
4. Derive `<available_resources>` agent descriptions from declaration metadata (single source of truth).
5. Preserve all existing behavior — builtin parameter schemas, allowlists, model overrides, reasoning effort, recursion guard, and general's dynamic allowlist semantics.

## Non-Goals

- Changing the runner mechanism (`runNestedPi` stays as-is).
- Supporting `.ts`/`.js` user declarations (YAML is the user-facing format; `.ts` is for builtins only).
- Multi-level nesting (recursion guard stays at depth 1).
- Hot-reloading declarations at runtime.
- Renaming extension tools or changing the public tool surface. That can be handled in a separate spec.

---

## Design

### 1. `SubAgentDeclaration` Type & Factory

```typescript
// src/sub-agents/declaration.ts

export interface SubAgentDeclaration {
  /** Unique identifier. Becomes the tool name `delegate_{name}`. */
  name: string;

  /** One-line description shown in `<available_resources>` block. */
  description: string;

  /**
   * Tool description shown to the LLM when deciding whether to invoke this agent.
   * More detailed than `description` — includes usage guidance, when to use/not use.
   */
  toolDescription: string;

  /**
   * Tool parameters schema (TypeBox).
   * Builtin agents must declare this explicitly when preserving an existing tool contract such as
   * `{ question: string }` or `{ task: string, context?: string }`.
   * YAML-defined agents always use the default `{ prompt: string }` schema.
   */
  parameters?: TObject;

  /**
   * Which tools the nested Pi session can access. Mutually exclusive with `denylist`.
   * This abstraction governs the full tool surface exposed to the nested session, including
   * both extension-managed tools and Pi's built-in default tools (`read`, `bash`, `write`, etc.).
   * - `string[]` — static allowlist of tool names.
   * - `"all-except-delegates"` — all enabled tools minus `delegate_*` (used by `general`).
   * - `(enabledTools: ReadonlySet<string>) => string[]` — dynamic computation over enabled tools.
   */
  allowlist?: string[] | "all-except-delegates" | ((enabledTools: ReadonlySet<string>) => string[]);

  /**
   * Tools the nested Pi session must NOT access. Mutually exclusive with `allowlist`.
   * Resolved at runtime: `finalTools = enabledTools - denylist - delegate_*`.
   * Only supports static lists (no functions). YAML declarations support this field.
   */
  denylist?: string[];

  /**
   * System prompt for the nested Pi session.
   * Inline string. For builtin agents, this replaces the `.md` file loading.
   */
  systemPrompt: string;

  /**
   * Prompt feature flags this agent contributes when enabled.
   * Controls which sections appear in the Bytes overlay.
   * Default: `["subagentDelegation"]`.
   */
  promptFeatures?: string[];

  /**
   * Default model override for this agent (can be overridden by user config).
   * If omitted, inherits the session's model.
   */
  defaultModel?: string;

  /**
   * Default reasoning effort (can be overridden by user config).
   */
  defaultReasoningEffort?: string;

  /**
   * Timeout in milliseconds. Default: 300_000 (5 min).
   */
  timeoutMs?: number;

  /**
   * Transform the user's tool call params into the prompt string sent to the nested Pi.
   * Default: `(params) => params.prompt`
   * Allows agents with richer parameter schemas to compose the prompt.
   */
  buildUserPrompt?: (params: Record<string, unknown>) => string;
}

/**
 * Factory function for creating subagent declarations with type inference and defaults.
 */
export function defineSubAgent(decl: SubAgentDeclaration): SubAgentDeclaration {
  // Validate mutual exclusivity
  if (decl.allowlist && decl.denylist) {
    throw new Error(`SubAgent "${decl.name}": allowlist and denylist are mutually exclusive`);
  }
  if (!decl.allowlist && !decl.denylist) {
    throw new Error(`SubAgent "${decl.name}": must specify either allowlist or denylist`);
  }
  return {
    promptFeatures: ["subagentDelegation"],
    timeoutMs: 300_000,
    ...decl,
  };
}
```

### 2. Builtin Declarations

Each builtin agent exports its own declaration from its existing file (refactored, not deleted).
Each declaration carries forward the agent's current public parameter schema so the refactor remains non-breaking:

```typescript
// src/sub-agents/explore.ts
import { Type } from "@sinclair/typebox";
import { defineSubAgent } from "./declaration.js";

export default defineSubAgent({
  name: "explore",
  description: "Contextual grep for codebases. Answers 'Where is X?', 'Which file has Y?'",
  toolDescription: "Launch an explore agent to search the codebase...",
  parameters: Type.Object({
    question: Type.String({ description: "The exploration question or search task to delegate" }),
  }),
  allowlist: ["read", "grep", "glob", "ast_grep_search"],
  buildUserPrompt: (params) => params.question as string,
  systemPrompt: `You are an expert codebase explorer...`,
});
```

```typescript
// src/sub-agents/oracle.ts
import { Type } from "@sinclair/typebox";
import { defineSubAgent } from "./declaration.js";

export default defineSubAgent({
  name: "oracle",
  description: "Read-only consultation agent for debugging and architecture",
  toolDescription: "Launch a high-reasoning oracle agent...",
  parameters: Type.Object({
    question: Type.String({ description: "The question or problem to reason about" }),
    context: Type.Optional(Type.String({ description: "Additional context" })),
  }),
  allowlist: ["read", "grep", "glob", "ast_grep_search"],
  buildUserPrompt: (params) =>
    params.context
      ? `${params.question as string}\n\n---\n\nAdditional context:\n${params.context as string}`
      : (params.question as string),
  systemPrompt: `You are a senior architect...`,
  defaultReasoningEffort: "high",
});
```

```typescript
// src/sub-agents/general.ts
import { Type } from "@sinclair/typebox";
import { defineSubAgent } from "./declaration.js";

export default defineSubAgent({
  name: "general",
  description: "Implementation executor for heavy multi-file work",
  toolDescription: "Launch a general-purpose coding agent...",
  parameters: Type.Object({
    task: Type.String({ description: "The implementation task to delegate" }),
    context: Type.Optional(Type.String({ description: "Additional context" })),
  }),
  allowlist: "all-except-delegates",
  buildUserPrompt: (params) =>
    params.context
      ? `${params.task as string}\n\n---\n\nAdditional context:\n${params.context as string}`
      : (params.task as string),
  systemPrompt: `You are an implementation executor...`,
});
```

`librarian` follows the same pattern as `explore`: explicit `{ question: string }` parameters plus its current research tool allowlist.

### 3. Generic Registration

Replace the four `registerDelegate*Tool()` functions with one generic function:

```typescript
// src/sub-agents/register.ts

export function registerSubAgent(
  pi: ExtensionAPI,
  decl: SubAgentDeclaration,
  config: BlackbytesConfig,
  enabledSet: EnabledSet,
  spawnFn?: SpawnFn,
): void {
  if (!enabledSet.subAgents.has(decl.name)) return;

  const defaultParams = Type.Object({
    prompt: Type.String({ description: "The task or question for the agent" }),
  });

  pi.registerTool({
    name: `delegate_${decl.name}`,
    description: decl.toolDescription,
    parameters: decl.parameters ?? defaultParams,
    execute: async (params: Record<string, unknown>) => {
      const agentConfig = config.sub_agents?.[decl.name];
      const model = agentConfig?.model ?? decl.defaultModel;
      const reasoning = agentConfig?.reasoningEffort ?? decl.defaultReasoningEffort;

      // Resolve enabled tool list
      let tools: string[];
      if (decl.denylist) {
        const deny = new Set(decl.denylist);
        tools = [...enabledSet.tools].filter(
          (t) => !deny.has(t) && !t.startsWith("delegate_"),
        );
      } else if (decl.allowlist === "all-except-delegates") {
        tools = [...enabledSet.tools].filter((t) => !t.startsWith("delegate_"));
      } else if (typeof decl.allowlist === "function") {
        tools = decl.allowlist(enabledSet.tools);
      } else {
        tools = decl.allowlist ?? [];
      }

      const userPrompt = decl.buildUserPrompt
        ? decl.buildUserPrompt(params)
        : (params.prompt as string);

      return runNestedPi(
        {
          systemPrompt: decl.systemPrompt,
          userPrompt,
          model,
          reasoningEffort: reasoning,
          allowedTools: tools,
          timeoutMs: decl.timeoutMs,
        },
        spawnFn,
      );
    },
  });
}
```

### 4. User-Defined Subagents

Users define custom agents as YAML files in `$PI_AGENT_DIR/sub-agents/*.yaml` (or `~/.pi/agent/sub-agents/*.yaml` when `PI_AGENT_DIR` is unset):

```yaml
# ~/.pi/agent/sub-agents/reviewer.yaml
name: reviewer
description: Code review specialist
toolDescription: >
  Launch a code reviewer agent that analyzes diffs and suggests improvements.
  Use when the user asks for a code review or wants feedback on their changes.
allowlist:
  - read
  - grep
  - glob
  - ast_grep_search
systemPrompt: |
  You are a senior code reviewer. Analyze the code carefully.
  Focus on correctness, readability, and maintainability.
  Provide specific, actionable feedback with file:line references.
```

**YAML schema mapping:**

| YAML field | Maps to `SubAgentDeclaration` field | Notes |
|---|---|---|
| `name` | `name` | Required. Must be unique across builtins + user declarations. Duplicate names fail startup unless an explicit override mechanism is added later. |
| `description` | `description` | Required. One-line for `<available_resources>`. |
| `toolDescription` | `toolDescription` | Required. Detailed guidance for LLM. |
| `allowlist` | `allowlist` | Static list only. Mutually exclusive with `denylist`. Can reference any tool exposed to the nested session. |
| `denylist` | `denylist` | Static list only. Mutually exclusive with `allowlist`. Can reference any tool exposed to the nested session. |
| `systemPrompt` | `systemPrompt` | Required. Inline multi-line string. |
| `promptFeatures` | `promptFeatures` | Optional. Default: `["subagentDelegation"]`. |
| `defaultModel` | `defaultModel` | Optional. |
| `defaultReasoningEffort` | `defaultReasoningEffort` | Optional. |
| `timeoutMs` | `timeoutMs` | Optional. Default: 300000. |

**Limitations vs builtin `.ts` declarations:**
- No `parameters` override (YAML agents always get the default `{ prompt: string }` schema).
- No `buildUserPrompt` function (YAML can't express functions).
- No `"all-except-delegates"` or function allowlists (static lists only).
- These limitations are acceptable: advanced agents requiring custom parameters or dynamic allowlists should be contributed as builtins.

**Loading mechanism:**

```typescript
// src/sub-agents/loader.ts
import { parse as parseYaml } from "yaml";

export async function loadUserSubAgents(
  agentDir: string,
  logger: Logger,
): Promise<SubAgentDeclaration[]> {
  const dir = path.join(agentDir, "sub-agents");
  if (!existsSync(dir)) return [];

  const files = await glob("*.{yaml,yml}", { cwd: dir, absolute: true });
  const declarations: SubAgentDeclaration[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(file, "utf-8");
      const parsed = parseYaml(raw);
      const decl = UserSubAgentDeclarationSchema.parse(parsed);
      declarations.push(decl);
    } catch (error) {
      logger.warn({ file, error }, "Skipping invalid user sub-agent declaration");
    }
  }

  return declarations;
}
```

**New dependency**: `yaml` package (~30KB) for YAML parsing. Fits within 500KB budget.

**Failure policy**: invalid YAML or schema-invalid declarations are skipped with a warning; one bad file must not prevent the extension from starting.

### 5. Config Schema Changes

```typescript
// Updated schema — remove hardcoded enum, accept any string
const BlackbytesConfigSchema = z.object({
  // ...existing fields...
  disabled_sub_agents: z.array(z.string()).default([]),
  sub_agents: z.record(z.string(), z.object({
    model: z.string().optional(),
    reasoningEffort: z.string().optional(),
    temperature: z.number().optional(), // retained for forward compatibility; not consumed by runNestedPi yet
  })).optional(),
}).passthrough();
```

### 6. Resource Metadata Changes

The `SUB_AGENTS` array in `resource-metadata.ts` becomes derived from the loaded declarations:

```typescript
// Before: hardcoded SUB_AGENTS array
// After: derived at init time

let registeredAgents: readonly SubAgentDeclaration[] = [];

export function setRegisteredAgents(agents: readonly SubAgentDeclaration[]): void {
  registeredAgents = agents;
}

export function getSubAgentMetas(): readonly SubAgentMeta[] {
  return registeredAgents.map((a) => ({
    name: a.name,
    description: a.description,
    promptFeatures: a.promptFeatures ?? ["subagentDelegation"],
  }));
}
```

### 7. Prompt System Changes

**System prompts** move from `.md` files to inline strings within each agent's declaration `.ts` file.
This eliminates runtime `readFile()` calls and ensures prompts are bundled. No separate `src/sub-agents/prompts/` directory needed.

**`<available_resources>` block** — `buildResourcesBlock()` in `before-agent-start.ts` already reads from `SUB_AGENTS` metadata. After this change, it reads from `getSubAgentMetas()` which includes both builtin and user-defined agents. No additional changes needed.

### 8. Enabled Set Changes

```typescript
// enabled-set.ts
export function computeEnabledSet(
  config: BlackbytesConfig,
  allAgentNames: readonly string[],  // now dynamic, not from a const
): EnabledSet {
  const disabledAgents = new Set(config.disabled_sub_agents);
  const enabledAgents = new Set(allAgentNames.filter((n) => !disabledAgents.has(n)));
  // ...rest unchanged
}
```

---

## Registration Flow (Updated)

```
handleSessionStart(pi, event):
  1. config = loadBlackbytesConfig()
  2. builtins = [explore, oracle, librarian, general]  // imported from each file
  3. userAgents = loadUserSubAgents(agentDir)    // NEW
  4. allAgents = assertUniqueNames([...builtins, ...userAgents]) // fail fast on duplicate names
  5. initEnabledSet(config, allAgents.map(a => a.name))
  6. setRegisteredAgents(allAgents.filter(a => enabledSet.subAgents.has(a.name)))
  7. Register local tools...
  8. Register HTTP tools...
  9. for (const agent of allAgents) {
       registerSubAgent(pi, agent, config, enabledSet)
     }
```

## Migration Path

### Phase 1: Internal refactor (non-breaking)
1. Create `SubAgentDeclaration` type and generic `registerSubAgent()`.
2. Refactor 4 builtin agent files to export `defineSubAgent()` declarations (prompt inline).
3. Replace `registerDelegate*Tool()` calls with loop over declarations.
4. Derive `SUB_AGENTS` metadata from declarations.
5. Change `disabled_sub_agents` from enum to `z.array(z.string())`.

**Verification**: All existing tests pass. `bun run lint && bun run build && bun run test`. Builtin delegate tests must continue asserting the current parameter contracts (`question`, `task`, `context`) so the refactor stays non-breaking.

### Phase 2: User extensibility
1. Add `yaml` dependency and `loadUserSubAgents()` YAML loader.
2. Load declarations from `$PI_AGENT_DIR/sub-agents/` with skip-and-warn error handling for invalid files.
3. Reject duplicate names across builtins and user declarations.
4. Document the declaration format and directory convention.
5. Export `SubAgentDeclaration` type from package for user consumption.

### Phase 3: Polish
1. Add validation tests for YAML declarations and duplicate-name handling.
2. Add `/subagents` command to list all registered agents.

## Files Changed

| File | Change |
|------|--------|
| `src/sub-agents/declaration.ts` | **New** — `SubAgentDeclaration` type + `defineSubAgent()` factory |
| `src/sub-agents/register.ts` | **New** — generic `registerSubAgent()` |
| `src/sub-agents/loader.ts` | **New** — YAML-based user declaration loader |
| `src/sub-agents/explore.ts` | **Refactor** — from register function to `defineSubAgent()` export |
| `src/sub-agents/oracle.ts` | **Refactor** — from register function to `defineSubAgent()` export |
| `src/sub-agents/librarian.ts` | **Refactor** — from register function to `defineSubAgent()` export |
| `src/sub-agents/general.ts` | **Refactor** — from register function to `defineSubAgent()` export |
| `src/sub-agents/types.ts` | **Update** — re-export `SubAgentDeclaration` |
| `src/sub-agents/runner.ts` | **No change** |
| `src/config/resource-metadata.ts` | **Update** — derive `SUB_AGENTS` from declarations |
| `src/config/schema.ts` | **Update** — `disabled_sub_agents` to `z.array(z.string())` |
| `src/config/enabled-set.ts` | **Update** — accept dynamic agent name list |
| `src/handlers/index.ts` | **Update** — loop-based registration |
| `src/handlers/before-agent-start.ts` | **Minor** — use `getSubAgentMetas()` |
| `src/prompts/explore.md` | **Delete** — moved inline to `explore.ts` |
| `src/prompts/oracle.md` | **Delete** — moved inline to `oracle.ts` |
| `src/prompts/librarian.md` | **Delete** — moved inline to `librarian.ts` |
| `src/prompts/general.md` | **Delete** — moved inline to `general.ts` |
| `package.json` | **Update** — add `yaml` dependency |

## Resolved Decisions

1. **Name conflict**: duplicate names are rejected at startup. Silent shadowing is too hard to debug; an explicit override mechanism can be added later if needed.
2. **File format**: Builtin agents use `.ts` (inline, bundled). User agents use YAML (parsed at runtime with `yaml` package).
3. **Validation**: Zod runtime schema + TypeScript types for authoring DX.
4. **User agent directory**: `$PI_AGENT_DIR/sub-agents/*.yaml`, defaulting to `~/.pi/agent/sub-agents/*.yaml`.
5. **Public API**: `SubAgentDeclaration` type exported from package entry point for reference/documentation.
6. **Tool scope**: declaration allowlists/denylists may reference any tool exposed to the nested session, including Pi default tools and extension-managed tools.
---

## Follow-up Work (Out of Scope)

The following items came up during design but are intentionally excluded from this spec to keep the change focused:

1. **Tool naming cleanup** — renaming extension tools (`websearch_*`, `context7_*`, etc.) should be handled in a separate spec because it is a user-visible surface change.
2. **Capability documentation/examples** — richer guidance on recommended allowlist/denylist patterns for user-defined agents can be documented independently of the core declaration mechanism.
3. **Explicit override semantics** — if we later want user declarations to intentionally replace builtins, add a dedicated opt-in mechanism rather than silent name shadowing.

---

> **Phase 2 implementation status (2026-04-25):** Phase 2 is complete. The five beads (pib-vyj.2.1–2.5) resolved as follows:
>
> - **pib-vyj.2.1 (timeoutMs)** — Landed. JSON `timeoutMs` and YAML `timeout_ms` accepted per-agent. Validated 1..3_600_000 ms. Passed as a runner option. Builtin defaults: explore=120000, librarian=240000, oracle=300000, general=600000. Surfaced in `/blackbytes-status`.
>
> - **pib-vyj.2.2 (promptMode schema)** — Landed. `promptMode?: "static" | "append"` on `SubAgentDeclaration`; YAML `prompt_mode`. Default static. `buildSystemPrompt()` throws fail-loud on `"append"` ("not yet supported"). All four builtins use implicit static.
>
> - **pib-vyj.2.3 (append for builtins)** — **Deferred.** No builtin opted into `promptMode: "append"`. Pi exposes no safe `parentContext` API from within a registered tool's execute closure. Re-evaluation criteria: Pi surfaces a documented `parentContext` / `inheritedInstructions` field, bounded in size, scoped to the parent's static system prompt only.
>
> - **pib-vyj.2.4 (conservative model fallback)** — Landed. JSON `fallbackModels: string[]` (max 5, unique, non-empty); YAML `fallback_models`. Eligible only for read-only agents (mutability not full-access, no `MUTATING_EXEC_TOOLS` in resolved allowlist). `general` is ineligible. Retries only `provider_or_model_unavailable`; never timed_out / cancelled / spawn_error / failed. Single shared timeout budget (1 s floor per attempt). Attempted-models chain appended to user-visible message. Fallback chain shown in `/blackbytes-status` with `→` separators; `(ineligible)` suffix when configured but ineligible.
>
> - **pib-vyj.2.5 (streaming/progress)** — **Deferred.** Live streaming of nested sub-agent stdout into the parent TUI is intentionally not wired. Reasons: raw stdout is too verbose, no chunk-level secret redaction, violates the "do not dump nested stdout into parent context" design constraint. Becomes supportable when Pi exposes a structured progress surface with chunk-level redaction.
>
> **Deferred to Phase 3:** parallel fanout, background task lifecycle, worktree isolation, persistent agent memory, streaming progress, append prompt mode.
