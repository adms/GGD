/**
 * 🧟 第十一回合 500 隻壓力量測（GH#1196 H⑤）—— **獨立腳本**，⛔ 不是 vitest。
 *
 *   cd apps/game-server && NODE_OPTIONS=--expose-gc ./node_modules/.bin/tsx scripts/round11-stress.ts
 *     [--skeleton] [--seed N] [--json out.json] [--only natural|saturated]
 *
 * 跑**兩種負載**（定義在 `src/match/round11StressHarness.ts` 檔頭，⛔ 不要混著讀）：
 *   · natural   —— 出貨的生怪門自己生（一場平常的第十一回合）
 *   · saturated —— 每 tick 補到那一刻的上限、英雄不死 ⇒ 「500 隻＋完整時長」的最壞情況
 * 每一種印：tick p50/p95/p99/max、峰值存活數（⭐ 有沒有真的到上限 —— 分母）、
 * 逐 30 秒的存活／上限／實體數、heapUsed 前後差、比賽結束後的清場狀態。
 *
 * ⭐ 為什麼⛔ 不寫成 vitest 硬斷言：4 vCPU 的 CI 在 `pnpm -r` 下量到 11.6× 超額訂閱（GH#1014），
 *   p99 會因為**別的包在搶核**而翻倍 ⇒ 一條會因負載紅的斷言是假紅。
 *   ⇒ 機制（上限／回收／清場）住 `src/match/round11Stress.test.ts`；數字住這裡。
 *
 * 🔀 門檻（只有 CI／作者會轉 ⇒ 環境變數，⛔ 不進後台）：
 *   `GGD_R11_STRESS_P99_MS`  預設 = `TICK_MS`（一個 sim tick 的牆鐘預算）
 *   ⭐ 閘只看 **saturated** 的 p99（最壞情況過了，平常一場必過）；超過 ⇒ exit 1。
 *   沒進到第十一回合 ⇒ exit 2（量尺沒有被測物）。
 *
 * ⚠️ 預設**載入出貨內容**（真的英雄、技能、殭屍身體）—— ⛔ 骨架英雄的 tick 成本不代表出貨。
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { availableParallelism, cpus, totalmem } from "node:os";
import { TICK_HZ, TICK_MS } from "@ggd/shared/constants";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { percentileMs, runRound11Stress, type Round11StressRun } from "../src/match/round11StressHarness";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const skeleton = argv.includes("--skeleton");
const jsonOut = flag("--json");
const seed = Number(flag("--seed") ?? 7);
const only = flag("--only");

const envP99 = Number(process.env.GGD_R11_STRESS_P99_MS);
const P99_GATE_MS = Number.isFinite(envP99) && envP99 > 0 ? envP99 : TICK_MS;

const mb = (b: number): number => +(b / 1048576).toFixed(1);
const ms = (v: number): number => +v.toFixed(3);

function summarise(run: Round11StressRun, wallSec: number) {
  const c = run.costsMs;
  return {
    profile: run.saturate ? "saturated" : "natural",
    round: run.round,
    round11Ticks: run.ticks,
    round11Sec: +(run.ticks / TICK_HZ).toFixed(1),
    wallSec: +wallSec.toFixed(1),
    tickCostMs: {
      p50: ms(percentileMs(c, 50)),
      p95: ms(percentileMs(c, 95)),
      p99: ms(percentileMs(c, 99)),
      max: ms(c.reduce((m, v) => (v > m ? v : m), 0)),
    },
    ticksOverBudget: c.reduce((n, v) => (v > TICK_MS ? n + 1 : n), 0),
    // ⭐ 最慢的 5 個 tick 落在第幾秒 —— 開場 JIT／GC 與穩態成本要分得開，⛔ 不要只看一個 max。
    slowestTicks: Array.from(c.keys())
      .sort((a, b) => c[b]! - c[a]!)
      .slice(0, 5)
      .map((i) => ({ atSec: +(i / TICK_HZ).toFixed(2), ms: ms(c[i]!) })),
    peakAlive: run.peakAlive,
    peakAtSec: run.peakAtSec,
    configuredCap: run.configuredCap,
    reachedConfiguredCap: run.peakAlive >= run.configuredCap,
    capBreaches: run.capBreaches,
    overCapWithBossTicks: run.overCapWithBossTicks,
    mobDeaths: run.mobDeaths,
    corpsesLeaked: run.corpsesLeaked,
    deadRowsInMobTable: run.deadRowsInMobTable,
    unhandledEvents: run.unhandledEvents,
    entitiesAtEntry: run.entitiesAtEntry,
    after: run.after,
    heapBeforeMb: mb(run.heapBeforeBytes),
    heapAfterMb: mb(run.heapAfterBytes),
    heapDeltaMb: mb(run.heapAfterBytes - run.heapBeforeBytes),
    every30s: run.perSecond.filter((s) => s.sec % 30 === 0),
  };
}

function print(s: ReturnType<typeof summarise>): void {
  const t = s.tickCostMs;
  console.log(`\n── ${s.profile} ──`);
  console.log(`  回合 ${s.round} · ${s.round11Ticks} ticks（${s.round11Sec}s 模擬）· 牆鐘 ${s.wallSec}s`);
  console.log(`  tick 成本 p50 ${t.p50} · p95 ${t.p95} · p99 ${t.p99} · max ${t.max} ms（預算 ${TICK_MS.toFixed(1)}，超過 ${s.ticksOverBudget} 個）`);
  console.log(`  最慢 5 tick ${s.slowestTicks.map((x) => `${x.ms}ms@${x.atSec}s`).join(" · ")}`);
  console.log(
    `  峰值存活 ${s.peakAlive} / 上限 ${s.configuredCap}（第 ${s.peakAtSec}s）⇒ ` +
      (s.reachedConfiguredCap ? "⭐ 有到上限" : "⛔ 沒有到上限 —— 這一段的 p99 ⛔ 不是上限隻數的成本"),
  );
  console.log(`  一般＋特殊超上限 ${s.capBreaches} tick · 含王超上限 ${s.overCapWithBossTicks} tick · 殭屍死亡 ${s.mobDeaths} · 屍體洩漏 ${s.corpsesLeaked} · 死列 ${s.deadRowsInMobTable} · 未處理事件 ${s.unhandledEvents}`);
  console.log(`  實體 進場 ${s.entitiesAtEntry} → 結束 ${s.after.entities} · heap ${s.heapBeforeMb} → ${s.heapAfterMb} MB（Δ ${s.heapDeltaMb}）`);
  console.log(`  結束後 ${JSON.stringify(s.after)}`);
  for (const p of s.every30s) {
    console.log(`    t=${String(p.sec).padStart(4)}s  alive ${String(p.alive).padStart(3)} / cap ${String(p.cap).padStart(3)}  entities ${p.entities}`);
  }
}

async function main(): Promise<number> {
  if (!skeleton) {
    const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  }
  const header = {
    machine: { cpu: cpus()[0]?.model ?? "?", parallelism: availableParallelism(), totalMemGb: +(totalmem() / 2 ** 30).toFixed(1) },
    node: process.version,
    heroes: skeleton ? "skeleton" : "shipped content",
    seed,
    gcBeforeHeapSample: typeof (globalThis as { gc?: unknown }).gc === "function",
    budgetMs: ms(TICK_MS),
    p99GateMs: ms(P99_GATE_MS),
  };
  console.log(`🧟 第十一回合壓力量測 ${JSON.stringify(header)}`);
  if (!header.gcBeforeHeapSample) console.log("  ⚠️ 沒有 --expose-gc ⇒ 記憶體差含未回收垃圾");

  const profiles = (only ? [only] : ["natural", "saturated"]) as Array<"natural" | "saturated">;
  const results: Array<ReturnType<typeof summarise>> = [];
  for (const p of profiles) {
    const wall0 = Date.now();
    let run: Round11StressRun;
    try {
      run = runRound11Stress({ seed, saturate: p === "saturated" });
    } catch (e) {
      console.error(`❌ ${(e as Error).message}`);
      return 2;
    }
    const s = summarise(run, (Date.now() - wall0) / 1000);
    print(s);
    results.push(s);
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...header, results }, null, 2));

  const gated = results.find((r) => r.profile === "saturated");
  if (!gated) {
    console.log("\n⚠️ 沒有跑 saturated ⇒ 沒有閘（--only natural 只給診斷用）");
    return 0;
  }
  if (gated.tickCostMs.p99 > P99_GATE_MS) {
    console.error(`\n❌ saturated p99 ${gated.tickCostMs.p99} ms > 門檻 ${ms(P99_GATE_MS)} ms（GGD_R11_STRESS_P99_MS）`);
    return 1;
  }
  console.log(`\n✅ saturated p99 ${gated.tickCostMs.p99} ms ≤ 門檻 ${ms(P99_GATE_MS)} ms`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
