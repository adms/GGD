/**
 * 卡住就接敵 AUTO-ENGAGE (GH#216) —— 「移動指令期間完全不攻擊」的守衛。
 *
 * ── 這個檔案在守什麼 ────────────────────────────────────────────────────────
 * owner 回報 Saber 在有移動指令時完全不攻擊。逐 tick 追下去,成因是**兩件事相乘**,
 * 兩件都不是「索敵壞了」——`autoAcquire.test.ts` 與 `autoAttackCensus.test.ts` 全綠,
 * 因為它們都不帶移動指令:
 *
 *   ① 追擊被移動指令壓住(#274)。索敵半徑是 `max(射程, MELEE_ACQUIRE_FLOOR = 6)`,
 *      近戰射程 1.6 —— 中間那 4.4 個單位**只有追擊會走**。所以近戰取得了目標
 *      卻永遠打不到,而遠程(射程 8.2 ≥ 6)取得目標時就已經在射程內,完全不受影響。
 *      #274 的註解說「你會邊走邊砍你路過的東西」,那句話對 82 位近戰是假的。
 *   ② 到不了的移動終點**永遠不會被消耗**(只有 ARRIVE_EPS 會清 `nav.order`),
 *      所以 ① 是**永久**的。實測:右鍵點進 r1.8 的柱子 → |v| = 0.00 連續 2,240
 *      個 tick(75 秒),最近的敵人 16.25 單位遠,整場 0 次索敵、0 次出手。
 *
 * ── 為什麼斷言讀的是傷害事件 ──────────────────────────────────────────────
 * 讀 `nav.attackTarget`(旗標)或 `nav.moveTarget`(意圖)兩種都會過:#274 之後
 * 旗標本來就是對的,壞的是**旗標到傷害之間那 4.4 個單位**。所以每一條「會不會打」
 * 的斷言都數 `damage` 事件(`origin: "basic"`, `source: me`),不數旗標。
 * (CLAUDE.md 第⑦種故障:掃屬性代替掃行為。)
 *
 * ── 幾何 ──────────────────────────────────────────────────────────────────
 * 全部用 SKELETON_ARENA zone 0:圓心 (-40, 0)、boundaryRadius 24、兩根 r1.8 的
 * 柱子在 (-49, 8) 與 (-31, -8)。「卡住」是真的卡在柱子上,不是把速度調成 0 ——
 * 這條規則讀的就是 `Transform.vel`,拿一個假的 0 去餵它等於在測自己寫的 mock。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { runEffects } from "./effects/effectRunner";
import { Rng } from "./math/rng";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import type { AbilitiesComp } from "./stats/statsComp";
import type { IntentFrame, Order } from "./intents";
import {
  COMBAT_FEEL_SCHEMA,
  DEFAULT_AUTO_ENGAGE,
  DEFAULT_COMBAT_FEEL,
  combatFeelFromDoc,
  type AutoEngageRules,
} from "./combatFeel";
import type { StatusId } from "../ids";
import * as V from "./math/vec2";

const Z0 = SKELETON_ARENA.zones[0]!;
/** The r1.8 pillar the champion is going to grind against. */
const PILLAR = { x: -49, z: 8 };
const NO_INTENTS = new Map<SeatId, IntentFrame>();
/** `Stat.MoveSpeed` 讀到 0 會 falsy-fallback 成預設 6,所以「不動」用 epsilon。 */
const IMMOBILE = 1e-9;

function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: { range?: number; moveSpeed?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 500000, maxHp: 500000, mana: 100, maxMana: 100, alive: true, shields: [] });
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
  final[Stat.MoveSpeed] = opts.moveSpeed ?? 5.8;
  final[Stat.AttackRange] = opts.range ?? 1.6; // 近戰中位數
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

interface Setup {
  world: SimWorld;
  me: EntityId;
  foe: EntityId;
}

/**
 * 我在柱子旁邊、手上有一條指向柱子正中心的移動指令(永遠到不了);敵人在
 * `foeGap` 單位外的同一條線上,不會動、打不死。
 */
function stuckOnPillar(foeGap: number, rules?: Partial<AutoEngageRules>): Setup {
  const world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatActive = true;
  world.combatFeel = {
    ...DEFAULT_COMBAT_FEEL,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...rules },
  };
  // 起點在柱子的正下方,走位終點是柱心 → 身體貼上柱子表面就再也走不動。
  const me = spawnFighter(world, 0, 0, { x: PILLAR.x, z: PILLAR.z - 6 });
  const foe = spawnFighter(world, 1, 1, { x: PILLAR.x, z: PILLAR.z - 6 - foeGap }, {
    moveSpeed: IMMOBILE,
  });
  return { world, me, foe };
}

const MOVE_TO_PILLAR: Order = { kind: "move", point: { x: PILLAR.x, z: PILLAR.z } };

function frame(order?: Order): Map<SeatId, IntentFrame> {
  const m = new Map<SeatId, IntentFrame>();
  m.set(asSeatId(0), order ? { order, commands: [] } : { commands: [] });
  return m;
}

interface RunOut {
  hits: number;
  /** 每一 tick 的 `|nav.moveTarget − order.point|`,只在身體真的在走的 tick 取樣 */
  hijackedWhileWalking: number;
  walkingTicks: number;
  minGap: number;
  endPos: V.Vec2;
}

/**
 * 跑 `ticks` 個 tick。`orderEvery` 為 true 時每 tick 重送同一條移動指令
 * (類比/虛擬搖桿的行為);否則只在第一 tick 送一次(滑鼠右鍵)。
 */
