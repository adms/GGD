/**
 * per-frame combat SFX key selection (juice-sfx-key): the enriched `damage`
 * event maps to type-differentiated hit / block / crit voices; guardBreak /
 * knockdown / whiff each get their own; pre-hit + utility events pass through;
 * tally-owned events (death/levelUp) and timing-only events map to silence.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { WEAPON_TAGS } from "@ggd/shared/sim/systems/BasicAttackSystem";
import {
  combatSfxKey,
  weaponAttackKey,
  castElementKey,
  wc3CastKey,
  guardianRewardKey,
  setCombatSfxSeat,
  combatSfxSeat,
  castTelegraphKey,
  resetProjectileSfx,
  arrowsInFlight,
  CAST_CIRCLE_MIN_SEC,
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
      // 法師普攻 — the class that did not exist until 2026-07-24, which is why
      // every caster answered a spell with a BOW DRAW.
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "magic" }))).toBe("magicBolt");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "magic", crit: true }))).toBe("magicBolt");
      // 投擲 — the generic whoosh, STATED rather than defaulted (no 投擲 clip in
      // the pack). The assertion that matters is the second one: not a bow.
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "thrown" }))).toBe("basicAttack");
      expect(combatSfxKey(ev("basicAttack", { weaponClass: "thrown" }))).not.toBe("bowDraw");
    });

    /**
     * THE TWO-FILE CONTRACT, made a test rather than a promise.
     *
     * `weaponClassOf` always answers, so a class the client does not route falls
     * back to the generic swing SILENTLY — which is exactly how `magic` shipped
     * as a bow draw for months without a single failing test. Importing the
     * vocabulary from the sim (never a copy of it) makes adding a member here a
     * red build until someone decides what it sounds like.
     */
    it("every sim weapon class has a DECIDED clip — none falls back by accident", () => {
      cover("juice-sfx-key");
      expect(WEAPON_TAGS.length).toBeGreaterThan(0);
      for (const w of WEAPON_TAGS) {
        expect(weaponAttackKey(w, false), `weapon class '${w}' has no decided clip`).not.toBeNull();
      }
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

  describe("per-ability WC3 cast voice (ability@1.sfxKey — 音效 on ability ports)", () => {
    it("plays the source map's own clip for an ability that carries sfxKey", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("abilityCast", { sfxKey: "wc3.moongo" }))).toBe("wc3.moongo");
      expect(combatSfxKey(ev("abilityCast", { sfxKey: "wc3.moonjump" }))).toBe("wc3.moonjump");
      // 裝可愛 is an INSTANT self cast — no castBegin ever fires for it, which
      // is exactly why this routing rides abilityCast and not castBegin.
      expect(combatSfxKey(ev("abilityCast", { sfxKey: "wc3.nocute" }))).toBe("wc3.nocute");
    });

    it("outranks the element whoosh: the WC3 clip is the authentic cast sound", () => {
      cover("juice-sfx-key");
      // godie-umal.r carries BOTH fx.prim.lightning.pulse-lg and wc3.nocute —
      // the source map's own clip wins over the invented element voice.
      expect(
        combatSfxKey(ev("abilityCast", { sfxKey: "wc3.nocute", vfxKey: "fx.prim.lightning.pulse-lg" })),
      ).toBe("wc3.nocute");
    });

    it("falls through to element/generic on an undeclared / absent / malformed sfxKey", () => {
      cover("juice-sfx-key");
      // an sfxKey the client has no clip for degrades to the element route…
      expect(
        combatSfxKey(ev("abilityCast", { sfxKey: "wc3.not-shipped", vfxKey: "fx.prim.fire.nova" })),
      ).toBe("magicFire");
      // …and to the generic cast when there is no element either
      expect(combatSfxKey(ev("abilityCast", { sfxKey: "wc3.not-shipped" }))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { sfxKey: 42 }))).toBe("abilityCast");
      expect(combatSfxKey(ev("abilityCast", { sfxKey: "" }))).toBe("abilityCast");
    });

    it("wc3CastKey is a pure helper: declared cue → itself, else null", () => {
      cover("juice-sfx-key");
      expect(wc3CastKey("wc3.moongo")).toBe("wc3.moongo");
      expect(wc3CastKey("wc3.moonjump")).toBe("wc3.moonjump");
      expect(wc3CastKey("wc3.nocute")).toBe("wc3.nocute");
      expect(wc3CastKey("abilityCast")).toBeNull(); // never a lateral map key
      expect(wc3CastKey("wc3.unknown")).toBeNull();
      expect(wc3CastKey(undefined)).toBeNull();
      expect(wc3CastKey(7)).toBeNull();
    });

    it("honours a stock-MPQ overlay cue only when the full-asset overlay is on", () => {
      cover("juice-sfx-key");
      // The stock wave (task #78 remainder) lives in the dev-only
      // assets/blizzard-local mount, so the key passes on an overlay build…
      expect(wc3CastKey("wc3.flaretarget3", true)).toBe("wc3.flaretarget3");
      expect(wc3CastKey("wc3.peondeath", true)).toBe("wc3.peondeath");
      expect(wc3CastKey("wc3.taunt", true)).toBe("wc3.taunt");
      // …and answers null on a public bundle — the cast must fall back to the
      // element/generic voice, never resolve to a URL prod does not serve.
      expect(wc3CastKey("wc3.flaretarget3", false)).toBeNull();
      expect(wc3CastKey("wc3.peondeath", false)).toBeNull();
      // the committed map-author imports are honoured on EVERY tier
      expect(wc3CastKey("wc3.nocute", false)).toBe("wc3.nocute");
      // junk stays junk regardless of tier
      expect(wc3CastKey("wc3.not-shipped", true)).toBeNull();
    });

    it("routes a full ability cast through an overlay cue (vitest = dev build)", () => {
      cover("juice-sfx-key");
      // vitest runs under vite's dev env, so the default overlayEnabled arm is
      // the full-asset one — the stock cue outranks the element whoosh exactly
      // like the committed three do.
      expect(
        combatSfxKey(ev("abilityCast", { sfxKey: "wc3.soulgem", vfxKey: "fx.prim.fire.nova" })),
      ).toBe("wc3.soulgem");
    });
  });

  describe("archery: 放箭 / 箭矢命中 joined client-side (no new sim event)", () => {
    afterEach(() => resetProjectileSfx());

    /** the exact adjacent pair BasicAttackSystem emits for one bow auto */
    const bowShot = (source: number, pid: number): EventMessage[] => [
      ev("basicAttack", { source, target: 99, crit: false, ranged: true, weaponClass: "bow" }),
      ev("projectileSpawn", { id: pid, owner: source, projectileId: "basic-attack" }),
    ];

    it("draws, releases and pierces across the shot's three events", () => {
      cover("juice-sfx-key");
      const [draw, release] = bowShot(4, 501);
      expect(combatSfxKey(draw!)).toBe("bowDraw");
      expect(combatSfxKey(release!)).toBe("arrowRelease");
      // the arrival: `basicAttackHit` is silent for everything BUT this arrow
      expect(combatSfxKey(ev("basicAttackHit", { id: 501, owner: 4, target: 99 }))).toBe(
        "arrowPierce",
      );
      // …and only once — a repeat of the same id is the generic silence again
      expect(combatSfxKey(ev("basicAttackHit", { id: 501, owner: 4, target: 99 }))).toBeNull();
      expect(arrowsInFlight()).toBe(0);
    });

    it("leaves every non-bow missile on the generic launch/impact", () => {
      cover("juice-sfx-key");
      // a gun auto: the swing routes to gunshot, the bullet keeps generic launch
      expect(
        combatSfxKey(ev("basicAttack", { source: 2, ranged: true, weaponClass: "gun" })),
      ).toBe("gunshot");
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 77, owner: 2, projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
      expect(combatSfxKey(ev("basicAttackHit", { id: 77, owner: 2 }))).toBeNull();
      // a MAGE auto: the bolt routes to magicBolt, and its missile must NOT be
      // mistaken for an arrow — the join is armed on weaponClass === "bow" only,
      // so adding a caster class cannot leak 放箭/箭矢命中 onto a spell bolt.
      expect(
        combatSfxKey(ev("basicAttack", { source: 3, ranged: true, weaponClass: "magic" })),
      ).toBe("magicBolt");
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 79, owner: 3, projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
      expect(combatSfxKey(ev("basicAttackHit", { id: 79, owner: 3 }))).toBeNull();
      expect(arrowsInFlight()).toBe(0);
      // an ability skillshot from the same archer never becomes an arrow either
      expect(
        combatSfxKey(ev("basicAttack", { source: 4, ranged: true, weaponClass: "bow" })),
      ).toBe("bowDraw");
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 78, owner: 4, projectileId: "ivy-thorn" })),
      ).toBe("projectileSpawn");
      expect(arrowsInFlight()).toBe(0);
    });

    it("never claims another champion's missile (the arm is owner-matched)", () => {
      cover("juice-sfx-key");
      expect(
        combatSfxKey(ev("basicAttack", { source: 4, ranged: true, weaponClass: "bow" })),
      ).toBe("bowDraw");
      // a DIFFERENT entity's projectile lands in between → generic, and the arm
      // is spent, so the archer's own missile does not inherit it either
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 80, owner: 9, projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 81, owner: 4, projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
      expect(arrowsInFlight()).toBe(0);
    });

    it("a melee bow-less swing disarms the join", () => {
      cover("juice-sfx-key");
      combatSfxKey(ev("basicAttack", { source: 4, ranged: true, weaponClass: "bow" }));
      // a melee sword swing resolves between the two halves of the archery pair
      expect(combatSfxKey(ev("basicAttack", { source: 5, weaponClass: "sword" }))).toBe(
        "attackSword1",
      );
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 82, owner: 4, projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
    });

    it("arrows that expire without hitting cannot grow without bound", () => {
      cover("juice-sfx-key");
      // 500 shots that all sail past their target (no basicAttackHit ever)
      for (let pid = 0; pid < 500; pid++) {
        for (const e of bowShot(4, pid)) combatSfxKey(e);
      }
      expect(arrowsInFlight()).toBeLessThanOrEqual(64);
      // the newest shot is still tracked; the oldest has been evicted
      expect(combatSfxKey(ev("basicAttackHit", { id: 499, owner: 4 }))).toBe("arrowPierce");
      expect(combatSfxKey(ev("basicAttackHit", { id: 0, owner: 4 }))).toBeNull();
    });

    it("a malformed payload degrades to the generic clip, never throws", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("projectileSpawn"))).toBe("projectileSpawn");
      expect(combatSfxKey(ev("basicAttackHit", { id: "501" }))).toBeNull();
      combatSfxKey(ev("basicAttack", { source: "4", ranged: true, weaponClass: "bow" }));
      expect(
        combatSfxKey(ev("projectileSpawn", { id: 90, owner: "4", projectileId: "basic-attack" })),
      ).toBe("projectileSpawn");
    });

    it("resetProjectileSfx clears the tracking (match teardown)", () => {
      cover("juice-sfx-key");
      for (const e of bowShot(4, 600)) combatSfxKey(e);
      expect(arrowsInFlight()).toBe(1);
      resetProjectileSfx();
      expect(arrowsInFlight()).toBe(0);
      expect(combatSfxKey(ev("basicAttackHit", { id: 600, owner: 4 }))).toBeNull();
    });
  });

  describe("魔法陣: castBegin splits on the length of the wind-up", () => {
    it("long casts get the circle, short casts keep the dry tick", () => {
      cover("juice-sfx-key");
      expect(combatSfxKey(ev("castBegin", { caster: 1, castTimeSec: 0.3 }))).toBe("castBegin");
      expect(combatSfxKey(ev("castBegin", { caster: 1, castTimeSec: 0.4 }))).toBe("castBegin");
      expect(combatSfxKey(ev("castBegin", { caster: 1, castTimeSec: 0.5 }))).toBe("castCircle");
      expect(combatSfxKey(ev("castBegin", { caster: 1, castTimeSec: 0.9 }))).toBe("castCircle");
    });

    it("castTelegraphKey is a pure helper, total on junk", () => {
      cover("juice-sfx-key");
      expect(CAST_CIRCLE_MIN_SEC).toBe(0.5);
      expect(castTelegraphKey(CAST_CIRCLE_MIN_SEC)).toBe("castCircle");
      expect(castTelegraphKey(0.49)).toBe("castBegin");
      expect(castTelegraphKey(undefined)).toBe("castBegin");
      expect(castTelegraphKey("0.8")).toBe("castBegin");
      expect(castTelegraphKey(Number.NaN)).toBe("castBegin");
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
