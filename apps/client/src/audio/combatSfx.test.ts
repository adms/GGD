/**
 * per-frame combat SFX key selection (juice-sfx-key): the enriched `damage`
 * event maps to type-differentiated hit / block / crit voices; guardBreak /
 * knockdown / whiff each get their own; pre-hit + utility events pass through;
 * tally-owned events (death/levelUp) and timing-only events map to silence.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import {
  combatSfxKey,
  weaponAttackKey,
  castElementKey,
  guardianRewardKey,
  setCombatSfxSeat,
  combatSfxSeat,
} from "./combatSfx";

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
    // basicAttack / abilityCast with NO routing data fall back to the generic
    // clip whose key == the event name, so they belong in this list too.
    for (const t of ["attackWindup", "basicAttack", "projectileSpawn", "projectileHit", "castBegin", "abilityCast", "flowerBurst", "heal"]) {
      expect(combatSfxKey(ev(t))).toBe(t);
    }
  });

  it("newly-fired sim events pass through by name (buff / explosion / revive)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("buffApply", { source: 1, target: 2 }))).toBe("buffApply");
    expect(combatSfxKey(ev("explosion", { caster: 1, x: 0, z: 0 }))).toBe("explosion");
    expect(combatSfxKey(ev("reviveChannel", { id: 5, channeller: 1 }))).toBe("reviveChannel");
    expect(combatSfxKey(ev("reviveComplete", { id: 5, ownerId: 3 }))).toBe("reviveComplete");
  });

  it("fireRingStart renames to the fireRingLoop closing-ring bed (#132)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 900 }))).toBe("fireRingLoop");
  });

  describe("per-weapon basic-attack routing (全用)", () => {
    it("routes each weapon class to its slash, sword uses the crit variant", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "sword" }))).toBe("attackSword1");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "sword", crit: true }))).toBe("attackSword2");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "greatsword" }))).toBe("attackGreatsword");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "katana" }))).toBe("attackKatana");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "bow" }))).toBe("bowDraw");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "gun" }))).toBe("gunshot");
    });

    it("falls back to the generic swing for unknown/absent/malformed class", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("basicAttack"))).toBe("basicAttack");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "spear" }))).toBe("basicAttack");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: 42 }))).toBe("basicAttack");
    });

    it("weaponAttackKey is a pure helper: known → clip, else null", () => {
      cover("juice-sfx-key");
      expect(weaponAttackKey("bow", false)).toBe("bowDraw");
      expect(weaponAttackKey("sword", false)).toBe("attackSword1");
      expect(weaponAttackKey("sword", true)).toBe("attackSword2");
      expect(weaponAttackKey("nope", false)).toBeNull();
      expect(weaponAttackKey(undefined, false)).toBeNull();
    });
  });

  describe("per-element ability-cast routing (全用)", () => {
    it("derives the element from an fx.prim.<element>.<shape> vfxKey", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "fx.prim.fire.nova" }))).toBe("magicFire");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "fx.prim.ice.bolt" }))).toBe("magicIce");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "fx.prim.lightning.beam" }))).toBe("magicLightning");
    });

    it("falls back to the generic cast for unrouted element / absent / malformed vfxKey", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("abilityCast"))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "fx.prim.holy.nova" }))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "not.a.prim.key" }))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: "fire" }))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { vfxKey: 99 }))).toBe("abilityCast");
    });

    it("castElementKey is a pure helper: routed element → clip, else null", () => {
      cover("juice-sfx-key");
      expect(castElementKey("fx.prim.fire.slash")).toBe("magicFire");
      expect(castElementKey("fx.prim.ice.nova")).toBe("magicIce");
      expect(castElementKey("fx.prim.arcane.bolt")).toBeNull();
      expect(castElementKey("fx.fire")).toBeNull();
      expect(castElementKey(undefined)).toBeNull();
    });
  });

  it("rankUp renames to the abilityRankUp cue (#51 staged clip)", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("rankUp", { id: 1, slot: "Q", rank: 2 }))).toBe("abilityRankUp");
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

/**
 * NEUTRAL GUARDIAN audio (#89, per-arena faces #105). Two clips, two very
 * different firing rules: the AoE punish is a world sound everyone hears, the
 * last-hit bounty is a private reward for one seat.
 */
