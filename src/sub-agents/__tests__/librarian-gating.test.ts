import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  SUB_AGENTS,
  _resetSubAgentRegistry,
  registerSubAgentMeta,
} from "../../config/resource-metadata.js";
import { createBytesPromptRenderContext } from "../../system-prompt/bytes/shared.js";
import { renderBytesPrompt } from "../../system-prompt/loader.js";
import { librarianDeclaration } from "../librarian.js";

beforeEach(() => {
  _resetSubAgentRegistry();
  for (const agent of SUB_AGENTS) registerSubAgentMeta(agent);
});

describe("librarian gating — declaration description", () => {
  const desc = librarianDeclaration.description;

  it("uses ALL-of (a)(b)(c) gate phrasing", () => {
    assert.match(desc, /ONLY when ALL of these hold/);
    assert.match(desc, /\(a\)/);
    assert.match(desc, /\(b\)/);
    assert.match(desc, /\(c\)/);
    assert.match(desc, /EXTERNAL/);
    assert.match(desc, /MULTIPLE independent sources/);
  });

  it("includes a DO NOT use anti-pattern denylist (≥5 cases)", () => {
    assert.match(desc, /DO NOT use/);
    // anti-patterns
    assert.match(desc, /single URL fetch/i);
    assert.match(desc, /single library docs lookup/i);
    assert.match(desc, /single GitHub code search/i);
    assert.match(desc, /local-codebase questions/i);
    assert.match(desc, /trivial facts/i);
  });

  it("includes a 5–10× cost signal", () => {
    assert.match(desc, /5–10×|5-10x|5–10x/i);
    assert.match(desc, /tokens|latency/i);
  });
});

describe("librarian gating — Bytes overlay", () => {
  const renderWith = (subAgents: string[]) =>
    renderBytesPrompt(createBytesPromptRenderContext("claude", new Set(), new Set(subAgents)));

  it("does NOT contain raw keyword triggers as primary signal", () => {
    const prompt = renderWith(["librarian"]);
    // Old behaviour treated phrases like "research" / "tìm hiểu" as direct triggers.
    // New behaviour: keyword triggers are explicitly NOT sufficient.
    assert.match(prompt, /NOT sufficient by themselves/);
    assert.match(prompt, /must coincide with the \(a\)\+\(b\)\+\(c\)/);
  });

  it("contains strict (a)(b)(c) gate + DO NOT denylist when librarian enabled", () => {
    const prompt = renderWith(["librarian"]);
    assert.match(prompt, /Librarian gating \(strict\)/);
    assert.match(prompt, /\(a\) the question requires EXTERNAL information/);
    assert.match(prompt, /\(b\) it needs MULTIPLE independent sources/);
    assert.match(prompt, /\(c\) direct tools/);
    assert.match(prompt, /DO NOT delegate to `librarian`/);
    assert.match(prompt, /single URL fetch/);
    assert.match(prompt, /single library docs lookup/);
    assert.match(prompt, /single GitHub search/);
    assert.match(prompt, /local-codebase questions/);
  });

  it("includes the 5–10× delegate cost signal at the session-capability layer", () => {
    const prompt = renderWith(["librarian", "explore", "oracle"]);
    assert.match(prompt, /Cost signal/);
    assert.match(prompt, /5–10×|5-10×|5-10x|5–10x/);
    assert.match(prompt, /nested Pi session/);
  });

  it("omits all librarian gating when librarian is disabled", () => {
    const prompt = renderWith(["explore", "oracle"]);
    assert.doesNotMatch(prompt, /Librarian gating \(strict\)/);
    assert.doesNotMatch(prompt, /DO NOT delegate to `librarian`/);
  });
});

// ---------------------------------------------------------------------------
// Phase 0 evaluation harness — 6 librarian gating fixtures (L1–L6).
//
// These are STRUCTURAL tests against the rendered guidance + declaration, NOT
// live model invocations. Each fixture asserts whether a representative user
// request matches the explicit "delegate" or "do not delegate" guidance shipped
// in the description and overlay. Used as the v1 → v2 baseline.
// ---------------------------------------------------------------------------

interface LibrarianFixture {
  readonly id: string;
  readonly request: string;
  /** "delegate" if Librarian is the right tool; "direct" if the agent should use a direct tool. */
  readonly expected: "delegate" | "direct";
  /**
   * Predicate that inspects the rendered guidance + description and returns
   * true when it expresses the expected behaviour for this fixture's request.
   */
  readonly check: (guidance: string, description: string) => boolean;
}

const fixtures: LibrarianFixture[] = [
  {
    id: "L1",
    request: "Fetch this single URL https://example.com/changelog and summarise it.",
    expected: "direct",
    check: (g) => /single URL fetch.*web_fetch/i.test(g),
  },
  {
    id: "L2",
    request: "Look up the docs for fast-glob's `globby` API.",
    expected: "direct",
    check: (g) => /single library docs lookup/i.test(g) && /docs_resolve/i.test(g),
  },
  {
    id: "L3",
    request: "Find usages of `useSyncExternalStore` across public GitHub repos.",
    expected: "direct",
    check: (g) => /single GitHub search/i.test(g) && /gh_search/i.test(g),
  },
  {
    id: "L4",
    request: "Where is the auth middleware defined in this repo?",
    expected: "direct",
    check: (g) =>
      /local-codebase questions/i.test(g) && /delegate_explore|grep|glob|ast_search/i.test(g),
  },
  {
    id: "L5",
    request:
      "Which of TanStack Query / SWR / RTK-Query is best for our app — give me a current comparison from official docs, recent changelogs, and real production usage examples.",
    expected: "delegate",
    check: (g) => /MULTIPLE independent sources/i.test(g) && /Librarian gating \(strict\)/i.test(g),
  },
  {
    id: "L6",
    request: "Tìm hiểu nhanh xem thư viện này dùng thế nào.",
    expected: "direct",
    check: (g, _d) => /tìm hiểu/i.test(g) && /NOT sufficient by themselves/i.test(g),
  },
];

describe("librarian gating — fixtures L1..L6", () => {
  const guidance = renderBytesPrompt(
    createBytesPromptRenderContext("claude", new Set(), new Set(["librarian"])),
  );
  const description = librarianDeclaration.description;

  for (const f of fixtures) {
    it(`${f.id} (${f.expected}): ${f.request.slice(0, 60)}…`, () => {
      assert.ok(
        f.check(guidance, description),
        `Fixture ${f.id} predicate failed against current guidance`,
      );
    });
  }
});
