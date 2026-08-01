/**
 * W4 (2026-07-31) —— 索敵半徑的不對稱,與 `autoEngage.idleSeeks` 這一格。
 *
 * ── 這個檔案在守什麼 ────────────────────────────────────────────────────────
 * `systems/OrderSystem.ts` 的 `autoAcquirePass` 裡,索敵半徑是**條件式**的:
 *
 *     走位卡住的玩家(`autoEngageActive`)  → `ae.seekRadius`(出貨 48)
 *     完全站著不動的玩家(手上沒有指令)   → `acquireRadius` = 近戰地板 6
 *
 * 也就是「卡在柱子上」比「站著不動」**更容易**索到敵人。這不是推論,是量到的:
 * `apps/game-server/src/match/autoAcquireWhileMoving.test.ts` 的 `[idle]` 情境
 * (真的 `MatchController`、出貨 Saber `godie-e002`、seed 7919)整場 2,410 個
 * tick 裡,最近的敵方英雄從來沒有靠近到 14.95 單位以內 → 那個座位 0 次索敵、
 * 0 次揮擊。那條測試至今是紅的,而且它紅的理由是「站著的人看不到 6 單位外的
 * 任何東西」,不是「自動攻擊壞了」。
 *
 * ⚠️ 這個檔案**不去把那條測試弄綠**。「站著不動要不要吃 seekRadius」是會改變
 * 手感的平衡決策,所以它變成一個後台欄位 `autoEngage.idleSeeks`,而出貨預設維持
 * **今天的行為**(關)。下面第一條就是在守那個「一個 tick 都沒有變」。
 *
 * ── 為什麼斷言讀傷害事件,不讀 `nav.attackTarget` ───────────────────────────
 * 和 `autoEngageStalledWalk.test.ts` 同一個理由(CLAUDE.md 第⑦種故障:掃屬性
 * 代替掃行為)。近戰索到目標與打到目標之間隔著 4.4 個單位的追擊,只有傷害事件
 * 同時證明「索到了」「走過去了」「打出來了」三件事。
 *
 * ── 幾何 ──────────────────────────────────────────────────────────────────
 * SKELETON_ARENA zone 0(圓心 (−40,0)、半徑 24、兩根 r1.8 柱子在 (−49,8) 與
 * (−31,−8))。兩個人站在 x = −40 這條直線上,兩根柱子離這條線都有 9 個單位,
 * 所以整段路是空的 —— 「打不到」只可能是索敵半徑造成的,不是撞到東西。
 * 敵人 `moveSpeed` 設成 epsilon:他不會走過來,所以任何一次命中都必然是**我**
 * 走過去的。
 */
import { describe, it, expect } from "vitest";
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
import { COMBAT_FEEL_SCHEMA, DEFAULT_AUTO_ENGAGE, combatFeelFromDoc } from "./combatFeel";
import { MELEE_ACQUIRE_FLOOR } from "./targeting";
import * as V from "./math/vec2";

const ZONE_CENTRE = { x: -40, z: 0 };
const NO_INTENTS = new Map<SeatId, IntentFrame>();
/** `Stat.MoveSpeed` 讀到 0 會 falsy-fallback 成預設 6,所以「不動」用 epsilon。 */
const IMMOBILE = 1e-9;
/** 近戰中位數射程,和 `autoEngageStalledWalk.test.ts` 用的同一個。 */
const MELEE_RANGE = 1.6;

function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: { moveSpeed?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, {
    hp: 500000,
    maxHp: 500000,
    mana: 100,
    maxMana: 100,
    alive: true,
    shields: [],
  });
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
  final[Stat.AttackRange] = MELEE_RANGE;
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
  start: V.Vec2;
}

/**
 * 我站在 zone 中心,敵人在同一條直線上 `gap` 單位外、不會動、打不死。
 *
 * ⚠️ 規則表走的是**完整的出貨路徑**(文件 → `combatFeelFromDoc` →
 * `world.combatFeel`),不是直接塞一張手寫的表。直接塞的話,把
 * `normalizeAutoEngageRules` 改成「無視操作者填的值、永遠回預設」時每一條都還是
 * 綠的 —— 那正是 CLAUDE.md 第⑤種故障(被測的不是出貨的那個)。
 */
