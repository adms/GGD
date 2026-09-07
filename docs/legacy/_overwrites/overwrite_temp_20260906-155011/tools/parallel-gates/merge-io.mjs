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
 *
 * ── ⭐ GH#1034：**單步**量測也走同一套聯集 —— `mergeStepsInto()` ─────────────
 * `trace.mjs --script <一步>` 在此之前把整份 `sync-io.json` 換成只有那一步的結果
 * （2026-09-06 量到：29,544 行 → 7 行，其他 60+ 支的戶籍一次清空）。
 * ⇒ 聯集的邏輯**只能有一個住處**：全量兩趟走下面的 CLI，單步走 `mergeStepsInto()`，
 *   兩條路用的是同一個 `canon()`、同一個「只留有人寫過的讀」濾法。
 * ⚠️ 這個檔因此變成**可 import 的**：CLI 那一半包在 `isMain` 裡，⛔ import 它沒有副作用。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseChain } from "./chainSteps.mjs";
import { matchesGlob } from "./reconcile.mjs";

/**
 * ⭐ 2026-08-26（GH#771）—— **日期戳路徑正規化**。
 * `msgledger:build` 寫的是 `docs/_daily/<今天>.md` ⇒ 一次性量測量到的是**那一天**的
 * 字面路徑,隔天就變成「無主又鎖著」（今天真的發生:2026-08-26.md 鎖著而戶籍記著
 * 2026-08-25.md）。⇒ 把已知的日期戳家族改寫成 **glob**,消費端（quarantine /
 * genguard / hook）都懂 fnmatch。⛔ 清單刻意窄:每一列都要有理由,泛化的「自動偵測
 * 日期」會把 `2026-08-25.md` 這種**永久帳本檔名**也吞進去。
 */
export const DATE_FAMILIES = [
  // msgledger:build 的當日帳本（每天換檔名,永遠寫「今天」那一份）
  [/^docs\/_daily\/\d{4}-\d{2}-\d{2}\.md$/, "docs/_daily/????-??-??.md"],
  // msgledger:build 的全文側檔（同一家族,檔名帶 YYYYMMDD）
  [/^docs\/_daily\/ledger-source_temp_\d{8}\.md$/, "docs/_daily/ledger-source_temp_*.md"],
];
export const canon = (path) => {
  for (const [re, glob] of DATE_FAMILIES) if (re.test(path)) return glob;
  return path;
};

/**
 * ⭐⭐ GH#1034 —— 把**單步**（或子鏈）的量測**併入**既有戶籍，⛔ 不是整份換掉。
 *
 * 語意與下面的兩趟 CLI 逐字相同：
 *   · reads / writes 取**聯集**（觀察到的 I/O 是事實，多一筆只會少一點併行）
 *   · 路徑先過 `canon()`（日期戳家族 → glob）
 *   · reads 只留**有人寫過**的（glob 也算命中 —— 用消費端同一套 `matchesGlob`）且不是自己寫的
 *   · `ms` 取 max、`ok` 取 and、`readCount` 取 max
 *   · ⭐ **其他步驟的物件原封不動**（同一個 reference ⇒ 序列化出來逐位元組相同）
 * 戶籍裡還沒有的步驟 ⇒ 插在 `existing.chain` 的順序位置上（有的話），否則接在最後。
 *
 * @param {{script?:string, chain?:string, steps?:object[]}} existing  既有的 sync-io.json
 * @param {{name:string, ok?:boolean, ms?:number, reads?:string[], writes?:string[], readCount?:number}[]} traced
 * @returns {object} 一份新的頂層物件（`existing` 本身不動）
 */
