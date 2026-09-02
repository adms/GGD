#!/usr/bin/env node
/**
 * ⭐⭐ **`skills:sync` 的並行排程器** —— 照**量出來的**相依圖跑,⛔ 不是把 32 支一起丟出去。
 *
 * owner 2026-08-23:「skills:check 的 36 支唯讀檢查全並行、**sync 建一張相依圖
 * 只並行無依賴的那幾支**,⛔ 不是把 32 支一起丟出去」。
 *
 *   node tools/parallel-gates/sync.mjs --plan          # 只印排程,⛔ 不跑(先看它想做什麼)
 *   node tools/parallel-gates/sync.mjs --since HEAD~3  # ⭐ **只跑會過期的那幾支**(裁剪)
 *   node tools/parallel-gates/sync.mjs --since HEAD    # 同上,base = 工作樹 vs HEAD
 *   node tools/parallel-gates/sync.mjs --check-graph   # 閘:圖過期 or 已知那條邊消失 → 非零
 *   node tools/parallel-gates/sync.mjs                 # 真的跑
 *
 * ── ⛔ 兩道**會擋下你**的閘(⛔ 不是「要記得⋯」)────────────────────────────
 *  ① **圖過期**:`sync-io.json` 記著量測當下的整條 chain 字串。
 *     package.json 動了一個字(加第 33 支產生器、改順序)⇒ 對不上 ⇒ **拒跑**。
 *     ⭐ 這正是「手寫的表會過期而且不會有東西紅」的解藥。
 *  ② **已知那條邊**:CLAUDE.md 逐字記著「`contract:numbers` 必須在 `content:build`
 *     **之後**跑,單獨跑會得到『產生器說 OK 但 --check 說 stale』」。
 *     推導出來的圖如果**推不出這條邊**,代表推導本身壞了(探針失效、有人手改
 *     sync-io.json)⇒ **拒跑**。⭐ 突變驗證就打這一條。
 *
 * ── ⛔ 不 fail-fast,但**也不會**踩著壞掉的產物往下蓋 ────────────────────────
 * 紅了的那一支的**後代**跳過並列出來(它們的輸入是壞的);其餘照跑到底,
 * 最後**一次列完所有的錯**(第零守則:批次撈,⛔ 不是修一個再跑一次)。
 *
 * ⚠️ 這支會寫 `bundle.json` ⇒ CLAUDE.md 逐字:**全域只能有一條工作流跑它**。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";
import { buildGraph, layers, priorities, loadIo } from "./graph.mjs";
import { planFromPaths } from "./syncPlan.mjs";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const PLAN = argv.includes("--plan");
const CHECK = argv.includes("--check-graph");
/**
 * ⭐⭐ **裁剪** —— owner 2026-08-23:「**為什麼我要全跑 skills 產生器,即使我沒有做
 * 技能更動或小範圍更動也需要全跑嗎 可以用旗標註明是否有改動需要跑哪支就好？**」
 *
 * `--since <ref>` ⇒ 用 `syncPlan` 從 `git diff` 算出「這批改動真的會讓哪幾支過期」,
 * 其餘**當成已經是最新的**(⛔ 不是「跳過」——它們的產物本來就沒過期,
 * 下游要用它們的輸出,所以要標成 done ⛔ 不是 skipped)。
 *
 * ⛔⛔ **三道 fail-closed 全部往「多跑」倒**(`syncPlan` 自己實作,這裡只轉發):
 *   ① 改動路徑對不到任何產生器的輸入表 ⇒ 全跑
 *   ② `sync-io.json` 的 chain 跟 package.json 對不上 ⇒ 全跑
 *   ③ 探針全空的那幾支 ⇒ 一律跑
 * ⚠️ 而**裁掉了哪幾支一定要印出來** —— 一個靜默的上限讀起來會像「全部都跑過了」。
 */
const SINCE = argv.indexOf("--since") >= 0 ? (argv[argv.indexOf("--since") + 1] ?? "HEAD") : null;

