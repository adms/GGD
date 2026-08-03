/**
 * 嘲弄的六個決策點 —— 每一個都是**欄位**，每一條測試都釘住「那一行沒了就紅」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支存在的理由（第一守則）
 * ════════════════════════════════════════════════════════════════════════════
 * 複驗抓到嘲弄這條 seam 上有六個 either/or 被寫死在 sim 裡，而且**每一個都配著
 * 一段替自己辯護的註解**。CLAUDE.md 自己的判準是：那段辯護的註解本身就是
 * 「這裡本來該是一個欄位」的證據。所以它們現在全部是 `TauntRules` 的欄位：
 *
 *   1. `priority`                   索敵比較器裡嘲弄排第幾
 *   2. `leashUnits`                 一發嘲弄最多能把人拖多遠
 *   3. `mobTauntMode`               小怪：取代掃描 vs 偏袒掃描
 *   4. `grantGold.mobLevelSource`   小怪的「等級」從哪來（在 effect 上，見下）
 *   5. `maxTargetsCap` / `capOrder` 一發拉幾個 + 砍掉時留下哪幾個
 *   6. `restoreManualOrderOnLapse`  嘲弄退掉之後把玩家的指令還回去
 *
 * ⚠️ 每一條都寫成**兩側對照**：出貨值一個斷言、翻過去一個斷言。少了對照組，
 * 一條「打開之後 X」的測試在「永遠都 X」的壞實作底下照樣綠（失敗形態 ④）。
 *
 * 幾何抄 `taunt.test.ts`：SKELETON_ARENA 的 zone 0 圓心在 (-40, 0)，所有東西住
 * 在 `z = center.z + 12` 這條淨空的線上。放在世界原點的身體在邊界外 40 單位，
 * 會被夾回來，而那會無聲地毀掉這裡每一個距離斷言。
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
import type { IntentFrame, Order } from "./intents";
import { MONSTER_TEAM, mobRulesFromConfig, type MobWavesConfigLike } from "./mobs";
import { beginCombatMobs, mobSystem } from "./systems/MobSystem";
import { acquireTarget, forcedTargetOf } from "./targeting";
import { applyTaunt, DEFAULT_TAUNT_RULES, tauntedBy, type TauntRules } from "./taunt";
import { DEFAULT_COMBAT_FEEL, DEFAULT_MANUAL_ORDER } from "./combatFeel";
import { levelOfTarget } from "./effects/grantGold";
import { runEffects } from "./effects/effectRunner";
import * as V from "./math/vec2";

const TAG = "taunt-forced-targeting";
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const IMMOBILE = 1e-9;

function at(dx: number): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 };
}

function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  hp = 5000,
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
  final[Stat.MoveSpeed] = IMMOBILE;
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

/** 一個 #215 形狀的小怪：MONSTER 隊、有 MobComp、**刻意沒有** ChampionComp。 */
function spawnMobBody(world: SimWorld, pos: V.Vec2, hp = 100): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
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

function markThreat(world: SimWorld, victim: EntityId, attacker: EntityId): void {
  let m = world.recentDamagers.get(victim);
  if (!m) {
    m = new Map<EntityId, number>();
    world.recentDamagers.set(victim, m);
  }
  m.set(attacker, world.tick);
}

// ───────────────────────────────── 決策 1：嘲弄在比較器裡排第幾 ────

