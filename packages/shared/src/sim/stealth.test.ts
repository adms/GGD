/**
 * 隱形 / 真視 — the BEHAVIOURAL guard (owner 2026-07-30 「選小的就好」).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE REFUSES TO ASSERT, AND WHY
 *
 * There is not one `expect(flags & INVISIBLE)` here, and that is deliberate. A
 * "the bit got set" test is the project's 失敗形態 ⑦ — a PROPERTY assertion
 * standing in for a BEHAVIOUR one — and it passes just as happily when the bit
 * reaches nobody. So every case below runs `SimWorld.step()` and asks the same
 * question the player asks: **did the enemy come for me?**
 *
 *   · a hidden hero is NOT auto-acquired (`nav.attackTarget` stays null across
 *     a full second of real ticks, and no attack lands);
 *   · the instant he ATTACKS, 破隱 fires and the enemy acquires him;
 *   · zombie aggro skips him too, and comes back on the break;
 *   · a TRUE-SIGHT enemy acquires him immediately — and the same enemy standing
 *     one unit outside its radius does not (the radius is real, not decorative);
 *   · a TEAMMATE always sees him (otherwise you cannot play the hero);
 *   · every `blocks*` field really switches its channel off.
 *
 * MUTATION LOG (each verified: break the line → red → restore):
 *   1. delete the `canSee` gate in `targeting.isAutoTargetable`
 *   2. delete the `breakStealth(world, id, "attack")` call in BasicAttackSystem
 *   3. delete the `canSee` gate in `targeting.isMobTargetable`
 *   4. make `hasTrueSightOn` return true unconditionally
 * Results are in the lane report; #1 and #2 are the two that would silently ship
 * "the model fades but the game does not care".
 *
 * GEOMETRY — copied from `autoAcquire.test.ts` on purpose (same lane, same
 * hazard): zone 0 of SKELETON_ARENA is centred at (-40, 0) with a 24 u
 * boundary, so a body at the world origin is 40 u OUTSIDE it and MovementSystem
 * silently clamps it back, destroying every distance asserted here. Everything
 * is placed relative to the zone centre on the clear `z = center.z + 12` lane.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import type { AbilitiesComp } from "./stats/statsComp";
import type { IntentFrame } from "./intents";
import { MONSTER_TEAM, mobRulesFromConfig, type MobWavesConfigLike } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_STEALTH_RULES,
  breakStealth,
  canSee,
  isHidden,
  stealthRulesFromDoc,
  normalizeStealthRules,
  type StealthRules,
} from "./stealth";
import * as V from "./math/vec2";
import { Abilities } from "./content/registry";
import { syncAbilityPassives } from "./abilities/abilityPassives";
import { zVisionGrant } from "../content/schema/effect";
import type { AbilityDef } from "./content/defs";

const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ARENA_RULES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../content/config/arena-rules.json",
);

/**
 * Arm the #215 wave system with the SHIPPED rules — the real `MobSystem` gate is
 * `rules === null || world.mobTicks < 0 || !world.combatActive`, so a mob placed
 * by hand into a world nobody armed is simply never stepped and every aggro
 * assertion below would pass vacuously.
 *
 * `firstWaveTicks` is pushed out of reach so the scheduler spawns NOTHING: the
 * subject is the ONE zombie this file placed, and a wave of extra bodies would
 * make "did the mob aim at the hidden hero" ambiguous.
 */
function armMobs(world: SimWorld): void {
  const doc = JSON.parse(readFileSync(ARENA_RULES, "utf8")) as { mobWaves?: MobWavesConfigLike };
  if (!doc.mobWaves) throw new Error("arena-rules.json 沒有 mobWaves");
  const rules = mobRulesFromConfig(doc.mobWaves, world.dt, doc.mobWaves.fromRound);
  beginCombatMobs(world, { ...rules, firstWaveTicks: 1_000_000_000 }, [0]);
}

function at(dx: number, dz = 0): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 + dz };
}

/** A minimal combat-capable champion (no content doc needed). */
function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  range = 1.6,
  moveSpeed = 1e-9,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = moveSpeed;
  final[Stat.AttackRange] = range;
  final[Stat.AttackSpeed] = 1;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

/** A #215-shaped mob: MONSTER team, MobComp, deliberately NO ChampionComp. */
function spawnMob(world: SimWorld, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp: 100, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: MONSTER_TEAM, seatId: asSeatId(-1) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.mob.set(id, {
    zone: 0,
    team: MONSTER_TEAM,
    target: -1 as EntityId,
    attackCdTicks: 0,
    spawnTick: 0,
    kind: "normal",
  });
  world.mobZones.add(0);
  return id;
}

