/**
 * 🧟 第十一回合的**壓力／清理量尺**（GH#1196 H⑤）—— 一支 harness，兩個消費端。
 *
 * | 消費端 | 問什麼 | 為什麼住那裡 |
 * |---|---|---|
 * | `round11Stress.test.ts` | ⭐ **清理機制**（上限夾得住 · 屍體被收走 · 回合結束清場），兩個方向 | 機制是決定性的 ⇒ 會紅的斷言 |
 * | `scripts/round11-stress.ts` | tick p50/p95/p99 · 峰值存活數 · 記憶體前後差 | ⛔ 效能數字**不寫成 vitest 斷言**：4 vCPU CI 會超額訂閱（GH#1014 量到 11.6×）⇒ 假紅 |
 *
 * ⭐ 兩者跑的是**同一支** `runRound11Stress` ⇒ 報告的「峰值存活數」與測試的「上限真的夾到了」
 * 量的是同一個分母，⛔ 不是兩份各自漂的夾具。
 *
 * ⭐ 設定吃**出貨的** `content/config/arena-rules.json`（`rulesFromDoc`）：
 * ⛔ 不縮 `round11.durationSec`、⛔ 不縮 `maxAliveZombies`、⛔ 不縮 `spawnRampSec`。
 * ⚠️ 唯一縮的是**前十回合的賽制時序**（`STRESS_FAST_PHASES`）：它們不是被測物，
 * 而第十一回合的長度由 `round11.durationSec` 推導（`combatMaxTicksForRound`），⛔ 不吃它。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ 兩種負載，⛔ 不要混著讀（2026-09-15 量到的分母）
 * ─────────────────────────────────────────────────────────────────────────────
 * · **自然**（`saturate: false`）：出貨的生怪門自己生。實測峰值 **59 隻**（出貨內容）／
 *   **80 隻**（骨架），而回合在 **190–225 秒**被「活著的英雄歸零」收掉 ——
 *   ⛔ **離 500 隻與 600 秒都很遠**。⇒ 它的 p99 是「出貨平常一場」的成本，⛔ 不是 500 隻的成本。
 * · **飽和**（`saturate: true`）：每 tick 結束後用**出貨的同一扇門**（`spawnMob`，
 *   與 `runRound11Event` 的 normal/special 同一支）把存活數補到**那一刻**的上限
 *   （`world.mobRules.maxAlivePerZone`，漸進由出貨的 `clampRound11AliveCap` 寫），
 *   並把英雄血量維持在滿（⛔ 否則回合在 500 隻出現前就被團滅收掉）。
 *   ⇒ ⭐ 這才是票要的「配置上限 500 隻＋完整回合時長」的**最壞情況**。
 *   ⚠️ 它是**負載剖面**，⛔ 不是遊戲裡會自然發生的一場 —— 報告要標出來。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import type { EntityId } from "@ggd/shared/ids";
import { TICK_HZ } from "@ggd/shared/constants";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { isMobAlive, mobsAliveInZone, spawnMob } from "@ggd/shared/sim/mobs";
import type { ConfigArenaRulesDoc } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";
import type { PhaseConfig } from "./PhaseMachine";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** ⭐ 出貨的賽制規則（⛔ 不自己造一份）。 */
export function shippedArenaRules(): ArenaRules {
  const doc = JSON.parse(
    readFileSync(join(REPO, "content/config/arena-rules.json"), "utf8"),
  ) as ConfigArenaRulesDoc;
  return rulesFromDoc(doc);
}

/** 前十回合的時序縮短 —— ⚠️ 第十一回合的長度不吃這一份（見檔頭）。 */
export const STRESS_FAST_PHASES: PhaseConfig = {
  champSelectTicks: 2,
  intermissionTicks: 3,
  combatMaxTicks: 20,
  resolutionTicks: 2,
};

export const stressSeats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

export interface Round11StressOptions {
  seed?: number;
  /** ⭐ 飽和負載（見檔頭）。 */
  saturate?: boolean;
  /**
   * ⭐ 模擬到第幾秒時把**全部英雄打死**，讓回合走出貨的「活著的英雄歸零」出口結束。
   * ⚠️ 只給 vitest 用（把「清場」的前提 —— 場上滿載 —— 在 600 秒之前就湊齊）；
   * 腳本⛔ 不傳（它要跑完整時長）。
   */
  wipeAtSec?: number;
  /** 比賽結束後再空跑幾個 tick 看有沒有東西還在動。 */
  lingerTicks?: number;
}