describe("① `priority` —— 嘲弄在索敵比較器裡排第幾", () => {
  /**
   * 兩種模式的差別**只有**在嘲弄者與另一個候選的 `kind` 不同時才看得到，所以
   * 這個佈景刻意讓嘲弄者是一隻**小怪**（kind 2）、誘餌是一位**敵方英雄**
   * （kind 0），而且兩個都在索敵半徑之內（`sawForced` 為真，半徑外那條救援
   * 完全沒有參與，這一條釘的就是 `beats()` 那一行本身）。
   */
  function kindClash(rules?: Partial<TauntRules>): {
    world: SimWorld;
    me: EntityId;
    decoy: EntityId;
    mobTaunter: EntityId;
  } {
    const world = combatWorld(rules);
    const me = spawnFighter(world, 0, 0, at(0));
    const decoy = spawnFighter(world, 1, 1, at(3)); // 敵方英雄，kind 0
    const mobTaunter = spawnMobBody(world, at(1.5)); // 小怪，kind 2，而且更近
    world.rebuildGrid();
    return { world, me, decoy, mobTaunter };
  }

  it("出貨 absolute：小怪的嘲弄壓過「敵方英雄優先」", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.priority).toBe("absolute");
    const { world, me, decoy, mobTaunter } = kindClash();
    // 對照組：沒有嘲弄 → 英雄贏（kind 0 < 2），即使小怪更近。
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);
    applyTaunt(world, me, mobTaunter, 5);
    expect(acquireTarget(world, me, 6)?.id).toBe(mobTaunter);
  });

  it("aboveThreatOnly：同一發嘲弄拉不動他，敵方英雄仍然優先", () => {
    cover(TAG);
    const { world, me, decoy, mobTaunter } = kindClash({ priority: "aboveThreatOnly" });
    applyTaunt(world, me, mobTaunter, 5);
    expect(tauntedBy(world, me)).toBe(mobTaunter); // 狀態真的掛上了
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy); // 但比較器不讓他贏
  });

  it("aboveThreatOnly 仍然壓過「威脅」—— 兩側都不允許嘲弄被它想拉開的人取消", () => {
    cover(TAG);
    // 同 kind（兩個都是敵方英雄），誘餌正在打我。嘲弄仍然要贏，否則一發嘲弄
    // 會被它唯一想解決的那個狀況當場取消掉。
    const world = combatWorld({ priority: "aboveThreatOnly" });
    const me = spawnFighter(world, 0, 0, at(0));
    const decoy = spawnFighter(world, 1, 1, at(1.5), 40);
    const taunter = spawnFighter(world, 2, 1, at(4));
    markThreat(world, me, decoy);
    world.rebuildGrid();
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy); // 對照組
    applyTaunt(world, me, taunter, 5);
    expect(acquireTarget(world, me, 6)?.id).toBe(taunter);
  });

  it("半徑外那條救援也吃這一格 —— 不會從後門把 absolute 塞回去", () => {
    cover(TAG);
    // 嘲弄者（小怪）在索敵半徑 6 **之外**（8 單位），走的是 `acquireTarget`
    // 尾巴那條救援。舊實作那條救援是無條件 `best = r`，所以在
    // aboveThreatOnly 底下會等於偷偷變回 absolute。
    const world = combatWorld({ priority: "aboveThreatOnly" });
    const me = spawnFighter(world, 0, 0, at(0));
    const decoy = spawnFighter(world, 1, 1, at(3));
    const far = spawnMobBody(world, at(8));
    world.rebuildGrid();
    applyTaunt(world, me, far, 5);
    expect(forcedTargetOf(world, me)).toBe(far); // 合法性通過（沒被牽引距離擋掉）
    expect(acquireTarget(world, me, 6)?.id).toBe(decoy);

    // …而 absolute 那一側，同一個佈景救援照樣把他拉走。
    const abs = combatWorld({ priority: "absolute" });
    const me2 = spawnFighter(abs, 0, 0, at(0));
    spawnFighter(abs, 1, 1, at(3));
    const far2 = spawnMobBody(abs, at(8));
    abs.rebuildGrid();
    applyTaunt(abs, me2, far2, 5);
    expect(acquireTarget(abs, me2, 6)?.id).toBe(far2);
  });
});

// ─────────────────────────────────────── 決策 2：牽引距離 ────

