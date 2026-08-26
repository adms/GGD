#!/usr/bin/env node
/**
 * ⭐ 把 `trace.mjs` 的**兩趟**量測併成一份 `sync-io.json`。
 *
 * ── 為什麼一定要兩趟(⛔ 一趟是錯的)────────────────────────────────────────
 * 一半的產生器是**內容不同才寫**。⇒ 在一棵**已經同步**的樹上跑,它們寫 0 個檔,
 * 於是圖上少掉它們的每一條出邊 —— 而那正是**最貴的那種錯**:
 * 少一條邊 ⇒ 併行時兩支同時寫同一個檔 ⇒ 產物半新半舊,⛔ 而且兩支都說 OK。
 *
 *   pass 1 —— 乾淨的樹(穩態:量得到**讀**的全貌)
 *   pass 2 —— `git archive HEAD~60 content docs data | tar -x` 之後的樹
 *              ⇒ 每一支都真的要重寫 ⇒ 量得到**寫**的全貌
 *              ⚠️ `tools/` 刻意**不**回捲 —— 要量的是**現在**的產生器。
 *
 * 併法一律取**聯集**(⭐ 觀察到的 I/O 是事實,多一筆只會多一條邊 = 少一點併行,
 * ⛔ 不會漏掉一條真的相依)。
 *
 * ⚠️ `reads` 只留**有人寫過**的那些 —— 其餘的讀(出貨內容、原始碼、w3x 傾印…)
 * 對圖零貢獻,而它們會讓這個檔從 20KB 變成 2.5MB。全量的筆數留在 `readCount`。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , ...args] = process.argv;
const outIdx = args.indexOf("--out");
const OUT = resolve(outIdx >= 0 ? args[outIdx + 1] : new URL("./sync-io.json", import.meta.url).pathname);
const inputs = args.filter((a, i) => a !== "--out" && args[i - 1] !== "--out");
if (inputs.length < 2) {
  console.error("用法: node merge-io.mjs <pass1.json> <pass2.json> [--out sync-io.json]");
  process.exit(2);
}

const passes = inputs.map((p) => JSON.parse(readFileSync(resolve(p), "utf8")));
const base = passes[0];
for (const p of passes) {
  if (p.chain !== base.chain) {
    console.error("⛔ 兩趟量到的 chain 不一樣 ⇒ package.json 在中間被改過,重跑 trace.mjs");
    process.exit(2);
  }
}

/**
 * ⭐ 2026-08-26（GH#771）—— **日期戳路徑正規化**。
 * `msgledger:build` 寫的是 `docs/_daily/<今天>.md` ⇒ 一次性量測量到的是**那一天**的
 * 字面路徑,隔天就變成「無主又鎖著」（今天真的發生:2026-08-26.md 鎖著而戶籍記著
 * 2026-08-25.md）。⇒ 把已知的日期戳家族改寫成 **glob**,消費端（quarantine /
 * genguard / hook）都懂 fnmatch。⛔ 清單刻意窄:每一列都要有理由,泛化的「自動偵測
 * 日期」會把 `2026-08-25.md` 這種**永久帳本檔名**也吞進去。
 */
const DATE_FAMILIES = [
  // msgledger:build 的當日帳本（每天換檔名,永遠寫「今天」那一份）
  [/^docs\/_daily\/\d{4}-\d{2}-\d{2}\.md$/, "docs/_daily/????-??-??.md"],
  // msgledger:build 的全文側檔（同一家族,檔名帶 YYYYMMDD）
  [/^docs\/_daily\/ledger-source_temp_\d{8}\.md$/, "docs/_daily/ledger-source_temp_*.md"],
];
const canon = (path) => {
  for (const [re, glob] of DATE_FAMILIES) if (re.test(path)) return glob;
  return path;
};

const byName = new Map();
for (const p of passes) {
  for (const s of p.steps) {
    const e = byName.get(s.name) ?? { name: s.name, reads: new Set(), writes: new Set(), ms: 0, ok: true, readCount: 0 };
    for (const r of s.reads) e.reads.add(canon(r));
    for (const w of s.writes) e.writes.add(canon(w));
    e.ms = Math.max(e.ms, s.ms);
    e.ok = e.ok && s.ok;
    e.readCount = Math.max(e.readCount, s.reads.length);
    byName.set(s.name, e);
  }
}

/**
 * ⭐ GH#771 —— **收割靜態宣告**。有一族「語意級條件寫入端」（級距行缺了才寫、
 * provenance 戳缺了才寫）連逼寫都量不到：機械擾動（append 換行）碰不到它們的觸發
 * 條件。⇒ 這一族在**自己的原始碼裡**宣告 `// ggd:writes <glob>`（單一住處，
 * 就在寫入端旁邊），這裡收割進戶籍。⛔ 不是手編 sync-io.json —— 手編的表會過期
 * 而不會有東西紅；宣告跟著程式碼走，程式碼刪了宣告就跟著消失。
 */
import { readdirSync, existsSync } from "node:fs";
const ROOT = new URL("../..", import.meta.url).pathname;
function staticWrites(stepName) {
  let pkg;
  try { pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")); } catch { return []; }
  const cmd = pkg.scripts?.[stepName] ?? "";
  const scripts = [...cmd.matchAll(/[\w./-]+\.(?:py|ts|mjs|js|sh)/g)].map((m) => m[0]);
  const out = [];
  for (const rel of scripts) {
    const abs = `${ROOT}/${rel}`;
    if (!existsSync(abs)) continue;
    const head = readFileSync(abs, "utf8").split("\n").slice(0, 120).join("\n");
    // ⚠️ 捕到**行尾**，⛔ 不是 \S+ —— 這個 repo 有含空白的檔名
    //    （docs/技能編輯器引擎須知 20260811.md），\S+ 會把它截成一個不存在的假鍵，
    //    而假鍵會進戶籍表變成幽靈產物（2026-08-26 當場發生，guardMessages 閘抓到）。
    for (const m of head.matchAll(/ggd:writes\s+(.+)$/gm)) out.push(m[1].trim());
  }
  return out;
}

const order = base.steps.map((s) => s.name);
const allWrites = new Set();
for (const e of byName.values()) for (const w of e.writes) allWrites.add(w);

const steps = order.map((name) => {
  const e = byName.get(name);
  for (const g of staticWrites(name)) { e.writes.add(g); allWrites.add(g); }
  const reads = [...e.reads].filter((r) => allWrites.has(r) && !e.writes.has(r)).sort();
  return {
    name,
    ok: e.ok,
    ms: e.ms,
    readCount: e.readCount,
    writeCount: e.writes.size,
    // ⭐ 只留「有人寫過」的讀 —— 其餘對圖零貢獻(理由見檔頭)
    reads,
    writes: [...e.writes].sort(),
  };
});

writeFileSync(
  OUT,
  `${JSON.stringify({ script: base.script, chain: base.chain, passes: inputs.length, steps }, null, 2)}\n`,
  "utf8",
);
const silent = steps.filter((s) => s.readCount === 0).map((s) => s.name);
const nowrite = steps.filter((s) => s.writeCount === 0).map((s) => s.name);
console.log(`⭐ ${OUT} —— ${steps.length} 支 · ${passes.length} 趟 · 產物總數 ${allWrites.size}`);
if (silent.length) console.log(`⚠️ 探針全空(⇒ 排程器當柵欄): ${silent.join(" · ")}`);
if (nowrite.length) console.log(`ℹ️  兩趟都沒寫(⇒ 純讀,可以掛在任何地方): ${nowrite.join(" · ")}`);
