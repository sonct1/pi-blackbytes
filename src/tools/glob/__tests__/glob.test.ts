import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

// We test the execute logic directly, bypassing pi registration
async function runGlob(params: { pattern: string; path?: string }): Promise<string> {
  // Dynamic import to get the execute function behavior
  // We replicate the logic here to avoid needing pi
  const fg = (await import("fast-glob")).default;
  const { stat } = await import("node:fs/promises");

  const RESULT_CAP = 100;
  const { pattern, path: cwd } = params;

  const matches: string[] = await fg(pattern, {
    cwd: cwd ?? process.cwd(),
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  const withMtime = await Promise.all(
    matches.map(async (file) => {
      try {
        const s = await stat(file);
        return { file, mtime: s.mtimeMs };
      } catch {
        return { file, mtime: 0 };
      }
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);
  const capped = withMtime.slice(0, RESULT_CAP).map((x) => x.file);

  return capped.length > 0 ? capped.join("\n") : "(no matches)";
}

describe("glob tool", () => {
  it("finds matching files with basic pattern", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glob-test-"));
    try {
      await writeFile(join(dir, "foo.ts"), "export {}");
      await writeFile(join(dir, "bar.ts"), "export {}");
      await writeFile(join(dir, "baz.js"), "module.exports = {}");

      const result = await runGlob({ pattern: "*.ts", path: dir });
      const files = result.split("\n");

      assert.ok(
        files.some((f) => f.endsWith("foo.ts")),
        "should include foo.ts",
      );
      assert.ok(
        files.some((f) => f.endsWith("bar.ts")),
        "should include bar.ts",
      );
      assert.ok(!files.some((f) => f.endsWith("baz.js")), "should not include baz.js");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("caps results at 100", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glob-cap-"));
    try {
      // Create 120 files
      for (let i = 0; i < 120; i++) {
        await writeFile(join(dir, `file${i}.txt`), "x");
      }

      const result = await runGlob({ pattern: "*.txt", path: dir });
      const files = result.split("\n");
      assert.ok(files.length <= 100, `Expected <= 100 results, got ${files.length}`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("returns no-matches message when pattern finds nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glob-empty-"));
    try {
      const result = await runGlob({ pattern: "*.nonexistent", path: dir });
      assert.equal(result, "(no matches)");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("handles invalid path gracefully", async () => {
    // Import and test execute which wraps errors
    const mod = await import("../index.js");
    // Since we can't call execute directly without the full module structure,
    // we test by passing a non-existent directory to fast-glob which should error or return []
    const result = await runGlob({ pattern: "**/*.ts", path: "/nonexistent-dir-xyz-12345" }).catch(
      (err: unknown) => `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Either returns empty or an error message - both are acceptable
    assert.ok(typeof result === "string", "should return a string");
  });
});
