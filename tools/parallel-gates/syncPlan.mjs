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
 * 五個來源，全部可以被反駁：
 *   ① **量到的讀**（`sync-io.json` 的 `reads`）—— `trace.mjs` 真的把 32 支跑一遍量的。
 *   ② **產生器自己的原始碼**裡出現的路徑字面值（要真的對得上一個 git 追蹤的檔或目錄）。
 *      ⚠️ ①**不夠**：`merge-io.mjs` 刻意只留「有人寫過」的讀（否則檔案 20KB→2.5MB），
 *      所以 `treasure:csv` 讀了 98 個檔卻在表上是 `reads: []`。②補的正是這一半。
 *   ③ **產生器自己**（`tools/<dir>/` 或那支 `scripts/*.sh`）—— 程式改了它一定要重跑。
 *      ⭐ GH#1166：入口要穿過 `bash scripts/genrun.sh <step> <raw>` 才找得到（見 entryFiles）。
 *   ⑤ **產生器原始碼的程式參照**（import／`@ggd/*`／別的 `tools/<dir>`）—— 見 codeRefs。
 *      ⚠️ ③一接上 genrun，改產生器原始碼就從「全跑」變成「裁剪」⇒ 跨目錄相依第一次需要被看見。
 *   （④＝寫出去的目錄回推讀過的目錄，見 inputTable 內文。）
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
const GENRUN = "scripts/genrun.sh";

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
 *
 * ⭐⭐ GH#1166 —— **也要遞迴解 `bash scripts/genrun.sh <step> [<raw>]`**。
 * ⛔ 在此之前這一支只認 `pnpm …`，而 GH#815 之後鏈上 **65/69 步**的公開名都是 genrun 包裝
 * ⇒ 入口只剩 `scripts/genrun.sh` 一個檔 ⇒ **63 步解析不到自己的產生器原始碼**
 * ⇒ 改 `tools/skill-remake/apply_tiers.py`／`tools/balance-anchors/gen.ts` 這種「產生器本人」
 *   一律對不到輸入表 ⇒ fail-closed **全跑 69 步**（安全，⛔ 但裁剪對產生器改動整個失效）。
 * ⭐ 語意照抄 genrun.sh 本人：`RUN="${2:-$STEP}"`，而它先 `cd` 到 repo 根再 `pnpm "$RUN"`
 *   ⇒ 遞迴的 home 是根（`""`）。⛔ 不猜 `<step>:raw` 這個命名慣例 —— 讀的是**它真的傳的參數**。
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
      const gr = /^(?:bash\s+)?(?:\.\/)?(scripts\/genrun\.sh)\s+([\w:.@/-]+)(?:\s+([\w:.@/-]+))?$/.exec(part);
      if (gr) {
        out.add(GENRUN);
        for (const f of entryFiles(scripts, gr[3] ?? gr[2], "", seen)) out.add(f);
        continue;
      }
      // ⭐ GH#1166：`pnpm --filter @ggd/shared exec tsx scripts/x.ts` 的路徑是**那個套件**的相對路徑
      //   （⛔ 不是寫這行的 package.json 的）；套件名本身（`@ggd/shared`）⛔ 不是路徑。
      const ex = /^pnpm\s+--filter\s+(\S+)\s+exec\s/.exec(part);
      const at = ex ? Object.values(scripts).flat().find((x) => x.name === ex[1])?.home ?? e.home : e.home;
      for (const tok of part.split(/\s+/)) {
        if (tok.includes("/") && !tok.startsWith("-") && !tok.startsWith("@")) out.add(join(at, tok).replace(/^\/+/, ""));
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
 * ⭐⭐ GH#1166 —— 一份原始碼的**程式參照**（⛔ 不是路徑字面值那一種）：
 *   · 相對 import／require（`../../packages/shared/src/x.ts`、`./lib.js`→`lib.ts`）⇒ 解析到的**檔**
 *   · workspace 套件（`@ggd/shared`）⇒ 那個套件的**整棵目錄**
 *   · 別的 `tools/<dir>`（python 的 `sys.path.insert(…"tools", "engine-vocab")`、`tools/x/…`）⇒ **整棵**
 *
 * ⚠️ 為什麼 genrun 遞迴**必須**連著它一起落地（量到的，⛔ 不是保險）：
 * 在此之前改產生器原始碼一律 fail-closed 全跑 ⇒ 跨目錄的相依**從來不需要被看見**。
 * 遞迴一接上，`tools/engine-vocab/engine_vocab.py` 就從「全跑」變成「44 支、⛔ 不含 `contract:numbers`」——
 * 而 `tools/editor-contract/gen_contract_numbers.py` 用 `sys.path` 吃它 ⇒ ⭐ **裁剪第一次有機會漏跑**。
 * ⇒ 這一支是**上界**（多算 ⇒ 多跑一支，⛔ 不會少一支）；python 的 `from x import` 沒有路徑可解，
 *   靠「整棵 `tools/<dir>`」兜住。
 */
const CODE = /\.(m?[jt]sx?|cjs|cts)$/;
function codeRefs(text, file, known, pkgDirs) {
  const files = new Set();
  const prefixes = new Set();
  if (CODE.test(file)) {
    const specs = text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["'`]([^"'`\n]+)["'`]/gm);
    for (const [, spec] of specs) {
      if (!spec.startsWith(".")) {
        const dir = pkgDirs.get(spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/"));
        if (dir) prefixes.add(dir);
        continue;
      }
      const base = join(dirname(file), spec);
      const bare = base.replace(/\.(m|c)?js$/, "");
      const hit = [base, ...[".ts", ".mts", ".tsx", ".js", ".mjs", ".cjs"].map((x) => bare + x), `${base}/index.ts`, `${base}/index.js`]
        .find((c) => !c.startsWith("..") && known.has(c) && SRC.test(c));
      if (hit) files.add(hit);
    }
  }
  for (const [, d] of text.matchAll(/\btools["'`]?\s*[/,]\s*["'`]?([\w.-]+)/g)) {
    if (known.has(`tools/${d}`)) prefixes.add(`tools/${d}`);
  }
  return { files, prefixes };
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
  const memo = (fn) => { const c = new Map(); return (k) => (c.has(k) ? c.get(k) : c.set(k, fn(k)).get(k)); };
  const sources = [...tracked].filter((f) => SRC.test(f) && !f.includes("/out/"));
  const textOf = memo((f) => stripComments(readFileSync(join(repo, f), "utf8"), f));
  const underDir = memo((pre) => sources.filter((f) => f.startsWith(`${pre}/`)));
  const pkgDirs = new Map();
  for (const p of git(repo, ["ls-files", "**/package.json"])) {
    if (p.includes("node_modules/") || p.startsWith("docs/legacy/") || !p.includes("/")) continue;
    try { pkgDirs.set(JSON.parse(readFileSync(join(repo, p), "utf8")).name, dirname(p)); } catch { /* 壞的 package.json ⇒ 少一個套件 ⇒ 那個 import 對不到 ⇒ 少一條輸入（fail-closed 方向） */ }
  }
  const refsOf = memo((f) => codeRefs(textOf(f), f, known, pkgDirs));

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
    const todo = [];
    for (const entry of entryFiles(scripts, name)) {
      note(entry);
      // ⭐ `tools/<dir>/` 整棵算它的；`scripts/x.sh` 這種就只算那一個檔
      //   （⛔ prefix 給到 `scripts` 會把每一支 shell 腳本的改動都算進來）。
      t.prefixes.add(entry.startsWith("tools/") ? entry.split("/").slice(0, 2).join("/") : entry);
      // ⭐ GH#1166：字面值掃描的範圍與 prefix **同一個判準** —— 入口的父目錄是裸 root（`scripts/x.sh`）
      //   ⇒ **只掃那一個檔**。⛔ 掃整個 `scripts/` 會讓鏈上 64 支 genrun 包裝的步驟**全部**吃進
      //   `scripts/**` 裡每一支腳本提過的路徑（ruling.sh、message-ledger.sh⋯）⇒ 假輸入 ⇒ 過度選取。
      // ⭐ GH#1166：genrun.sh 是**包裝** —— 在鏈裡它只做 `pnpm "$RUN"`（真正的入口 entryFiles 已經遞迴解出）
      //   ⇒ 只當 prefix（改它 ⇒ 每一支被包的都要跑），⛔ 不掃它的字面值／程式參照：它的訊息字串提到
      //   `tools/skill-remake/…`，掃進來會讓 64 支全部「讀」那整棵（實測：拿掉遞迴時 ③ 靠這個假輸入照樣綠）。
      if (entry === GENRUN) continue;
      const scope = dirname(entry).includes("/") ? `${dirname(entry)}/` : null;
      for (const f of scope ? underDir(scope.slice(0, -1)) : sources.filter((s) => s === entry)) {
        todo.push(f);
        for (const lit of literals(textOf(f), known)) {
          note(lit);
          if (!lit.includes("/")) continue; // 裸 root ⇒ 只算宇宙
          if (tracked.has(lit)) {
            t.files.add(lit);
            t.dirs.add(dirname(lit));
          } else t.prefixes.add(lit); // 追蹤到的是目錄 ⇒ 整棵
        }
      }
    }
    // ⭐ GH#1166：程式參照閉包（見 codeRefs）—— 從上面掃過的每一份原始碼沿 import／套件／tools/<dir> 往外走。
    //   被 import 的檔**只**進 `files`（⛔ 不進 `dirs`：import 指名到檔，新加的兄弟檔要被改到 import 端才算數）；
    //   ⛔ 也不掃它們的路徑字面值 —— 共用模組的字面值掃進來會讓每一支都「讀」整個 content（過度選取到全跑）。
    const scanned = new Set();
    while (todo.length) {
      const f = todo.pop();
      if (scanned.has(f)) continue;
      scanned.add(f);
      const { files, prefixes } = refsOf(f);
      for (const r of files) {
        t.files.add(r);
        note(r);
        todo.push(r);
      }
      for (const p of prefixes) {
        if (t.prefixes.has(p)) continue;
        t.prefixes.add(p);
        note(p);
        if (p.startsWith("tools/")) todo.push(...underDir(p));
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