describe("② `leashUnits` —— 一發嘲弄最多能把人拖多遠", () => {
  it("出貨 24；超過就當場鬆手，走回來又生效（讀取時判定，和到期同一個形態）", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.leashUnits).toBe(24);
    const world = combatWorld({ leashUnits: 5 });
    const me = spawnFighter(world, 0, 0, at(0));
    const taunter = spawnFighter(world, 1, 1, at(3));
    world.rebuildGrid();
    applyTaunt(world, me, taunter, 30);
    expect(forcedTargetOf(world, me)).toBe(taunter);

    // 嘲弄者跑到 9 單位外（牽引距離 5 之外）→ 這一 tick 就不再被迫打他。
    world.transform.get(taunter)!.pos = { ...at(9) };
    expect(forcedTargetOf(world, me)).toBeNull();
    // 紀錄還在（惰性垃圾），走回來就又生效 —— 不是「嘲弄被刪掉了」。
    expect(tauntedBy(world, me)).toBe(taunter);
    world.transform.get(taunter)!.pos = { ...at(4) };
    expect(forcedTargetOf(world, me)).toBe(taunter);
  });

  it("0 = 不限制（舊行為）—— 同一個距離下他照樣被迫追", () => {
    cover(TAG);
    const world = combatWorld({ leashUnits: 0 });
    const me = spawnFighter(world, 0, 0, at(0));
    const taunter = spawnFighter(world, 1, 1, at(9));
    world.rebuildGrid();
    applyTaunt(world, me, taunter, 30);
    expect(forcedTargetOf(world, me)).toBe(taunter);
  });

  it("小怪那一側走的是同一個判定（一條拉繩，不是兩份知識）", () => {
    cover(TAG);
    const world = combatWorld({ leashUnits: 5 });
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 1), [0]);
    const mob = spawnMobBody(world, at(0));
    const near = spawnFighter(world, 0, 0, at(1));
    const taunter = spawnFighter(world, 1, 0, at(9)); // 牽引距離之外
    world.rebuildGrid();
    applyTaunt(world, mob, taunter, 5);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(near);

    // 走進拉繩之內 → 同一發嘲弄立刻生效。
    world.transform.get(taunter)!.pos = { ...at(4) };
    world.rebuildGrid();
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(taunter);
  });
});

// ───────────────────────────── 決策 3：小怪 取代 vs 偏袒 ────

/** 一份不會自己生怪的 mobWaves 設定 —— 這些測試自己擺殭屍。 */
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

