#!/usr/bin/env node
/**
 * ⭐ **把串行的閘壓成多核並行**（owner 2026-08-23：「我的本地端機器是 M5 Max 128G
 * 非常高效能，請你盡量**壓榨多執行緒跟記憶體**在本地端最大加速完成任務」）。
 *
 * ── 為什麼這支存在（量到的，⛔ 不是感覺）──────────────────────────────────
 * `package.json` 的 `skills:check` 是 **36 支用 `&&` 串起來的唯讀檢查**。
 * 實測**串行 36 秒**，而這台機器有 **18 核** ⇒ 17 格閒置。
 * ⭐ 它們全部是 `--check`（**唯讀**、逐位元組比對），彼此零寫入衝突
 * ⇒ 並行是**安全的**，⛔ 不是「賭它應該沒事」。
 *
 * ── ⛔⛔ 它**只跑 check**，⛔ 不跑 sync（sync 走 `sync.mjs`）────────────────
 * `skills:sync` 有**真的順序相依** —— CLAUDE.md 逐字記著
 * 「`contract:numbers` 必須在 `content:build` **之後**跑，單獨跑會得到
 *  『產生器說 OK 但 `--check` 說 stale』」。⇒ 把 32 支一起丟出去會**壞掉而且看起來像對的**。
 * ⭐ 這支拒絕任何不是純 `pnpm a && pnpm b` 形狀的鏈（見下面那道閘）。
 *
 * ── ⛔ 不 fail-fast ───────────────────────────────────────────────────────
 * 一次跑完**全部**再回報。CLAUDE.md 第零守則逐字要求「**批次撈**錯誤」——
 * 「跑一次 → 修一個 → 再跑一次」量到過 **50 分鐘**的代價，而那些紅**合起來只有 1 個根因**。
 * 離開碼 = 有沒有任何一支紅（與串行版逐位元同義）。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const script = process.argv[2] ?? "skills:check";
const chain = pkg.scripts?.[script];
if (!chain) {
  console.error(`⛔ package.json 沒有 script "${script}"`);
  process.exit(2);
}

const steps = chain.split("&&").map((s) => s.trim().replace(/^pnpm\s+/, "")).filter(Boolean);
// ⭐ 這道閘擋的是「有人拿它去跑 `skills:sync`」——⛔ 那會踩到順序相依。
if (steps.some((s) => /[\s|><;&]/.test(s))) {
  console.error(
    `⛔ "${script}" 不是單純的 \`pnpm a && pnpm b\` 鏈 ⇒ ⛔ 不並行（怕改變語意）。\n` +
      `   ⭐ 特別是 \`skills:sync\`:它有真的順序相依（contract:numbers 必須在 content:build 之後）。\n` +
      `   ⇒ 它有**自己的**排程器(照量出來的相依圖跑,⛔ 不是把 32 支一起丟出去):\n` +
      `        node tools/parallel-gates/sync.mjs --plan   # 先看它想怎麼排\n` +
      `        node tools/parallel-gates/sync.mjs          # 真的跑(⚠️ 全域鎖)`,
  );
  process.exit(2);
}
if (steps.some((s) => !s.endsWith(":check") && !s.includes("check"))) {
  console.error(
    `⛔ "${script}" 裡有非 --check 的步驟 ⇒ ⛔ 不並行（這一支只排唯讀的閘）。\n` +
      `   ⭐ 寫入端(\`skills:sync\`)有**真的**順序相依,走它自己的排程器 ——\n` +
      `      它照**量出來的**相依圖跑,⛔ 不是把 32 支一起丟出去:\n` +
      `        node tools/parallel-gates/sync.mjs --plan   # 先看它想怎麼排\n` +
      `        node tools/parallel-gates/sync.mjs          # 真的跑(⚠️ 寫 bundle.json,全域鎖)`,
  );
  process.exit(2);
}

const LIMIT = Number(process.env.GGD_GATE_CONCURRENCY ?? Math.max(2, cpus().length - 2));

/**
 * ⭐ **時間帳本**（owner 2026-08-23：「你要**記錄一下各單元到底花多少時間做什麼**，
 * 並且分析如何減少時間，因為每次改版出貨真的都太久了」）。
 *
 * 它有**兩個**用途，而第二個是承重的：
 *   ① 給人看:哪一支在吃時間
 *   ② ⭐ **給排程器看** —— 見下面的 LPT。
 */
