import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { bootstrap } from "../../bootstrap.js";
import { _resetEnabledSet, getEnabledSet } from "../../config/enabled-set.js";
import { _resetSubAgentRegistry } from "../../config/resource-metadata.js";
import { createMockPi } from "../../test-utils/pi-mock.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "pi-blackbytes-test-"));
}

async function writeSettings(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, "settings.json"), content, "utf8");
}

/**
 * Poll until EnabledSet is initialized (or timeout).
 * Required because bootstrap wraps handlers with `.catch()` (returns void),
 * so emit() doesn't return a Promise we can await.
 */
async function waitForEnabledSet(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      getEnabledSet();
      return; // initialized successfully
    } catch {
      await new Promise<void>((r) => setTimeout(r, 20));
    }
  }
  throw new Error("Timed out waiting for EnabledSet to be initialized");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: session_start", () => {
  let tmpDir: string;
  const originalAgentDir = process.env.PI_AGENT_DIR;

  before(async () => {
    tmpDir = await makeTempDir();
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Restore env
    if (originalAgentDir === undefined) {
      delete process.env.PI_AGENT_DIR;
    } else {
      process.env.PI_AGENT_DIR = originalAgentDir;
    }
  });

  afterEach(() => {
    _resetEnabledSet();
    _resetSubAgentRegistry();
    delete process.env.PI_AGENT_DIR;
  });

  it("success path: loads valid blackbytes config and initialises enabled-set", async () => {
    // Arrange
    const subDir = await makeTempDir();
    try {
      const settings = {
        blackbytes: {
          disabled_tools: ["grep"],
          disabled_sub_agents: [],
        },
      };
      await writeSettings(subDir, JSON.stringify(settings));
      process.env.PI_AGENT_DIR = subDir;

      const mock = createMockPi();

      // Act
      bootstrap(mock);

      // session_start event should have been registered
      const sessionStartReg = mock.calls.on.find((c) => c.event === "session_start");
      assert.ok(sessionStartReg, "bootstrap should register a session_start handler");

      // Trigger event; wrap() returns void, so we poll for completion
      mock.emit("session_start", {});
      await waitForEnabledSet();

      // Assert: enabled-set was initialised
      const enabledSet = getEnabledSet();
      assert.ok(enabledSet, "enabledSet should be initialised after session_start");

      // "grep" was in disabled_tools, so it must not appear in tools
      assert.equal(enabledSet.tools.has("grep"), false, "'grep' should be disabled");

      // Other tools should still be present
      assert.equal(enabledSet.tools.has("glob"), true, "'glob' should still be enabled");
    } finally {
      await fs.rm(subDir, { recursive: true, force: true });
    }
  });

  it("malformed path: invalid JSON in settings uses defaults and does not throw", async () => {
    // Arrange
    const subDir = await makeTempDir();
    try {
      await writeSettings(subDir, "{ this is not valid JSON }}}");
      process.env.PI_AGENT_DIR = subDir;

      const mock = createMockPi();

      // Act — handler must not throw (errors are swallowed by wrap())
      bootstrap(mock);
      mock.emit("session_start", {});
      await waitForEnabledSet();

      // Assert: handler completed gracefully; enabled-set defaults are used
      const enabledSet = getEnabledSet();
      assert.ok(enabledSet, "enabledSet should be initialised with defaults");

      // With default config all DEFAULT_TOOLS should be present
      assert.equal(enabledSet.tools.has("glob"), true, "'glob' should be in default tool set");
      assert.equal(enabledSet.tools.has("grep"), true, "'grep' should be in default tool set");
    } finally {
      await fs.rm(subDir, { recursive: true, force: true });
    }
  });
});