export function mergeStepsInto(existing, traced) {
  const steps = [...(existing.steps ?? [])];
  const allWrites = new Set();
  for (const s of steps) for (const w of s.writes ?? []) allWrites.add(w);
  for (const t of traced) for (const w of t.writes ?? []) allWrites.add(canon(w));
  const globs = [...allWrites].filter((w) => /[*?]/.test(w));
  const writtenBySomeone = (r) => allWrites.has(r) || globs.some((g) => matchesGlob(g, r));
  const order = existing.chain ? parseChain(existing.chain, existing.script ?? "").map((s) => s.label) : [];
  for (const t of traced) {
    const i = steps.findIndex((s) => s.name === t.name);
    const e = i >= 0 ? steps[i] : { name: t.name, ok: true, ms: 0, readCount: 0, writeCount: 0, reads: [], writes: [] };
    const writes = new Set([...(e.writes ?? []), ...(t.writes ?? []).map(canon)]);
    const reads = [...new Set([...(e.reads ?? []), ...(t.reads ?? []).map(canon)])]
      .filter((r) => writtenBySomeone(r) && !writes.has(r))
      .sort();
    const merged = {
      ...e,
      ok: (e.ok ?? true) && t.ok !== false,
      ms: Math.max(e.ms ?? 0, t.ms ?? 0),
      readCount: Math.max(e.readCount ?? 0, t.readCount ?? 0, (t.reads ?? []).length),
      writeCount: writes.size,
      reads,
      writes: [...writes].sort(),
    };
    if (i >= 0) {
      steps[i] = merged;
    } else {
      const at = order.indexOf(t.name);
      const later = at >= 0 ? steps.findIndex((s) => order.indexOf(s.name) > at) : -1;
      steps.splice(later >= 0 ? later : steps.length, 0, merged);
    }
  }
  return { ...existing, steps };
}

