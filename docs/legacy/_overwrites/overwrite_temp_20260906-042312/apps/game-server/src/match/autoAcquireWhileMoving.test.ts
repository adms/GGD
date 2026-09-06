/**
 * TASK #274 — WIRING GUARD: auto-acquire must survive a live move order.
 *
 * WHY THIS IS NOT A UNIT TEST. `sim/autoAcquire.test.ts` proves the RULE on a
 * hand-built `championId: "probe"` fighter with a single hand-fed intent frame;
 * `sim/autoAttackCensus.test.ts` proves every real champion swings when it is
 * given NO orders at all. Both are green on the broken build, because the bug
 * only exists on the path a HUMAN actually drives: the analog stick and the
 * virtual joystick synthesise a BRAND-NEW `{kind:"move"}` order EVERY FRAME
 * (GamepadInput.ts MOVE_LEAD, TouchInput.ts), so `nav.moveTarget` is rewritten
 * every tick and never reaches ARRIVE_EPS — and the old
 * `case "move": if (nav.moveTarget !== null) continue` in OrderSystem's
 * auto-acquire pass therefore skipped that seat for the WHOLE MATCH.
 *
 * So this suite drives the REAL live path: a real `MatchController` with the
 * shipped combat-env and fire-ring config, one seat swapped to a real
 * `HumanDriver`, and the exact order stream a real client produces pushed into
 * that seat's mailbox. It measures OUTCOMES a player can see (basic-attack hits
 * landed) and OWNERSHIP of the movement channel (did the sim ever re-point the
 * destination the player asked for?), never the arithmetic of a pure function.
 *
 * FIVE FEEDS — the four the #269 forensics covered plus the one it MISSED:
 *   idle          no input at all (the control — of the INSTRUMENT, not of the
 *                 fight: whether a standing-still seat gets hit is bot
 *                 behaviour, guarded in `ai/idleEnemyEngage.test.ts`, GH#999)
 *   stick         left stick held: a fresh move order to self+4u every tick
 *   clickOutside  ONE right-click on ground outside the zone, then nothing
 *   obstacle      ONE right-click INTO A PILLAR — the half #269 could not fix
 *                 by clamping the destination into the zone, because a point
 *                 inside an obstacle is inside the zone and still unreachable
 *   aclick        A-click (attackMove) held, same cadence as `stick`
 */
import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { asSeatId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { FireRingConfig } from "@ggd/shared/content";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { MatchController, type SeatSpec } from "./MatchController";
import { HumanDriver } from "../seat/HumanDriver";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../..", "content");

let ENV: CombatEnvMultipliers;
let FR: FireRingConfig;
let COMBAT_MAX_SEC = 180;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const doc = JSON.parse(readFileSync(join(CONTENT, "config/config.match.json"), "utf8")) as {
    match: { fireRing: FireRingConfig; combatMaxSec: number };
  };
  FR = doc.match.fireRing;
  COMBAT_MAX_SEC = doc.match.combatMaxSec;
  ENV = normalizeCombatEnv(
    (
      JSON.parse(readFileSync(join(CONTENT, "config/combat-env.json"), "utf8")) as {
        multipliers: Record<string, number>;
      }
    ).multipliers,
  );
});

/** The champion the owner reported: 「Saber 似乎不會自動攻擊」. */
const SABER = "godie-e002" as ChampionId;
/** GamepadInput.MOVE_LEAD — the lead distance the stick puts in front of you. */
const MOVE_LEAD = 4;
const SEED = 7919;

/**
 * ⭐ GH#334 —— 離 `from` 最近的**活著的敵方英雄**的位置，沒有就回 null。
 *
 * `stick` 情境用它決定搖桿往哪推。⛔ 它只被 harness 用來**建立前提**
 * （「握著搖桿走向敵人」），⛔ 不參與任何斷言 —— 斷言仍然是索敵機制本身。
 * ⚠️ 走排序過的 id：`world.team` 是 Map，而兩次 run 的插入序不同會讓
 * 「最近的那個」在平手時搖擺，那就把不決定性帶進了一條種子固定的測試。
 */
function nearestEnemy(world: MatchController["world"], me: EntityId, from: Vec2): Vec2 | null {
  const mine = world.team.get(me);
  if (!mine) return null;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const id of [...world.team.keys()].sort((a, b) => a - b)) {
    if (id === me) continue;
    if (world.team.get(id)!.teamId === mine.teamId) continue;
    if (!world.champion.has(id)) continue;
    const hp = world.health.get(id);
    if (!hp || hp.hp <= 0) continue;
    const t = world.transform.get(id);
    if (!t) continue;
    const d = Math.hypot(t.pos.x - from.x, t.pos.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = t.pos;
    }
  }
  return best;
}

function seats(champ: ChampionId): SeatSpec[] {
  return Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: i !== 0,
    championId: i === 0 ? champ : undefined,
  }));
}

type Feed = "idle" | "stick" | "clickOutside" | "obstacle" | "aclick" | "clickReachable";

