# Execution Plan: Subagent Hardening and Quality Improvements

## 1. Executive Intent

This effort hardens the current declaration-driven sub-agent system and then improves delegation quality without jumping directly into large orchestration features such as background agents, parallel fanout, or worktree isolation.

Why it matters:

- `pi-blackbytes` now has a clean sub-agent abstraction, but some runtime behavior is inconsistent with the prompts/config surface.
- The `general` agent appears to advertise Pi built-in tools (`read`, `write`, `edit`, `bash`) that may not actually be included in the `--tools` allowlist.
- `temperature` exists in config but is not consumed by `ModelOverrides` or `runNestedPi()`.
- Delegate failures currently drop useful `details`, making nested-process issues hard to diagnose.
- YAML sub-agent loading is robust but not visible enough to users when files are skipped.
- Subagents are still mostly static and blocking; phase 2 should improve prompt quality, model reliability, timeout control, and progress surfacing before heavier orchestration.

Core outcomes:

1. Make sub-agent tool allowlists, config, prompts, and runtime behavior consistent.
2. Improve user-facing diagnostics for YAML agents and nested-run failures.
3. Add low-risk quality mechanisms: prompt inheritance, model fallback, per-agent timeout, and optional streaming/progress plumbing.
4. Preserve the current security posture: no recursive delegation, conservative env forwarding, no implicit secret leakage, no new dependency unless clearly justified.

Protected non-goals:

- No background task manager in phases 1–2.
- No `delegate_parallel` tool in phases 1–2.
- No automatic git worktree isolation in phases 1–2.
- No cross-extension RPC or persistent agent memory.
- No breaking rename of existing public delegate tools (`delegate_explore`, `delegate_oracle`, `delegate_librarian`, `delegate_general`).
- No broad architectural replacement of subprocess execution with in-process `createAgentSession()` yet.

Delivery success means users can trust that advertised sub-agent capabilities work, failures are diagnosable, YAML agents are inspectable, and subagents receive richer context and more reliable model execution while preserving the current minimal, testable architecture.

## 2. Scope Framing

### Phase 1 — Hardening and correctness

In scope:

1. Correct `general` and YAML default tool resolution so final `--tools` includes the intended Pi built-ins where supported.
2. Decide and implement the `temperature` config behavior end-to-end, or explicitly mark/remove it if unsupported by Pi CLI.
3. Validate builtin declaration tool allowlists during startup/test paths.
4. Improve delegate failure output to include safe, truncated `details`.
5. Add sub-agent diagnostics to `/blackbytes-status` or the existing status reporting path.
6. Track YAML load diagnostics in session state so skipped files are user-visible.
7. Reset session-scoped runtime state at startup so repeated `session_start` runs do not duplicate metadata or leak diagnostics.
8. Add regression tests for all above.

Out of scope for phase 1:

- New delegation modes.
- Model fallback arrays.
- Prompt inheritance.
- Streaming/progress callbacks beyond preserving existing runner behavior.

### Phase 2 — Delegation quality and reliability

In scope:

1. Add `promptMode: "static" | "append"` to declarations and YAML schema.
2. Add prompt builder that can wrap parent/system context safely for append mode.
3. Add model fallback chains with conservative retry rules.
4. Add per-agent timeout configuration.
5. Wire `onUpdate` to whatever safe progress/event/log surface Pi exposes; if no host surface exists, expose it through structured logging only.
6. Add tests and documentation for each new behavior.

Out of scope for phase 2:

- True async/background sub-agent lifecycle.
- Parallel fanout.
- Worktree isolation.
- Mid-run steering.
- Persistent memory.

### Assumptions

- Pi CLI supports `--tools`, `--model`, and `--thinking` as currently used in `src/sub-agents/runner.ts`.
- Pi built-in tool names for nested CLI allowlisting are `read`, `write`, `edit`, and `bash`; this must be confirmed with local behavior/tests before widening defaults.
- If Pi CLI does not support `--temperature`, config `temperature` should be documented as unsupported/reserved or removed from the active schema surface.
- The subprocess runner remains the default execution mechanism through phase 2.

## 3. Delivery-Relevant System Understanding

### Main components

- `src/handlers/index.ts` owns session startup, config loading, YAML declaration loading, enabled-set initialization, tool registration, sub-agent metadata registration, and delegate registration.
- `src/sub-agents/declaration.ts` defines `SubAgentDeclaration`, `ModelOverrides`, `AllowedToolsResolver`, and `defineSubAgent()`.
- `src/sub-agents/register.ts` turns a declaration into a `delegate_*` tool and invokes `runNestedPi()`.
- `src/sub-agents/runner.ts` spawns nested `pi -p` subprocesses, builds CLI args, enforces `PI_NESTED_DEPTH`, forwards safe env vars, handles timeout/cancel/failure, and supports `onUpdate` internally.
- `src/sub-agents/delegable-tools.ts` owns valid nested-session tool names and resolution strategies.
- `src/sub-agents/loader.ts` loads YAML user agents, validates schema/tool names, and converts them to declarations.
- `src/config/schema.ts` parses `blackbytes` config including `sub_agents.<name>.model`, `reasoningEffort`, and currently `temperature`.
- `src/config/resource-metadata.ts` tracks tool metadata, sub-agent metadata, runtime sub-agent registry, and prompt feature flags.
- `src/commands/setup-models.ts` writes model-related settings and may need updates if config shape changes.
- `/blackbytes-status` implementation should be updated for diagnostics; locate command file before implementation if not already obvious from `src/commands/`.

### Current data flow

1. `handleSessionStart()` loads config.
2. YAML declarations are loaded and combined with builtins.
3. Names are checked for duplicates.
4. `initEnabledSet(config, allNames)` computes enabled tools and enabled subagents.
5. Tools and delegate tools are registered.
6. At delegate execution time, `registerSubAgent()` resolves prompt, user prompt, allowed tools, and model overrides.
7. `runNestedPi()` builds CLI args and executes `pi -p`.

### Trust and safety boundaries

- YAML declarations are user-controlled config and must remain schema-validated.
- Tool names in YAML must never allow `delegate_*`.
- Nested subprocess env forwarding must remain whitelist-based.
- Failure details may contain sensitive command output, so any surfaced stderr/details must be length-bounded and should not include full env dumps.
- Prompt inheritance must not blindly include secrets or raw hidden tool outputs; it should inherit stable system/task context, not arbitrary runtime transcripts.

### Key current inconsistencies

