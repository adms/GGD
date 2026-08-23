#!/usr/bin/env node
/**
 * ⭐⭐ **`skills:sync` 按改動裁剪** —— ⛔ 不是每次都把 32 支全跑一遍。
 *
 * owner 2026-08-23 逐字：
 *
 * > 「**為什麼我要全跑 skills 產生器，即使我沒有做技能更動或小範圍更動也需要全跑嗎
 * >  可以用旗標註明是否有改動需要跑哪支就好？**」
 *
 *   node tools/parallel-gates/syncPlan.mjs                    # 工作樹 vs HEAD
 *   node tools/parallel-gates/syncPlan.mjs --base HEAD~5      # 跟某個 base 比
 *   node tools/parallel-gates/syncPlan.mjs --paths a.json,b.ts
 *   node tools/parallel-gates/syncPlan.mjs --json             # 給程式讀
 *
 * ⚠️ 這一支**只印計畫**，⛔ 它不執行任何產生器（`skills:sync` 寫 `bundle.json`，全域鎖）。
 *
 * ── ⭐ 輸入表是**推導**出來的，⛔ 沒有一行手寫的「這支吃哪些檔」──────────────
 * 三個來源，全部可以被反駁：
 *   ① **量到的讀**（`sync-io.json` 的 `reads`）—— `trace.mjs` 真的把 32 支跑一遍量的。
 *   ② **產生器自己的原始碼**裡出現的路徑字面值（要真的對得上一個 git 追蹤的檔或目錄）。
 *      ⚠️ ①**不夠**：`merge-io.mjs` 刻意只留「有人寫過」的讀（否則檔案 20KB→2.5MB），
 *      所以 `treasure:csv` 讀了 98 個檔卻在表上是 `reads: []`。②補的正是這一半。
 *   ③ **產生器自己**（`tools/<dir>/` 或那支 `scripts/*.sh`）—— 程式改了它一定要重跑。
 *
 * ── ⛔ fail-closed 是硬要求（三道）──────────────────────────────────────────
 *   ⓐ 改動路徑對不到**任何**一支的輸入表 ⇒ **全跑**（⛔ 不是「猜它沒關係」）。
 *   ⓑ `package.json` 的 chain 跟 `sync-io.json` 對不上 ⇒ 表過期 ⇒ **全跑**。
 *      （新加的第 33 支產生器對這張表是**不存在的** —— 那正是最貴的漏法。）
 *   ⓒ 探針全空的那幾支（`readCount === 0`，例如 bash 寫的產生器）⇒ **一律跑**。
 *
 * ⭐ 唯一**不**觸發 ⓐ 的例外是「這個 root 整個不在產生器的宇宙裡」——
 * 而那個宇宙也是推導的（①②③ 提到過的 top-level 才算數），⛔ 不是一張白名單。
 * 例：`apps/**` 沒有任何一支產生器讀過、也沒有任何一支的原始碼提過 ⇒ 改它 = 0 支要跑。
 *
 * ── 下游：拓撲傳遞閉包 ──────────────────────────────────────────────────────
 * B 的輸入 ∩ A 的輸出 ≠ ∅ ⇒ A 跑了 B 也要跑。邊直接用 `graph.mjs`（量到的 I/O），
 * ⭐ 所以已知那條真相依（`contract:numbers` 必須在 `content:build` 之後）自動成立。
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { buildGraph, layers, loadIo } from "./graph.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = new URL("../../", import.meta.url).pathname;
const SRC = /\.(py|ts|tsx|mjs|cjs|js|sh)$/;

const git = (repo, args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** git 追蹤的檔 **與**它們的每一層祖先目錄 —— 字面值要對得上這裡面的東西才算數。 */
export function knownPaths(repo) {
  const files = git(repo, ["ls-files"]).filter((p) => !p.includes("node_modules/"));
  const known = new Set(files);
  for (const f of files) {
    const seg = f.split("/");
    for (let i = 1; i < seg.length; i++) known.add(seg.slice(0, i).join("/"));
  }
  return { files: new Set(files), known };
}

/**
 * 每個腳本名住在哪幾份 package.json（root 以外的也要，⛔ 見 #467）。
 * ⚠️ `docs/legacy/` 底下是**覆蓋前的備份副本**，⛔ 不是活的專案。
 */
export function readScripts(repo) {
  const out = {};
  for (const p of git(repo, ["ls-files", "package.json", "**/package.json"])) {
    if (p.includes("node_modules/") || p.startsWith("docs/legacy/")) continue;
    const j = JSON.parse(readFileSync(join(repo, p), "utf8"));
    for (const [k, v] of Object.entries(j.scripts ?? {})) {
      (out[k] ??= []).push({ home: dirname(p) === "." ? "" : dirname(p), name: j.name, cmd: v });
    }
  }
  return out;
}

