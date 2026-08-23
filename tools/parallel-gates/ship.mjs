#!/usr/bin/env node
/**
 * 🚢 **出貨四閘,一支指令** —— `pnpm ship:check`
 *
 * > owner 2026-08-23：「跑太久了吧 已經超過一小時 **改一個小地方 上線成本這麼高**」
 * > ＋「根據**排隊理論,最慢又不可平行分拆的任務要不要盡可能最先做**」
 * > ＋「**你要記錄一下各單元到底花多少時間做什麼**」
 * > ＋（看到我手打那一串 `( … ) &` 之後）「**這些應該是自動化 script 跑吧？**」
 *
 * ⭐ 最後那一句是這支檔存在的理由：在此之前那是**一行手打的 shell**,
 * 而手打的東西下一次會忘記、會漏一個 suite、會忘記不 fail-fast。
 *
 * ── 形狀（⛔ 不是「全部丟出去」）───────────────────────────────────────
 *
 *   ① **序列段（全域鎖,不可分拆）**  content:build → skills:sync
 *      ⛔ 它們寫 `bundle.json`,全域只能有一條在跑。而且 `contract:numbers`
 *         **必須在 `content:build` 之後** —— 單獨跑會得到「產生器說 OK 但 --check 說 stale」。
 *      ⭐ 排隊理論：最長又不可平行的先跑,它的長度就是整條路的下界。
 *
 *   ② **並行段**  skills:check（自己再並行 36 支,LPT）· typecheck · 每一包 vitest
 *      ⛔ **不 fail-fast** —— 一次撈全部的錯（第零守則：紅了以後不要「跑一次改一個」）。
 *
 * ⚠️ **⛔ 這支不會削弱任何既有的閘。** 它只改變「誰跟誰同時跑」,
 *    每一支閘的指令、判準、離開碼逐字不動。08-01／08-02 兩次「全綠而線上掛掉」
 *    的教訓是**閘不夠**,⛔ 不是閘太多。
 *
 * 用法:
 *   pnpm ship:check          # ①＋②(預設)
 *   pnpm ship:check --no-sync   # 只跑 ② (內容沒動過時)
 *   pnpm ship:check --only-sync # 只跑 ①
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { packagesWithVitest } from "./packages.mjs";
import { appendStage } from "../deploy-timing/run.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = new URL("../../", import.meta.url).pathname;

const argv = process.argv.slice(2);
const noSync = argv.includes("--no-sync");
const onlySync = argv.includes("--only-sync");

/**
 * 每一包 vitest 分到幾個 fork。⭐ 從**核數**與**同時在跑幾包**推導,
 * ⛔ 不是抄各自 config 裡的 16（那個數字是「單獨跑這一包」時才對）。
 */
const SUITE_COUNT = packagesWithVitest(REPO).length;
const SHIP_LIMIT = Number(process.env.GGD_SHIP_CONCURRENCY ?? Math.max(2, cpus().length - 2));
/**
 * ⭐ **兩倍超訂**（`cpus × 2 ÷ 包數`），⛔ 不是 `cpus ÷ 包數`。
 *
 * 三個量到的點（2026-08-23，18 核）決定了這個係數：
 *   · **不設限**（每包照自己 config 的 16）⇒ 112 fork 搶 18 核 ⇒ 並行段 wall **218.8s**，
 *     ⛔ 但 `mobWavesSave` 從 885ms 飄到 **5472ms** 撞破 5 秒額度
 *   · **`cpus ÷ 包數 = 2`** ⇒ 逐包序列化，`packages/shared` 光自己就要 ≈730 CPU-秒 ÷ 2
 *     ⇒ 並行段會**比不設限還久**
 *   · ⇒ **×2 超訂 = 每包 5** —— vitest 的 fork 多數時間在等 I/O 與 transform，
 *     超訂拿得到吞吐，而 5 × 7 = 35 個 fork 對 18 核不會把單條測試餓到破額度
 *
 * ⛔ 覆寫 `minForks` 是必要的：各包 config 寫 `minForks: 4`，而
 * `min > max` 會讓 vitest 直接 `RangeError` 收工（⛔ 不是慢，是一條測試都不跑）。
 */
const FORKS_PER_SUITE = Math.max(
  4,
  Math.floor((cpus().length * 2) / Math.max(1, Math.min(SHIP_LIMIT, SUITE_COUNT))),
);

/** 序列段:全域鎖。⛔ 順序有意義（`contract:numbers` 在 `content:build` 之後）。 */
const SERIAL = ["content:build", "skills:sync"];

/**
 * 並行段。⭐ 每一格是「一件會回非零的事」,⛔ 不是「一個資料夾」。
 * `skills:check` 走 run.mjs（它自己再 LPT 並行 36 支）。
 */
