/**
 * 傷害型別轉換 (無視防禦 / 真實傷害) —— THE MECHANISM, proved on fixtures.
 *
 * The shipped docs are pinned separately in `damageTypeOverride.shipped.test.ts`
 * (失敗形態 ⑤: a mechanism test that hand-writes its own source proves nothing
 * about the item players actually get). This file proves the RULES:
 *
 *   1. IT ACTUALLY BYPASSES ARMOUR. The same 100-damage physical packet costs
 *      the victim strictly more HP with the override on. This is the assertion
 *      that dies if the re-stamp moves below `mitigate()`.
 *   2. SCOPE DISCRIMINATES. `"basic"` leaves an ability packet alone and
 *      `"ability"` leaves a basic alone — the whole reason scope is a field.
 *   3. IT REACHES THE RANGED PATH. A real ranged auto (ProjectileSystem, a
 *      DIFFERENT `damageQueue.push` site from the melee one) is converted too.
 *      This is the test the "read it in BasicAttackSystem" design fails.
 *   4. THE PHASE FIELD IS REAL. Default `"afterGates"` leaves 魔法免疫 able to
 *      refuse a converted ability; `"beforeGates"` does not.
 *   5. IT IS ORDER-FREE. Two conflicting sources give the same answer in both
 *      attach orders (`sc.sources` order is purchase order).
 *   6. IT EXPIRES. A source past `expiresAtTick` stops converting.
 *   7. AT ABSENT IT DOES NOT EXIST. No source ⇒ the packet keeps its authored
 *      type, i.e. arming the field is a strict no-op for the other 216 items.
 *   8. THE TWO-PHASE BOOKKEEPING IS ASYMMETRIC, and the four rows are written
 *      out. `applyDamageConversion`'s docblock used to claim the `??` preserved
 *      「最原始的那一個」 across both phases; that is true only while every phase
 *      chose `"original"`, because `"converted"` DELETES the record. The code
 *      was kept and the sentence rewritten (2026-08-01) — the table at the
 *      bottom of this file is that sentence, executable.
 *
 * MUTATION LOG (第二守則) — every one of these was run RED then reverted GREEN;
 * the exact edits are in the report and repeated at each assertion below.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { zeroStats, Stat } from "../stats/statTypes";
import type { ModifierSource } from "../stats/modifiers";
import { grantImmunity } from "../effects/invulnerable";
import { combatResolveSystem } from "./damage";
import { runEffects } from "../effects/effectRunner";
import { originInScope, resolveDamageTypeOverride } from "./damageTypeOverride";
import type { DamageType, EffectDef } from "../effects/effect";
import type {
  ConvertedImpactType,
  DamageConversionScope,
  DamageTypeOverride,
} from "./damageTypeOverride";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import * as V from "../math/vec2";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center;
const Y = 14; // pillar-free band, same reason as combatJuice.test.ts

const makeWorld = (seed = 42): SimWorld => new SimWorld(SKELETON_ARENA, seed);

/**
 * A combat dummy with a REAL `StatsComp`, so both halves of the mechanism have
 * something to read: the victim's `Stat.Armor` (what `mitigate()` divides by)
 * and the attacker's `sources` (where the override rides).
 */
function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: { hp?: number; armor?: number; mr?: number; sources?: ModifierSource[] } = {},
): EntityId {
  const id = world.spawn();
  const hp = opts.hp ?? 100_000; // huge, so nothing under test can land a kill
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: hp, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.Armor] = opts.armor ?? 0;
  final[Stat.MagicResist] = opts.mr ?? 0;
  world.stats.set(id, {
    championId: "dummy" as ChampionId,
    final,
    dirty: false,
    sources: opts.sources ?? [],
  });
  return id;
}

/** The fixture shape the three shipped weapons produce. */
const weapon = (ov: DamageTypeOverride, id = "item:fixture#0"): ModifierSource => ({
  id,
  kind: "item",
  damageTypeOverride: ov,
});

/**
 * Push ONE packet and drain the queue. `combatResolveSystem` directly rather
 * than `world.step()` so no regen tick blurs the HP delta — the numbers below
 * are exact, not `toBeCloseTo(…, 0)`.
 */
