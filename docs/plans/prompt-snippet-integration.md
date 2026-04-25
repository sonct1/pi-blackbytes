# Plan: promptSnippet Integration for Blackbytes Tools

## 1. Goal & Scope

### Problem

Pi's `buildSystemPrompt()` only shows tools in the authoritative "Available tools:" section when `definition.promptSnippet` is set. Blackbytes registers 10 tools without `promptSnippet`, making them invisible in this section. Models see `read, bash, edit, write, mcp` at the top of the prompt but only encounter blackbytes tools in the overlay's `<available_resources>` block ~200 lines later. Combined with the overlay's low-priority Precedence rule, this causes models to prefer base tools (`edit` over `hashline_edit`, `bash grep` over `grep`).

### Why it matters

- `hashline_edit` is the preferred editing tool but loses to `edit` which has authoritative placement + detailed guidance
- `grep`/`glob` are faster and safer than `bash grep`/`bash find` but models default to bash
- Web/docs/search tools compete with the `mcp` gateway for attention

### In scope

1. Add `promptSnippet` to all 10 blackbytes tool registrations
2. Add `promptGuidelines` to `hashline_edit` to assert preference over base `edit`
3. Reword `<available_resources>` header to acknowledge base tools without contradiction
4. Update all affected tests

### Out of scope

- Changing the overlay structure or prompt variants
- Modifying Pi core's system prompt builder
- Changing tool descriptions or parameters
- Restructuring `resource-metadata.ts` or enabled-set logic

### Assumptions

- Pi's `ToolDefinition.promptSnippet` accepts any string (confirmed: `Optional one-line snippet for the Available tools section`)
- Pi's `ToolDefinition.promptGuidelines` accepts `string[]` and appends to "Guidelines" section (confirmed from type definition)
- Snippets should be short (~100 chars) like mcp_adapter does: `truncateAtWord(description, 100)`
- Adding `promptSnippet` is backward-compatible — it's an optional field

## 2. Repo Touchpoints

| File | Change type | Why |
|------|-------------|-----|
| `src/tools/hashline-edit/index.ts` | Modify | Add `promptSnippet` + `promptGuidelines` to registration |
| `src/tools/grep/index.ts` | Modify | Add `promptSnippet` |
| `src/tools/glob/index.ts` | Modify | Add `promptSnippet` |
| `src/tools/ast-grep/search.ts` | Modify | Add `promptSnippet` |
| `src/tools/ast-grep/replace.ts` | Modify | Add `promptSnippet` |
| `src/tools/websearch/search.ts` | Modify | Add `promptSnippet` |
| `src/tools/websearch/fetch.ts` | Modify | Add `promptSnippet` |
| `src/tools/context7/resolve.ts` | Modify | Add `promptSnippet` |
| `src/tools/context7/query.ts` | Modify | Add `promptSnippet` |
| `src/tools/grep-app/search.ts` | Modify | Add `promptSnippet` |
| `src/handlers/before-agent-start.ts` | Modify | Reword resources block header to acknowledge base tools |
| `src/tools/_shared/__tests__/register-tool.test.ts` | Modify | Test `promptSnippet` passthrough |
| `src/__tests__/integration/session-start.test.ts` | Modify | Assert real registered tool definitions expose prompt snippets/guidelines |
| `src/handlers/__tests__/before-agent-start.test.ts` | Modify | Update assertions for reworded resources block header |

## 3. Work Slices

### Slice A: Add `promptSnippet` to all 10 tools (parallelizable per tool)

**A1. Verify `register-tool.ts` passthrough** (read-only)
- Confirm that `promptSnippet` and `promptGuidelines` fields flow through to `pi.registerTool()`. The helper uses `...definition` spread, so they do. No code change needed.

**A2. Add `promptSnippet` to each tool registration** (10 files, all independent)
- Craft a concise snippet (~60-100 chars) for each tool derived from its `description` field
- Add snippets directly to the individual `registerTool()` definitions in this change; do not introduce a new metadata source or generation layer.
- Use the public registered tool names and keep each snippet short enough for Pi's compact `Available tools:` section.
- Proposed snippets:
  - `hashline_edit`: `"Edit files using LINE#ID anchors for precise, safe modifications"`
  - `grep`: `"Search file contents using regular expressions with safety limits"`
  - `glob`: `"Fast file pattern matching with glob patterns like **/*.ts"`
  - `ast_search`: `"Search code patterns across filesystem using AST-aware matching"`
  - `ast_replace`: `"Replace code patterns across filesystem with AST-aware rewriting"`
  - `web_search`: `"Search the web for any topic and get clean, ready-to-use content"`
  - `web_fetch`: `"Fetch a URL and return content in markdown, text, or html format"`
  - `docs_resolve`: `"Resolve a package name to a Context7 library ID for documentation lookup"`
  - `docs_query`: `"Query up-to-date documentation and code examples from Context7"`
  - `gh_search`: `"Search code patterns across public GitHub repositories"`

