#!/usr/bin/env node
/**
 * 🧩 GH#990 —— `content/vfx-scripts/` 的**呼叫式正規化器**（callify）。
 *
 * owner 2026-09-05（逐字）：
 * > 「盡量特效模組化(甚至 sub-type) 像JASS一樣可以呼叫設定 來拼湊組合
 * >  並非每個技能都一個特定特效」
 *
 * 做什麼：拿 `content/vfx-subtypes/sub.*.json` 逐顆去比每一支 script 的 inline 段落，
 * 連續一段用「該子模組 ＋ 從那幾段**讀出來的**參數」展開後**逐位元組相等**的視窗
 * ⇒ 換成 `{"call":{"subtype","params"}}`（`params` 只寫與 default 不同的格子）。
 * ⛔ 不逐支手改（第零守則⑨：N 同型 ＝ 一支正規化器）。
 *
 * 寫檔之前的閘：改完之後用**同一支**共用展開器（`packages/shared/src/content/vfxSubtypes/expand.ts`）
 * 展開，與原本的 inline **逐位元組相等**才寫；不等就 exit 2、一個位元組都不動。
 *
 *   node --import tsx tools/vfx-subtypes/callify.mjs            # = --check：每一支已是正規式？（唯讀）
 *   node --import tsx tools/vfx-subtypes/callify.mjs --write    # 把可呼叫的視窗換成 call
 *   node --import tsx tools/vfx-subtypes/callify.mjs --census   # 段落形狀普查（報告用的那張表）
 *
 * `--check` 的判準（任一不成立 ⇒ exit 1）：
 *   ① 每一支 script 的每一個 call 都展得開（子模組在、參數名認得、值在界內）
 *   ② 再跑一次 callify **什麼都不會變**（＝出貨的 script 是正規式；一支手寫回 inline 的重複會在這裡紅）
 *
 * ⚠️ `schema` tag **不動**（留 `vfx-script@1`）：`apps/content-api/src/server.ts:316` 釘死
 * `doc.schema === COLLECTIONS[c].schemaTag`，翻 tag 是主 session 連同 `schema/index.ts` 的一行。
 * ⚠️ 動 `content/vfx-scripts/*.json` 前 `bash scripts/genguard.sh` 過了（2026-09-06：沒有產生器擁有者）。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zVfxSubtypeDoc, expandVfxSubtypeRaw } from "../../packages/shared/src/content/schema/vfxSubtype.ts";
import { isVfxScriptCall } from "../../packages/shared/src/content/schema/vfxScript.ts";
import {
  canonJson,
  expandVfxScriptEntries,
  paramValueProblem,
} from "../../packages/shared/src/content/vfxSubtypes/expand.ts";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SUB_DIR = join(ROOT, "content/vfx-subtypes");
const SCRIPT_DIR = join(ROOT, "content/vfx-scripts");
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const CENSUS = argv.includes("--census");

const jsonFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .sort();
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

// ── 子模組（先過 schema：一顆不合法的子模組不可以拿來正規化任何東西）──────────
const subtypes = jsonFiles(SUB_DIR).map((f) => {
  const r = zVfxSubtypeDoc.safeParse(read(join(SUB_DIR, f)));
  if (!r.success) {
    console.error(`⛔ ${f} 不是合法的 vfx-subtype：${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" · ")}`);
    process.exit(2);
  }
  return r.data;
});
// 長的先比（一個 17 段的視窗裡可能藏著一個 2 段的子模組 —— 先吃長的才是最大壓縮）
subtypes.sort((a, b) => b.segments.length - a.segments.length || a.id.localeCompare(b.id));
const byId = new Map(subtypes.map((s) => [s.id, s]));
const resolveSub = (id) => byId.get(id);

/**
 * 視窗 W（inline 段，長度＝子模組段數）能不能用這顆子模組表達：
 * 從 W 的 bind 位置**讀出**每一格參數（同一格的多個 bind 要一致、值要在界內），
 * 展開後 canon 相等 ⇒ 回傳只含「≠ default」的 params；否則 null。
 */
function deriveCall(sub, window) {
  if (window.length !== sub.segments.length) return null;
  if (window.some(isVfxScriptCall)) return null;
  const values = {};
  for (const [name, p] of Object.entries(sub.params)) {
    let got;
    let first = true;
    for (const b of p.bind) {
      const seg = window[b.segment];
      if (!seg || !(b.field in seg)) return null;
      const v = seg[b.field];
      if (first) {
        got = v;
        first = false;
      } else if (canonJson(v) !== canonJson(got)) return null; // 同一格參數在視窗裡兩個值 ⇒ 不是這一顆
    }
    if (paramValueProblem(p, got)) return null;
    values[name] = got;
  }
  const expanded = expandVfxSubtypeRaw(sub, values);
  if (canonJson(expanded) !== canonJson(window)) return null;
  const params = {};
  for (const [name, v] of Object.entries(values)) {
    if (canonJson(v) !== canonJson(sub.params[name].default)) params[name] = v;
  }
  return Object.keys(params).length > 0 ? { subtype: sub.id, params } : { subtype: sub.id };
}