export interface Round11StressRun {
  saturate: boolean;
  /** 第十一回合是第幾回合（出貨 = finalRound + 1）。 */
  round: number;
  /** 第十一回合跑了幾個 tick（⚠️ 殭屍王進場會延長回合，⛔ 不一定等於 durationSec × TICK_HZ）。 */
  ticks: number;
  /** ⭐ 每 tick 的成本（ms），長度 = `ticks`。 */
  costsMs: Float64Array;
  /** 出貨上限（`round11.maxAliveZombies`）—— ⭐ 報告的分母。 */
  configuredCap: number;
  /** 整回合觀察到的**最多同時存活**（出貨的 `mobsAliveInZone`，含王）。 */
  peakAlive: number;
  peakAtSec: number;
  /** ⭐ 一般＋特殊殭屍超過**那一刻**上限的 tick 數（出貨兩扇生怪門都該擋住 ⇒ 應為 0）。 */
  capBreaches: number;
  /** 含王的總數超過上限的 tick 數（⚠️ 王走自己的門、吃每回合配額，⛔ 不吃存活上限 —— 資訊用）。 */
  overCapWithBossTicks: number;
  /** 回合中死掉的殭屍數。 */
  mobDeaths: number;
  /** ⛔ 死了卻在那一 tick 結束後還留在 `world.mob` / `world.transform` / `world.health` 的。 */
  corpsesLeaked: number;
  /** 每一 tick 結束時 `world.mob` 裡**不是活的**列數加總（應為 0）。 */
  deadRowsInMobTable: number;
  /** 回合中 `round11EventUnhandled` 的次數（出貨表的 `reviveCircle` 沒有處理器，刻意出聲）。 */
  unhandledEvents: number;
  /** 逐秒取樣。 */
  perSecond: Array<{ sec: number; alive: number; cap: number; entities: number }>;
  /** 最後一個 combat tick 結束時的殭屍表大小（⭐ 清場斷言的非空前提）。 */
  mobsAtLastCombatTick: number;
  /** 進第十一回合那一刻的 `world.transform.size`。 */
  entitiesAtEntry: number;
  after: {
    phase: string;
    mobTable: number;
    mobRulesArmed: boolean;
    mobTicks: number;
    mobZones: number;
    bossSpawnsThisRound: number;
    entities: number;
    /** ⚠️ 換邊帳本 —— 刻意**不**在比賽結束時清（重連要恢復「王／旁觀」、結算分數讀它），見報告。 */
    possessions: number;
    /** 比賽結束之後再跑 `lingerTicks` 個 tick，期間發出的 `round11Bombardment` 數。 */
    bombardmentsAfterEnd: number;
  };
  /** heapUsed（bytes）：進第十一回合時 / 比賽結束後。有 `global.gc` 時先 GC。 */
  heapBeforeBytes: number;
  heapAfterBytes: number;
}

function heap(): number {
  const g = (globalThis as { gc?: () => void }).gc;
  if (g) g();
  return process.memoryUsage().heapUsed;
}

/** ⭐ 出貨設定開一場、餵滿王擊殺門檻、跑到第十一回合開打。 */
export function enterRound11(seed = 7): { ctl: MatchController; rules: ArenaRules } {
  const rules = shippedArenaRules();
  const ctl = new MatchController("r11-stress", seed, stressSeats(), STRESS_FAST_PHASES, undefined, rules);
  for (let i = 1; i <= rules.round11.triggerBossKills; i++) recordBossKill(ctl.round11BossKillsForTest, i);
  const target = rules.finalRound + 1;
  let guard = 0;
  while (!(ctl.phase.round === target && ctl.phase.phase === "combat") && guard++ < 200_000) {
    if (ctl.phase.phase === "matchEnd") break;
    ctl.tick();
  }
  if (!(ctl.phase.round === target && ctl.phase.phase === "combat")) {
    throw new Error(
      `沒有進到第十一回合（停在 round ${ctl.phase.round} / ${ctl.phase.phase}）—— ⛔ 量尺沒有被測物，這一場的數字全部作廢`,
    );
  }
  return { ctl, rules };
}

function heroIds(ctl: MatchController): EntityId[] {
  const out: EntityId[] = [];
  for (const [, seat] of ctl.seats) if (seat.entityId !== null) out.push(seat.entityId);
  return out;
}

