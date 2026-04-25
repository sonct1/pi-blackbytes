import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

async function runGlob(params: { pattern: string; path?: string }): Promise<string> {
  const { executeGlob } = await import("../index.js");
  const result = await executeGlob(params);
  const firstBlock = result.content[0];

  assert.equal(firstBlock?.type, "text");
  return firstBlock.text;
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

  it("returns compact status and caps displayed matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glob-cap-"));
    try {
      // Create 120 files
      for (let i = 0; i < 120; i++) {
        await writeFile(join(dir, `file${i}.txt`), "x");
      }

      const result = await runGlob({ pattern: "*.txt", path: dir });
      const files = result.split("\n").filter((line) => line.startsWith(dir));
      assert.equal(files.length, 25, `Expected 25 displayed results, got ${files.length}`);
      assert.match(result, /Found 120 files\./);
      assert.match(result, /Showing newest 25 of 120\./);
      assert.match(result, /Omitted 95 older match\(es\)/);
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
    const result = await runGlob({
      pattern: "**/*.ts",
      path: "/nonexistent-dir-xyz-12345",
    });

    assert.ok(typeof result === "string", "should return a string");
  });
});