/**
 * 一支 `pnpm <name>` 最後**真的執行**了哪幾個原始碼檔。
 * ⭐ 遞迴解 `pnpm x`／`pnpm --filter @ggd/y x` —— `content:build` 是四支的聚合，
 * 而它的第一支還住在 `packages/shared/package.json` 裡。
 */
export function entryFiles(scripts, name, home = "", seen = new Set()) {
  const key = `${home}|${name}`;
  if (seen.has(key)) return new Set();
  seen.add(key);
  const out = new Set();
  for (const e of scripts[name] ?? []) {
    if (home && e.home !== home) continue;
    for (const part of e.cmd.split("&&").map((s) => s.trim())) {
      const m = /^pnpm\s+(?:--filter\s+(\S+)\s+)?([\w:.@/-]+)$/.exec(part);
      if (m) {
        const filt = m[1];
        const sub = filt ? (scripts[m[2]] ?? []).find((x) => x.name === filt)?.home ?? "" : "";
        for (const f of entryFiles(scripts, m[2], sub, seen)) out.add(f);
        continue;
      }
      for (const tok of part.split(/\s+/)) {
        if (tok.includes("/") && !tok.startsWith("-")) out.add(join(e.home, tok).replace(/^\/+/, ""));
      }
    }
  }
  return out;
}

/**
 * ⛔⛔ **註解要先剝掉，⛔ 不然這張表會退化成「全部都是輸入」。**
 *
 * ⚠️ 這是量到的，⛔ 不是潔癖：這個 repo 的註解**大量引用路徑**（而且照慣例用
 * 反引號括起來）。第一版沒剝，於是 `tools/roster-guard/check.ts` 檔頭那句
 * 「⋯見 `apps/client/src/…`」讓 **`apps/client/src` 變成 roster:check 的輸入前綴**，
 * 改一行客戶端程式就被判成要跑 26 支 —— ⭐ 正好是這支工具要消滅的那個結論。
 *
 * ⚠️ 剝過頭是**安全**的方向（少一條輸入 ⇒ 那個路徑對不到任何表 ⇒ fail-closed 全跑），
 * ⛔ 剝不夠才是危險的（把註解裡的路徑當成真的輸入 ⇒ 計畫永遠是全跑 ⇒ 沒有人會用它）。
 */
