# Execution Plan: Subagent Declaration Abstraction

## 1. Executive Intent

This effort converts the current hardcoded sub-agent delegate implementation into a declaration-driven system that supports both builtin agents and user-defined YAML agents without regressing current delegate behavior.

Why it matters:
- the current implementation repeats the same registration pattern four times in `src/sub-agents/*.ts`
- agent metadata is split across registration code, prompt markdown files, config enums, and prompt-resource rendering
- users cannot add custom sub-agents without changing source code

Core delivery outcomes:
- introduce a single `SubAgentDeclaration` abstraction and generic registration path
- preserve the current public contracts for builtin delegate tools (`question`, `task`, optional `context`)
- move builtin system prompts into code so declarations are self-contained and bundled
- load YAML user declarations from `$PI_AGENT_DIR/sub-agents/` with safe skip-and-warn behavior
- make sub-agent metadata and enablement dynamic instead of hardcoded to the four current agents

Protected non-goals:
- no change to the nested runner mechanism in `src/sub-agents/runner.ts`
- no recursive delegation beyond the current depth guard
- no user-facing tool renames
- no `.ts` / `.js` format for user-defined agents

Delivery success means the repo can boot, register, advertise, and disable both builtin and YAML-defined sub-agents through one shared path while existing builtin delegate tests still pass for parameter shape, prompt composition, and recursion-prevention semantics.

## 2. Scope Framing

### MVP / near-term scope

1. Add declaration and registration primitives for sub-agents.
2. Refactor `explore`, `oracle`, `librarian`, and `general` to export declarations instead of bespoke registration functions.
3. Replace hardcoded sub-agent metadata and config enum assumptions with runtime-derived agent lists.
4. Add YAML loading for user sub-agents from the agent directory.
5. Add validation, duplicate-name handling, and tests for the new declaration flow.

### Explicitly deferred scope

- tool naming cleanup across `websearch_*`, `context7_*`, `grep_app_*`
- intentional user-overrides-builtin semantics
- hot reload of YAML declarations
- expanding `runNestedPi()` to consume `temperature`
- new operational commands in the initial implementation pass

### Boundary notes

- Builtins remain implemented in `.ts` and continue to own richer parameter schemas and dynamic prompt building.
- YAML agents are intentionally constrained to the default `{ prompt: string }` contract and static allow/deny lists.
- The effort is not just a refactor: it also changes startup flow, config handling, prompt rendering metadata, and test fixtures.

### Assumptions used to stabilize scope

- Nested Pi sessions can still be launched exclusively through `runNestedPi()` with `allowedTools` expressed as string names.
- It is acceptable for the first implementation to model the “full tool surface” with an explicit registry owned by this extension rather than runtime introspection of Pi internals.
- Existing prompts in `src/prompts/*.md` can be moved inline without needing a separate prompt asset pipeline.

## 3. Delivery-Relevant System Understanding

### Main components

- `src/handlers/index.ts` is the registration hub for tools and sub-agent delegates during `session_start`.
- `src/config/resource-metadata.ts` is the current single source of truth for tool groups, builtin sub-agent metadata, and prompt feature derivation.
- `src/config/enabled-set.ts` computes enabled extension resources and currently assumes a static list of sub-agent names.
- `src/sub-agents/*.ts` each register a `delegate_*` tool, load a markdown prompt, and invoke `runNestedPi()`.
- `src/handlers/before-agent-start.ts` renders `<available_resources>` from enabled tool/group/agent metadata.

### Integration points

- startup path: `handleSessionStart()` must load config, initialize enablement, register tools, then register delegates
- prompt augmentation path: `injectPromptAugmentation()` must advertise enabled agents from dynamic metadata
- config path: `parseBlackbytesConfig()` and `loadBlackbytesConfig()` must accept unknown sub-agent names and support user-defined agents without startup failure
- nested execution path: delegate registration must keep using `runNestedPi()` exactly as today for recursion guard, model override, and reasoning effort behavior

### Trust boundaries and failure boundaries

- YAML user declarations are untrusted input from disk and must be schema-validated with file-level error isolation
- config remains untrusted input; unknown disabled sub-agent names should not crash parsing
- duplicate names across builtins and user declarations are configuration/startup errors and should abort `session_start` initialization for that session before delegate registration completes; the extension process itself still survives because bootstrap wraps handler failures

### State ownership

