import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapReasoningEffort } from "../before-provider-request.js";

describe("mapReasoningEffort", () => {
  it("Claude low → thinking disabled", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "low", "claude");
    assert.deepEqual(payload.thinking, { type: "disabled" });
  });

  it("Claude high → thinking enabled with large budget", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "high", "claude");
    assert.deepEqual(payload.thinking, { type: "enabled", budget_tokens: 50000 });
  });

  it("Claude medium → thinking enabled with small budget", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "medium", "claude");
    assert.deepEqual(payload.thinking, { type: "enabled", budget_tokens: 5000 });
  });

  it("GPT → sets reasoning_effort directly", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "high", "gpt");
    assert.equal(payload.reasoning_effort, "high");
  });

  it("Gemini → sets thinking_config", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "medium", "gemini");
    assert.ok(payload.thinking_config !== undefined);
    assert.equal((payload.thinking_config as Record<string, unknown>).thinking_mode, "enabled");
  });

  it("already-set param → no-op (idempotent)", () => {
    const existingThinking = { type: "enabled", budget_tokens: 1000 };
    const payload: Record<string, unknown> = { thinking: existingThinking };
    mapReasoningEffort(payload, "high", "claude");
    assert.deepEqual(payload.thinking, existingThinking);
  });

  it("unknown family → no-op", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, "high", "other");
    assert.deepEqual(payload, {});
  });

  it("undefined reasoningEffort → no-op", () => {
    const payload: Record<string, unknown> = {};
    mapReasoningEffort(payload, undefined, "claude");
    assert.deepEqual(payload, {});
  });
});