export function stripComments(text, file) {
  const py = /\.(py|sh)$/.test(file);
  const balanced = (s) => ((s.match(/"/g)?.length ?? 0) % 2 === 0 && (s.match(/'/g)?.length ?? 0) % 2 === 0 && (s.match(/`/g)?.length ?? 0) % 2 === 0);
  const noBlock = py ? text : text.replace(/\/\*[\s\S]*?\*\//g, " ");
  const line = py ? "#" : "//";
  return noBlock
    .split("\n")
    .map((l) => {
      let i = l.indexOf(line);
      while (i >= 0) {
        if (balanced(l.slice(0, i))) return l.slice(0, i);
        i = l.indexOf(line, i + line.length);
      }
      return l;
    })
    .join("\n");
}

/** 一份原始碼裡所有**對得上 git 追蹤路徑**的字面值（⛔ 不是任何看起來像路徑的字串）。 */
function literals(text, known) {
  const out = new Set();
  for (const m of text.matchAll(/["'`]([^"'`\n\s]+)["'`]/g)) {
    const s = m[1].replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
    if (s && known.has(s)) out.add(s);
  }
  return out;
}

/**
 * 每一支的輸入表。三個欄位刻意分開，⭐ 因為它們的**證據強度不同**（回報時要說得出來）：
 *   `files`    —— 指名到檔（量到的讀 or 原始碼字面值）
 *   `dirs`     —— 那些檔的**父目錄**：新加一份 ability JSON 也要算它的輸入
 *   `prefixes` —— 整棵子樹（產生器自己的目錄、字面值指到的目錄）
 * ⚠️ depth-1 的裸 root（`"content"`／`"docs"`）**只**算進宇宙，⛔ 不當成 prefix ——
 * 否則一支 `join(ROOT,"docs",…)` 的產生器會把每一次 docs 改動都變成 hit，整張計畫就退化成全跑。
 */
export function inputTable(repo, io, scripts) {
  const { files: tracked, known } = knownPaths(repo);
  const byName = new Map(io.steps.map((s) => [s.name, s]));
  const chainSteps = (io.chainNow ?? io.chain).split("&&").map((s) => s.trim().replace(/^pnpm\s+/, ""));
  const table = new Map();
  const roots = new Set();
  const note = (p) => roots.add(p.split("/")[0]);

  for (const name of chainSteps) {
    const io1 = byName.get(name);
    const t = { name, files: new Set(), dirs: new Set(), prefixes: new Set(), opaque: !io1 || io1.readCount === 0 };
    for (const r of io1?.reads ?? []) {
      t.files.add(r);
      t.dirs.add(dirname(r));
      note(r);
    }
    /**
     * ⭐⭐ **第 ④ 個來源:寫出去的地方回推它讀過的目錄。**
     *
     * ⚠️ 這一條是**量到的洞**,⛔ 不是保險:`merge-io.mjs` 的 `reads` 刻意只留
     * 「有人寫過」的檔(否則 20KB→2.5MB)。⇒ 一整個**沒有任何產生器在寫**的集合
     * (status-effects · maps · arenas · projectiles · skins · loot-tables)
     * 對每一支的 `reads` 都是**空的** —— 實測 `content:build` 真的讀 8,944 個檔,
     * 而表上只剩 563,其中 `content/status-effects/` **一個都沒有**。
     * ⇒ 改一份狀態效果文件,計畫只挑 3 支而 ⛔ **`content:build` 不在裡面**,
     * 於是 `bundle.json` 停在舊的那一天 —— ⭐ 那正是 2026-08-01 事故的形狀
     * (過期的 bundle 帶著全綠的測試上線,選人畫面整個空掉)。
     *
     * ⭐ 而**證據就在它自己的產物上**:它寫了 `content/status-effects/_index.json`,
     * 而一份索引**不可能**在沒有列舉那個目錄的情況下產生出來。
     * ⇒ 「寫進 `<dir>/` ⇒ 讀過 `<dir>/`」對索引/打包型的產生器是**推導**,
     * 對其餘的是**保守的上界**(多算 ⇒ 多跑一支,⛔ 不會漏掉一支)——
     * 與 `graph.mjs` 對「就地改寫型」的處理是同一個方向。
     *
     * ⚠️ depth-1 的裸 root(`content`/`docs`)仍然**只**算宇宙:`content:build` 也寫
     * `docs/`,而把 `docs` 當成它的前綴會讓每一次文件改動都拖著它跑(⛔ 它不讀 docs)。
     */
    for (const w of io1?.writes ?? []) {
      note(w);
      const d = dirname(w);
      if (d.includes("/")) t.prefixes.add(d);
    }
    for (const entry of entryFiles(scripts, name)) {
      note(entry);
      // ⭐ `tools/<dir>/` 整棵算它的；`scripts/x.sh` 這種就只算那一個檔
      //   （⛔ prefix 給到 `scripts` 會把每一支 shell 腳本的改動都算進來）。
      t.prefixes.add(entry.startsWith("tools/") ? entry.split("/").slice(0, 2).join("/") : entry);
      for (const f of tracked) {
        if (!f.startsWith(`${dirname(entry)}/`) || !SRC.test(f) || f.includes("/out/")) continue;
        for (const lit of literals(stripComments(readFileSync(join(repo, f), "utf8"), f), known)) {
          note(lit);
          if (!lit.includes("/")) continue; // 裸 root ⇒ 只算宇宙
          if (tracked.has(lit)) {
            t.files.add(lit);
            t.dirs.add(dirname(lit));
          } else t.prefixes.add(lit); // 追蹤到的是目錄 ⇒ 整棵
        }
      }
    }
    table.set(name, t);
  }
  return { table, roots, chainSteps };
}

const hit = (t, p) =>
  t.files.has(p) ||
  t.dirs.has(dirname(p)) ||
  [...t.prefixes].some((pre) => p === pre || p.startsWith(`${pre}/`));

/**
 * ⭐ 計畫本體。回傳的 `full` / `reasons` 是**證據**，⛔ 不是一句「建議全跑」。
 */
export function planFor({ io, table, roots, chainSteps, paths, chainStale }) {
  const g = buildGraph(io);
  const names = g.steps.map((s) => s.name);
  const succ = names.map(() => []);
  for (const e of g.edges) succ[e.from].push(e.to);

  const reasons = new Map();
  const unknown = [];
  let full = chainStale ? "sync-io.json 的 chain 跟 package.json 對不上 ⇒ 表過期,⛔ 新加的產生器對它是不存在的" : null;

  for (const [name, t] of table) if (t.opaque) reasons.set(name, "探針全空(⇒ 不可信,一律跑)");

  for (const p of paths) {
    if (!roots.has(p.split("/")[0])) continue; // ⭐ 整個 root 不在產生器的宇宙裡
    const owners = chainSteps.filter((n) => table.get(n) && hit(table.get(n), p));
    if (!owners.length) {
      unknown.push(p);
      full ??= `改動路徑對不到任何產生器的輸入表: ${p}`;
      continue;
    }
    for (const n of owners) if (!reasons.has(n)) reasons.set(n, `讀 ${p}`);
  }

  const sel = new Set(full ? chainSteps.map((n) => names.indexOf(n)).filter((i) => i >= 0) : []);
  if (!full) {
    const stack = [...reasons.keys()].map((n) => names.indexOf(n)).filter((i) => i >= 0);
    for (const i of stack) sel.add(i);
    while (stack.length) {
      const i = stack.pop();
      for (const j of succ[i]) {
        if (sel.has(j)) continue;
        sel.add(j);
        reasons.set(names[j], `下游 ← ${names[i]}`);
        stack.push(j);
      }
    }
  }

  const order = [...sel].sort((a, b) => a - b);
  const pos = new Map(order.map((v, i) => [v, i]));
  const sub = {
    steps: order.map((i) => g.steps[i]),
    edges: g.edges.filter((e) => sel.has(e.from) && sel.has(e.to)).map((e) => ({ from: pos.get(e.from), to: pos.get(e.to) })),
  };
  /**
   * ⭐ **圖上沒有的那幾支**（package.json 加了第 33 支而 `sync-io.json` 還沒重量）。
   * ⛔ 不可以把它們從計畫裡漏掉 —— 那正是「新加的產生器對這張表是不存在的」那個洞。
   * ⚠️ 圖不知道它們該排在哪一層 ⇒ ⛔ 不要用並行排程,這一輪串行跑完整條鏈。
   */
  const unmeasured = chainSteps.filter((n) => !names.includes(n));
  const picked = order.map((i) => names[i]);
  return {
    full: Boolean(full),
    fullReason: full,
    unknown,
    unmeasured,
    steps: full ? chainSteps : [...picked, ...unmeasured],
    skipped: full ? [] : names.filter((_, i) => !sel.has(i)),
    layerNames: layers(sub).map((row) => row.map((v) => names[order[v]]).sort()),
    reasons: Object.fromEntries(reasons),
    ms: order.reduce((s, i) => s + (g.steps[i].ms ?? 0), 0),
    msAll: g.steps.reduce((s, x) => s + (x.ms ?? 0), 0),
  };
}

/** 便利入口：讀真的 repo，算一份計畫。 */
export function planFromPaths(paths, repo = REPO) {
  const io = loadIo(join(HERE, "sync-io.json"));
  const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  const chainStale = pkg.scripts?.[io.script] !== io.chain;
  const scripts = readScripts(repo);
  // ⭐ chain 過期時仍然照**現在的** package.json 列步驟(⛔ 不是照過期的那份),
  //   這樣「新加的第 33 支」在全跑清單裡有名字。
  const { table, roots, chainSteps } = inputTable(repo, { ...io, chainNow: pkg.scripts?.[io.script] ?? io.chain }, scripts);
  return planFor({ io, table, roots, chainSteps, paths, chainStale });
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : d);
  const paths = arg("--paths", null)
    ? arg("--paths").split(",").map((s) => s.trim()).filter(Boolean)
    : [...git(REPO, ["diff", "--name-only", arg("--base", "HEAD")]), ...git(REPO, ["ls-files", "--others", "--exclude-standard"])];
  const p = planFromPaths(paths);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ paths, ...p }, null, 2));
    process.exit(0);
  }
  console.log(`\n⭐ skills:sync 裁剪計畫 —— 改動 ${paths.length} 個路徑 ⇒ 要跑 ${p.steps.length}/${p.skipped.length + p.steps.length} 支`);
  console.log(`   串行估計 ${(p.ms / 1000).toFixed(1)}s（全跑 ${(p.msAll / 1000).toFixed(1)}s）`);
  if (p.full) console.log(`   ⛔ **fail-closed 全跑** —— ${p.fullReason}`);
  if (p.unmeasured.length)
    console.log(
      `   ⛔ 這幾支不在量測表裡: ${p.unmeasured.join(" · ")}\n` +
        `      ⇒ 圖不知道它們排在哪一層,這一輪**串行**跑 pnpm skills:sync,並重量 sync-io.json（見 trace.mjs）`,
    );
  p.layerNames.forEach((row, i) => console.log(`   層 ${String(i).padStart(2)} (${String(row.length).padStart(2)} 支): ${row.join(" · ")}`));
  if (!p.full) {
    console.log(`\n   為什麼要跑:`);
    for (const [n, why] of Object.entries(p.reasons)) console.log(`     ${n.padEnd(24)} ${why}`);
    console.log(`\n   ⏭ 不用跑 (${p.skipped.length}): ${p.skipped.join(" · ")}`);
  }
  console.log(`\n   ⛔ 這支只印計畫。真的要跑: node tools/parallel-gates/sync.mjs（⚠️ 全域鎖）\n`);
}
