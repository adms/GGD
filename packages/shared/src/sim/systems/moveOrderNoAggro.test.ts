/**
 * ⭐ 打帶跑 (GH#637) —— 點地板 1 秒不搶指揮權。
 *
 * owner 2026-08-24:「我如果點了地板作為目標 要有1秒冷卻不能跑去打任何目標
 * (自動攻擊)讓我可以連續移動不被干擾來達成打帶跑(像是被打不能跟我搶指揮權
 * 跑去打人)」。
 *
 * 驗**機制**不驗數字(第二守則):窗口長度 1.0 從 `DEFAULT_MANUAL_ORDER` 推導,
 * ⛔ 不抄字面值。跑的是真的 `world.step()`(真 OrderSystem + 真威脅存放區
 * `recentDamagers`),⛔ 不是手餵 autoAcquirePass(失敗形態⑤)。
 *
 * 三個方向,缺一半就有一條路徑沒人看著:
 *   1. 點地板 → 窗口內被打也不轉頭(已咬住的自動目標也放下),窗口過了恢復;
 *   2. 非真人座位(bot / 沒接 humanSeats 的世界)→ 一格都不變(#274:走位中
 *      索敵照常),這就是「bot 不受影響」在 sim 層的形狀;
 *   3. 搖桿流(每 tick 一條 move)→ 只有第一條武裝,索敵照常恢復 ——
 *      否則推著搖桿 = 永久關掉自動攻擊,#274 的 STICK 守衛就是在量這個。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import { Stat, zeroStats } from "../stats/statTypes";
import { zeroAttrBonus } from "../stats/attributes";
import type { AbilitiesComp } from "../stats/statsComp";
import type { IntentFrame } from "../intents";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../mobs";
import { DEFAULT_AUTO_ENGAGE, DEFAULT_MANUAL_ORDER, type ManualOrderRules } from "../combatFeel";
import { TICK_HZ } from "../../constants";
import * as V from "../math/vec2";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
/** autoAcquire.test.ts 的同一條乾淨巷道(z = center.z + 12,避開柱子與邊界夾)。 */
const at = (dx: number, dz = 0): V.Vec2 => ({ x: Z0.center.x + dx, z: Z0.center.z + 12 + dz });

/** 窗口長度(tick)從出貨預設推導 —— ⛔ 不抄 30。 */
const WINDOW = Math.round(DEFAULT_MANUAL_ORDER.moveOrderNoAggroSec * TICK_HZ);

function spawnFighter(w: SimWorld, seat: number, team: number, pos: V.Vec2, speed = 5.8): EntityId {
  const id = w.spawn();
  w.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  w.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = speed;
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  w.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  w.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null, basicAttackCdTicks: 0, unspentPoints: 0,
  });
  w.champion.set(id, {
    championId: "probe" as ChampionId, level: 1, xp: 0, gold: 0, items: [], augments: [],
    statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0, undoStack: [],
  });
  return id;
}

/** 真人名單走 GH#577 開的那扇門(MobRules.humanSeats);mobZones 不開,不生怪。 */
function world(
  humanSeats: ReadonlySet<SeatId>,
  lolModel = false,
  /**
   * ⭐ owner 2026-08-28 的新旋鈕（出貨 1 秒）。**0 ＝ 純 LoL**（2026-08-28 之前的
   * 行為）。⚠️ 需要顯式傳 0 的測試就是「純 LoL 從頭到尾不出手」那一條 ——
   * 它的**前提**被這格旋鈕改掉了（⛔ 不是回歸）：出貨值下站著超過 1 秒**本來就會**
   * 接手，那正是 owner 要的。⇒ 那一條改成測 rollback 的那一側（它驗的是
   * 「LoL 語意本身」，而 LoL 語意今天住在 `idleAutoEngageSec: 0`）。
   */
  idleAutoEngageSec = DEFAULT_MANUAL_ORDER.idleAutoEngageSec,
): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const cfg = (JSON.parse(readFileSync(join(CONTENT, "config/arena-rules.json"), "utf8")) as { mobWaves: MobWavesConfigLike }).mobWaves;
  w.mobRules = mobRulesFromConfig(cfg, w.dt, 1, undefined, undefined, humanSeats);
  // ⭐ GH#652：出貨的指令模型是 `"lol"`，而 LoL 的英雄**根本不會自動索敵** ——
  // 於是「點地板不搶指揮權」這件事在 lol 模型下**沒有東西可以搶**。
  // ⇒ 這一支的三條原案在 `"assist"` 模型下跑（那是這格開關存在的理由），
  //   最後一條專門驗 `"lol"` 模型讓整個問題消失。⛔ 不是「測 rollback 那條路」——
  //   是 #637 這個機制**只在 assist 模型下存在**，測它就得在它存在的地方測。
  // ⚠️ `combatFeel.manualOrder` 是 optional（半張手寫表的既有夾具靠它編得過），
  // 所以 spread 出來的型別每一格都是 optional ⇒ 用出貨預設補齊再覆蓋那一格。
  const mo: ManualOrderRules = {
    ...DEFAULT_MANUAL_ORDER,
    ...(w.combatFeel.manualOrder ?? {}),
    lolControlModel: lolModel,
    idleAutoEngageSec,
  };
  w.combatFeel = Object.freeze({ ...w.combatFeel, manualOrder: Object.freeze(mo) });
  return w;
}

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const move = (p: V.Vec2): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(0), { order: { kind: "move" as const, point: p }, commands: [] }]]);

