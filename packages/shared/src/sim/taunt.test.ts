/**
 * 嘲弄 (taunt) —— the guards for 鍊金術之盾's 「每秒吸引周圍敵人優先攻擊自己」.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT EACH TEST HAS TO SURVIVE, AND WHY IT IS SHAPED THAT WAY
 * ════════════════════════════════════════════════════════════════════════════
 * A taunt is a targeting override, and targeting already has a total 5-key
 * comparator. So the ONLY assertions worth writing are ones where the taunter
 * would LOSE on every other key — otherwise the test passes for a build with no
 * taunt code in it at all (CLAUDE.md 失敗形態 ④: 斷言方向跟缺陷無關).
 *
 * Every scenario below therefore stacks the deck AGAINST the taunter:
 *   · the decoy is an enemy CHAMPION (kind 0) and the taunter is too, but the
 *     decoy is nearer AND lower HP AND is the one actually hitting me — i.e. it
 *     wins keys 2, 3 and 4;
 *   · the taunter is placed OUTSIDE the acquirer's own radius;
 *   · the victim is already holding an auto target when the taunt lands (the
 *     `held` branch, which never reaches the acquire path);
 *   · the mob's decoy is literally adjacent while the taunter is across the zone.
 *
 * Geometry copies `autoAcquire.test.ts`: zone 0 of SKELETON_ARENA is centred at
 * (-40, 0), so everything lives on the clear lane `z = center.z + 12`. A body at
 * the world origin is 40 u outside the boundary and gets clamped back in, which
 * silently destroys every distance asserted here.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
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
import { beginCombatMobs, mobSystem } from "./systems/MobSystem";
import { acquireTarget, forcedTargetOf, rankOf } from "./targeting";
import {
  applyTaunt,
  DEFAULT_TAUNT_RULES,
  normalizeTauntRules,
  tauntedBy,
  tauntRulesFromDoc,
  TAUNT_SCHEMA,
  type TauntRules,
} from "./taunt";
import { runEffects } from "./effects/effectRunner";
import * as V from "./math/vec2";

const TAG = "taunt-forced-targeting";
const Z0 = SKELETON_ARENA.zones[0]!;

/** A point `dx` units along the clear lane. */
function at(dx: number, dz = 0): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 + dz };
}

const IMMOBILE = 1e-9;

function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  hp = 5000,
  moveSpeed = IMMOBILE,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
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
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.5;
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
function spawnMobBody(world: SimWorld, pos: V.Vec2): EntityId {
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
  return id;
}

function combatWorld(rules?: Partial<TauntRules>, seed = 11): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  if (rules) world.tauntRules = { ...DEFAULT_TAUNT_RULES, ...rules };
  return world;
}

/** Mark `attacker` as having just damaged `victim` — the REAL threat store. */
function markThreat(world: SimWorld, victim: EntityId, attacker: EntityId): void {
  let m = world.recentDamagers.get(victim);
  if (!m) {
    m = new Map<EntityId, number>();
    world.recentDamagers.set(victim, m);
  }
  m.set(attacker, world.tick);
}

const NO_INTENTS = new Map<SeatId, IntentFrame>();

/**
 * THE STACKED DECK. `me` is being auto-acquired; `decoy` beats `taunter` on
 * EVERY other comparator key (nearer, lower hp, and actively damaging me), and
 * `taunter` sits OUTSIDE `me`'s own acquisition radius. Without a working taunt
 * the answer is always `decoy`.
 */
function stackedDeck(world: SimWorld): {
  me: EntityId;
  decoy: EntityId;
  taunter: EntityId;
} {
  const me = spawnFighter(world, 0, 0, at(0));
  const decoy = spawnFighter(world, 1, 1, at(1.5), 40); // adjacent + nearly dead
  const taunter = spawnFighter(world, 2, 1, at(9), 5000); // far + full hp
  markThreat(world, me, decoy); // …and it is the one hitting me
  world.rebuildGrid();
  return { me, decoy, taunter };
}

// ───────────────────────────────────────────────── the comparator itself ────