function hitFor(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: DamageType,
  origin: string,
): { hpLost: number; dmgType: string } {
  const before = world.health.get(target)!.hp;
  world.events.length = 0;
  world.damageQueue.push({ source, target, amount, type, crit: false, origin });
  combatResolveSystem(world);
  const ev = world.events.find((e) => e.type === "damage")?.data as
    | { dmgType?: string }
    | undefined;
  return { hpLost: before - world.health.get(target)!.hp, dmgType: ev?.dmgType ?? "<none>" };
}

// ───────────────────────────────────────────────────────── ① 真的跳過護甲 ────
describe("無視防禦 —— the packet is re-stamped BEFORE mitigation", () => {
  it("a basic attack against 100 armor loses HALF its damage without the item, and NONE with it", () => {
    // 100 armor ⇒ 100/(100+100) = 0.5. The two runs differ ONLY by the source.
    const plainWorld = makeWorld();
    const plainA = spawnDummy(plainWorld, 0, 0, { x: ZC.x, z: Y });
    const plainB = spawnDummy(plainWorld, 1, 1, { x: ZC.x + 3, z: Y }, { armor: 100 });
    const plain = hitFor(plainWorld, plainA, plainB, 100, "physical", "basic");
    expect(plain.hpLost).toBeCloseTo(50, 9);
    expect(plain.dmgType).toBe("physical");

    const armedWorld = makeWorld();
    const armedA = spawnDummy(armedWorld, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "basic", becomes: "true" })],
    });
    const armedB = spawnDummy(armedWorld, 1, 1, { x: ZC.x + 3, z: Y }, { armor: 100 });
    const armed = hitFor(armedWorld, armedA, armedB, 100, "physical", "basic");

    // ⚠️ THE MUTATION THAT KILLS THIS: move the `postGate` re-stamp in
    // `combat/damage.ts` below `const impact = mitigate(world, pkt);`. The whole
    // family becomes cosmetic (the client still draws a white number) and this
    // line reads 50 instead of 100.
    expect(armed.hpLost).toBeCloseTo(100, 9);
    // …and the CLIENT is told the same thing, so the floating number and the
    // victim flash agree with the sim (失敗形態 ②).
    //
    // ⚠️⚠️ 2026-08-01 — this comment used to add 「and the knockdown gate
    // (`type !== "magic"`)」 to that list. It no longer does, deliberately:
    // knockdown reads `impactGateTypeOf(pkt)` (the PRE-conversion type) so that
    // converting a spell to true damage cannot silently grant it a knockdown
    // nobody authored. See the 擊倒 block at the bottom of this file.
    expect(armed.dmgType).toBe("true");
  });

  it("a typed shield can no longer eat the converted hit (the re-stamp is before the shield pool too)", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "basic", becomes: "true" })],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    // An anti-PHYSICAL barrier. Before the conversion it would absorb the whole
    // 80; after it, the packet is `true` and `eligibleShields` filters it out.
    world.health.get(b)!.shields.push({
      amount: 500,
      expiresAtTick: world.tick + 100,
      sourceId: "fixture",
      absorbs: "physical",
    });
    const r = hitFor(world, a, b, 80, "physical", "basic");
    expect(r.hpLost).toBeCloseTo(80, 9);
    expect(world.health.get(b)!.shields[0]!.amount).toBeCloseTo(500, 9);
  });
});

