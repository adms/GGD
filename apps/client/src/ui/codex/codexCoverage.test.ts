/**
 * codex-icon-coverage / codex-coverage-rescan — the live icon progress bar
 * (task #97).
 *
 * The bar exists because the user does not want to take the work on trust
 * (「讓我知道你真的有在作事而不是忘了」), so these tests pin the two properties
 * that make it trustworthy:
 *
 *   • EVERY NUMBER IS DERIVED. The denominator is the length of what was
 *     loaded, so adding or removing an entry moves it. There is no constant to
 *     go stale. (The source-level half of that claim — no literal collection
 *     size anywhere in ui/codex/** — is `codexLive.test.ts`.)
 *   • EXCLUSIONS COME FROM TASK #72, NOT FROM HERE. Its plan is read through
 *     its OWN reader (`codexPlan.parsePlan`), and the three states it publishes
 *     stay distinct: DROPPED leaves the denominator, BLOCKED stays in it but is
 *     not backlog, everything else is the honest remainder. Without a plan the
 *     bar counts every gap as work and says so; the local candidate rule is
 *     opt-in, labelled, and always loses to a published plan.
 *
 * Plus the rescan arithmetic, which is what makes "live" affordable: the first
 * poll must cost nothing beyond the index files, and later polls must re-read
 * only the documents whose index hash actually moved.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  computeIconCoverage,
  coverageEntries,
  coverageEntryFromDoc,
  coverageKey,
  diffScan,
  isCandidateExclusion,
  mergeDocs,
  parseIndexRows,
  scanFromEntries,
  type CoverageEntry,
  type IndexRow,
} from "@ggd/shared/codex/codexCoverage";
import { parsePlan, type CodexPlan } from "@ggd/shared/codex/codexPlan";
import { normaliseAbility, normaliseChampion, normaliseItem, UNKNOWN_WHITELIST } from "./codexData";
import type { CodexAbility, CodexChampion, CodexData, CodexItem, CodexKind } from "@ggd/shared/codex/codexTypes";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function entry(kind: CodexKind, id: string, over: Partial<CoverageEntry> = {}): CoverageEntry {
  return { kind, id, icon: null, emptyDescription: false, nameEqualsId: false, ...over };
}

/** n entries of one kind, the first `withIcon` of them carrying art. */
function run(kind: CodexKind, n: number, withIcon: number): CoverageEntry[] {
  return Array.from({ length: n }, (_, i) =>
    entry(kind, `${kind}-${i}`, i < withIcon ? { icon: `assets/icons/${kind}/${i}.png` } : {}),
  );
}

function data(over: Partial<CodexData> = {}): CodexData {
  return {
    contentVersion: "cv_test",
    counts: {
      item: { manifest: null, indexed: 0, loaded: 0 },
      champion: { manifest: null, indexed: 0, loaded: 0 },
      ability: { manifest: null, indexed: 0, loaded: 0 },
    },
    items: [],
    champions: [],
    abilities: [],
    whitelist: UNKNOWN_WHITELIST,
    loadedAt: 0,
    loadErrors: [],
    ...over,
  };
}

const champ = (over: Record<string, unknown>): CodexChampion =>
  normaliseChampion({ name: "王 - 甲", role: "fighter", attackType: "melee", abilities: {}, ...over }) as CodexChampion;
const item = (over: Record<string, unknown>): CodexItem =>
  normaliseItem({ name: "刀", cost: 100, tier: 2, tags: [], ...over }) as CodexItem;
const ability = (over: Record<string, unknown>): CodexAbility =>
  normaliseAbility({ name: "01-01 斬", slot: "Q", ...over }) as CodexAbility;

// ---------------------------------------------------------------------------

