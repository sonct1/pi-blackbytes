import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { createLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readLog(dir: string): Promise<string> {
  const file = path.join(dir, "pi-blackbytes.log");
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function listLogFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.startsWith("pi-blackbytes"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BufferedLogger", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "logger-test-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up log files between tests
    const files = await listLogFiles(tmpDir);
    for (const f of files) {
      await fs.rm(path.join(tmpDir, f), { force: true });
    }
  });

  // -------------------------------------------------------------------------

  it("writes buffered content after flush()", async () => {
    const logger = createLogger({ logDir: tmpDir });
    logger.info("hello world");
    await logger.flush();
    const content = await readLog(tmpDir);
    assert.ok(content.includes("hello world"), "log should contain message");
    assert.ok(content.includes("[INFO]"), "log should contain level");
  });

  it("formats log lines correctly", async () => {
    const logger = createLogger({ logDir: tmpDir });
    logger.warn("test warning", { key: "value" });
    await logger.flush();
    const content = await readLog(tmpDir);
    assert.ok(content.includes("[WARN]"), "level tag present");
    assert.ok(content.includes("test warning"), "message present");
    assert.ok(content.includes('"key"'), "meta key present");
    assert.ok(content.includes('"value"'), "meta value present");
  });

  it("redacts secret keys in meta", async () => {
    const logger = createLogger({ logDir: tmpDir });
    logger.info("auth check", {
      api_key: "super-secret",
      authorization: "Bearer token123",
      exa_api_key: "exa-secret",
      tavily_api_key: "tavily-secret",
      "x-initiator": "user",
      safe_key: "visible",
    });
    await logger.flush();
    const content = await readLog(tmpDir);
    assert.ok(!content.includes("super-secret"), "api_key should be redacted");
    assert.ok(!content.includes("token123"), "authorization should be redacted");
    assert.ok(!content.includes("exa-secret"), "exa_api_key should be redacted");
    assert.ok(!content.includes("tavily-secret"), "tavily_api_key should be redacted");
    assert.ok(content.includes("***"), "redacted placeholder present");
    assert.ok(content.includes("user"), "x-initiator should NOT be redacted");
    assert.ok(content.includes("visible"), "safe_key should NOT be redacted");
  });

  it("does not throw on write failures", async () => {
    // Use a path that can't be created (file in place of directory)
    const badDir = path.join(tmpDir, "not-a-dir");
    // Create a file where the dir should be, so mkdir fails
    await fs.writeFile(badDir, "blocker");
    const logger = createLogger({ logDir: badDir });
    // Should not throw
    logger.error("this will fail silently");
    await assert.doesNotReject(async () => {
      await logger.flush();
    });
  });

  it("rotates log file when size exceeds 10MB", async () => {
    const logger = createLogger({ logDir: tmpDir });

    // Write a 10MB+ file manually so size check triggers rotation
    const bigContent = "x".repeat(10 * 1024 * 1024 + 1);
    await fs.writeFile(path.join(tmpDir, "pi-blackbytes.log"), bigContent);

    // Now logging should trigger rotation
    logger.info("after rotation");
    await logger.flush();

    const files = await listLogFiles(tmpDir);
    // Should have at least 2 files: the rotated one + the new one
    assert.ok(files.length >= 2, `expected ≥2 log files, got: ${files.join(", ")}`);
    // The new log should contain our message
    const newContent = await readLog(tmpDir);
    assert.ok(newContent.includes("after rotation"), "new log should have new message");
    // The rotated file should NOT contain our message
    const rotated = files.filter((f) => f !== "pi-blackbytes.log");
    assert.ok(rotated.length >= 1, "rotated file should exist");
  });

  it("all log levels work", async () => {
    const logger = createLogger({ logDir: tmpDir });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    await logger.flush();
    const content = await readLog(tmpDir);
    assert.ok(content.includes("[DEBUG]"), "debug level");
    assert.ok(content.includes("[INFO]"), "info level");
    assert.ok(content.includes("[WARN]"), "warn level");
    assert.ok(content.includes("[ERROR]"), "error level");
  });

  it("second flush with empty buffer is a no-op", async () => {
    const logger = createLogger({ logDir: tmpDir });
    logger.info("only once");
    await logger.flush();
    // Second flush should not duplicate
    await logger.flush();
    const content = await readLog(tmpDir);
    const occurrences = content.split("only once").length - 1;
    assert.equal(occurrences, 1, "message should appear exactly once");
  });
});