function run(
  s: Setup,
  ticks: number,
  opts: { order?: Order; orderEvery?: boolean } = {},
): RunOut {
  const { world, me, foe } = s;
  const foeHp = world.health.get(foe)!;
  let hits = 0;
  let hijackedWhileWalking = 0;
  let walkingTicks = 0;
  let minGap = Infinity;
  for (let i = 0; i < ticks; i++) {
    foeHp.hp = foeHp.maxHp; // 打不死:量的是「有沒有打到」,不是「幾秒打死」
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    const send = opts.order && (opts.orderEvery || i === 0) ? opts.order : undefined;
    world.step(send ? frame(send) : NO_INTENTS);

    const t = world.transform.get(me)!;
    const nav = world.nav.get(me)!;
    const speed = Math.sqrt(V.lenSq(t.vel));
    // 走位權:只在身體**真的在走**的 tick 上檢查 —— 卡在幾何上動不了的 tick
    // 根本沒有走位權可言,那正是這條規則的前提。
    if (speed >= DEFAULT_AUTO_ENGAGE.stallSpeed && nav.order?.kind === "move" && nav.order.point) {
      walkingTicks++;
      const mt = nav.moveTarget;
      const kept =
        mt !== null &&
        Math.abs(mt.x - nav.order.point.x) < 1e-9 &&
        Math.abs(mt.z - nav.order.point.z) < 1e-9;
      if (!kept) hijackedWhileWalking++;
    }
    const ft = world.transform.get(foe)!;
    const gap = Math.sqrt(V.distSq(t.pos, ft.pos));
    if (gap < minGap) minGap = gap;
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  const t = world.transform.get(me)!;
  return { hits, hijackedWhileWalking, walkingTicks, minGap, endPos: { ...t.pos } };
}

describe("GH#216 卡住的走位 —— 接敵與出手", () => {
  /**
   * 主守衛 A:敵人在**索敵半徑內、射程外**(5 單位 > 射程 1.6,< 索敵 6)。
   * 這一條殺的是 `OrderSystem` 追擊那行的 `!autoEngageActive(...)`。
   * 把它拿掉(回到 #274 的 `if (order.kind === "move" && moveTarget !== null) continue`)
   * → 追擊永遠不接手 → 這 300 tick 一下都打不出來。
   */
  it("卡在柱子上、敵人在索敵半徑內射程外 → 仍然會接近並打到人 (ae-close-the-gap)", () => {
    const s = stuckOnPillar(5);
    const r = run(s, 300, { order: MOVE_TO_PILLAR });
    expect(r.hits).toBeGreaterThan(0);
    // 而且是真的走過去,不是隔空打到
    expect(r.minGap).toBeLessThan(1.6);
  });

  /**
   * 主守衛 B:敵人在**索敵半徑外**(12 單位 > 6),但在 `seekRadius`(48)內。
   * 這一條殺的是放大索敵半徑那一段。把 `radius` 改回永遠 `acquireRadius(...)`
   * → 12 單位外的敵人索不到 → 0 命中。實測的災難就是這個形狀:柱子上的 Saber
   * 最近的敵人 16.25 單位遠,6 的半徑整場一次都沒索到。
   */
  it("卡在柱子上、敵人在 6 之外 48 之內 → 索得到、走得過去、打得到 (ae-seek-radius)", () => {
    const s = stuckOnPillar(12);
    const r = run(s, 400, { order: MOVE_TO_PILLAR });
    expect(r.hits).toBeGreaterThan(0);
    expect(r.minGap).toBeLessThan(1.6);
  });

  /**
   * ⛔ 這一條在 2026-07-30 **整個翻面**了。原本寫的是「每 tick 重送的移動指令
   * (搖桿)一樣會接敵」,而那正是 owner 回報的那個 bug 的來源。
   *
   * 翻面的理由是量出來的,不是設計品味。出貨 Saber、seed 7919、真實
   * `MatchController` 對局(`apps/game-server/src/match/autoAcquireWhileMoving
   * .test.ts` 的 `stick` 情境):左類比一直推 +x,走到 zone 0 的東邊界之後沿著
   * 牆磨,|v| 落在 0.39~0.43 —— **全部低於 stallSpeed 0.5**。於是
   *
   *     t=317 判定卡住 → 上鎖 → `moveTarget` 被改寫到玩家**背後** 18 單位外
   *     t=318 起 `walkStall` 立刻回到 0(身體全速在跑),鎖卻再也沒放開
   *     整場 2,355 個走位 tick,**2,039 個(86.6%)的目的地不是玩家指定的那個**
   *
   * 玩家推右邊、角色往左邊跑,而且持續 68 秒。這條規則本來要救的是「玩家已經
   * 放手、而且他指的地方到不了」的人;推著搖桿的人兩個條件都不符合 —— 他隨時
   * 可以自己改推別的方向,替他轉方向盤是幫倒忙。
   *
   * 所以現在的守衛是**反過來**的:搖桿情境一個 tick 都不准被接管。
   * 把 `OrderSystem` 指令套用那段的 `world.walkStall.set(id, 0)` 拿掉 → 紅。
   */
  it("每 tick 重送的移動指令(搖桿)絕不被接管:走位權整段留給玩家 (ae-stick-refresh)", () => {
    const s = stuckOnPillar(12);
    const r = run(s, 400, { order: MOVE_TO_PILLAR, orderEvery: true });
    // 鎖從來沒有上過 —— 玩家每一拍都在下指令,方向盤就是他的。
    expect(s.world.autoEngaging.has(s.me)).toBe(false);
    // 而且身體從來沒有被拉去打人:他只會停在自己撞上的那根柱子旁邊。
    // (敵人在 12 單位外,接敵一旦發生 minGap 會掉到 1.6 以下 —— 見
    //  ae-seek-radius,同樣的幾何、只差在有沒有每 tick 重送。)
    expect(r.minGap).toBeGreaterThan(6);
    expect(r.hits).toBe(0);
  });

  /**
   * 同一顆柱子、同一個敵人距離,**只差在指令重送與否**。這一對是這條規則的
   * 全部語意:一次點擊(滑鼠)會被救,持續推桿(搖桿)不會被碰。
   *
   * 寫成一條而不是兩條,是因為分開寫的話兩邊各自都能被「整條規則關掉」滿足 ——
   * 那正是第③種故障(刪掉實作測試還全綠)。放在一起就必須**同時**成立。
   */
  it("同一個場景:一次點擊會被救,持續推桿不會被碰 (ae-oneshot-vs-live-steer)", () => {
    const oneShot = run(stuckOnPillar(12), 400, { order: MOVE_TO_PILLAR });
    const liveSteer = run(stuckOnPillar(12), 400, { order: MOVE_TO_PILLAR, orderEvery: true });
    expect(oneShot.hits).toBeGreaterThan(0); // 放手的人被救了
    expect(liveSteer.hits).toBe(0); // 還在推的人沒被碰
  });

  /**
   * 玩家把方向盤要回去的**第二**條路:接敵中再點一次地面(還是 `kind:"move"`)。
   *
   * 舊版只在 `order.kind !== "move"` 時解鎖,所以「右鍵點進柱子 → 被接管 →
   * 再右鍵點一個走得到的地方」解不開鎖 —— 新的目的地會被追擊每 tick 蓋掉,
   * 玩家眼睜睜看著角色不去他點的地方。這是「不放手」最純粹的形狀,而且它連
   * 搖桿都不需要就能重現。
   *
   * 斷言讀的是**身體最後停在哪**,不是 `autoEngaging` 那個旗標。
   */
  it("接敵中再點一次地面 → 新的目的地真的走得到 (ae-reclick-releases)", () => {
    const s = stuckOnPillar(12);
    const { world, me, foe } = s;
    const foeHp = world.health.get(foe)!;
    // 先卡住 → 接敵(身體被拉離柱子去打人)
    for (let i = 0; i < 200; i++) {
      foeHp.hp = foeHp.maxHp;
      world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
      world.step(i === 0 ? frame(MOVE_TO_PILLAR) : NO_INTENTS);
    }
    expect(world.autoEngaging.has(me)).toBe(true); // 接敵真的發生了

    // 玩家再點一次地面 —— 一個走得到、而且**遠離敵人**的點。
    const dest = { x: PILLAR.x + 8, z: PILLAR.z + 6 };
    const distToDest = (): number => Math.sqrt(V.distSq(world.transform.get(me)!.pos, dest));
    const before = distToDest();
    for (let i = 0; i < 300; i++) {
      foeHp.hp = foeHp.maxHp;
      world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
      world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
    }
    // 他必須真的往新的點靠過去。舊版這裡是「原地被追擊拖著跑」→ 距離不會縮短。
    expect(distToDest()).toBeLessThan(before - 1);
  });

  /**
   * 反向守衛 1 —— #274 的走位權原封不動。
   * 身體真的在走的每一個 tick,`nav.moveTarget` 必須逐位元等於玩家指定的點。
   * 把 `autoEngageActive` 改成永遠 true(等於「移動指令期間一律讓追擊接手」)
   * → 這一條立刻紅,而上面三條仍然綠 —— 兩個方向都被釘住了。
   */
  it("走得動的走位:身體在移動的每一 tick,目的地都還是玩家指定的那個點 (ae-keeps-the-wheel)", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260730);
    world.combatActive = true;
    world.combatFeel = DEFAULT_COMBAT_FEEL;
    // 淨空的通道:z = +12 那條線清得過兩根 r1.8 的柱子(autoAcquire.test.ts 同款)。
    const lane = Z0.center.z + 12;
    const me = spawnFighter(world, 0, 0, { x: Z0.center.x - 10, z: lane });
    const foe = spawnFighter(world, 1, 1, { x: Z0.center.x, z: lane + 4 }, { moveSpeed: IMMOBILE });
    const dest: Order = { kind: "move", point: { x: Z0.center.x + 10, z: lane } };
    const r = run({ world, me, foe }, 200, { order: dest, orderEvery: true });
    expect(r.walkingTicks).toBeGreaterThan(100); // 儀器真的有在量
    expect(r.hijackedWhileWalking).toBe(0);
  });

  /**
   * 反向守衛 2 —— 完全沒有移動指令(靜止)的世界必須**逐位元不變**。
   * `digest()` 折進了位置、面向、血量、hitstop 與 attackTarget,所以任何一格
   * 行為差異都會在這裡出現。開關開與關跑同一個場景,兩邊的 digest 要一樣。
   */
  it("沒有移動指令時,開關開/關的世界逐位元相同 (ae-idle-unchanged)", () => {
    const digests: number[] = [];
    for (const enabled of [true, false]) {
      const s = stuckOnPillar(5, { enabled });
      run(s, 300); // 不送任何指令
      digests.push(s.world.digest());
    }
    expect(digests[0]).toBe(digests[1]);
  });

  /**
   * 反向守衛 3 —— A-click(attackMove)也必須逐位元不變。A-click 本來就會追擊,
   * 這條規則不該碰它;`updateWalkStall` 只對 `kind === "move"` 累計,這一條是那個
   * 條件的守衛。把它改成也吃 `attackMove` → digest 立刻分家。
   */
  it("A-click 的世界,開關開/關逐位元相同 (ae-attackmove-unchanged)", () => {
    const digests: number[] = [];
    for (const enabled of [true, false]) {
      const s = stuckOnPillar(5, { enabled });
      run(s, 300, {
        order: { kind: "attackMove", point: { x: PILLAR.x, z: PILLAR.z } },
        orderEvery: true,
      });
      digests.push(s.world.digest());
    }
    expect(digests[0]).toBe(digests[1]);
  });

  /**
   * 總開關真的關得掉 —— 操作者在後台把 `enabled` 關掉就回到 #274 的行為。
   * 沒有這一條,「後台可調」只是一個沒有人驗過的欄位(第一守則)。
   */
  it("enabled:false → 回到 #274 的行為,一下都打不出來 (ae-switch-off)", () => {
    const off = run(stuckOnPillar(12, { enabled: false }), 400, { order: MOVE_TO_PILLAR });
    expect(off.hits).toBe(0);
    const on = run(stuckOnPillar(12, { enabled: true }), 400, { order: MOVE_TO_PILLAR });
    expect(on.hits).toBeGreaterThan(0);
  });

  /**
   * `stallTicks` 真的是門檻,不是裝飾:調到比整段窗口還長 → 永遠來不及卡住 →
   * 行為和關掉一樣。這一條殺的是「把 `>= rules.stallTicks` 寫成 `>= 0`」那種
   * 讓欄位失效的突變。
   */
  it("stallTicks 調到超過窗口長度 → 這段時間內不會接敵 (ae-stall-threshold)", () => {
    const slow = run(stuckOnPillar(12, { stallTicks: 600 }), 400, { order: MOVE_TO_PILLAR });
    expect(slow.hits).toBe(0);
  });

  /**
   * 接敵**不會偷走玩家的走位指令**。追擊在進入射程那一 tick 會把 `moveTarget`
   * 設成 null(停下來打);如果那個 null 被「抵達了 → 消耗掉 `nav.order`」的規則
   * 吃下去,玩家的目的地就在第一場接敵裡憑空消失了,而他從來沒有走到過那裡。
   *
   * 斷言讀的是**打完之後身體往哪走**:敵人消失後,champion 必須繼續朝原本指定的
   * 那個點前進(距離縮短)。把 `!world.autoEngaging.has(id)` 那個條件拿掉 →
   * 走位指令在接敵時就被吃掉 → 敵人消失後原地不動 → 紅。
   */
  it("接敵結束後,玩家原本的走位繼續執行(指令沒有被吃掉) (ae-order-survives)", () => {
    const s = stuckOnPillar(12);
    const { world, me, foe } = s;
    const foeHp = world.health.get(foe)!;
    const distToPillar = (): number =>
      Math.sqrt(V.distSq(world.transform.get(me)!.pos, PILLAR));

    // 卡住 → 接敵 → 真的走離柱子去打人
    for (let i = 0; i < 200; i++) {
      foeHp.hp = foeHp.maxHp;
      world.step(i === 0 ? frame(MOVE_TO_PILLAR) : NO_INTENTS);
    }
    const awayFromPillar = distToPillar();
    expect(awayFromPillar).toBeGreaterThan(8); // 確實被拉走了(儀器有效)

    // 敵人不見了(死亡)。接敵結束。
    foeHp.hp = 0;
    foeHp.alive = false;
    for (let i = 0; i < 200; i++) world.step(NO_INTENTS);

    // 玩家的走位指令必須還在,身體要繼續往柱子走。
    expect(distToPillar()).toBeLessThan(awayFromPillar - 1);
  });

  /**
   * 玩家把方向盤要回去:接敵中下一條 `stop`,身體當場停止追擊。
   * 斷言讀的是**位置**(接敵後 100 tick 內有沒有繼續逼近),不是 `autoEngaging`
   * 那個旗標 —— 旗標對不對不重要,身體有沒有停下來才重要。
   */
  it("接敵中按 S(stop)→ 追擊當場停手,身體不再逼近 (ae-stop-releases)", () => {
    // 敵人放在 20 單位外:接敵走到一半就按 S,此時距離仍然遠在「一般索敵半徑 6
    // + 脫離寬限 2」之外,所以 stop 之後如果身體還在前進,那一定是接敵沒有放手,
    // 不可能是 #221 的一般 idle 追擊。這是這條測試唯一能分辨兩者的幾何。
    const s = stuckOnPillar(20);
    const { world, me, foe } = s;
    const foeHp = world.health.get(foe)!;
    const foeT = world.transform.get(foe)!;
    const gapNow = (): number => Math.sqrt(V.distSq(world.transform.get(me)!.pos, foeT.pos));

    let engagedGap = Infinity;
    for (let i = 0; i < 400; i++) {
      foeHp.hp = foeHp.maxHp;
      world.step(i === 0 ? frame(MOVE_TO_PILLAR) : NO_INTENTS);
      engagedGap = gapNow();
      if (engagedGap < 14) break; // 已經被接敵拉近了 6 單位以上
    }
    // 接敵必須真的發生過,否則後面的斷言是空的
    expect(engagedGap).toBeLessThan(14);
    expect(engagedGap).toBeGreaterThan(8); // 仍在一般索敵半徑 + 寬限之外

    world.step(frame({ kind: "stop" }));
    const gapAfterStop = gapNow();
    for (let i = 0; i < 200; i++) {
      foeHp.hp = foeHp.maxHp;
      world.step(NO_INTENTS);
    }
    // S 按下去之後身體就該停在那裡:距離不得再縮短(±浮點雜訊)。
    expect(gapNow()).toBeGreaterThanOrEqual(gapAfterStop - 1e-6);
  });
});

