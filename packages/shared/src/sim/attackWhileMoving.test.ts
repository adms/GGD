/**
 * 打就站定 —— 移動中不得出手 (owner 2026-07-28:「遠程單位在攻擊的時候可以邊移動
 * 邊攻擊，這樣對近戰單位來說是不公平的」).
 *
 * ---------------------------------------------------------------------------
 * 這個回報描述的不是一個數值失衡，是一條從來沒被寫下來的規則
 * ---------------------------------------------------------------------------
 * 改動之前，`BasicAttackSystem` 的前搖只在三種情況取消：目標死了、目標消失、目標
 * 跑出射程。出手者自己在不在走，整個系統從頭到尾沒有讀過。所以「能不能邊走邊打」
 * 實際上是被**射程**夾出來的副作用：
 *
 *     近戰 82 位：射程 1.2~1.6，前搖中位數 0.5 s（15 tick）
 *     遠程 33 位：射程 6~12  ，前搖中位數 0.3 s（ 9 tick）
 *     移速中位數 5.9 / 5.7 —— 兩邊幾乎一樣
 *
 * 一個以 5.9 移動的目標在 0.5 s 內跑掉 2.95 單位。那遠超過近戰 1.6 的射程，卻被
 * 遠程 8.2 的射程整碗吸收。於是同一條規則對近戰是「動了就落空」，對遠程是「隨便
 * 動都打得到」—— 這就是 owner 看到的不公平，而它不在任何一張數值表上。
 *
 * 補法照 WC3（本作英雄本來就是 WC3 英雄單位改的）：**單位要攻擊就得停下來**。傷害
 * 點之後不加任何鎖，所以「傷害結算完立刻走」仍然免費 —— WC3 的 hit-and-run 微操
 * 是自然浮現的，不是額外做的。
 *
 * 唯一的例外是「正朝目標靠近」，而那是**量出來的**：見本檔最後一個 describe。
 *
 * 這個檔測的是規則本身（探針單位、無內容檔、完全決定性）。真實英雄的端到端證據在
 * `sim/autoAttackCensus.test.ts`（射程內攻擊速率棘輪）與
 * `apps/game-server/src/match/autoAcquireWhileMoving.test.ts`（真人座位的五種輸入
 * 流）—— 那兩個是這條規則最容易踩壞的東西，不是這裡。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import type { AbilitiesComp } from "./stats/statsComp";
import * as V from "./math/vec2";

const Z0 = SKELETON_ARENA.zones[0]!;
/** 清空的走道：+12 z 避開 (cx±9, ∓8) 兩根 r1.8 柱子，與 chaseRange.test.ts 同。 */
const LANE_Z = Z0.center.z + 12;

/**
 * 一個最小可戰單位。刻意不掛 ChampionDef —— `cdef` 因此是 undefined，
 * `attackType` 退回 "melee"、`baseAttackTime` 退回 1.0、前搖用
 * DEFAULT_DAMAGE_POINT_MELEE = 0.25 s。`range` 才是這個檔要調的旋鈕：這條規則對
 * 近戰／遠程是同一條，差別只在射程能吸收多少位移，所以用「射程」當自變數比用
 * attackType 誠實。
 */
function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  range: number,
  attackSpeed = 2,
  moveSpeed = 5.8,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 100000, maxHp: 100000, mana: 0, maxMana: 0, alive: true, shields: [] });
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
  final[Stat.AttackSpeed] = attackSpeed;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  return id;
}

interface Sample {
  /** 這一 tick 出手者揮出的普攻次數 */
  swings: number;
  /** 這一 tick 結束時出手者的速度 (u/s) */
  speed: number;
  /** 這一 tick 結束時與目標的距離 */
  dist: number;
}

/**
 * 跑 `ticks` tick，每 tick 先讓 `drive` 決定這一 tick 的訂單，再 step，然後取樣。
 *
 * 每 tick 重寫 `attackTarget` 是刻意的（Tier0Brain 就是這樣做的），而且
 * `world.combatActive` 保持預設的 false，所以 `autoAcquirePass` 整段跳過 ——
 * 目標由測試指定，不會被自動索敵改寫成別人。
 */
function drive(
  world: SimWorld,
  me: EntityId,
  foe: EntityId,
  ticks: number,
  each?: (tick: number) => void,
): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; k < ticks; k++) {
    world.nav.get(me)!.attackTarget = foe;
    each?.(k);
    world.step(new Map());
    const t = world.transform.get(me)!;
    const f = world.transform.get(foe)!;
    out.push({
      swings: world.events.filter(
        (e) => e.type === "basicAttack" && (e.data as { source?: EntityId }).source === me,
      ).length,
      speed: V.len(t.vel),
      dist: V.dist(t.pos, f.pos),
    });
  }
  return out;
}

const totalSwings = (s: Sample[]): number => s.reduce((a, b) => a + b.swings, 0);