describe("guardian SFX (#89/#105)", () => {
  afterEach(() => setCombatSfxSeat(null));

  it("guardianImpact renames to the guardianSlam heavy stone hit", () => {
    cover("juice-sfx-key");
    expect(combatSfxKey(ev("guardianImpact", { id: 7, x: 3, z: -2 }))).toBe("guardianSlam");
  });

  it("the pre-land telegraph and the tower's other life-cycle events stay silent", () => {
    cover("juice-sfx-key");
    // guardianMark is the DODGE window (VfxSystem draws the filling ring) — the
    // slam belongs to the landing, not the warning, or the beat sounds twice.
    expect(combatSfxKey(ev("guardianMark", { id: 7, targets: [], impactTick: 30 }))).toBeNull();
    expect(combatSfxKey(ev("guardianSpawn", { id: 7, zone: 0 }))).toBeNull();
    expect(combatSfxKey(ev("guardianWake", { id: 7 }))).toBeNull();
    expect(combatSfxKey(ev("guardianSleep", { id: 7 }))).toBeNull();
    expect(combatSfxKey(ev("guardianHeirPulse", { id: 4 }))).toBeNull();
  });

  it("guardianSlain rings guardianLastHit ONLY for the seat that last-hit it", () => {
    cover("juice-sfx-key");
    const slain = ev("guardianSlain", { id: 7, x: 0, z: 0, killerSeatId: 3, gold: 120 });
    expect(guardianRewardKey(slain, 3)).toBe("guardianLastHit");
    // every other seat in the room receives the SAME broadcast event and must
    // hear nothing — the gold was paid to exactly one player.
    expect(guardianRewardKey(slain, 0)).toBeNull();
    expect(guardianRewardKey(slain, 5)).toBeNull();
    // no local seat yet (spectator / pre-join) → silence, never a crash
    expect(guardianRewardKey(slain, null)).toBeNull();
  });

  it("a VOID payout is silent even for the killer's own seat", () => {
    cover("juice-sfx-key");
    // killer died / left the zone in the same tick: the guardian still despawns
    // but nobody is paid (GuardianSystem.payout → killerSeatId -1, gold 0).
    const voided = ev("guardianSlain", { id: 7, x: 0, z: 0, killerSeatId: -1, gold: 0 });
    expect(guardianRewardKey(voided, -1)).toBeNull();
    expect(guardianRewardKey(voided, 2)).toBeNull();
    // a matching seat but a zero bounty is still nothing to celebrate
    const zero = ev("guardianSlain", { id: 7, killerSeatId: 2, gold: 0 });
    expect(guardianRewardKey(zero, 2)).toBeNull();
  });

  it("is total on a malformed guardianSlain payload", () => {
    cover("juice-sfx-key");
    expect(guardianRewardKey(ev("guardianSlain", {}), 1)).toBeNull();
    expect(guardianRewardKey(ev("guardianSlain", { killerSeatId: "1" }), 1)).toBeNull();
    // a non-numeric gold field is ignored rather than treated as a void payout
    expect(guardianRewardKey(ev("guardianSlain", { killerSeatId: 1, gold: "lots" }), 1)).toBe(
      "guardianLastHit",
    );
  });

  it("combatSfxKey reads the seat the AudioDirector published", () => {
    cover("juice-sfx-key");
    const slain = ev("guardianSlain", { id: 7, killerSeatId: 4, gold: 120 });
    expect(combatSfxKey(slain)).toBeNull(); // no seat published yet
    setCombatSfxSeat(4);
    expect(combatSfxSeat()).toBe(4);
    expect(combatSfxKey(slain)).toBe("guardianLastHit");
    setCombatSfxSeat(1); // a different local player watching the same match
    expect(combatSfxKey(slain)).toBeNull();
    setCombatSfxSeat(null); // director unmounted — back to silence
    expect(combatSfxKey(slain)).toBeNull();
  });

  it("fires once per kill, not once per hit on the tower", () => {
    cover("juice-sfx-key");
    setCombatSfxSeat(3);
    // the whole siege: many damage packets, one death, one payout event.
    for (let i = 0; i < 20; i++) {
      expect(combatSfxKey(ev("damage", { amount: 40, target: 7, source: 11 }))).toBe("hit");
    }
    expect(combatSfxKey(ev("death", { id: 7, killer: 11 }))).toBeNull();
    expect(combatSfxKey(ev("guardianSlain", { id: 7, killerSeatId: 3, gold: 120 }))).toBe(
      "guardianLastHit",
    );
  });
});
