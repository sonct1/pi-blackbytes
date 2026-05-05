import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_TOOL_NAMES } from "../../config/resource-metadata.js";
import {
  DELEGABLE_TOOL_NAMES,
  EXTENSION_TOOL_NAMES,
  MUTATING_EXEC_TOOLS,
  PI_BUILTIN_TOOLS,
  PI_DEFAULT_TOOLS,
  READ_SEARCH_DOCS_TOOLS,
  finalizeNestedTools,
  isDelegableTool,
  isMutatingTool,
  resolveToolStrategy,
  validateBuiltinToolNames,
  validateToolNames,
} from "../delegable-tools.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("DELEGABLE_TOOL_NAMES", () => {
  it("contains all extension-managed tools", () => {
    for (const name of ALL_TOOL_NAMES) {
      assert.ok(DELEGABLE_TOOL_NAMES.has(name), `missing extension tool: ${name}`);
    }
  });

  it("contains all Pi default tools", () => {
    for (const name of PI_DEFAULT_TOOLS) {
      assert.ok(DELEGABLE_TOOL_NAMES.has(name), `missing Pi default: ${name}`);
    }
  });

  it("does not contain delegate_* tools", () => {
    for (const name of DELEGABLE_TOOL_NAMES) {
      assert.ok(!name.startsWith("delegate_"), `delegate tool leaked: ${name}`);
    }
  });
});