// ─────────────────────────────────────────────────────────── ② scope 分辨 ────
describe("scope —— 普攻 and 技能 are different weapons, not two code paths", () => {
  it("scope:\"basic\" converts the auto and leaves the ability alone", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "basic", becomes: "true" })],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { armor: 100, mr: 100 });

    expect(hitFor(world, a, b, 100, "physical", "basic").hpLost).toBeCloseTo(100, 9);
    // 惡夢魔王碎片's line must NOT come free with 霸王破甲槍's.
    expect(hitFor(world, a, b, 100, "magic", "ability:sela.q").hpLost).toBeCloseTo(50, 9);
  });

  it("scope:\"ability\" converts the ability and leaves the auto alone", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { armor: 100, mr: 100 });

    expect(hitFor(world, a, b, 100, "magic", "ability:sela.q").hpLost).toBeCloseTo(100, 9);
    expect(hitFor(world, a, b, 100, "physical", "basic").hpLost).toBeCloseTo(50, 9);
  });

  it("classifies every origin the sim actually stamps", () => {
    // ⚠️⚠️ 2026-08-01 — THIS TABLE USED TO CONTAIN A STRING THE SIM CANNOT EMIT.
    // Three of its rows classified `"dot:burn"`, and nothing anywhere in
    // `packages/shared/src/sim/**` ever writes that origin. It was 失敗形態 ④
    // and ⑥ at once: it looked like DoT coverage, it pinned nothing, and it
    // taught the reader the OPPOSITE of the truth (that a burn is outside
    // 「技能」). Every string below is now taken from a real `origin:` literal in
    // a non-test file — the full derivation, file by file, is in
    // `DamageConversionScope`'s docblock.
    //
    // ⚠️ MUTATION: make `originInScope` return `true` unconditionally — this
    // block goes red (and so do both scope tests above).
    const rows: [string, DamageConversionScope, boolean][] = [
      // `systems/BasicAttackSystem.ts` (melee) + `systems/ProjectileSystem.ts` (ranged)
      ["basic", "basic", true],
      ["basic", "ability", false],
      ["basic", "all", true],
      // `abilities/abilitySystem.ts` / `systems/CastResolveSystem.ts`
      ["ability:sela.q", "basic", false],
      ["ability:sela.q", "ability", true],
      ["ability:sela.q", "all", true],
      // ⚠️ A DoT TICK CARRIES ITS AUTHOR'S ORIGIN, unchanged — `effects/dot.ts`
      // copies `ctx.origin` into `DotInstance.origin` and `effects/dotTick.ts`
      // copies that into the packet. So an ability's burn IS 「技能傷害」
      // (owner 2026-08-01), and it is this row, not a `dot:` row, that says so.
      // The behavioural proof (real dotEffect → real dotTickSystem) is the
      // 「技能留下的延燒」 block below; this row only fixes the classifier's table.
      ["ability:godie-u01u.q", "ability", true],
      // `effects/hooks.ts` — an item/passive proc. NOT 「技能」, which is exactly
      // why there is no `"nonBasic"` member pretending to mean 技能.
      ["hook:item:godie-i067#0", "basic", false],
      ["hook:item:godie-i067#0", "ability", false],
      ["hook:item:godie-i067#0", "all", true],
      // `systems/MobSystem.ts` / `systems/GuardianSystem.ts`
      ["mob", "ability", false],
      ["mob", "all", true],
      ["guardian", "ability", false],
      ["guardian-heir", "ability", false],
      ["guardian-heir", "all", true],
    ];
    for (const [origin, scope, want] of rows) {
      expect(originInScope(origin, scope), `${origin} ∈ ${scope}`).toBe(want);
    }
  });
});

