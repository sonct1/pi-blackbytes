import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BlackbytesConfigSchema, parseBlackbytesConfig } from "../schema.js";

describe("BlackbytesConfigSchema", () => {
  it("empty object validates with all defaults applied", () => {
    const result = parseBlackbytesConfig({});
    assert.ok(result.ok);
    if (result.ok) {
      assert.deepEqual(result.value.disabled_tools, []);
      assert.deepEqual(result.value.disabled_sub_agents, []);
      assert.equal(result.value.hashline_edit, true);
      assert.equal(result.value.copilot_initiator_header, true);
      assert.equal(result.value.websearch, undefined);
      assert.equal(result.value.context7, undefined);
      assert.equal(result.value.sub_agents, undefined);
    }
  });

  it("invalid types produce clear error messages", () => {
    const result = parseBlackbytesConfig({ hashline_edit: "yes" });
    assert.ok(!result.ok);
    if (!result.ok) {
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes("hashline_edit"));
    }
  });

  it("unknown keys are preserved (not stripped)", () => {
    const result = parseBlackbytesConfig({ unknown_key: "hello" });
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal((result.value as Record<string, unknown>).unknown_key, "hello");
    }
  });

  it("valid full config parses correctly", () => {
    const input = {
      disabled_tools: ["tool1", "tool2"],
      disabled_sub_agents: ["explore", "oracle"],
      hashline_edit: false,
      copilot_initiator_header: false,
      websearch: { provider: "exa", exa_api_key: "key123" },
      context7: { api_key: "c7key" },
      sub_agents: {
        myAgent: { model: "gpt-4o", reasoningEffort: "high", temperature: 0.7 },
      },
    };
    const result = parseBlackbytesConfig(input);
    assert.ok(result.ok);
    if (result.ok) {
      assert.deepEqual(result.value.disabled_tools, ["tool1", "tool2"]);
      assert.deepEqual(result.value.disabled_sub_agents, ["explore", "oracle"]);
      assert.equal(result.value.hashline_edit, false);
      assert.equal(result.value.websearch?.provider, "exa");
      assert.equal(result.value.websearch?.exa_api_key, "key123");
      assert.equal(result.value.context7?.api_key, "c7key");
      assert.equal(result.value.sub_agents?.myAgent?.model, "gpt-4o");
    }
  });

  it("enum validation works for disabled_sub_agents", () => {
    const result = parseBlackbytesConfig({ disabled_sub_agents: ["invalid_agent"] });
    assert.ok(!result.ok);
    if (!result.ok) {
      assert.ok(result.errors.length > 0);
    }

    const validResult = parseBlackbytesConfig({
      disabled_sub_agents: ["explore", "librarian", "general"],
    });
    assert.ok(validResult.ok);
  });
});