describe("icon coverage is measured, never asserted (task #97)", () => {
  it("takes its denominator from what was actually loaded", () => {
    cover("codex-icon-coverage");
    const small = computeIconCoverage({ entries: run("ability", 4, 1) });
    expect(small.all.total).toBe(4);
    expect(small.byKind.ability.needed).toBe(4);
    expect(small.byKind.ability.covered).toBe(1);

    // one more entry appears in content → the denominator moves with it, which
    // a hardcoded total could never do
    const bigger = computeIconCoverage({ entries: run("ability", 5, 1) });
    expect(bigger.all.total).toBe(5);
    expect(bigger.byKind.ability.needed).toBe(5);
    expect(bigger.all.percent).toBeLessThan(small.all.percent);
  });

  it("splits the count by kind and sums them into the headline", () => {
    cover("codex-icon-coverage");
    const c = computeIconCoverage({
      entries: [...run("champion", 10, 6), ...run("ability", 20, 2), ...run("item", 5, 1)],
    });
    expect(c.byKind.champion.covered).toBe(6);
    expect(c.byKind.ability.covered).toBe(2);
    expect(c.byKind.item.covered).toBe(1);
    expect(c.all.total).toBe(35);
    expect(c.all.covered).toBe(9);
    expect(c.all.missing).toBe(26);
    expect(c.all.percent).toBeCloseTo((9 / 35) * 100, 6);
  });

  it("climbs as art lands, and only for the entry that got it", () => {
    cover("codex-icon-coverage");
    const before = computeIconCoverage({ entries: run("item", 4, 1) });
    const after = computeIconCoverage({ entries: run("item", 4, 2) });
    expect(before.byKind.item.covered).toBe(1);
    expect(after.byKind.item.covered).toBe(2);
    expect(after.byKind.item.missing).toBe(2);
    expect(after.all.percent).toBeGreaterThan(before.all.percent);
  });

  it("a declared icon the mount cannot serve is NOT coverage", () => {
    cover("codex-icon-coverage");
    const entries = run("champion", 3, 2);
    const failed = new Set([entries[0]?.icon as string]);
    const c = computeIconCoverage({ entries, failedIcons: failed });
    expect(c.byKind.champion.covered).toBe(1);
    expect(c.byKind.champion.broken).toBe(1);
    expect(c.byKind.champion.missing).toBe(2);
  });

  it("reads coverage straight off a loaded codex — no second source of truth", () => {
    cover("codex-icon-coverage");
    const d = data({
      champions: [champ({ id: "c1", icon: "assets/icons/champions/c1.png" }), champ({ id: "c2" })],
      items: [item({ id: "i1", description: "說明" })],
      abilities: [ability({ id: "c1.q", description: "說明", icon: "assets/icons/abilities/q.png" })],
    });
    const c = computeIconCoverage({ entries: coverageEntries(d) });
    expect(c.byKind.champion.total).toBe(2);
    expect(c.byKind.champion.covered).toBe(1);
    expect(c.byKind.item.total).toBe(1);
    expect(c.byKind.ability.covered).toBe(1);
    expect(c.all.total).toBe(4);
  });

  it("reports 100% only when nothing is left needing art", () => {
    cover("codex-icon-coverage");
    expect(computeIconCoverage({ entries: run("item", 3, 3) }).all.percent).toBe(100);
    // an empty collection is vacuously complete, never NaN
    expect(computeIconCoverage({ entries: [] }).all.percent).toBe(100);
    expect(computeIconCoverage({ entries: [] }).all.needed).toBe(0);
  });
});