1. `general` prompt advertises built-in tools, but `resolveToolStrategy({ kind: "all-except-delegates" }, getEnabledSet().tools)` only returns enabled extension tools.
2. `PI_DEFAULT_TOOLS` currently contains only `read`, and `all-except-delegates` does not union it anyway.
3. `temperature` is accepted by config but not passed through `ModelOverrides` or runner CLI args.
4. `DelegateResult.details` exists but is not included in the registered tool result.
5. YAML warnings are logger-only, so users may not know why a custom agent is missing.
6. `runNestedPi()` has `onUpdate`, but no caller wires it.

## 4. Workstream Decomposition

### Workstream A — Tool-surface correctness

Purpose:

- Ensure sub-agent `allowedTools` matches prompt claims and actual nested CLI behavior.

Must produce:

- A clear model for Pi built-in nested tools, extension-managed tools, safe read/search/docs tools, and mutating/exec tools.
- Updated `PI_DEFAULT_TOOLS` or renamed equivalent such as `PI_BUILTIN_DELEGABLE_TOOLS`.
- Explicit resolver behavior for: broad `general` access, conservative YAML default/denylist access, explicit allowlists, and delegate exclusion.
- Builtin validation tests proving no `delegate_*` tools are allowed.
- Regression test proving `general.allowedTools()` includes intended built-ins plus enabled extension tools.

Key implementation considerations:

- Avoid overclaiming unknown Pi tools. Confirm tool names empirically or from Pi docs/source before adding.
- Keep `explore`, `oracle`, and `librarian` read-only by static allowlist.
- `general` should be the only builtin with broad write/exec access.
- Before broadening `general`, add a minimal static safety/context overlay. Documentation alone is not sufficient because `general` receives mutating/exec tools while nested Pi is launched with `--no-context-files` and may not inherit repo/session instructions.
- YAML default behavior must not reuse `general`'s broad strategy. YAML agents that omit `allowed_tools` should receive only safe read/search/documentation tools, not mutating/exec tools.

Likely files:

- `src/sub-agents/delegable-tools.ts`
- `src/sub-agents/general.ts`
- `src/sub-agents/__tests__/delegable-tools.test.ts`
- `src/sub-agents/__tests__/delegates.test.ts` or new focused test
- `src/sub-agents/__tests__/loader.test.ts`

Risks:

- Widening YAML default access may unintentionally grant `bash`, write tools, or mutating extension tools to custom agents. Phase 1 must prevent this by separating `general` broad-tool resolution from YAML default/denylist resolution.
- Pi CLI may reject unknown built-in tool names in `--tools`; tests need to cover generated args.

Recommended decision:

- Split tool concepts explicitly:
  - `EXTENSION_TOOL_NAMES`: tools registered by `pi-blackbytes`.
  - `PI_BUILTIN_TOOL_NAMES`: `read`, `write`, `edit`, `bash` after Slice 1.1 confirms support.
  - `DELEGABLE_TOOL_NAMES`: union of both, excluding delegate tools.
  - `READ_SEARCH_DOC_TOOL_NAMES`: safe default tools for YAML agents, including `read`, `glob`, `grep`, `ast_search`, and enabled web/docs/GitHub search tools.
  - `MUTATING_EXEC_TOOL_NAMES`: `write`, `edit`, `bash`, `hashline_edit`, and `ast_replace`.
  - Acceptance criterion: all concrete tool-name lists are sourced from `src/config/resource-metadata.ts` and `src/sub-agents/delegable-tools.ts`; implementation tasks must not introduce aliases such as `ast_grep_search` or `ast_grep_replace` unless a separate public rename migration is explicitly approved.
  - Add a prerequisite tool-name audit before changing allowlists: compare `src/config/resource-metadata.ts`, registration functions, prompt/resource documentation, YAML examples, and tests; public tool renames are out of scope unless separately approved.
- Do not use one broad `all-except-delegates` strategy for both `general` and default YAML agents.
- Add an explicit broad strategy for `general` that returns `enabled extension tools ∪ PI_BUILTIN_TOOL_NAMES`, excluding delegates.
- Treat `blackbytes.disabled_tools` as a global denylist over all nested delegable tool names, including extension-managed tools and confirmed Pi built-ins. No resolver may pass a disabled tool to `runNestedPi()`. If Pi built-ins cannot be disabled through `disabled_tools`, status must clearly say that disabling `bash`/`write`/`edit` requires disabling the write-capable sub-agent.
- Add one central nested-tool finalization step before `runNestedPi()` that deduplicates names, rejects unknown names, removes all `delegate_*` names, applies global disabled-tool filtering, enforces the agent policy, and returns a deterministic ordered list. No resolver branch may return user-supplied tool names directly to the runner.
- Builtin resolvers remove disabled optional tools and fail closed with a clear error when required static tools are disabled. YAML explicit `allowed_tools` that reference globally disabled tools are rejected/skipped with diagnostics; YAML default and YAML denylist modes silently exclude disabled tools because they are derived capability sets, not explicit capability requests.
- Keep YAML agents that omit `allowed_tools` conservative: they must not implicitly receive `write`, `edit`, `bash`, `hashline_edit`, or `ast_replace`.
- YAML `denied_tools` applies to the conservative YAML base, not to `general`'s broad base.
- YAML agents that need mutating/exec tools must declare them explicitly in `allowed_tools`; validation should accept them only after Slice 1.1 confirms the tool name is supported.
- Acceptance criteria: default YAML output excludes `write`, `edit`, `bash`, `hashline_edit`, and `ast_replace`; YAML denylist mode also excludes mutating/exec tools by default; explicit YAML allowlist includes confirmed mutating/exec tools when requested; `general` includes confirmed broad tools.

### Workstream B — Config/runtime consistency

Purpose:

- Ensure every exposed config knob has real runtime behavior or is explicitly removed/deferred.

Must produce:

- Decision on `temperature` support.
- If supported: update `ModelOverrides`, config resolver(s), YAML schema, runner args, tests, and setup wizard docs/output.
- If unsupported: remove active `temperature` from schema/setup wizard or mark it as ignored/reserved in docs/status.
- Normalize config naming where practical without breaking existing config (`reasoningEffort` currently camelCase in JSON config, YAML uses `reasoning_effort`).
- Define and centralize per-agent config precedence before adding new fields: declaration defaults < YAML declaration fields < JSON `blackbytes.sub_agents.<name>` overrides, unless a slice explicitly documents a different rule.
- Use a session-scoped runtime snapshot for sub-agent configuration: `handleSessionStart()` captures the config/YAML-derived declarations and resolved per-agent settings for the active host session; delegate execution and `/blackbytes-status` must read from that same snapshot. Nested Pi subprocesses still run with `--no-session --no-context-files`; this snapshot decision is about Blackbytes extension config lifecycle, not nested conversation persistence.
- Add resolver tests for builtin agents, YAML agents, absent config, unknown nested field preservation, invalid values, and override precedence.

Likely files:

- `src/config/schema.ts`
- `src/sub-agents/declaration.ts`
- `src/sub-agents/register.ts`
- `src/sub-agents/runner.ts`
- `src/sub-agents/oracle.ts`
- `src/sub-agents/loader.ts`
- `src/commands/setup-models.ts`
- related tests under `src/config/__tests__`, `src/sub-agents/__tests__`, `src/commands/__tests__`

Risks:

- Pi CLI may not support `--temperature`; adding a flag blindly would break nested calls.
- Removing nested `temperature` schema support can break or hide existing user config. The config schema is `.passthrough()` only at the top level; `sub_agents.<name>` fields are not automatically preserved unless that nested object is also `.passthrough()`.

Recommended decision:

- First verify CLI support. If `pi -p ... --temperature` is unsupported, do not pass it.
- If unsupported, keep parsing existing nested `temperature` and surface it in status as `reserved/unsupported`, or first make nested agent config passthrough before removing active field support.
- Prefer no-op transparency over broken flag passing.

### Workstream C — Failure diagnostics and output hygiene

Purpose:

- Make nested failures actionable while preserving safe, concise tool results.

Must produce:

- A formatter for `DelegateResult` that includes `content` and truncated `details` on failure.
- Max-length policy for details, likely 4–8 KB.
- Deterministic truncation semantics, preferably preserving both a short head and the final tail with a clear `...[truncated N chars]...` marker when details exceed the limit.
- Lightweight redaction before display for obvious secret-bearing lines or key/value patterns such as API keys, tokens, passwords, authorization headers, and full environment dumps.
- Runner-level bounded stdout/stderr collection so noisy children cannot consume unbounded memory before result formatting runs.
- Tests for failure with stderr/details, timeout, cancellation, and spawn error.
- Tests for high-output children and children that ignore `SIGTERM`; timeout/cancel should escalate to `SIGKILL` after a short grace period and resolve within `timeoutMs + graceMs`.
- Possibly distinguish user-visible `content` from internal logs.

Likely files:

- `src/sub-agents/register.ts`
- `src/sub-agents/runner.ts` if adding structured failure codes
- `src/sub-agents/types.ts`
- `src/sub-agents/__tests__/register.test.ts`
- `src/sub-agents/__tests__/runner.test.ts`

Risks:

- Stderr may include noisy or sensitive output. Redact obvious secrets, avoid exposing env, then truncate deterministically.
- Bounding only the final displayed text is insufficient; `runNestedPi()` must not accumulate unbounded child output internally.
- Too much detail may degrade agent context. Use concise formatting.

Recommended output format:

```text
Error: Nested Pi failed

Details:
<truncated stderr or spawn error>
```

For timeout/cancel:

```text
Error: Nested Pi timed out

Details:
<stderr if any>
```

### Workstream D — YAML diagnostics and status visibility

Purpose:

- Make user-defined sub-agent loading transparent and debuggable.

Must produce:

- Session-scoped runtime state reset at the beginning of every `handleSessionStart()`.
- Reset coverage for all session-scoped singleton state: enabled-set, runtime sub-agent metadata registry, and YAML diagnostics registry.
- A production-intent reset helper, for example `resetSessionRuntimeState()`, rather than ad-hoc calls to test-only reset helpers from production startup code.

- In-memory diagnostics from YAML loading: directory, scanned files, loaded declarations, skipped files with reasons.
- A session snapshot used by `/blackbytes-status`: diagnostics, resolved enabled sub-agents, resolved per-agent config summaries, and allowlist summaries must reflect the declarations actually registered during `handleSessionStart()`, not a later reload of YAML/config from disk.
- Explicit duplicate-name policy for YAML agents: duplicate names in builtin declarations remain a startup/test invariant failure, but duplicate YAML names must not fail the whole extension startup. A YAML file whose name duplicates a builtin or an already accepted YAML declaration is skipped with diagnostics and the remaining declarations still load.
- Enforce duplicate policy at the loader/startup boundary: builtin declarations are checked for uniqueness before YAML loading; YAML loading/filtering receives builtin names as reserved names and tracks accepted YAML names in sorted file order. A skipped duplicate diagnostic must include the skipped file, duplicate name, and winning source (`builtin` or the earlier accepted YAML file).
- `handleSessionStart()` must not call a single `assertUniqueNames([...builtins, ...yaml])` path that can crash on user YAML duplicates. It should assert builtin uniqueness separately, then combine builtins with only accepted YAML declarations.
- `/blackbytes-status` display for sub-agent diagnostics.
- Redacted/safe config display for per-agent model/reasoning/timeout/fallback fields.
- Tests proving invalid YAML appears in diagnostics and valid YAML appears as loaded.
- Tests for duplicate-with-builtin, duplicate-between-YAML-files, disabled custom agents, and status output proving duplicate YAML files are visible as skipped diagnostics rather than crashing startup.
- Tests must prove duplicate YAML files continue startup and register all non-conflicting agents, while duplicate builtin declarations remain invariant failures.

Likely files:

- `src/config/enabled-set.ts`
- `src/config/resource-metadata.ts`
- `src/sub-agents/loader.ts`
- New `src/sub-agents/diagnostics.ts` or similar
- New or existing session runtime reset module
- `/blackbytes-status` command implementation under `src/commands/`
- command tests under `src/commands/__tests__/`
- integration test for session startup diagnostics if needed

Risks:
- Runtime sub-agent metadata can leak or duplicate across repeated `session_start` events unless reset in the production startup path.

- Global diagnostics can leak across tests if not reset.
- Status output should not expose full system prompts or secrets.

Recommended decision:

- Keep diagnostics summary-only:
  - `dir`
  - `files_seen`
  - `loaded: [{ name, file }]`
  - `skipped: [{ file, reason }]`
  - `errors: [{ scope, reason }]`
- Do not include `system_prompt` content in status.
- Do not add `/blackbytes-status --json` in phases 1–2 unless the command framework already supports JSON mode with minimal changes.

### Workstream E — Prompt inheritance

Purpose:

- Let selected subagents inherit parent/session instructions in a controlled way.

Must produce:

- `promptMode?: "static" | "append"` in declarations and YAML.
- Prompt builder that combines base agent prompt and inherited parent prompt/context.
- Register/runner path that can access the parent system prompt or a stable prompt augmentation snapshot.
- Tests for static mode preserving current prompt exactly and append mode wrapping inherited prompt predictably.

Likely files:

- `src/sub-agents/declaration.ts`
- `src/sub-agents/register.ts`
- New `src/sub-agents/prompt-builder.ts`
- `src/sub-agents/loader.ts`
- prompt/handler tests

Risks:

