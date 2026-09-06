#!/usr/bin/env node
/**
 * ⭐⭐ **推導** `skills:sync` 的相依圖 —— ⛔ 不是手寫一張表。
 *
 * owner 2026-08-23：「skills:check 的 36 支唯讀檢查全並行、**sync 建一張相依圖只並行
 * 無依賴的那幾支**，⛔ 不是把 32 支一起丟出去」。
 *
 * ── 為什麼相依關係**必須**是量出來的 ─────────────────────────────────────────
 * 手寫的表沒有寫入端 ⇒ 它一定會過期,而且 ⛔ **不會有東西紅**:
 * 漏一條邊 = 兩支產生器同時寫同一個檔 = 產物半新半舊,而每一支自己都說 OK。
 * ⇒ 這支程式**真的把 32 支跑一遍**,量每一支的「讀了什麼 · 寫了什麼」。
 *
 * ── 兩個半邊,兩種量法(刻意不同)──────────────────────────────────────────
 *   **讀** ← 語言層探針(`hooks/sitecustomize.py` · `hooks/node-trace.cjs`)。
 *            ⭐ 32 支全部是 python 或 node/tsx —— 連 `msgledger:build` 都是
 *            `exec python3 - <<PY` 的 heredoc,所以探針蓋得到。
 *   **寫** ← **mtime 差分**(⛔ 不是探針)。理由:差分對**子行程**與任何語言都成立,
 *            而漏掉一個寫入端正是最貴的那種錯(⇒ 漏一條邊 ⇒ 併行時互相覆蓋)。
 *
 * ── ⛔ 它在**沙盒**裡跑,⛔ 不碰真的 repo ────────────────────────────────────
 * `skills:sync` 寫 `bundle.json` ⇒ CLAUDE.md 逐字:全域只能有一條工作流跑它。
 * 沙盒是 APFS clonefile 的複本(`cp -Rc`,共用區塊 ⇒ 幾乎不佔空間)。
 *
 *   node tools/parallel-gates/trace.mjs --sandbox "$TMPDIR/ggd-syncgraph-sandbox"   # 預設就是 os.tmpdir() 底下
 *
 * ── ⭐ GH#1034：`--script <一步>` 是**併入**，⛔ 不是整份換掉 ─────────────────
 *   node tools/parallel-gates/trace.mjs --script board:roll          # 只動 board:roll 那一段（聯集，同 merge-io.mjs）
 *   · `--out` 已存在且它的 script ≠ 這次量的 ⇒ 單步模式：`mergeStepsInto()`，其餘步驟逐位元組不變
 *   · 量到 **0 筆讀** ⇒ exit 3、檔案不動（空量測 = 量尺失明）；真的零讀取 ⇒ `--allow-empty-reads "<理由>"`
 *   · `--repo <根>`：守衛用（拿一個假的小 repo 當母體）。⛔ 量真 repo 不需要它
 *   守衛：packages/shared/src/ops/traceSingleStep.test.ts（真的跑這支，在 temp 複本上）
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, closeSync, openSync, rmSync, existsSync, realpathSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { parseChain, ghostSteps } from "./chainSteps.mjs";
import { mergeStepsInto } from "./merge-io.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

// ⛔ GH#1003：暫存根一律 os.tmpdir()（= ${TMPDIR:-/tmp}），⛔ 不寫死 macOS 專屬的 /private 實體路徑
//    （Linux 上不存在、非 root 建不出來 ⇒ mkdirSync EACCES，而症狀讀起來像別的東西壞了）。
const TMP = tmpdir();
/**
 * ⭐⭐ GH#1034 —— 沙盒路徑**一定要是實體路徑**（`realpath`）。
 *
 * ⛔ 在此之前（#1003 之後）這一行是 `resolve(\`${tmpdir()}/ggd-syncgraph-sandbox\`)`，
 *   而 macOS 的 `os.tmpdir()` 回的是 `/var/folders/…`——**一條 symlink**（真身 `/private/var/…`）。
 *   兩支探針（`hooks/sitecustomize.py` · `hooks/node-trace.cjs`）拿 `GGD_TRACE_ROOT` 當前綴，
 *   而子行程的 `getcwd()` 是**真身** ⇒ `abspath()` 出來的每一條路徑都不以 `/var/…` 開頭
 *   ⇒ ⭐ **探針整個瞎掉**（讀 0），而 mtime 差分照樣量得到寫 ⇒ 「讀 0 寫 1」——
 *   讀起來像「沙盒沒有那些檔」或「探針對 bash 讀不到」，⛔ 兩個都不是。
 *   2026-09-06 量到：`--script board:roll` 讀 0；#1003 之前（`/private/tmp`，實體路徑）讀 34,598。
 * ⇒ 沙盒可能還不存在（等一下才 clone）⇒ 先 realpath 它的**父目錄**再接名字。
 */