/**
 * Give `id` a stealth grant the ONLY way content can — a `ModifierSource` with a
 * `vision` block, i.e. exactly what `abilityPassives.rankBlock` builds out of
 * `ability@1.passive.ranks[0].vision`.
 *
 * ⚠️ This is 失敗形態 ⑤ territory ("the thing tested is not the thing shipped"),
 * so it is worth being explicit: the shape written here is byte-for-byte the
 * shape `syncAbilityPassives` attaches, and the doc → source hop is covered
 * separately by `sim/innatePassivePayloads.test.ts` — it spawns the real
 * 猿飛佐助 (godie-naka) and 麻倉葉 (godie-nplh) off their shipped content docs
 * and asserts hidden / canSee, so breaking either doc's `vision` block turns it
 * red. Nothing here hand-writes `world.stealth`, which would test the system
 * against its own output.
 *
 * (Corrected 2026-07-30 per CLAUDE.md 第三守則: this used to name
 * `stealth.contentPath.test.ts`, a file that does not exist.)
 */
function grantStealth(world: SimWorld, id: EntityId, fadeSec: number): void {
  world.stats.get(id)!.sources.push({
    id: `ability:probe.passive#${id}`,
    kind: "passive",
    vision: { stealthFadeDelaySec: fadeSec },
  });
}

/** Same, for 真視. */
function grantTrueSight(world: SimWorld, id: EntityId, radius: number): void {
  world.stats.get(id)!.sources.push({
    id: `ability:probe.sight#${id}`,
    kind: "passive",
    vision: { trueSightRadius: radius },
  });
}

function combatWorld(seed = 11, rules: StealthRules = DEFAULT_STEALTH_RULES): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.stealthRules = rules;
  return world;
}

function step(world: SimWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step(NO_INTENTS);
}

/** Did `who` hold an auto target at ANY point over `ticks` steps? */
function everAcquired(world: SimWorld, who: EntityId, ticks: number): boolean {
  for (let i = 0; i < ticks; i++) {
    world.step(NO_INTENTS);
    if (world.nav.get(who)?.attackTarget != null) return true;
  }
  return false;
}

const FADE = 1.0; // seconds — 30 ticks at 30 Hz, short enough to keep tests brisk

describe("隱形 —— 敵人真的索敵不到", () => {
  let world: SimWorld;
  let hidden: EntityId;
  let enemy: EntityId;

  beforeEach(() => {
    world = combatWorld();
    // 3 u apart: comfortably inside MELEE_ACQUIRE_FLOOR (6), so the ONLY reason
    // the enemy could fail to acquire is the stealth rule. Without that framing
    // this whole file could pass by accident on distance.
    hidden = spawnFighter(world, 0, 0, at(0));
    enemy = spawnFighter(world, 1, 1, at(3));
    grantStealth(world, hidden, FADE);
  });

  it("先是看得到的 —— 淡出延遲跑完之前，索敵完全正常", () => {
    // THE ANTI-VACUOUS CASE. If the enemy could never acquire this body for some
    // unrelated reason (range, zone, team), every other test in this file would
    // pass for the wrong reason. It acquires within the first few ticks.
    expect(everAcquired(world, enemy, 5)).toBe(true);
    expect(isHidden(world, hidden)).toBe(false);
  });

  it("淡出之後：敵人整整一秒索敵不到，而且一刀都沒揮出去", () => {
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
    // The enemy's held target from the visible phase must be DROPPED, not kept:
    // a target acquired before the fade and never re-validated would let him
    // keep swinging at a body he can no longer see.
    const hpBefore = world.health.get(hidden)!.hp;
    let held = 0;
    for (let i = 0; i < 30; i++) {
      world.step(NO_INTENTS);
      if (world.nav.get(enemy)?.attackTarget != null) held++;
    }
    expect(held).toBe(0);
    expect(world.health.get(hidden)!.hp).toBe(hpBefore);
  });

  it("攻擊就破隱 —— 隱形者出手的那一刻敵人立刻索敵得到", () => {
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
    // Hand the hidden hero a target so BasicAttackSystem commits a swing. This
    // is the REAL break path (the swing-commit line), not a direct call to
    // `breakStealth` — a test that called the helper would still pass with the
    // call site deleted, which is mutation #2's whole point.
    // Hand him the REACH to connect from 3 u only now. Every other case in this
    // block keeps him melee-with-no-legs on purpose: a hero who could swing
    // would break his own stealth on tick 1 and nothing here would be testing
    // invisibility at all.
    world.stats.get(hidden)!.final[Stat.AttackRange] = 6;
    world.nav.get(hidden)!.attackTarget = enemy;
    world.step(NO_INTENTS);
    expect(isHidden(world, hidden)).toBe(false);
    expect(everAcquired(world, enemy, 3)).toBe(true);
  });

  it("破隱之後再站著不動，淡出延遲一到又消失", () => {
    step(world, Math.round(FADE / world.dt) + 2);
    breakStealth(world, hidden, "attack");
    expect(isHidden(world, hidden)).toBe(false);
    step(world, Math.round(FADE / world.dt) - 1);
    expect(isHidden(world, hidden)).toBe(false); // one tick short — still visible
    step(world, 2);
    expect(isHidden(world, hidden)).toBe(true);
  });

  it("屍體不會隱形 —— 死掉的身體一定看得見（復活圈要看得到）", () => {
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
    world.health.get(hidden)!.alive = false;
    expect(isHidden(world, hidden)).toBe(false);
  });
});

