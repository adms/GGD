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
 *
 * ══ ⭐⭐ **第二個環** —— GH#1244,2026-09-19 逐項量出來的 ══════════════════════
 *
 * GH#710 記錄過**第一個環**:3 支產生器排在 `content:build` 後面又寫它讀的檔
 * ⇒ 一趟鏈跑完仍然 stale ⇒ 解法是 `converge.mjs`「跑到不動點,上限 3 輪」。
 * ⚠️ 而每一輪要 **≈685 秒** ⇒ ⭐ 這張票的價值是**時間**,⛔ 不是漂亮。
 *
 * ⭐ 底下四段是**量出來的**(來源:`sync-io.json` 的 `steps[].reads/writes`
 *    ＋ `content/config/_index.json` ＋ `content/bundle.json`),⛔ 不是推論。
 *
 * ── ① 誰在**最後一次** `content:build`(chain 38)之後還寫進 `content/` ────────
 *   chain 53 `enableaudit:build` → `content/assets/review/enable-audit.json`
 *   chain 63 `lod:build`         → `content/assets/models/_lod.json`
 *   chain 66 `iconplan:build`    → `content/config/icon-plan.json`      ⛔⛔ 見下
 *   chain 68 `combat:build`      → 76 個 `content/assets/audio/voices/**`
 *
 * ⭐ ⛔ **四支裡只有一支真的造成環**,⛔ 不是四支 —— 判準是「**它是不是一份內容文件**」:
 *   · `content/assets/**` ⛔ **不是集合** ⇒ 不進 `bundle.json`。實測
 *     `content/assets-manifest.json` 裡這三支寫的路徑**一個都沒有**(grep 0 次)
 *     ⇒ 它們不會讓 bundle 過期。
 *   · ⭐ `content/config/icon-plan.json` **是**:它在 `content/config/_index.json`
 *     裡有一筆 `{"id":"icon-plan","hash":…,"size":923}`,而它的位元組**內嵌在**
 *     `content/bundle.json` 的 `collections.config` 裡。
 *   ⇒ ⭐ `iconplan:build` 一旦改到那個檔,`config/_index.json` 的雜湊 →
 *     `contentVersion` → `manifest.json` → `bundle.json` **全部當場 stale**,
 *     ⛔ 而 chain 66 之後沒有任何一支會重建它們 ⇒ `shippedBundleIsCurrent` 紅
 *     ⇒ ⭐ **converge 必須燒掉完整的第二輪(≈685s)**。
 *   ⚠️ 判準是它**寫到哪裡**,⛔ 不是「它是不是文件產生器」(GH#1244 票文逐字)。
 *   ⇒ 修法在 `package.json` 的鏈(把它挪到 `content:build` 之前)＋ 一條從
 *     `sync-io.json` 推導的守衛,⛔ **兩者都在這個檔的柵欄外** ⇒ 這裡只留紀錄。
 *
 * ── ② 而這支排程器**自己**有三個一輪收斂不了的理由 —— ⭐ 三個都在這一版修掉了 ──
 *   · 圖的序取了 `io.steps` 的**陣列序**而不是**鏈序** ⇒ **20 條真相依被丟掉**
 *     ⇒ 修法:排回鏈序再推導(見 `CHAIN` / `chainPos`)
 *   · `legacyindex:build` 的探針空手而回 ⇒ 零入度 ⇒ 排進**層 0**,而它數的東西
 *     那時還沒被寫出來 ⇒ 修法:**盲探柵欄**(見 `blindSteps`)
 *   · `quarantine:lock` 同上排進**層 0** ⇒ ⛔ 整趟從第二支起 EACCES
 *     ⇒ 修法:隔離區由本腳本自己開關(見 `QUARANTINE_STEPS`)
 * ⚠️ ⭐ 這三個都**只發生在這支排程器上**(`pnpm sync:since` 那條路),
 *   ⛔ 序列鏈 `pnpm skills:sync` 沒有它們 —— 所以它們**不是** 685s 那一輪的成因,
 *   ⭐ 而是「這條路今天根本沒辦法一輪收斂」的成因。⛔ 不要把兩者混為一談。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cpus, tmpdir } from "node:os";
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
      `      cp -Rc <repo> ${tmpdir()}/ggd-syncgraph-sandbox   # APFS clonefile,幾乎不佔空間\n` +
      `      node tools/parallel-gates/trace.mjs --out ${tmpdir()}/p1.json\n` +
      `      (cd 沙盒 && git archive HEAD~60 content docs data | tar -x)\n` +
      `      node tools/parallel-gates/trace.mjs --out ${tmpdir()}/p2.json\n` +
      `      node tools/parallel-gates/merge-io.mjs ${tmpdir()}/p1.json ${tmpdir()}/p2.json`,
  );
  process.exit(2);
}