describe("嘲弄壓過索敵比較器的每一把 key", () => {
  it("被嘲弄時索到嘲弄者，即使誘餌更近、更殘血、而且正在打我", () => {
    cover(TAG);
    const world = combatWorld();
    const { me, decoy, taunter } = stackedDeck(world);

    // 對照組：沒有嘲弄的時候，答案一定是誘餌。少了這一條，上面那條在
    // 「acquireTarget 永遠回 taunter」的壞實作下也會過。
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);

    expect(applyTaunt(world, me, taunter, 0.5)).toBe(true);
    expect(acquireTarget(world, me, 6)?.id).toBe(taunter);
  });

  it("嘲弄者**在**索敵半徑之內時，是比較器本身讓他贏（不是半徑外那條救援）", () => {
    cover(TAG);
    // ⚠️ 這一條和下面那一條分開，是因為它們釘的是**兩行不同的實作**：
    //   · 半徑之內 → `beats()` 的 forced key（sort key 0）；
    //   · 半徑之外 → `acquireTarget()` 尾巴那條救援。
    // 合成一條的話，救援會把比較器那一行蓋掉，那一行就變成刪掉也不會紅。
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0));
    const decoy = spawnFighter(world, 1, 1, at(1.5), 40); // 更近、更殘、正在打我
    const taunter = spawnFighter(world, 2, 1, at(4)); // 但**在半徑 6 之內**
    markThreat(world, me, decoy);
    world.rebuildGrid();

    expect(rankOf(world, me, taunter)!.d2).toBeLessThan(6 * 6);
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy); // 對照組
    applyTaunt(world, me, taunter, 0.5);
    expect(acquireTarget(world, me, 6)?.id).toBe(taunter);
  });

  it("嘲弄者在索敵半徑之外照樣被索到（半徑是「我看多遠」，不是嘲弄的射程）", () => {
    cover(TAG);
    const world = combatWorld();
    const { me, taunter } = stackedDeck(world);
    // 近戰地板半徑 6；嘲弄者在 9 單位外，連 rankOf 的候選集合都進不去。
    expect(rankOf(world, me, taunter)!.d2).toBeGreaterThan(6 * 6);

    applyTaunt(world, me, taunter, 0.5);
    expect(acquireTarget(world, me, 6)?.id).toBe(taunter);
  });

  it("已經握著自動目標的人也會被拉走（`held` 那條路徑從不經過索敵）", () => {
    cover(TAG);
    // ⚠️ 這一條**必須**跑真的 `world.step()`，不能只呼叫 `acquireTarget`：
    // 一個已經握著自動目標的英雄每一 tick 都走 OrderSystem 的 `held` 分支，
    // 那條路徑用的是 `shouldSwapAutoTarget` 而**不是** `beats`，所以只在
    // `beats` 加 forced key 的實作在單元層看起來完全正常，在遊戲裡卻只對
    // 「剛好閒著」的人有效。
    const world = combatWorld();
    const { me, decoy, taunter } = stackedDeck(world);

    // 先讓 OrderSystem 自己索到誘餌並握住它。
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(true);

    // ⚠️ 出手前搖期間 OrderSystem 整個 pass 會跳過這個人
    //（`if (world.abilities.get(id)?.windup && nav.attackTarget !== null) continue`
    // —— 前搖中重新指向會讓那一刀砍空）。所以嘲弄要等到這一刀收完才接手，
    // 這是既有且刻意的行為，不是嘲弄壞掉。給它一個攻擊週期的時間。
    applyTaunt(world, me, taunter, 5);
    let swappedAt = -1;
    for (let i = 0; i < 90; i++) {
      world.step(NO_INTENTS);
      if (world.nav.get(me)!.attackTarget === taunter) {
        swappedAt = i;
        break;
      }
    }
    expect(swappedAt).toBeGreaterThanOrEqual(0);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);
  });

  it("對照組：沒有嘲弄的話，同樣 90 tick 之內他一路握著誘餌不放", () => {
    cover(TAG);
    // 少了這一條，上面那條在「每 tick 都重新索敵」的壞實作下也會過 —— 因為
    // 誘餌血更低、更近，重新索敵剛好也會挑它…直到它死掉為止。
    const world = combatWorld();
    const { me, decoy } = stackedDeck(world);
    for (let i = 0; i < 90; i++) world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
  });
});

// ────────────────────────────────────────────────────────────── 到期 ────