// ────────────────────────────── 技能留下的延燒 = 技能傷害 (owner 2026-08-01) ──
describe("技能留下的延燒 —— an ability's DoT IS ability damage, and it converts", () => {
  /*
   * owner 2026-08-01: 「技能留下的延燒，算不算「技能傷害」？ => yes, 除非特別講真傷」
   *
   * ⚠️ THIS IS THE GUARD THE `"dot:burn"` ROW PRETENDED TO BE. It does not ask
   * `originInScope` anything — it runs the REAL `dotEffect.apply` (which is what
   * copies `ctx.origin` onto the instance) and the REAL `dotTickSystem` (which is
   * what copies it onto the packet), then reads the packet back off the emitted
   * `damage` event. A classifier row cannot catch a regression in EITHER copy;
   * this can.
   */
  const BURN: EffectDef = {
    kind: "dot",
    damageType: "magic",
    amountPerTick: { flat: 100 },
    intervalSec: 0.5,
    durationSec: 2,
  };

  /**
   * One payout, AFTER the global `combatEnv.damageDealt` factor. Derived rather
   * than typed as `100`, because these tests drive a real `world.step()` and the
   * operator can move that factor from the 後台 — hard-coding it would make this
   * file go red for a reason that has nothing to do with what it is guarding.
   */
  const payout = (world: SimWorld): number => 100 * world.combatEnv.damageDealt;

  /** Burn `victim` for one payout and report what actually landed. */
  function burnOnce(
    world: SimWorld,
    caster: EntityId,
    victim: EntityId,
    def: EffectDef,
    origin: string,
  ): { hpLost: number; dmgType: string; origin: string } {
    runEffects([def], { world, caster, rank: 1, targets: [victim], origin, rng: world.rng });
    const before = world.health.get(victim)!.hp;
    // Advance to the first payout boundary. `dotTickSystem` runs at step slot 7c
    // and `combatResolveSystem` immediately after it, so one `step()` past the
    // boundary is exactly one payout.
    let ev: { dmgType?: string; origin?: string } | undefined;
    for (let i = 0; i < 20 && ev === undefined; i++) {
      world.step(new Map());
      ev = world.events.find((e) => e.type === "damage")?.data as typeof ev;
    }
    return {
      hpLost: before - world.health.get(victim)!.hp,
      dmgType: ev?.dmgType ?? "<none>",
      origin: ev?.origin ?? "<none>",
    };
  }

  /** A body with regen pinned to 0, or the burn's HP delta is not readable. */
  function burnDummy(
    world: SimWorld,
    seat: number,
    team: number,
    pos: V.Vec2,
    opts: { mr?: number; sources?: ModifierSource[] } = {},
  ): EntityId {
    const id = spawnDummy(world, seat, team, pos, opts);
    const final = world.stats.get(id)!.final;
    final[Stat.HealthRegen] = 0;
    final[Stat.ManaRegen] = 0;
    return id;
  }

  it("without the item, an ability's magic burn is mitigated by MR and stamped `ability:…`", () => {
    const world = makeWorld();
    const a = burnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = burnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const r = burnOnce(world, a, b, BURN, "ability:godie-u01u.q");
    // THE CONTROL. 100 MR ⇒ half. If this ever reads 100 the test below proves
    // nothing (it would be measuring a burn that was never mitigated at all).
    expect(r.hpLost).toBeCloseTo(payout(world) / 2, 9);
    expect(r.dmgType).toBe("magic");
    // ⚠️ MUTATION: change `origin: ctx.origin` to any `"dot:…"` string in
    // `effects/dot.ts` (or `origin: d.origin` in `effects/dotTick.ts`) — this
    // line goes red, and so does the conversion assertion below. That mutation
    // is EXACTLY the world the deleted `"dot:burn"` row described.
    expect(r.origin).toBe("ability:godie-u01u.q");
  });

  it("惡夢魔王碎片's `scope:\"ability\"` DOES convert the burn's ticks to true damage", () => {
    const world = makeWorld();
    const a = burnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })],
    });
    const b = burnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const r = burnOnce(world, a, b, BURN, "ability:godie-u01u.q");
    expect(r.hpLost).toBeCloseTo(payout(world), 9); // MR skipped entirely
    expect(r.dmgType).toBe("true");
  });

  it("a `hook:`-authored burn is NOT 「技能」 — the split is WHO authored it, not 「is it a DoT」", () => {
    // The same burn, applied by an item proc instead of a spell. `effects/hooks.ts`
    // stamps `hook:<sourceId>`, so `scope:"ability"` must leave it alone.
    const world = makeWorld();
    const a = burnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })],
    });
    const b = burnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const r = burnOnce(world, a, b, BURN, "hook:item:godie-i067#0");
    expect(r.hpLost).toBeCloseTo(payout(world) / 2, 9);
    expect(r.dmgType).toBe("magic");
  });

  it("「除非特別講真傷」 —— a burn ALREADY authored as true damage is not double-handled", () => {
    /*
     * owner's second half. A DoT written `damageType: "true"` is already
     * unmitigated; the conversion re-stamps it `"true"`, which is the identity.
     * The number that would move if it were double-handled is the HP delta, so
     * that is what is asserted — against the SAME burn with no item, to the
     * ninth decimal. (`resolveDamageTypeOverride` still returns `"true"` here
     * rather than `undefined`: 「nobody converted it」 and 「converted to the same
     * type」 stay distinguishable — see the resolver's docblock.)
     *
     * ⚠️ HONESTY NOTE (第二守則). This one is a REGRESSION PIN, not a
     * mutation-killed guard, and it is labelled that way on purpose. All ten
     * mutations run for this change (see the report) leave it GREEN, because
     * every one of them moves a type that is already `"true"` to `"true"`.
     * What it catches is a FUTURE 「if the packet is already this type, also do
     * X」 branch — the shape 「除非特別講真傷」 would break. Do not upgrade this
     * comment to claim resistance it does not have; that is exactly the sin the
     * previous pass committed here.
     */
    const TRUE_BURN: EffectDef = { ...BURN, damageType: "true" };

    const plain = makeWorld();
    const pa = burnDummy(plain, 0, 0, { x: ZC.x, z: Y });
    const pb = burnDummy(plain, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const control = burnOnce(plain, pa, pb, TRUE_BURN, "ability:godie-u01u.q");
    expect(control.hpLost).toBeCloseTo(payout(plain), 9);
    expect(control.dmgType).toBe("true");

    const armed = makeWorld();
    const aa = burnDummy(armed, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })],
    });
    const ab = burnDummy(armed, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const withItem = burnOnce(armed, aa, ab, TRUE_BURN, "ability:godie-u01u.q");
    // BYTE FOR BYTE the same. Any double-application (double damage, a second
    // mitigation pass, a re-stamp that flips the type) moves this number.
    expect(withItem.hpLost).toBeCloseTo(control.hpLost, 9);
    expect(withItem.dmgType).toBe("true");
  });
});