// ── ⭐ 圖的**序** = 鏈序,⛔ 不是 `io.steps` 的陣列序(GH#1244)──────────────────
// `graph.mjs` 的檔頭逐字寫「方向一律取**宣告順序**(package.json 那條 `&&` 鏈)
// ⇒ ⛔ 不可能推出一個反向的邊」。⭐ 前半句是**假的**(第三守則:註解會說謊)——
// 它實際取的是 `io.steps` 的陣列位置,而 2026-09-19 量到那兩個序**不一樣**:
// `bricks:build`(chain 61)住在陣列第 36 格、`editorcov:build`(chain 55)住在第 59 格。
// ⚠️ ⭐ 後半句是真的,而那正是**壞處**:方向對不上時 `hits()` 兩邊都不中
//    ⇒ 那條真相依**不是被反向推出來,是被整條丟掉** ⇒ 零約束。
// 量到:**20 條真相依靜靜消失**(15 條指向 `bricks:build`、5 條從 `editorcov:build`
//    指出去),而 `--plan` 看起來完全正常 —— 「壞掉跟正常長得一模一樣」。
//    實例:`bricks:build` 讀 `content/assets-manifest.json`,而它被排在
//    `assets:manifest` **前面一層** ⇒ 它吃的是上一輪的磚表。
// ⭐ 排回鏈序 ⇒ 那 20 條回來、23 條方向相反的假相依消失(1396 → 1393 邊 · 49 → 48 層)。
// ⛔ 它**沒有改任何拓撲序**:package.json 那條鏈一個字都沒動,
//    這只是讓推導照它**自己宣稱的**那個序跑。
const CHAIN = io.chain.split("&&").map((s) => s.trim().replace(/^pnpm\s+/, ""));
/** ⭐ 一支在鏈上出現兩次(`content:build`)時取**第一次** —— 它是同一個節點,
 *  而它的產物從第一次起就要能被下游讀到。⛔ 取最後一次會把 11 支推到它後面。 */
const chainPos = new Map();
CHAIN.forEach((n, i) => { if (!chainPos.has(n)) chainPos.set(n, i); });
const orphans = io.steps.filter((s) => !chainPos.has(s.name)).map((s) => s.name);
if (orphans.length) {
  console.error(
    `⛔ sync-io.json 有 ${orphans.length} 支**不在鏈上**: ${orphans.join(" · ")}\n` +
      `   ⇒ 它們排不出位置(多半是舊量測被手動併進來的殘骸),⛔ 而排程器仍然會**跑**它們。\n` +
      `   ⭐ 修法同閘①:重跑 3-pass trace 重量整張圖,⛔ 不要手改 sync-io.json。`,
  );
  process.exit(2);
}
const g = buildGraph({ ...io, steps: [...io.steps].sort((a, b) => chainPos.get(a.name) - chainPos.get(b.name)) });
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