const PARALLEL = [
  { name: "skills:check", cmd: ["node", [`${HERE}run.mjs`, "skills:check"]] },
  { name: "typecheck", cmd: ["pnpm", ["typecheck"]] },
  ...packagesWithVitest(REPO).map((r) => ({
    name: `vitest ${r}`,
    // ⛔⛔ **分核預算,⛔ 不是「每一包都開 16 forks」。**
    //
    // ⚠️ 這是我這支腳本第一版的真缺陷（2026-08-23 當場量到）：
    // 7 包 vitest 同時跑,每一包照自己 config 的 `maxForks: 16`
    // ⇒ **112 個 fork 搶 N 顆核** ⇒ `mobWavesSave.test.ts` 從單獨跑的
    // **885ms** 飄到 **5472ms** 而撞破 5 秒額度。
    //
    // ⛔ 那時候**最不該做的事是調高那一條的 timeout** —— 那會把「機器很忙」
    // 永久靜音,而下一個真的變慢的東西就再也沒有人會發現。
    // ⭐ 正解是讓並行段**自己知道它切了幾刀**：核數 ÷ 同時在跑的包數。
    cmd: ["npx", ["vitest", "run", "--root", r, "--poolOptions.forks.maxForks", String(FORKS_PER_SUITE),
      "--poolOptions.forks.minForks", "1"]],
  })),
];

const LOGDIR = process.env.GGD_SHIP_LOGDIR ?? "/private/tmp/ggd-ship";
mkdirSync(LOGDIR, { recursive: true });

function run(name, bin, args) {
  return new Promise((res) => {
    const t = Date.now();
    const log = `${LOGDIR}/${name.replace(/[^a-z0-9]+/gi, "_")}.log`;
    const out = [];
    const p = spawn(bin, args, { cwd: REPO, env: process.env });
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => out.push(d));
    p.on("close", (code) => {
      writeFileSync(log, Buffer.concat(out));
      res({ name, code: code ?? 1, ms: Date.now() - t, log });
    });
  });
}

const results = [];
const T0 = Date.now();

// ── ① 序列段 ───────────────────────────────────────────────────────────
if (!noSync) {
  for (const s of SERIAL) {
    process.stdout.write(`🔒 ${s} …`);
    const r = await run(s, "pnpm", [s]);
    results.push({ ...r, phase: "serial" });
    process.stdout.write(` ${(r.ms / 1000).toFixed(1)}s ${r.code === 0 ? "✓" : "✗"}\n`);
    // ⛔ 序列段紅了就停:下游全部會拿到過期的產物,再跑只是製造誤導的紅燈。
    if (r.code !== 0) {
      console.error(`\n⛔ ${s} 失敗（全域鎖那一段）—— 後面不跑了,因為產物是過期的。`);
      console.error(`   log: ${r.log}`);
      process.exit(1);
    }
  }
}

// ── ② 並行段 ───────────────────────────────────────────────────────────
if (!onlySync) {
  const limit = SHIP_LIMIT;
  console.log(
    `⚡ 並行段 ${PARALLEL.length} 支 · 上限 ${limit} · 每包 ${FORKS_PER_SUITE} forks（${cpus().length} 核 ÷ ${SUITE_COUNT} 包）· ⛔ 不 fail-fast`,
  );
  const queue = [...PARALLEL];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const r = await run(job.name, job.cmd[0], job.cmd[1]);
      results.push({ ...r, phase: "parallel" });
      process.stdout.write(`   ${r.code === 0 ? "✓" : "✗"} ${job.name} ${(r.ms / 1000).toFixed(1)}s\n`);
    }
  });
  await Promise.all(workers);
}

// ── 帳本 ───────────────────────────────────────────────────────────────
// ⭐ 寫進**同一份** `docs/_data/deploy-timings.json`,用 `tools/deploy-timing`
//    的 `ggd-deploy-timings@1` schema —— ⛔ 不是自己再開一份。
// ⚠️ 我第一版真的自己寫了一份同名不同義的帳本（第〇·四守則的反例：
//    同一份知識兩個住處,之後各自漂）。
const wall = (Date.now() - T0) / 1000;
const serialMs = results.filter((r) => r.phase === "serial").reduce((s, r) => s + r.ms, 0);
const parMs = results.filter((r) => r.phase === "parallel").reduce((s, r) => s + r.ms, 0);
for (const r of results) appendStage(`ship:${r.name}`, r.ms, r.code, { phase: r.phase });
appendStage("ship:total", Math.round(wall * 1000), results.some((r) => r.code !== 0) ? 1 : 0, {
  phase: "summary",
  serialSec: Number((serialMs / 1000).toFixed(1)),
  parallelCpuSec: Number((parMs / 1000).toFixed(1)),
  forksPerSuite: FORKS_PER_SUITE,
});

const failed = results.filter((r) => r.code !== 0);
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
console.log(
  `\n🚢 出貨四閘 —— wall ${wall.toFixed(1)}s` +
    (noSync ? "" : ` （其中全域鎖 ${(serialMs / 1000).toFixed(1)}s **不可分拆**）`) +
    `\n   並行段累計 CPU ${(parMs / 1000).toFixed(1)}s ⇒ 平行度 ${(parMs / 1000 / Math.max(0.001, wall - serialMs / 1000)).toFixed(1)}×` +
    `\n   最慢五支: ${slowest.map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(" · ")}` +
    `\n   ⭐ 時間帳本: docs/_data/deploy-timings.json（與 tools/deploy-timing 同一份）`,
);

if (failed.length === 0) {
  console.log("\n✅ 四閘全綠。");
  process.exit(0);
}
// ⭐ 一次列完（⛔ 不是「修一個再跑一次」）—— 而且指名 log 檔,不截斷。
console.error(`\n⛔ ${failed.length} 支紅了 —— ⭐ 一次列完:`);
for (const f of failed) console.error(`   ✗ ${f.name}（exit ${f.code}） → ${f.log}`);
process.exit(1);