const LEDGER = new URL("../../docs/_data/gate-timings.json", import.meta.url).pathname;
/** @type {Record<string, number>} 上一次每一支花的毫秒。 */
let prior = {};
try {
  if (existsSync(LEDGER)) prior = JSON.parse(readFileSync(LEDGER, "utf8"))[script] ?? {};
} catch {
  prior = {};
}

/**
 * ⭐⭐ **LPT（Longest Processing Time first）** —— owner 2026-08-23 逐字：
 * 「根據**排隊理論**，**最慢又不可平行分拆的任務要不要盡可能最先做**」。⭐ 要。
 *
 * ── 為什麼它真的會贏 ──────────────────────────────────────────────────────
 * 這是經典的 P||Cmax（identical machines, makespan）。LPT 的近似比是
 * **4/3 − 1/(3m)** —— ⛔ 而**任意順序**沒有這個保證：把最慢的排最後，
 * 它會在所有人都收工之後才開始，於是 wall-clock ≈ 「其餘的平均」＋「最慢那一支」。
 * ⭐ 實測 `msgledger:check` 是 5.7 秒（最慢），而 36 支的累計 CPU 是 73.8 秒 ——
 * 把它排最後 ⇒ 下界從 5.7 秒變成 ~10 秒。
 *
 * ⚠️ **第一次跑沒有帳本** ⇒ 退回宣告順序（⛔ 不猜）。第二次起就是 LPT。
 */
const steps2 = [...steps].sort((a, b) => (prior[b] ?? 0) - (prior[a] ?? 0));
const usingLpt = Object.keys(prior).length > 0;

const t0 = Date.now();
const results = [];
let cursor = 0;
let done = 0;

function runOne(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn("pnpm", [name], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (out += String(d)));
    p.on("close", (code) => {
      results.push({ name, code: code ?? 1, ms: Date.now() - started, out });
      process.stderr.write(`  ${++done}/${steps.length}\r`);
      resolve();
    });
  });
}

async function worker() {
  while (cursor < steps2.length) await runOne(steps2[cursor++]);
}

await Promise.all(Array.from({ length: Math.min(LIMIT, steps.length) }, worker));

const failed = results.filter((r) => r.code !== 0);
const slowest = [...results].sort((a, b) => b.ms - a.ms);
const wall = (Date.now() - t0) / 1000;
const cpu = results.reduce((s, r) => s + r.ms, 0) / 1000;

// ⭐ 寫回帳本 —— 下一次的 LPT 用它排序,而它同時是 owner 要的「各單元花多少時間」。
try {
  mkdirSync(dirname(LEDGER), { recursive: true });
  const all = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  all[script] = Object.fromEntries(results.map((r) => [r.name, r.ms]));
  // ⛔ 刻意**沒有**時間戳:任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等,
  //    而這個檔進版控（同 `caps:export` 的理由,CLAUDE.md 記過）。
  writeFileSync(LEDGER, `${JSON.stringify(all, null, 2)}\n`, "utf8");
} catch (e) {
  console.error(`⚠️ 帳本寫不出去（⛔ 不影響閘的結論）: ${String(e)}`);
}

const idle = (LIMIT * wall - cpu).toFixed(1);
console.log(
  `\n⚡ ${script} —— ${steps2.length} 支 · 並行度 ${LIMIT} · 排程 ${usingLpt ? "LPT（最長優先）" : "宣告順序（⚠️ 首跑無帳本）"}\n` +
    `   wall ${wall.toFixed(1)}s · 累計 CPU ${cpu.toFixed(1)}s ⇒ **${(cpu / wall).toFixed(1)}× 平行度**` +
    ` · 閒置 ${idle}s（理論下界 = 最慢那一支 ${(slowest[0]?.ms ?? 0) / 1000}s）`,
);
console.log(`   最慢五支: ${slowest.slice(0, 5).map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(" · ")}`);
console.log(`   ⭐ 時間帳本: docs/_data/gate-timings.json`);

if (failed.length === 0) {
  console.log("✓ 全部通過");
  process.exit(0);
}
console.log(`\n⛔ ${failed.length} 支紅了 —— ⭐ 一次列完（⛔ 不是修一個再跑一次，第零守則）:\n`);
for (const f of failed) {
  console.log(`═══ ${f.name}（exit ${f.code}）`);
  console.log(f.out.split("\n").filter((l) => l.trim()).slice(-12).join("\n"));
  console.log();
}
process.exit(1);