- agent declarations should become the source of truth for delegate descriptions, prompt features, prompt text, and tool parameter schemas
- enabled sub-agent names remain session-scoped state in `enabled-set.ts`
- registered, enabled agent metadata for prompt rendering should be stored in a dynamic runtime registry instead of hardcoded `SUB_AGENTS`

### Operational constraints

- package size must remain under the project budget; adding `yaml` is acceptable but should stay the only new dependency
- project style constraints: ESM, `.js` relative imports, Biome formatting, node:test coverage
- verification order must follow repo guidance: `bun run lint`, `bun run build`, `bun run test`

### Key execution tension to resolve

The spec now says declaration allowlists/denylists may reference the full nested-session tool surface, but the current implementation only tracks extension-managed tools via `enabledSet.tools`. The implementation plan must therefore add a dedicated concept for “delegable tool names” rather than reusing `enabledSet.tools` unchanged everywhere.

Implementation resolution for this plan: introduce a conservative, explicit delegable-tool registry owned by this extension. It should contain all extension-managed tools plus an explicit curated list of Pi default tool names that nested sessions are allowed to reference. Static allowlists/denylists should be validated against this registry; unknown names should fail declaration validation for builtins and cause YAML files to be skipped with a warning for user agents.

## 4. Workstream Decomposition

### Workstream A — Declaration model and builtin refactor

Purpose:
- replace four bespoke delegate implementations with a shared declaration model

Must produce:
- `SubAgentDeclaration` type and `defineSubAgent()` helper
- builtin declaration exports for `explore`, `oracle`, `librarian`, `general`
- inline builtin system prompts and preserved builtin parameter schemas

Key considerations:
- preserve exact external parameter contracts tested today
- preserve `general` prompt composition with optional `context`
- preserve `oracle` default reasoning effort
- keep builtin agent descriptions aligned with current `<available_resources>` copy

Key risks:
- accidentally collapsing builtin parameter shapes into `{ prompt: string }`
- losing current prompt text fidelity during markdown-to-inline migration
- widening or narrowing allowlists unintentionally

Interfaces:
- consumed by generic registration
- consumed by runtime metadata derivation

### Workstream B — Registration and tool-surface resolution

Purpose:
- centralize delegate registration and tool resolution in one path

Must produce:
- `registerSubAgent()` generic registrar
- a runtime mechanism that resolves allowed tools for declarations
- explicit handling for static allowlist, static denylist, and `"all-except-delegates"`

Key considerations:
- `enabledSet.tools` should continue representing extension-managed tool enablement
- declaration resolution needs a second input representing the nested-session tool surface, including Pi defaults where supported
- `delegate_*` names must still be excluded from recursive delegation
- registration order must still ensure delegates are not registered when disabled

Key risks:
- mixing “enabled extension tools” and “all delegable tools” into one ambiguous set
- creating a plan that assumes runtime introspection of Pi default tools that the extension does not actually have
- changing `general` semantics without updating tests and prompt copy

Likely internal split:
- B1: create a delegable-tool registry / resolver abstraction
- B2: implement `registerSubAgent()` on top of declarations and the resolver
- B3: update startup wiring to use loop-based registration

### Workstream C — Dynamic metadata and config enablement

Purpose:
- remove static assumptions that only four sub-agents exist

Must produce:
- dynamic sub-agent metadata storage and accessors in `resource-metadata.ts`
- `enabled-set.ts` support for a runtime-provided agent name list
- schema update from enum-backed `disabled_sub_agents` to `z.array(z.string())`

Key considerations:
- prompt feature derivation must still work before/after initialization
- tests currently assert `ALL_SUB_AGENT_NAMES === SUB_AGENTS.map(...)`; those expectations need to shift to runtime accessors
- the prompt overlay must advertise only enabled agents, including YAML-defined ones

Key risks:
- breaking prompt augmentation in pre-init fallback mode
- creating global mutable state that leaks between tests unless reset paths are explicit

Interfaces:
- startup flow
- prompt augmentation
- enabled-set tests and integration session-start tests

### Workstream D — YAML declaration loading and startup composition

Purpose:
- add user extensibility without compromising startup robustness

Must produce:
- loader for `$PI_AGENT_DIR/sub-agents/*.yaml` with home-directory fallback behavior inherited from the current config loader model
- schema for user declarations
- duplicate-name assertion across builtin and user agents
- startup composition that loads user declarations before computing the enabled set and runtime metadata

Key considerations:
- per-file parse failures must warn and continue
- duplicate names should abort `session_start` initialization for that session via the wrapped handler path; they should not degrade silently to builtin-only registration
- YAML declarations should remain intentionally limited to static features only