describe("isDelegableTool", () => {
  it("returns true for extension tools", () => {
    assert.equal(isDelegableTool("ast_search"), true);
    assert.equal(isDelegableTool("glob"), true);
  });

  it("returns true for Pi built-ins", () => {
    assert.equal(isDelegableTool("read"), true);
    assert.equal(isDelegableTool("grep"), true);
  });

  it("returns false for unknown tools", () => {
    assert.equal(isDelegableTool("nonexistent_tool"), false);
    assert.equal(isDelegableTool("delegate_explore"), false);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validateToolNames", () => {
  it("partitions known and unknown names", () => {
    const result = validateToolNames(["read", "grep", "fake_tool"]);
    assert.deepEqual(result.valid, ["read", "grep"]);
    assert.deepEqual(result.unknown, ["fake_tool"]);
  });

  it("rejects delegate_* as unknown", () => {
    const result = validateToolNames(["read", "delegate_explore"]);
    assert.deepEqual(result.valid, ["read"]);
    assert.deepEqual(result.unknown, ["delegate_explore"]);
  });

  it("returns all valid for a clean list", () => {
    const result = validateToolNames(["read", "grep", "glob"]);
    assert.deepEqual(result.valid, ["read", "grep", "glob"]);
    assert.deepEqual(result.unknown, []);
  });

  it("handles empty input", () => {
    const result = validateToolNames([]);
    assert.deepEqual(result.valid, []);
    assert.deepEqual(result.unknown, []);
  });
});

describe("validateBuiltinToolNames", () => {
  it("returns valid names for a clean list", () => {
    const result = validateBuiltinToolNames(["read", "grep", "glob", "ast_search"]);
    assert.deepEqual(result, ["read", "grep", "glob", "ast_search"]);
  });

  it("throws on unknown names", () => {
    assert.throws(
      () => validateBuiltinToolNames(["read", "nonexistent"]),
      /Unknown tool names in builtin allowlist: nonexistent/,
    );
  });

  it("throws on delegate_* names", () => {
    assert.throws(
      () => validateBuiltinToolNames(["read", "delegate_oracle"]),
      /Unknown tool names in builtin allowlist: delegate_oracle/,
    );
  });
});

// ---------------------------------------------------------------------------
// Resolution strategies
// ---------------------------------------------------------------------------

describe("resolveToolStrategy", () => {
  const enabledTools = new Set(["grep", "glob", "ast_search", "web_search"]);

  describe("allowlist", () => {
    it("returns the explicit list unchanged", () => {
      const result = resolveToolStrategy(
        { kind: "allowlist", tools: ["read", "grep", "glob"] },
        enabledTools,
      );
      assert.deepEqual(result, ["read", "grep", "glob"]);
    });

    it("returns empty for empty allowlist", () => {
      const result = resolveToolStrategy({ kind: "allowlist", tools: [] }, enabledTools);
      assert.deepEqual(result, []);
    });
  });

  describe("denylist", () => {
    it("returns enabled + Pi defaults minus denied tools", () => {
      const result = resolveToolStrategy({ kind: "denylist", tools: ["web_search"] }, enabledTools);
      assert.ok(result.includes("grep"));
      assert.ok(result.includes("read")); // Pi default included
      assert.ok(!result.includes("web_search")); // denied
    });

    it("excludes delegate_* even if in enabledTools", () => {
      const withDelegate = new Set([...enabledTools, "delegate_explore"]);
      const result = resolveToolStrategy({ kind: "denylist", tools: [] }, withDelegate);
      assert.ok(!result.includes("delegate_explore"));
    });

    it("returns all non-denied for empty denylist", () => {
      const result = resolveToolStrategy({ kind: "denylist", tools: [] }, enabledTools);
      // Should include all enabled tools + Pi defaults
      for (const t of enabledTools) {
        assert.ok(result.includes(t), `missing enabled tool: ${t}`);
      }
      for (const t of PI_DEFAULT_TOOLS) {
        assert.ok(result.includes(t), `missing Pi default: ${t}`);
      }
    });
  });

  describe("all-except-delegates", () => {
    it("returns enabled tools minus delegate_*", () => {
      const withDelegate = new Set([...enabledTools, "delegate_explore", "delegate_general"]);
      const result = resolveToolStrategy({ kind: "all-except-delegates" }, withDelegate);
      assert.ok(result.includes("grep"));
      assert.ok(result.includes("glob"));
      assert.ok(!result.includes("delegate_explore"));
      assert.ok(!result.includes("delegate_general"));
    });

    it("does not include Pi defaults", () => {
      const result = resolveToolStrategy({ kind: "all-except-delegates" }, enabledTools);
      assert.ok(!result.includes("read")); // Pi default NOT included
      assert.ok(result.includes("grep")); // from mock enabledTools set
    });

    it("returns all enabled when no delegates present", () => {
      const result = resolveToolStrategy({ kind: "all-except-delegates" }, enabledTools);
      assert.deepEqual([...result].sort(), [...enabledTools].sort());
    });
  });
});

// ---------------------------------------------------------------------------
// Tool classes (mutability classification)
// ---------------------------------------------------------------------------

describe("tool classes", () => {
  it("EXTENSION_TOOL_NAMES mirrors ALL_TOOL_NAMES", () => {
    for (const name of ALL_TOOL_NAMES) {
      assert.ok(EXTENSION_TOOL_NAMES.has(name), `missing extension tool: ${name}`);
    }
    assert.equal(EXTENSION_TOOL_NAMES.size, ALL_TOOL_NAMES.length);
  });

  it("PI_BUILTIN_TOOLS matches the Pi CLI compatibility evidence", () => {
    // Source of truth: PI_CLI_COMPATIBILITY_EVIDENCE.acceptedBuiltinTools in
    // src/sub-agents/__tests__/runner.test.ts.
    assert.deepEqual([...PI_BUILTIN_TOOLS].sort(), [
      "bash",
      "edit",
      "find",
      "grep",
      "ls",
      "read",
      "write",
    ]);
  });

  it("PI_DEFAULT_TOOLS is a subset of PI_BUILTIN_TOOLS", () => {
    for (const name of PI_DEFAULT_TOOLS) {
      assert.ok(PI_BUILTIN_TOOLS.has(name), `default not in Pi builtins: ${name}`);
    }
  });

  it("READ_SEARCH_DOCS_TOOLS contains expected read/search/docs tools", () => {
    const expected = [
      "read",
      "grep",
      "find",
      "ls",
      "glob",
      "ast_search",
      "web_search",
      "web_fetch",
      "docs_resolve",
      "docs_query",
      "gh_search",
    ];
    for (const name of expected) {
      assert.ok(READ_SEARCH_DOCS_TOOLS.has(name), `missing read/search/docs: ${name}`);
    }
  });

  it("MUTATING_EXEC_TOOLS contains exactly the write/edit/exec tools", () => {
    assert.deepEqual([...MUTATING_EXEC_TOOLS].sort(), [
      "ast_replace",
      "bash",
      "edit",
      "hashline_edit",
      "write",
    ]);
  });

  it("READ_SEARCH_DOCS_TOOLS and MUTATING_EXEC_TOOLS are disjoint", () => {
    for (const name of READ_SEARCH_DOCS_TOOLS) {
      assert.ok(!MUTATING_EXEC_TOOLS.has(name), `tool classified twice: ${name}`);
    }
  });

  it("isMutatingTool reflects MUTATING_EXEC_TOOLS membership", () => {
    assert.equal(isMutatingTool("write"), true);
    assert.equal(isMutatingTool("bash"), true);
    assert.equal(isMutatingTool("hashline_edit"), true);
    assert.equal(isMutatingTool("ast_replace"), true);
    assert.equal(isMutatingTool("read"), false);
    assert.equal(isMutatingTool("grep"), false);
  });
});

// ---------------------------------------------------------------------------
// Nested-tool finalizer
// ---------------------------------------------------------------------------

describe("finalizeNestedTools", () => {
  it("deduplicates input names", () => {
    const result = finalizeNestedTools({
      tools: ["read", "grep", "read", "grep", "glob"],
      globalDisabled: new Set(),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["glob", "grep", "read"]);
  });

  it("sorts the result deterministically", () => {
    const result = finalizeNestedTools({
      tools: ["web_search", "read", "glob", "ast_search"],
      globalDisabled: new Set(),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["ast_search", "glob", "read", "web_search"]);
  });

  it("strict mode throws on unknown names BEFORE returning a result", () => {
    assert.throws(
      () =>
        finalizeNestedTools({
          tools: ["read", "nonexistent_tool"],
          globalDisabled: new Set(),
          mutability: "read-only",
          mode: "strict",
          context: "sub-agent test",
        }),
      /Unknown or delegate tool names in nested allowlist \(sub-agent test\): nonexistent_tool/,
    );
  });

  it("strict mode throws on delegate_* names", () => {
    assert.throws(
      () =>
        finalizeNestedTools({
          tools: ["read", "delegate_oracle"],
          globalDisabled: new Set(),
          mutability: "read-only",
          mode: "strict",
        }),
      /delegate_oracle/,
    );
  });

  it("lenient mode silently drops unknown and delegate_* names", () => {
    const result = finalizeNestedTools({
      tools: ["read", "nonexistent_tool", "delegate_explore", "grep"],
      globalDisabled: new Set(),
      mutability: "read-only",
      mode: "lenient",
    });
    assert.deepEqual(result.tools, ["grep", "read"]);
    assert.deepEqual([...result.droppedUnknown].sort(), ["delegate_explore", "nonexistent_tool"]);
  });

  it("applies the global disabled_tools denylist to extension tools", () => {
    const result = finalizeNestedTools({
      tools: ["read", "grep", "glob", "ast_search"],
      globalDisabled: new Set(["glob", "ast_search"]),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["grep", "read"]);
    assert.deepEqual([...result.droppedGlobalDisabled].sort(), ["ast_search", "glob"]);
  });

  it("applies the global disabled_tools denylist to Pi built-ins", () => {
    const result = finalizeNestedTools({
      tools: ["read", "bash", "write"],
      globalDisabled: new Set(["bash", "write"]),
      mutability: "full-access",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["read"]);
    assert.deepEqual([...result.droppedGlobalDisabled].sort(), ["bash", "write"]);
  });

  it("strips mutating/exec tools for read-only agents", () => {
    const result = finalizeNestedTools({
      tools: ["read", "grep", "write", "bash", "hashline_edit", "ast_replace"],
      globalDisabled: new Set(),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["grep", "read"]);
    assert.deepEqual([...result.droppedMutability].sort(), [
      "ast_replace",
      "bash",
      "hashline_edit",
      "write",
    ]);
  });

  it("keeps mutating/exec tools for full-access agents", () => {
    const result = finalizeNestedTools({
      tools: ["read", "write", "bash", "hashline_edit"],
      globalDisabled: new Set(),
      mutability: "full-access",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["bash", "hashline_edit", "read", "write"]);
    assert.deepEqual(result.droppedMutability, []);
  });

  it("never lets delegate_* reach the final tools array", () => {
    const result = finalizeNestedTools({
      tools: ["read", "delegate_explore", "delegate_oracle"],
      globalDisabled: new Set(),
      mutability: "full-access",
      mode: "lenient",
    });
    for (const t of result.tools) {
      assert.ok(!t.startsWith("delegate_"), `delegate leaked: ${t}`);
    }
  });

  it("applies global denylist before mutability filtering", () => {
    // `write` is BOTH globally disabled and mutating; should appear in
    // droppedGlobalDisabled (precedes mutability check).
    const result = finalizeNestedTools({
      tools: ["read", "write", "bash"],
      globalDisabled: new Set(["write"]),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, ["read"]);
    assert.deepEqual(result.droppedGlobalDisabled, ["write"]);
    assert.deepEqual(result.droppedMutability, ["bash"]);
  });

  it("returns empty result for empty input", () => {
    const result = finalizeNestedTools({
      tools: [],
      globalDisabled: new Set(),
      mutability: "read-only",
      mode: "strict",
    });
    assert.deepEqual(result.tools, []);
    assert.deepEqual(result.droppedUnknown, []);
    assert.deepEqual(result.droppedGlobalDisabled, []);
    assert.deepEqual(result.droppedMutability, []);
  });
});
