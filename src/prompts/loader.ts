import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ModelFamily, getModelFamily } from "../shared/model-capability.js";

// ---------------------------------------------------------------------------
// Prompt variant selection
// ---------------------------------------------------------------------------

const VARIANT_DIR = join(dirname(fileURLToPath(import.meta.url)), "bytes");

const FAMILY_TO_FILE: Record<ModelFamily, string> = {
  claude: "default.md",
  gpt: "gpt.md",
  gemini: "gemini.md",
  other: "default.md",
};

const DEFAULT_FILE = "default.md";

/**
 * Load the Bytes prompt variant for the current (or specified) model family.
 * Falls back to default.md if the family-specific file is missing.
 */
export function loadBytesPrompt(family?: ModelFamily): string {
  const resolved = family ?? getModelFamily();
  const filename = FAMILY_TO_FILE[resolved] ?? DEFAULT_FILE;
  try {
    return readFileSync(join(VARIANT_DIR, filename), "utf-8");
  } catch {
    // Graceful fallback: if family-specific file is missing, use default
    if (filename !== DEFAULT_FILE) {
      return readFileSync(join(VARIANT_DIR, DEFAULT_FILE), "utf-8");
    }
    throw new Error(`Failed to load Bytes prompt: ${DEFAULT_FILE} not found`);
  }
}
