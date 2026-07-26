/**
 * selfCastRange.test.ts — a `self` ability must not carry a range (#268).
 *
 * 18 abilities shipped with `castType: "self"` and `range: 11.0`. That 11.0 is
 * not a design value: it is WC3's 600 divided by the importer's GGD_PER_WC3
 * (11/600), i.e. the untouched default that also produced the 175-of-361
 * single-value pile the #268 census found. On a self-cast it is pure fiction —
 * three of the four consumers never read it at all:
 *
 *   • `abilitySystem`'s `case "self"` sets `targets = [caster]`
 *   • `AimResolver.resolveCastTarget`'s `case "self"` returns `{type:"self"}`
 *   • `Tier0Brain`'s `case "self"` ignores it
 *
 * The fourth does read it, and that is the whole problem: `resolveHoldPreview`
 * multiplies `range × envFactor("abilityRange")` for EVERY castType, so these
 * 18 drew a 6.60 u dashed circle on the floor advertising a reach of zero.
 * That is the worst form of "the circle disagrees with the range": the player
 * is shown a promise the ability structurally cannot keep.
 *
 * The fix is in the data rather than the preview layer, because the preview is
 * only one of several readers printing the same lie — the tooltip, the codex,
 * 後台內容管理 and the editor's `PreviewController` (which loads whole embedded
 * copies) all show it too. And 0 is not an invention: 269 of the other 287
 * self-casts already ship `"range": 0`. These 18 were the outliers.
 *
 * `resolveHoldPreview` early-returns on `range <= 0.1 && radius === null`, and
 * all 18 have a null radius, so at 0 they draw nothing at all — no orphan
 * radius ring left behind.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONTENT = join(__dirname, "../../../..", "content");

interface AbilityDoc {
  id: string;
  castType?: string;
  range?: number | null;
  radius?: number | null;
}

function standalone(): AbilityDoc[] {
  const dir = join(CONTENT, "abilities");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as AbilityDoc);
}

/**
 * Every embedded Q/W/E/R copy across every champion doc, flattened.
 *
 * The slots live at `champ.abilities.Q` — UPPERCASE, one level down. The first
 * draft of this file read `champ.q` and therefore returned an empty array, so
 * the mirror assertion below passed while proving nothing: a mutation that put
 * `range: 11.0` back into an embedded copy left it green. That is this repo's
 * signature failure mode (#259, #265, #73), caught here only because the
 * mutation was actually performed. `assertReaderIsLive()` exists so it cannot
 * come back silently.
 */
function embedded(): AbilityDoc[] {
  const dir = join(CONTENT, "champions");
  const out: AbilityDoc[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    const champ = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      abilities?: Record<string, AbilityDoc>;
    };
    for (const slot of ["Q", "W", "E", "R"]) {
      const a = champ.abilities?.[slot];
      if (a && typeof a === "object" && "castType" in a) out.push(a);
    }
  }
  return out;
}

describe("#268 a self-cast must not advertise a range it cannot reach", () => {
  it("no standalone self ability carries a non-zero range", () => {
    const offenders = standalone()
      .filter((a) => a.castType === "self" && (a.range ?? 0) !== 0)
      .map((a) => `${a.id} range=${a.range}`);
    expect(
      offenders,
      `a self-cast reaches exactly 0, but resolveHoldPreview draws ` +
        `range × abilityRange for every castType — so a non-zero range here is a ` +
        `dashed circle promising reach the ability structurally cannot have.`,
    ).toEqual([]);
  });

  it("the embedded reader is actually reading something", () => {
    // Guard on the guard. `embedded()` walks a nested, case-sensitive path; if
    // that path ever moves, every mirror assertion below silently passes on an
    // empty array. Both numbers are floors, not pins — content grows.
    const all = embedded();
    expect(all.length, "embedded() found no abilities — the slot path moved").toBeGreaterThan(300);
    expect(
      all.filter((a) => a.castType === "self").length,
      "embedded() found no self-casts — filtering, not reading, is broken",
    ).toBeGreaterThan(50);
  });

  it("nor does any embedded copy — the mirror has to agree", () => {
    const offenders = embedded()
      .filter((a) => a.castType === "self" && (a.range ?? 0) !== 0)
      .map((a) => `${a.id} range=${a.range}`);
    expect(
      offenders,
      `the standalone doc and the champion's embedded copy are two files holding ` +
        `the same ability; fixing one and not the other is how this content drifts.`,
    ).toEqual([]);
  });

  it("the 18 fixed here specifically have no radius, so they now draw nothing", () => {
    // Scoped to THESE 18 on purpose. A `self` ability with a radius is perfectly
    // legitimate — it is an aura or a self-centred nova, and 13 abilities ship
    // one deliberately (靈壓 9.17, 四次元口袋 14.67, 石化之眼 4.58, 靈壓震撼 11.0…),
    // nearly all of them passives. Asserting "no self ability has a radius"
    // would be asserting that auras are a bug.
    //
    // What matters is narrower: `resolveHoldPreview` early-returns on
    // `range <= 0.1 && radius === null`, so range→0 only silences these 18
    // because their radius is null too. If someone later gives one of them an
    // AoE, the circle comes back — and that would then be a real AoE worth
    // drawing, but it should be a decision, not a surprise.
    const FIXED = [
      "godie-h00l.e", "godie-h02k.e", "godie-h02y.e", "godie-harf.e",
      "godie-hvwd.q", "godie-hvwd.w", "godie-n003.w", "godie-n01g.w",
      "godie-n01l.e", "godie-n01l.r", "godie-n01l.w", "godie-opgh.r",
      "godie-opgh.w", "godie-osam.q", "godie-u010.r", "godie-u011.e",
      "godie-u012.e", "godie-uvng.r",
    ];
    const byId = new Map(standalone().map((a) => [a.id, a]));
    const stillDraws = FIXED.filter((id) => {
      const a = byId.get(id);
      return a !== undefined && (a.radius ?? null) !== null;
    });
    expect(stillDraws, "range is 0 but a radius was added — the circle is back").toEqual([]);
    // …and the roster itself has to still exist, or the list above is a no-op.
    expect(FIXED.filter((id) => !byId.has(id))).toEqual([]);
  });

  it("11.0 specifically is gone — that number is the importer's WC3-600 default", () => {
    // Pinned separately from "non-zero" so the census's root cause stays legible:
    // 175 of 361 ranged abilities carried exactly 11.0 = 600 × (11/600).
    const eleven = [...standalone(), ...embedded()].filter(
      (a) => a.castType === "self" && a.range === 11,
    );
    expect(eleven.map((a) => a.id)).toEqual([]);
  });
});
