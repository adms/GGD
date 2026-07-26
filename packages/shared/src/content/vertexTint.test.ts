/**
 * Task #49 — the w3x VERTEX COLOUR (tint) + alpha port.
 *
 * The GoDieEX22s importer read `war3map.w3u` but never read the unit ART
 * colour fields (`uclr/uclg/uclb`), so every champion the map recoloured
 * shipped in the raw Blizzard/stand-in palette — 海克力斯 Berserker most
 * visibly, who is supposed to be 黑紅 and rendered as a plain paladin.
 *
 *   tint-schema-champion  — champion@1 accepts/rejects `tint` + `alpha`
 *   tint-schema-skin      — skin@1 carries the same pair as an override
 *   tint-berserker        — godie-hapm's 黑紅: dark static tint + red buff state
 *   tint-roster-values    — all 21 extracted champion tints, pinned
 *   tint-ledger           — config.unit-tints@1: alpha<1, refs, agreement, bugs
 *   tint263-inheritance   — TASK #263: the w3u→w3u step #49 lacked (U00L), plus
 *                           the two champions the owner named as the reference
 *                           (維尼 = tint, 小叮噹 = NOT a tint)
 *   tint263-resolver      — TASK #263: the resolver's own output, the champion
 *                           docs and the ledger agree IN BOTH DIRECTIONS, so a
 *                           MISSING row (the #49 failure) fails too
 *
 * Live content is read by DIRECT path (like championVoices.test.ts) so the
 * suite is green both before and after `content:build` reindexes.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc } from "./schema/champion";
import { zSkinDoc } from "./schema/skin";
import { zConfigDoc, zConfigUnitTintsDoc, type ConfigUnitTintsDoc } from "./schema/config";
import { validateDoc } from "./loader";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const CHAMP_DIR = join(CONTENT, "champions");
const MODEL_DIR = join(CONTENT, "models");

type Champ = ReturnType<typeof zChampionDoc.parse>;

function readChampion(id: string): Champ {
  return zChampionDoc.parse(
    JSON.parse(readFileSync(join(CHAMP_DIR, `${id}.json`), "utf8")),
  );
}

function allChampions(): Champ[] {
  return readdirSync(CHAMP_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => zChampionDoc.parse(JSON.parse(readFileSync(join(CHAMP_DIR, f), "utf8"))));
}

function ledger(): ConfigUnitTintsDoc {
  const raw = JSON.parse(readFileSync(join(CONTENT, "config/unit-tints.json"), "utf8"));
  return zConfigUnitTintsDoc.parse(raw);
}

const NEUTRAL = (t: readonly number[] | undefined): boolean =>
  t !== undefined && t[0] === 1 && t[1] === 1 && t[2] === 1;

/** Minimal embedded ability def (no schema tag). */
function abilityFix(slot: "Q" | "W" | "E" | "R"): Record<string, unknown> {
  return {
    id: `godie-test.${slot.toLowerCase()}`,
    name: `測試技能 ${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8],
    manaCost: [40],
    range: 0,
    effects: [],
  };
}

function championFix(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "champion@1",
    id: "godie-test",
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: { Q: abilityFix("Q"), W: abilityFix("W"), E: abilityFix("E"), R: abilityFix("R") },
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: ["wc3-import"],
    ...extra,
  };
}

// ---------------------------------------------------------------- schema

describe("champion@1 tint/alpha (tint-schema-champion)", () => {
  it("accepts a 0..1 rgb triple + alpha, stays valid without either, rejects bad shapes", () => {
    cover("tint-schema-champion");

    const parsed = zChampionDoc.parse(
      championFix({ tint: [0.3137, 0.3137, 0.3137], alpha: 0.5 }),
    );
    expect(parsed.tint).toEqual([0.3137, 0.3137, 0.3137]);
    expect(parsed.alpha).toBe(0.5);

    // additive: the whole pre-#49 roster (no tint, no alpha) stays valid
    const bare = zChampionDoc.parse(championFix());
    expect(bare.tint).toBeUndefined();
    expect(bare.alpha).toBeUndefined();

    // the 0..1 contract is enforced on every channel (NOT 0..255)
    for (const bad of [[80, 80, 80], [-0.1, 0, 0], [0, 1.5, 0], [0, 0, 255]]) {
      const r = zChampionDoc.safeParse(championFix({ tint: bad }));
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.path).toContain("tint");
    }
    // exactly three channels — alpha never rides inside `tint`
    expect(zChampionDoc.safeParse(championFix({ tint: [1, 1] })).success).toBe(false);
    expect(zChampionDoc.safeParse(championFix({ tint: [1, 1, 1, 1] })).success).toBe(false);
    expect(zChampionDoc.safeParse(championFix({ tint: "#505050" })).success).toBe(false);
    // alpha is a 0..1 opacity, not a 0..100 WC3 transparency
    expect(zChampionDoc.safeParse(championFix({ alpha: 50 })).success).toBe(false);
    expect(zChampionDoc.safeParse(championFix({ alpha: -1 })).success).toBe(false);
    expect(zChampionDoc.parse(championFix({ alpha: 0 })).alpha).toBe(0);
  });
});

describe("skin@1 tint/alpha override (tint-schema-skin)", () => {
  it("carries the same optional pair so a skin can restate or clear the champion tint", () => {
    cover("tint-schema-skin");
    const base = {
      schema: "skin@1" as const,
      id: "godie-test.skin",
      championId: "godie-test",
      name: "測試造型",
      mcoinPrice: 0,
      modelKey: "champ.test",
    };
    expect(zSkinDoc.parse(base).tint).toBeUndefined();
    const tinted = zSkinDoc.parse({ ...base, tint: [1, 1, 1], alpha: 0.75 });
    expect(tinted.tint).toEqual([1, 1, 1]); // explicit neutral = "clear the champion tint"
    expect(tinted.alpha).toBe(0.75);
    expect(zSkinDoc.safeParse({ ...base, tint: [1, 1, 1, 1] }).success).toBe(false);
    expect(zSkinDoc.safeParse({ ...base, alpha: 100 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- Berserker

describe("海克力斯 Berserker 黑紅 (tint-berserker)", () => {
  it("godie-hapm carries a DARK non-white static tint and a RED buff state", () => {
    cover("tint-berserker");
    const hapm = readChampion("godie-hapm");

    // (1) the 黑 — pinned to the extracted war3map.w3u value uclr=uclg=uclb=80,
    //     i.e. 80/255 = 0.3137. NOT neutral, NOT white, and genuinely dark.
    expect(hapm.tint).toEqual([0.3137, 0.3137, 0.3137]);
    expect(NEUTRAL(hapm.tint)).toBe(false);
    expect(Math.max(...hapm.tint!)).toBeLessThan(0.4);
    // it is a MULTIPLY, so it must darken the mesh, never brighten it
    expect(Math.max(...hapm.tint!)).toBeLessThan(1);

    // (2) the 紅 — the Q buff 狂戰士之怒 (A0VJ) at war3map.j:51668,
    //     SetUnitVertexColorBJ(...,100,30,30,0) => rgb 1.0/0.3/0.3, OPAQUE
    //     (the 4th BJ arg is transparency, so 0 means fully opaque).
    const states = ledger().transient.filter((s) => s.championId === "godie-hapm");
    const rage = states.find((s) => s.line === 51668);
    expect(rage).toBeDefined();
    expect(rage!.tint).toEqual([1, 0.3, 0.3]);
    expect(rage!.alpha).toBeUndefined(); // absent == 1 == opaque
    const [r, g, b] = rage!.tint!;
    expect(r).toBeGreaterThan(g); // red-dominant
    expect(r).toBeGreaterThan(b);

    // (3) the map RESTORES Berserker to 30% grey, never to white — which is
    //     the map itself confirming the dark rest state above.
    for (const line of [51694, 52027]) {
      const restore = states.find((s) => s.line === line);
      expect(restore, `war3map.j:${line}`).toBeDefined();
      expect(restore!.tint).toEqual([0.3, 0.3, 0.3]);
      expect(restore!.erasesStaticTint).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------- roster

/**
 * The 21 champion-mapped units from the extract, exact values pinned.
 *
 * 20 landed with #49; `godie-u00l` is the #263 catch-up — it inherits its
 * colour from the ORIGINAL-table entry `Umal` (a w3u→w3u step #49's resolver
 * did not have), so it shipped untinted while its 變身 counterpart
 * `godie-umal` carried 0.7843 and transforming visibly washed the grey off.
 */
const EXPECTED: ReadonlyArray<readonly [string, readonly [number, number, number]]> = [
  ["godie-hapm", [0.3137, 0.3137, 0.3137]],
  ["godie-e00q", [0.2941, 0.2941, 0.2941]],
  ["godie-ogld", [0.1961, 0.1961, 0.1961]],
  ["godie-e00t", [0.1961, 0.1961, 0.1961]],
  ["godie-e00r", [0.3922, 0.3922, 0.3922]],
  ["godie-u034", [0.3922, 0.3922, 0.3922]],
  ["godie-u01f", [0.3922, 0.2745, 0.2745]],
  ["godie-u011", [0.5882, 0.5882, 0.5882]],
  ["godie-u012", [0.5882, 0.5882, 0.5882]],
  ["godie-h02z", [0.7059, 0.7059, 0.7059]],
  ["godie-umal", [0.7843, 0.7843, 0.7843]],
  ["godie-u00l", [0.7843, 0.7843, 0.7843]], // #263 — inherited from Umal
  ["godie-u00b", [0.9412, 0.5882, 0.5882]],
  ["godie-nman", [1, 0.3922, 0.3922]],
  ["godie-othr", [1, 1, 0]],
  ["godie-e00v", [1, 0.7843, 0]],
  ["godie-ucrl", [0.3922, 1, 0.3922]],
  ["godie-ecen", [1, 0.7843, 1]],
  ["godie-e00s", [1, 0.7843, 1]],
  ["godie-ubal", [1, 0.7843, 0.7843]],
  ["godie-u00j", [1, 0.7843, 0.7843]],
];

describe("ported roster tints (tint-roster-values)", () => {
  it("every extracted champion tint is present and exact; no champion writes neutral", () => {
    cover("tint-roster-values");
    for (const [id, rgb] of EXPECTED) {
      const doc = readChampion(id);
      expect(doc.tint, id).toEqual([...rgb]);
      expect(NEUTRAL(doc.tint), `${id} must not be written as neutral`).toBe(false);
    }

    const all = allChampions();
    // untinted champions stay ABSENT rather than [1,1,1] (never fill the field)
    const tinted = all.filter((c) => c.tint !== undefined);
    expect(tinted).toHaveLength(EXPECTED.length);
    expect(all.filter((c) => NEUTRAL(c.tint))).toHaveLength(0);
    // no static w3u entry was translucent, so no champion carries alpha yet
    expect(all.filter((c) => c.alpha !== undefined)).toHaveLength(0);

    // every tinted champion still resolves its model (tint rides ALONGSIDE the
    // modelKey; it never replaced it)
    for (const c of tinted) {
      expect(existsSync(join(MODEL_DIR, `${c.modelKey}.json`)), `${c.id} -> ${c.modelKey}`).toBe(
        true,
      );
    }

    // the point of putting tint on the CHAMPION and not on model@1: models are
    // shared, so at least one tinted champion must share its modelKey with an
    // UNtinted one (a model-level tint would have repainted that champion too).
    const byModel = new Map<string, Champ[]>();
    for (const c of all) byModel.set(c.modelKey, [...(byModel.get(c.modelKey) ?? []), c]);
    const contested = [...byModel.values()].filter(
      (cs) => cs.some((c) => c.tint) && cs.some((c) => !c.tint),
    );
    expect(contested.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- ledger

describe("config.unit-tints@1 ledger (tint-ledger)", () => {
  it("holds the whole extract, agrees with the champion docs, and flags the map bugs", () => {
    cover("tint-ledger");
    const doc = ledger();

    // parses through the collection union and the loader's validator
    expect(zConfigDoc.parse(doc).schema).toBe("config.unit-tints@1");
    expect(validateDoc("config", doc).ok).toBe(true);

    // the full extract: 53 units (52 from #49 + U00L from #263), 21 of them
    // mapped to a champion doc
    const entries = Object.entries(doc.units);
    expect(entries).toHaveLength(53);
    const mapped = entries.filter(([, e]) => e.championId !== undefined);
    expect(mapped).toHaveLength(EXPECTED.length);

    // every referenced champion id resolves to a real doc …
    for (const [rawcode, e] of mapped) {
      expect(existsSync(join(CHAMP_DIR, `${e.championId}.json`)), rawcode).toBe(true);
      // … and the ledger value is the SAME number the champion doc carries
      expect(readChampion(e.championId!).tint, `${rawcode} -> ${e.championId}`).toEqual(e.tint);
    }
    for (const s of doc.transient) {
      expect(existsSync(join(CHAMP_DIR, `${s.championId}.json`)), s.trigger).toBe(true);
    }

    // rawcodes are the 4-char w3x ids, and every unit actually carries colour
    for (const [rawcode, e] of entries) {
      expect(rawcode).toMatch(/^[A-Za-z0-9]{4}$/);
      expect(e.tint, rawcode).toBeDefined();
      expect(NEUTRAL(e.tint), `${rawcode} is neutral — it should not be in the ledger`).toBe(false);
      expect(e.evidence.length, rawcode).toBeGreaterThan(20);
    }

    // 43 units in this map get their colour purely by inheriting the base
    // unit's stock UnitUI.slk row; the ledger must say so rather than pretend
    // there were explicit w3u mods.
    expect(entries.filter(([, e]) => e.source === "slk-inherited").length).toBeGreaterThan(0);

    // ALPHA: the static w3u table is entirely opaque, but the runtime states
    // are not — 黑人牙膏's A0CO is 10% transparent and 克勞德's blink is 50%.
    const translucent = doc.transient.filter((s) => s.alpha !== undefined && s.alpha < 1);
    expect(translucent.length).toBeGreaterThan(0);
    expect(doc.transient.find((s) => s.line === 47379)?.alpha).toBe(0.9);
    expect(doc.transient.find((s) => s.line === 33417)?.alpha).toBe(0.5);
    for (const s of translucent) {
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThan(1);
    }

    // MAP BUGS: exactly the two restores that reset a tinted hero to white.
    // Each one must name a champion that HAS a static tint to lose — that is
    // what makes it a bug — and the port must restore to champion.tint.
    const bugs = doc.transient.filter((s) => s.erasesStaticTint === true);
    expect(bugs.map((s) => s.line).sort((a, b) => a - b)).toEqual([39537, 47390]);
    for (const bug of bugs) {
      expect(NEUTRAL(bug.tint), `${bug.line} must be the white restore`).toBe(true);
      const victim = readChampion(bug.championId);
      expect(victim.tint, `${bug.championId} has a tint the bug would erase`).toBeDefined();
      expect(NEUTRAL(victim.tint)).toBe(false);
    }
    // Berserker is the champion the original map does NOT bug out
    expect(bugs.some((s) => s.championId === "godie-hapm")).toBe(false);
  });
});

// ------------------------------------------------ #263 inheritance + controls

/**
 * Task #263 — the w3u→w3u inheritance step #49 did not have, and the two
 * champions the owner named as the reference.
 *
 * The resolution chain is: the entry's own `uclr/uclg/uclb` → its BASE entry in
 * `war3map.w3u` (custom OR original table) → the base chain's stock
 * `Units\UnitUI.slk` row → 255. #49 implemented steps 1 and 3 and skipped 2, so
 * `U00L` — which sets no colour of its own and inherits 200/200/200 from the
 * ORIGINAL-table entry `Umal` — shipped untinted.
 *
 * The controls exist because a shared-path change is how this gets broken:
 *   • 維尼 (godie-e00v) is coloured PARTLY by inheritance — the map sets only
 *     green=200 and blue=0, red comes from the stock `Ewrd` row (255). A
 *     resolver that treated a missing channel as 0 would turn him black; one
 *     that skipped the SLK would turn him red-less.
 *   • 小叮噹 (godie-n00b) resolves to (255,255,255) — NO tint at all. Its blue
 *     is the StormPandarenBrewmaster mesh's own texture. It must never grow a
 *     `tint` field: that would be inventing a colour the w3x never set.
 *
 * Regenerate with `python3 tools/w3x-import/resolve_unit_tints.py --check`.
 */
describe("#263 inheritance chain + the owner's two reference champions (tint263-inheritance)", () => {
  it("U00L inherits its base's colour; 維尼 keeps his; 小叮噹 stays untinted", () => {
    cover("tint263-inheritance");

    // THE FIX: the 變身 pair now agrees. Before #263 the alternate form was
    // untinted, so transforming visibly WASHED THE GREY OFF 拳四郎.
    const base = readChampion("godie-umal");
    const alternate = readChampion("godie-u00l");
    expect(base.tint).toEqual([0.7843, 0.7843, 0.7843]);
    expect(alternate.tint, "U00L inherits 200/200/200 from original-table Umal").toEqual(
      base.tint,
    );
    // and they really are the two halves of one 變身 link
    expect(base.transform?.counterpartId).toBe("godie-u00l");
    expect(alternate.transform?.counterpartId).toBe("godie-umal");

    // CONTROL 1 — 維尼: red 255 inherited from the stock Ewrd row, green 200
    // and blue 0 from the map. Byte-exact, not "roughly yellow".
    expect(readChampion("godie-e00v").tint).toEqual([1, 0.7843, 0]);

    // CONTROL 2 — 小叮噹: the w3x sets no vertex colour on N00B at all.
    expect(readChampion("godie-n00b").tint).toBeUndefined();
    expect(readChampion("godie-n00b").alpha).toBeUndefined();

    // the ledger records WHICH step of the chain each value came from, so a
    // future resolver change cannot quietly reclassify one
    const units = ledger().units;
    expect(units.U00L?.source).toBe("w3u-base-inherited");
    expect(units.Umal?.source).toBe("w3u-static");
    expect(units.E00V?.source).toBe("w3u-static"); // green/blue are explicit mods
    expect(units.Ecen?.source).toBe("slk-inherited");
    // 小叮噹 is not in the ledger at all — it has no colour to record
    expect(units.N00B).toBeUndefined();
  });
});

// -------------------------------------------------- #263 resolver ↔ content

/**
 * Task #263 — the RESOLVER GUARD. `tools/w3x-import/resolve_unit_tints.py`
 * re-derives every unit's effective colour from `war3map.w3u` + the stock
 * `Units\UnitUI.slk` and writes `out/GoDieEX22s-src/UNIT_TINTS.json`. That file
 * is the only machine-checkable statement of what the w3x actually says, and
 * this test is what makes it a GUARD rather than a report: three sources —
 * the resolver output, the champion docs, and the `config/unit-tints.json`
 * ledger — must agree in both directions.
 *
 * Why both directions matter. #49's ledger was hand-written, so the failure it
 * shipped was not a wrong number but a MISSING row (`U00L`). A test that only
 * walks the ledger can never see that. This one walks the resolver's 588 units
 * and fails when a tinted champion is absent from either the doc or the ledger
 * — which is exactly the shape of the #263 bug.
 *
 * The .json is committed, so this runs with no MPQs and no source map present
 * (a git worktree has neither).
 */
describe("#263 resolver ↔ champion docs ↔ ledger (tint263-resolver)", () => {
  it("agrees in both directions: no missing rows, no invented colours", () => {
    cover("tint263-resolver");
    const path = join(HERE, "../../../../tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as {
      units: Record<
        string,
        { rgb255: number[]; tint: number[]; neutral: boolean; championId?: string }
      >;
    };
    const units = Object.entries(doc.units);
    expect(units.length).toBeGreaterThan(500); // the whole w3u, not a slice

    const led = ledger().units;
    let checked = 0;
    for (const [rawcode, u] of units) {
      // an effective colour is (r,g,b)/255 — never a raw 0..255 channel
      expect(u.tint.every((c) => c >= 0 && c <= 1), rawcode).toBe(true);
      expect(u.neutral, rawcode).toBe(u.rgb255.every((c) => c === 255));

      if (!u.championId) continue;
      const champ = readChampion(u.championId);
      if (u.neutral) {
        // NOT tinted in the w3x ⇒ must not be tinted here. This is the
        // "don't invent a colour" rule, and 小叮噹 (N00B) is the case that
        // matters: its blue is the mesh texture, not a vertex colour.
        expect(champ.tint, `${rawcode} is untinted in the w3x`).toBeUndefined();
        expect(led[rawcode], `${rawcode} must not be in the ledger`).toBeUndefined();
        continue;
      }
      checked++;
      // the champion doc carries the resolved value, to 4dp
      expect(champ.tint, `${rawcode} -> ${u.championId}`).toBeDefined();
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(champ.tint![i]! - u.tint[i]!), `${rawcode} ch${i}`).toBeLessThan(0.002);
      }
      // …and so does the ledger (the audit document may not drift from either)
      expect(led[rawcode], `${rawcode} missing from the ledger`).toBeDefined();
      expect(led[rawcode]!.tint, `${rawcode} ledger`).toEqual(champ.tint);
    }
    // every champion-mapped tinted unit was actually walked
    expect(checked).toBe(EXPECTED.length);

    // and nothing in the ledger claims a colour the w3x does not have
    for (const [rawcode, e] of Object.entries(led)) {
      const u = doc.units[rawcode];
      expect(u, `ledger has ${rawcode}, the w3u does not`).toBeDefined();
      expect(u!.neutral, `${rawcode} is neutral in the w3x`).toBe(false);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(e.tint![i]! - u!.tint[i]!), `${rawcode} ch${i}`).toBeLessThan(0.002);
      }
    }
  });
});