/** 每 tick 重下一張「往 `point` 走」的明確訂單 —— 搖桿就是這樣送的。 */
function walkToward(world: SimWorld, me: EntityId, point: V.Vec2): void {
  const nav = world.nav.get(me)!;
  nav.order = { kind: "move", point: { ...point } };
  nav.moveTarget = { ...point };
}

describe("風箏：一邊後退一邊平砍", () => {
  /**
   * 這是回報本身。射程 8 的單位在距離 3 處後退，目標同速追著 —— 整段都在射程內，
   * 舊規則下它可以無限輸出而完全不被還手。
   */
  it("後退中一下都打不出來 —— 而目標從頭到尾都在射程內", () => {
    cover("ba-standstill-kite");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x + 20, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 23, z: LANE_Z }, 1.6);
    // 目標追我（近戰的處境），所以距離維持不變 —— 這才是真正的風箏，
    // 而不是「跑到射程外所以打不到」那種不算數的證明。
    const away = { x: Z0.center.x - 1000, z: LANE_Z };
    const s = drive(world, me, foe, 180, () => {
      world.nav.get(foe)!.attackTarget = me;
      walkToward(world, me, away);
    });

    expect(totalSwings(s)).toBe(0);

    // ---- 儀器必須是活的，否則上面那個 0 什麼都沒證明 ----
    // 1) 真的一直在走
    expect(s.filter((x) => x.speed > 0.5).length).toBeGreaterThan(150);
    // 2) 真的一直在射程內（最遠的那一 tick 也還在 8 以內）
    expect(Math.max(...s.map((x) => x.dist))).toBeLessThanOrEqual(8);
    // 3) 真的移動了很長一段距離
    expect(V.dist(world.transform.get(me)!.pos, { x: Z0.center.x + 20, z: LANE_Z })).toBeGreaterThan(
      20,
    );
  });

  it("同一個人站定就打得出來 —— 差別只有『有沒有在走』", () => {
    cover("ba-standstill-stationary");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x + 20, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 23, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9; // 釘住，不要來還手
    const s = drive(world, me, foe, 180);

    expect(totalSwings(s)).toBeGreaterThan(5);
    // 站定的定義就是速度為 0：一 tick 都沒動過
    expect(Math.max(...s.map((x) => x.speed))).toBe(0);
  });

  it("純側移（繞著目標轉）也不行 —— 靠近速度 ≈ 0 不算靠近", () => {
    cover("ba-standstill-strafe");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 3, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;
    const s = drive(world, me, foe, 150, () => {
      // 每 tick 重算切線方向，繞著目標走 —— 距離幾乎不變，所以不是「跑出射程」。
      const t = world.transform.get(me)!;
      const f = world.transform.get(foe)!;
      const tangent = V.perp(V.normalize(V.sub(f.pos, t.pos)));
      walkToward(world, me, V.addScaled(t.pos, tangent, 4));
    });

    expect(totalSwings(s)).toBe(0);
    expect(s.filter((x) => x.speed > 0.5).length).toBeGreaterThan(120); // 儀器活著
    expect(Math.max(...s.map((x) => x.dist))).toBeLessThanOrEqual(8); // 一直在射程內
  });
});

describe("冷卻的帳算得對", () => {
  it("走位不會白燒攻擊間隔：停下來的那一刻就能出手", () => {
    cover("ba-standstill-no-cd-burn");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x + 20, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 23, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    // 60 tick 一直在走 → 一刀都沒揮，而且冷卻從頭到尾沒被扣過
    const away = { x: Z0.center.x - 1000, z: LANE_Z };
    const moving = drive(world, me, foe, 60, () => walkToward(world, me, away));
    expect(totalSwings(moving)).toBe(0);
    expect(world.abilities.get(me)!.basicAttackCdTicks).toBe(0);

    // 放開 → 目標仍在射程內（後退 60 tick 約 11 單位，起始 3 → 約 14 > 8），
    // 所以把它拉回來再站定，證明的是「冷卻沒被浪費」而不是「射程夠遠」。
    const t = world.transform.get(me)!;
    world.transform.get(foe)!.pos = { x: t.pos.x + 3, z: LANE_Z };
    world.nav.get(me)!.order = null;
    world.nav.get(me)!.moveTarget = null;
    const standing = drive(world, me, foe, 12);
    expect(totalSwings(standing)).toBeGreaterThan(0);
  });

  it("前搖中途走掉：這一刀作廢，而且冷卻不退", () => {
    cover("ba-standstill-cancel-no-refund");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x + 20, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 23, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    // 站定一 tick 就會起手（前搖 0.25s / 攻速 2 → 4 tick），先確認刀已經舉起來
    drive(world, me, foe, 1);
    const ab = world.abilities.get(me)!;
    expect(ab.windup).not.toBeNull();
    const committedCd = ab.basicAttackCdTicks;
    expect(committedCd).toBeGreaterThan(0);

    // 前搖跑完之前走人
    const away = { x: Z0.center.x - 1000, z: LANE_Z };
    const s = drive(world, me, foe, 2, () => walkToward(world, me, away));

    expect(ab.windup).toBeNull(); // 作廢
    expect(totalSwings(s)).toBe(0); // 沒有傷害、沒有 basicAttack
    // 冷卻照扣（只被時間磨掉，沒有被退回）—— 想拉開距離就要付一次攻擊循環
    expect(ab.basicAttackCdTicks).toBe(committedCd - 2);
  });
});