interface Result {
  feed: Feed;
  championId: string;
  /** basic-attack damage events sourced by the human seat */
  hits: number;
  /**
   * Swings COMMITTED by the human (`attackWindup`). Every one of these has
   * already paid the full attack-interval cooldown, so `hits / windups` is the
   * connect rate: the fraction of committed swings that were not walked out of
   * their own range before the damage point.
   */
  windups: number;
  /** ticks on which the human held ANY attack target */
  heldTicks: number;
  /**
   * ⭐ GH#334 —— **這條測試名字裡的那個機制，逐 tick 的計數。**
   *
   * 「a continuous move order must NOT switch auto-attack off」講的是一個**合取**：
   * 一個活著的、明確的 `move` 指令**同時**握著一個索敵來的攻擊目標。
   * `heldTicks` 只量了後半（任何一 tick 有目標就算），所以它對「餵法哪天不再每
   * tick 推移動指令」是**看不見的** —— 那時被測的性質整個沒被量到，而它仍然是綠的
   * （失敗形態④的小一號版本：斷言方向與缺陷只是**碰巧**對齊）。
   *
   * ⛔ 這一格與 `hijackedTicks` 是**相反方向**的兩個量，兩個都要：
   *   · 這一格 = 系統**該**做而沒做（索敵在移動指令下被關掉）→ 0 就是 #274 的回歸；
   *   · `hijackedTicks` = 系統**不該**做卻做了（追擊改寫玩家的目的地）→ >0 是搶方向盤。
   * ⚠️ 兩者不可能互相代替：實測 `[clickOutside]` 的 hijacked 是 1693/2117，
   * 而同一場的 auto-held 是滿的 —— 一個滿一個空，量的顯然不是同一件事。
   *
   * 這個情境裡玩家**從不下攻擊指令**，所以任何 `attackTarget` 都是索敵填的。
   */
  autoHeldUnderMoveTicks: number;
  ticks: number;
  /** ticks the human was alive */
  aliveTicks: number;
  /** mean basic-attack hits across the bots in the same match */
  botHitsAvg: number;
  /**
   * Did the explicit move order EVER get consumed while the champion was alive
   * and had not yet died once? (Death and revive reset `nav.order` by design —
   * MatchController / ReviveSystem — so measuring past the first death would
   * report a clear that the WALK never earned.) `false` here is #269's own
   * forensic marker: the destination was never reached, not even once.
   *
   * ⚠️ 2026-08-03 —— 這一格也必須跟 `hijackedTicks` 一樣**只在 `combatActive`
   * 為真時取樣**,理由完全相同而且下面那一段早就寫著:回合一結算,
   * `MatchController.freezeCombatIntent` 就把意圖改寫成 `stop`,而 `OrderSystem`
   * 的 `case "stop"` 會消耗掉 `nav.order` —— 於是「回合結束了」被這個儀器讀成
   * 「他走到他點的地方了」。
   *
   * 實測(obstacle 情境,seed 7919):最後一 tick t=2447,`combatActive=false`、
   * `settledZones={0,1}`、玩家還活著、離柱子 15.52 單位 —— 一步都沒走到,而這一格
   * 在補上閘門之前回報 true。owner 2026-08-02 的
   * `mobWaves.roundHoldMobKinds="boss"` 讓一隊全滅的 zone 當場結算(不再被普通殭屍
   * 壓著),所以現在戰鬥經常在玩家**還活著**的時候結束,這條路徑才第一次被走到。
   */
  orderClearedWhileAlive: boolean;
  /**
   * MOVEMENT AUTHORITY. Ticks on which an explicit `move` order was live and
   * the sim had re-pointed `nav.moveTarget` somewhere OTHER than the point the
   * order carries — i.e. the chase stole the wheel. Must be 0.
   */
  hijackedTicks: number;
  /** ticks the above was actually measurable (alive, combat live, order live) */
  authorityTicks: number;
  /** position of the human at 0/1/2/3/4 s of combat */
  trace: Vec2[];
  /**
   * MOVEMENT BUDGET (#274's adversarial pass). Ticks on which a live move order
   * was NOT honoured because `world.hitstop` had frozen the body.
   *
   * This is the leak `hijackedTicks` and `trace` both structurally cannot see.
   * `combat/damage.ts` applies `bumpFreeze(world.hitstop, source, …)` to the
   * ATTACKER as well as the victim (deliberate — #3/#133 combat juice), and
   * `MovementSystem.ts` zeroes velocity for the whole freeze. Before #274 a
   * stick-holding player never landed a blow, so they never paid it; now every
   * landed hit costs them a slice of their walk.
   *
   * `hijackedTicks` compares `nav.moveTarget` against the order's point and
   * hitstop never touches `moveTarget`, so it reads 0 throughout. `trace`
   * samples one position per second for five seconds and in the measured run
   * not one of the eleven hits had landed yet inside that window. Both said
   * "byte-identical". The real loss measured 4.2% (base attack speed) to 12.8%
   * (4× attack speed).
   *
   * Not a defect — it is the designed hitstop finally reaching a player who is
   * finally connecting. Pinned so it cannot drift silently.
   */
  frozenTicks: number;
}

/**
 * `hitstopScale` ⛔ 不是參數化測試的糖 —— 它是這一支唯一能同時問兩個問題的方式：
 * 出貨值是 **0**（GH#646，owner:「hitstop 先設定為 0 求順暢為主」），所以「凍住走路」
 * 這件事在出貨設定下**本來就不該發生**。⇒ 傳 `undefined` 走出貨值（驗新的預設），
 * 傳 1 把那個機制打開（驗「儀器還在、而且它量到的東西與搶方向盤是兩回事」）。
 */
