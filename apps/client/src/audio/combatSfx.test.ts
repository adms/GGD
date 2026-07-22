/**
 * per-frame combat SFX key selection (juice-sfx-key): the enriched `damage`
 * event maps to type-differentiated hit / block / crit voices; guardBreak /
 * knockdown / whiff each get their own; pre-hit + utility events pass through;
 * tally-owned events (death/levelUp) and timing-only events map to silence.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { combatSfxKey } from "./combatSfx";

const ev = (type: string, data: Record<string, unknown> = {}): EventMessage => ({
  type,
  tick: 0,
  data,
});

describe("combat SFX key selection (juice-sfx-key)", () => {
  it("differentiates the hit voice by dmgType (物理/魔法/true)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("damage", { amount: 30, dmgType: "physical" }))).toBe("hit");
    expect(combatSfxKey(ev("damage", { amount: 30, dmgType: "magic" }))).toBe("hitMagic");
    expect(combatSfxKey(ev("damage", { amount: 30, dmgType: "true" }))).toBe("hitTrue");
    // falls back to the sim's raw `type` when dmgType is absent
    expect(combatSfxKey(ev("damage", { amount: 30, type: "magic" }))).toBe("hitMagic");
    // default = physical
    expect(combatSfxKey(ev("damage", { amount: 30 }))).toBe("hit");
  });

  it("blocked → 防禦 block, crit/killingBlow → crit (override the type voice)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("damage", { amount: 10, dmgType: "physical", blocked: true }))).toBe("block");
    expect(combatSfxKey(ev("damage", { amount: 90, dmgType: "physical", crit: true }))).toBe("crit");
    expect(combatSfxKey(ev("damage", { amount: 90, dmgType: "magic", killingBlow: true }))).toBe("crit");
  });

  it("guardBreak / knockdown / whiff get distinct keys", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("guardBreak", { target: 1 }))).toBe("guardBreak");
    expect(combatSfxKey(ev("knockdown", { target: 1 }))).toBe("knockdown");
    expect(combatSfxKey(ev("whiff", { source: 1 }))).toBe("whiff");
  });

  it("pre-hit + utility events pass through by name", () => {
    cover("juice-sfx-key");
    for (const t of ["attackWindup", "basicAttack", "projectileSpawn", "projectileHit", "castBegin", "abilityCast", "flowerBurst"]) {
      expect(combatSfxKey(ev(t))).toBe(t);
    }
  });

  it("timing-only + tally-owned events are silent (no double sound)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("hitImpact", { dmgType: "physical" }))).toBeNull(); // timing only
    expect(combatSfxKey(ev("basicAttackHit"))).toBeNull(); // damage covers the hit voice
    expect(combatSfxKey(ev("death", { id: 1 }))).toBeNull(); // AudioDirector tally
    expect(combatSfxKey(ev("levelUp"))).toBeNull(); // AudioDirector tally
    expect(combatSfxKey(ev("somethingUnknown"))).toBeNull();
  });
});
