import { spawnSync } from "node:child_process";

/** Languages supported by ast-grep */
export const AST_GREP_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "elixir",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "nix",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "solidity",
  "swift",
  "typescript",
  "tsx",
  "yaml",
] as const;

export type AstGrepLanguage = (typeof AST_GREP_LANGUAGES)[number];

export interface BinaryResult {
  found: true;
  bin: string;
}

export interface BinaryMissing {
  found: false;
  error: string;
}

/** Detect ast-grep binary (ast-grep or sg). */
export function detectBinary(): BinaryResult | BinaryMissing {
  for (const bin of ["ast-grep", "sg"]) {
    const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (result.status === 0 || result.stdout) {
      return { found: true, bin };
    }
  }
  return {
    found: false,
    error:
      "ast-grep binary not found. Install it with: cargo install ast-grep, or see https://ast-grep.github.io/guide/quick-start.html",
  };
}

export interface SpawnResult {
  ok: true;
  stdout: string;
  stderr: string;
}

export interface SpawnError {
  ok: false;
  error: string;
  stderr?: string;
}

/** Spawn an ast-grep command synchronously and return the output. */
export function runAstGrep(bin: string, args: string[]): SpawnResult | SpawnError {
  const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  // ast-grep exits with 1 when no matches found — that's still a valid run
  return {
    ok: true,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