describe("needs-an-icon vs deliberately-excluded (task #72 owns the verdict)", () => {
  /**
   * Build a plan through task #72's OWN reader. Nothing here re-implements the
   * classification — if #72 changes its schema, `parsePlan` changes with it and
   * these tests follow, which is exactly the coupling this task wants.
   */
  const plan = (over: Record<string, unknown>): CodexPlan =>
    parsePlan({
      schema: "config.icon-plan@1",
      templateVersion: "icon-gen/1",
      contentDigest: "deadbeef",
      counts: { total: { docs: 0, have: 0, drop: 0, blocked: 0, generate: 0, tier1: 0, tier2: 0 } },
      ...over,
    }) as CodexPlan;

  it("without a published plan, every gap counts as work — and it says so", () => {
    cover("codex-icon-coverage-plan");
    const c = computeIconCoverage({ entries: run("ability", 10, 1) });
    expect(c.exclusionSource).toBe("none");
    expect(c.all.excluded).toBe(0);
    expect(c.all.needed).toBe(10);
    expect(c.planCounts).toBeNull();
  });

  it("a missing or foreign plan reads as 'not classified yet', never as 'nothing is excluded'", () => {
    cover("codex-icon-coverage-plan");
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan({ schema: "something-else@1" })).toBeNull();
    const c = computeIconCoverage({ entries: run("item", 4, 0), plan: null });
    expect(c.exclusionSource).toBe("none");
    expect(c.all.needed).toBe(4);
  });

  it("DROPPED leaves the denominator, so the bar stops being permanently red", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("item", 10, 2);
    const p = plan({
      dropped: { "recipe-book": { label: "合成書", note: "", ids: ["item-8", "item-9"] } },
    });
    const c = computeIconCoverage({ entries, plan: p });
    expect(c.exclusionSource).toBe("plan");
    expect(c.byKind.item.total).toBe(10);
    expect(c.byKind.item.excluded).toBe(2);
    expect(c.byKind.item.needed).toBe(8);
    expect(c.byKind.item.covered).toBe(2);
    expect(c.byKind.item.percent).toBeCloseTo(25, 6);
  });

  it("BLOCKED stays in the denominator but is NOT backlog — a held gate is not work you can do", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("champion", 10, 3);
    const p = plan({
      blocked: { "third-party-ip": { label: "第三方版權", note: "", ids: ["champion-8", "champion-9"] } },
    });
    const c = computeIconCoverage({ entries, plan: p });
    expect(c.byKind.champion.needed).toBe(10);
    expect(c.byKind.champion.covered).toBe(3);
    expect(c.byKind.champion.missing).toBe(7);
    expect(c.byKind.champion.blocked).toBe(2);
    expect(c.byKind.champion.backlog).toBe(5);
    // covered + backlog + blocked exhausts the denominator — nothing is hidden
    expect(c.byKind.champion.covered + c.byKind.champion.backlog + c.byKind.champion.blocked).toBe(10);
  });

  it("dropped and blocked are different states and never double-count", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("item", 6, 0);
    const p = plan({
      dropped: { d: { label: "排除", note: "", ids: ["item-0"] } },
      blocked: { b: { label: "暫停", note: "", ids: ["item-1"] } },
    });
    const c = computeIconCoverage({ entries, plan: p });
    expect(c.byKind.item.excluded).toBe(1);
    expect(c.byKind.item.needed).toBe(5);
    expect(c.byKind.item.blocked).toBe(1);
    expect(c.byKind.item.backlog).toBe(4);
  });

  it("an entry that is blocked but already HAS art counts as covered, not as a gate", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("champion", 4, 4);
    const p = plan({ blocked: { b: { label: "暫停", note: "", ids: ["champion-0"] } } });
    const c = computeIconCoverage({ entries, plan: p });
    expect(c.byKind.champion.covered).toBe(4);
    expect(c.byKind.champion.blocked).toBe(0);
    expect(c.byKind.champion.percent).toBe(100);
  });

  it("a dropped entry that already has art keeps the ratio consistent (never over 100%)", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("champion", 4, 4);
    const p = plan({ dropped: { d: { label: "排除", note: "", ids: ["champion-0"] } } });
    const c = computeIconCoverage({ entries, plan: p });
    expect(c.byKind.champion.needed).toBe(3);
    expect(c.byKind.champion.covered).toBe(3);
    expect(c.byKind.champion.percent).toBe(100);
  });

  it("prints the plan's own totals beside the measurement, and flags a stale plan", () => {
    cover("codex-icon-coverage-plan");
    const entries = run("item", 5, 1);
    const agreeing = plan({
      counts: { total: { docs: 5, have: 1, drop: 0, blocked: 0, generate: 4, tier1: 1, tier2: 3 } },
    });
    expect(computeIconCoverage({ entries, plan: agreeing }).planStale).toBe(false);

    // the plan was generated against a different tree — say so rather than
    // silently applying its exclusions as if they still described this content
    const stale = plan({
      counts: { total: { docs: 9, have: 1, drop: 0, blocked: 0, generate: 8, tier1: 1, tier2: 7 } },
    });
    const c = computeIconCoverage({ entries, plan: stale });
    expect(c.planStale).toBe(true);
    expect(c.planCounts?.docs).toBe(9);
    expect(c.all.total).toBe(5);
  });

  it("the local candidate rule is opt-in, labelled, and mirrors the codex's own predicates", () => {
    cover("codex-icon-coverage-plan");
    const entries = [
      entry("item", "i1"),
      entry("item", "i2", { emptyDescription: true }),
      entry("item", "i3", { nameEqualsId: true }),
    ];
    expect(entries.filter(isCandidateExclusion)).toHaveLength(2);

    const off = computeIconCoverage({ entries });
    expect(off.all.excluded).toBe(0);
    expect(off.candidateTotal).toBe(2);

    const on = computeIconCoverage({ entries, applyCandidates: true });
    expect(on.exclusionSource).toBe("candidate");
    expect(on.all.excluded).toBe(2);
    expect(on.all.needed).toBe(1);
  });

  it("a published plan always wins over the local guess", () => {
    cover("codex-icon-coverage-plan");
    const entries = [entry("item", "i1", { emptyDescription: true }), entry("item", "i2")];
    const p = plan({ dropped: { d: { label: "排除", note: "", ids: ["i2"] } } });
    const c = computeIconCoverage({ entries, plan: p, applyCandidates: true });
    expect(c.exclusionSource).toBe("plan");
    expect(c.all.excluded).toBe(1);
    expect(c.byKind.item.needed).toBe(1);
  });
});