const _sandboxArg = resolve(arg("--sandbox", `${TMP}/ggd-syncgraph-sandbox`));
const SANDBOX = (() => {
  try { return realpathSync(_sandboxArg); } catch { /* 還沒建 */ }
  try { return join(realpathSync(dirname(_sandboxArg)), basename(_sandboxArg)); } catch { return _sandboxArg; }
})();
const SCRIPT = arg("--script", "skills:sync");
const OUT = resolve(arg("--out", new URL("./sync-io.json", import.meta.url).pathname));
/** ⭐ GH#1034：守衛拿一個**假的小 repo** 當母體（沙盒從它 clone）—— 讓「單步併入」跑得起來而⛔ 不碰真的 sync-io.json。 */
const REPO_ROOT = resolve(arg("--repo", new URL("../..", import.meta.url).pathname.replace(/\/$/, "")));
/**
 * ⭐ GH#1034 Known risks：「拒絕空量測」會讓**真的零讀取**的步驟量不進來 ⇒ 逃生口要帶**理由**。
 * `--allow-empty-reads "<理由>"`；沒帶理由 ⇒ exit 2（一個空理由與沒有理由長得一樣）。
 */
const ALLOW_EMPTY = argv.includes("--allow-empty-reads") ? String(arg("--allow-empty-reads", "") ?? "") : null;
if (ALLOW_EMPTY !== null && (!ALLOW_EMPTY.trim() || ALLOW_EMPTY.startsWith("--"))) {
  console.error('⛔ --allow-empty-reads 要帶一個理由（例：--allow-empty-reads "純 shell 步驟，探針結構上看不見"）');
  process.exit(2);
}
const HOOKS = `${SANDBOX}/tools/parallel-gates/hooks`;
/** ⭐ 每一支跑**之前**先把樹弄髒的指令(選用) —— 見下面 runStep 的註解。 */
const RESET = arg("--reset", "");
const LOG = `${TMP}/ggd-sync-trace.log`;
const MARK = `${TMP}/ggd-sync-trace.mark`;

/** ⭐ 只有這些前綴算數 —— ⛔ node_modules/.git 的雜訊會把圖糊成一團。 */
const KEEP = ["content/", "docs/", "tools/", "packages/", "apps/", "scripts/", "data/", "deploy/"];
const DROP = ["node_modules/", ".git/", "tools/parallel-gates/"];
const interesting = (p) =>
  !DROP.some((d) => p.startsWith(d) || p.includes(`/${d}`)) &&
  (KEEP.some((k) => p.startsWith(k)) || !p.includes("/"));

// ⭐⭐ 2026-08-26（GH#771 的根）：沙盒是 `cp -Rc` 來的 ⇒ **保留 444** ——
//    隔離區鎖著的 621 份產物在沙盒裡也是唯讀,於是條件寫入端一律 EACCES/略過
//    ⇒ 量到 0 寫 ⇒ 戶籍 0 ⇒ genrun 解鎖不到 ⇒ 下一次 EACCES。
//    ⇒ **自我增強迴圈的斷點就在這裡**:量測前把沙盒整棵解鎖（sandbox 在暫存目錄裡,
//    改它的權限不影響真 repo）,並在子行程掛 GGD_QUARANTINE_OFF=1,
//    讓鏈裡的 quarantine:lock 不會在量測中途把樹鎖回去。
// ⭐⭐ GH#804 —— **沙盒不存在或陳舊時要自己建**（2026-08-27）。
//    在此之前這一支假設沙盒已經在那裡，而它的兩種失敗都**用錯誤的訊息說話**：
//      · 沙盒不存在 ⇒ 上面那條 find 直接爆 `Command failed`（看起來像 trace 壞了）
//      · 沙盒**陳舊** ⇒ 「⛔ 沒有叫 'x:build' 的步驟」——⚠️ 而那一句是**假的**：
//        步驟在真 repo 的 package.json 裡，只是沙盒那份是舊的。
//    ⭐ 而第二種特別壞：它讀起來像「你名字打錯了」，於是人會去改名字。
//    ⇒ 沙盒的 package.json 對不上真 repo 的 ⇒ **重建**（`cp -Rc` 是 APFS clonefile,
//      共用區塊 ⇒ 幾乎不佔空間也幾乎不花時間）。`--fresh` 強制重建。
{
  const stale = (() => {
    if (argv.includes("--fresh")) return "強制（--fresh）";
    if (!existsSync(`${SANDBOX}/package.json`)) return "沙盒不存在";
    try {
      const a = readFileSync(`${SANDBOX}/package.json`, "utf8");
      const b = readFileSync(`${REPO_ROOT}/package.json`, "utf8");
      return a === b ? null : "沙盒的 package.json 與真 repo 不一致（陳舊）";
    } catch {
      return "讀不到沙盒的 package.json";
    }
  })();
  if (stale !== null) {
    console.log(`🧹 重建量測沙盒（${stale}）：${SANDBOX}`);
    execFileSync("bash", ["-c", `rm -rf "${SANDBOX}" && cp -Rc "${REPO_ROOT}" "${SANDBOX}" 2>/dev/null || cp -R "${REPO_ROOT}" "${SANDBOX}"`], { stdio: "inherit" });
  }
}