const ROOT = new URL("../../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
const io = loadIo(new URL("./sync-io.json", import.meta.url).pathname);
const SCRIPT = io.script;

// ── 閘 ① 圖過期 ────────────────────────────────────────────────────────────
if (pkg.scripts?.[SCRIPT] !== io.chain) {
  console.error(
    `⛔ sync-io.json 過期 —— package.json 的 "${SCRIPT}" 跟量測當下**不一樣**。\n` +
      `   ⭐ 相依圖是**量出來的**,⛔ 不是手寫的 ⇒ chain 改了就要重量:\n` +
      `      cp -Rc <repo> /private/tmp/ggd-syncgraph-sandbox   # APFS clonefile,幾乎不佔空間\n` +
      `      node tools/parallel-gates/trace.mjs --out /private/tmp/p1.json\n` +
      `      (cd 沙盒 && git archive HEAD~60 content docs data | tar -x)\n` +
      `      node tools/parallel-gates/trace.mjs --out /private/tmp/p2.json\n` +
      `      node tools/parallel-gates/merge-io.mjs /private/tmp/p1.json /private/tmp/p2.json`,
  );
  process.exit(2);
}

const g = buildGraph(io);
const names = g.steps.map((s) => s.name);
const idx = (n) => names.indexOf(n);

// ── 閘 ② 已知那條邊(CLAUDE.md 逐字)────────────────────────────────────────
const A = idx("content:build");
const B = idx("contract:numbers");
const known = A >= 0 && B >= 0 && g.edges.some((e) => e.from === A && e.to === B);
if (!known) {
  console.error(
    `⛔ 推導出來的圖**推不出**已知的那條相依:content:build → contract:numbers。\n` +
      `   CLAUDE.md 逐字:「contract:numbers 必須在 content:build 之後跑,單獨跑會得到\n` +
      `   『產生器說 OK 但 --check 說 stale』」。⇒ 推導壞了(探針失效 or sync-io.json 被手改),\n` +
      `   ⛔ 這張圖不可信,拒絕用它排程。`,
  );
  process.exit(2);
}

const LEDGER = new URL("../../docs/_data/gate-timings.json", import.meta.url).pathname;
let prior = {};
try {
  if (existsSync(LEDGER)) prior = JSON.parse(readFileSync(LEDGER, "utf8"))[SCRIPT] ?? {};
} catch { prior = {}; }
const ms = Object.fromEntries(g.steps.map((s) => [s.name, prior[s.name] ?? s.ms ?? 1000]));

const prio = priorities(g, ms);
const L = layers(g);
const deps = g.steps.map(() => new Set());
for (const e of g.edges) deps[e.to].add(e.from);

const serial = g.steps.reduce((s, x) => s + ms[x.name], 0) / 1000;
const critical = Math.max(...prio) / 1000;

if (PLAN || CHECK) {
  console.log(`\n⭐ ${SCRIPT} 相依圖 —— ${g.steps.length} 支 · ${g.edges.length} 條邊 · ${L.length} 層`);
  console.log(`   ✅ 閘①圖與 package.json 一致 · ✅ 閘② content:build → contract:numbers 推導得到`);
  console.log(`   串行 ${serial.toFixed(1)}s ⇒ **理論下界(關鍵路徑)${critical.toFixed(1)}s**\n`);
  L.forEach((row, i) => {
    const w = row.reduce((s, v) => Math.max(s, ms[names[v]]), 0) / 1000;
    console.log(
      `   層 ${String(i).padStart(2)} (${String(row.length).padStart(2)} 支 · 最慢 ${w.toFixed(1)}s): ` +
        row.map((v) => names[v]).sort().join(" · "),
    );
  });
  const waw = g.edges.filter((e) => e.why === "write-after-write");
  const opq = g.edges.filter((e) => e.why === "opaque");
  console.log(`\n   邊的來源: 讀後寫 ${g.edges.length - waw.length - opq.length} · 寫後寫 ${waw.length} · 探針全空當柵欄 ${opq.length}`);
  console.log(`   ⭐ 已知那條: ${g.edges.filter((e) => e.from === A && e.to === B).map((e) => `${e.why} @ ${e.file}`)[0]}`);
  if (CHECK) process.exit(0);
  console.log(`\n   ⛔ --plan ⇒ 不執行。拿掉 --plan 才會真的跑(⚠️ 它寫 bundle.json,全域鎖)。`);
  process.exit(0);
}

// ── ⭐ 裁剪(--since)────────────────────────────────────────────────────────
/** 這一輪**當成已經最新**的那幾支（⛔ 空集合 = 全跑）。 */
// 🔒 產物隔離區(owner 2026-08-24「發生上百次…只能靠產生器去操作修改」):
//    產物平時 chmod 444,產生器執行期間解鎖、收工重新上鎖 —— genguard hook 看不見的
//    python/node 檔案 API 直寫從此吃 PermissionError。scripts/product-quarantine.sh。
import { execFileSync as _qx } from "node:child_process";
const _quarantine = (mode) => {
  try { _qx("bash", ["scripts/product-quarantine.sh", mode], { cwd: ROOT, stdio: "inherit" }); }
  catch (e) { console.error(`⚠️ 隔離區 ${mode} 失敗(不擋 sync): ${String(e)}`); }
};
_quarantine("unlock");
// ⭐ GH#815 —— 告訴鏈上每一支 `genrun.sh` wrapper：**這裡已經解鎖了，⛔ 不要各自重鎖**。
//   少了這一行，第一支跑完就把自己的產物鎖回去，而鏈上後面寫同一批檔的步驟吃 EACCES
//   —— ⭐ 一個「只在鏈裡發生、單獨跑永遠是綠的」的缺陷。
process.env.GGD_QUARANTINE_UNLOCKED = "1";
// ⭐⭐ GH#950 —— 這一整趟由 `package.json` 的 `skills:sync` **在外面**用
// `scripts/content-tree-lock.py write` 包起來（那把鎖真的被持有）。
// ⚠️ 這裡只是把「已經有人持鎖」傳給底下的 genrun ⇒ ⛔ 它們不會再拿一次而死鎖。
// ⛔ 這一行**不會**自己拿鎖 —— 它是一個轉述，⛔ 不是一個宣稱。
process.env.GGD_CONTENT_LOCK_HELD = "1";
process.on("exit", () => _quarantine("lock"));

const prune = new Set();
if (SINCE) {
  // ⚠️ `core.quotepath=false` 是必要的:預設 git 會把 CJK 路徑印成 C 風格跳脫 ＋ 雙引號
  //   （`"docs/\346\212\200..."`）⇒ 對不到任何輸入表 ⇒ fail-closed 全跑。
  //   而 `docs/技能標記機制與效果規則.md` 這一族遍佈全樹 —— 那會讓裁剪永遠不生效。
  const gitOut = (a) =>
    execFileSync("git", ["-c", "core.quotepath=false", ...a], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  const paths = [
    ...gitOut(["diff", "--name-only", SINCE]),
    ...gitOut(["ls-files", "--others", "--exclude-standard"]),
  ];
  const plan = planFromPaths(paths);
  if (plan.full) {
    console.log(`\n⛔ **fail-closed 全跑** —— ${plan.fullReason}`);
  } else {
    for (const n of plan.skipped) {
      const i = idx(n);
      if (i >= 0) prune.add(i);
    }
    // ⭐ 印出來 —— 一個**靜默**的上限讀起來會像「全部都跑過了」（第零守則）。
    console.log(
      `\n⭐ 裁剪（--since ${SINCE}）—— 改動 ${paths.length} 個路徑\n` +
        `   要跑 ${g.steps.length - prune.size}/${g.steps.length} 支 · ` +
        `⏭ 當成已最新 ${prune.size} 支: ${[...prune].map((i) => names[i]).sort().join(" · ") || "（無）"}`,
    );
  }
}

// ── 執行 ───────────────────────────────────────────────────────────────────
const LIMIT = Number(process.env.GGD_GATE_CONCURRENCY ?? Math.max(2, Math.min(16, cpus().length - 2)));
const done = new Array(g.steps.length).fill(false);
/**
 * ⚠️ ⭐ **已經送出去的**要記住 —— ⛔ 不可以只看 `done`。
 * `done[i]` 要等行程結束才變 true,而每一次有人收工都會再 `pump()` 一遍;
 * 這中間**還在跑**的那幾支前置條件仍然成立 ⇒ 會被**重複送出**。
 * 量到過:32 支跑成累計 CPU 613s(串行只要 108s),而且 `skillremake:json` 兩份
 * 同時寫同一批 126 個檔 ⇒ 它自己紅了,25 支後代被跳過。
 */
const started = new Array(g.steps.length).fill(false);
const failed = new Set();
const skipped = new Set();
const results = [];
let running = 0;
const t0 = Date.now();

const ready = () =>
  g.steps
    .map((_, i) => i)
    .filter((i) => !started[i] && !skipped.has(i) && [...deps[i]].every((d) => done[d] || skipped.has(d)))
    .sort((a, b) => prio[b] - prio[a]);

function launch(i, next) {
  // ⚠️ `pump()` 會**重入**(跳過的分支是同步的),而外層的 while 還握著舊的 ready 清單
  //    ⇒ 這一格擋住「同一支被送兩次」。
  if (started[i] || skipped.has(i)) return;
  // ⭐ **裁掉的當成已完成**(⛔ 不是 skipped):它的產物沒過期,下游要用它的輸出。
  //   標 skipped 會讓整條下游被當成「輸入是壞的」而一起跳過 —— 那就不是裁剪,是漏跑。
  if (prune.has(i)) {
    started[i] = true;
    done[i] = true;
    return next();
  }
  // ⭐ 前置有人紅了 ⇒ 這一支的輸入是壞的 ⇒ 跳過(⛔ 不要拿壞產物往下蓋)
  if ([...deps[i]].some((d) => failed.has(d) || skipped.has(d))) {
    skipped.add(i);
    return next();
  }
  started[i] = true;
  running++;
  const t = Date.now();
  const p = spawn("pnpm", [names[i]], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => (out += String(d)));
  p.stderr.on("data", (d) => (out += String(d)));
  p.on("close", (code) => {
    running--;
    done[i] = true;
    if (code !== 0) failed.add(i);
    results.push({ name: names[i], code: code ?? 1, ms: Date.now() - t, out });
    process.stderr.write(`  ${results.length}/${g.steps.length} ${names[i]}${code ? " ⛔" : ""}\n`);
    next();
  });
}

await new Promise((finish) => {
  const pump = () => {
    const r = ready();
    while (running < LIMIT && r.length) launch(r.shift(), pump);
    if (!running && !ready().length) finish();
  };
  pump();
});

const wall = (Date.now() - t0) / 1000;
const cpu = results.reduce((s, r) => s + r.ms, 0) / 1000;
try {
  mkdirSync(dirname(LEDGER), { recursive: true });
  const all = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  all[SCRIPT] = { ...(all[SCRIPT] ?? {}), ...Object.fromEntries(results.map((r) => [r.name, r.ms])) };
  writeFileSync(LEDGER, `${JSON.stringify(all, null, 2)}\n`, "utf8");
} catch (e) {
  console.error(`⚠️ 帳本寫不出去(⛔ 不影響結論): ${String(e)}`);
}

console.log(
  `\n⚡ ${SCRIPT} —— ${results.length} 支 · 並行度 ${LIMIT} · ${L.length} 層 · 排程 關鍵路徑優先\n` +
    `   wall ${wall.toFixed(1)}s · 累計 CPU ${cpu.toFixed(1)}s ⇒ **${(cpu / wall).toFixed(1)}× 平行度**` +
    ` (關鍵路徑下界 ${critical.toFixed(1)}s)`,
);
if (skipped.size) console.log(`   ⏭  前置紅了所以沒跑: ${[...skipped].map((i) => names[i]).join(" · ")}`);
const bad = results.filter((r) => r.code !== 0);
if (!bad.length && !skipped.size) {
  console.log("✓ 全部通過");
  process.exit(0);
}
console.log(`\n⛔ ${bad.length} 支紅了 —— ⭐ 一次列完(第零守則:批次撈):\n`);
for (const f of bad) {
  console.log(`═══ ${f.name}(exit ${f.code})`);
  console.log(f.out.split("\n").filter((l) => l.trim()).slice(-12).join("\n"));
  console.log();
}
process.exit(1);