/** 一支 script 的正規式（⛔ 不寫檔）。回傳 { entries, calls } —— calls 是這一次新換上去的。 */
function callify(script) {
  const src = script.segments;
  const entries = [];
  const calls = [];
  let i = 0;
  while (i < src.length) {
    if (isVfxScriptCall(src[i])) {
      entries.push(src[i]);
      i++;
      continue;
    }
    let hit = null;
    for (const sub of subtypes) {
      const n = sub.segments.length;
      if (i + n > src.length) continue;
      const call = deriveCall(sub, src.slice(i, i + n));
      if (call) {
        hit = { call, n };
        break;
      }
    }
    if (hit) {
      entries.push({ call: hit.call });
      calls.push({ at: entries.length - 1, ...hit.call, replaced: hit.n });
      i += hit.n;
    } else {
      entries.push(src[i]);
      i++;
    }
  }
  return { entries, calls };
}

/** 段落形狀普查（報告那張表）—— 精確重複 ＋ 粗形狀（kind＋資產 key＋欄位集合）。 */
function census(scripts) {
  const exact = new Map();
  const coarse = new Map();
  let total = 0;
  for (const s of scripts) {
    const segs = expandVfxScriptEntries(s.segments, resolveSub, { scriptId: s.id, validate: false });
    for (const seg of segs) {
      total++;
      const ek = canonJson(seg);
      exact.set(ek, (exact.get(ek) ?? new Set()).add(s.id));
      const asset = seg.modelKey ?? seg.vfxId ?? seg.soundKey ?? seg.text ?? seg.pulse ?? "";
      const ck = `${seg.kind}${asset ? ` ${asset}` : ""} {${Object.keys(seg).sort().join(",")}}`;
      coarse.set(ck, (coarse.get(ck) ?? new Set()).add(s.id));
    }
  }
  const rows = (m) =>
    [...m.entries()]
      .map(([k, ids]) => ({ k, n: ids.size, ids: [...ids].sort() }))
      .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
  const lines = [];
  lines.push(`母體：${scripts.length} 支 script · ${total} 段（展開後）· 精確不同的段 ${exact.size} 種 · 粗形狀 ${coarse.size} 種`);
  lines.push("");
  lines.push("| 出現在幾支 | 粗形狀（kind 資產 {欄位}） | 哪幾支 |");
  lines.push("|---:|---|---|");
  for (const r of rows(coarse).filter((r) => r.n >= 2)) lines.push(`| ${r.n} | \`${r.k}\` | ${r.ids.join(" · ")} |`);
  lines.push("");
  lines.push(`（粗形狀出現在 ≥2 支的：${rows(coarse).filter((r) => r.n >= 2).length} 種；精確重複（逐位元組）出現在 ≥2 支的：${rows(exact).filter((r) => r.n >= 2).length} 種）`);
  return lines.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────
const files = jsonFiles(SCRIPT_DIR);
const scripts = files.map((f) => ({ f, doc: read(join(SCRIPT_DIR, f)) }));

if (CENSUS) {
  console.log(census(scripts.map((s) => s.doc)));
  process.exit(0);
}

let changed = 0;
let bad = 0;
for (const { f, doc } of scripts) {
  // ① 今天的樣子展得開嗎（子模組在、參數合法）
  let before;
  try {
    before = expandVfxScriptEntries(doc.segments, resolveSub, { scriptId: doc.id });
  } catch (e) {
    console.error(`⛔ ${f}：${e.message}`);
    bad++;
    continue;
  }
  const { entries, calls } = callify(doc);
  // ② 正規式展開後要與原本逐位元組相等 —— 不等就一個位元組都不寫
  const after = expandVfxScriptEntries(entries, resolveSub, { scriptId: doc.id });
  if (canonJson(after) !== canonJson(before)) {
    console.error(`⛔ ${f}：callify 之後展開結果 ≠ 原本 —— 正規化器有 bug，⛔ 不寫檔`);
    console.error(`   前：${canonJson(before).slice(0, 200)}…`);
    console.error(`   後：${canonJson(after).slice(0, 200)}…`);
    process.exit(2);
  }
  const nCalls = entries.filter(isVfxScriptCall).length;
  if (calls.length === 0) {
    console.log(`✓ ${f}  ${doc.segments.length} 段 · call ${nCalls}（已是正規式）`);
    continue;
  }
  changed++;
  const desc = calls.map((c) => `${c.subtype}${c.params ? ` ${JSON.stringify(c.params)}` : ""} ← ${c.replaced} 段`).join("；");
  if (WRITE) {
    const out = { ...doc, segments: entries };
    writeFileSync(join(SCRIPT_DIR, f), JSON.stringify(out, null, 2) + "\n");
    console.log(`✍️  ${f}  ${doc.segments.length} 段 → ${entries.length} 段：${desc}`);
  } else {
    console.log(`✗ ${f}  可以換成 call 但還沒換：${desc}`);
  }
}

if (bad > 0) {
  console.error(`⛔ ${bad} 支 script 展不開（見上）`);
  process.exit(1);
}
if (!WRITE && changed > 0) {
  console.error(`⛔ ${changed} 支 script 不是正規式 —— 跑 node --import tsx tools/vfx-subtypes/callify.mjs --write`);
  process.exit(1);
}
console.log(`vfx-subtypes:callify —— ${files.length} 支 script，${WRITE ? `改寫 ${changed}` : "全部是正規式"}`);