/**
 * 後台那一格真的走得通(第一守則)。
 *
 * ⚠️ 上面每一條都直接寫 `world.combatFeel`,所以它們**完全繞過**了出貨路徑
 * `content/config/combat-feel.json → combatFeelFromDoc → world.combatFeel`。
 * 實測過:把 `normalizeAutoEngageRules` 改成「三格都回預設、無視操作者填的值」,
 * 上面十條全綠 —— 那正是「後台欄位存了但沒有生效」的形狀,而它會完全無聲。
 * 這一組就是那條路徑的守衛:一條讀值、一條讀夾限、一條讀**行為**。
 */
describe("GH#216 卡住就接敵 —— 後台文件真的會生效", () => {
  it("操作者填的每一格會原封不動落到規則表 (ae-doc-roundtrip)", () => {
    // ⚠️ 這是一個**逐格**的 round-trip:`toEqual` 對整張表比對,所以任何一格新
    // 欄位只要 `normalizeAutoEngageRules` 忘了讀,這裡就紅。2026-07-31 加
    // `idleSeeks` 時它就是這樣紅的 —— 那正是它該做的事,不是維護噪音。
    // 每一格都刻意填**與出貨相反**的值,避免「忘了讀 → 回退到預設 → 剛好相等」。
    const rules = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: {
        enabled: false,
        stallTicks: 7,
        stallSpeed: 0.25,
        seekRadius: 11,
        idleSeeks: true,
        respectLiveSteering: false,
        ccPausesStall: false,
      },
    }).autoEngage;
    expect(rules).toEqual({
      enabled: false,
      stallTicks: 7,
      stallSpeed: 0.25,
      seekRadius: 11,
      idleSeeks: true,
      respectLiveSteering: false,
      ccPausesStall: false,
    });
    // 每一格都和出貨預設不同 —— 否則上面那個 `toEqual` 有一半是被預設值餵飽的。
    for (const k of Object.keys(DEFAULT_AUTO_ENGAGE) as (keyof typeof DEFAULT_AUTO_ENGAGE)[]) {
      expect(rules![k], `${k} 和出貨預設相同,這一格的 round-trip 沒有被真的測到`).not.toBe(
        DEFAULT_AUTO_ENGAGE[k],
      );
    }
  });

  /**
   * `respectLiveSteering` 這一格真的走得通 —— 關掉它,搖桿情境就會回到
   * 2026-07-30 之前被接管的行為。沒有這一條,那個布林就是一個沒人驗過的欄位。
   */
  it("respectLiveSteering:false → 搖桿又會被接管(舊行為) (ae-doc-steering-toggle)", () => {
    // ⚠️ 走**完整的出貨路徑**(文件 → combatFeelFromDoc → world.combatFeel),
    // 不是直接寫 `world.combatFeel`。這一點是量出來才改的:第一版用
    // `stuckOnPillar(12, { respectLiveSteering: false })` 直接塞規則表,於是把
    // `normalizeAutoEngageRules` 改成「無視操作者填的值、永遠回預設」時,這一條
    // **照樣綠** —— 那正是第⑤種故障(被測的不是出貨的那個)。
    const doc = (respectLiveSteering: boolean): unknown => ({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: {
        enabled: true,
        stallTicks: 30,
        stallSpeed: 0.5,
        seekRadius: 48,
        respectLiveSteering,
      },
    });

    const off = stuckOnPillar(12);
    off.world.combatFeel = combatFeelFromDoc(doc(false));
    expect(run(off, 400, { order: MOVE_TO_PILLAR, orderEvery: true }).hits).toBeGreaterThan(0);

    const on = stuckOnPillar(12);
    on.world.combatFeel = combatFeelFromDoc(doc(true));
    expect(run(on, 400, { order: MOVE_TO_PILLAR, orderEvery: true }).hits).toBe(0);
  });

  it("上下界會夾住手滑,不會靜默吃掉整張表 (ae-doc-clamps)", () => {
    const rules = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: { enabled: true, stallTicks: 99999, stallSpeed: -3, seekRadius: 4800 },
    }).autoEngage!;
    expect(rules.stallTicks).toBe(600); // 20 秒的上界
    expect(rules.stallSpeed).toBe(0); // 負速度沒有意義
    expect(rules.seekRadius).toBe(200); // 48 打成 4800 不會每 tick 掃全場
    // 缺格 → 出貨預設,不是 undefined(undefined 會讓每個比較都是 false,
    // 規則靜默消失 —— statCaps / facingTicks 學到的同一課)
    expect(combatFeelFromDoc({ id: "combat-feel", schema: COMBAT_FEEL_SCHEMA }).autoEngage).toEqual(
      DEFAULT_AUTO_ENGAGE,
    );
  });

  /**
   * `seekRadius` 這一格真的是**距離門檻**,不是裝飾。
   *
   * ⚠️ 這一條是駁斥者要的:他把 `ae.seekRadius` 換成寫死的 48,整套測試沒有一條
   * 紅。原因是舊的守衛(`ae-seek-radius`)只驗了「48 的時候索得到 12 單位外的
   * 敵人」—— 寫死 48 的實作對那條斷言的表現一模一樣。
   *
   * 所以這一條**固定幾何、只掃半徑**,而且掃過真正的門檻值。`stuckOnPillar(12)`
   * 的敵人在起點 12 單位外,而 champion 會先往柱子走 4.2 單位(離敵人更遠)才
   * 卡住 —— 上鎖那一 tick 的實際距離是 **16.2**。所以:
   *   · seekRadius 14 → 16.2 > 14 → 索不到 → 一下都打不出來 ← 寫死 48 會弄紅這裡
   *   · seekRadius 20 → 16.2 < 20 → 索得到 → 走過去打
   *   · seekRadius 48 → 出貨值,同上
   * 反方向也守得住:把 `radius` 改回永遠 `acquireRadius(...)`(等於忽略這一格)
   * → 後兩條變成 0 命中 → 紅。
   */
  it("seekRadius 是真的距離門檻:同一個幾何、只掃半徑 (ae-seek-radius-threshold)", () => {
    const tooShort = run(stuckOnPillar(12, { seekRadius: 14 }), 400, { order: MOVE_TO_PILLAR });
    const justEnough = run(stuckOnPillar(12, { seekRadius: 20 }), 400, { order: MOVE_TO_PILLAR });
    const shipped = run(stuckOnPillar(12, { seekRadius: 48 }), 400, { order: MOVE_TO_PILLAR });
    expect(tooShort.hits).toBe(0); // 寫死 48 → 這裡會有命中
    expect(justEnough.hits).toBeGreaterThan(0);
    expect(shipped.hits).toBeGreaterThan(0);
  });

  /**
   * `stallSpeed` 這一格真的是**速度門檻**,不是裝飾。
   *
   * ⚠️ 也是駁斥者要的:他把 `rules.stallSpeed` 換成寫死的 0.5,沒有一條紅。
   * 原因是所有既有情境都是「撞死在柱子上,|v| = 0.00」—— 任何大於 0 的門檻都會
   * 觸發,所以那些測試對「讀欄位」與「讀常數」完全無法分辨。
   *
   * 這一條改用**真實災難的形狀**:沿著幾何慢慢磨(實測 |v| 0.394~0.427),不是
   * 完全停住。做法是把 `Stat.MoveSpeed` 設成 0.3 —— 身體真的在走,只是很慢,
   * `Transform.vel` 讀出來就是 0.3。於是
   *   · stallSpeed 0.5 → 0.3 < 0.5 → 算卡住 → 接敵 → 身體被拉向敵人(z 掉下來)
   *   · stallSpeed 0.2 → 0.3 ≥ 0.2 → 不算卡住 → 走位權留在玩家手上(z 不動)
   * 寫死 0.5 會讓第二個情境也被接管 → 紅。
   *
   * 斷言讀的是**身體最後在哪**(z 座標),不是 `autoEngaging` 那個旗標:
   * 旗標對不對不重要,腳往哪走才重要(CLAUDE.md 第⑦種故障)。
   */
  it("stallSpeed 是真的速度門檻:0.3 的慢走在兩側行為不同 (ae-stall-speed-threshold)", () => {
    // 淨空的通道 + 一個在側邊 12 單位外的敵人。走位終點在 +x 20 單位外,
    // 0.3 u/s 跑 400 tick 只前進 4 單位 —— 永遠到不了,所以指令整段都活著。
    const slowWalker = (stallSpeed: number): { z: number; hijacked: number } => {
      const world = new SimWorld(SKELETON_ARENA, 20260730);
      world.combatActive = true;
      world.combatFeel = {
        ...DEFAULT_COMBAT_FEEL,
        autoEngage: { ...DEFAULT_AUTO_ENGAGE, stallSpeed },
      };
      const lane = Z0.center.z + 12;
      const me = spawnFighter(world, 0, 0, { x: Z0.center.x - 10, z: lane }, { moveSpeed: 0.3 });
      const foe = spawnFighter(world, 1, 1, { x: Z0.center.x - 10, z: lane - 12 }, {
        moveSpeed: IMMOBILE,
      });
      const dest = { x: Z0.center.x + 10, z: lane };
      const foeHp = world.health.get(foe)!;
      let hijacked = 0;
      for (let i = 0; i < 400; i++) {
        foeHp.hp = foeHp.maxHp;
        world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
        const mt = world.nav.get(me)!.moveTarget;
        if (mt && (Math.abs(mt.x - dest.x) > 1e-9 || Math.abs(mt.z - dest.z) > 1e-9)) hijacked++;
      }
      return { z: world.transform.get(me)!.pos.z, hijacked };
    };

    const lane = Z0.center.z + 12;
    const stalled = slowWalker(0.5); // 0.3 < 0.5 → 卡住
    const walking = slowWalker(0.2); // 0.3 ≥ 0.2 → 沒卡住
    expect(stalled.hijacked).toBeGreaterThan(0);
    expect(stalled.z).toBeLessThan(lane - 0.5); // 真的被拉向敵人(−z)
    expect(walking.hijacked).toBe(0); // 寫死 0.5 → 這裡會被接管
    expect(walking.z).toBeCloseTo(lane, 6); // 一路直走,z 一格都沒動
  });

  it("後台把開關關掉,走到 sim 裡就真的不接敵 (ae-doc-behaviour)", () => {
    // 走完整條出貨路徑:文件 → combatFeelFromDoc → world.combatFeel → 行為。
    const feel = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: { enabled: false, stallTicks: 30, stallSpeed: 0.5, seekRadius: 48 },
    });
    const s = stuckOnPillar(12);
    s.world.combatFeel = feel;
    expect(run(s, 400, { order: MOVE_TO_PILLAR }).hits).toBe(0);

    const on = stuckOnPillar(12);
    on.world.combatFeel = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: { enabled: true, stallTicks: 30, stallSpeed: 0.5, seekRadius: 48 },
    });
    expect(run(on, 400, { order: MOVE_TO_PILLAR }).hits).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GH#216 × 硬控 —— 被定身的玩家不是「走位卡住」的玩家