// ── ⭐ 盲探柵欄 —— 探針什麼都沒看到 ⇒ ⛔ 不可以當成「沒有相依」(GH#1244)────────
// 量到 **4 支**的 `reads` 是**空的**(⛔ 不是 `readCount` 為 0 —— 那是 250/580 次真的
// 開檔,只是一個產物都沒讀到):`quarantine:unlock`(chain 0) · `lod:build`(63) ·
// `quarantine:lock`(67) · `legacyindex:build`(69)。零入度 ⇒ 今天**四支全排進層 0**。
// ⛔⛔ 其中兩支排在層 0 是**災難性**的,⛔ 不是「早跑一點而已」:
//   · `quarantine:lock` 先跑 ⇒ 產物全部 chmod 444,而本檔底下那一行
//     `GGD_QUARANTINE_UNLOCKED=1` 正好叫每一支 `genrun.sh` **不要**自己解鎖
//     (`scripts/genrun.sh:51`,GH#815 的巢狀防護)⇒ ⭐ **整趟從第二支起全部 EACCES**。
//   · `legacyindex:build` 先跑 ⇒ 它數的是 `docs/legacy/` 的檔數,而 `prose:build`
//     改卡面時會在那裡留一份**帶時間戳**的備份(GH#1281)⇒ 先跑必然 stale
//     ⇒ ⭐ **一輪永遠收斂不了**。⚠️ 而那條相依**永遠量不到**:備份檔名每次都不同,
//        它不可能出現在任何一支的 `writes` 裡 ⇒ ⛔ I/O 探針**結構上**看不見它。
// ⇒ 判準:探針空手而回 ⇒ 退回我們唯一還有的資訊(**它的鏈序**),把它釘成柵欄。
//   ⭐ 這正是 `graph.mjs` 的 `opaque` 想做的事,⛔ 而那一格的判準寫成 `readCount === 0`
//   ⇒ 實測**命中 0 支**(`--plan` 印的「探針全空當柵欄 0」就是它在說自己從沒響過)。
// ⭐ 代價量到了:1393 → 1659 邊 · 48 → 53 層 · 關鍵路徑 484.1s → 503.5s(**+19.4s**),
//   換到的是層 0 只剩 `quarantine:unlock`、最後一層是 `legacyindex:build`。⛔ 只加邊,
//   ⛔ 沒有放寬任何一道檢查。
const seenEdge = new Set(g.edges.map((e) => `${e.from},${e.to}`));
const blindSteps = [];
g.steps.forEach((s, i) => {
  if (s.reads.length) return;
  blindSteps.push(s.name);
  for (let j = 0; j < g.steps.length; j++) {
    if (i === j) continue;
    const from = Math.min(i, j);
    const to = Math.max(i, j);
    if (seenEdge.has(`${from},${to}`)) continue;
    seenEdge.add(`${from},${to}`);
    g.edges.push({ from, to, why: "blind-probe", file: null });
  }
});

