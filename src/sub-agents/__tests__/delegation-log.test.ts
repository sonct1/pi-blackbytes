import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getDelegationLog,
  getDelegationSummary,
  logDelegation,
  resetDelegationLog,
} from "../delegation-log.js";

afterEach(() => {
  resetDelegationLog();
});

describe("logDelegation / getDelegationLog", () => {
  it("starts empty", () => {
    assert.deepEqual(getDelegationLog(), []);
  });

  it("appends entries", () => {
    logDelegation({
      agent: "explore",
      startedAt: 1000,
      durationMs: 500,
      success: true,
      toolCallCount: 3,
      outputChars: 120,
    });
    const log = getDelegationLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].agent, "explore");
    assert.equal(log[0].success, true);
    assert.equal(log[0].toolCallCount, 3);
  });

  it("returns a readonly view (mutations do not affect internal state)", () => {
    logDelegation({
      agent: "oracle",
      startedAt: 2000,
      durationMs: 800,
      success: false,
      toolCallCount: 1,
      outputChars: 50,
    });
    const view = getDelegationLog();
    assert.equal(view.length, 1);
    // Casting away readonly to verify the internal array is not the same ref
    // exposed directly — pushing to the view should not grow the internal log.
    (view as unknown as unknown[]).push({} as never);
    // The internal log via a fresh call still has just 1 entry
    assert.equal(getDelegationLog().length, 1);
  });
});

describe("resetDelegationLog", () => {
  it("clears all entries", () => {
    logDelegation({
      agent: "general",
      startedAt: 3000,
      durationMs: 200,
      success: true,
      toolCallCount: 5,
      outputChars: 300,
    });
    assert.equal(getDelegationLog().length, 1);
    resetDelegationLog();
    assert.equal(getDelegationLog().length, 0);
  });
});

describe("getDelegationSummary", () => {
  it("returns empty message when no entries", () => {
    assert.equal(getDelegationSummary(), "No delegations this session.");
  });

  it("formats single agent summary correctly", () => {
    logDelegation({
      agent: "explore",
      startedAt: 1000,
      durationMs: 1000,
      success: true,
      toolCallCount: 4,
      outputChars: 200,
    });
    const summary = getDelegationSummary();
    assert.match(summary, /Delegations this session: 1 total/);
    assert.match(summary, /explore: 1x \(1\/1 ok, avg 1000ms\)/);
  });

  it("aggregates multiple calls to the same agent", () => {
    logDelegation({
      agent: "oracle",
      startedAt: 1000,
      durationMs: 2000,
      success: true,
      toolCallCount: 2,
      outputChars: 100,
    });
    logDelegation({
      agent: "oracle",
      startedAt: 3000,
      durationMs: 4000,
      success: false,
      toolCallCount: 1,
      outputChars: 50,
    });
    const summary = getDelegationSummary();
    assert.match(summary, /Delegations this session: 2 total/);
    // avg of 2000 and 4000 = 3000ms; 1 success out of 2
    assert.match(summary, /oracle: 2x \(1\/2 ok, avg 3000ms\)/);
  });

  it("includes cost in summary when non-zero", () => {
    logDelegation({
      agent: "librarian",
      startedAt: 1000,
      durationMs: 500,
      success: true,
      toolCallCount: 3,
      outputChars: 80,
      cost: 0.0025,
    });
    const summary = getDelegationSummary();
    assert.match(summary, /\$0\.0025/);
  });

  it("omits cost when zero or absent", () => {
    logDelegation({
      agent: "general",
      startedAt: 1000,
      durationMs: 300,
      success: true,
      toolCallCount: 2,
      outputChars: 60,
    });
    const summary = getDelegationSummary();
    assert.doesNotMatch(summary, /\$/);
  });

  it("sorts agents alphabetically", () => {
    logDelegation({
      agent: "oracle",
      startedAt: 1000,
      durationMs: 100,
      success: true,
      toolCallCount: 1,
      outputChars: 10,
    });
    logDelegation({
      agent: "explore",
      startedAt: 2000,
      durationMs: 200,
      success: true,
      toolCallCount: 1,
      outputChars: 10,
    });
    logDelegation({
      agent: "general",
      startedAt: 3000,
      durationMs: 300,
      success: true,
      toolCallCount: 1,
      outputChars: 10,
    });
    const lines = getDelegationSummary().split("\n");
    // Lines after the header should be explore, general, oracle
    assert.match(lines[1], /explore/);
    assert.match(lines[2], /general/);
    assert.match(lines[3], /oracle/);
  });
});
