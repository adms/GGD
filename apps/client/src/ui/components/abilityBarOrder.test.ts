/**
 * abilityBarOrder — the combat bar reads 天生技 │ Q │ W │ E │ R │ EX (task #192).
 *
 * 「戰鬥時 技能按鈕順序應該是 天生技/Q/W/E/R/EX」. The order is a PROGRESSION —
 * what the champion was born with, what it learns, what it unlocks last — and
 * it is expressed as nothing but the order three JSX blocks sit in
 * `components/AbilityBar.tsx`. There is no array to assert against, no `order:`
 * CSS to read, and no way to notice the regression: moving the innate block back
 * to the end would compile, typecheck, and render a perfectly working bar in the
 * wrong order. So this file asserts the SOURCE, the same technique
 * ui/chromeReserve.test.ts and render/intermission/intermissionAudio.test.ts use.
 *
 * ---------------------------------------------------------------------------
 * AND IT ASSERTS THE WIRE ORDER DID NOT MOVE WITH IT
 * ---------------------------------------------------------------------------
 * This is the half that makes the file worth having. `CASTABLE_SLOTS` is
 * `["Q","W","E","R","EX","PASSIVE"]` and those positions are INDICES —
 * `seat.abilityRanks[i]`, `seat.cooldowns[i]`, `data-cast-slot={i}` and
 * `CastTracker.SLOT_INDEX` all key off them. The innate is index 5 while being
 * the FIRST tile, which looks like an inconsistency somebody will one day
 * "tidy up". Doing so would silently repoint every cooldown sweep in the bar
 * onto the wrong ability — a defect with no visible symptom until a player
 * watches the wrong tile grey out. Screen order and wire order are asserted
 * together, here, so the disagreement reads as deliberate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { CASTABLE_SLOTS, INNATE_SLOT } from "@ggd/shared/sim/intents";

/** Source with comments stripped, so prose about the order cannot satisfy a scan. */
function readSource(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const BAR = readSource("AbilityBar.tsx");

/**
 * Where each tile's block starts in the rendered bar. Anchored on the
 * `data-slot-key` each tile carries — the same attribute the per-frame cast
 * feedback loop finds tiles by, so it cannot drift away from the real DOM.
 */
function tileAt(key: string): number {
  const at = BAR.indexOf(`data-slot-key="${key}"`);
  expect(at, `AbilityBar has no tile with data-slot-key="${key}"`).toBeGreaterThanOrEqual(0);
  return at;
}

describe("the combat ability bar renders 天生技 / Q / W / E / R / EX (ability-bar-order)", () => {
  it("puts the 天生技 tile FIRST — before the Q/W/E/R map and before EX", () => {
    cover("ability-bar-order");
    const innate = tileAt("PASSIVE");
    const core = BAR.indexOf("SLOTS.map(");
    const ex = tileAt("EX");
    expect(core, "AbilityBar no longer maps SLOTS").toBeGreaterThanOrEqual(0);
    expect(innate).toBeLessThan(core);
    expect(innate).toBeLessThan(ex);
  });

  it("puts EX LAST — after the Q/W/E/R map", () => {
    cover("ability-bar-order");
    expect(BAR.indexOf("SLOTS.map(")).toBeLessThan(tileAt("EX"));
  });

  it("keeps Q/W/E/R themselves in key order inside that map", () => {
    cover("ability-bar-order");
    // The four actives are rendered from ONE array, so their order is that
    // array's order and nothing else.
    expect(BAR).toContain('const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];');
  });

  it("renders exactly the six slots, and no seventh", () => {
    cover("ability-bar-order");
    const keys = [...BAR.matchAll(/data-slot-key="([^"]+)"/g)].map((m) => m[1]);
    // Q/W/E/R come from the map (one literal `data-slot-key={slot}`), so the
    // literals present are the two hand-written tiles.
    expect(new Set(keys)).toEqual(new Set(["EX", "PASSIVE"]));
    expect(BAR).toContain("data-slot-key={slot}");
  });
});

describe("the WIRE order is NOT the screen order, and must not be re-sorted", () => {
  it("CASTABLE_SLOTS still ends with the innate — it is an index, not a ranking", () => {
    cover("ability-bar-order");
    expect(CASTABLE_SLOTS).toEqual(["Q", "W", "E", "R", "EX", INNATE_SLOT]);
    // the innate's index is what CastTracker/seat arrays address it by
    expect(CASTABLE_SLOTS.indexOf(INNATE_SLOT)).toBe(5);
  });

  it("the innate tile's cast-fill still carries wire index 5, not screen index 0", () => {
    cover("ability-bar-order");
    // The innate block moved to the front of the JSX; its data-cast-slot must
    // NOT have moved with it. Slice from the innate tile to the SLOTS.map that
    // now follows it, and require 5 inside that slice.
    const innate = tileAt("PASSIVE");
    const core = BAR.indexOf("SLOTS.map(");
    const block = BAR.slice(innate, core);
    expect(block).toContain("data-cast-slot={5}");
    expect(block).not.toContain("data-cast-slot={0}");
  });

  it("the EX tile still carries wire index 4", () => {
    cover("ability-bar-order");
    expect(BAR.slice(tileAt("EX"))).toContain("data-cast-slot={4}");
  });

  it("the Q/W/E/R tiles are still indexed by the map's own i", () => {
    cover("ability-bar-order");
    const core = BAR.indexOf("SLOTS.map(");
    expect(BAR.slice(core, tileAt("EX"))).toContain("data-cast-slot={i}");
  });
});