// ────────────────────────────────────── ③ 遠程也吃得到(接縫在佇列不在系統) ──
describe("the seam is the damage QUEUE, so a RANGED auto is converted too", () => {
  it("sela's projectile auto lands as true damage against 100 armor", () => {
    // This is the test the two authoringNotes' suggested design ("read it in
    // BasicAttackSystem") fails: a ranged auto never touches that file — its
    // packet is pushed by `systems/ProjectileSystem.ts`.
    const world = makeWorld();
    const c = Z0.center;
    const archer = spawnChampion(world, {
      championId: "sela" as ChampionId, // ranged
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x - 4, z: c.z + 8 },
      zone: 0,
    });
    const victim = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 4, z: c.z + 8 },
      zone: 0,
    });
    world.stats.get(archer)!.sources.push(weapon({ scope: "basic", becomes: "true" }));

    let sawTrue = false;
    let sawAnyBasicDamage = false;
    for (let t = 0; t < 200 && !sawTrue; t++) {
      // Hold the archer on target the way `combat/evasion.test.ts` does, and
      // keep the punching bag topped up so the window is not cut short by a
      // kill (the victim is thorne, and sela's autos add up).
      const nav = world.nav.get(archer);
      if (nav) {
        nav.attackTarget = victim;
        nav.moveTarget = null;
      }
      const hp = world.health.get(victim);
      if (hp) hp.hp = hp.maxHp;
      world.step(new Map());
      for (const e of world.events) {
        if (e.type !== "damage") continue;
        const d = e.data as { origin?: string; dmgType?: string };
        if (d.origin !== "basic") continue;
        sawAnyBasicDamage = true;
        if (d.dmgType === "true") sawTrue = true;
      }
    }
    // Both assertions matter: the second alone would pass on a world where the
    // archer never actually shot (失敗形態 ④ — an assertion unrelated to the
    // defect). The first proves a ranged auto really connected.
    expect(sawAnyBasicDamage, "the archer never landed a basic attack at all").toBe(true);
    expect(sawTrue, "a RANGED basic attack was not converted — the seam is in the wrong file").toBe(true);
  });
});

// ─────────────────────────────────────────────────────── ④ applyAt 是真的 ───
describe("applyAt —— the conservative default leaves 魔法免疫 working", () => {
  const immuneVictim = (world: SimWorld): EntityId => {
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    // 魔法免疫 only (47-04 天翔龍閃 / 97-04 火產靈神): the magic axis, NOT true.
    grantImmunity(world, b, {
      physicalUntil: 0,
      magicUntil: world.tick + 100,
      trueUntil: 0,
      controlUntil: 0,
    });
    return b;
  };

  it("default (afterGates): the immunity still refuses the converted ability", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })], // applyAt omitted
    });
    const b = immuneVictim(world);
    const r = hitFor(world, a, b, 100, "magic", "ability:sela.q");
    expect(r.hpLost).toBe(0);
    // and it is refused as an `immune`, not silently zeroed
    expect(world.events.some((e) => e.type === "immune")).toBe(true);
  });

  it("beforeGates: the immunity is bypassed, and the hit lands unmitigated", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true", applyAt: "beforeGates" })],
    });
    const b = immuneVictim(world);
    // ⚠️ MUTATION: delete the `if ((ov.applyAt ?? "afterGates") !== phase) continue;`
    // line in `resolveDamageTypeOverride` — this test still passes but the
    // DEFAULT test above goes red, because every override then fires in both
    // phases. Deleting the `preGate` call site in damage.ts kills THIS one.
    const r = hitFor(world, a, b, 100, "magic", "ability:sela.q");
    expect(r.hpLost).toBeCloseTo(100, 9);
  });
});

