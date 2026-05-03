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

  it("does NOT contain verbose keyword trigger rules in overlay (moved to declaration)", () => {
    const prompt = renderWith(["librarian"]);
    // Old verbose gating removed from overlay; routing matrix uses concise positive framing
    assert.ok(prompt.includes("3+ external sources"));
    // Detailed anti-patterns now live only in declaration description
    assert.doesNotMatch(prompt, /NOT sufficient by themselves/);
  });

  it("contains concise positive routing hint when librarian enabled", () => {
    const prompt = renderWith(["librarian"]);
    assert.ok(prompt.includes("`librarian`"));
    assert.ok(prompt.includes("3+ external sources"));
  });

  it("includes the 5–10× delegate cost signal in the workflow section", () => {
    const prompt = renderWith(["librarian", "explore", "oracle"]);
    assert.match(prompt, /Cost signal/);
    assert.match(prompt, /5–10×|5-10×|5-10x|5–10x/);
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
    check: (_g, d) => /single URL fetch.*web_fetch/i.test(d),
  },
  {
    id: "L2",
    request: "Look up the docs for fast-glob's `globby` API.",
    expected: "direct",
    check: (_g, d) => /single library docs lookup/i.test(d) && /docs_resolve/i.test(d),
  },
  {
    id: "L3",
    request: "Find usages of `useSyncExternalStore` across public GitHub repos.",
    expected: "direct",
    check: (_g, d) => /single GitHub code search/i.test(d) && /gh_search/i.test(d),
  },
  {
    id: "L4",
    request: "Where is the auth middleware defined in this repo?",
    expected: "direct",
    check: (_g, d) =>
      /local-codebase questions/i.test(d) && /delegate_explore|grep|glob|ast_search/i.test(d),
  },
  {
    id: "L5",
    request:
      "Which of TanStack Query / SWR / RTK-Query is best for our app — give me a current comparison from official docs, recent changelogs, and real production usage examples.",
    expected: "delegate",
    check: (_g, d) => /MULTIPLE independent sources/i.test(d) && /ALL of these hold/i.test(d),
  },
  {
    id: "L6",
    request: "Tìm hiểu nhanh xem thư viện này dùng thế nào.",
    expected: "direct",
    check: (_g, d) => /trivial facts/i.test(d),
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