// ═══════════════════════════════════════════════════════════════════════════
//
// `DEFAULT_AUTO_ENGAGE` 上方原本寫著:「1 秒的窗口把 hitstop/擊退全部濾掉
// (出貨最長的 knockdown 是 13 tick)」。那句話**只算了擊退,漏了硬控**。
//
// 本檔案自己掃 `content/abilities/*.json` 量到的(2026-07-30):
//     · 帶 `applyStatus` 且 `root:true` / `stun:true` 的效果   86 支
//     · 其中持續 ≥ 1.0 秒                                      47 支
//     · 最長 4.0 秒 = 120 tick(godie-hvsh.passive「burnstun」
//       與 godie-hvwd.passive「root」並列)
// `effectRunner.ts` 的 `expiresAtTick = world.tick + Math.round(e.duration /
// world.dt)`,`MovementSystem` 對 `e.root || e.stun` 直接把速度歸零。
//
// 也就是說:一個被定身 4 秒的玩家,在第 30 tick 就會被判定成「走位卡住」,
// 走位權被追擊接管 —— 而他根本沒有卡住,他是被控住。被控已經夠慘,解控之後
// 角色還往反方向跑,比原本的 bug 更糟。
//
// 下面的守衛用**真的硬控**:`runEffects` 跑真的 `applyStatus` 效果,持續時間
// 從**出貨內容**掃出來(不是寫死 4.0),所以有人上架 6 秒的定身時窗口會自己跟著長。