describe("「有沒有在動」讀的是實際位移，不是移動意圖", () => {
  /**
   * 這個選擇是有代價才被選的：讀 `nav.moveTarget`（意圖）的話，一次點到牆外、
   * 或點進柱子裡的滑鼠失誤，會讓那個人**整局不能攻擊** —— 訂單永遠到不了，
   * 意圖就永遠是「在走」。#274 的 `clickOutside` / `obstacle` 兩個 feed 就是這個
   * 形狀，所以這裡讀 movementSystem 實際走出去的位移。
   */
  it("推著牆走推不動 = 站著，照樣出手", () => {
    cover("ba-standstill-blocked");
    const world = new SimWorld(SKELETON_ARENA, 1);
    // 貼著場地邊界站（半徑 24，身體半徑 0.6 → 最遠站到 23.4）
    const edge = { x: Z0.center.x + 23.4, z: Z0.center.z };
    const me = spawnFighter(world, 0, 0, edge, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 20.4, z: Z0.center.z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    // 一直下「往場外走」的訂單：意圖是走，實際位移是 0
    const outward = { x: Z0.center.x + 1000, z: Z0.center.z };
    const s = drive(world, me, foe, 60, () => walkToward(world, me, outward));

    expect(world.nav.get(me)!.moveTarget).not.toBeNull(); // 意圖確實一直是「在走」
    expect(Math.max(...s.map((x) => x.speed))).toBeLessThan(0.5); // 實際上動不了
    expect(totalSwings(s)).toBeGreaterThan(0); // 所以照打
  });
});

describe("唯一的例外：正在朝目標靠近", () => {
  /**
   * 這個例外不是設計品味，是量出來的。第一版沒有它，`autoAttackCensus` 立刻點名
   * 14 位**近戰**英雄在射程內十秒打不出任何一下 —— 一個要幫近戰的改動先把近戰
   * 打死了。追 godie-o02p（初音，前搖 15 tick）拿到的形狀是：
   *
   *     t8   木樁反擊命中 → 自己吃到 knockback，前搖被 hitstop/hitstun 暫停
   *     t13  擊退滑行結束，人被推到 d=1.65（射程 1.60）—— 出去了
   *     t14  自己走回去（d=1.58，已回到射程內）
   *     t15  ← 第一版在這裡把這一刀取消了
   *
   * GGD 每一次命中都帶擊退（WC3 沒有這回事），所以照抄 WC3 的字面規則會造出 WC3
   * 從來不存在的死結：前搖 0.4~0.5 s 的近戰每一輪都被推出去、走回來、被取消，
   * 而整段冷卻早就扣掉了。
   */
  it("朝目標走過去的途中可以出手（近戰接近戰、被擊退後歸位都靠這條）", () => {
    cover("ba-standstill-closing");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 7, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    // 訂單指向目標的正後方，所以整段都在「持續靠近」而不是走到就停
    const s = drive(world, me, foe, 30, () =>
      walkToward(world, me, { x: Z0.center.x + 7, z: LANE_Z }),
    );

    expect(totalSwings(s)).toBeGreaterThan(0);
    // 而且那一刀是**在走的時候**揮出去的，不是走到定點停下才揮的
    const swungWhileMoving = s.some((x) => x.swings > 0 && x.speed > 0.5);
    expect(swungWhileMoving).toBe(true);
  });

  it("靠近的門檻與『有沒有在動』是同一個數：擦邊的斜向靠近不算靠近", () => {
    cover("ba-standstill-closing-threshold");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x, z: LANE_Z }, 8);
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x + 5, z: LANE_Z }, 1.6);
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    // 幾乎正切、只帶一點點朝內分量：靠近速度遠低於 0.5，所以不算靠近。
    // （純正切在浮點上會在 0 的兩側跳，規則就變成擲骰子 —— 這正是判準用
    //  「徑向靠近速度 >= WALK_EPS」而不是 `dot > 0` 的原因。）
    const s = drive(world, me, foe, 120, () => {
      const t = world.transform.get(me)!;
      const f = world.transform.get(foe)!;
      const toFoe = V.normalize(V.sub(f.pos, t.pos));
      const dir = V.normalize(V.addScaled(V.perp(toFoe), toFoe, 0.05));
      walkToward(world, me, V.addScaled(t.pos, dir, 4));
    });

    expect(totalSwings(s)).toBe(0);
    expect(s.filter((x) => x.speed > 0.5).length).toBeGreaterThan(100); // 儀器活著
    expect(Math.max(...s.map((x) => x.dist))).toBeLessThanOrEqual(8); // 沒跑出射程
  });
});