describe("③ `mobTauntMode` —— 小怪是改打嘲弄者，還是只把他排前面", () => {
  function siege(rules?: Partial<TauntRules>): {
    world: SimWorld;
    mob: EntityId;
    near: EntityId;
    farTaunter: EntityId;
  } {
    const world = combatWorld(rules);
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 1), [0]);
    const mob = spawnMobBody(world, at(0));
    const near = spawnFighter(world, 0, 0, at(1)); // 貼在殭屍臉上
    const farTaunter = spawnFighter(world, 1, 0, at(10)); // 遠得多，但在牽引距離內
    world.rebuildGrid();
    return { world, mob, near, farTaunter };
  }

  it("出貨 replace：不管誰比較近，改打嘲弄者", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.mobTauntMode).toBe("replace");
    const { world, mob, near, farTaunter } = siege();
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(near); // 對照組
    applyTaunt(world, mob, farTaunter, 5);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(farTaunter);
  });

  it("nearestFirst：有更近的敵人時嘲弄者拉不動牠", () => {
    cover(TAG);
    const { world, mob, near, farTaunter } = siege({ mobTauntMode: "nearestFirst" });
    applyTaunt(world, mob, farTaunter, 5);
    expect(forcedTargetOf(world, mob, "mob")).toBe(farTaunter); // 狀態合法
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(near); // …但掃描贏了
  });

  it("nearestFirst：**平手時嘲弄者贏** —— 這就是「偏袒」唯一有意義的那一半", () => {
    cover(TAG);
    // ⚠️ 這一條是量出來才補的。`nearestFirst` 的其它情境全部**推不出**這一行:
    // 嘲弄者一定也是普通掃描的候選(兩邊走同一組合法性檢查),所以只要它比較
    // 近,掃描自己就會選到它 —— 也就是說 `forcedD2 <= bestD2` 那一段刪掉,
    // 上下兩條測試都還是綠的(實測 broken_exit=0)。真正只有它做得到的事情
    // 是**平手**:同樣距離,嘲弄者拿走。
    const world = combatWorld({ mobTauntMode: "nearestFirst" });
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 1), [0]);
    const mob = spawnMobBody(world, at(0));
    // 兩位英雄，離殭屍**完全一樣遠**。先生成的那個在嚴格 `<` 的掃描裡勝出。
    const first = spawnFighter(world, 0, 0, at(-3));
    const tauntTie = spawnFighter(world, 1, 0, at(3));
    world.rebuildGrid();
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(first); // 對照組：平手給先來的

    applyTaunt(world, mob, tauntTie, 5);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(tauntTie);
  });

  it("nearestFirst：嘲弄者自己是最近的那一個時，它仍然生效（不是整條被關掉）", () => {
    cover(TAG);
    const world = combatWorld({ mobTauntMode: "nearestFirst" });
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 1), [0]);
    const mob = spawnMobBody(world, at(0));
    const far = spawnFighter(world, 0, 0, at(6));
    const nearTaunter = spawnFighter(world, 1, 0, at(1));
    world.rebuildGrid();
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(nearTaunter); // 本來就最近
    applyTaunt(world, mob, nearTaunter, 5);
    mobSystem(world);
    expect(world.mob.get(mob)!.target).toBe(nearTaunter);
    expect(world.health.get(far)!.alive).toBe(true);
  });
});

// ─────────────────────── 決策 4：小怪的「等級」（grantGold）────

describe("④ `grantGold.mobLevelSource` —— 小怪的「等級」從哪裡來", () => {
  it("出貨 wave：一隻殭屍值**波次等級**，不是 0", () => {
    cover(TAG);
    const world = combatWorld();
    // 第 5 場 → mobRules.level = 5（#217 的曲線：baseLevel 3 + 每場 +1）。
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 5), [0]);
    const mob = spawnMobBody(world, at(0));
    const waveLevel = world.mobRules!.level;
    expect(waveLevel).toBeGreaterThan(0);
    expect(levelOfTarget(world, mob)).toBe(waveLevel);
  });

  it("fallback：同一隻殭屍值 `fallbackLevel`（出貨的 0 = 舊行為）", () => {
    cover(TAG);
    const world = combatWorld();
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 5), [0]);
    const mob = spawnMobBody(world, at(0));
    expect(levelOfTarget(world, mob, "fallback")).toBe(0);
    expect(levelOfTarget(world, mob, "fallback", 7)).toBe(7);
  });

  it("波次沒武裝時退回 fallback —— 不會讀到一個不存在的等級", () => {
    cover(TAG);
    const world = combatWorld(); // 沒有 beginCombatMobs
    const mob = spawnMobBody(world, at(0));
    expect(world.mobRules).toBeNull();
    expect(levelOfTarget(world, mob, "wave", 2)).toBe(2);
  });

  it("英雄與召喚物的答案沒有被動到（小怪那條分支不是全域改寫）", () => {
    cover(TAG);
    const world = combatWorld();
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 9), [0]);
    const hero = spawnFighter(world, 0, 0, at(0));
    world.champion.get(hero)!.level = 4;
    expect(levelOfTarget(world, hero)).toBe(4);
  });

  it("端到端：`grantGold perTargetLevel: 1` 打在殭屍身上真的付得出錢", () => {
    cover(TAG);
    const world = combatWorld();
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 5), [0]);
    const holder = spawnFighter(world, 0, 0, at(0));
    const mob = spawnMobBody(world, at(1));
    world.rebuildGrid();
    const waveLevel = world.mobRules!.level;

    runEffects([{ kind: "grantGold", perTargetLevel: 1, to: "self" }], {
      world,
      caster: holder,
      rank: 1,
      targets: [mob],
      origin: "item:test",
      rng: world.rng,
    });
    expect(world.champion.get(holder)!.gold).toBe(waveLevel);

    // 對照組：同一發，卡片說小怪沒有等級 → 一毛都不發。
    runEffects(
      [{ kind: "grantGold", perTargetLevel: 1, to: "self", mobLevelSource: "fallback" }],
      { world, caster: holder, rank: 1, targets: [mob], origin: "item:test", rng: world.rng },
    );
    expect(world.champion.get(holder)!.gold).toBe(waveLevel);
  });
});