/** 「敵人正在打我」—— 寫的是真的威脅存放區(damage.ts 寫的同一張表)。 */
function hitBy(w: SimWorld, victim: EntityId, attacker: EntityId): void {
  let m = w.recentDamagers.get(victim);
  if (!m) { m = new Map(); w.recentDamagers.set(victim, m); }
  m.set(attacker, w.tick);
}

describe("GH#637 點地板 1 秒不搶指揮權(打帶跑)", () => {
  it("點地板 → 已咬住的目標放下,窗口內被打也不轉頭,窗口過了恢復", () => {
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    // 先讓他自動咬住敵人(#221 的既有行為,同時是「放下」那一半的前提)。
    for (let k = 0; k < 5; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget).toBe(enemy);
    // 點地板(一次離散點擊,往反方向 2 單位)。
    const clicked = w.tick;
    w.step(move(at(-2)));
    let sawTarget = false;
    while (w.tick < clicked + WINDOW) {
      hitBy(w, me, enemy); // 整段窗口都在被打
      w.step(NO_INTENTS);
      if (w.nav.get(me)!.attackTarget !== null) sawTarget = true;
    }
    expect(sawTarget, "窗口內轉頭了 —— 被打反擊/自動索敵搶走了指揮權").toBe(false);
    // 窗口過了:站在點的地方(距敵 5 < 近戰索敵地板 6),索敵恢復。
    for (let k = 0; k < 10; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "窗口過了卻沒有恢復自動索敵").toBe(enemy);
  });

  it("⭐ 走位還在走 ⇒ 撐過秒數窗口也不轉頭(owner:「直到 我走到目的地」)", () => {
    // owner 2026-08-24（追加，逐字）:「如果我按了某個地板移動過去**到目的地前**
    // 我是不會被其他東西所吸引 除非嘲諷技能等 **就算敵人打我 我也不會被拉走**
    // 直到 我走到目的地」。⇒ 窗口的長度**不再是那個秒數**。
    // 驗機制⛔不驗數字:目的地距離挑成「走完一定比 WINDOW 久」,而 WINDOW 從
    // 出貨預設推導。敵人擺在終點旁(距終點 4 < 近戰索敵地板 6),所以「抵達之後
    // 恢復」也量得到 —— 少了這一半，一條「永遠不恢復」的實作也會過。
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(10), 1e-9);
    const clicked = w.tick;
    w.step(move(at(14)));
    let sawTarget = false;
    // 跑到「秒數窗口早就過期」之後仍在走的那一段。
    while (w.tick < clicked + WINDOW * 2) {
      hitBy(w, me, enemy); // 整段都在被打 —— owner:「就算敵人打我 我也不會被拉走」
      w.step(NO_INTENTS);
      if (w.nav.get(me)!.attackTarget !== null) sawTarget = true;
    }
    expect(w.tick, "測試前提壞了:這條走位在秒數窗口內就走完了").toBeGreaterThan(clicked + WINDOW);
    expect(w.nav.get(me)!.order?.kind, "測試前提壞了:還沒抵達就沒有指令了").toBe("move");
    expect(sawTarget, "秒數過了就被拉走 —— 窗口沒有撐到抵達").toBe(false);
    // 抵達之後恢復（⛔ 不是永遠關掉自動攻擊）。
    for (let k = 0; k < 200 && w.nav.get(me)!.order !== null; k++) w.step(NO_INTENTS);
    for (let k = 0; k < 10; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "走到目的地了卻沒有恢復自動索敵").toBe(enemy);
  });

  it("⛔ 走位空轉(終點到不了)⇒ 放手,自動攻擊不會被關掉整個回合(#274)", () => {
    // 點在到不了的地方時，「撐到抵達」等於「永遠」。判準是**行為**:身體連續
    // stallTicks 個 tick 沒真的走出去 ⇒ 放手。這裡用速度≈0 製造空轉。
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0), 1e-9);
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    w.step(move(at(-14)));
    const budget = WINDOW + DEFAULT_AUTO_ENGAGE.stallTicks + 20;
    for (let k = 0; k < budget; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.order?.kind, "測試前提壞了:它其實走到了").toBe("move");
    expect(w.nav.get(me)!.attackTarget, "走位空轉卻沒有放手 —— 自動攻擊被關掉整個回合").toBe(enemy);
  });

  it("⭐ 出貨的 lol 模型:沒有下令就**從頭到尾**不出手（#637 的問題整個消失）", () => {
    // owner 2026-08-24:「請你**完整拆解 LOL 的英雄控制指令與移動、攻擊、反擊邏輯**，
    // 現在玩 LOL 人數最多，最容易被接受」。LoL 的英雄**沒有 idle auto-acquire、
    // 也不會自動反擊** ⇒ 站著、走著、挨打，都不會自己挑一個目標。
    // ⭐ 顯式 `idleAutoEngageSec: 0` ＝ **純 LoL**。出貨值是 1 秒（owner 2026-08-28）
    //    ⇒ 站著超過 1 秒本來就會接手，那是**另一條**測試在驗的東西。
    const w = world(new Set([asSeatId(0)]), true, 0);
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    // ① 站著不動 + 一直被打 ⇒ 一次都不出手（assist 模型下這裡會咬住敵人）。
    for (let k = 0; k < WINDOW * 2; k++) {
      hitBy(w, me, enemy);
      w.step(NO_INTENTS);
      expect(w.nav.get(me)!.attackTarget, "lol 模型下站著挨打卻自己找上了目標").toBe(null);
    }
    // ② 走位中也一樣。
    w.step(move(at(-2)));
    for (let k = 0; k < WINDOW; k++) {
      hitBy(w, me, enemy);
      w.step(NO_INTENTS);
      expect(w.nav.get(me)!.attackTarget, "lol 模型下走位中自己找上了目標").toBe(null);
    }
    // ③ ⭐ 但玩家**下令要打**（A 鍵 attackMove）就照打 —— ⛔ 不是把自動攻擊拔掉。
    const aClick = new Map([
      [asSeatId(0), { order: { kind: "attackMove" as const, point: at(3) }, commands: [] }],
    ]);
    w.step(aClick);
    for (let k = 0; k < 10; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "A 鍵下了 attackMove 卻還是不出手").toBe(enemy);
  });

  it("⭐⭐ owner 2026-08-28:放著不管 N 秒 ⇒ 自動索敵接手；任何指令都讓計時器歸零", () => {
    // 「我說過如果沒有任何指令，停頓一段時間（N秒後台可設定）就會自動索敵攻擊」。
    // ⭐ 驗機制⛔不驗數字:N 從出貨預設推導（DEFAULT_MANUAL_ORDER.idleAutoEngageSec），
    //   ⛔ 不抄 3。敵人擺在 3 單位（< 近戰索敵地板 6），所以「接手」量得到。
    const IDLE = Math.round(DEFAULT_MANUAL_ORDER.idleAutoEngageSec * TICK_HZ);
    expect(IDLE, "出貨預設是 0 ⇒ 這條測試在測一個關著的機制").toBeGreaterThan(0);
    const w = world(new Set([asSeatId(0)]), true);
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    // ① 前 N 秒（不含）:LoL 語意 —— 一次都不出手。
    //    ⚠️ 第一 tick 才蓋「首次見到」的章，所以窗口從 tick 1 起算。
    w.step(NO_INTENTS);
    for (let k = 0; k < IDLE - 2; k++) {
      w.step(NO_INTENTS);
      expect(w.nav.get(me)!.attackTarget, `第 ${k} tick（N 秒內）就出手了 —— LoL 語意被打破`).toBe(null);
    }
    // ② 過了 N 秒:自動索敵接手（⭐ 承重 —— owner 回報「自動索敵不見了」的修復）。
    for (let k = 0; k < 5 && w.nav.get(me)!.attackTarget === null; k++) w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "放著不管超過 N 秒卻沒有恢復自動索敵").toBe(enemy);
    // ③ 一條走位指令 ⇒ 計時器歸零 + 目標理應被 LoL 語意管回去:
    //    走位結束後又要**重新**等滿 N 秒才會再接手。
    w.step(move(at(-2)));
    const afterOrder = w.tick;
    // 走到（2 單位 / 5.8 速 ≈ 11 tick）之後站著:
    for (let k = 0; k < IDLE - 5; k++) w.step(NO_INTENTS);
    // 從下指令起算還不滿 N 秒（走路吃掉一段），⛔ 不可以已經接手。
    expect(w.tick - afterOrder).toBeLessThan(IDLE);
    expect(w.nav.get(me)!.attackTarget, "指令後計時器沒歸零 —— 舊碼表還在跑").toBe(null);
  });

  it("非真人座位:同一套指令一格都不變(bot 不受影響,#274 走位中索敵照常)", () => {
    const w = world(new Set([asSeatId(7)])); // 名單裡沒有 seat 0
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    w.step(move(at(-2)));
    hitBy(w, me, enemy);
    w.step(NO_INTENTS);
    expect(w.nav.get(me)!.attackTarget, "不在 humanSeats 的座位不該有冷卻窗口").toBe(enemy);
  });

  it("搖桿流(每 tick 一條 move):只有第一條武裝,索敵照常恢復", () => {
    const w = world(new Set([asSeatId(0)]));
    const me = spawnFighter(w, 0, 0, at(0));
    const enemy = spawnFighter(w, 1, 1, at(3), 1e-9);
    const dest = at(-2);
    for (let k = 0; k < WINDOW + 15; k++) {
      hitBy(w, me, enemy);
      w.step(move(dest)); // 流:每一 tick 都是一條新的 move
    }
    expect(
      w.nav.get(me)!.attackTarget,
      "推著搖桿把自動攻擊永久關掉了 —— #274 的災難回來了(流不可以一直重武裝窗口)",
    ).toBe(enemy);
  });
});
