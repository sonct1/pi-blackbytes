import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

type OutputMode = "content" | "files_with_matches" | "count";

interface GrepParams {
  pattern: string;
  include?: string;
  output_mode?: OutputMode;
  head_limit?: number;
  path?: string;
}

// ---------------------------------------------------------------------------
// Inline fallback implementation (Node.js) for testing without ripgrep
// ---------------------------------------------------------------------------

async function* walkFiles(dir: string, include?: string): AsyncGenerator<string> {
  const { readdir } = await import("node:fs/promises");
  const { join: pathJoin } = await import("node:path");

  let entries: import("node:fs").Dirent[] | undefined;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const globToRegex = (glob: string): RegExp => {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]");
    return new RegExp(`(^|/)${escaped}$`);
  };

  const includeRe = include ? globToRegex(include) : null;

  for (const entry of entries) {
    const fullPath = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, include);
    } else if (entry.isFile()) {
      if (!includeRe || includeRe.test(entry.name)) {
        yield fullPath;
      }
    }
  }
}

async function nodeFallbackGrep(params: GrepParams): Promise<string> {
  const { readFile, stat } = await import("node:fs/promises");
  const { relative } = await import("node:path");
  const { pattern, include, output_mode, head_limit, path: searchPath } = params;
  const mode = output_mode ?? "files_with_matches";
  const dir = searchPath ?? process.cwd();

  const regex = new RegExp(pattern, "m");
  const resultLines: string[] = [];
  let lineCount = 0;
  const exceeded = () => head_limit != null && lineCount >= head_limit;

  for await (const filePath of walkFiles(dir, include)) {
    if (exceeded()) break;
    let content: string;
    try {
      const s = await stat(filePath);
      if (s.size > 10 * 1024 * 1024) continue;
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const relPath = relative(dir, filePath);
    const lines = content.split("\n");
    const matchingLines: Array<{ lineNum: number; text: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matchingLines.push({ lineNum: i + 1, text: lines[i] });
      }
    }

    if (matchingLines.length === 0) continue;

    if (mode === "files_with_matches") {
      resultLines.push(relPath);
      lineCount++;
    } else if (mode === "count") {
      resultLines.push(`${relPath}:${matchingLines.length}`);
      lineCount++;
    } else {
      for (const { lineNum, text } of matchingLines) {
        if (exceeded()) break;
        resultLines.push(`${relPath}:${lineNum}:${text}`);
        lineCount++;
      }
    }
  }

  return resultLines.join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("grep tool - Node.js fallback", () => {
  it("files_with_matches mode returns files containing pattern", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-test-"));
    try {
      await writeFile(join(dir, "a.ts"), "export const foo = 42;\nexport const bar = 1;");
      await writeFile(join(dir, "b.ts"), "export const baz = 99;");
      await writeFile(join(dir, "c.ts"), "// no match here");

      const result = await nodeFallbackGrep({
        pattern: "foo|baz",
        path: dir,
        output_mode: "files_with_matches",
      });
      const files = result.split("\n").filter(Boolean);

      assert.ok(
        files.some((f) => f.includes("a.ts")),
        "a.ts should match",
      );
      assert.ok(
        files.some((f) => f.includes("b.ts")),
        "b.ts should match",
      );
      assert.ok(!files.some((f) => f.includes("c.ts")), "c.ts should not match");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("content mode returns matching lines with file:line:text format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-content-"));
    try {
      await writeFile(join(dir, "file.ts"), "line one\nconst x = 42;\nline three");

      const result = await nodeFallbackGrep({
        pattern: "const",
        path: dir,
        output_mode: "content",
      });
      assert.ok(result.includes("file.ts:2:const x = 42;"), `Expected match, got: ${result}`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("count mode returns file:count pairs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-count-"));
    try {
      await writeFile(join(dir, "multi.ts"), "foo\nfoo\nfoo\nbar");

      const result = await nodeFallbackGrep({ pattern: "foo", path: dir, output_mode: "count" });
      assert.ok(result.includes("multi.ts:3"), `Expected count=3, got: ${result}`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("head_limit caps number of results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-limit-"));
    try {
      // 5 files each matching
      for (let i = 0; i < 5; i++) {
        await writeFile(join(dir, `file${i}.ts`), "const match = true;");
      }

      const result = await nodeFallbackGrep({
        pattern: "match",
        path: dir,
        output_mode: "files_with_matches",
        head_limit: 2,
      });
      const files = result.split("\n").filter(Boolean);
      assert.ok(files.length <= 2, `Expected <= 2 results, got ${files.length}`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("returns empty string when no files match", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-nomatch-"));
    try {
      await writeFile(join(dir, "file.ts"), "no patterns here");

      const result = await nodeFallbackGrep({ pattern: "ZZZNOMATCH", path: dir });
      assert.equal(result, "");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("grep tool - ripgrep integration", () => {
  it("rg binary produces output for files_with_matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grep-rg-"));
    try {
      await writeFile(join(dir, "hello.ts"), "const greeting = 'hello world';");

      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn("rg", ["--files-with-matches", "--", "hello", dir], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const out: Buffer[] = [];
        proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0 || code === 1) resolve(Buffer.concat(out).toString("utf8").trimEnd());
          else reject(new Error(`rg exited with ${code}`));
        });
      });

      assert.ok(result.includes("hello.ts"), `Expected hello.ts in result, got: ${result}`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
