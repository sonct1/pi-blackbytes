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

  it("all registered tools include a non-empty promptSnippet", async () => {
    const subDir = await makeTempDir();
    try {
      await writeSettings(subDir, JSON.stringify({ blackbytes: {} }));
      process.env.PI_AGENT_DIR = subDir;

      const mock = createMockPi();
      bootstrap(mock);
      mock.emit("session_start", {});
      await waitForEnabledSet();

      const { ALL_TOOL_NAMES } = await import("../../config/resource-metadata.js");
      const registeredTools = mock.calls.registerTool;

      for (const toolName of ALL_TOOL_NAMES) {
        const tool: any = registeredTools.find(
          (t: any) => (t.name ?? t.definition?.name) === toolName,
        );
        assert.ok(tool, `tool '${toolName}' should be registered`);
        assert.ok(
          typeof tool.promptSnippet === "string" && tool.promptSnippet.length > 0,
          `tool '${toolName}' must have a non-empty promptSnippet`,
        );
      }
    } finally {
      await fs.rm(subDir, { recursive: true, force: true });
    }
  });

  it("hashline_edit includes promptGuidelines array", async () => {
    const subDir = await makeTempDir();
    try {
      await writeSettings(subDir, JSON.stringify({ blackbytes: {} }));
      process.env.PI_AGENT_DIR = subDir;

      const mock = createMockPi();
      bootstrap(mock);
      mock.emit("session_start", {});
      await waitForEnabledSet();

      const registeredTools = mock.calls.registerTool;
      const hashlineEdit: any = registeredTools.find(
        (t: any) => (t.name ?? t.definition?.name) === "hashline_edit",
      );
      assert.ok(hashlineEdit, "hashline_edit should be registered");
      assert.ok(
        Array.isArray(hashlineEdit.promptGuidelines) && hashlineEdit.promptGuidelines.length >= 2,
        "hashline_edit must have promptGuidelines array with at least 2 entries",
      );
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

describe("integration: session_start with YAML sub-agents", () => {
  let tmpDir: string;
  const originalAgentDir = process.env.PI_AGENT_DIR;

  afterEach(async () => {
    _resetEnabledSet();
    _resetSubAgentRegistry();
    if (originalAgentDir === undefined) {
      delete process.env.PI_AGENT_DIR;
    } else {
      process.env.PI_AGENT_DIR = originalAgentDir;
    }
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setupWithYaml(
    yamlFiles: Record<string, string>,
    settings: Record<string, unknown> = {},
  ): Promise<{ mock: ReturnType<typeof createMockPi> }> {
    tmpDir = await makeTempDir();
    const subAgentsDir = path.join(tmpDir, "sub-agents");
    await fs.mkdir(subAgentsDir, { recursive: true });
    for (const [name, content] of Object.entries(yamlFiles)) {
      await fs.writeFile(path.join(subAgentsDir, name), content, "utf8");
    }
    await writeSettings(tmpDir, JSON.stringify({ blackbytes: settings }));
    process.env.PI_AGENT_DIR = tmpDir;
    const mock = createMockPi();
    bootstrap(mock);
    return { mock };
  }

  const VALID_YAML = [
    "name: researcher",
    "description: A research specialist",
    "system_prompt: You are a research specialist.",
  ].join("\n");

  it("registers valid YAML sub-agents alongside builtins", async () => {
    const { mock } = await setupWithYaml({ "researcher.yaml": VALID_YAML });
    mock.emit("session_start", {});
    await waitForEnabledSet();

    const enabledSet = getEnabledSet();
    // Builtin agents should be present
    assert.equal(enabledSet.subAgents.has("explore"), true);
    assert.equal(enabledSet.subAgents.has("oracle"), true);
    // YAML agent should also be present
    assert.equal(enabledSet.subAgents.has("researcher"), true);

    // delegate tool should be registered
    const toolNames = mock.calls.registerTool.map((t: any) => t.name ?? t.definition?.name);
    assert.ok(
      toolNames.includes("delegate_researcher"),
      "delegate_researcher tool should be registered",
    );
  });

  it("skips invalid YAML files without crashing startup", async () => {
    const { mock } = await setupWithYaml({
      "bad.yaml": "name: [\ninvalid yaml",
      "good.yaml": VALID_YAML,
    });
    mock.emit("session_start", {});
    await waitForEnabledSet();

    const enabledSet = getEnabledSet();
    // Good agent loaded, bad one skipped
    assert.equal(enabledSet.subAgents.has("researcher"), true);
    // Builtins still work
    assert.equal(enabledSet.subAgents.has("explore"), true);
  });

  it("skips YAML file with duplicate builtin name (no crash, no conflict in enabledSet)", async () => {
    // 'explore' is a builtin name — YAML agent with same name should be skipped with diagnostics
    const dupeYaml = [
      "name: explore",
      "description: Duplicate of builtin",
      "system_prompt: I conflict with the builtin.",
    ].join("\n");

    const { mock } = await setupWithYaml({ "explore.yaml": dupeYaml });

    // session_start should succeed — the YAML is silently skipped with diagnostics
    mock.emit("session_start", {});
    await waitForEnabledSet();

    const enabledSet = getEnabledSet();
    // Builtin explore is still present
    assert.equal(enabledSet.subAgents.has("explore"), true, "builtin explore must remain present");

    // Verify YAML diagnostics recorded the skip
    const { getYamlDiagnostics } = await import("../../sub-agents/diagnostics.js");
    const diag = getYamlDiagnostics();
    assert.ok(diag !== undefined, "diagnostics must be set");
    const skipped = diag!.skippedFiles.find((s) => s.file === "explore.yaml");
    assert.ok(skipped !== undefined, "explore.yaml must be in skippedFiles");
    assert.ok(skipped!.conflictWith?.source === "builtin", "conflict source must be builtin");
  });

  it("disables a YAML agent through config disabled_sub_agents", async () => {
    const { mock } = await setupWithYaml(
      { "researcher.yaml": VALID_YAML },
      { disabled_sub_agents: ["researcher"] },
    );
    mock.emit("session_start", {});
    await waitForEnabledSet();

    const enabledSet = getEnabledSet();
    // YAML agent should be disabled via config
    assert.equal(
      enabledSet.subAgents.has("researcher"),
      false,
      "'researcher' should be disabled via config",
    );
    // Builtins should still be present
    assert.equal(enabledSet.subAgents.has("explore"), true);
  });
});

// ---------------------------------------------------------------------------
// Idempotent startup (bead pib-vyj.1.7)
// ---------------------------------------------------------------------------

describe("integration: session_start idempotency", () => {
  let tmpDir: string;
  const originalAgentDir = process.env.PI_AGENT_DIR;

  afterEach(async () => {
    _resetEnabledSet();
    _resetSubAgentRegistry();
    if (originalAgentDir === undefined) {
      delete process.env.PI_AGENT_DIR;
    } else {
      process.env.PI_AGENT_DIR = originalAgentDir;
    }
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("two consecutive session_start calls in the same process do not throw", async () => {
    tmpDir = await makeTempDir();
    await writeSettings(tmpDir, JSON.stringify({ blackbytes: { disabled_tools: ["grep"] } }));
    process.env.PI_AGENT_DIR = tmpDir;
    const mock = createMockPi();
    bootstrap(mock);

    // First startup
    mock.emit("session_start", {});
    await waitForEnabledSet();
    const first = getEnabledSet();
    assert.equal(first.tools.has("grep"), false);

    // Mutate disk: enable grep again, disable glob.
    await writeSettings(tmpDir, JSON.stringify({ blackbytes: { disabled_tools: ["glob"] } }));

    // Second startup must succeed (no "already initialized", no duplicate
    // sub-agent metadata, no stale registry).
    mock.emit("session_start", {});
    // Allow second startup to complete.
    await new Promise<void>((r) => setTimeout(r, 300));
    const second = getEnabledSet();
    assert.equal(second.tools.has("grep"), true, "grep should be re-enabled by new config");
    assert.equal(second.tools.has("glob"), false, "glob should now be disabled");
  });

  it("second startup does not duplicate sub-agent metadata", async () => {
    tmpDir = await makeTempDir();
    await writeSettings(tmpDir, JSON.stringify({ blackbytes: {} }));
    process.env.PI_AGENT_DIR = tmpDir;
    const mock = createMockPi();
    bootstrap(mock);

    mock.emit("session_start", {});
    await waitForEnabledSet();
    const { getRegisteredSubAgents } = await import("../../config/resource-metadata.js");
    const firstCount = getRegisteredSubAgents().length;
    assert.ok(firstCount >= 4, "builtin agents must be registered");

    mock.emit("session_start", {});
    await new Promise<void>((r) => setTimeout(r, 300));
    const secondCount = getRegisteredSubAgents().length;
    assert.equal(secondCount, firstCount, "registry must not duplicate after second startup");
  });

  it("second startup does not duplicate sub-agent metadata when YAML has duplicate builtin name", async () => {
    // First startup: duplicate-name YAML is skipped (no longer throws).
    tmpDir = await makeTempDir();
    const subAgentsDir = path.join(tmpDir, "sub-agents");
    await fs.mkdir(subAgentsDir, { recursive: true });
    await fs.writeFile(
      path.join(subAgentsDir, "explore.yaml"),
      [
        "name: explore",
        "description: Duplicate of builtin",
        "system_prompt: I will conflict.",
      ].join("\n"),
      "utf8",
    );
    await writeSettings(tmpDir, JSON.stringify({ blackbytes: {} }));
    process.env.PI_AGENT_DIR = tmpDir;
    const mock = createMockPi();
    bootstrap(mock);
    mock.emit("session_start", {});
    await waitForEnabledSet();
    // Session starts fine — YAML explore is skipped with diagnostics
    const set = getEnabledSet();
    assert.equal(set.subAgents.has("explore"), true, "builtin explore should be present");

    // Second startup should also succeed without duplicating registry
    mock.emit("session_start", {});
    await new Promise<void>((r) => setTimeout(r, 300));
    const { getRegisteredSubAgents } = await import("../../config/resource-metadata.js");
    const names = getRegisteredSubAgents().map((a) => a.name);
    const dupCount = names.filter((n) => n === "explore").length;
    assert.equal(dupCount, 1, "second startup must not leave a duplicate 'explore' meta entry");
  });
});
