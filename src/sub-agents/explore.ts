import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@sinclair/typebox";
import { getEnabledSet } from "../config/enabled-set.js";
import type { ExtensionAPI } from "../types/pi.js";
import { type SpawnFn, runNestedPi } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXPLORE_ALLOWLIST = ["read", "grep", "glob", "ast_grep_search"];

export function registerDelegateExploreTool(pi: ExtensionAPI, spawnFn?: SpawnFn): void {
  if (!getEnabledSet().subAgents.has("explore")) return;

  pi.registerTool({
    name: "delegate_explore",
    description:
      "Delegate a codebase exploration question to a specialized Explore sub-agent. " +
      "Use when you need deep contextual grep across multiple files, want to answer " +
      "'Where is X?', 'Which file has Y?', or 'Find the code that does Z'. " +
      "The sub-agent has read/search access only (no writes, no bash).",
    parameters: Type.Object({
      question: Type.String({
        description:
          "The exploration question or search task to delegate. Be specific about what " +
          "you are looking for and why. Include relevant identifiers, function names, or " +
          "patterns.",
      }),
    }),
    execute: async (params: { question: string }) => {
      const prompt = await readFile(join(__dirname, "../prompts/explore.md"), "utf-8");
      const result = await runNestedPi(
        {
          systemPrompt: prompt,
          userPrompt: params.question,
          allowedTools: EXPLORE_ALLOWLIST,
        },
        spawnFn,
      );
      return {
        content: result.success ? result.content : `Error: ${result.content}`,
      };
    },
  });
}
