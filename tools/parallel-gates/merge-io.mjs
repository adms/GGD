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

const byName = new Map();
for (const p of passes) {
  for (const s of p.steps) {
    const e = byName.get(s.name) ?? { name: s.name, reads: new Set(), writes: new Set(), ms: 0, ok: true, readCount: 0 };
    for (const r of s.reads) e.reads.add(r);
    for (const w of s.writes) e.writes.add(w);
    e.ms = Math.max(e.ms, s.ms);
    e.ok = e.ok && s.ok;
    e.readCount = Math.max(e.readCount, s.reads.length);
    byName.set(s.name, e);
  }
}

const order = base.steps.map((s) => s.name);
const allWrites = new Set();
for (const e of byName.values()) for (const w of e.writes) allWrites.add(w);

const steps = order.map((name) => {
  const e = byName.get(name);
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