Key risks:
- resolving the wrong directory convention relative to `PI_AGENT_DIR`
- silently accepting malformed declarations with partial defaults
- ordering bugs where enabled-set is computed before all names are known

### Workstream E — Test migration and validation coverage

Purpose:
- preserve current behavior where required and add new coverage where behavior changes

Must produce:
- updated unit tests for declaration-driven delegates
- new tests for YAML loading, invalid-file skip behavior, and duplicate-name rejection
- updated metadata / prompt-rendering tests for dynamic agent metadata
- updated session-start integration coverage for user-defined agents

Key considerations:
- builtin delegate tests must continue asserting `question`, `task`, and `context` contracts
- tests for `general` should be split into current extension-tool expectations and any new broader delegable-tool registry expectations
- singleton state reset becomes more important once runtime agent metadata becomes mutable

Key risks:
- overfitting tests to implementation details of the declaration helper
- not covering the dynamic startup sequence end-to-end

## 5. Dependency and Sequencing Model

### Hard dependency chain

1. Define declaration and tool-resolution abstractions.
2. Refactor builtin agents onto declarations.
3. Make startup and metadata dynamic.
4. Add YAML loading and duplicate validation.
5. Expand tests and integration coverage.

### Why this order reduces risk

- The builtin refactor is the safest first slice because it can preserve existing behavior while introducing the new core abstraction.
- Dynamic metadata and enabled-set changes should land before YAML loading, otherwise user-defined agents cannot participate cleanly in prompt rendering or enable/disable logic.
- YAML loading should come after the declaration model is stable, because it depends on the final declaration shape and runtime registration path.
- Validation tests should be added alongside each slice, but broader integration coverage should follow once startup composition is complete.

### Soft sequencing preferences

- Inline prompt migration should occur while refactoring each builtin agent, not as a separate cleanup pass.
- Package export adjustments should land with the declaration public type rather than after YAML loading.
- any future `/subagents` command should be planned separately after the core declaration system lands; it is not part of the initial implementation pass

### Parallelizable areas

- After the declaration primitives are designed, builtin declaration refactors can be done mostly independently per agent.
- Test updates for prompt rendering and config parsing can proceed in parallel with YAML loader work once the runtime metadata API is settled.

### Areas that should not proceed in parallel

- enabled-set API redesign and startup wiring should not be split across parallel changes because they share session initialization state
- delegable-tool-surface design should be resolved before changing `general`, otherwise tests and docs will drift

## 6. Key Design and Delivery Decisions

### Decision 1 — Keep two distinct concepts: extension enablement vs delegable tool surface

Reasoning:
- `enabledSet.tools` already has a clear meaning in the codebase: extension-managed tools filtered by user config
- the spec now requires sub-agent allowlists/denylists to reference a broader nested-session tool surface

Practical consequence:
- do not overload `enabledSet.tools`
- introduce a separate resolver or registry for the tool names a nested session may receive
- `general` should derive its `all-except-delegates` set from that broader registry, while extension feature flags continue to use `enabledSet.tools`
- use a conservative explicit registry for Pi default tool names instead of runtime introspection
- validate static allowlists/denylists against the registry rather than passing unknown names through unchecked

### Decision 2 — Preserve builtin public contracts exactly

Reasoning:
- `src/sub-agents/__tests__/delegates.test.ts` already codifies user-facing delegate inputs and prompt composition behavior

Practical consequence:
- builtin declarations must explicitly define `parameters` and `buildUserPrompt`
- the generic registrar must never assume all declarations use `{ prompt: string }`

### Decision 3 — Treat duplicate names as session initialization errors; treat invalid YAML files as recoverable

Reasoning:
- name collisions create ambiguous tool identity and metadata ownership
- malformed individual user files should not disable the whole extension
- `bootstrap.ts` wraps `session_start`, so the practical failure boundary is the current session initialization path, not the extension process itself

Practical consequence:
- loader returns valid user declarations and logs per-file warnings
- a separate uniqueness assertion runs after builtin + user declarations are combined and aborts `session_start` initialization for that session if duplicates are found

### Decision 4 — Move builtin prompts inline with declarations

Reasoning:
- prompt text is part of the declaration contract and should travel with the agent definition
- it removes runtime file reads and simplifies registration

Practical consequence:
- delete `src/prompts/explore.md`, `oracle.md`, `librarian.md`, `general.md`
- ensure any test snapshots or string expectations are updated if needed

