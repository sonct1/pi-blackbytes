import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { _resetEnabledSet, initEnabledSet } from "../../config/enabled-set.js";
import { parseBlackbytesConfig } from "../../config/schema.js";
import { injectAvailableResources } from "../before-agent-start.js";

function makeConfig(overrides: Record<string, unknown> = {}) {
  const result = parseBlackbytesConfig(overrides);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return result.value;
}

beforeEach(() => {
  _resetEnabledSet();
});

describe("injectAvailableResources", () => {
  it("first turn: appends resources block to system prompt", () => {
    initEnabledSet(makeConfig());
    const original = "You are a helpful assistant.";
    const result = injectAvailableResources(original);

    assert.ok(result.startsWith(original), "original prompt preserved at start");
    assert.ok(result.includes("<!-- pi-blackbytes:resources:start -->"), "start sentinel present");
    assert.ok(result.includes("<!-- pi-blackbytes:resources:end -->"), "end sentinel present");
    assert.ok(result.includes("<available_resources>"), "XML tag present");
    assert.ok(result.includes("hashline_edit"), "bundled tool listed");
  });

  it("second turn: replaces existing block in-place (no duplicates)", () => {
    initEnabledSet(makeConfig());
    const original = "You are a helpful assistant.";
    const first = injectAvailableResources(original);
    const second = injectAvailableResources(first);

    const startCount = (second.match(/<!-- pi-blackbytes:resources:start -->/g) ?? []).length;
    const endCount = (second.match(/<!-- pi-blackbytes:resources:end -->/g) ?? []).length;
    assert.equal(startCount, 1, "only one start sentinel");
    assert.equal(endCount, 1, "only one end sentinel");
    assert.ok(second.startsWith(original), "original text still at start");
  });

  it("disabled tool is excluded from resources block", () => {
    initEnabledSet(makeConfig({ disabled_tools: ["grep_app_search_github"] }));
    const result = injectAvailableResources("prompt");
    assert.ok(!result.includes("grep_app_search_github"), "disabled tool not listed");
    assert.ok(result.includes("hashline_edit"), "other tools still present");
  });

  it("disabled sub-agent is excluded from resources block", () => {
    initEnabledSet(makeConfig({ disabled_sub_agents: ["oracle"] }));
    const result = injectAvailableResources("prompt");
    assert.ok(!result.includes("oracle"), "disabled agent not listed");
    assert.ok(result.includes("explore"), "other agents still present");
  });
});