function idleAt(gap: number, autoEngage?: Record<string, unknown>): Setup {
  const world = new SimWorld(SKELETON_ARENA, 20260731);
  world.combatActive = true;
  world.combatFeel = combatFeelFromDoc({
    id: "combat-feel",
    schema: COMBAT_FEEL_SCHEMA,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...autoEngage },
  });
  const start = { ...ZONE_CENTRE };
  const me = spawnFighter(world, 0, 0, start);
  const foe = spawnFighter(world, 1, 1, { x: ZONE_CENTRE.x, z: ZONE_CENTRE.z + gap }, {
    moveSpeed: IMMOBILE,
  });
  return { world, me, foe, start };
}

interface RunOut {
  /** 我打出去的普攻命中次數 */
  hits: number;
  /** 整段跑完,我離出發點最遠走了多少 */
  maxTravel: number;
  /** 兩人之間曾經最近到多少 */
  minGap: number;
  /** 身體真的在走的 tick 數(有移動指令時才有意義) */
  walkingTicks: number;
  /** 其中「目的地被改寫成不是玩家指定的那個」的 tick 數 */
  hijackedWhileWalking: number;
}

function run(s: Setup, ticks: number, opts: { order?: Order; orderEvery?: boolean } = {}): RunOut {
  const { world, me, foe, start } = s;
  const foeHp = world.health.get(foe)!;
  let hits = 0;
  let maxTravel = 0;
  let minGap = Infinity;
  let walkingTicks = 0;
  let hijackedWhileWalking = 0;
  for (let i = 0; i < ticks; i++) {
    foeHp.hp = foeHp.maxHp; // 打不死:量的是「有沒有打到」,不是「幾秒打死」
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    let send: Map<SeatId, IntentFrame> = NO_INTENTS;
    if (opts.order && (opts.orderEvery || i === 0)) {
      send = new Map<SeatId, IntentFrame>([[asSeatId(0), { order: opts.order, commands: [] }]]);
    }
    world.step(send);

    const t = world.transform.get(me)!;
    const nav = world.nav.get(me)!;
    const travel = Math.sqrt(V.distSq(t.pos, start));
    if (travel > maxTravel) maxTravel = travel;
    const gap = Math.sqrt(V.distSq(t.pos, world.transform.get(foe)!.pos));
    if (gap < minGap) minGap = gap;
    if (
      Math.sqrt(V.lenSq(t.vel)) >= DEFAULT_AUTO_ENGAGE.stallSpeed &&
      nav.order?.kind === "move" &&
      nav.order.point
    ) {
      walkingTicks++;
      const mt = nav.moveTarget;
      const kept =
        mt !== null &&
        Math.abs(mt.x - nav.order.point.x) < 1e-9 &&
        Math.abs(mt.z - nav.order.point.z) < 1e-9;
      if (!kept) hijackedWhileWalking++;
    }
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return { hits, maxTravel, minGap, walkingTicks, hijackedWhileWalking };
}

/** 12 單位:確定在近戰地板 6 之外、在出貨 `seekRadius` 48 之內。 */
const GAP = 12;

describe("W4 索敵半徑的不對稱 —— 站著不動的人拿不到 seekRadius", () => {
  /**
   * 這一條就是那個**發現**本身:同一個幾何、同一個距離、同一份出貨規則表,
   * 差別只有「手上有沒有一條走不到的走位指令」。
   *
   * 走不到的走位 → 30 tick 後判定卡住 → 半徑 6→48 → 索到 12 單位外的人 → 打到。
   * 完全站著不動 → 半徑永遠 6 → 一下都打不出來。
   *
   * ⚠️ 這條**不是**在說站著的人應該打得到。它是在把那個不對稱釘在案上,
   * 所以下面 `idleSeeks` 那一格才有東西可以切換。
   */
  it("出貨值下,卡住的人打得到、站著的人打不到 —— 同一個距離 (w4-asymmetry)", () => {
    const stuck = run(idleAt(GAP), 400, {
      // 指向敵人**背後**的一點,而且是牆外 —— 走位永遠走不完,身體被邊界夾住,
      // 於是判定卡住。用「走不到的終點」而不是柱子,是因為柱子會擋住視線之外
      // 還會擋住路,兩個變因混在一起就分不出是哪一個造成的。
      order: { kind: "move", point: { x: ZONE_CENTRE.x, z: ZONE_CENTRE.z + 60 } },
    });
    const idle = run(idleAt(GAP), 400);

    expect(stuck.hits, "卡住的人索不到 12 單位外的敵人 —— seekRadius 那條路徑壞了").toBeGreaterThan(
      0,
    );
    expect(idle.hits, "站著不動的人打到了 —— 出貨預設被改動了").toBe(0);
    // 而且站著的人是真的**沒有動過**,不是走過去但沒打到
    expect(idle.maxTravel).toBeLessThan(0.01);
    // 距離確實在近戰地板之外,所以「打不到」的原因只能是半徑
    expect(GAP).toBeGreaterThan(MELEE_ACQUIRE_FLOOR);
    expect(GAP).toBeLessThan(DEFAULT_AUTO_ENGAGE.seekRadius);
  });

  /**
   * 出貨預設**必須**是今天的行為。`idleSeeks` 是平衡決策不是缺陷修正,預設
   * 翻面等於在沒有人裁決的情況下改了手感。
   *
   * 突變:`DEFAULT_AUTO_ENGAGE.idleSeeks` 改成 `true` → 這一條紅。
   */
  it("出貨預設是關的 —— 一個 tick 都沒有變 (w4-default-off)", () => {
    expect(DEFAULT_AUTO_ENGAGE.idleSeeks).toBe(false);
    // 而且不是只有常數:出貨內容檔走完整條路徑讀回來也是關的。
    const shipped = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: {
        enabled: true,
        stallTicks: 30,
        stallSpeed: 0.5,
        seekRadius: 48,
        idleSeeks: false,
        respectLiveSteering: true,
        ccPausesStall: true,
      },
    });
    expect(shipped.autoEngage!.idleSeeks).toBe(false);
    expect(run(idleAt(GAP), 400).hits).toBe(0);
  });

  /**
   * 這一格真的走得通 —— 開起來,同一個站著不動的人會自己走過去打。
   *
   * 突變:`OrderSystem.autoAcquirePass` 的 `(engaging || idleSeeking)` 改回
   * `engaging` → 這一條紅(hits 0、maxTravel 0)。
   */
  it("開起來:站著不動的人自己走過去打 (w4-idle-seeks-on)", () => {
    const r = run(idleAt(GAP, { idleSeeks: true }), 400);
    expect(r.hits, "開了還是打不到 —— idleSeeks 沒有接到索敵半徑上").toBeGreaterThan(0);
    // 真的**走過去**,不是隔空打到
    expect(r.minGap).toBeLessThan(MELEE_RANGE);
    expect(r.maxTravel).toBeGreaterThan(GAP - MELEE_RANGE - 1);
  });

  /**
   * 從屬關係:`enabled: false` 的文案承諾是「完全回到 #274 的行為」。
   * `idleSeeks` 獨立生效會讓那句話變成謊話。
   *
   * 突變:把 `idleSeeking` 的 `ae.enabled &&` 拿掉 → 這一條紅。
   */
  it("總開關關著時,idleSeeks 開了也不生效 (w4-needs-enabled)", () => {
    const r = run(idleAt(GAP, { enabled: false, idleSeeks: true }), 400);
    expect(r.hits).toBe(0);
    expect(r.maxTravel).toBeLessThan(0.01);
  });

  /**
   * `seekRadius` 在這條新路徑上是**真的距離門檻**,不是寫死的 48。
   *
   * 突變:把 `ae.seekRadius` 換成寫死的 48 → `tooShort` 那一格會開始命中 → 紅。
   */
  it("開起來之後,索敵半徑仍然是 seekRadius 那一格說了算 (w4-radius-is-the-knob)", () => {
    const tooShort = run(idleAt(GAP, { idleSeeks: true, seekRadius: 10 }), 400);
    const justEnough = run(idleAt(GAP, { idleSeeks: true, seekRadius: 20 }), 400);
    expect(tooShort.hits, "半徑 10 < 距離 12,不該索得到").toBe(0);
    expect(justEnough.hits, "半徑 20 > 距離 12,應該索得到").toBeGreaterThan(0);
  });

  /**
   * ⚠️ 這一條是**突變驗證失敗之後補的**,而失敗本身值得寫下來:第一版只用
   * 「走得動的 `move` 走位」去守 `nav.order === null` 這個限制,把限制拿掉
   * (改成誰都算 idle)之後那條**照樣綠** —— 因為一條活著的 `move` 走位本來
   * 就會讓**追擊**站下來(`nav.order?.kind === "move" && moveTarget !== null`),
   * 所以就算索到了 48 單位外的目標,目的地也不會被改寫。斷言方向和缺陷無關
   * (CLAUDE.md 第④種故障)。
   *
   * 真正會被那個突變改變的是 **A-click**:`attackMove` 的追擊**不會**站下來
   * (它的語意就是「接敵」),所以限制一旦鬆掉,一個按著 A 移動的玩家會從
   * 「牽引半徑 6」變成「橫跨整個競技場追 48 單位外的人」。那是 owner 從來
   * 沒有要求過的行為,而且完全靜默。
   *
   * 突變:把 `nav.order === null` 拿掉 → 這一條紅(hits 0 → 非 0)。
   */
  it("A-click 不吃這一格 —— 牽引半徑還是它自己那個 (w4-attackmove-unaffected)", () => {
    // 一直按著 A 移動、方向和敵人相反(−z)。敵人在 +z 12 單位外:近戰半徑 6
    // 索不到他,所以正確的行為是「一路往 −z 走,完全不理他」。
    const r = run(idleAt(GAP, { idleSeeks: true }), 120, {
      order: { kind: "attackMove", point: { x: ZONE_CENTRE.x, z: ZONE_CENTRE.z - 10 } },
      orderEvery: true,
    });
    expect(r.hits, "A-click 開始追 12 單位外的人了 —— idleSeeks 漏到 attackMove 上").toBe(0);
    expect(r.minGap, "身體被拉向敵人了").toBeGreaterThan(GAP - 1);
  });

  /**
   * 走位權:`idleSeeks` 管的是「手上完全沒有指令」的人,**走得動的走位一個 tick
   * 都不能被碰**(#274 的走位權,owner 為它推翻過一次接管行為)。
   *
   * ⚠️ 這一條**單獨**擋不住「限制被拿掉」那個突變(理由見上一條),它守的是另一
   * 件事:`idleSeeks` 開著時 `move` 那條路徑的走位權沒有被順手改壞。兩條一起才
   * 蓋得住。
   */
  it("開起來也不搶走得動的走位 (w4-live-walk-keeps-the-wheel)", () => {
    // 一個**走得到**的終點,方向和敵人相反 —— 追擊一旦接手就會把目的地改寫成
    // 敵人的位置,那正是這條要抓的東西。
    const dest = { x: ZONE_CENTRE.x, z: ZONE_CENTRE.z - 10 };
    const r = run(idleAt(GAP, { idleSeeks: true }), 60, {
      order: { kind: "move", point: dest },
      orderEvery: true,
    });
    expect(r.walkingTicks, "沒有量到任何一個真的在走的 tick —— harness 沒有在驅動").toBeGreaterThan(
      20,
    );
    expect(r.hijackedWhileWalking, "走得動的走位被改寫了目的地").toBe(0);
  });

  /**
   * `hold` 是玩家**明確要求站著**,它有自己的(縮小的)半徑。`idleSeeks` 不可以
   * 把它一起放大 —— 那會讓 H 變成「站在原地但會衝出去打人」,語意當場翻掉。
   *
   * 突變:把 `holdPosition` 那一支從三元的第一位挪到 `idleSeeking` 後面 → 紅。
   */
  it("hold 不吃這一格 —— H 仍然是站著不動 (w4-hold-unaffected)", () => {
    const r = run(idleAt(GAP, { idleSeeks: true }), 400, { order: { kind: "hold" } });
    expect(r.hits).toBe(0);
    expect(r.maxTravel).toBeLessThan(0.01);
  });
});
