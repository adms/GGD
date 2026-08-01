/**
 * damage-colors-coalesce — a coalesced number must not lie about its school.
 *
 * `pushCombatText`'s same-tick coalesce folds a second hit on the SAME target in
 * the SAME category into the live node instead of spawning a new one (task #92:
 * an AoE that double-dips, two lifesteal sources). That was colour-neutral until
 * owner's 2026-08-01 ruling made the fill mean the damage SCHOOL — after which
 * folding a 真實 tick into a live 物理 number paints their SUM in the first
 * arrival's red, i.e. one number asserting that both hits were physical.
 *
 * This is the only place in the pipeline where two events with different schools
 * can end up sharing one glyph, so it is the only place that needs the guard.
 * Drive the REAL `pushCombatText` on the real bus — the coalesce branch is not
 * reachable any other way.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  frameBus,
  pushCombatText,
  clearCombatText,
  setDamageNumberCap,
  setCombatTextScope,
  type CombatTextInput,
} from "./frameBus";
import { COALESCE_MS } from "./ui/combatText";

const TAG = "damage-colors-coalesce";
const T0 = 10_000;

const hit = (over: Partial<CombatTextInput> = {}): CombatTextInput => ({
  kind: "damage",
  amount: 40,
  sourceRel: "self",
  targetRel: "enemy",
  crit: false,
  blocked: false,
  killingBlow: false,
  targetId: 7,
  worldX: 0,
  worldZ: 0,
  nowMs: T0,
  ...over,
});

const live = (): typeof frameBus.combatText => frameBus.combatText.filter((e) => e.active);

beforeEach(() => {
  clearCombatText();
  setCombatTextScope("team");
  setDamageNumberCap(48);
});

describe("同一 tick 合併不可以跨傷害屬性 (damage-colors-coalesce)", () => {
  it("two PHYSICAL ticks inside the window still coalesce (the behaviour is intact)", () => {
    cover(TAG);
    pushCombatText(hit({ amount: 40, dmgType: "physical" }));
    pushCombatText(hit({ amount: 12, dmgType: "physical", nowMs: T0 + 5 }));
    expect(live()).toHaveLength(1);
    expect(live()[0]!.amount).toBe(52);
  });

  it("a TRUE tick does NOT fold into a live PHYSICAL number", () => {
    cover(TAG);
    pushCombatText(hit({ amount: 40, dmgType: "physical" }));
    pushCombatText(hit({ amount: 12, dmgType: "true", nowMs: T0 + 5 }));
    const rows = live();
    expect(rows).toHaveLength(2);
    // …and neither number claims the other's magnitude
    expect(rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([12, 40]);
    expect(rows.map((r) => r.dmgType).sort()).toEqual(["physical", "true"]);
  });

  it("magic vs physical likewise stays two numbers", () => {
    cover(TAG);
    pushCombatText(hit({ amount: 30, dmgType: "physical" }));
    pushCombatText(hit({ amount: 30, dmgType: "magic", nowMs: T0 + 1 }));
    expect(live()).toHaveLength(2);
  });

  it("heal has no school, so healing still coalesces exactly as before", () => {
    cover(TAG);
    // both sides carry `dmgType: undefined`, which compares equal — this is the
    // assertion that keeps the new check from fragmenting the non-damage pools.
    const heal = { kind: "heal" as const, targetRel: "self" as const, sourceRel: "self" as const };
    pushCombatText(hit({ ...heal, amount: 25 }));
    pushCombatText(hit({ ...heal, amount: 25, nowMs: T0 + 3 }));
    expect(live()).toHaveLength(1);
    expect(live()[0]!.amount).toBe(50);
  });

  it("past the window a same-school hit is its own number regardless", () => {
    cover(TAG);
    pushCombatText(hit({ amount: 40, dmgType: "true" }));
    pushCombatText(hit({ amount: 40, dmgType: "true", nowMs: T0 + COALESCE_MS + 1 }));
    expect(live()).toHaveLength(2);
  });
});