// ── ⭐ 第二個環的**報表** —— 從 io 表推導,⛔ 不是一張手打名單(GH#1244)──────────
/** 集合名從 `content:build` 自己寫的 `content/<集合>/_index.json` 推導(⛔ 不寫死)。 */
const COLLECTIONS = new Set(
  (g.steps[A]?.writes ?? []).map((w) => /^content\/([^/*]+)\/_index\.json$/.exec(w)?.[1]).filter(Boolean),
);
/** ⭐ 一份**內容文件**(進得了 bundle 的)長這樣:`content/<集合>/<id>.json`,⛔ 三段。 */
const isContentDoc = (f) => {
  const p = f.split("/");
  return p.length === 3 && COLLECTIONS.has(p[1]) && f.endsWith(".json") && !f.endsWith("_index.json");
};
const LAST_CONTENT_BUILD = CHAIN.lastIndexOf("content:build");
const lateContentWriters = g.steps
  .map((s) => ({
    name: s.name,
    pos: chainPos.get(s.name),
    files: s.writes.filter((w) => w.startsWith("content/")),
  }))
  .filter((x) => x.files.length && x.pos > LAST_CONTENT_BUILD)
  .map((x) => ({ ...x, docs: x.files.filter(isContentDoc) }))
  .sort((a, b) => a.pos - b.pos);
/**
 * ⭐⭐ **量尺自證** —— 這把尺在「**已知有**」的地方量得到嗎?
 * ⛔ `COLLECTIONS` 一旦空掉(例:`content:build` 的 writes 換了形狀),`isContentDoc()`
 * 就**恆為 false** ⇒ 上面那張表會安安靜靜地宣告「四支都乾淨」——
 * ⭐ 而那與「真的沒有環」**長得一模一樣**(CLAUDE.md:一把只驗過單邊的尺不算自證過)。
 * ⇒ 拿全鏈當母體:寫得出內容文件的步驟**至少要有一支**,量不到就當場說這把尺瞎了。
 */
const docWriters = g.steps.filter((s) => s.writes.some(isContentDoc)).map((s) => s.name);
const ringB = () => {
  if (!COLLECTIONS.size || !docWriters.length) {
    return (
      `\n   ⚠️⚠️ **第二個環那把尺瞎了** —— 集合 ${COLLECTIONS.size} 個 · ` +
        `全鏈寫得出內容文件的步驟 ${docWriters.length} 支(⭐ 兩個都該 > 0)。\n` +
        `      ⇒ ⛔ 底下那張表的「乾淨」**不可信**:它現在對每一支都回「不是內容文件」。\n` +
        `      ⭐ 成因多半是 content:build 的 writes 換了形狀(不再是 content/<集合>/_index.json)。`
    );
  }
  const out = [
    `\n   ⭐ 第二個環(GH#1244)—— 最後一次 content:build 在 chain ${LAST_CONTENT_BUILD};` +
      `排在它後面又寫進 content/ 的有 ${lateContentWriters.length} 支` +
      `（尺已自證:${COLLECTIONS.size} 個集合 · 全鏈 ${docWriters.length} 支寫得出內容文件）:`,
  ];
  for (const x of lateContentWriters) {
    out.push(
      `      chain ${String(x.pos).padStart(2)} ${x.name.padEnd(20)} 寫 ${String(x.files.length).padStart(2)} 個 content/ 檔` +
        (x.docs.length
          ? `\n         ⛔ 其中 ${x.docs.length} 個是**內容文件** ⇒ _index/contentVersion/bundle 當場 stale: ${x.docs.join(" · ")}`
          : `  （都在 content/assets/ ⇒ ⛔ 不是集合,不進 bundle）`),
    );
  }
  out.push(
    `      ⇒ ⭐ 真的造成環的只有帶 ⛔ 的那幾支。修法(挪鏈序＋守衛)在**這個檔的柵欄外**,` +
      `這裡只負責**說出來**。`,
  );
  return out.join("\n");
};

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
  const bld = g.edges.filter((e) => e.why === "blind-probe");
  console.log(
    `\n   邊的來源: 讀後寫 ${g.edges.length - waw.length - opq.length - bld.length} · 寫後寫 ${waw.length} · ` +
      `探針全空當柵欄 ${opq.length} · ⭐ 盲探柵欄 ${bld.length}（${blindSteps.join(" · ") || "無"}）`,
  );
  console.log(`   ⭐ 已知那條: ${g.edges.filter((e) => e.from === A && e.to === B).map((e) => `${e.why} @ ${e.file}`)[0]}`);
  console.log(ringB());
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
/**
 * ⭐⭐ **這一趟的隔離區由這支腳本自己管**(上面一行解鎖、下面 `process.on("exit")` 重鎖)
 * ⇒ 鏈上那兩支 `quarantine:lock` / `quarantine:unlock` 在**這條路上**是同一件事的
 * **第二個住處**,而它們一定會在錯的時間開關(GH#1244,2026-09-19 量到):
 *   · 它們的探針 `reads`/`writes` 都是空的 ⇒ 圖上零入度
 *     ⇒ 在此之前 `quarantine:lock` 被排進**層 0**(⭐ 全鏈第一支)
 *     ⇒ 產物立刻 chmod 444,而上面那一行剛好叫每一支 `genrun.sh` **不要**自己解鎖
 *       (`scripts/genrun.sh:51`)⇒ ⛔ **整趟從第二支起全部 EACCES**。
 *   · 加了盲探柵欄之後它退到鏈序的位置(層 50),⛔ 而那仍然在 `combat:build` 與
 *     `legacyindex:build` **前面** ⇒ 最後兩支照樣 EACCES。
 * ⚠️ 序列鏈(`pnpm skills:sync`)不會有這個病:那條路上沒有人持著全域解鎖,
 *   每一支 `genrun.sh` 自己解鎖→跑→重鎖。⇒ ⭐ 這是**只在這支排程器上**發生的缺陷。
 * ⇒ 跳過它們,⛔ 不是關掉隔離區:收工那一行 `_quarantine("lock")` 仍然照鎖,
 *   ⭐ **結束狀態逐位元組相同**。
 */
const QUARANTINE_STEPS = new Set(["quarantine:lock", "quarantine:unlock"]);
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
  // ⭐ 隔離區的開關由本腳本自己持有(見上面 QUARANTINE_STEPS 的說明)⇒ 這兩支不送出去。
  //   ⛔ 標 done ⛔ 不是 skipped —— 標 skipped 會把整條下游當成「輸入是壞的」一起跳過。
  if (QUARANTINE_STEPS.has(names[i])) {
    process.stderr.write(`  ⏭ ${names[i]} —— 隔離區由 sync.mjs 自己開關(GH#1244),⛔ 不在鏈中途翻它\n`);
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
// ⭐ 跑完就把第二個環印出來 —— ⛔ 不要讓下一個人看到 `skills:check` 紅了才去猜
//   「是我改壞了什麼」(GH#1244 票文:那個誤判當天燒掉三輪)。
if (lateContentWriters.some((x) => x.docs.length)) console.log(ringB());
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