interface CcCensus {
  effects: number;
  atLeastOneSecond: number;
  longestSeconds: number;
  /** 最長的**只靠 `root:true`** 的硬控(秒)。 */
  longestRootSeconds: number;
  /**
   * 最長的**帶 `stun:true`** 的硬控(秒)。
   *
   * ⚠️ 分開量不是為了好看。出貨內容裡**最長的那一支是 stun 不是 root**
   * (`godie-hvsh.passive`「石化之眼」4.0 秒 `stun:true`,和 `godie-hvwd.passive`
   * 的 4.0 秒 `root:true` 並列最長)。只用 root 餵測試的話,把
   * `bodyHeldByRules` 抄成一份「只認 root」的漂走版本會**全綠** —— 而那正是
   * `movementHold.ts` 檔頭警告的那件事。實測過:23 條全過。
   */
  longestStunSeconds: number;
}

/** 出貨內容裡的硬控普查 —— 數字是量的,不是抄註解的。 */
function hardCcCensus(): CcCensus {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");
  let effects = 0;
  let atLeastOneSecond = 0;
  let longestSeconds = 0;
  let longestRootSeconds = 0;
  let longestStunSeconds = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.kind === "applyStatus" && (o.root === true || o.stun === true)) {
      const d = typeof o.duration === "number" ? o.duration : 0;
      effects++;
      if (d >= 1) atLeastOneSecond++;
      if (d > longestSeconds) longestSeconds = d;
      if (o.stun === true) {
        if (d > longestStunSeconds) longestStunSeconds = d;
      } else if (d > longestRootSeconds) longestRootSeconds = d;
    }
    for (const v of Object.values(o)) walk(v);
  };
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    walk(JSON.parse(readFileSync(join(dir, f), "utf8")));
  }
  return { effects, atLeastOneSecond, longestSeconds, longestRootSeconds, longestStunSeconds };
}

