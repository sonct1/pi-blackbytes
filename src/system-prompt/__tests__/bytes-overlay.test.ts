import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  SUB_AGENTS,
  _resetSubAgentRegistry,
  registerSubAgentMeta,
} from "../../config/resource-metadata.js";
import { createBytesPromptRenderContext } from "../bytes/shared.js";
import { renderBytesPrompt } from "../loader.js";

function renderPrompt(
  family: "claude" | "gpt" | "gemini",
  enabledTools: string[],
  enabledSubAgents: string[],
): string {
  return renderBytesPrompt(
    createBytesPromptRenderContext(family, new Set(enabledTools), new Set(enabledSubAgents)),
  );
}

beforeEach(() => {
  _resetSubAgentRegistry();
  for (const agent of SUB_AGENTS) registerSubAgentMeta(agent);
});

describe("bytes overlay rendering", () => {
  it("renders full-capability sessions across model families", () => {
    for (const family of ["claude", "gpt", "gemini"] as const) {
      const prompt = renderPrompt(
        family,
        ["hashline_edit", "web_search", "web_fetch", "docs_resolve", "docs_query", "gh_search"],
        ["explore", "oracle", "librarian", "general", "reviewer"],
      );

      assert.ok(prompt.includes("Precedence"));
      assert.ok(prompt.includes("Session Capabilities"));
      assert.ok(prompt.includes("Hashline Edit Workflow"));
      assert.ok(prompt.includes("Default: work directly"));
      assert.ok(prompt.includes("Documentation lookup may be available"));
      assert.ok(prompt.includes("Web lookup capabilities may be available"));
      assert.ok(prompt.includes("GitHub code search may be available"));
      assert.ok(prompt.includes("`explore`"));
      assert.ok(prompt.includes("`oracle`"));
      assert.ok(prompt.includes("`general`"));
      assert.ok(prompt.includes("`reviewer`"));
    }
  });

  it("renders librarian-specific trigger guidance only when librarian is enabled", () => {
    const withLibrarian = renderPrompt("claude", [], ["librarian"]);
    assert.ok(
      withLibrarian.includes("Consider `librarian` only for non-trivial external research"),
    );
    assert.ok(withLibrarian.includes("`librarian`"));
    assert.ok(withLibrarian.includes("3+ external sources"));

    const withoutLibrarian = renderPrompt(
      "claude",
      ["web_search", "web_fetch", "docs_resolve", "docs_query", "gh_search"],
      ["explore"],
    );
    assert.ok(!withoutLibrarian.includes("Consider `librarian` only for non-trivial"));
  });

  it("renders sub-agent trigger guidance only for enabled sub-agents", () => {
    const withReviewer = renderPrompt("claude", [], ["reviewer"]);
    assert.ok(withReviewer.includes("`reviewer`"));
    assert.ok(!withReviewer.includes("`oracle`"));

    const withOracle = renderPrompt("claude", [], ["oracle"]);
    assert.ok(withOracle.includes("`oracle`"));
    assert.ok(!withOracle.includes("`reviewer`"));

    const withExplore = renderPrompt("claude", [], ["explore"]);
    assert.ok(withExplore.includes("`explore`"));
    assert.ok(!withExplore.includes("`general`"));

    const withGeneral = renderPrompt("claude", [], ["general"]);
    assert.ok(withGeneral.includes("`general`"));
    assert.ok(!withGeneral.includes("`explore`"));
  });

  it("omits delegation guidance when sub-agents are unavailable", () => {
    const prompt = renderPrompt(
      "claude",
      ["hashline_edit", "web_search", "web_fetch", "docs_resolve", "docs_query", "gh_search"],
      [],
    );

    assert.ok(!prompt.includes("Default: work directly"));
    assert.ok(!prompt.includes("`explore`"));
    assert.ok(!prompt.includes("`oracle`"));
    assert.ok(!prompt.includes("`general`"));
    assert.ok(!prompt.includes("`reviewer`"));
    assert.ok(prompt.includes("Hashline Edit Workflow"));
  });

  it("omits hashline workflow when hashline_edit is unavailable", () => {
    const prompt = renderPrompt(
      "claude",
      ["web_search", "web_fetch", "docs_resolve", "docs_query", "gh_search"],
      ["explore"],
    );

    assert.ok(!prompt.includes("Hashline Edit Workflow"));
    assert.ok(prompt.includes("Default: work directly"));
  });

  it("omits docs, web, and code-search guidance when backing capabilities are unavailable", () => {
    const prompt = renderPrompt("claude", ["hashline_edit"], ["explore"]);

    assert.ok(!prompt.includes("Documentation lookup may be available"));
    assert.ok(!prompt.includes("Web lookup capabilities may be available"));
    assert.ok(!prompt.includes("GitHub code search may be available"));
    assert.ok(prompt.includes("Hashline Edit Workflow"));
  });

  it("renders a minimal safe fallback overlay when no capabilities are enabled", () => {
    const prompt = renderPrompt("claude", [], []);

    assert.ok(prompt.includes("Precedence"));
    assert.ok(prompt.includes("Hard Boundaries"));
    assert.ok(prompt.includes("Completion"));
    assert.ok(!prompt.includes("Hashline Edit Workflow"));
    assert.ok(!prompt.includes("Default: work directly"));
    assert.ok(!prompt.includes("Documentation lookup may be available"));
    assert.ok(!prompt.includes("Web lookup capabilities may be available"));
    assert.ok(!prompt.includes("GitHub code search may be available"));
  });
});