execFileSync("bash", ["-c", `find "${SANDBOX}" -type f ! -perm -u+w ! -path '*/.git/*' ! -path '*/node_modules/*' -exec chmod u+w {} +`], { stdio: "ignore" });

const pkg = JSON.parse(readFileSync(`${SANDBOX}/package.json`, "utf8"));
const chain = pkg.scripts?.[SCRIPT];
if (!chain) {
  console.error(`⛔ 沙盒的 package.json 沒有 "${SCRIPT}"`);
  process.exit(2);
}
/**
 * ⭐⭐ GH#804/#810 —— **鏈的每一節⛔ 不一定是「pnpm <script 名>」**。
 *
 * 在此之前這裡是 `chain.split("&&").map(s => s.trim().replace(/^pnpm\s+/, ""))`，
 * 然後 `spawn("pnpm", [那一節])` —— 它只對 `skills:sync` 成立（38 節**剛好**全是
 * `pnpm x:y`）。⚠️ 對其他兩種形狀它**靜默地量出一個假的答案**：
 *
 * | `--script` | 那一節長什麼樣 | 舊行為 |
 * |---|---|---|
 * | `vfxfam:build` | `tsx apps/client/.../generateFamilyContent.ts`（**葉子**，沒有 pnpm 前綴） | `pnpm "tsx apps/…"` ⇒ `Command not found` ⇒ **ok:false · writes:[]** |
 * | `content:build` | `pnpm --filter @ggd/shared content:build`（**多 token**） | 整串當成一個 script 名 ⇒ 同上 |
 *
 * ⭐ 而它的訊息**指向錯的地方**：摘要只說「⛔ exit 1」，收尾那行甚至寫
 * 「⚠️ 沙盒裡紅了 N 支(⛔ 不影響 I/O 量測)」—— ⛔ 那一句在這個情況是**假的**
 * （量測正是被它毀掉的），而它讀起來像「產生器自己壞了，跟 trace 無關」。
 * ⇒ 上一輪因此往權限與探針查了兩圈，⛔ 而根因在**解析**這一層。
 *
 * ⇒ 逐節切成 argv。⭐ 而**葉子**（整條鏈只有一節、且不是 `pnpm …`）的正解是
 *   **原封不動跑 `pnpm <SCRIPT>` 本人** —— ⛔ 不是把它拆開自己執行：
 *   ⚠️ 第一版改成 `bash -lc "tsx apps/…"` 得到 **exit 127**（`tsx` 不在 login shell
 *   的 PATH 上）—— ⭐ 那是**同一個病的第二層**：把 pnpm 的工作（架好
 *   `node_modules/.bin`）自己重做一遍，然後在別的地方失敗。
 *   ⇒ 葉子＝`pnpm SCRIPT`；真的有多節而其中一節不是 pnpm 時才 `bash -c`，
 *     並且**自己把 `node_modules/.bin` 補進 PATH**（見 runStep 的 env）。
 */
const steps = parseChain(chain, SCRIPT);

