/**
 * adminui-curation*: the content-whitelist page logic as pure functions.
 * Beacons are split per behavior to match docs/todo/whitelist.md rows:
 *   adminui-curation          — default-empty doc + tolerant parse
 *   adminui-curation-list     — search + filter + counter math
 *   adminui-curation-select   — multi-select (click / shift / all / prune)
 *   adminui-curation-bulk     — bulk enable/disable + single toggle
 *   adminui-curation-starter  — server starter bundle parse + additive merge
 *   adminui-curation-recover  — break-glass enable-all / disable-all
 *   adminui-curation-save     — save diff + post-save verification
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  EMPTY_SELECTION,
  applyBulk,
  clickRow,
  countKind,
  describeDiff,
  diffDoc,
  disableAll,
  emptyWhitelist,
  enableAll,
  enabledSet,
  filterRows,
  isDirty,
  matchesQuery,
  mergeStarter,
  normalizeStarter,
  normalizeWhitelist,
  pruneSelection,
  setEnabled,
  toggleId,
  toggleSelectAll,
  verifySaved,
  type ContentByKind,
  type ContentRow,
  type WhitelistDoc,
} from "./curation";

function champ(id: string, over: Partial<ContentRow> = {}): ContentRow {
  return { id, name: id, hydrated: true, ...over };
}

const ROWS: ContentRow[] = [
  champ("godie-e001", { name: "龍宮禮奈", role: "fighter", icon: "assets/icons/champions/godie-e001.png" }),
  champ("godie-e002", { name: "亞瑟王", role: "fighter", icon: "assets/icons/champions/godie-e002.png" }),
  champ("godie-e003", { name: "亞瑟王的騎士", role: "marksman" }),
  champ("sela", { name: "Sela, the Ember Sage", role: "mage" }),
];

// ------------------------------------------------------------ the doc ------

describe("whitelist doc (adminui-curation)", () => {
  it("a fresh install is EMPTY across all three kinds", () => {
    cover("adminui-curation");
    const doc = emptyWhitelist();
    expect(doc.champions).toEqual([]);
    expect(doc.items).toEqual([]);
    expect(doc.abilities).toEqual([]);
    expect(doc.version).toBe(1);
  });

  it("normalizeWhitelist tolerates bare docs, envelopes and garbage", () => {
    cover("adminui-curation");
    // bare doc, unsorted + duplicate ids -> deduped + sorted
    expect(normalizeWhitelist({ champions: ["b", "a", "a"], items: [], abilities: [] }).champions).toEqual(["a", "b"]);
    // { whitelist: … } envelope
    expect(normalizeWhitelist({ whitelist: { items: ["x"] } }).items).toEqual(["x"]);
    // garbage -> empty doc (page never dies on a partial backend response)
    expect(normalizeWhitelist(null).champions).toEqual([]);
    expect(normalizeWhitelist("nope").abilities).toEqual([]);
    // non-string junk inside an array is dropped
    expect(normalizeWhitelist({ champions: [1, "a", "", null] }).champions).toEqual(["a"]);
  });
});

// ---------------------------------------------------------- filtering ------

describe("search + filter (adminui-curation-list)", () => {
  it("matchesQuery is empty-passthrough, ASCII-insensitive and CJK-substring", () => {
    cover("adminui-curation-list");
    expect(matchesQuery(ROWS[0]!, "")).toBe(true);
    expect(matchesQuery(ROWS[3]!, "EMBER")).toBe(true); // ascii case-insensitive
    expect(matchesQuery(ROWS[1]!, "亞瑟")).toBe(true); // CJK substring
    expect(matchesQuery(ROWS[0]!, "亞瑟")).toBe(false);
    expect(matchesQuery(ROWS[2]!, "e003")).toBe(true); // id substring
    expect(matchesQuery(ROWS[3]!, "mage")).toBe(true); // role substring
  });

  it("filterRows combines search with the enabled/disabled toggle", () => {
    cover("adminui-curation-list");
    const enabled = new Set(["godie-e001", "godie-e003"]);
    expect(filterRows(ROWS, "", "all", enabled).map((r) => r.id)).toEqual([
      "godie-e001",
      "godie-e002",
      "godie-e003",
      "sela",
    ]);
    expect(filterRows(ROWS, "", "enabled", enabled).map((r) => r.id)).toEqual(["godie-e001", "godie-e003"]);
    expect(filterRows(ROWS, "", "disabled", enabled).map((r) => r.id)).toEqual(["godie-e002", "sela"]);
    // search AND filter both apply
    expect(filterRows(ROWS, "亞瑟", "disabled", enabled).map((r) => r.id)).toEqual(["godie-e002"]);
  });

  it("counter math counts total / enabled / shown, and reports stale ids separately", () => {
    cover("adminui-curation-list");
    // one enabled id (ghost-42) has no matching content row
    const enabled = new Set(["godie-e001", "godie-e002", "ghost-42"]);
    const shown = filterRows(ROWS, "亞瑟", "all", enabled); // e002, e003
    const c = countKind(ROWS, enabled, shown);
    expect(c.total).toBe(4);
    expect(c.enabled).toBe(2); // ghost-42 does NOT inflate past total
    expect(c.unknown).toBe(1); // it is surfaced as a stale entry instead
    expect(c.shown).toBe(2);
    expect(c.shownEnabled).toBe(1); // only e002 of the two shown is enabled
  });
});

// ---------------------------------------------------------- selection ------

describe("multi-select (adminui-curation-select)", () => {
  const ids = ROWS.map((r) => r.id);

  it("plain click toggles and moves the anchor", () => {
    cover("adminui-curation-select");
    let sel = clickRow(EMPTY_SELECTION, ids, 1, false);
    expect(sel.ids).toEqual(["godie-e002"]);
    expect(sel.anchor).toBe(1);
    sel = clickRow(sel, ids, 1, false); // toggle back off
    expect(sel.ids).toEqual([]);
  });

  it("shift-click selects the inclusive range from the anchor", () => {
    cover("adminui-curation-select");
    const anchored = clickRow(EMPTY_SELECTION, ids, 0, false); // anchor at 0
    const ranged = clickRow(anchored, ids, 2, true); // shift to 2
    expect(new Set(ranged.ids)).toEqual(new Set(["godie-e001", "godie-e002", "godie-e003"]));
    expect(ranged.anchor).toBe(0); // anchor unchanged by a range extend
    // shift with no anchor degrades to a plain click
    const noAnchor = clickRow(EMPTY_SELECTION, ids, 2, true);
    expect(noAnchor.ids).toEqual(["godie-e003"]);
  });

  it("select-all-filtered toggles the visible set and prune drops hidden ids", () => {
    cover("adminui-curation-select");
    const visible = ["godie-e002", "godie-e003"];
    const all = toggleSelectAll(EMPTY_SELECTION, visible);
    expect(new Set(all.ids)).toEqual(new Set(visible));
    // toggling again clears just those
    expect(toggleSelectAll(all, visible).ids).toEqual([]);
    // a selection spanning a now-hidden row is pruned to what's visible
    const wide = { ids: ["godie-e001", "godie-e002", "godie-e003"], anchor: null };
    expect(pruneSelection(wide, visible).ids).toEqual(["godie-e002", "godie-e003"]);
  });
});

// --------------------------------------------------------------- bulk ------

describe("bulk enable/disable (adminui-curation-bulk)", () => {
  it("applyBulk adds enable, removes disable, and enable wins a tie", () => {
    cover("adminui-curation-bulk");
    const doc: WhitelistDoc = { ...emptyWhitelist(), champions: ["a", "b"] };
    const out = applyBulk(doc, { kind: "champions", enable: ["c", "b"], disable: ["a", "b"] });
    // a removed; b in both -> enabled; c added; sorted+deduped
    expect(out.champions).toEqual(["b", "c"]);
  });

  it("setEnabled / toggleId operate on a single kind only", () => {
    cover("adminui-curation-bulk");
    let doc = emptyWhitelist();
    doc = setEnabled(doc, "items", ["i1", "i2"], true);
    expect(doc.items).toEqual(["i1", "i2"]);
    expect(doc.champions).toEqual([]); // untouched
    doc = toggleId(doc, "items", "i1"); // toggle off
    expect(doc.items).toEqual(["i2"]);
    doc = toggleId(doc, "items", "i3"); // toggle on
    expect(doc.items).toEqual(["i2", "i3"]);
  });

  it("enabledSet reflects the draft for the active kind", () => {
    cover("adminui-curation-bulk");
    const doc = setEnabled(emptyWhitelist(), "abilities", ["x.q"], true);
    expect(enabledSet(doc, "abilities").has("x.q")).toBe(true);
    expect(enabledSet(doc, "champions").size).toBe(0);
  });
});

// ------------------------------------------------------- starter set -------

describe("starter set (adminui-curation-starter)", () => {
  // What GET /api/v1/curation/whitelist/starter returns: the SERVER-owned demo
  // bundle. The console no longer computes its own — it previews the exact set
  // the platform, `seed -starter` and `make seed-demo` all apply.
  const SERVER_BUNDLE = {
    champions: ["godie-e001", "godie-hpb1"],
    items: ["swift-boots", "serrated-edge"],
    abilities: [
      "godie-e001.q",
      "godie-e001.w",
      "godie-e001.e",
      "godie-e001.r",
      "godie-e001.ex",
      "godie-hpb1.q",
      "godie-hpb1.w",
      "godie-hpb1.e",
      "godie-hpb1.r",
      "godie-hpb1.ex",
    ],
  };

  it("parses the platform bundle (bare, enveloped, sorted+deduped)", () => {
    cover("adminui-curation-starter");
    const s = normalizeStarter(SERVER_BUNDLE);
    expect(s.champions).toEqual(["godie-e001", "godie-hpb1"]);
    expect(s.items).toEqual(["serrated-edge", "swift-boots"]); // sorted
    expect(s.abilities).toHaveLength(10);

    // an enveloped response works too
    expect(normalizeStarter({ starter: SERVER_BUNDLE }).champions).toEqual([
      "godie-e001",
      "godie-hpb1",
    ]);

    // duplicates collapse
    expect(
      normalizeStarter({ champions: ["a", "a", "b"], items: [], abilities: [] }).champions,
    ).toEqual(["a", "b"]);
  });

  it("survives a missing/garbage bundle instead of throwing", () => {
    cover("adminui-curation-starter");
    for (const bad of [null, undefined, 42, "nope", {}, { champions: "x" }]) {
      const s = normalizeStarter(bad);
      expect(s.champions).toEqual([]);
      expect(s.items).toEqual([]);
      expect(s.abilities).toEqual([]);
    }
  });

  it("every bundled champion brings its FULL kit — no half-enabled champion", () => {
    cover("adminui-curation-starter");
    const s = normalizeStarter(SERVER_BUNDLE);
    const enabled = new Set(s.abilities);
    for (const id of s.champions) {
      for (const slot of ["q", "w", "e", "r", "ex"]) {
        expect(enabled.has(`${id}.${slot}`)).toBe(true);
      }
    }
  });

  it("mergeStarter is purely additive (never disables an existing pick)", () => {
    cover("adminui-curation-starter");
    const doc: WhitelistDoc = { ...emptyWhitelist(), champions: ["already-on"] };
    const merged = mergeStarter(doc, normalizeStarter(SERVER_BUNDLE));
    expect(merged.champions).toContain("already-on");
    expect(merged.champions).toContain("godie-e001");
    expect(merged.items).toContain("swift-boots");
    expect(merged.abilities).toContain("godie-hpb1.ex");
  });
});

// ------------------------------------------------- break-glass recovery ----

describe("enable-all / disable-all recovery (adminui-curation-recover)", () => {
  const content: ContentByKind = {
    champions: [champ("c1"), champ("c2")],
    items: [champ("i1", { cost: 100, tier: 1 })],
    abilities: [champ("c1.q"), champ("c2.ex")],
  };

  it("enableAll turns on every authored id across all three kinds", () => {
    cover("adminui-curation-recover");
    const doc = enableAll(emptyWhitelist(), content);
    expect(doc.champions).toEqual(["c1", "c2"]);
    expect(doc.items).toEqual(["i1"]);
    expect(doc.abilities).toEqual(["c1.q", "c2.ex"]);
  });

  it("enableAll is additive — a stale id already in the doc survives", () => {
    cover("adminui-curation-recover");
    const doc = enableAll({ ...emptyWhitelist(), champions: ["gone-from-tree"] }, content);
    expect(doc.champions).toContain("gone-from-tree");
    expect(doc.champions).toContain("c1");
  });

  it("disableAll returns the doc to the documented empty install", () => {
    cover("adminui-curation-recover");
    const doc = disableAll(enableAll(emptyWhitelist(), content));
    expect(doc.champions).toEqual([]);
    expect(doc.items).toEqual([]);
    expect(doc.abilities).toEqual([]);
  });
});

// ----------------------------------------------- save diff + verify --------

describe("save diff + verification (adminui-curation-save)", () => {
  it("diffDoc reports per-kind add/remove and describeDiff summarizes", () => {
    cover("adminui-curation-save");
    const server: WhitelistDoc = { ...emptyWhitelist(), champions: ["a", "b"], items: ["i1"] };
    const draft: WhitelistDoc = { ...emptyWhitelist(), champions: ["b", "c"], items: ["i1"] };
    const diffs = diffDoc(server, draft);
    expect(diffs).toEqual([{ kind: "champions", enable: ["c"], disable: ["a"] }]);
    expect(isDirty(server, draft)).toBe(true);
    expect(isDirty(server, server)).toBe(false);
    expect(describeDiff(diffs)).toBe("英雄 +1 / -1");
    expect(describeDiff([])).toBe("沒有變更");
  });

  it("verifySaved passes only when the re-read doc matches what was sent", () => {
    cover("adminui-curation-save");
    const expected: WhitelistDoc = { ...emptyWhitelist(), champions: ["a", "b"] };
    expect(verifySaved(expected, expected).ok).toBe(true);
    // a dropped write is caught (green tick withheld)
    const dropped: WhitelistDoc = { ...emptyWhitelist(), champions: ["a"] };
    const res = verifySaved(expected, dropped);
    expect(res.ok).toBe(false);
    expect(res.mismatches[0]).toMatchObject({ kind: "champions", missing: ["b"], extra: [] });
  });
});