describe("到期是絕對 tick，而且真的會放手", () => {
  it("0.5 秒之後嘲弄失效，索敵回到誘餌", () => {
    cover(TAG);
    const world = combatWorld();
    const { me, decoy, taunter } = stackedDeck(world);
    applyTaunt(world, me, taunter, 0.5);
    expect(acquireTarget(world, me, 6)?.id).toBe(taunter);

    // 0.5 秒 = 15 tick @30Hz。第 15 tick 到期（`untilTick <= tick`）。
    for (let i = 0; i < 15; i++) world.step(NO_INTENTS);
    expect(tauntedBy(world, me)).toBeNull();
    world.rebuildGrid();
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);
  });

  it("嘲弄者死掉的當下就失效 —— 合法性是每 tick 重問的，不是寫入時檢查一次", () => {
    cover(TAG);
    const world = combatWorld();
    const { me, decoy, taunter } = stackedDeck(world);
    applyTaunt(world, me, taunter, 10);
    expect(forcedTargetOf(world, me)).toBe(taunter);

    world.health.get(taunter)!.alive = false;
    expect(forcedTargetOf(world, me)).toBeNull();
    world.rebuildGrid();
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);
  });

  it("嘲弄者被 destroy 之後，回收的 entityId 不會繼承那一筆嘲弄", () => {
    cover(TAG);
    const world = combatWorld();
    const { me, taunter } = stackedDeck(world);
    applyTaunt(world, me, taunter, 10);
    expect(world.taunt.size).toBe(1);

    world.destroy(taunter);
    // ⚠️ 這才是重點：受害者那一格還在（key 是 `me`，不是 taunter），所以
    // 只刪 `taunt.delete(id)` 的實作在這裡看起來完全正常。
    expect(world.taunt.size).toBe(0);
    expect(tauntedBy(world, me)).toBeNull();
  });
});

// ───────────────────────────────────────────────────── 小怪 aggro ────

/** 一份不會自己生怪的 mobWaves 設定 —— 這條測試自己擺殭屍。 */
const SILENT_WAVES: MobWavesConfigLike = {
  fromRound: 1,
  firstWaveSec: 9999,
  waveIntervalSec: 9999,
  mobsPerWaveCap: 0,
  maxAlivePerZone: 50,
  mob: {
    maxHp: 100,
    attackDamage: 10,
    moveSpeed: 3,
    attackRange: 1.6,
    attackCdSec: 1,
    radius: 0.5,
  },
  reward: { gold: 0, xp: 0, killsPerLevel: 30 },
};

describe("殭屍 aggro 走同一個 seam", () => {
  function siege(rules?: Partial<TauntRules>): {
    world: SimWorld;
    mob: EntityId;
    near: EntityId;
    taunter: EntityId;
  } {
    const world = combatWorld(rules);
    // ⚠️ 先武裝波次再擺殭屍 —— `beginCombatMobs` 開頭會 `endCombatMobs`，
    // 那會把場上每一隻既有的殭屍靜默 despawn 掉。
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 1), [0]);
    const mob = spawnMobBody(world, at(0));
    const near = spawnFighter(world, 0, 0, at(1)); // 貼在殭屍臉上
    const taunter = spawnFighter(world, 1, 0, at(10)); // 遠得多
    world.rebuildGrid();
    return { world, mob, near, taunter };
  }

  it("被嘲弄的殭屍改打嘲弄者，而不是貼在臉上的那一個", () => {
    cover(TAG);
    const { world, mob, near, taunter } = siege();
    // 對照組：沒有嘲弄 = 最近的那個。
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(near);

    applyTaunt(world, mob, taunter, 2);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(taunter);
    expect(world.nav.get(mob)!.attackTarget).toBe(taunter);
  });

  it("`appliesToMobs: false` 讓殭屍當場免疫（讀取時生效，不必等過期）", () => {
    cover(TAG);
    const { world, mob, near, taunter } = siege({ appliesToMobs: false });
    applyTaunt(world, mob, taunter, 2);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(near);
    // 但英雄那一側**不受影響** —— PvE 與 PvP 是兩格欄位，不是一格。
    // 用一位真正的敵隊英雄，因為 `taunter` 和 `near` 是同一隊。
    const foe = spawnFighter(world, 2, 1, at(4));
    world.rebuildGrid();
    applyTaunt(world, near, foe, 2);
    expect(forcedTargetOf(world, near, "auto")).toBe(foe);
  });
});