describe("隱形 —— 誰還是看得見", () => {
  it("隊友永遠看得見（不然這支英雄沒辦法玩）", () => {
    const world = combatWorld();
    const hidden = spawnFighter(world, 0, 0, at(0));
    const ally = spawnFighter(world, 1, 0, at(3)); // SAME team
    grantStealth(world, hidden, FADE);
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
    expect(canSee(world, ally, hidden)).toBe(true);
    expect(canSee(world, hidden, hidden)).toBe(true); // and himself
  });

  it("真視在範圍內看得見，範圍外看不見 —— 半徑是真的", () => {
    // TWO enemies, ONE grant each, placed either side of the radius. Asserting
    // both is what makes this a statement about the RADIUS rather than about
    // "true sight exists at all" (mutation #4 makes the far one pass too).
    const world = combatWorld();
    const hidden = spawnFighter(world, 0, 0, at(0));
    const near = spawnFighter(world, 1, 1, at(4));
    const far = spawnFighter(world, 2, 1, at(12));
    grantStealth(world, hidden, FADE);
    grantTrueSight(world, near, 6);
    grantTrueSight(world, far, 6);
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
    expect(canSee(world, near, hidden)).toBe(true);
    expect(canSee(world, far, hidden)).toBe(false);
    // …and it reaches the real targeting rule, not just the predicate.
    expect(everAcquired(world, near, 5)).toBe(true);
  });

  it("殭屍也索敵不到隱形英雄，破隱之後才追上來", () => {
    const world = combatWorld();
    const hidden = spawnFighter(world, 0, 0, at(0));
    armMobs(world); // BEFORE spawnMob: beginCombatMobs despawns every live mob
    // 16 u out, NOT 3: mob aggro has no radius (MobSystem scans the whole zone),
    // so distance is free here — while a zombie parked at 3 u walks into melee
    // within the fade window, the hero auto-swings at it, and 破隱 fires. The
    // test would then be measuring the break rule instead of the aggro rule.
    const mob = spawnMob(world, at(16));
    grantStealth(world, hidden, FADE);
    // visible phase: the mob really does aim at him (anti-vacuous)
    step(world, 2);
    expect(world.mob.get(mob)!.target).toBe(hidden);
    step(world, Math.round(FADE / world.dt) + 2);
    expect(world.mob.get(mob)!.target).toBe(-1);
    breakStealth(world, hidden, "attack");
    step(world, 1);
    expect(world.mob.get(mob)!.target).toBe(hidden);
  });
});