**A3. Add `promptGuidelines` to `hashline_edit`**
- Guidelines to assert preference over base `edit`:
  ```ts
  promptGuidelines: [
    "Prefer hashline_edit over edit for all file modifications when available.",
    "Always read the target file first to obtain LINE#ID anchors before editing.",
  ]
  ```

**Depends on**: Nothing. Can start immediately.

### Slice B: Reword `<available_resources>` header (depends on nothing)

**B1. Update `buildResourcesBlock()` in `before-agent-start.ts`**
- Replace the header with: `"The following oc-blackbytes-managed resources are enabled in this session. Use listed bundled tools, MCP servers, and peer agents when they match the task. OpenCode core tools are governed by runtime availability and permissions."`
- This acknowledges base tools exist without contradicting the "use what's listed" directive.

**Depends on**: Nothing. Can parallelize with Slice A.

### Slice C: Update tests (depends on A, B)

**C1. `register-tool.test.ts`**
- Add test: when definition includes `promptSnippet`, it's passed through to `pi.registerTool()`
- Add test: when definition includes `promptGuidelines`, it's passed through

**C2. Registration integration coverage**
- In `src/__tests__/integration/session-start.test.ts` or an equivalent integration test, run the normal session-start registration path and assert every tool in `ALL_TOOL_NAMES` registers with a non-empty `promptSnippet`.
- Assert the registered `hashline_edit` definition includes:
  ```ts
  promptGuidelines: [
    "Prefer hashline_edit over edit for all file modifications when available.",
    "Always read the target file first to obtain LINE#ID anchors before editing.",
  ]
  ```
- This verifies the real 10 tool registration files were updated, not only that the shared helper can pass optional fields through.

**C3. `before-agent-start.test.ts`**
- Update existing assertions to account for the reworded resources block header
- Add an assertion for the exact new header sentence so the old `Only reference tools...` wording cannot regress unnoticed.

**C4. Run full test suite**: `bun run lint && bun run build && bun run test`

**Depends on**: Slices A, B.

## 4. Risks & Decisions

| Risk/Decision | Severity | Mitigation |
|---------------|----------|------------|
| **`promptSnippet` too long → clutters system prompt** | Medium | Cap at ~100 chars, similar to mcp_adapter's `truncateAtWord(desc, 100)` |
| **`promptGuidelines` on hashline_edit conflicts with base `edit` guidance** | Low | Pi appends guidelines after base content; hashline guideline explicitly says "prefer over edit" which is additive, not contradictory |
| **`register-tool.ts` might filter/destructure definition fields** | Medium | Verify the helper passes definition object intact to `pi.registerTool()`. If it destructures, add `promptSnippet` and `promptGuidelines` to the destructured set |
| **Snippet text quality** | Low | Derived from existing `description` fields; can iterate |

### Key design decisions

1. **Snippets derived from existing descriptions** rather than new copy — keeps them accurate and low-maintenance.
2. **Only `hashline_edit` gets `promptGuidelines`** — it's the only tool that needs to explicitly override a base tool. Other tools don't conflict.
3. **Base tools acknowledged via header reword** rather than a separate line — avoids contradicting the existing "use what's listed" directive while making clear these are supplemental resources.

## 5. Validation

| Slice | Verification |
|-------|-------------|
| A (promptSnippet) | Shared passthrough test passes; registration integration test confirms all 10 real tool definitions have non-empty `promptSnippet`; manual inspection of logged prompt shows all 10 tools in "Available tools:" section |
| B (header reword) | `bun run test src/handlers/__tests__/before-agent-start.test.ts` passes; resources block header acknowledges base tools and asserts the exact new header sentence |
| C (full suite) | `bun run lint && bun run build && bun run test` all green |
| **Acceptance criteria** | All 10 blackbytes tools appear in Pi's "Available tools:" system prompt section alongside base tools. `hashline_edit` has guideline asserting preference over `edit`. No test regressions. Package size stays under 500KB gzipped. |

**Post-merge validation**: Enable `system_prompt_log` (`{"blackbytes": {"system_prompt_log": {"enabled": true}}}`), start a fresh session, and confirm all 10 tool names appear in the "Available tools:" section of the logged prompt.
