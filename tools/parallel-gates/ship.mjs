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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";
import { packagesWithVitest } from "./packages.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = new URL("../../", import.meta.url).pathname;
const LEDGER = `${REPO}docs/_data/deploy-timings.json`;

const argv = process.argv.slice(2);
const noSync = argv.includes("--no-sync");
const onlySync = argv.includes("--only-sync");

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
    cmd: ["npx", ["vitest", "run", "--root", r]],
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
  const limit = Number(process.env.GGD_SHIP_CONCURRENCY ?? Math.max(2, cpus().length - 2));
  console.log(`⚡ 並行段 ${PARALLEL.length} 支 · 上限 ${limit} · ⛔ 不 fail-fast`);
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
const wall = (Date.now() - T0) / 1000;
const serialMs = results.filter((r) => r.phase === "serial").reduce((s, r) => s + r.ms, 0);
const parMs = results.filter((r) => r.phase === "parallel").reduce((s, r) => s + r.ms, 0);
mkdirSync(dirname(LEDGER), { recursive: true });
const prev = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { runs: [] };
prev.runs = [
  ...(prev.runs ?? []),
  {
    wallSec: Number(wall.toFixed(1)),
    serialSec: Number((serialMs / 1000).toFixed(1)),
    parallelCpuSec: Number((parMs / 1000).toFixed(1)),
    steps: results.map((r) => ({ name: r.name, sec: Number((r.ms / 1000).toFixed(1)), code: r.code })),
  },
].slice(-60);
writeFileSync(LEDGER, `${JSON.stringify(prev, null, 2)}\n`);

const failed = results.filter((r) => r.code !== 0);
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
console.log(
  `\n🚢 出貨四閘 —— wall ${wall.toFixed(1)}s` +
    (noSync ? "" : ` （其中全域鎖 ${(serialMs / 1000).toFixed(1)}s **不可分拆**）`) +
    `\n   並行段累計 CPU ${(parMs / 1000).toFixed(1)}s ⇒ 平行度 ${(parMs / 1000 / Math.max(0.001, wall - serialMs / 1000)).toFixed(1)}×` +
    `\n   最慢五支: ${slowest.map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(" · ")}` +
    `\n   ⭐ 時間帳本: docs/_data/deploy-timings.json`,
);

if (failed.length === 0) {
  console.log("\n✅ 四閘全綠。");
  process.exit(0);
}
// ⭐ 一次列完（⛔ 不是「修一個再跑一次」）—— 而且指名 log 檔,不截斷。
console.error(`\n⛔ ${failed.length} 支紅了 —— ⭐ 一次列完:`);
for (const f of failed) console.error(`   ✗ ${f.name}（exit ${f.code}） → ${f.log}`);
process.exit(1);
