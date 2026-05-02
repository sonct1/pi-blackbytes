import { renderMarkdownPrompt } from "./render.js";
import type { PromptSectionMap } from "./types.js";

/**
 * GPT prompt variant for the Bytes agent.
 *
 * Markdown headings, with a verification-gate and parallel-execution emphasis
 * tuned for GPT models that respond well to explicit ordered checklists.
 */
const GPT_FOOTER = [
  "## Verification Gates",
  "",
  "Before reporting completion, run these in order (skip a stage only if AGENTS.md says so):",
  "",
  "1. **Typecheck** — TypeScript / language-level type errors must be 0.",
  "2. **Lint** — repository linter (Biome / ESLint / etc.) must pass.",
  "3. **Tests** — relevant unit/integration tests must pass.",
  "4. **Build** — final bundle/compile must succeed.",
  "",
  "Report each stage's outcome honestly. Do not weaken or skip a check to fabricate a green result.",
  "",
  "## Parallel Execution Policy",
  "",
  "- ALWAYS issue independent reads, searches, and tool calls in a single turn.",
  "- Serialize ONLY when later work strictly depends on earlier results.",
  "- Treat sequential single-tool turns as a smell unless dependency-justified.",
].join("\n");

const GPT_AFTER_FIRST =
  'NEVER open with filler: "Great question!", "Sure!", "Of course!", "Absolutely!", "Let me help with that!", "I\'d be happy to help!". Start with substance.';

export function buildBytesGptPrompt(sections: PromptSectionMap): string {
  const body = renderMarkdownPrompt(sections, {
    heading: (_index, title) => `# ${title}`,
    afterFirstSection: GPT_AFTER_FIRST,
  });
  return `${body}\n\n${GPT_FOOTER}`;
}