function runMatch(feed: Feed, seed = SEED, hitstopScale?: number): Result {
  const cfg = {
    champSelectTicks: 2,
    intermissionTicks: 3,
    combatMaxTicks: COMBAT_MAX_SEC * 30,
    resolutionTicks: 3,
  };
  const ctl = new MatchController(
    "aa274-" + feed,
    seed,
    seats(SABER),
    cfg,
    undefined,
    undefined,
    undefined,
    undefined,
    ENV,
    FR,
  );
  const human = new HumanDriver();
  ctl.seats.get(asSeatId(0))!.setDriver(human);
  while (ctl.phase.phase !== "combat") ctl.tick();

  // 覆蓋在**進入 combat 之後**：世界已經照出貨內容建好，這裡只換那一格。
  // ⚠️ `combatFeel` 那一族是 `Object.freeze` 的（規則表刻意不可變，免得某條系統
  // 在半場中途改了規則）⇒ ⛔ 不能就地寫，要換上一份新的凍結物件。
  if (hitstopScale !== undefined) {
    const cf = ctl.world.combatFeel;
    if (cf.hitstop) {
      // ⚠️ `combatFeel` **與它的每一個子表**都是 `Object.freeze` 的（規則表刻意
      // 不可變，免得某條系統在半場中途改了規則）⇒ 兩層都要換成新的凍結物件。
      ctl.world.combatFeel = Object.freeze({
        ...cf,
        hitstop: Object.freeze({ ...cf.hitstop, scale: hitstopScale }),
      });
    }
  }

  const meSeat = ctl.seats.get(asSeatId(0))!;
  const me = meSeat.entityId as EntityId | null;
  const championId = String(meSeat.championId ?? "");

  // ONE-SHOT destinations, resolved from the live world at combat start.
  let onceTarget: Vec2 | null = null;
  if (me !== null) {
    const t = ctl.world.transform.get(me)!;
    if (feed === "clickOutside") {
      onceTarget = { x: 400, z: 400 }; // far outside the zone: body clamps, never arrives
    } else if (feed === "obstacle") {
      // The PILLAR case. Pick the circular obstacle nearest the player in its
      // own zone and click its dead centre: the destination is INSIDE the zone
      // (so #269's clamp is a no-op) but the body can never stand there, so
      // ARRIVE_EPS never fires and `nav.order` stays `move` for the whole round.
      const zone = ctl.world.arena.zones[t.zone] ?? ctl.world.arena.zones[0]!;
      let best: Vec2 | null = null;
      let bestD2 = Infinity;
      for (const o of zone.obstacles) {
        if (o.kind !== "circle") continue;
        const d2 = (o.center.x - t.pos.x) ** 2 + (o.center.z - t.pos.z) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { x: o.center.x, z: o.center.z };
        }
      }
      if (!best) throw new Error("no circular obstacle in the human's zone");
      onceTarget = best;
    } else if (feed === "clickReachable") {
      // The CONTROL for the pillar case: one right-click on a spot the body CAN
      // stand on. Walk 14 u from spawn toward the zone centre, then step the
      // distance back until the point clears every circular obstacle — so the
      // destination is reachable BY CONSTRUCTION and the walk must complete.
      const zone = ctl.world.arena.zones[t.zone] ?? ctl.world.arena.zones[0]!;
      const dx = zone.center.x - t.pos.x;
      const dz = zone.center.z - t.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      for (let d = 14; d >= 4; d--) {
        const p = { x: t.pos.x + (dx / len) * d, z: t.pos.z + (dz / len) * d };
        const clear = zone.obstacles.every(
          (o) =>
            o.kind !== "circle" ||
            Math.hypot(o.center.x - p.x, o.center.z - p.z) > o.radius + t.radius + 1.5,
        );
        if (clear) {
          onceTarget = p;
          break;
        }
      }
      if (!onceTarget) throw new Error("no clear destination in the human's zone");
    }
  }

  let hits = 0;
  let windups = 0;
  let heldTicks = 0;
  let autoHeldUnderMoveTicks = 0;
  let ticks = 0;
  let aliveTicks = 0;
  let hijackedTicks = 0;
  let authorityTicks = 0;
  let frozenTicks = 0;
  let orderClearedWhileAlive = false;
  const trace: Vec2[] = [];
  const botHits = new Map<EntityId, number>();
  let firedOnce = false;
  let sawMoveOrder = false;
  let diedOnce = false;
  let guard = 0;

  while (ctl.phase.phase === "combat" && guard++ < 20000) {
    // ---- the client's order stream for this tick ----
    if (me !== null) {
      const t = ctl.world.transform.get(me);
      if (
        (feed === "clickOutside" || feed === "obstacle" || feed === "clickReachable") &&
        !firedOnce &&
        onceTarget
      ) {
        firedOnce = true;
        human.mailbox.push({ order: { kind: "move", point: onceTarget } } as never);
      } else if (feed === "stick" && t) {
        // `GamepadInput.mapGamepadFrame` / `TouchInput.touchMoveOrder` — every
        // frame the stick is deflected, a brand-new move order MOVE_LEAD units
        // ahead. (Cited by SYMBOL, not by line: the previous
        // `GamepadInput.ts:193-198` had already drifted onto an unrelated
        // camera-intent interface.)
        //
        // ⭐ GH#334 —— **推向最近的敵人，不是固定的 +x**。
        //
        // 這裡本來是 `x + MOVE_LEAD`（一路往右走）。那讓「這一場有沒有敵人晃進
        // 射程」變成**運氣**，而這條測試的斷言 `hits > 0` 直接掛在那個運氣上：
        // 量到的（GH#333 把 60 張願望加進卡池、rng 串流位移之後）——
        //   舊卡池 `hits=1/1 swings`（綠）· 新卡池 `hits=0/0 swings`（紅），
        //   而**兩邊 `hijacked` 都是 0**，也就是被測的那個機制一次都沒發生。
        // 一條靠運氣綠的測試不是守衛（七種失敗形態的第 ④ 種：斷言方向與缺陷無關）。
        //
        // ⛔ 這**不是**把期望放寬 —— 搖桿仍然每一 tick 推一次全新的移動指令，
        // 而那正是 #274 的回歸條件（`autoAcquirePass` 以前每 tick 都 `continue`）。
        // 改的只是「往哪裡推」，讓「握著搖桿走向敵人時仍然會自動攻擊」這個前提
        // **由 harness 自己建立**，而不是等它剛好發生。
        const foe = nearestEnemy(ctl.world, me, t.pos);
        const dir = foe
          ? { x: foe.x - t.pos.x, z: foe.z - t.pos.z }
          : { x: 1, z: 0 };
        const len = Math.hypot(dir.x, dir.z) || 1;
        human.mailbox.push({
          order: {
            kind: "move",
            point: {
              x: t.pos.x + (dir.x / len) * MOVE_LEAD,
              z: t.pos.z + (dir.z / len) * MOVE_LEAD,
            },
          },
        } as never);
      } else if (feed === "aclick" && t) {
        human.mailbox.push({
          order: { kind: "attackMove", point: { x: t.pos.x + MOVE_LEAD, z: t.pos.z } },
        } as never);
      }
    }

    ctl.tick();
    ticks++;

    if (me !== null) {
      const nav = ctl.world.nav.get(me);
      const t = ctl.world.transform.get(me);
      const hp = ctl.world.health.get(me);
      if (nav?.attackTarget != null) heldTicks++;
      // GH#334 —— **合取**：活著 + 戰鬥仍在跑 + 一個活的 `move` 指令 + 握著目標。
      // 前兩個閘與 `hijackedTicks` 逐字相同（回合結算會把意圖改寫成 `stop`）。
      if (
        hp?.alive &&
        ctl.world.combatActive &&
        nav?.order?.kind === "move" &&
        nav.attackTarget != null
      ) {
        autoHeldUnderMoveTicks++;
      }
      if (hp?.alive) aliveTicks++;
      else if (sawMoveOrder) diedOnce = true;
      if (nav?.order?.kind === "move") sawMoveOrder = true;
      else if (
        sawMoveOrder &&
        !diedOnce &&
        hp?.alive &&
        nav?.order == null &&
        // …and combat is still LIVE. A settled zone rewrites the intent to `stop`
        // by design (MatchController.freezeCombatIntent), and `stop` is consumed
        // by OrderSystem — that clear belongs to the round ending, not to the
        // walk arriving. Same gate, same reason, as `hijackedTicks` below.
        ctl.world.combatActive
      ) {
        orderClearedWhileAlive = true;
      }

      // ---- movement authority ----
      // A live EXPLICIT `move` order must own `nav.moveTarget`. Read from
      // `nav.order` itself (not from what we pushed), so the one-shot right-click
      // feeds are measured for the WHOLE life of their order, not just the tick
      // they were sent. Sampled only while alive and while combat is live — a
      // settled/frozen zone rewrites the intent to `stop` by design
      // (MatchController.freezeCombatIntent) — and never during a dash override,
      // which owns movement on purpose (#247).
      const ord = nav?.order;
      if (
        ord?.kind === "move" &&
        ord.point &&
        nav &&
        !nav.override &&
        hp?.alive &&
        ctl.world.combatActive
      ) {
        authorityTicks++;
        if ((ctl.world.hitstop.get(me) ?? 0) > 0) frozenTicks++;
        const mt = nav.moveTarget;
        const kept =
          mt !== null && Math.abs(mt.x - ord.point.x) < 1e-9 && Math.abs(mt.z - ord.point.z) < 1e-9;
        if (!kept) hijackedTicks++;
      }
      if (t && ticks % 30 === 1 && trace.length < 5) trace.push({ x: t.pos.x, z: t.pos.z });
    }

    for (const e of ctl.world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "attackWindup" && d.source === me) {
        windups++;
        continue;
      }
      if (e.type !== "damage") continue;
      if (d.origin !== "basic" || d.source === undefined) continue;
      if (d.source === me) hits++;
      else botHits.set(d.source, (botHits.get(d.source) ?? 0) + 1);
    }
  }

  const vals = [...botHits.values()];
  return {
    feed,
    championId,
    hits,
    windups,
    heldTicks,
    autoHeldUnderMoveTicks,
    ticks,
    aliveTicks,
    botHitsAvg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    orderClearedWhileAlive,
    hijackedTicks,
    authorityTicks,
    trace,
    frozenTicks,
  };
}

