import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "../redact.js";

describe("redactSecrets", () => {
  it("redacts API_KEY=value pattern, preserving key name", () => {
    const result = redactSecrets("OPENAI_API_KEY=supersecret123");
    assert.match(result, /OPENAI_API_KEY=\[REDACTED\]/);
    assert.doesNotMatch(result, /supersecret123/);
  });

  it("redacts Bearer token pattern, preserving Bearer prefix", () => {
    const result = redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");
    assert.match(result, /Bearer \[REDACTED\]/);
    assert.doesNotMatch(result, /eyJhbGciOiJIUzI1NiJ9/);
  });

  it("redacts well-known credential prefixes (sk-, ghp-, etc.)", () => {
    const result = redactSecrets("ghp_1234567890abcdefghijklmno");
    assert.doesNotMatch(result, /ghp_1234567890abcdefghijklmno/);
    assert.match(result, /\[REDACTED\]/);
  });

  it("redacts JSON api_key: value pattern", () => {
    const result = redactSecrets('{"api_key": "mysupersecretkey"}');
    assert.doesNotMatch(result, /mysupersecretkey/);
    assert.match(result, /\[REDACTED\]/);
  });

  it("redacts quoted values (single and double quotes)", () => {
    const r1 = redactSecrets("TOKEN='quoted-secret'");
    assert.doesNotMatch(r1, /quoted-secret/);
    const r2 = redactSecrets('SECRET="double-quoted-val"');
    assert.doesNotMatch(r2, /double-quoted-val/);
  });

  it("preserves non-secret text unchanged", () => {
    const text = "Hello, world! This is a normal message with no secrets.";
    assert.equal(redactSecrets(text), text);
  });

  it("handles empty string", () => {
    assert.equal(redactSecrets(""), "");
  });

  it("handles whitespace-only strings", () => {
    assert.equal(redactSecrets("   "), "   ");
  });
});
