# Changelog

## 0.1.0 (2026-04-18)

### Initial Release

First public release of `@blackbytes/pi-blackbytes` — a Pi coding agent extension providing enhanced file editing, web search, documentation lookup, and multi-agent delegation.

#### Features
- **Local Search & Edit Tools**: `glob`, `grep`, `ast_grep_search`, `ast_grep_replace`, `hashline_edit`
- **Web & Documentation Tools**: `websearch_search`, `websearch_fetch`, `context7_resolve_library_id`, `context7_query_docs`, `grep_app_search_github`
- **Delegation Tools**: `delegate_explore`, `delegate_oracle`, `delegate_librarian`, `delegate_general`
- **Interactive Setup**: `/setup-models` wizard for provider and API key configuration
- **Bundled Skills**: blackbytes-overview, hashline-workflow, delegation
- **Configuration**: JSON-only settings with disabled_tools/disabled_sub_agents, websearch/context7 provider config
- **Performance**: session_start < 200ms (p95), tool_result handler < 50ms avg, package < 500KB gzipped

#### Architecture Decisions
- Single enabled-set computed at session_start, immutable for session lifetime
- hashline_edit is complementary to Pi's native edit (narrow scope: read/write only)
- Nested delegation uses subprocess with recursion guard (maxDepth=1)
- JSON-only settings (no JSONC), atomic write with temp file + rename

#### Known Limitations
- No permission system for delegate tool access
- No model fallback chain
- JSON-only settings (no YAML/TOML)
- Single Pi version tested (0.67.x)