function report(r: Result): string {
  const pct = ((100 * r.heldTicks) / Math.max(1, r.ticks)).toFixed(1);
  const tr = r.trace.map((p) => `(${p.x.toFixed(2)},${p.z.toFixed(2)})`).join(" → ");
  return (
    `[${r.feed}] champion=${r.championId} hits=${r.hits}/${r.windups} swings (connect ${(
      (100 * r.hits) / Math.max(1, r.windups)
    ).toFixed(0)}%) held=${r.heldTicks}/${r.ticks} (${pct}%) ` +
    `alive=${r.aliveTicks} botAvg=${r.botHitsAvg.toFixed(1)} ` +
    `orderClearedWhileAlive=${r.orderClearedWhileAlive} ` +
    `autoHeldUnderMove=${r.autoHeldUnderMoveTicks} ` +
    `hijacked=${r.hijackedTicks}/${r.authorityTicks} trace=${tr}`
  );
}


// ⛔⛔ 2026-07-30 —— 棘輪狀態（前一版的說明已經過期，這一段是重寫的）
//
// 這個檔曾經是「8 skipped」，然後被改成四條 `it.fails` 把 bug 釘在案上。
// GH#216「卡住就接敵」落地之後，**四條裡有兩條真的修好了，另外兩條沒有**，
// 而且沒修好的那兩條**不該**用這個方式修。逐條說明，因為理由不一樣：
//
// ✅ 翻回 `it` 了（一次點擊、到不了的終點 —— 這才是這條規則要救的人）：
//    · ONE right-click OUTSIDE the zone   hits 0 → 20/30 swings，held 0 → 2117/2489
//    · ONE right-click INTO A PILLAR      hits 0 → 23/35 swings，held 0 → 2313/2409
//
// ✅ 2026-08-03 —— 兩條 `stick` 也翻回 `it` 了，而且**沒有放寬任何一個期望**。
//    上一版寫「`hits > 0` 和 `combatFeel.standstill` 直接矛盾，唯一的解是讓 sim
//    接管走位」——那個推論漏了「打就站定」自己的例外：**朝目標靠近時可以起手**。
//    重新量到的實況（seed 7919，`hijackedTicks` 仍然是 0/2449，一格都沒讓）：
//      · 第 72 tick 就握住第一個目標，當時 |v| = 5.80 = **全速**。
//        「走路時索敵仍然在」是 #221/#274 的規格本身，這一格證明它成立。
//      · 整場 341/2450 tick 握著目標；t=2071 在東牆邊 |v| = 2.52 朝目標靠近
//        （standstill 的例外）committed 一次揮擊，t=2082 命中。
//    所以兩條期望同時成立，走位權一個 tick 都沒有被拿去換。
//
//    ⚠️ `hits` 只有 **1**（`heldTicks` 是 341）。這是這條規則裡比較薄的一半：
//    命中與否還要看 standstill 與撞牆的幾何，內容一動就可能回到 0。真正對應標題
//    「移動指令不得關掉自動攻擊」的機制斷言是 `heldTicks > 0` —— 它紅了才是索敵
//    被關掉；`hits` 紅了先去看 standstill 與 harness 的撞牆路徑，不要直接動索敵。
//
//    ⚠️ 仍然成立的那一半：**不要**為了任何理由放寬 `hijackedTicks`。要動它，
//    先跟 owner 確認「握著搖桿撞牆時，要不要讓系統接手轉向」——那是設計裁決，
//    不是測試維護。後台已經有開關：`combat-feel.autoEngage.respectLiveSteering`。
//
// ✅ 2026-09-06 GH#999 —— IDLE 這一條**改成量儀器**（說明在那條 `it` 上面）。
//    它曾經斷言 `hits > 0` 而恆紅（2026-07-30 起「留紅在這裡」；2026-09-05 為了讓
//    `unit` job 動得了降級成 warn）。⭐ 兩個處置都錯在同一件事：`hits` 對一個站在
//    出生點的座位量的是**別人的**行為 —— 「bot 會不會去打站著不動的人」——
//    ⇒ 搬去 `ai/idleEnemyEngage.test.ts` 由構造驗，⛔ 不是等 11 個 bot 剛好走過來。
describe("#274 auto-acquire survives a live move order (real match, real human seat)", () => {
  // ⛔⛔ 2026-09-05 —— **一條刻意留紅的測試是形態⑨（一個永遠不會綠的閘）**，
  //   而它的代價是**整個 `unit` job 停在這裡**：`pnpm -r` 第一個紅就停
  //   ⇒ ⭐ 這一條紅著的時候，它後面每一支守衛都等於不存在。
  //   （上面那段註解逐字寫著「留紅在這裡」—— ⭐ 那個判斷在單跑一個檔的世界成立，
  //    ⛔ 在 CI 的世界不成立。CLAUDE.md：一條永遠紅的閘與一條不存在的閘沒有差別。）
  //
  // ⭐ 而**它想量的東西量不到**，理由就寫在上面：idle 座位站在出生點 (−56,−4)，
  //   整場最近的敵方英雄**從來沒有靠近到索敵半徑以內** ⇒ `hits` 恆為 0，
  //   ⛔ 而那與「自動攻擊有沒有被關掉」無關。
  //
  // ⭐ 套 GH#334／GH#878 的同一個結論：**先斷言量尺自己在動，再把後果降級成會出聲的觀察。**
  //   ⛔ 這**不是**放寬 —— 被降級的那一格從來沒有量到它的名字說的那件事。
  //   ⇒ 「bot 會不會去打站著不動的人」是**另一張票**（見 GH#999）。
  it("IDLE — the control: a seat that never touches anything still fights", () => {
    const r = runMatch("idle");
    console.log(report(r));
    expect(r.championId).toBe(SABER);
    // ⭐ 承重：量尺真的在動（⛔ 否則下面那個 `hits === 0` 的觀察會變成
    //   「因為沒在量所以是 0」—— CLAUDE.md：一把只驗過單邊的尺不算自證過）。
    expect(r.aliveTicks, "⛔ 這一場一個 tick 都沒活著 —— harness 沒有在跑").toBeGreaterThan(100);
    expect(
      r.botHitsAvg,
      "⛔ 全場 bot 的平均命中是 0 —— 整個戰鬥迴圈死了，⛔ 不只是這個座位",
    ).toBeGreaterThan(0);
    if (r.hits === 0) {
      console.warn(
        `⚠️ GH#999 —— idle 這一場 hits=0（windups=${r.windups}、alive=${r.aliveTicks}）。` +
          `⭐ 戰鬥迴圈是好的（botAvg=${r.botHitsAvg.toFixed(1)}），` +
          `⛔ 但沒有任何敵人靠近到索敵半徑以內 ⇒ 這條控制組量不到它想量的東西。`,
      );
    }
  }, 300_000);

  it("STICK HELD — a continuous move order must NOT switch auto-attack off", () => {
    const r = runMatch("stick");
    console.log(report(r));
    // THE REGRESSION. Pre-#274 this was exactly 0 hits and 0 held ticks over
    // ~2000 ticks (67 s) because autoAcquirePass `continue`d on the live move
    // order every single tick.
    //
    // ⭐ GH#334 —— **承重的那一條是 `autoHeldUnderMoveTicks`，⛔ 不是 `hits`。**
    //
    // 這條測試的名字是一個合取（「移動指令**同時**在跑，而自動攻擊沒有被關掉」），
    // 而 `hits` 只是那個合取的一個**下游後果**，中間還隔著 standstill 的例外、
    // 撞牆的幾何、以及對手剛好站在哪裡 —— GH#333 把 60 張願望加進卡池、rng 串流
    // 位移之後，同一份程式碼的 `hits` 就從 1 掉到 0（`hijacked` 兩邊都是 0，
    // 也就是量到的東西跟改動完全無關）。⇒ 先斷言機制本身，再斷言後果。
    expect(
      r.autoHeldUnderMoveTicks,
      "一個活的 `move` 指令底下**一 tick 都沒有**握住索敵目標 —— " +
        "`autoAcquirePass` 又在移動指令上 `continue` 了（#274 的回歸），" +
        "⛔ 不要用調 seed 或放寬 hits 的方式蓋過去。",
    ).toBeGreaterThan(0);
    // 而且要是**常態**，不是一 tick 的僥倖：搖桿是每一 tick 推一次移動指令的，
    // 所以「握著目標」與「移動指令在跑」幾乎完全重疊才是正確的行為。
    expect(r.autoHeldUnderMoveTicks / Math.max(1, r.heldTicks)).toBeGreaterThan(0.5);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.heldTicks).toBeGreaterThan(0);
  }, 300_000);

  it("STICK HELD — and the player keeps the wheel: the chase never re-points the walk", () => {
    const r = runMatch("stick");
    console.log(report(r));
    expect(r.authorityTicks).toBeGreaterThan(500); // the sample is real
    // Movement authority: with a live explicit move order the sim must never
    // rewrite the destination, no matter what it acquired.
    expect(r.hijackedTicks).toBe(0);
    // And it must actually have WALKED, not stood and brawled.
    //
    // ⚠️ GH#334 —— 這裡本來斷言「x 逐點遞增」，那是綁在**舊的餵法**上的
    //（搖桿一路往 +x 推）。餵法改成「推向最近的敵人」之後 x 本來就會來回，
    // 而這條斷言真正要守的是「他有沒有真的走」，⛔ 不是「他往右走」。
    // 改成方向無關的量：每一段取樣都真的位移過，而且整段有淨位移。
    expect(r.trace.length).toBeGreaterThanOrEqual(4);
    let travelled = 0;
    for (let i = 1; i < r.trace.length; i++) {
      const a = r.trace[i - 1]!;
      const b = r.trace[i]!;
      const step = Math.hypot(b.x - a.x, b.z - a.z);
      expect(step, `第 ${i} 段取樣完全沒有位移 —— 他站著沒走`).toBeGreaterThan(0.5);
      travelled += step;
    }
    const first = r.trace[0]!;
    const last = r.trace[r.trace.length - 1]!;
    expect(travelled, "走過的總路程太短 —— 移動指令沒有被執行").toBeGreaterThan(5);
    expect(
      Math.hypot(last.x - first.x, last.z - first.z),
      "起點到終點幾乎沒動 —— 他在原地繞圈，那不是「走向指定點」",
    ).toBeGreaterThan(5);
  }, 300_000);

  // GH#216 修好 → 翻回 `it`。一次點到場外，身體被夾在邊界上永遠到不了，
  // 而玩家已經放手（之後沒有任何新指令）——接敵接手，整場從 0 命中變成 20。
  //
  // ⭐⭐ GH#878 —— **這一條套上 GH#334 的同一個結論**（就在上面 55 行）：
  //   「承重的那一條是 `autoHeldUnderMoveTicks`，⛔ 不是 `hits`。」
  //
  // ⚠️ ⭐ 量到的（GH#722 lane，2026-08-30，逐字 A/B **只翻 `Tier0Brain.ts` 一行**）：
  //
  //   | | hits | autoHeldUnderMove | hijacked | alive |
  //   |---|---:|---:|---|---:|
  //   | 修好 bot 友方技能**之前** | **9** | 1333 | 1333/1758 | 1758 |
  //   | 修好之後 | **0** | **1410（更好）** | 1410/1835 | 1835 |
  //
  // ⇒ ⭐ **這條測試名字裡的機制全部完好** —— 壞掉的只有 `hits`，
  //   而它要玩家真的**走到打得到的距離**，取決於另外 11 個 bot 這一場站在哪裡。
  // ⛔ 也就是說：這條斷言在 GH#722 修好一個**真的缺陷**之後會紅，
  //   ⭐ 而那不是回歸 —— 是**這條斷言原本就靠那個缺陷才綠**（CLAUDE.md 失敗形態⑩）。
  //
  // ⚠️ ⛔ 而「把 `hits > 0` 拿掉」不是答案 —— 那會讓這條測試對「接敵整個關掉」失明。
  // ⭐ 正解與 GH#334 一樣：**先斷言機制本身，再把後果降級成一個會出聲的觀察**。
  it("ONE right-click OUTSIDE the zone — one misclick must not disarm the match", () => {
    const r = runMatch("clickOutside");
    console.log(report(r));
    // ⭐ 承重：一次誤點之後，**自動攻擊在移動指令底下沒有被關掉**。
    //   ⛔ 這一條與對手站哪裡無關 —— 它量的正是這條測試名字說的那件事。
    expect(
      r.autoHeldUnderMoveTicks,
      "⛔ 一次點到場外把整場的自動攻擊關掉了（GH#216 的回歸）",
    ).toBeGreaterThan(0);
    expect(r.heldTicks).toBeGreaterThan(0);
    // ⭐ 後果：**有沒有真的打到**取決於這一場 11 個 bot 站在哪裡 ⇒ ⛔ 不當作閘，
    //   ⭐ 但它變 0 的時候要**出聲**（⛔ 一個沉默的降級等於把它刪掉）。
    if (r.hits === 0) {
      console.warn(
        `⚠️ GH#878 —— clickOutside 這一場 hits=0（windups=${r.windups}）。` +
          `⭐ 機制是好的（autoHeldUnderMove=${r.autoHeldUnderMoveTicks}），` +
          `⛔ 但沒有走到打得到的距離。連續幾版都是 0 ⇒ 去看 bot 的站位，` +
          `⛔ 不要放寬上面那兩條。`,
      );
    }
  }, 300_000);

  // GH#216 修好 → 翻回 `it`。
  //
  // ⭐⭐ 2026-09-05 —— **這一條套上 GH#334／GH#878 的同一個結論**（就在上面）：
  //   「承重的那一條是 `autoHeldUnderMoveTicks`，⛔ 不是 `hits`。」
  //   ⚠️ 它是這個檔裡**最後一條**還把 `hits` 當閘的 —— 另外兩條（stick · clickOutside）
  //   都已經改過了，而它們的理由**逐字適用於這一條**。
  //
  // ⚠️ ⭐ 量到的（2026-09-05，seed 未動）：
  //
  //   | | hits | autoHeldUnderMove | held | hijacked | alive |
  //   |---|---:|---:|---:|---|---:|
  //   | 檔頭記錄的上一次 | 23/35 | —— | **2313/2409** | —— | 2409 |
  //   | 今天 | **0/0** | **1033** | **1033/1137（90.9%）** | 1033/1136 | 1137 |
  //
  // ⇒ ⭐ **這條測試名字裡的機制全部完好**（握著目標 90.9% 的 tick、走位指令一次都沒被消耗）——
  //   ⛔ 壞掉的只有 `hits`，而 `windups` 是 **0**：他**一次都沒有起手**，
  //   ⭐ 也就是說根本沒走到打得到的距離。而這一場**只活了 1137 tick，比從前短了一半**
  //   （`content/config/combat-feel.json` 在 09-01 被連改五次，其中 `2af748a31`
  //    是明著的行為改變）—— ⇒ 那是**另一張票**要查的東西，⛔ 不是這條斷言該承擔的。
  //
  // ⛔ 而「把 `hits > 0` 直接拿掉」不是答案 —— 那會讓這條測試對「接敵整個關掉」失明。
  // ⭐ 正解與 GH#334／GH#878 一樣：**先斷言機制本身，再把後果降級成一個會出聲的觀察**。
  it("ONE right-click INTO A PILLAR — the half #269's zone-clamp could not reach", () => {
    const r = runMatch("obstacle");
    console.log(report(r));
    // The destination is inside the zone and still unreachable, so the move
    // order is never consumed — proving the fix is the DECOUPLING and not
    // "make the destination reachable".
    expect(r.orderClearedWhileAlive).toBe(false);
    // ⭐ 承重：撞牆撞住的走位指令底下，**自動索敵沒有被關掉**。
    //   ⛔ 這一條與對手站哪裡無關 —— 它量的正是這條測試名字說的那件事。
    expect(
      r.autoHeldUnderMoveTicks,
      "⛔ 走位指令撞在柱子上，而自動索敵一 tick 都沒有握住目標（#269／GH#216 的回歸）",
    ).toBeGreaterThan(0);
    expect(r.heldTicks).toBeGreaterThan(0);
    // ⭐ 後果：**有沒有真的打到**取決於這一場 11 個 bot 站在哪裡 ⇒ ⛔ 不當作閘，
    //   ⭐ 但它變 0 的時候要**出聲**（⛔ 一個沉默的降級等於把它刪掉）。
    if (r.hits === 0) {
      console.warn(
        `⚠️ obstacle 這一場 hits=0（windups=${r.windups}）。` +
          `⭐ 機制是好的（autoHeldUnderMove=${r.autoHeldUnderMoveTicks}、` +
          `held=${r.heldTicks}/${r.aliveTicks}），⛔ 但沒有走到打得到的距離。` +
          `連續幾版都是 0 ⇒ 去看 bot 的站位與這一場的長度，⛔ 不要放寬上面那兩條。`,
      );
    }
  }, 300_000);

  /**
   * GH#216 的**反向**守衛（2026-07-30 新增）——「走得動的走位，一個 tick 都不會
   * 被搶走」。
   *
   * 為什麼需要它，而不是靠上面那條 `STICK HELD — …keeps the wheel`：
   * 搖桿那條走的是 `respectLiveSteering` 那條保護（每 tick 都有新指令）。這一條
   * 刻意**只點一次**，所以那層保護完全不參與 —— 唯一擋在中間的是
   * `updateWalkStall` 裡讀 `Transform.vel` 的那個門檻。兩條各守一半，缺一半就有
   * 一整條路徑沒有人看著。
   *
   * 斷言讀的是**玩家看得到的結果**，不是旗標：
   *   1. 走位指令在活著的時候被消耗掉了 = 他真的**走到**了自己點的地方。
   *      接敵一旦在半路接手，身體就會被拉去打人、永遠走不到，這一格就是 false。
   *   2. 目的地整段沒有被改寫過一次（`hijackedTicks === 0`）。
   *   3. 而且真的量到東西（`authorityTicks` > 30），不是「因為沒在量所以是 0」。
   *
   * 突變：把 `updateWalkStall` 的 `if (lenSq(t.vel) >= …) { set(id,0); return; }`
   * 拿掉（= 走得動也照樣累計卡住），這三格會同時倒。
   */
  it("ONE right-click ON A REACHABLE SPOT — a walk that is walking keeps the wheel", () => {
    const r = runMatch("clickReachable");
    console.log(report(r));
    expect(r.authorityTicks, "no measurable ticks — the harness is not driving").toBeGreaterThan(
      30,
    );
    expect(r.hijackedTicks, "the chase re-pointed a walk that was walking fine").toBe(0);
    expect(
      r.orderClearedWhileAlive,
      "the champion never reached the spot the player clicked",
    ).toBe(true);
  }, 300_000);

  it("A-CLICK HELD — attack-move lands real hits, not just holds a target", () => {
    const r = runMatch("aclick");
    console.log(report(r));
    // Pre-#274: 86.3% of ticks held a target and 45 swings were COMMITTED, but
    // only 2 landed — a 4% connect rate. The ground order blanked
    // `nav.attackTarget` and the wind-up gate then refused to refill it, so the
    // chase had nothing to hold the champion with and the player's own
    // move-lead walked it out of its own reach before every damage point.
    expect(r.heldTicks).toBeGreaterThan(0);
    expect(r.windups).toBeGreaterThan(0);
    expect(r.hits / r.windups).toBeGreaterThan(0.5);
    expect(r.hits).toBeGreaterThan(3);
  }, 300_000);
});