// ──────────────────────────────────────── 玩家自己下的指令（決策點） ────

describe("嘲弄 vs 玩家手選的目標 —— 出貨值把方向盤留給玩家", () => {
  function withManualOrder(rules?: Partial<TauntRules>): {
    world: SimWorld;
    me: EntityId;
    decoy: EntityId;
    taunter: EntityId;
  } {
    const world = combatWorld(rules);
    const { me, decoy, taunter } = stackedDeck(world);
    const nav = world.nav.get(me)!;
    nav.attackTarget = decoy;
    nav.attackTargetAuto = false; // 玩家右鍵點的
    applyTaunt(world, me, taunter, 5);
    return { world, me, decoy, taunter };
  }

  it("出貨值（false）：玩家點名的目標一個 tick 都沒被動到", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.overridesManualOrder).toBe(false);
    const { world, me, decoy } = withManualOrder();
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(false);
  });

  it("打開之後（true）：目標被搶走，改打嘲弄者", () => {
    cover(TAG);
    const { world, me, taunter } = withManualOrder({ overridesManualOrder: true });
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(true);
  });
});

// ────────────────────────────────────────────────── 其餘的設定欄位 ────

describe("每一個決策點都真的是欄位", () => {
  it("`enabled: false` = 嘲弄整條機制不存在（寫不進去，也讀不出來）", () => {
    cover(TAG);
    const world = combatWorld({ enabled: false });
    const { me, decoy, taunter } = stackedDeck(world);
    expect(applyTaunt(world, me, taunter, 5)).toBe(false);
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);

    // 而且是**讀取時**也擋：即使紀錄用別的路徑塞進去，關著就是讀不出來。
    world.taunt.set(me, { by: taunter, untilTick: world.tick + 999 });
    expect(tauntedBy(world, me)).toBeNull();
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);
  });

  it("`durationMult` 縮放持續時間；0 = 一發都掛不上", () => {
    cover(TAG);
    const fast = combatWorld({ durationMult: 2 });
    const a = stackedDeck(fast);
    applyTaunt(fast, a.me, a.taunter, 0.5);
    expect(fast.taunt.get(a.me)!.untilTick).toBe(fast.tick + 30); // 1.0 s

    const off = combatWorld({ durationMult: 0 });
    const b = stackedDeck(off);
    expect(applyTaunt(off, b.me, b.taunter, 0.5)).toBe(false);
    expect(off.taunt.size).toBe(0);
  });

  it("`conflictMode`: newest 讓新的一發一定生效，longest 讓長的贏", () => {
    cover(TAG);
    for (const mode of ["newest", "longest"] as const) {
      const world = combatWorld({ conflictMode: mode });
      const { me, decoy, taunter } = stackedDeck(world);
      applyTaunt(world, me, taunter, 5); // 長的先來
      const shortOne = decoy; // 誘餌接著喊一聲短的
      const took = applyTaunt(world, me, shortOne, 0.5);
      expect(took).toBe(mode === "newest");
      expect(tauntedBy(world, me)).toBe(mode === "newest" ? shortOne : taunter);
    }
  });

  it("自己嘲弄自己是 no-op（否則英雄會鎖死在自己身上）", () => {
    cover(TAG);
    const world = combatWorld();
    const { me } = stackedDeck(world);
    expect(applyTaunt(world, me, me, 5)).toBe(false);
    expect(world.taunt.size).toBe(0);
  });
});