// ──────────────── 決策 5：一發拉幾個 + 砍掉時留下哪幾個 ────

describe("⑤ `maxTargetsCap` / `capOrder` —— 一發拉幾個，以及留下哪幾個", () => {
  /** 盾主在 0；三個敵人在 1 / 2 / 3，血量刻意與距離**反序**。 */
  function ring(rules?: Partial<TauntRules>): {
    world: SimWorld;
    shield: EntityId;
    near: EntityId;
    mid: EntityId;
    far: EntityId;
  } {
    const world = combatWorld(rules);
    const shield = spawnFighter(world, 0, 0, at(0));
    const near = spawnFighter(world, 1, 1, at(1), 3000);
    const mid = spawnFighter(world, 2, 1, at(2), 2000);
    const far = spawnFighter(world, 3, 1, at(3), 100); // 最遠、但血最低
    world.rebuildGrid();
    return { world, shield, near, mid, far };
  }

  function pulse(world: SimWorld, shield: EntityId, maxTargets?: number): void {
    runEffects([{ kind: "taunt", durationSec: 1, radius: 20, maxTargets }], {
      world,
      caster: shield,
      rank: 1,
      targets: [],
      origin: "item:test",
      rng: world.rng,
    });
  }

  it("`maxTargetsCap` 夾得住卡片自己寫的數字（不是只在卡片沒寫時才用）", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.maxTargetsCap).toBe(20);
    const { world, shield, near, mid, far } = ring({ maxTargetsCap: 1 });
    pulse(world, shield, 3); // 卡片說 3，操作者說最多 1
    expect(tauntedBy(world, near)).toBe(shield);
    expect(tauntedBy(world, mid)).toBeNull();
    expect(tauntedBy(world, far)).toBeNull();
  });

  it("卡片沒寫時就用 `maxTargetsCap`", () => {
    cover(TAG);
    const { world, shield, near, mid, far } = ring({ maxTargetsCap: 2 });
    pulse(world, shield, undefined);
    expect(tauntedBy(world, near)).toBe(shield);
    expect(tauntedBy(world, mid)).toBe(shield);
    expect(tauntedBy(world, far)).toBeNull();
  });

  it("`capOrder: nearest`（出貨）留下最近的兩個", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.capOrder).toBe("nearest");
    const { world, shield, near, mid, far } = ring({ maxTargetsCap: 2 });
    pulse(world, shield);
    expect(tauntedBy(world, near)).toBe(shield);
    expect(tauntedBy(world, mid)).toBe(shield);
    expect(tauntedBy(world, far)).toBeNull(); // 最遠的被砍掉
  });

  it("`capOrder: lowestHp` 換成血最低的兩個 —— 同一個佈景，答案相反", () => {
    cover(TAG);
    const { world, shield, near, mid, far } = ring({
      maxTargetsCap: 2,
      capOrder: "lowestHp",
    });
    pulse(world, shield);
    expect(tauntedBy(world, far)).toBe(shield); // 100 血
    expect(tauntedBy(world, mid)).toBe(shield); // 2000 血
    expect(tauntedBy(world, near)).toBeNull(); // 3000 血，最滿的被砍掉
  });

  it("`capOrder: id` 留下最早生成的兩個（與距離、血量都無關）", () => {
    cover(TAG);
    // 生成順序刻意打亂：最先生成的是最遠的那一個。
    const world = combatWorld({ maxTargetsCap: 2, capOrder: "id" });
    const shield = spawnFighter(world, 0, 0, at(0));
    const first = spawnFighter(world, 1, 1, at(3), 5000);
    const second = spawnFighter(world, 2, 1, at(2), 4000);
    const third = spawnFighter(world, 3, 1, at(1), 10);
    world.rebuildGrid();
    pulse(world, shield);
    expect(tauntedBy(world, first)).toBe(shield);
    expect(tauntedBy(world, second)).toBe(shield);
    expect(tauntedBy(world, third)).toBeNull();
  });
});