/** ⭐ 跑完一整個出貨的第十一回合，逐 tick 記下量尺要的東西。 */
export function runRound11Stress(opts: Round11StressOptions = {}): Round11StressRun {
  const { ctl, rules } = enterRound11(opts.seed);
  const w = ctl.world;
  const round = ctl.phase.round;
  const saturate = opts.saturate === true;
  const heroes = heroIds(ctl);
  const heapBeforeBytes = heap();
  const entitiesAtEntry = w.transform.size;

  const costs: number[] = [];
  const perSecond: Round11StressRun["perSecond"] = [];
  let peakAlive = 0;
  let peakAtSec = 0;
  let capBreaches = 0;
  let overCapWithBossTicks = 0;
  let mobDeaths = 0;
  let corpsesLeaked = 0;
  let deadRowsInMobTable = 0;
  let unhandledEvents = 0;
  let mobsAtLastCombatTick = 0;
  let wiped = false;

  while (ctl.phase.round === round && ctl.phase.phase === "combat" && costs.length < 200_000) {
    const sec = costs.length / TICK_HZ;
    if (opts.wipeAtSec !== undefined && !wiped && sec >= opts.wipeAtSec) {
      wiped = true;
      for (const id of heroes) {
        const hp = w.health.get(id);
        if (hp) {
          hp.hp = 0;
          hp.alive = false;
        }
      }
    } else if (saturate && !wiped) {
      for (const id of heroes) {
        const hp = w.health.get(id);
        if (hp?.alive) hp.hp = hp.maxHp;
      }
    }

    // 死亡回收要知道「這一 tick 開始時誰是殭屍」—— 屍體在同一 tick 的 slot 9g 就被收走。
    const mobsBefore = new Set<EntityId>(w.mob.keys());
    const t0 = performance.now();
    ctl.tick();
    costs.push(performance.now() - t0);

    for (const ev of w.events) {
      if (ev.type === "round11EventUnhandled") unhandledEvents++;
      if (ev.type !== "death" || !mobsBefore.has(ev.data.id as EntityId)) continue;
      mobDeaths++;
      const id = ev.data.id as EntityId;
      if (w.mob.has(id) || w.transform.has(id) || w.health.has(id)) corpsesLeaked++;
    }
    if (!(ctl.phase.round === round && ctl.phase.phase === "combat")) break;

    const zone = [...w.mobZones].sort((a, b) => a - b)[0];
    const rulesNow = w.mobRules;
    if (saturate && !wiped && zone !== undefined && rulesNow) {
      // ⭐ 出貨的同一扇門（`runRound11Event` normal/special 用的那一支），⛔ 不另寫生怪器。
      // ⚠️ `i <= cap`：一隻生下來就不算活的（0 血設定）時⛔ 不可以變成無窮迴圈。
      const capNow = rulesNow.maxAlivePerZone;
      for (let i = 0; i <= capNow && mobsAliveInZone(w, zone) < capNow; i++) {
        spawnMob(w, zone, rulesNow, w.tick, i);
      }
    }

    let alive = 0;
    let bosses = 0;
    for (const [id, m] of w.mob) {
      if (!isMobAlive(w, id)) {
        deadRowsInMobTable++;
        continue;
      }
      if (m.zone !== zone) continue;
      alive++;
      if (m.kind === "boss") bosses++;
    }
    const cap = rulesNow?.maxAlivePerZone ?? 0;
    if (alive - bosses > cap) capBreaches++;
    if (alive > cap) overCapWithBossTicks++;
    if (alive > peakAlive) {
      peakAlive = alive;
      peakAtSec = Math.round(sec);
    }
    if (costs.length % TICK_HZ === 0) {
      perSecond.push({ sec: Math.round(costs.length / TICK_HZ), alive, cap, entities: w.transform.size });
    }
    mobsAtLastCombatTick = w.mob.size;
  }

  const phaseAtLeave = ctl.phase.phase;
  let guard = 0;
  while (ctl.phase.phase !== "matchEnd" && guard++ < 10_000) ctl.tick();
  let bombardmentsAfterEnd = 0;
  for (let i = 0; i < (opts.lingerTicks ?? TICK_HZ * 3); i++) {
    ctl.tick();
    bombardmentsAfterEnd += w.events.filter((e) => e.type === "round11Bombardment").length;
  }

  return {
    saturate,
    round,
    ticks: costs.length,
    costsMs: Float64Array.from(costs),
    configuredCap: rules.round11.maxAliveZombies,
    peakAlive,
    peakAtSec,
    capBreaches,
    overCapWithBossTicks,
    mobDeaths,
    corpsesLeaked,
    deadRowsInMobTable,
    unhandledEvents,
    perSecond,
    mobsAtLastCombatTick,
    entitiesAtEntry,
    after: {
      phase: `${phaseAtLeave}→${ctl.phase.phase}`,
      mobTable: w.mob.size,
      mobRulesArmed: w.mobRules !== null,
      mobTicks: w.mobTicks,
      mobZones: w.mobZones.size,
      bossSpawnsThisRound: w.bossSpawnsThisRound.size,
      entities: w.transform.size,
      possessions: ctl.round11PossessionsForTest.size,
      bombardmentsAfterEnd,
    },
    heapBeforeBytes,
    heapAfterBytes: heap(),
  };
}

/** p 百分位（nearest-rank，與 `tickHealth.ts` 同一個定義）。 */
export function percentileMs(costs: Float64Array, p: number): number {
  if (costs.length === 0) return 0;
  const sorted = Float64Array.from(costs).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