### Decision 5 — Make runtime sub-agent metadata explicitly resettable in tests

Reasoning:
- the current static metadata constants do not require cleanup, but a mutable registry will

Practical consequence:
- add a test-only reset helper for registered-agent metadata similar to `_resetEnabledSet()`
- use it consistently in prompt-rendering and session-start tests

### Decision 6 — Keep `temperature` documented but unimplemented in the runner

Reasoning:
- config already accepts it and the spec intentionally calls out that `runNestedPi()` does not consume it

Practical consequence:
- do not expand scope by changing `runNestedPi()` in this effort
- ensure plan/tasks mention this explicitly to avoid accidental partial implementation

## 7. Risks, Ambiguities, and Assumptions

### Risks

1. **Tool-surface mismatch risk** — the largest implementation risk is reconciling spec language about “all tools” with a codebase that only enumerates extension-managed tools today.
2. **Global state risk** — moving to runtime metadata introduces another singleton-like surface that can leak across tests if not reset.
3. **Prompt migration risk** — moving prompts inline can cause subtle copy drift that changes delegate behavior.
4. **Startup sequencing risk** — if declarations are loaded after `initEnabledSet()`, user-defined agents will not participate in enablement or prompt advertisement correctly.

### Ambiguities to resolve during implementation

1. Where should the declaration public export live: `src/sub-agents/types.ts`, `src/index.ts`, or another package entry surface?

The following execution decisions are considered resolved for this plan and should not be reopened during task conversion:

- use a conservative explicit delegable-tool registry rather than runtime introspection of Pi default tools
- validate static allowlists/denylists against the known registry
- duplicate-name collisions abort `session_start` initialization for that session rather than degrading to builtin-only registration

### Assumptions to proceed

- Unknown disabled sub-agent names in config are harmless and should simply have no effect.
- YAML loader tests can create temp directories under a temp `PI_AGENT_DIR`, following the same pattern as existing integration config tests.
- The nested Pi CLI accepts the tool names the extension passes through `--tools`; any curated list of Pi-default names must therefore be conservative and explicit.

## 8. Execution Slices / Phases

### Slice 1 — Core declaration refactor

Objective:
- stand up the declaration abstraction and migrate builtin agents without changing externally visible behavior

Included work:
- add `src/sub-agents/declaration.ts`
- add `src/sub-agents/register.ts`
- refactor builtin agent modules to export declarations with inline prompts
- adapt `src/sub-agents/types.ts` exports as needed

Dependencies:
- none beyond the current codebase

Validation intent:
- delegate unit tests still pass for builtin contracts, reasoning defaults, prompt composition, and no-recursion tool filtering

Newly possible after landing:
- a single registration path can register all builtin agents

### Slice 2 — Dynamic metadata and enablement plumbing

Objective:
- remove static assumptions that sub-agent names and metadata are compile-time constants

Included work:
- update `resource-metadata.ts` with runtime agent metadata accessors
- update `enabled-set.ts` to accept dynamic agent names
- update `schema.ts` to allow arbitrary disabled sub-agent names
- update `before-agent-start.ts` to read runtime metadata
- update `handlers/index.ts` startup flow to assemble declarations before init

Dependencies:
- Slice 1 declaration model

Validation intent:
- prompt augmentation tests and enabled-set tests pass with dynamic metadata
- session-start integration tests still initialize correctly

Newly possible after landing:
- runtime registration of non-builtin agents becomes feasible

### Slice 3 — YAML extensibility

Objective:
- support user-defined YAML agents safely

Included work:
- add `yaml` dependency
- add `src/sub-agents/loader.ts` and user declaration schema
- add uniqueness assertion helper
- wire loader into startup using `$PI_AGENT_DIR/sub-agents`

Dependencies:
- Slices 1 and 2

Validation intent:
- valid YAML agents load and register
- invalid YAML files log warnings and do not block startup
- duplicate names abort `session_start` initialization for that session

Newly possible after landing:
- users can define custom delegates without forking

### Slice 4 — Hardening and polish

Objective:
- close validation gaps and improve operability

Included work:
- add validation-focused tests for loader behavior, duplicate detection, and delegable-tool registry validation
- review exported types and docs for package consumers

Dependencies:
- prior slices completed

Validation intent:
- targeted regression coverage exists for the new failure modes introduced by YAML and runtime metadata

Newly possible after landing:
- the feature is ready for bead/task conversion and multi-agent implementation

## 9. Validation and Acceptance Framing

### Functional validation