// ──────────────── 決策 6：嘲弄退掉之後，玩家的指令回不回來 ────

describe("⑥ `restoreManualOrderOnLapse` —— 方向盤還不還給玩家", () => {
  /**
   * ⚠️ 這裡下的是**真的 seat 指令**（`{kind:"attackTarget"}` 走 intent frame），
   * 不是手寫 `nav.attackTarget`。差別是實打實的：`autoAcquirePass` 開頭那個
   * `case "attackTarget": if (nav.attackTarget !== null) continue;` 會先把人
   * 踢出這一輪，所以只有走真指令才碰得到接管那一段。既有那條測試手寫 nav
   * 而沒有 `nav.order`，於是 `overridesManualOrder` 從來沒有對真實玩家指令
   * 生效過，而測試是綠的（失敗形態 ⑤）。
   */
  function withRealOrder(rules?: Partial<TauntRules>): {
    world: SimWorld;
    me: EntityId;
    decoy: EntityId;
    taunter: EntityId;
    step: (n?: number) => void;
  } {
    const world = combatWorld({ overridesManualOrder: true, ...rules });
    const me = spawnFighter(world, 0, 0, at(0));
    // ⚠️ 兩個都放在**近戰射程之外**（reach ≈ 1.6 + 兩個半徑 = 2.8）而仍在索敵
    // 半徑 6 之內，而且身體是不動的。理由是前搖：`autoAcquirePass` 開頭那一行
    // 在出手前搖期間整個跳過這個人，所以只要有一刀在揮，接管會被推遲到那一刀
    // 收完（60 tick 的攻擊週期），而這幾條測的是「嘲弄退掉之後」的行為，不是
    // 那個既有的延遲。站在射程外就不會有任何一刀。
    const decoy = spawnFighter(world, 1, 1, at(5), 40);
    const taunter = spawnFighter(world, 2, 1, at(4));
    world.rebuildGrid();

    const order: Order = { kind: "attackTarget", entity: decoy };
    const frames = new Map<SeatId, IntentFrame>([[asSeatId(0), { order, commands: [] }]]);
    world.step(frames); // 玩家右鍵點名誘餌
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(false);

    return {
      world,
      me,
      decoy,
      taunter,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) world.step(NO_INTENTS);
      },
    };
  }

  it("接管真的會發生（真指令，不是手寫的 nav 狀態）", () => {
    cover(TAG);
    const { world, me, taunter, step } = withRealOrder();
    applyTaunt(world, me, taunter, 5);
    step(2);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);
    expect(world.suspendedOrder.get(me)).toBeDefined();
  });

  it("出貨 true：嘲弄退掉的那一刻，玩家點名的目標回來，而且回來時是**手選**", () => {
    cover(TAG);
    expect(DEFAULT_TAUNT_RULES.restoreManualOrderOnLapse).toBe(true);
    const { world, me, decoy, taunter, step } = withRealOrder();
    applyTaunt(world, me, taunter, 0.2); // 6 tick
    step(2);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);

    step(12); // 嘲弄早就過期了
    expect(tauntedBy(world, me)).toBeNull();
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
    // 「手選」才是還原 —— 留成自動目標的話下一 tick 就會被索敵換掉。
    expect(world.nav.get(me)!.attackTargetAuto).toBe(false);
    expect(world.suspendedOrder.has(me)).toBe(false);
  });

  it("false：同一個劇本，玩家的目標一去不回（舊行為）", () => {
    cover(TAG);
    const { world, me, decoy, taunter, step } = withRealOrder({
      restoreManualOrderOnLapse: false,
    });
    applyTaunt(world, me, taunter, 0.2);
    step(2);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);
    step(12);
    expect(tauntedBy(world, me)).toBeNull();
    // 誘餌還活著、還在原地、還是那個更近更殘的目標 —— 但他不會回去。
    expect(world.health.get(decoy)!.alive).toBe(true);
    expect(world.nav.get(me)!.attackTarget).not.toBe(decoy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(true);
  });

  it("嘲弄者死掉也算「退掉」—— 不必等它過期", () => {
    cover(TAG);
    const { world, me, decoy, taunter, step } = withRealOrder();
    applyTaunt(world, me, taunter, 30);
    step(2);
    expect(world.nav.get(me)!.attackTarget).toBe(taunter);

    world.health.get(taunter)!.alive = false;
    step(2);
    expect(world.nav.get(me)!.attackTarget).toBe(decoy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(false);
  });

  // GH#266 —— 「一條走位取消暫存的手選目標」現在跟著 `manualOrder
  // .survivesGroundMove` 走(出貨那一側是「撐得過」,見 combatFeel.ts):兩者
  // 必須同進退,否則「嘲弄期間走了一步」= 永久忘記他點的那一隻,而**沒有嘲弄的
  // 同一步卻記得** —— 那個不一致對玩家沒有任何可辨識的差別。這裡把欄位切到
  // #274 那一側,原本的斷言就原封不動地繼續守著那一側。
  it("`survivesGroundMove: false` → 玩家在嘲弄期間自己走位,還原被取消（新指令贏）", () => {
    cover(TAG);
    const { world, me, decoy, taunter, step } = withRealOrder();
    world.combatFeel = {
      ...DEFAULT_COMBAT_FEEL,
      manualOrder: { ...DEFAULT_MANUAL_ORDER, survivesGroundMove: false },
    };
    applyTaunt(world, me, taunter, 0.2);
    step(2);
    expect(world.suspendedOrder.get(me)).toBe(decoy);

    const move: Order = { kind: "move", point: at(2) };
    world.step(new Map<SeatId, IntentFrame>([[asSeatId(0), { order: move, commands: [] }]]));
    expect(world.suspendedOrder.has(me)).toBe(false);
    step(12);
    expect(world.nav.get(me)!.attackTarget).not.toBe(decoy);
  });

  it("被暫存的目標死掉就不還 —— 對著屍體的指令不是還原", () => {
    cover(TAG);
    const { world, me, decoy, taunter, step } = withRealOrder();
    applyTaunt(world, me, taunter, 0.2);
    step(2);
    world.health.get(decoy)!.alive = false;
    step(12);
    expect(world.nav.get(me)!.attackTarget).not.toBe(decoy);
    expect(world.suspendedOrder.has(me)).toBe(false);
  });

  it("`destroy` 兩個方向都清 —— 回收的 entityId 不會繼承一條別人的指令", () => {
    cover(TAG);
    const { world, me, decoy, taunter, step } = withRealOrder();
    applyTaunt(world, me, taunter, 30);
    step(2);
    expect(world.suspendedOrder.get(me)).toBe(decoy);

    // ⚠️ 重點在這裡:被刪掉的是**值**那一邊(玩家點名的那個人),不是 key。
    // 只刪 `suspendedOrder.delete(id)` 的實作在這裡看起來完全正常。
    world.destroy(decoy);
    expect(world.suspendedOrder.has(me)).toBe(false);
  });
});