describe("the live rescan stays cheap and honest (task #97)", () => {
  const row = (kind: CodexKind, id: string, hash: string): IndexRow => ({
    kind,
    id,
    path: `${kind}s/${id}.json`,
    hash,
  });

  it("parses index rows and ignores malformed ones", () => {
    cover("codex-coverage-rescan");
    const rows = parseIndexRows("item", {
      entries: [
        { id: "i1", path: "items/i1.json", hash: "h1" },
        { id: "i2", path: "items/i2.json" },
        { path: "items/i3.json", hash: "h3" },
        "junk",
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["i1"]);
    expect(parseIndexRows("item", null)).toEqual([]);
  });

  it("the first poll costs only the index files — nothing already loaded is re-read", () => {
    cover("codex-coverage-rescan");
    const scan = scanFromEntries([entry("item", "i1"), entry("item", "i2")]);
    const { scan: next, stale } = diffScan(scan, [row("item", "i1", "h1"), row("item", "i2", "h2")], ["item"]);
    expect(stale).toEqual([]);
    expect(next.hashes.get(coverageKey("item", "i1"))).toBe("h1");
    expect(next.entries).toHaveLength(2);
  });

  it("re-reads only the document whose hash moved", () => {
    cover("codex-coverage-rescan");
    const first = diffScan(
      scanFromEntries([entry("item", "i1"), entry("item", "i2")]),
      [row("item", "i1", "h1"), row("item", "i2", "h2")],
      ["item"],
    ).scan;
    const second = diffScan(first, [row("item", "i1", "h1"), row("item", "i2", "h2-NEW")], ["item"]);
    expect(second.stale.map((r) => r.id)).toEqual(["i2"]);

    // and merging the re-read doc is what moves the bar
    const merged = mergeDocs(second.scan, [
      { row: row("item", "i2", "h2-NEW"), doc: { id: "i2", name: "刀", description: "說明", icon: "assets/icons/items/i2.png" } },
    ]);
    expect(computeIconCoverage({ entries: merged.entries }).all.covered).toBe(1);
    // reconciled: the same hash is no longer stale next time round
    expect(diffScan(merged, [row("item", "i1", "h1"), row("item", "i2", "h2-NEW")], ["item"]).stale).toEqual([]);
  });

  it("picks up an entry that did not exist at page load", () => {
    cover("codex-coverage-rescan");
    const first = diffScan(scanFromEntries([entry("item", "i1")]), [row("item", "i1", "h1")], ["item"]).scan;
    const second = diffScan(first, [row("item", "i1", "h1"), row("item", "i9", "h9")], ["item"]);
    expect(second.stale.map((r) => r.id)).toEqual(["i9"]);
    const merged = mergeDocs(second.scan, [{ row: row("item", "i9", "h9"), doc: { id: "i9", name: "新刀" } }]);
    expect(computeIconCoverage({ entries: merged.entries }).byKind.item.total).toBe(2);
  });

  it("drops an entry that vanished from the index", () => {
    cover("codex-coverage-rescan");
    const first = diffScan(
      scanFromEntries([entry("item", "i1"), entry("item", "i2")]),
      [row("item", "i1", "h1"), row("item", "i2", "h2")],
      ["item"],
    ).scan;
    const second = diffScan(first, [row("item", "i1", "h1")], ["item"]);
    expect(second.scan.entries.map((e) => e.id)).toEqual(["i1"]);
    expect(second.scan.hashes.has(coverageKey("item", "i2"))).toBe(false);
  });

  it("a collection that failed to fetch is left alone — a blip is not a wipe", () => {
    cover("codex-coverage-rescan");
    const base = scanFromEntries([
      entry("item", "i1", { icon: "assets/icons/items/i1.png" }),
      entry("champion", "c1", { icon: "assets/icons/champions/c1.png" }),
    ]);
    const first = diffScan(base, [row("item", "i1", "h1"), row("champion", "c1", "hc")], ["item", "champion"]).scan;
    // champions index came back empty/unreachable this tick
    const second = diffScan(first, [row("item", "i1", "h1")], ["item"]);
    expect(second.scan.entries.map((e) => e.id).sort()).toEqual(["c1", "i1"]);
    expect(second.scan.hashes.get(coverageKey("champion", "c1"))).toBe("hc");
    expect(computeIconCoverage({ entries: second.scan.entries }).all.covered).toBe(2);
  });

  it("reads a re-fetched doc as tolerantly as the loader does", () => {
    cover("codex-coverage-rescan");
    expect(coverageEntryFromDoc("item", "i1", { icon: "assets/icons/items/i1.png", description: "說明", name: "刀" })).toEqual(
      { kind: "item", id: "i1", icon: "assets/icons/items/i1.png", emptyDescription: false, nameEqualsId: false },
    );
    // no name → falls back to the id, which IS the "name = id" defect
    expect(coverageEntryFromDoc("item", "i2", { description: "" })).toEqual({
      kind: "item",
      id: "i2",
      icon: null,
      emptyDescription: true,
      nameEqualsId: true,
    });
    expect(coverageEntryFromDoc("item", "i3", "garbage").icon).toBeNull();
  });
});