// ────────────────────────────────────── 跨家族:「真實傷害無法阻擋」 ────────
describe("真實傷害無法阻擋 —— the 格擋 family meets this one in ONE line", () => {
  // ⚠️ CROSS-FAMILY. This is the only test here that reaches into another
  // agent's module (`combat/block.ts`, the 格擋 family shipped in the same run).
  // It is worth the coupling because owner's own words 「真實傷害無法阻擋」 are a
  // statement ABOUT BOTH families, and neither file can prove it alone: 格擋
  // expresses it as content (`BlockGrant.damageTypes` simply omits `"true"`),
  // and THIS family is what turns a physical auto into a `"true"` packet. The
  // promise only holds if the re-stamp happens BEFORE `blockCutFor` is called —
  // which it does, because the re-stamp is above `mitigate()` and the block gate
  // is below it.
  const physicalOnlyBlock = {
    id: "item:fixture-block#0",
    kind: "item" as const,
    block: { damageTypes: ["physical" as DamageType], chance: 1, fraction: 1 },
  };

  it("a 100%-certain PHYSICAL block eats an ordinary auto…", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { sources: [physicalOnlyBlock] });
    expect(hitFor(world, a, b, 100, "physical", "basic").hpLost).toBe(0);
  });

  it("…and CANNOT touch the same auto once 霸王破甲槍 makes it true damage", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "basic", becomes: "true" })],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { sources: [physicalOnlyBlock] });
    // ⚠️ MUTATION: move the `postGate` re-stamp below the `blockCutFor` call —
    // this reads 0 (fully blocked) and owner's 「真實傷害無法阻擋」 is broken.
    expect(hitFor(world, a, b, 100, "physical", "basic").hpLost).toBeCloseTo(100, 9);
  });
});