- `registerSubAgent.execute()` may not have direct access to current parent system prompt. If Pi tool execution context does not expose it, append mode must use the rendered Bytes overlay/config context captured at session start instead.
- Blind prompt inheritance can create overly long nested prompts.
- Inherited instructions may conflict with sub-agent constraints, e.g. parent says delegate proactively but child must not spawn agents.

Recommended decision:

- Implement append mode with an explicit bridge where child constraints win:

```xml
<inherited_parent_instructions>
...
</inherited_parent_instructions>

<sub_agent_boundary>
You are running as <name>. Your sub-agent system prompt and tool constraints override inherited instructions when they conflict.
You must not spawn delegate tools.
</sub_agent_boundary>

<sub_agent_system_prompt>
...
</sub_agent_system_prompt>
```

- Default all existing agents to `static` initially.
- Consider enabling `append` first for `oracle` and `general` only after tests/manual validation.

### Workstream F — Model fallback chains

Purpose:

- Improve reliability when a preferred model is unavailable, rate-limited, or rejected.

Must produce:

- Config support for fallback chains through an additive field: keep existing `model: string`, add JSON `fallbackModels?: string[]`, and map YAML `fallback_models` separately.
- `ModelOverrides` support for a fallback chain.
- Runner/register retry loop that tries each model under conservative failure conditions.
- Result details that state which models were attempted.
- Tests for first-model success, first-model failure + fallback success, all failures, and no model override.
- Tests for fallback configured on an agent whose resolved allowlist includes mutating/exec tools.

Likely files:

- `src/config/schema.ts`
- `src/sub-agents/declaration.ts`
- `src/sub-agents/register.ts`
- `src/sub-agents/runner.ts` or new `src/sub-agents/fallback.ts`
- `src/sub-agents/oracle.ts`
- `src/sub-agents/loader.ts`
- tests

Risks:

- Retrying all failures can duplicate side effects for write agents. For `general`, model fallback after a partial write failure may be unsafe.
- It is hard to classify model-unavailable vs task/tool failure purely from CLI exit/stderr.

Recommended decision:

- Preserve existing `sub_agents.<name>.model: string` semantics; do not reinterpret `model` arrays.
- Add fallback through additive fields (`fallbackModels` in JSON config, `fallback_models` in YAML) so existing config and setup wizard behavior remain compatible.
- Make nested `sub_agents.<name>` config `.passthrough()` before removing or renaming any existing field such as `temperature`.
- Keep `reasoningEffort` camelCase in JSON config and `reasoning_effort` in YAML declarations.
- Enable fallback only for read-only agents initially: `explore`, `oracle`, and `librarian`.
- Make fallback eligibility explicit in declaration/config policy and verify it against the resolved tool allowlist. Fallback must be disabled or rejected when mutating/exec tools are present, including YAML agents that explicitly request `write`, `edit`, `bash`, `hashline_edit`, or `ast_replace`.
- Retry only recognized model/provider availability failures, such as rate limit, unavailable model, provider rejection, or transient provider errors identified by stderr patterns.
- Prefer consuming structured failure classifications from Slice 1.4 instead of reparsing redacted/truncated user-visible text.
- Do not retry cancellation, timeout, recursion refusal, invalid CLI flag, invalid tool allowlist, or any attempt that produced stdout.
- Keep fallback disabled for `general` until there is worktree isolation or another side-effect safety mechanism.
- Fallback attempts must share one total-chain timeout budget by default, with per-attempt remaining-time calculation, unless a future explicit config introduces different semantics.
- Add `attemptedModels` to failure details.

### Workstream G — Per-agent timeout and progress surface

Purpose:

- Make nested execution duration and live feedback controllable per agent.

Must produce:

- `timeoutMs` in declaration/model overrides/config/YAML.
- Defaults by agent type:
  - `explore`: 120_000
  - `librarian`: 240_000
  - `oracle`: 300_000
  - `general`: 600_000
- Register path passes timeout to `runNestedPi()`.
- `onUpdate` wired if Pi exposes a safe progress/event mechanism; otherwise structured debug logs.
- Tests proving timeout arg is passed and runner timeout behavior still works.

Likely files:

- `src/config/schema.ts`
- `src/sub-agents/declaration.ts`
- `src/sub-agents/register.ts`
- `src/sub-agents/runner.ts`
- builtin declarations
- tests

Risks:

- Long default timeouts can hang parent sessions; keep bounded.
- Streaming nested output into parent context can be noisy and expensive.

Recommended decision:

- Add timeout support before streaming.
- Treat streaming/progress as opportunistic: wire only if the host API has a well-defined non-invasive channel.

## 5. Dependency and Sequencing Model

### Hard dependency chain

1. Tool-surface correctness must land before status displays final allowlists or prompt inheritance advertises capabilities.
2. Config/runtime consistency plus Slice 1.3a central resolver must land before model fallback and per-agent timeout extend the config shape.
3. Central per-agent config resolver and precedence tests must land before timeout/fallback schema expansion.
4. Failure formatting should land before fallback, because fallback needs to report attempt details cleanly.
5. YAML diagnostics should land before expanding YAML schema in phase 2, so schema failures remain inspectable.
6. Session-state reset must land before YAML/status diagnostics so status never reflects stale metadata.
7. Prompt inheritance should land before enabling append mode for any builtin agent.
8. Timeout support should land before fallback if fallback attempts share total budget or per-attempt budget.

### Soft sequencing preferences

- Add diagnostics/status before deeper runtime changes so every later behavior is easier to debug.
- Implement fallback for read-only agents first; defer write-agent fallback until there is a safe policy.
- Keep prompt inheritance default-off until tests and manual nested runs verify there is no prompt bloat or instruction conflict.

### Parallelizable work

- Workstream C (failure output) can proceed in parallel with Workstream A (tool surface) if edit targets are coordinated.
- Workstream D (diagnostics/status) can proceed in parallel with Workstream B after agreeing on status fields.
- Phase 2 Workstream E (prompt builder) and Workstream G (timeout) can proceed mostly independently.

### Do not parallelize initially

- Config schema changes for `temperature`, fallback, and timeout should not be done by separate agents simultaneously because they touch the same schema/tests and can conflict.
- `register.ts` changes for failure formatting, prompt building, fallback, and timeout should be sequenced carefully.

## 6. Key Design and Delivery Decisions

### Decision 1 — Keep subprocess execution through phase 2

Reasoning:

- Current runner is simple, testable, and security-friendly.
- In-process execution would require deeper dependency on Pi internals and may complicate env/tool isolation.
- Phases 1–2 are about correctness and quality, not full runtime replacement.

Consequence:

- Performance overhead remains for now.
- Fallback/timeout/progress must be implemented around subprocess behavior.

### Decision 2 — Make tool surfaces explicit, not inferred

Reasoning:

- `enabledSet.tools` represents extension-managed tools, not Pi built-ins.
- Nested CLI `--tools` needs a complete allowlist.
- Explicit lists are easier to test and safer than runtime guessing.

Consequence:

- Adding new Pi built-in tools later requires updating a central registry.
- Status can show final resolved allowlists clearly.

### Decision 3 — Fail closed for recursive delegation

Reasoning:

- Current system intentionally prevents subagents from spawning subagents.
- Recursive delegation adds lifecycle and safety complexity.

Consequence:

- `delegate_*` remains invalid in static/YAML allowlists and filtered from dynamic strategies.
- `PI_NESTED_DEPTH >= 1` remains a second guardrail.

### Decision 4 — Prefer visible unsupported config over silent no-op

Reasoning:

- Silent `temperature` no-op creates user confusion.
- Passing unsupported CLI flags can break delegation.

Consequence:

- `temperature` must either become real or be labeled unsupported in status/docs/tests.

### Decision 5 — Prompt inheritance is opt-in

Reasoning:

- Append mode can improve context but can also create instruction conflicts and long prompts.
- Existing static prompts are stable and tested.

Consequence:

- Add the machinery without flipping all builtins immediately.
- Enable per-agent after validation.

### Decision 6 — Fallback is conservative and side-effect aware

Reasoning:

- Retrying a write-capable agent can duplicate modifications if the first attempt partially succeeded.

Consequence:

- Initial fallback should default to read-only agents or opt-in agents.
- `general` fallback should remain disabled until there is a stronger side-effect detection/isolation story.

## 7. Risks, Ambiguities, and Assumptions

### Ambiguities to resolve before implementation

1. Exact Pi CLI built-in tool names accepted by `--tools`.
2. Whether Pi CLI supports `--temperature`.
3. Whether Pi tool execute context exposes a progress API suitable for nested stdout streaming.
4. Whether `/blackbytes-status` should be human text only or include machine-readable JSON mode.
5. Whether YAML agents should be allowed to explicitly opt into write/exec built-ins after Slice 1.1 confirms support; YAML defaults remain conservative and must not receive write/exec built-ins implicitly.

### Main implementation risks

- Incorrect tool allowlist can make `general` less capable than advertised or too powerful for YAML agents.
- Expanding config schema across setup wizard, status, loader, and tests can drift if not done centrally.
- Prompt inheritance can accidentally include stale or conflicting instructions.
- Model fallback can retry side-effectful tasks unsafely.
- Diagnostics global state can leak across tests.

### Assumptions for planning

- Phase 1 should be implementable without new dependencies.
- Phase 2 should also avoid new dependencies unless Pi API requires none/only existing package APIs.
- Existing verification order remains `bun run lint`, `bun run build`, `bun run test`.

## 8. Execution Slices / Phases

### Slice 1.1 — Confirm nested CLI capabilities

Objective:

- Resolve assumptions about Pi CLI flags/tool names before changing code.

Work:

- Check local Pi CLI help or package source for `--tools`, `--temperature`, and built-in tool names.
- Verify nested subprocess working-directory behavior. If the host extension API exposes the active workspace/repo root, pass that cwd explicitly to `runNestedPi()`; otherwise document the fallback to `process.cwd()` and add a test proving generated spawn options use the intended cwd.
- Produce a checked-in compatibility note or equivalent test fixture documenting:
  - Pi CLI/package version inspected.
  - Accepted built-in tool names for `--tools`.
  - Behavior when `--tools` contains an unknown tool.
  - Whether `--temperature` is accepted.
  - Whether `--tools read,write,edit,bash` actually enables those host tools in a nested `pi -p` run.
  - Whether a nested no-op model invocation can authenticate and run under the current safe env whitelist/settings-file assumptions.
- Prefer reproducible evidence over ad-hoc local notes: encode the final decision in runner/register tests where possible, and keep exact command/output fixtures only for behavior that cannot be safely run in CI.
- Keep CI deterministic: default unit tests must use package/source/help inspection and runner/register seams such as `spawnFn`; they must not require an installed `pi` binary, live provider authentication, network access, or model availability.
- Separate compatibility evidence into three classes: package/source/help inspection, deterministic generated-argument tests, and local-only authenticated smoke notes. Real nested `pi -p` invocations are optional local smoke tests unless the repository adds an explicit integration-test profile.
- Add a hard stop gate: no implementation task may add built-in tool names or pass `--temperature` until this slice replaces all downstream `if supported` branches with concrete supported/unsupported instructions.
- Replace downstream `if supported` branches with the concrete supported/unsupported decision from this slice.

Dependencies:

- None.

Validation intent:

- Compatibility artifact is reviewed before Slice 1.2 or Slice 1.3 starts.
- If behavior cannot be verified automatically in CI, document exact local command/output and keep runtime behavior conservative.
- Only package/source/help inspection and deterministic generated-argument tests are required by default verification. Local-only authenticated smoke notes may be checked in as evidence but must not be required for normal CI.
- Tests or fixtures fail loudly if a future Pi version changes accepted CLI flags or generated nested args.
- If nested auth/model selection requires additional environment forwarding, the plan names each env var explicitly, requires redacted status output, and keeps generic env forwarding out of scope.

Newly possible:

- Safe implementation of tool registry and `temperature` decision.

### Slice 1.2 — Fix tool-surface resolution

Objective:

- Ensure final nested allowlists match intended capabilities.

Work:

- Update delegable tool registry.
- Split broad `general` resolution from conservative YAML default/denylist resolution.
- Introduce explicit safe read/search/documentation and mutating/exec tool classes.
- Add or prepend a minimal `general` execution-safety overlay covering repo instructions, git/destructive-command guardrails, verification expectations, and the no-recursive-delegation boundary before broad tools are enabled.
- Define the `general` safety/context overlay source contract before implementation: exact source files or session snapshot fields, precedence order, max size, redaction policy, and fallback behavior when repo-specific instructions are unavailable. This Phase 1 overlay is separate from Phase 2 prompt inheritance and must remain bounded/deterministic.
- Add builtin validation if missing from startup or tests.
- Add regression tests for `general`, default YAML, YAML allowlist, YAML denylist, mutating/exec exclusion, and delegate exclusion.
- Add final nested-tool policy/finalizer that applies global `disabled_tools` to every builtin and YAML allowlist path before `runNestedPi()`.
- Reject/skip YAML explicit allowlists that request globally disabled tools with visible diagnostics; do not silently degrade explicit capability requests.

Dependencies:

- Slice 1.1.

Validation intent:

- Unit tests on resolver and `registerSubAgent()` generated `--tools` args.
- Runner/register tests proving nested spawn options use the active workspace cwd or the documented fallback cwd, especially for write-capable `general` invocations.
- Regression tests proving disabled tools are omitted or rejected from `general`, builtin read-only agents, YAML default/denylist mode, and YAML explicit allowlists, especially for mutating/exec tools.
- Unit test and manual smoke test for a delegated write-capable `general` task proving the broad tool surface is paired with the safety overlay, repo constraints are visible enough, and `delegate_*` tools remain excluded.

Newly possible:

- Accurate status output and reliable `general` delegation.

### Slice 1.3 — Resolve `temperature` config drift

Objective:

- Eliminate silent config no-op.

Work:

- If supported: add `temperature` to `ModelOverrides`, YAML input, config resolver, runner args, and tests.
- If unsupported: remove/mark unsupported in active UX and status; update tests to assert transparency.

Dependencies:

- Slice 1.1.

Validation intent:

- Schema tests, register tests, runner arg tests, setup-models tests if touched.

Newly possible:

- Cleaner foundation for fallback/timeout config expansion.

### Slice 1.3a — Centralize per-agent config resolution

Objective:

- Make per-agent runtime overrides deterministic before adding timeout and fallback fields.

Work:

- Add a single resolver for declaration defaults, YAML declaration fields, and JSON `blackbytes.sub_agents.<name>` overrides.
- Encode precedence as declaration defaults < YAML fields < JSON config overrides unless a later slice explicitly overrides that rule.
- Preserve unknown nested agent config fields with `.passthrough()` before removing or relabeling active fields such as `temperature`.
- Route `registerSubAgent()` and YAML declarations through this resolver rather than duplicating model/reasoning logic.
- Capture the resolved per-agent config in a session-scoped runtime snapshot during `handleSessionStart()` and pass/read that snapshot from `registerSubAgent()` instead of reloading `settings.json` during delegate execution.
- Ensure `/blackbytes-status` and delegate execution use the same snapshot source. Disk config/YAML changes after startup are not reflected until the next session/startup, unless a future explicit reload command is added.
- Keep `runNestedPi()` behavior unchanged: nested agents still run with `--no-session --no-context-files`; this does not imply dynamic config reload.
- Add resolver tests for builtin agents, YAML agents, absent config, unknown nested field preservation, invalid values, and override precedence.
- Add tests proving that if config files change after `handleSessionStart()`, `/blackbytes-status` and the next delegate invocation remain consistent with the active session snapshot.

Dependencies:

- Slice 1.3.

Validation intent:

- Config/schema and register tests prove one resolver controls model/reasoning/temperature-reserved behavior.

Newly possible:

- Timeout and fallback schema expansion can reuse the same precedence and validation path.

### Slice 1.4 — Improve nested failure formatting

Objective:

- Preserve actionable failure detail in delegate results.

Work:

- Add safe formatter/truncator.
- Add runner-level bounded stdout/stderr capture before formatting so noisy child processes cannot consume unbounded memory.
- Add timeout/cancel escalation from `SIGTERM` to `SIGKILL` after a short grace period and guarantee resolution within `timeoutMs + graceMs` in tests.
- Determine whether Pi tool execution exposes an abort/cancel signal. If it does, pass it from `registerSubAgent()` to `runNestedPi()` and test parent-cancel propagation; if it does not, document that nested cancellation is timeout-based only.
- Include `DelegateResult.details` on failure.
- Add simple internal failure classification in `DelegateResult` (`failed`, `timed_out`, `cancelled`, `spawn_error`, `recursion_refused`, and CLI/tool-configuration errors where distinguishable) because model fallback depends on conservative retry/no-retry decisions.
- Keep retry-classification input separate from user-visible details: bounded internal raw stderr/error data may be used only to derive structured failure classification, while all tool results, status output, and logs must use redacted/truncated details.

Dependencies:

- None, but easier after Slice 1.2 tests are updated.

Validation intent:

- Runner/register tests for stderr details, truncation, bounded high-output children, timeout/cancel formatting, spawn error, children that ignore `SIGTERM`, and deterministic failure classification.
- Cancellation tests should include host-tool-call cancellation propagation when the Pi API exposes a signal, not only direct runner-level aborts.

Newly possible:

- Easier debugging of model fallback and prompt inheritance failures later.

### Slice 1.5a — Reset session-scoped runtime state

Objective:

- Make repeated `session_start` handling idempotent and prevent stale metadata/diagnostics.

Work:

- Reset enabled-set session singleton before calling `initEnabledSet()`.
- Reset the runtime sub-agent metadata registry at the beginning of `handleSessionStart()`.
- Reset YAML diagnostics before loading YAML declarations.
- Prefer a production-intent helper such as `resetSessionRuntimeState()` that clears enabled-set, runtime sub-agent metadata, and YAML diagnostics together.
- Call `resetSessionRuntimeState()` as the first session-runtime mutation in `handleSessionStart()`, before loading YAML declarations or registering builtins, so failed startups cannot leave mixed old/new metadata behind.
- Include any session-derived prompt feature/resource metadata in the reset checklist if it is populated from the runtime sub-agent registry.
- Avoid using test-only `_reset*` helpers directly from production startup code unless they are renamed/promoted.
- Add tests that call `handleSessionStart()` twice in one process and verify no duplicate metadata error occurs.
- Add tests that YAML diagnostics from startup 1 do not appear after startup 2 when files/config change.
- Add a failed-startup-then-successful-startup test to prove partial initialization does not poison the next session.

Dependencies:

- None; should land before or with Slice 1.5.

Validation intent:

- Integration test for repeated startup idempotency.

Newly possible:

- Reliable status output and stable test isolation.

### Slice 1.5 — YAML diagnostics and `/blackbytes-status`

Objective:

- Make custom-agent load state visible.

Work:

- Add diagnostics collection/reset/accessor.
- Populate diagnostics in `loadYamlDeclarations()`.
- Pass builtin names as reserved names into YAML loading/filtering, or run a dedicated post-load filter before combining declarations. Duplicate YAML diagnostics must identify the skipped file, duplicate name, and winning source.
- Update status command to show a fixed, safe sub-agent section: builtin agents, loaded YAML agents, skipped YAML files with short reasons, disabled agents, unsupported/reserved config fields, and resolved allowlist summaries.
- Make status read the session snapshot captured at startup. Do not reload YAML or recompute resolved allowlists from current files inside the status command unless the output clearly labels them as pending changes for the next session.
- Label post-startup disk changes, if mentioned, as pending-next-session rather than active runtime changes.
- For allowlists, prefer complete lists only when short; otherwise show counts plus categorized names so status remains readable.
- Do not show system prompts or secrets.

Dependencies:

- Slice 1.2 for final allowlist correctness.
- Slice 1.3 for correct config fields.
- Slice 1.5a for clean session-scoped state.