describe("隱形 —— 每一個決策點都真的是欄位", () => {
  const hide = (world: SimWorld, id: EntityId) => {
    grantStealth(world, id, FADE);
    step(world, Math.round(FADE / world.dt) + 2);
  };

  it("blocksAutoAcquire=false → 隱形只剩畫面，索敵照舊", () => {
    const world = combatWorld(11, { ...DEFAULT_STEALTH_RULES, blocksAutoAcquire: false });
    const hidden = spawnFighter(world, 0, 0, at(0));
    const enemy = spawnFighter(world, 1, 1, at(3));
    hide(world, hidden);
    expect(isHidden(world, hidden)).toBe(true); // still flagged for the renderer
    expect(everAcquired(world, enemy, 5)).toBe(true); // …but targetable
  });

  it("blocksMobAggro=false → 殭屍照樣撲上來", () => {
    const world = combatWorld(11, { ...DEFAULT_STEALTH_RULES, blocksMobAggro: false });
    const hidden = spawnFighter(world, 0, 0, at(0));
    armMobs(world); // BEFORE spawnMob (see the other mob case)
    const mob = spawnMob(world, at(16));
    hide(world, hidden);
    step(world, 1);
    expect(world.mob.get(mob)!.target).toBe(hidden);
  });

  it("breaksOnBasicAttack=false → 出手也不破隱", () => {
    const world = combatWorld(11, { ...DEFAULT_STEALTH_RULES, breaksOnBasicAttack: false });
    const hidden = spawnFighter(world, 0, 0, at(0));
    const enemy = spawnFighter(world, 1, 1, at(3));
    hide(world, hidden);
    world.stats.get(hidden)!.final[Stat.AttackRange] = 6;
    world.nav.get(hidden)!.attackTarget = enemy;
    step(world, 3);
    expect(isHidden(world, hidden)).toBe(true);
  });

  it("fadeDelayMult 真的縮放延遲（0 = 立刻隱形）", () => {
    const world = combatWorld(11, { ...DEFAULT_STEALTH_RULES, fadeDelayMult: 0 });
    const hidden = spawnFighter(world, 0, 0, at(0));
    grantStealth(world, hidden, 10); // a 10-second grant…
    step(world, 1);
    expect(isHidden(world, hidden)).toBe(true); // …hidden on tick 1
  });
});

describe("隱形 —— 沒有隱形英雄的一場比賽,一個位元都沒動", () => {
  it("兩份同種子世界的 digest 逐 tick 相同（純加法保證）", () => {
    const mk = () => {
      const w = combatWorld(4242);
      spawnFighter(w, 0, 0, at(0));
      spawnFighter(w, 1, 1, at(5));
      return w;
    };
    const a = mk();
    const b = mk();
    for (let i = 0; i < 120; i++) {
      a.step(NO_INTENTS);
      b.step(NO_INTENTS);
      expect(a.digest()).toBe(b.digest());
    }
    // …and nobody accreted stealth state they never asked for.
    expect(a.stealth.size).toBe(0);
    expect(a.trueSight.size).toBe(0);
  });

  it("回收的 entityId 不會繼承上一具身體的隱形時鐘", () => {
    const world = combatWorld();
    const hidden = spawnFighter(world, 0, 0, at(0));
    grantStealth(world, hidden, FADE);
    step(world, Math.round(FADE / world.dt) + 2);
    expect(world.stealth.has(hidden)).toBe(true);
    world.destroy(hidden);
    expect(world.stealth.has(hidden)).toBe(false);
    expect(world.trueSight.has(hidden)).toBe(false);
  });
});

describe("config.stealth@1 —— 缺文件 = 出貨預設,不是空表", () => {
  it("null / 亂七八糟 / schema 不對 → 全部回到出貨值", () => {
    for (const bad of [null, undefined, 42, "nope", {}, { schema: "config.gore@1" }]) {
      expect(stealthRulesFromDoc(bad)).toEqual(DEFAULT_STEALTH_RULES);
    }
  });

  it("部分欄位的文件只覆蓋那幾格,其餘拿出貨值（不是 undefined）", () => {
    const r = normalizeStealthRules({ blocksAbilityAoe: true, allyAlpha: 0.9 });
    expect(r.blocksAbilityAoe).toBe(true);
    expect(r.allyAlpha).toBeCloseTo(0.9, 6);
    // the untouched ones are the SHIPPED values, not falsy holes — this is the
    // difference between "invisibility is configurable" and "invisibility is off"
    expect(r.blocksAutoAcquire).toBe(true);
    expect(r.breaksOnCast).toBe(true);
  });

  it("超出範圍的數字被夾住,不會靜默變成 NaN 或無限大", () => {
    const r = normalizeStealthRules({ fadeDelayMult: 999, allyAlpha: -5, enemyAlpha: Number.NaN });
    expect(r.fadeDelayMult).toBe(10);
    expect(r.allyAlpha).toBe(0);
    expect(r.enemyAlpha).toBe(DEFAULT_STEALTH_RULES.enemyAlpha);
  });

  it("出貨值就是 WC3 原作行為（這一條是規格,不是快照）", () => {
    expect(DEFAULT_STEALTH_RULES.blocksAutoAcquire).toBe(true);
    expect(DEFAULT_STEALTH_RULES.blocksManualTarget).toBe(true);
    // AoE 打得到隱形單位 —— 隱形是「不可被指定」不是「無敵」
    expect(DEFAULT_STEALTH_RULES.blocksAbilityAoe).toBe(false);
    expect(DEFAULT_STEALTH_RULES.breaksOnBasicAttack).toBe(true);
    expect(DEFAULT_STEALTH_RULES.breaksOnCast).toBe(true);
    // 被打不破隱
    expect(DEFAULT_STEALTH_RULES.breaksOnDamaged).toBe(false);
    // 自己人看得到自己（0 會讓這支英雄不能玩）
    expect(DEFAULT_STEALTH_RULES.allyAlpha).toBeGreaterThan(0);
  });
});