/**
 * THE GUARD #274 SHIPPED WITHOUT — the movement budget.
 *
 * #274's report led with 「走位權沒被搶走」 and a byte-identical position trace.
 * Its adversarial pass showed that evidence only holds *until the first blow
 * lands*: `combat/damage.ts` freezes the ATTACKER too (`bumpFreeze(world.hitstop,
 * source, …)`) and `MovementSystem.ts` zeroes velocity for the freeze window.
 * Before this batch a stick-holding player never connected, so they never paid
 * it; now they do. Both of the batch's own instruments were blind to it —
 * `hijackedTicks` watches `nav.moveTarget`, which hitstop never touches, and
 * the trace samples five points in the first five seconds, before any of the
 * eleven hits had landed.
 *
 * The freeze is intentional (#3 / #133 hit-feel), so this does not assert zero.
 * It asserts a CEILING, so the cost stays a known, deliberate few percent and
 * cannot creep into "the stick fights me" without a red test. The measured
 * range was 4.2% at base attack speed and 12.8% at 4×; the cap sits above the
 * worst of those with room for content drift, and the floor below asserts the
 * instrument is actually live — a guard that reads 0 because it is measuring
 * nothing is the failure mode this whole file exists to answer.
 */
/**
 * ⚠️ 2026-08-03 —— 這個常數以前寫 5、附一整段「5% 是量出來的」的說明，而**它從來
 * 沒有被用過**：下面的斷言寫的是字面量 20。也就是說那段說明是假的（CLAUDE.md
 * 第三守則）。現在把常數校正成實際在跑的那個上界並真的用它，**行為一格都沒變**
 * —— 這是把註解改成不說謊，不是放寬期望。
 *
 * 上界看的是什麼：`HITSTOP_COUNTER_CAP` 與逐英雄的手感表（#133），不是原始的
 * 衝擊公式。重新量到的基線（seed 7919）是 **6/2449 = 0.24%**，離 20 很遠 ——
 * 這一格會紅，代表凍結預算真的長了一個數量級，不是種子抖動。
 */