interface CcSetup {
  world: SimWorld;
  me: EntityId;
  foe: EntityId;
  dest: V.Vec2;
  rootTicks: number;
}

/**
 * 淨空的通道上,一個**走得到**的目的地(20 單位外的 +x),外加一個側邊 12 單位
 * 外的敵人(> 近戰索敵 6,< seekRadius 48 —— 只有「卡住」那條路徑索得到它)。
 * 玩家像滑鼠一樣只點一次,然後當場吃一發真的硬控。
 *
 * 幾何:z = center.z + 12 這條線清得過兩根 r1.8 的柱子(和 ae-keeps-the-wheel
 * 同一條通道)。
 */
function rootedWalker(seconds: number, rules?: Partial<AutoEngageRules>): CcSetup {
  const world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatActive = true;
  world.combatFeel = { ...DEFAULT_COMBAT_FEEL, autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...rules } };
  const lane = Z0.center.z + 12;
  const me = spawnFighter(world, 0, 0, { x: Z0.center.x - 10, z: lane });
  const foe = spawnFighter(world, 1, 1, { x: Z0.center.x - 10, z: lane - 12 }, {
    moveSpeed: IMMOBILE,
  });
  return {
    world,
    me,
    foe,
    dest: { x: Z0.center.x + 10, z: lane },
    rootTicks: Math.round(seconds / world.dt),
  };
}

/**
 * 真的硬控:走 `runEffects` 的 `applyStatus`,不是手寫一個 StatusEffect。
 *
 * `kind` 決定送出的是 `root:true` 還是 `stun:true` —— 兩種都要測,因為出貨內容
 * 裡最長的那一支是 **stun**(石化之眼 4 秒),而 root / stun 在
 * `movementHold` 是**兩個不同的欄位**,漏一個不會有人發現。
 */
function castHardCc(
  world: SimWorld,
  caster: EntityId,
  target: EntityId,
  seconds: number,
  kind: "root" | "stun",
): void {
  runEffects(
    [
      kind === "root"
        ? { kind: "applyStatus", statusId: "root" as StatusId, duration: seconds, root: true }
        : { kind: "applyStatus", statusId: "burnstun" as StatusId, duration: seconds, stun: true },
    ],
    {
      world,
      caster,
      rank: 1,
      targets: [target],
      origin: "test:hard-cc",
      rng: new Rng(1),
    },
  );
}

function castRoot(world: SimWorld, caster: EntityId, target: EntityId, seconds: number): void {
  castHardCc(world, caster, target, seconds, "root");
}