- builtin delegates register only when enabled
- builtin delegates preserve exact parameter contracts and prompt composition
- builtin delegates still call nested Pi with the intended allowlists / denylist semantics
- YAML-defined agents register with the default `{ prompt: string }` schema and their configured prompt/tool settings

### Integration validation

- `session_start` loads builtin + user declarations before enablement is finalized
- `before-agent-start` advertises enabled builtin and YAML agents in `<available_resources>`
- disabling a YAML agent through config removes it from registration and prompt advertisement

### Failure-mode validation

- invalid YAML syntax logs a warning and skips the file
- schema-invalid YAML logs a warning and skips the file
- duplicate names across builtin + user declarations abort `session_start` initialization deterministically for that session
- runtime metadata reset paths prevent cross-test contamination

### Regression expectations

- `bun run lint`
- `bun run build`
- `bun run test`

Specific test surfaces that should change or expand:
- `src/sub-agents/__tests__/delegates.test.ts`
- `src/config/__tests__/enabled-set.test.ts`
- `src/handlers/__tests__/before-agent-start.test.ts`
- `src/__tests__/integration/session-start.test.ts`
- new loader-focused tests under `src/sub-agents/__tests__/`

### Acceptance criteria

- no hardcoded enum of sub-agent names remains in config parsing
- no hardcoded builtin-only `SUB_AGENTS` constant remains as the prompt metadata source
- all four builtin delegates are declaration-driven
- user YAML declarations load from the documented directory with skip-and-warn invalid-file behavior
- duplicate names are rejected before registration and abort `session_start` initialization for that session
- builtin behavior remains non-breaking under existing tests

## 10. Task Graph Mapping

### Recommended top-level tasks

1. **Declaration foundation**
2. **Builtin delegate migration**
3. **Dynamic metadata + enabled-set refactor**
4. **YAML loader + startup composition**
5. **Validation and regression tests**
6. **Post-MVP polish (exports, docs touchups)**

### Suggested child task structure

- **Declaration foundation**
  - add declaration types/helper
  - add tool-surface resolver abstraction
  - add generic registrar
- **Builtin delegate migration**
  - migrate `explore`
  - migrate `oracle`
  - migrate `librarian`
  - migrate `general`
  - remove markdown prompt file reads
- **Dynamic metadata + enabled-set refactor**
  - add runtime sub-agent metadata registry
  - change enabled-set API to accept dynamic names
  - update prompt augmentation to use dynamic metadata
  - relax config schema for `disabled_sub_agents`
- **YAML loader + startup composition**
  - add YAML dependency and parsing schema
  - implement loader with warning isolation
  - implement uniqueness assertion
  - wire session startup ordering
- **Validation and regression tests**
  - preserve builtin delegate contract tests
  - add loader tests
  - add prompt metadata tests
  - add integration tests for user-defined agents

### Explicit dependencies to encode in later task conversion

- builtin delegate migration depends on declaration foundation
- dynamic metadata depends on declarations existing
- YAML loader depends on dynamic metadata + startup composition shape
- integration tests depend on the final startup sequence

### Rationale that must be duplicated into child tasks

- builtin parameter contracts are non-breaking requirements, not implementation preferences
- duplicate-name failure is intentional and should not be softened to warning-only behavior
- invalid YAML skip-and-warn behavior is intentional and must be tested
- `temperature` remains config-only and is not part of this implementation
- keep “extension enablement” separate from “delegable tool surface” when implementing allow/deny resolution
- use the conservative delegable-tool registry approach and validate static allow/deny lists against it

### Minimum context every child implementation task must carry forward

- current repo registers delegates individually in `src/handlers/index.ts`
- current config hardcodes builtin sub-agent names in `src/config/schema.ts`
- current metadata hardcodes `SUB_AGENTS` in `src/config/resource-metadata.ts`
- current prompt augmentation consumes static agent metadata in `src/handlers/before-agent-start.ts`
- current builtin delegate behavior is locked in by `src/sub-agents/__tests__/delegates.test.ts`
- YAML user agents live under `$PI_AGENT_DIR/sub-agents/`, defaulting to `~/.pi/agent/sub-agents/`
- invalid YAML files are skipped with warnings; duplicate names abort `session_start` initialization for that session

### Where tasks must be split further to avoid ambiguity

- tool-surface resolver design should be a dedicated child task, not buried inside generic registration
- startup composition and runtime metadata changes should not be merged into one giant implementation task
- loader validation and duplicate-handling tests should be separated from builtin delegate regression tests