Validation intent:
- Tests proving `handleSessionStart()` no longer crashes on YAML duplicate names: duplicate-with-builtin and duplicate-between-YAML-files are skipped with diagnostics, while non-conflicting YAML agents still register.

- Loader tests for diagnostics.
- Status command tests with valid/invalid YAML fixtures, plus a test where YAML/config changes after startup and status still reflects the active session snapshot.
- Add a paired delegate-execution test proving the model/reasoning/timeout/fallback values passed to `runNestedPi()` match the active-session snapshot shown by status, even if disk config changes after startup.

Newly possible:

- Users can self-debug custom sub-agent configuration.

### Slice 1.6 — Phase 1 verification and docs

Objective:

- Close hardening phase with documented behavior.

Work:

- Update README/AGENTS/config examples if needed.
- Run `bun run lint`, `bun run build`, `bun run test`.
- Optionally run `bun run check:size` if code grew materially.

Dependencies:

- Slices 1.2–1.5, including Slice 1.5a.

Validation intent:

- Full repo verification.

Newly possible:

- Phase 2 can build on a consistent runtime.

### Slice 2.1 — Add per-agent timeout support

Objective:

- Make nested execution time explicit and configurable.

Work:

- Extend declaration/config/YAML to include `timeoutMs` or `timeout_ms`.
- Add builtin defaults.
- Pass through `registerSubAgent()` to `runNestedPi()`.
- Add tests.

Dependencies:

- Phase 1 config cleanup.

Validation intent:

- Runner/register tests verifying timeout value and timeout behavior.

Newly possible:

- Safer model fallback budget planning.

### Slice 2.2 — Add prompt builder and static/append mode

Objective:

- Support controlled prompt inheritance without changing existing defaults.

Work:

- Add `promptMode` to declaration and YAML schema.
- Implement prompt builder with conflict boundary.
- First determine and document the inherited-context source contract: source module/API, max size, redaction policy, refresh timing, and confirmation that it excludes hidden prompts, raw transcripts, and tool outputs.
- If no safe inherited-context source exists, stop at static prompt-builder support and document append mode as unsupported/deferred rather than fabricating context.
- Keep all builtins static initially.
- Add tests.

Dependencies:

- Phase 1 diagnostics and config stability.

Validation intent:

- Snapshot/structured tests for static output always; append-output tests only after the inherited-context source contract is concrete.

Newly possible:

- Opt-in enablement for `oracle`/`general` after validation.

### Slice 2.3 — Enable append mode selectively

Objective:

- Improve high-value agents with inherited context.

Work:

- Enable append mode for `oracle` first only after Slice 2.2 tests/manual smoke validation pass and the inherited-context source is concrete.
- Evaluate `general` separately because it writes files and must preserve stricter execution boundaries.
- Update prompt tests and manual smoke tests.

Dependencies:

- Slice 2.2.

Validation intent:

- Unit tests plus manual nested calls for `oracle` and possibly `general`.

Newly possible:

- Better answer quality without requiring parent to restate all global instructions.

### Slice 2.4 — Model fallback for read-only agents

Objective:

- Improve reliability for research/reasoning delegates.

Work:

- Extend config schema for fallback model chains.
- Add fallback executor around `runNestedPi()` or inside register path.
- Enable for read-only agents only by default.
- Include attempted model details in failure output.
- Add tests.

Dependencies:

- Slice 1.4 failure formatting.
- Slice 2.1 timeout if sharing budget.

Validation intent:

- Tests for first success, fallback success, all failures, no retry for timeout, cancellation, recursion refusal, invalid CLI flags, invalid tool allowlists, stdout-before-failure, and fallback configured on an agent with mutating/exec tools.

Newly possible:

- More resilient `explore`, `oracle`, `librarian` delegation.

### Slice 2.5 — Optional progress/streaming spike

Objective:

- Determine whether existing `onUpdate` can be connected to a safe host progress surface without creating noisy context output. This slice is non-blocking for Phase 2 success.

Work:

- Inspect Pi ExtensionAPI for progress/event/log support.
- If supported, wire line-buffered `onUpdate` from `registerSubAgent()` to host progress.
- If unsupported, document that user-visible streaming is unsupported and add/debug-retain structured logging only.
- Treat this as spike-only by default; a documented unsupported decision is a valid completion outcome.
- Do not stream nested stdout into the final tool result or parent context by default.
- Add tests around callback invocation if practical.

Dependencies:

- Can be after Slice 1.4; independent of fallback.

Validation intent:

- Either unit tests with fake `spawnFn` emitting stdout chunks when plumbing exists, or a documented unsupported decision plus debug-log coverage.

Newly possible:

- Better observability for long-running nested agents where the host API safely supports it, without full background lifecycle.

### Slice 2.6 — Phase 2 verification and docs

Objective:

- Stabilize delegation-quality improvements.

Work:

- Update README/config docs/YAML examples.
- Run full verification.
- Capture explicit deferred items for phase 3: parallel, background, worktree.

Dependencies:

- Slices 2.1–2.5.

Validation intent:

- `bun run lint`, `bun run build`, `bun run test`, optionally `bun run check:size`.

Newly possible:

- Planning phase 3 from a stronger runtime base.

## 9. Validation and Acceptance Framing

### Functional validation

- `delegate_general` generated `--tools` includes intended Pi built-ins and enabled extension tools, excluding all `delegate_*` tools.
- `delegate_explore`, `delegate_oracle`, and `delegate_librarian` remain read-only/research-only as designed.
- YAML agents with valid config load and register; invalid files are skipped with diagnostics.
- Delegate failure responses include bounded details.
- `temperature` behavior is either real and tested or visibly unsupported.
- Prompt append mode produces deterministic wrapped prompts and remains opt-in.
- Fallback attempts models in expected order under tested failure conditions.
- Timeout values are passed correctly and enforced.

### Integration validation

- `handleSessionStart()` still registers tools and subagents in correct order.
- Prompt overlay still lists available resources correctly.
- `/blackbytes-status` accurately reports enabled/disabled builtin and YAML agents.
- YAML duplicate-name errors are visible in status diagnostics without crashing startup; builtin duplicate names remain startup/test invariant failures.
- Setup-models flow remains compatible with updated config fields.

### Security validation

- Env whitelist in `runNestedPi()` remains intact.
- `delegate_*` remains invalid in allowlists and absent from dynamically resolved tools.
- `blackbytes.disabled_tools` is enforced as a final global denylist for every nested allowlist path; no disabled extension tool or confirmed disabled Pi built-in reaches `runNestedPi()`.
- YAML explicit `allowed_tools` entries that request globally disabled tools are rejected with diagnostics rather than silently degraded.
- Status never prints full system prompts, raw YAML file contents, raw nested stderr, secrets, or unbounded config objects.
- Failure detail redaction and truncation prevent secret leakage and huge stderr dumps.
- Prompt inheritance bridge explicitly states sub-agent constraints override inherited instructions.

