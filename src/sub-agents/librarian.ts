import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@sinclair/typebox";
import { getEnabledSet } from "../config/enabled-set.js";
import type { ExtensionAPI } from "../types/pi.js";
import { type SpawnFn, runNestedPi } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LIBRARIAN_ALLOWLIST = [
  "read",
  "grep",
  "glob",
  "ast_grep_search",
  "websearch_search",
  "websearch_fetch",
  "context7_resolve_library_id",
  "context7_query_docs",
  "grep_app_search_github",
];

export function registerDelegateLibrarianTool(pi: ExtensionAPI, spawnFn?: SpawnFn): void {
  if (!getEnabledSet().subAgents.has("librarian")) return;

  pi.registerTool({
    name: "delegate_librarian",
    description:
      "Delegate a library/documentation research question to the Librarian sub-agent. " +
      "Use when you need to look up library internals, find usage examples in open source, " +
      "retrieve official documentation, or research how external packages work. " +
      "The sub-agent has web search, Context7 docs, and GitHub code search capabilities.",
    parameters: Type.Object({
      question: Type.String({
        description:
          "The research question about a library, framework, or external resource. " +
          "Include library name, version if known, and what specifically you need to " +
          "understand (API, patterns, examples, internals).",
      }),
    }),
    execute: async (params: { question: string }) => {
      const prompt = await readFile(join(__dirname, "../prompts/librarian.md"), "utf-8");
      const result = await runNestedPi(
        {
          systemPrompt: prompt,
          userPrompt: params.question,
          allowedTools: LIBRARIAN_ALLOWLIST,
        },
        spawnFn,
      );
      return {
        content: result.success ? result.content : `Error: ${result.content}`,
      };
    },
  });
}