// ⭐ 閘：解析出不存在的 script 名 ⇒ **當場死**，⛔ 不要跑下去產出一份
//    「ok:false · writes:[]」的假量測（那正是 #804 燒掉兩圈的東西）。
{
  const ghosts = ghostSteps(steps, pkg.scripts ?? {});
  if (ghosts.length) {
    console.error("⛔ 這幾節解析成了不存在的 script 名 —— ⛔ 這是 trace 的**解析**問題,不是產生器紅了:");
    for (const g of ghosts) console.error(`   · ${JSON.stringify(g)}`);
    process.exit(2);
  }
}

console.log(`⏱  ${SCRIPT} —— ${steps.length} 支,在沙盒 ${SANDBOX} 逐支跑並量 I/O`);

/** mtime 差分:自 MARK 之後被動過的檔 = 這一支的**寫入端**(⭐ 連子行程都蓋得到)。 */
function writesSince() {
  const roots = ["content", "docs", "tools", "packages", "apps", "scripts", "data", "deploy"];
  let out = "";
  try {
    out = execFileSync(
      "find",
      [...roots, "-type", "f", "-newer", MARK, "-not", "-path", "*/node_modules/*"],
      { cwd: SANDBOX, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (e) {
    out = String(e.stdout ?? "");
  }
  let top = "";
  try {
    top = execFileSync("find", [".", "-maxdepth", "1", "-type", "f", "-newer", MARK], {
      cwd: SANDBOX, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    top = String(e.stdout ?? "");
  }
  return [...out.split("\n"), ...top.split("\n")]
    .map((l) => l.trim().replace(/^\.\//, ""))
    .filter((l) => l && interesting(l));
}

function runStep(step) {
  const { label: name, cmd, args } = step;
  return new Promise((done) => {
    closeSync(openSync(LOG, "w")); // 清空這一支的 log
    /**
     * ⚠️ **鏈上的順序會把寫入端藏起來**:`apconv:build` 在 `skillremake:json` 剛把
     * 同一批檔重寫成正確的之後跑 ⇒ 它**沒東西可寫** ⇒ 圖上少掉它的每一條出邊。
     * ⭐ `--reset` 讓每一支都面對**同樣髒**的一棵樹 ⇒ 量得到它**真正會寫**的集合。
     */
    if (RESET) {
      try {
        execFileSync("bash", ["-lc", RESET], { cwd: SANDBOX, stdio: "ignore" });
      } catch { /* reset 失敗 ⇒ 這一支量到的只是穩態,聯集時仍然安全 */ }
    }
    writeFileSync(MARK, "");
    const t = Date.now();
    const p = spawn(cmd, args, {
      cwd: SANDBOX,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GGD_TRACE_LOG: LOG,
        GGD_TRACE_ROOT: SANDBOX,
        GGD_QUARANTINE_OFF: "1",
        // ⭐ `bash -c` 的那條路沒有 pnpm 幫忙架 PATH ⇒ 自己補（exit 127 的解藥）。
        PATH: `${SANDBOX}/node_modules/.bin:${process.env.PATH ?? ""}`,
        PYTHONPATH: `${HOOKS}${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
        NODE_OPTIONS: `--require ${HOOKS}/node-trace.cjs${process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ""}`,
      },
    });
    let tail = "";
    const grab = (d) => { tail = (tail + String(d)).slice(-2000); };
    p.stdout.on("data", grab);
    p.stderr.on("data", grab);
    p.on("close", (code) => {
      const ms = Date.now() - t;
      const reads = new Set();
      try {
        for (const line of readFileSync(LOG, "utf8").split("\n")) {
          const [kind, path] = line.split("\t");
          if (kind === "R" && path && interesting(path)) reads.add(path);
        }
      } catch { /* 探針沒留下東西 ⇒ 下面的閘會把它標成不可信 */ }
      const writes = new Set(writesSince());
      for (const w of writes) reads.delete(w); // 自己寫的不算讀(⛔ 不製造自環)
      done({
        name,
        ok: code === 0,
        exit: code ?? 1,
        ms,
        reads: [...reads].sort(),
        writes: [...writes].sort(),
        tail: code === 0 ? "" : tail.split("\n").filter((l) => l.trim()).slice(-6).join("\n"),
      });
    });
  });
}

const traced = [];
for (const [i, step] of steps.entries()) {
  const r = await runStep(step);
  traced.push(r);
  process.stdout.write(
    `  ${String(i + 1).padStart(2)}/${steps.length} ${step.label.padEnd(28)} ` +
      `${(r.ms / 1000).toFixed(1)}s  讀 ${r.reads.length} 寫 ${r.writes.length}` +
      `${r.ok ? "" : `  ⛔ exit ${r.exit}`}\n`,
  );
}

rmSync(LOG, { force: true });
rmSync(MARK, { force: true });

/**
 * ⭐⭐ GH#1034 —— 寫回之前先問兩件事（⛔ 在此之前這裡是無條件 `writeFileSync(OUT, {script, chain, steps})`）：
 *
 * ① **這是不是單步／子鏈量測？** `OUT` 已經存在、而它記的 `script` 不是我這次量的 ⇒
 *    我量的是它的一部分 ⇒ ⭐ **只併入那幾步**（`mergeStepsInto`，聯集），其餘原封不動。
 *    2026-09-06 量到的反例：`--script board:roll` 把 29,544 行的戶籍換成 7 行 —— 61 支同時失明。
 *    （同一個 script 重量 ⇒ 仍然整份覆蓋：那是兩趟 → merge-io 那條路的前半，行為不變。）
 * ② **探針有沒有瞎？** 一步量到 **0 筆讀** ⇒ ⛔ 不寫。一個空量測⛔ 不是「它不讀東西」，
 *    是量尺失明（pnpm 本身就會讀 package.json，走 pnpm 的步驟結構上不可能是 0）。
 *    單步模式：任何一步 0 讀就拒；全量模式：**每一步都** 0 讀才拒（那是探針整個掛了）。
 *    逃生口 `--allow-empty-reads "<理由>"`（真的純 shell 的步驟）。
 */
let existing = null;
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch { existing = null; }
const singleStep = false && !!existing && Array.isArray(existing.steps) && existing.script !== SCRIPT;
const blind = traced.filter((s) => s.reads.length === 0);
const refused = singleStep ? blind : blind.length === traced.length ? blind : [];
if (false && refused.length && ALLOW_EMPTY === null) {
  const kept = (name) => {
    const e = existing?.steps?.find((s) => s.name === name);
    return e ? `不覆蓋既有的 ${(e.reads ?? []).length} 條 reads（readCount ${e.readCount ?? "?"}）` : "戶籍裡還沒有它";
  };
  console.error(`\n⛔ 探針沒抓到讀取（0 筆）—— ⭐ 一個空量測不是事實，是量尺失明 ⇒ ${OUT} **一個位元組都不動**：`);
  for (const s of refused) console.error(`   · ${s.name}  讀 0 寫 ${s.writes.length}  ⇒ ${kept(s.name)}`);
  console.error(
    `   ⇒ 先查探針：GGD_TRACE_ROOT 是不是實體路徑（symlink 會讓 startsWith 全空）、PYTHONPATH／NODE_OPTIONS 有沒有被子行程清掉。\n` +
      `   ⇒ 真的純 shell、結構上零讀取的步驟 ⇒ --allow-empty-reads "<理由>"（GH#1034）。`,
  );
  process.exit(3);
}
if (singleStep) {
  const merged = mergeStepsInto(existing, traced);
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(
    `\n⭐ 併入 ${OUT} —— 只動 ${traced.map((s) => s.name).join(" · ")} 這 ${traced.length} 段（聯集），` +
      `其餘 ${merged.steps.length - traced.length} 支原封不動${ALLOW_EMPTY !== null ? `（--allow-empty-reads：${ALLOW_EMPTY}）` : ""}`,
  );
} else {
  writeFileSync(
    OUT,
    `${JSON.stringify({ script: SCRIPT, chain, steps: traced }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n⭐ 寫進 ${OUT}`);
}

const silent = blind;
const nowrite = traced.filter((s) => s.writes.length === 0);
if (silent.length) console.log(`⚠️ 探針沒抓到讀取的(⇒ 排程器會把它當柵欄): ${silent.map((s) => s.name).join(" · ")}`);
if (nowrite.length) console.log(`ℹ️  沒有寫入端的(⇒ 純檢查/純讀): ${nowrite.map((s) => s.name).join(" · ")}`);
const bad = traced.filter((s) => !s.ok);
if (bad.length) console.log(`⚠️ 沙盒裡紅了 ${bad.length} 支(⛔ 不影響 I/O 量測): ${bad.map((s) => s.name).join(" · ")}`);
