# Blackbytes Overview

Blackbytes is a Pi coding agent extension that adds enhanced file editing, web search, documentation lookup, code search, and multi-agent delegation capabilities to Pi. It augments Pi's built-in tools with a richer set of local, web, and collaboration-oriented tools so that Pi can handle deeper research, precise file editing, and parallelized implementation work.

---

## Tool Reference

### Local Tools

These tools operate entirely on the local filesystem and codebase.

| Tool | Purpose |
|------|---------|
| `glob` | File pattern matching — find files by name/extension glob patterns |
| `grep` | Content search with regex — search file contents, filter by include pattern, return content or file list |
| `ast_grep_search` | AST-aware code search — find code patterns using meta-variables (`$VAR`, `$$$`) across 25 languages |
| `ast_grep_replace` | AST-aware code rewrite — pattern-match and rewrite code with meta-variable substitution, dry-run by default |
| `hashline_edit` | Precise LINE#ID anchored file editing — safe, snapshot-semantics multi-op editor using tagged line anchors |

### Web and Documentation Tools

These tools reach outside the local filesystem to retrieve information.

| Tool | Purpose |
|------|---------|
| `websearch_search` | Web search via Exa/Tavily — natural language search returning clean content from top results |
| `websearch_fetch` | Fetch URL content — retrieve and convert a specific URL to markdown, text, or HTML |
| `context7_resolve_library_id` | Resolve library to Context7 ID — must be called before `context7_query_docs` to get a valid library ID |
| `context7_query_docs` | Query library documentation — retrieve up-to-date docs and code examples from Context7 |
| `grep_app_search_github` | Search GitHub code — find real-world usage patterns across public repositories |

### Delegation Tools

These tools spawn specialized sub-agents for research, reasoning, or implementation work.

| Tool | Purpose |
|------|---------|
| `delegate_explore` | Read-only codebase search agent — answers "Where is X?", "Which file has Y?" |
| `delegate_oracle` | High-reasoning consultation agent — complex debugging, architecture decisions, tradeoff analysis |
| `delegate_librarian` | Documentation and cross-repo research agent — external library research, usage examples |
| `delegate_general` | Full-access implementation executor agent — heavy multi-file implementation, refactors, migrations |

---

## Delegation Decision Guide

Use delegation when the work is too broad or specialized to handle inline efficiently.

**Do work directly when:**
- The file location is known and the change is small
- A single grep or read is sufficient to answer the question
- The implementation touches one or two files

**Use `delegate_explore` when:**
- You need to find where a pattern, function, or module lives in an unfamiliar codebase
- You want multiple parallel searches across the codebase
- The question is "where is X?" or "what calls Y?"

**Use `delegate_oracle` when:**
- You have failed to solve a bug after two or more attempts
- The problem requires reasoning about architecture tradeoffs, security implications, or performance characteristics
- The question has no straightforward answer and needs careful analysis
- Note: Oracle is expensive — do not use it for simple questions

**Use `delegate_librarian` when:**
- You need to understand an external library's API or internals
- You need to find usage examples from open-source projects
- You need to look up official documentation for a framework or package
- The research spans multiple repositories

**Use `delegate_general` when:**
- The implementation spans many files or layers
- The work is well-defined and can be handed off as a self-contained task
- You need boilerplate generation, mass migrations, or cross-layer refactors
- You want to fire-and-forget a heavy task and continue planning