// ───────────────────────────────────────────── ⑤⑥⑦ 決定性 · 到期 · 不存在 ──
describe("resolution rules", () => {
  it("two conflicting sources resolve the same way in EITHER attach order", () => {
    const magicSrc = weapon({ scope: "basic", becomes: "magic" }, "item:a#0");
    const trueSrc = weapon({ scope: "basic", becomes: "true" }, "item:b#1");
    const answer = (order: ModifierSource[]): DamageType | undefined => {
      const world = makeWorld();
      const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, { sources: order });
      return resolveDamageTypeOverride(world, a, "basic", "afterGates");
    };
    // ⚠️ MUTATION: replace the `CONVERSION_RANK` comparison with an early
    // `return ov.becomes` (first match wins) — the two calls disagree and this
    // goes red. That mutation is exactly the shape of the bug: buying the two
    // weapons in a different order would change what your autos do.
    expect(answer([magicSrc, trueSrc])).toBe("true");
    expect(answer([trueSrc, magicSrc])).toBe("true");
  });

  it("an EXPIRED source stops converting (absolute tick, no decrementing counter)", () => {
    const world = makeWorld();
    const src: ModifierSource = {
      ...weapon({ scope: "basic", becomes: "true" }, "buff:enchant#0"),
      kind: "buff",
      expiresAtTick: 10,
    };
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, { sources: [src] });
    world.tick = 9;
    expect(resolveDamageTypeOverride(world, a, "basic", "afterGates")).toBe("true");
    world.tick = 10; // `expiresAtTick <= tick` — the same rule hasDamageReductionBuff uses
    // ⚠️ MUTATION: drop the `expiresAtTick` guard — this line reads "true".
    expect(resolveDamageTypeOverride(world, a, "basic", "afterGates")).toBeUndefined();
  });

  it("no source at all = today's behaviour, byte for byte", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }); // sources: []
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { armor: 100 });
    expect(resolveDamageTypeOverride(world, a, "basic", "afterGates")).toBeUndefined();
    expect(resolveDamageTypeOverride(world, a, "basic", "beforeGates")).toBeUndefined();
    const r = hitFor(world, a, b, 100, "physical", "basic");
    expect(r.hpLost).toBeCloseTo(50, 9);
    expect(r.dmgType).toBe("physical");
  });

  it("a source that is not a stat carrier (a mob, a guardian) is simply skipped", () => {
    const world = makeWorld();
    const ghost = world.spawn(); // no StatsComp at all
    expect(resolveDamageTypeOverride(world, ghost, "basic", "afterGates")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────── 純度 ───
// ───────────────── 擊倒:轉換型別不會偷偷送出控場 (impactType, 2026-08-01) ──
describe("擊倒 —— converting a spell to true damage does NOT grant it a knockdown", () => {
  /*
   * THE DEFECT THIS PINS (nobody chose it; it was a side effect):
   * `applyImpact` gates knockdown on `type !== "magic"` — 「法術會推，但不會把人
   * 打趴」. 惡夢魔王碎片 re-stamps magic → true BEFORE that call, so every spell
   * its holder cast silently gained a knockdown. owner's 效能 line
   * (「所有裝備者技能傷害都轉為真實傷害」) says nothing about crowd control.
   *
   * The fix keeps the PRE-conversion type on the packet and reads it here; the
   * A/B is `DamageTypeOverride.impactType`, default `"original"`.
   *
   * KD_MIN_IMPACT is 170 and the shove has to be non-zero for the gate to be
   * reached at all, so these hits are deliberately large (`maxHp` is small so
   * the %-HP knockback rule fires, and the bodies start adjacent).
   */
  const heavy = (
    world: SimWorld,
    ov: DamageTypeOverride | undefined,
    type: DamageType,
    origin: string,
  ): boolean => {
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      hp: 5000,
      ...(ov === undefined ? {} : { sources: [weapon(ov)] }),
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 1.3, z: Y }, { hp: 5000 });
    world.events.length = 0;
    world.damageQueue.push({ source: a, target: b, amount: 2000, type, crit: false, origin });
    combatResolveSystem(world);
    return world.events.some((e) => e.type === "knockdown");
  };

  it("the CONTROL pair: a heavy physical hit floors you, the same magic hit does not", () => {
    // Without this pair the tests below are 失敗形態 ④ — they would pass on a
    // world where NOTHING ever knocks down.
    expect(heavy(makeWorld(), undefined, "physical", "basic")).toBe(true);
    expect(heavy(makeWorld(), undefined, "magic", "ability:x.q")).toBe(false);
  });

  it("惡夢魔王碎片's default (impactType absent = \"original\") keeps the spell knockdown-free", () => {
    // ⚠️ MUTATION: put `pkt.type` back in place of `impactGateTypeOf(pkt)` at the
    // `applyImpact(...)` call in `combat/damage.ts` — this line reads `true`
    // and the item has silently handed out a hard CC. (Equivalently: flip
    // `applyDamageConversion`'s `"converted"` branch to be unconditional.)
    expect(heavy(makeWorld(), { scope: "ability", becomes: "true" }, "magic", "ability:x.q")).toBe(
      false,
    );
  });

  it("…but the packet is still TRUE damage — only the CC gate was left alone", () => {
    // 失敗形態 ④ insurance: 「no knockdown」 would also be true if the conversion
    // had simply stopped happening. It has not.
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "ability", becomes: "true" })],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { mr: 100 });
    const r = hitFor(world, a, b, 100, "magic", "ability:x.q");
    expect(r.hpLost).toBeCloseTo(100, 9);
    expect(r.dmgType).toBe("true");
  });

  it("impactType:\"converted\" is the OTHER side of the field, and it really is expressible", () => {
    // ⚠️ MUTATION: delete the `if (conv.impactType === "converted") delete
    // pkt.impactGateType;` branch in `applyDamageConversion` — this line reads
    // `false` and the field becomes decorative (a card that promises something
    // the sim ignores).
    expect(
      heavy(
        makeWorld(),
        { scope: "ability", becomes: "true", impactType: "converted" },
        "magic",
        "ability:x.q",
      ),
    ).toBe(true);
  });

  it("霸王破甲槍 is untouched: a converted PHYSICAL auto still floors you", () => {
    // physical and true sit on the same side of the gate, so this whole field is
    // a strict no-op for the two `scope:"basic"` weapons. If this ever goes red,
    // the fix has over-reached into hits it was never about.
    expect(heavy(makeWorld(), { scope: "basic", becomes: "true" }, "physical", "basic")).toBe(true);
  });
});