describe("GH#216 × 硬控 —— 被定身不等於走位卡住", () => {
  /**
   * 普查本身就是一條守衛:上面那段註解宣稱的三個數字,如果哪天不成立了要當場
   * 知道。真正**載重**的斷言是最後一條 —— 出貨內容裡存在比接敵窗口更長的硬控,
   * 那就是這整組測試存在的前提。前提沒了,下面的行為測試就是空的。
   */
  it("出貨內容真的有超過接敵窗口的硬控 (ae-cc-census)", () => {
    const c = hardCcCensus();
    expect(c.effects).toBeGreaterThanOrEqual(80); // 2026-07-30 量到 86
    expect(c.atLeastOneSecond).toBeGreaterThanOrEqual(40); // 量到 47
    // 這一條才是前提:最長的硬控換算成 tick,必須超過 stallTicks(30)。
    const longestTicks = Math.round(c.longestSeconds / (1 / 30));
    expect(longestTicks).toBeGreaterThan(DEFAULT_AUTO_ENGAGE.stallTicks);
    // ⚠️ 第二個前提:**兩種**旗標都存在,而且都比窗口長。root 與 stun 在
    // `movementHold` 是兩個獨立的欄位,只驗一種的話漏掉另一種不會有人紅
    // (2026-07-30 量到:最長的 4.0 秒 root 是 godie-hvwd.passive,
    //  最長的 4.0 秒 stun 是 godie-hvsh.passive「石化之眼」)。
    expect(Math.round(c.longestRootSeconds * 30)).toBeGreaterThan(DEFAULT_AUTO_ENGAGE.stallTicks);
    expect(Math.round(c.longestStunSeconds * 30)).toBeGreaterThan(DEFAULT_AUTO_ENGAGE.stallTicks);
  });

  /**
   * ★ 這是駁斥者指定要交的那一條。
   *
   * 讓一個單位吃滿**出貨最長**的硬控,確認它的 `nav.moveTarget` 一個 tick 都
   * 沒有被改寫。修好之前這條必須紅(第 30 tick 追擊就會把終點改成敵人身上)。
   *
   * 斷言讀的是 `nav.moveTarget` 逐 tick 的值,不是 `autoEngaging` 旗標 ——
   * 旗標可以對而終點還是被改掉(追擊那一段和鎖是兩行程式)。
   *
   * ⚠️ **root 與 stun 各跑一次**,持續時間各自從出貨內容掃出來。理由是量到的:
   * 只跑 root 的話,把 `bodyHeldByRules` 抄成一份「只認 root」的漂走版本
   * (`movementHold.ts` 檔頭警告的正是這件事)會 23 條全綠 —— 而出貨內容裡
   * **最長的那一支就是 stun**(石化之眼 4 秒),也就是漏掉的正好是最嚴重的。
   */
  for (const kind of ["root", "stun"] as const) {
    it(`吃滿出貨最長的${kind}硬控:走位終點一個 tick 都沒被改寫 (ae-cc-keeps-destination-${kind})`, () => {
      const c = hardCcCensus();
      const seconds = kind === "root" ? c.longestRootSeconds : c.longestStunSeconds;
      const s = rootedWalker(seconds);
      const { world, me, foe, dest, rootTicks } = s;
      const foeHp = world.health.get(foe)!;
      castHardCc(world, foe, me, seconds, kind);

      let hijackedTicks = 0;
      let firstHijackTick = -1;
      let rootedTicks = 0;
      for (let i = 0; i < rootTicks; i++) {
        foeHp.hp = foeHp.maxHp;
        world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
        // 儀器自檢:這一 tick 硬控真的還在,而且**是我們送的那一種旗標**。
        const held = world.status
          .get(me)!
          .effects.some((e) => (kind === "root" ? e.root : e.stun));
        if (held) rootedTicks++;
        const mt = world.nav.get(me)!.moveTarget;
        if (!mt || Math.abs(mt.x - dest.x) > 1e-9 || Math.abs(mt.z - dest.z) > 1e-9) {
          hijackedTicks++;
          if (firstHijackTick < 0) firstHijackTick = i;
        }
      }
      // 儀器有效:硬控真的蓋滿了整段窗口,而且它比 stallTicks 長很多。
      expect(rootedTicks).toBe(rootTicks);
      expect(rootTicks).toBeGreaterThan(DEFAULT_AUTO_ENGAGE.stallTicks);
      // 身體確實沒動過(被定住,不是走到了)。
      expect(V.distSq(world.transform.get(me)!.pos, { x: Z0.center.x - 10, z: Z0.center.z + 12 }))
        .toBeLessThan(1e-6);
      expect({ hijackedTicks, firstHijackTick }).toEqual({ hijackedTicks: 0, firstHijackTick: -1 });
    });
  }

  /**
   * 解控之後,玩家原本點的地方還是他要去的地方 —— 不是敵人身上。
   *
   * 上一條測的是硬控**期間**;這一條測的是硬控**之後**,因為 `autoEngaging` 是
   * 一把鎖:窗口內只要上過一次,解控之後它也不會自己放開(這正是 2026-07-30 量
   * 到的「86.6% 被搶走」的機制)。所以只驗期間是不夠的。
   */
  it("解控之後,身體往玩家點的地方走,不是往敵人走 (ae-cc-resumes-the-walk)", () => {
    const seconds = hardCcCensus().longestSeconds;
    const s = rootedWalker(seconds);
    const { world, me, foe, dest, rootTicks } = s;
    const foeHp = world.health.get(foe)!;
    castRoot(world, foe, me, seconds);

    const foePos = { ...world.transform.get(foe)!.pos };
    const distTo = (p: V.Vec2): number => Math.sqrt(V.distSq(world.transform.get(me)!.pos, p));
    const destBefore = distTo(dest);
    const foeBefore = distTo(foePos);

    for (let i = 0; i < rootTicks + 120; i++) {
      foeHp.hp = foeHp.maxHp;
      world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
    }
    // 解控後的 120 tick(4 秒 @5.8 u/s ≈ 23 單位)足夠走完 20 單位的路。
    expect(distTo(dest)).toBeLessThan(destBefore - 10); // 真的往目的地走了
    expect(distTo(foePos)).toBeGreaterThan(foeBefore); // 而且是**遠離**敵人
    expect(world.autoEngaging.has(me)).toBe(false); // 鎖從來沒上過
  });

  /**
   * 反向守衛 —— 「硬控不算卡住」不可以退化成「被控過就永遠不救」。
   *
   * 真的卡在柱子上的玩家,吃完一發 4 秒硬控之後,窗口要**重新起算並成立**,
   * 該接的敵還是要接。少了這一條,把 `updateWalkStall` 改成「rooted 就 delete
   * 整個計數 + 永久停用」也會全綠。
   */
  it("柱子上的玩家吃完硬控之後,照樣被救 (ae-cc-does-not-disable-the-rule)", () => {
    const seconds = hardCcCensus().longestSeconds;
    const s = stuckOnPillar(12);
    const { world, me, foe } = s;
    castRoot(world, foe, me, seconds);
    const r = run(s, 400 + Math.round(seconds * 30), { order: MOVE_TO_PILLAR });
    expect(r.hits).toBeGreaterThan(0);
    expect(world.autoEngaging.has(me)).toBe(true);
  });

  /**
   * hitstop 也是「被遊戲按住」,不是「走位卡住」。
   *
   * `bodyHeldByRules` 的第一行是 hitstop,而在這條守衛之前把那一行刪掉 **25 條
   * 全綠**(實測)。它不是裝飾:`MovementSystem` 對 hitstop 的處理是
   * `t.vel = {0,0}; continue`,所以**連續**的 hitstop 讀起來和撞牆一模一樣。
   * 單發 hitstop 最長 13 tick < 窗口 30,但被兩三個單位輪流打的人 hitstop 是
   * **接續**的(每一發新傷害重新上一次),連起來超過 30 tick 一點都不難 ——
   * 那個人身體真的在走,只是每一拍都被凍一下,結果走位權被判給追擊。
   *
   * ⚠️ 這裡直接寫 `world.hitstop`,那是 `combat/damage.ts` 唯一 writer 的那張表
   * (`hitstopDecaySystem` 在 slot 7b 才遞減,所以每 tick 重新上值 = 真實的連段)。
   * 用真的三個攻擊者去湊 30 tick 連段會把這條測試綁死在攻速與前搖上,那才是
   * 測到別的東西。
   */
  it("連段 hitstop 不算走位卡住:終點一個 tick 都沒被改寫 (ae-cc-hitstop-is-not-a-stall)", () => {
    const HITSTOP_TICKS = 40; // > stallTicks(30):足以在沒有這一行時被接管
    const s = rootedWalker(HITSTOP_TICKS / 30);
    const { world, me, foe, dest } = s;
    const foeHp = world.health.get(foe)!;
    let hijacked = 0;
    let frozenTicks = 0;
    for (let i = 0; i < HITSTOP_TICKS; i++) {
      foeHp.hp = foeHp.maxHp;
      world.hitstop.set(me, 2); // 連段:每一拍都有新的一發把凍結重新上值
      world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
      if (V.lenSq(world.transform.get(me)!.vel) === 0) frozenTicks++;
      const mt = world.nav.get(me)!.moveTarget;
      if (!mt || Math.abs(mt.x - dest.x) > 1e-9 || Math.abs(mt.z - dest.z) > 1e-9) hijacked++;
    }
    expect(frozenTicks).toBe(HITSTOP_TICKS); // 儀器有效:整段真的被凍住
    expect(hijacked).toBe(0); // 刪掉 hitstop 那一行 → 第 30 tick 起被改寫
  });

  /**
   * 「**凍結**計數」而不是「歸零計數」—— 這條區分是 `OrderSystem.updateWalkStall`
   * 與 `combatFeel.ts` 的註解都明講的設計,而在這條守衛之前**沒有任何測試分辨得
   * 出來**:把那一行改成 `world.walkStall.delete(id); return;` 照樣 23 條全綠。
   * (實測過。CLAUDE.md 第③種故障:可以從實作刪掉/改掉而測試全綠。)
   *
   * 它擋的不是抽象的潔癖,是一個具體的玩家:**被連續點控**的人。
   * 這裡的節奏是 20 tick 硬控 + 10 tick 空檔,空檔 10 < `stallTicks` 30 ——
   *   · 凍結:空檔的 10 個 tick 一次次累加,第三個空檔就滿 30 → 該救的救到。
   *   · 歸零:每個空檔都從 0 重數,永遠到不了 30 → 這條規則對他等於不存在,
   *     他會抱著一條走不動的走位指令在柱子上站到回合結束。
   *
   * 斷言讀的是**傷害事件**(打到人了沒),不是 `walkStall` 那個計數器本身 ——
   * 讀計數器等於在測實作自己(第⑦種故障)。
   */
  it("被連續點控的玩家照樣被救:計數是凍結不是歸零 (ae-cc-freezes-not-resets)", () => {
    const CC_TICKS = 20; // 每一發硬控的長度
    const GAP_TICKS = 10; // 兩發之間的空檔,**短於** stallTicks(30)
    expect(GAP_TICKS).toBeLessThan(DEFAULT_AUTO_ENGAGE.stallTicks);

    const s = stuckOnPillar(12);
    const { world, me, foe } = s;
    const foeHp = world.health.get(foe)!;
    let hits = 0;
    let longestFreeRun = 0;
    let freeRun = 0;
    for (let i = 0; i < 900; i++) {
      // 每 30 tick 補一發 20 tick 的硬控 → 空檔永遠只有 10 tick。
      if (i % (CC_TICKS + GAP_TICKS) === 0) castRoot(world, foe, me, CC_TICKS / 30);
      foeHp.hp = foeHp.maxHp;
      // 敵人釘死不動(和 `run()` 一樣每 tick 重新壓住):否則「打到人」有可能是
      // 敵人自己走過來,那條路徑對凍結/歸零兩種實作都成立,這條測試就失去鑑別力。
      world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
      world.step(i === 0 ? frame(MOVE_TO_PILLAR) : NO_INTENTS);
      // 儀器自檢:沒有任何一段「沒被控」的連續空檔長到足以自己湊滿 30 tick ——
      // 否則這條測試就退化成 ae-cc-does-not-disable-the-rule 的重跑。
      if (world.status.get(me)!.effects.some((e) => e.root || e.stun)) freeRun = 0;
      else if (++freeRun > longestFreeRun) longestFreeRun = freeRun;
      for (const e of world.events) {
        const d = e.data as { source?: EntityId; origin?: string };
        if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
      }
    }
    expect(longestFreeRun).toBeLessThan(DEFAULT_AUTO_ENGAGE.stallTicks);
    expect(hits).toBeGreaterThan(0); // 歸零版本:0
  });

  /**
   * 後台那一格(第一守則)。`ccPausesStall:false` = 回到 2026-07-30 之前的行為,
   * 也就是被定身的玩家照樣被判定成卡住。留這一側是給 owner 反悔用的,不是一個
   * 平起平坐的選項 —— 但它必須真的切得動,否則就是一個沒人驗過的欄位。
   *
   * ⚠️ 走**完整的出貨路徑**(文件 → `combatFeelFromDoc` → `world.combatFeel`),
   * 不是直接塞規則表:直接塞的話,把 `normalizeAutoEngageRules` 改成「無視操作者
   * 填的值」照樣全綠(第⑤種故障 —— 被測的不是出貨的那個)。
   */
  it("ccPausesStall 這一格真的切得動,而且走的是出貨路徑 (ae-cc-doc-toggle)", () => {
    const seconds = hardCcCensus().longestSeconds;
    const doc = (ccPausesStall: boolean): unknown => ({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: { ...DEFAULT_AUTO_ENGAGE, ccPausesStall },
    });
    const hijackedUnderRoot = (feelDoc: unknown): number => {
      const s = rootedWalker(seconds);
      const { world, me, foe, dest, rootTicks } = s;
      world.combatFeel = combatFeelFromDoc(feelDoc);
      const foeHp = world.health.get(foe)!;
      castRoot(world, foe, me, seconds);
      let hijacked = 0;
      for (let i = 0; i < rootTicks; i++) {
        foeHp.hp = foeHp.maxHp;
        world.step(i === 0 ? frame({ kind: "move", point: dest }) : NO_INTENTS);
        const mt = world.nav.get(me)!.moveTarget;
        if (!mt || Math.abs(mt.x - dest.x) > 1e-9 || Math.abs(mt.z - dest.z) > 1e-9) hijacked++;
      }
      return hijacked;
    };
    expect(hijackedUnderRoot(doc(true))).toBe(0);
    expect(hijackedUnderRoot(doc(false))).toBeGreaterThan(0); // 舊行為,量得出來
  });
});