describe("內容路徑 —— 從 ability doc 到 world.stealth 沒有斷點", () => {
  /**
   * 失敗形態 ⑤ 的守衛:上面每一條都自己 push 了一個 ModifierSource,所以它們
   * 全部可以在「內容根本走不到 source」的情況下綠掉。這一段走的是**出貨的那條
   * 路** —— 註冊一份真的 `ability@1` doc,呼叫 `syncAbilityPassives`,再讓
   * `stealthSystem` 從 sources 推導出 `world.stealth`。
   *
   * 它釘住的是一個真的被修好的缺陷:`rankBlock` 的「這一 rank 是不是空的」判斷
   * 原本只看 `modifiers / hooks / auras`。27-00 永久性的隱形術 與 16-00 通靈能力
   * 的 `modifiers` 是**空陣列**(看不看得見不是一條屬性),所以少了 `vision` 這
   * 一項,source 永遠不會 attach,`stealthSystem` 永遠找不到 grant,整個功能就是
   * 一份沒人讀的 JSON —— 而上面 18 條測試會全部綠。
   */
  it("vision-only 的 rank block 會 attach（modifiers 是空的也一樣）", () => {
    const world = combatWorld();
    const hidden = spawnFighter(world, 0, 0, at(0));
    const def: AbilityDef = {
      id: "probe.invis" as AbilityId,
      name: "27-00 永久性的隱形術",
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [],
      // EXACTLY the shipped shape: an empty modifiers array + a vision block.
      passive: { ranks: [{ modifiers: [], vision: { stealthFadeDelaySec: FADE } }] },
    };
    Abilities.register(def.id, def);
    world.abilities.get(hidden)!.passiveSlot = {
      abilityId: def.id,
      rank: 1,
      cooldownRemainingTicks: 0,
    };
    syncAbilityPassives(world, hidden);
    // `attachSource` marks the stats dirty, and `statRecomputeSystem` needs a
    // real ChampionDef this synthetic probe does not have. Clearing the flag is
    // scoped exactly to that: the source itself — the thing under test — is
    // already on the entity, and `stealthSystem` reads `sc.sources`, not
    // `sc.final`, so nothing about the stealth derivation is being skipped.
    world.stats.get(hidden)!.dirty = false;
    // the source really attached…
    expect(
      world.stats.get(hidden)!.sources.some((s) => s.vision?.stealthFadeDelaySec === FADE),
    ).toBe(true);
    // …and the system really derives the clock from it, with no hand-written map
    step(world, Math.round(FADE / world.dt) + 2);
    expect(isHidden(world, hidden)).toBe(true);
  });

  it("Zod 收得下要出貨的四份文件的 vision 區塊,並擋掉超界值", () => {
    // 27-00 永久性的隱形術 (Apiv, w3x Dur/HeroDur = 4.0)
    expect(zVisionGrant.safeParse({ stealthFadeDelaySec: 4.0 }).success).toBe(true);
    // 16-00 通靈能力 / 21-00 灼眼 (Atru cast_range 500 → 500/54.5 = 9.17)
    expect(zVisionGrant.safeParse({ trueSightRadius: 9.17 }).success).toBe(true);
    // 空的 vision 區塊沒有意義 —— 擋掉,不要讓它變成一份看起來有設定的死檔
    expect(zVisionGrant.safeParse({}).success).toBe(false);
    // 上界存在(#277 的形狀:少了上界,一個沒換算的 w3x 500 會靜默通過)
    expect(zVisionGrant.safeParse({ trueSightRadius: 500 }).success).toBe(false);
    expect(zVisionGrant.safeParse({ stealthFadeDelaySec: 600 }).success).toBe(false);
  });
});