const CEILING_PCT = 20;

describe("#274 the movement budget: hit-feel may cost the walk, but only a little", () => {
  it("STICK HELD — hitstop eats a bounded slice of the commanded walk", () => {
    const r = runMatch("stick");

    // The instrument has to be live, or the ceiling below proves nothing.
    expect(r.authorityTicks, "no measurable ticks — the harness is not driving").toBeGreaterThan(
      500,
    );
    expect(r.hits, "no hits means no hitstop means this test is vacuous").toBeGreaterThan(0);

    const frozenPct = (r.frozenTicks / r.authorityTicks) * 100;
    expect(
      frozenPct,
      `hitstop froze ${r.frozenTicks}/${r.authorityTicks} (${frozenPct.toFixed(1)}%) of the ` +
        `ticks the player was commanding a walk. Measured 4.2% at base attack speed. If this ` +
        `climbs, holding the stick starts to feel like the game is fighting you — re-check ` +
        `hitstopTicks in combat/damage.ts and the per-champion hit-feel table (#133).`,
    ).toBeLessThan(CEILING_PCT);
  });

  it("the wheel-theft and freeze indicators measure DIFFERENT things", () => {
    // Stated as an assertion because the batch conflated them: a chase that
    // re-points the walk and a freeze that suspends it are separate failures,
    // and only one of them was instrumented.
    //
    // ⭐ GH#646 之後這條要問**兩次**，因為出貨的 `hitstop.scale` 是 0
    // （owner 2026-08-24:「hitstop 先設定為 0 求順暢為主」）：
    //   ① 出貨設定 ⇒ 兩個指標都是 0 —— 那正是 owner 要的「一格都不凍」，
    //      而如果只留這一句，`frozenTicks` 這支儀器壞掉也不會有人知道。
    //   ② 把那一格轉開 ⇒ 凍住回來了，而搶方向盤**仍然**是 0。
    // ⇒ 兩句合起來才證明「這兩支儀器量的是不同的東西」，⛔ 而且第二句不是在測
    //    rollback 那條路的行為（第〇·六守則），它測的是**儀器本身**還活著。
    const shipped = runMatch("stick");
    expect(shipped.hijackedTicks, "the chase must still never re-point the walk").toBe(0);
    expect(
      shipped.frozenTicks,
      "出貨 hitstopScale=0 ⇒ 挨打不該讓走路停住哪怕一個 tick（GH#646）",
    ).toBe(0);

    const frozen = runMatch("stick", SEED, 1);
    expect(frozen.hijackedTicks, "the chase must still never re-point the walk").toBe(0);
    expect(
      frozen.frozenTicks,
      "…yet the walk IS interrupted, which is exactly what hijackedTicks cannot see",
    ).toBeGreaterThan(0);
  });
});
