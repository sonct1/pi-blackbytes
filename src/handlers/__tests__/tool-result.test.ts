import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ToolResultEvent, processToolResult } from "../tool-result.js";

const cfg = { hashline_edit: true };
const cfgOff = { hashline_edit: false };

describe("processToolResult — read branch", () => {
  it("happy path: prepends LINE#ID anchors to text content", () => {
    const event: ToolResultEvent = {
      toolName: "read",
      content: [{ type: "text", text: "hello\nworld" }],
    };
    const result = processToolResult(event, cfg);
    assert.ok(result !== null);
    const text = result!.content![0].text!;
    const lines = text.split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^1#[A-Z]{2}\|hello$/);
    assert.match(lines[1], /^2#[A-Z]{2}\|world$/);
  });

  it("isError: returns null (preserved verbatim)", () => {
    const event: ToolResultEvent = {
      toolName: "read",
      isError: true,
      content: [{ type: "text", text: "err" }],
    };
    assert.equal(processToolResult(event, cfg), null);
  });

  it("non-text blocks are skipped (unchanged)", () => {
    const event: ToolResultEvent = {
      toolName: "read",
      content: [{ type: "image" }],
    };
    assert.equal(processToolResult(event, cfg), null);
  });

  it("hashline_edit=false: returns null", () => {
    const event: ToolResultEvent = {
      toolName: "read",
      content: [{ type: "text", text: "hi" }],
    };
    assert.equal(processToolResult(event, cfgOff), null);
  });

  it("malformed input (null content): returns null safely", () => {
    const event: ToolResultEvent = {
      toolName: "read",
      content: undefined,
    };
    assert.equal(processToolResult(event, cfg), null);
  });
});

describe("processToolResult — write branch", () => {
  it("happy path: replaces content with line count summary", () => {
    const event: ToolResultEvent = {
      toolName: "write",
      content: [{ type: "text", text: "line1\nline2\nline3" }],
    };
    const result = processToolResult(event, cfg);
    assert.ok(result !== null);
    assert.equal(result!.content![0].text, "File written successfully. 3 lines written.");
  });

  it("isError: returns null", () => {
    const event: ToolResultEvent = {
      toolName: "write",
      isError: true,
      content: [{ type: "text", text: "oops" }],
    };
    assert.equal(processToolResult(event, cfg), null);
  });

  it("hashline_edit=false: returns null", () => {
    const event: ToolResultEvent = {
      toolName: "write",
      content: [{ type: "text", text: "a\nb" }],
    };
    assert.equal(processToolResult(event, cfgOff), null);
  });

  it("line count accuracy for multi-line content", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const event: ToolResultEvent = {
      toolName: "write",
      content: [{ type: "text", text: lines }],
    };
    const result = processToolResult(event, cfg);
    assert.ok(result !== null);
    assert.equal(result!.content![0].text, "File written successfully. 100 lines written.");
  });

  it("single line content counts as 1 line", () => {
    const event: ToolResultEvent = {
      toolName: "write",
      content: [{ type: "text", text: "just one line" }],
    };
    const result = processToolResult(event, cfg);
    assert.ok(result !== null);
    assert.equal(result!.content![0].text, "File written successfully. 1 lines written.");
  });
});
