# Changelog

## 0.1.0 (2026-04-18)

### Release surface

- Bundled local tools: `glob`, `grep`, `ast_grep_search`, `ast_grep_replace`, `hashline_edit`
- HTTP-backed tools: `websearch_search`, `websearch_fetch`, `context7_resolve_library_id`, `context7_query_docs`, `grep_app_search_github`
- Delegate tools: `delegate_explore`, `delegate_oracle`, `delegate_librarian`, `delegate_general`
- Pi commands: `/setup-models`, `/blackbytes-status`
- Bundled skills: `blackbytes-overview`, `hashline-workflow`, `delegation`

### Runtime behavior

- The enabled tool/sub-agent set is computed once at `session_start` and reused across registration and prompt augmentation.
- `before_agent_start` injects the Bytes prompt block and the current `<available_resources>` view.
- `tool_result` rewrites Pi `read` and `write` output for the hashline workflow.
- `before_provider_request` maps reasoning settings by model family and registers the GitHub Copilot initiator header when enabled.
- Delegate sessions run with runtime-enforced tool allowlists and a one-level recursion guard.

### Configuration

- Strict JSON configuration under `settings.json › blackbytes`
- Tool and sub-agent disabling via `disabled_tools` and `disabled_sub_agents`
- Websearch provider selection via `websearch.provider` with `exa_api_key` or `tavily_api_key`
- Optional Context7 API key under `context7.api_key`
- Per-agent overrides under `sub_agents.<name>`

### Constraints

- Node `>=20`
- Peer dependency: `@mariozechner/pi-coding-agent@^0.67`
- Package budget: `< 500KB` gzipped