const isMain = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
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
    for (const r of s.reads) e.reads.add(canon(r));
    for (const w of s.writes) e.writes.add(canon(w));
    e.ms = Math.max(e.ms, s.ms);
    e.ok = e.ok && s.ok;
    // ⭐⭐ **可重入**：`s.readCount` 也要納入 max —— ⛔ 這一行在 2026-09-01 之前是
    //   `Math.max(e.readCount, s.reads.length)`，而 `steps[].reads` 存下來的是
    //   **過濾後**的清單（檔頭第 19 行逐字：「全量的筆數留在 readCount」）
    //   ⇒ 拿自己的產物當輸入再合一次，readCount 會從 **40,670 塌成 9,769**
    //   （2026-09-01 量到）⇒ 規劃器的裁剪整個退化（`syncPlan` / `syncPrune`
    //   兩條當場紅：一行客戶端改動要跑 **40 支**）。
    //   ⚠️ 而它**看起來完全正常** —— writes 一格都沒少。
    e.readCount = Math.max(e.readCount, s.readCount ?? 0, s.reads.length);
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
const ROOT = new URL("../..", import.meta.url).pathname;
function staticWrites(stepName) {
  let pkg;
  try { pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")); } catch { return []; }
  // ⭐⭐ **跟著 wrapper 往下追一層**（GH#883，2026-09-02）。
  //
  // ⛔⛔ 在此之前這一行只讀 `pkg.scripts[stepName]` 的**字面** ——
  //   而這個 repo 的產生器**幾乎全部**長成
  //   `bash scripts/genrun.sh <step> <step>:build:raw`
  //   ⇒ ⭐ 唯一被掃到的腳本是 **wrapper `genrun.sh`**，
  //   ⛔ 而真正的寫入端（`buildIndexes.ts` …）連讀都沒讀到。
  //
  // ⭐ 量到的後果（GH#883）：`buildIndexes.ts` 的檔頭**逐字宣告**
  //   `// ggd:writes content/*/_index.json`（一句正確的、單一住處的宣告），
  //   ⛔ 而戶籍表裡存的是上一次量測**展開成的 14 個具體集合**
  //   ⇒ `content/vfx-scripts/`（之後才出現的集合）的 `_index.json`
  //   變成一份**全戶籍都沒有人認領的產物**：
  //   ⛔ genguard 放行、⛔ 隔離區不鎖、⛔ 沒有 `--check` 叫它 —— ⭐ 三層同時瞎。
  //
  // ⇒ ⭐ 追一層就夠：`genrun.sh <公開名> <raw 名>` 的第二個參數本身也是
  //   `pkg.scripts` 的一個鍵。⛔ 不做無限遞迴（那會在互相引用時掛住）。
  // ⭐ 兩種 wrapper 都要追：① 同一份 package.json 裡的另一個 script
  //   （`genrun.sh <公開名> <raw 名>`）② `pnpm --filter <pkg> <script>`
  //   （workspace 那一層 —— `content:build:raw` 正是它，而 `buildIndexes.ts`
  //    住在 `packages/shared/package.json` 裡）。
  // ⛔ 深度上限 3：足夠涵蓋 `公開 → raw → workspace`，⛔ 而不會在互相引用時掛住。
  const seen = new Set();
  const cmds = [];
  const expand = (cmd, depth) => {
    if (!cmd || depth > 3) return;
    cmds.push(cmd);
    for (const tok of cmd.split(/\s+/)) {
      if (!seen.has(tok) && typeof pkg.scripts?.[tok] === "string") {
        seen.add(tok);
        expand(pkg.scripts[tok], depth + 1);
      }
    }
    for (const m of cmd.matchAll(/--filter\s+(\S+)\s+([\w:.-]+)/g)) {
      const key = `${m[1]}::${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const dir of ["packages", "apps", "tools"]) {
        const stem = m[1].replace(/^@[^/]+\//, "");
        const wp = `${ROOT}/${dir}/${stem}/package.json`;
        if (!existsSync(wp)) continue;
        try {
          const sub = JSON.parse(readFileSync(wp, "utf8"));
          // ⚠️ 相對路徑要接回 workspace 目錄 —— ⛔ 否則 `scripts/buildIndexes.ts`
          //   會被當成 repo 根的路徑而 `existsSync` 失敗（靜默漏掉）。
          expand(String(sub.scripts?.[m[2]] ?? "").replace(
            /(^|\s)([\w./-]+\.(?:py|ts|mjs|js|sh))/g,
            `$1${dir}/${stem}/$2`,
          ), depth + 1);
        } catch { /* 讀不到就跳過 —— 上面的 existsSync 已經擋掉不存在的 */ }
      }
    }
  };
  seen.add(stepName);
  expand(pkg.scripts?.[stepName] ?? "", 0);
  const cmd = cmds.join(" ");
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

// ⭐⭐ **glob 也算命中** —— ⛔ 這一段在 2026-09-01 之前不存在，而缺它讓
//   `merge-io` **不可重入**：一旦戶籍表裡有人用 glob 認領（`content/abilities/*.json`
//   那一族），把表自己餵回去再合一次，`allWrites.has(r)` 對**個別路徑**是
//   字面比對 ⇒ 一律 false ⇒ ⭐ `castderive:build:raw` 的 **493 筆 reads 當場蒸發**
//   （2026-09-01 量到，`vfxfam:build` 另外掉 1 筆）。
//   ⚠️ 而 writes 一格都沒少 ⇒ **看起來完全正常**，紅的是很遠的
//   `syncPlan` / `syncPrune`（「一行客戶端改動要跑 40 支」）。
//   ⇒ ⭐ 消費端（quarantine / genguard / hook）本來就都懂 fnmatch，只有這裡不懂。
const _globRe = (g) =>
  new RegExp("^" + g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
const _globs = [...allWrites].filter((w) => w.includes("*")).map((w) => [w, _globRe(w)]);
const writtenBySomeone = (r) => allWrites.has(r) || _globs.some(([, re]) => re.test(r));

const steps = order.map((name) => {
  const e = byName.get(name);
  for (const g of staticWrites(name)) { e.writes.add(g); allWrites.add(g); }
  const reads = [...e.reads].filter((r) => writtenBySomeone(r) && !e.writes.has(r)).sort();
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
} // isMain