// ─── applyDamageConversion —— 兩個相位都蓋時的四種組合 (2026-08-01 檔頭更正) ──
describe("applyDamageConversion —— 兩個相位都蓋時,擊倒閘讀到哪一個型別", () => {
  /*
   * WHAT THIS EXISTS FOR. The docblock on `applyDamageConversion` used to say
   * 「`??` 而不是直接賦值,所以兩個相位都蓋時保留的是**最原始的那一個**」.
   * That is TRUE for `original → original` and FALSE for `converted → original`:
   * the `converted` branch DELETES the record (that is its whole meaning), so
   * the second phase's `?? before` finds ABSENT and stores phase 1's OUTPUT.
   *
   * The code was judged right and the prose wrong — `impactType` is one source
   * speaking about ITS OWN conversion, not a verdict over the whole packet, and
   * a later `"original"` silently revoking an operator's explicit `"converted"`
   * opt-in would make an item's own printed behaviour depend on what else you
   * carry. Making the old sentence true would need a THIRD packet field holding
   * "the type before anything at all", for a combination no shipped doc can
   * produce (all three ship without `applyAt`).
   *
   * So this table IS the corrected sentence, executable. Both sources sit on
   * ONE entity and the packet really goes through `combatResolveSystem`, which
   * is the only place both phases are called (失敗形態 ⑤: asserting on a
   * hand-rolled two-call sequence would not prove the shipped path does it).
   *
   * The observable is the KNOCKDOWN, because that is the only thing
   * `impactGateType` feeds: `magic` ⇒ no knockdown, anything else ⇒ knockdown.
   * Row 1 is the only row that comes out `magic`, which is exactly the
   * distinction the false sentence got wrong.
   */
  const bothPhases = (
    before: ConvertedImpactType | undefined,
    after: ConvertedImpactType | undefined,
  ): boolean => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      hp: 5000,
      sources: [
        weapon(
          {
            scope: "ability",
            becomes: "true",
            applyAt: "beforeGates",
            ...(before === undefined ? {} : { impactType: before }),
          },
          "item:phase-before#0",
        ),
        weapon(
          {
            scope: "ability",
            becomes: "true",
            applyAt: "afterGates",
            ...(after === undefined ? {} : { impactType: after }),
          },
          "item:phase-after#0",
        ),
      ],
    });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 1.3, z: Y }, { hp: 5000 });
    world.events.length = 0;
    world.damageQueue.push({
      source: a,
      target: b,
      amount: 2000,
      type: "magic",
      crit: false,
      origin: "ability:x.q",
    });
    combatResolveSystem(world);
    return world.events.some((e) => e.type === "knockdown");
  };

  it("original → original: the EARLIEST type survives (this is the half the old comment got right)", () => {
    // ⚠️ MUTATION (RUN, not asserted from the armchair): change
    // `pkt.impactGateType = pkt.impactGateType ?? before` to
    // `pkt.impactGateType = before` in `applyDamageConversion`. Phase 2 then
    // overwrites 「magic」 with phase 1's output 「true」, a knockdown appears,
    // and this line goes RED.
    expect(bothPhases("original", "original")).toBe(false); // gate read `magic`
  });

  it("converted → original: the gate reads phase 1's OUTPUT, NOT the most original type", () => {
    // THE REFUTED SENTENCE, pinned. If someone "fixes" the code to match the old
    // comment (remember the pre-everything type across a `converted`), this goes
    // RED — which is the point: that change must be a deliberate decision with
    // its own field, not a comment-driven edit.
    expect(bothPhases("converted", "original")).toBe(true); // gate read `true`
  });

  it("original → converted: the LAST phase's `converted` wins and clears the record", () => {
    // ⚠️ MUTATION: delete `if (conv.impactType === "converted") delete
    // pkt.impactGateType;`. Phase 1's 「magic」 then survives, no knockdown, RED.
    expect(bothPhases("original", "converted")).toBe(true);
  });

  it("converted → converted: still cleared", () => {
    expect(bothPhases("converted", "converted")).toBe(true);
  });

  it("ABSENT → ABSENT behaves exactly like row 1 — the default really is \"original\"", () => {
    // Same two sources, `impactType` OMITTED on both. If the ABSENT→"original"
    // default in `resolveDamageConversion` ever flips, this row parts company
    // with row 1 and goes red on its own.
    expect(bothPhases(undefined, undefined)).toBe(false);
  });
});

describe("purity", () => {
  it("resolution consumes no rng and no wall clock", () => {
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y }, {
      sources: [weapon({ scope: "all", becomes: "true" })],
    });
    const digestBefore = world.rng.state;
    for (let i = 0; i < 50; i++) resolveDamageTypeOverride(world, a, "basic", "afterGates");
    expect(world.rng.state).toBe(digestBefore);
  });
});
