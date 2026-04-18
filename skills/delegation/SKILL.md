# Delegation Guide

Blackbytes provides four delegate tools that spawn specialized sub-agents. Each delegate has a defined scope, tool set, and intended use case. Using the right delegate for the right job keeps context lean and produces better results.

---

## Delegates

### `delegate_explore`

**Access:** Read-only  
**Tools:** read, grep, glob, ast_grep_search

Use `delegate_explore` when you need to locate things in the codebase without modifying anything.

Good uses:
- "Where is the authentication middleware defined?"
- "Which files import from this module?"
- "Find all usages of this function pattern"
- Initial orientation in an unfamiliar part of the codebase
- Broad searches that would require many sequential grep calls

Fire multiple explore delegates in parallel when the searches are independent. Explore is cheap and fast.

---

### `delegate_oracle`

**Access:** Read-only, high reasoning  
**Tools:** read, grep, glob, ast_grep_search

Use `delegate_oracle` when the problem requires deep analysis, not just information retrieval. Oracle applies elevated reasoning to hard problems.

Good uses:
- You have made two or more failed attempts to fix a bug
- You need to reason through architecture tradeoffs with no clear answer
- Security implications or performance characteristics need careful analysis
- The problem involves subtle interactions between components

Do not use Oracle for:
- Simple questions with straightforward answers
- Things a grep or read would resolve
- Routine implementation decisions

Oracle is expensive in compute and context. Reserve it for problems that genuinely require high-quality reasoning.

---

### `delegate_librarian`

**Access:** Read-only + web  
**Tools:** read, grep, glob, ast_grep_search, websearch_search, websearch_fetch, context7_resolve_library_id, context7_query_docs, grep_app_search_github

Use `delegate_librarian` when the research involves external libraries, remote repositories, or official documentation.

Good uses:
- Understanding an external library's API or configuration options
- Finding real-world usage examples for a package across public GitHub repos
- Looking up official documentation for a framework or language feature
- Comparing how different projects implement a pattern
- Cross-repository analysis spanning multiple codebases

Librarian is the right choice whenever the answer lives outside the local repository.

---

### `delegate_general`

**Access:** Full tool access (all tools except delegate_*)  
**Tools:** read, write, edit, grep, glob, ast_grep_search, ast_grep_replace, hashline_edit, websearch_search, websearch_fetch, context7_*, grep_app_search_github, bash

Use `delegate_general` when there is a large, well-defined implementation task that can be handed off and executed independently.

Good uses:
- Multi-file feature implementation across multiple layers
- Cross-cutting refactors that touch many files with a clear pattern
- Mass migrations (renaming, restructuring, format changes)
- Boilerplate generation for a well-specified interface
- Any task where the plan is clear and execution is the bottleneck

General is a fire-and-forget executor. Provide complete context in the prompt because it starts with no knowledge of prior conversation. The task should be self-contained enough for an agent to implement without asking follow-up questions.

---

## When Not to Delegate

Delegation adds overhead. Avoid it when:

- The file location is already known and the change is small (one or two files)
- A single grep call would answer the question
- The task is a simple inline edit or read
- You need tight back-and-forth iteration — delegates are one-shot

---

## Decision Flowchart

```
Is the task research or discovery?
  Yes, local codebase only     --> delegate_explore
  Yes, external libraries/docs --> delegate_librarian

Is the task a hard problem requiring deep reasoning?
  Yes, after 2+ failed attempts or genuine tradeoff analysis --> delegate_oracle
  No                                                         --> do it directly

Is the task heavy implementation across many files?
  Yes, well-defined and self-contained --> delegate_general
  No                                   --> do it directly
```
