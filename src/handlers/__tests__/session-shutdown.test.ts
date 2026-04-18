import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { _resetEnabledSet, initEnabledSet } from "../../config/enabled-set.js";
import { parseBlackbytesConfig } from "../../config/schema.js";
import { handleSessionShutdown } from "../index.js";

function makeConfig(overrides: Record<string, unknown> = {}) {
  const result = parseBlackbytesConfig(overrides);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return result.value;
}

describe("handleSessionShutdown", () => {
  beforeEach(() => {
    _resetEnabledSet();
    initEnabledSet(makeConfig());
  });

  it("flushes pending writes on shutdown without throwing", async () => {
    await assert.doesNotReject(handleSessionShutdown(), "flush should not throw");
  });

  it("second shutdown call also resolves without error", async () => {
    await assert.doesNotReject(
      Promise.all([handleSessionShutdown(), handleSessionShutdown()]),
      "concurrent shutdowns should not throw",
    );
  });
});