describe("設定文件 → 規則", () => {
  it("缺文件 / schema 不對 → 出貨表，不是空物件", () => {
    cover(TAG);
    expect(tauntRulesFromDoc(undefined)).toEqual(DEFAULT_TAUNT_RULES);
    expect(tauntRulesFromDoc({ schema: "config.stealth@1", enabled: false })).toEqual(
      DEFAULT_TAUNT_RULES,
    );
  });

  it("出貨的 content/config/taunt.json 就是 DEFAULT_TAUNT_RULES（drift 守衛）", async () => {
    cover(TAG);
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const doc = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/taunt.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(doc.schema).toBe(TAUNT_SCHEMA);
    expect(tauntRulesFromDoc(doc)).toEqual(DEFAULT_TAUNT_RULES);
  });

  it("每一格單獨夾住：壞掉的一格退回出貨值，不會把整張表丟掉", () => {
    cover(TAG);
    const r = normalizeTauntRules({
      enabled: "yes", // 型別錯
      overridesManualOrder: true, // 好的
      conflictMode: "loudest", // 不存在的模式
      durationMult: 999, // 超過上界
    });
    expect(r.enabled).toBe(DEFAULT_TAUNT_RULES.enabled);
    expect(r.overridesManualOrder).toBe(true);
    expect(r.conflictMode).toBe("newest");
    // 上界是誤植守衛：999 被夾到 10，而不是變成 NaN 或一路穿過去。
    expect(r.durationMult).toBe(10);
    expect(normalizeTauntRules({ durationMult: Number.NaN }).durationMult).toBe(1);
  });
});

// ──────────────────────────────────────────────────── the effect kind ────

describe("`taunt` 效果本身", () => {
  it("範圍版拉住半徑內的敵人、放過友軍，而且吃 maxTargets（由近到遠）", () => {
    cover(TAG);
    const world = combatWorld();
    const shield = spawnFighter(world, 0, 0, at(0));
    const near = spawnFighter(world, 1, 1, at(1));
    const mid = spawnFighter(world, 2, 1, at(2));
    const far = spawnFighter(world, 3, 1, at(3));
    const ally = spawnFighter(world, 4, 0, at(1.2));
    world.rebuildGrid();

    runEffects([{ kind: "taunt", durationSec: 1, radius: 20, maxTargets: 2 }], {
      world,
      caster: shield,
      rank: 1,
      targets: [],
      origin: "item:test",
      rng: world.rng,
    });

    expect(tauntedBy(world, near)).toBe(shield);
    expect(tauntedBy(world, mid)).toBe(shield);
    // maxTargets 2 由**近到遠**切，所以最遠的那一個沒被拉到。
    expect(tauntedBy(world, far)).toBeNull();
    // 友軍永遠不在 `enemiesInCircle` 的結果裡。
    expect(tauntedBy(world, ally)).toBeNull();
    expect(world.events.filter((e) => e.type === "taunt")).toHaveLength(1);
  });

  it("radius 走 combatEnv.abilityRange —— 它不是唯一一個無視射程預算的 AoE", () => {
    cover(TAG);
    const world = combatWorld();
    world.combatEnv = { ...world.combatEnv, abilityRange: 0.1 };
    const shield = spawnFighter(world, 0, 0, at(0));
    const enemy = spawnFighter(world, 1, 1, at(5));
    world.rebuildGrid();

    // 作者寫 10，乘上 0.1 之後只剩 1 —— 5 單位外的敵人拉不到。
    runEffects([{ kind: "taunt", durationSec: 1, radius: 10 }], {
      world,
      caster: shield,
      rank: 1,
      targets: [],
      origin: "item:test",
      rng: world.rng,
    });
    expect(tauntedBy(world, enemy)).toBeNull();

    world.combatEnv = { ...world.combatEnv, abilityRange: 1 };
    runEffects([{ kind: "taunt", durationSec: 1, radius: 10 }], {
      world,
      caster: shield,
      rank: 1,
      targets: [],
      origin: "item:test",
      rng: world.rng,
    });
    expect(tauntedBy(world, enemy)).toBe(shield);
  });

  it("沒有 radius = 單體，掛在這個效果自己解析出來的目標上", () => {
    cover(TAG);
    const world = combatWorld();
    const shield = spawnFighter(world, 0, 0, at(0));
    const picked = spawnFighter(world, 1, 1, at(1));
    const bystander = spawnFighter(world, 2, 1, at(1.5));
    world.rebuildGrid();

    runEffects([{ kind: "taunt", durationSec: 1 }], {
      world,
      caster: shield,
      rank: 1,
      targets: [picked],
      origin: "ability:test",
      rng: world.rng,
    });
    expect(tauntedBy(world, picked)).toBe(shield);
    expect(tauntedBy(world, bystander)).toBeNull();
  });
});