### Failure mode validation

- Missing YAML dir: debug/no failure.
- Invalid YAML syntax: skipped + visible reason.
- Unknown YAML tool name: skipped + visible reason.
- Duplicate builtin sub-agent name: startup fails clearly in tests/startup. Duplicate YAML sub-agent name: offending YAML file is skipped with a visible diagnostic and startup continues.
- Nested timeout/cancel/spawn error: returns clear error with details where available.
- Fallback all models fail: final output lists attempted models and final details.

### Regression expectations

- Existing public delegate parameter shapes remain unchanged.
- Existing disable behavior via `disabled_sub_agents` remains unchanged.
- Existing `oracle` default `reasoningEffort: "high"` remains unless overridden.
- Existing verification commands pass: `bun run lint`, `bun run build`, `bun run test`.

## 10. Task Graph Mapping

Top-level task groups for later bead conversion:

1. **Phase 1: Tool-surface correctness**
   - Child tasks:
     - Confirm Pi CLI built-in tool names and flag support.
     - Update delegable tool registry/resolver.
     - Add builtin/YAML resolver tests.
     - Verify `general` generated args.
   - Must carry context:
     - `enabledSet.tools` only tracks extension tools.
     - `delegate_*` must remain excluded.
     - Avoid broadening read-only agents.

2. **Phase 1: Config/runtime consistency**
   - Child tasks:
     - Decide `temperature` support.
     - Implement or mark unsupported.
     - Update schema/setup/tests/docs.
     - Add central per-agent config resolver and precedence tests.
   - Must carry context:
     - Do not pass unsupported CLI flags.
     - Avoid silent no-op config.

3. **Phase 1: Failure diagnostics**
   - Child tasks:
     - Add result formatter/truncator.
     - Include details in delegate tool output.
     - Add tests for stderr/truncation/timeout/cancel.
     - Bound runner stdout/stderr collection and add SIGKILL escalation tests.
   - Must carry context:
     - Details may be sensitive/noisy; redact obvious secrets and truncate deterministically.
     - Tool result format must remain `{ content: [{ type: "text", text }] }`.
     - Internal raw failure data used for classification must remain bounded and must not be surfaced directly; user-visible results/status/logs use redacted/truncated details.

4. **Phase 1: Session runtime reset**
   - Child tasks:
     - Add production reset path for session-scoped singleton state.
     - Reset enabled-set, runtime sub-agent metadata, and YAML diagnostics at the beginning of `handleSessionStart()`.
     - Add repeated `handleSessionStart()` integration test.
     - Add diagnostics isolation test across two startup runs.
   - Must carry context:
     - Current `initEnabledSet()` throws on second initialization.
     - Runtime sub-agent metadata currently rejects duplicates.
     - Reset must happen before YAML/status diagnostics are populated.

5. **Phase 1: YAML/status diagnostics**
   - Child tasks:
     - Add diagnostics state.
     - Populate loader diagnostics.
     - Update `/blackbytes-status`.
     - Read session snapshot in `/blackbytes-status` rather than recomputing from disk.
     - Add tests and docs.
   - Must carry context:
     - Do not expose `system_prompt`.
     - Reset diagnostics in tests.
     - Reset enabled-set, session-scoped metadata, and diagnostics at startup.
     - Duplicate YAML names are skipped with diagnostics; builtin duplicate names remain startup/test invariant failures.
     - Status must reflect the active session snapshot, not later disk changes.

6. **Phase 2: Timeout support**
   - Child tasks:
     - Extend config/declaration/YAML.
     - Add builtin defaults.
     - Pass `timeoutMs` to runner.
     - Add tests.
   - Must carry context:
     - Current runner default is 300_000.
     - Keep bounded per-agent defaults.

7. **Phase 2: Prompt inheritance**
   - Child tasks:
     - Add `promptMode` types/schema.
     - Implement prompt builder.
     - Add static/append tests.
     - Enable append selectively after validation.
   - Must carry context:
     - Default must preserve current static behavior.
     - Child constraints override inherited parent instructions.

8. **Phase 2: Model fallback**
   - Child tasks:
     - Extend model config shape.
     - Implement conservative fallback executor.
     - Enable for read-only agents first.
     - Add attempted-model diagnostics.
     - Add tests.
   - Must carry context:
     - Avoid unsafe retries for any agent whose resolved allowlist includes mutating/exec tools, regardless of whether it is builtin or YAML-defined.
     - Fallback must not retry timeout, cancellation, recursion refusal, invalid CLI flags, invalid tool allowlists, or attempts that produced stdout.
     - Fallback must consume structured failure classification rather than reparsing redacted user-visible text.
     - Fallback attempts share one total-chain timeout budget by default.

9. **Phase 2: Optional progress/streaming spike**
   - Child tasks:
     - Inspect host API support.
     - Wire `onUpdate` to safe progress/log surface.
     - Add callback tests.
   - Must carry context:
     - Do not dump streaming output into final context by default.
     - Keep it optional/noisy-output safe.

Explicit dependency edges to encode later:

- Tool-surface correctness before status final allowlist display.
- Config/runtime consistency plus central per-agent config resolution before timeout/fallback schema expansion.
- Failure diagnostics before model fallback result reporting.
- Session runtime reset before YAML/status diagnostics.
- Prompt builder before enabling append mode on any builtin.
- Inherited-context source contract before implementing append mode or enabling it on any builtin.
- Timeout support before fallback; fallback uses the resolved timeout as a total-chain budget by default.

Recommended implementation granularity:

- Keep each slice to 1–4 files where possible.
- Split schema/setup/status changes carefully because they are cross-cutting.
- Avoid bundling phase 1 and phase 2 in one implementation PR unless the repo owner explicitly wants a large change.
- Do not create leaf implementation tasks that depend on unresolved phrases such as `if supported`, `if safe`, or `where distinguishable`; prerequisite discovery tasks must resolve those into concrete instructions first.
- Every security-sensitive leaf task must carry explicit acceptance criteria for tool permissions, recursion prevention, secret/status redaction, and retry/no-retry behavior where relevant.
- Every leaf task touching sub-agent tool resolution must state how global `disabled_tools` is applied and include a final `runNestedPi()`/generated-args test proving disabled tools cannot bypass the central finalizer.
- Every leaf task that names tools must use canonical public names from the runtime metadata/registry and include a test proving the generated `--tools` allowlist contains no unknown aliases.
- Every leaf task that launches nested Pi must state the working-directory contract and include a generated spawn-options test for cwd.
- Every leaf task touching nested cancellation/fallback must state whether host cancellation is wired or explicitly unsupported.
