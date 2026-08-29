#!/usr/bin/env node
/**
 * 🧾 **執行期對帳** —— GH#771 Scope③ / AC③：
 * 「任何 step 若在執行中寫了**不在自己 `writes` 裡**的檔 ⇒ 紅」。
 *
 * ── ⭐ 為什麼靜態那一半不夠 ──────────────────────────────────────────────
 * `syncIoDeclaresWrites.test.ts` 已經讓「**宣告 0 份產物**」當場紅。
 * ⛔ 但它問的是**名詞**（這一列是不是空的），問不出**關係**（宣告 ↔ 實際寫入）。
 * ⇒ 兩種洞對它是隱形的，而兩種都真的發生過：
 *
 * | 洞 | 長什麼樣 | 後果 |
 * |---|---|---|
 * | **宣告少了一份** | 戶籍寫 1 份，實際寫 3 份 | 那 2 份沒有被隔離區鎖過 ⇒ `genrun` 解不開它們 ⇒ **EACCES**（#771 的原始症狀） |
 * | **⭐ 根本沒有宣告** | 全戶籍沒有任何 step 認領它 | 任何通道都寫得進去、沒有任何鏈會重生成它 ⇒ 它 stale 很久而**沒有東西紅**（#771 追記量到的 `tts-gen` 三份） |
 *
 * ⭐ CLAUDE.md 失敗形態⑫逐字：「**兩頭都要走**，⛔ 一頭不算」——
 * 上面那條從「宣告」那一頭走，這一支從「**實際寫出的位元組**」那一頭走。
 *
 * ── ⛔ 它管不到什麼（誠實那一欄）──────────────────────────────────────────
 * · ⛔ **`skills:sync` 那一趟不對帳** —— 鏈是**並行**跑的（`sync.mjs`），
 *   同一個時間窗裡有 8–12 支在寫 ⇒ mtime 歸不了因。⭐ 硬要在那裡對帳只會得到
 *   一張互相汙染的名單，而**一條會誤報的閘會被人放寬**。
 *   ⇒ 這一支只在 `genrun.sh` 的**單獨跑**那條路上出手（`GGD_QUARANTINE_UNLOCKED` 未設時），
 *   而 `package.json` 的每一支 `*:build` 公開名**都是** `bash scripts/genrun.sh <step>`。
 * · ⛔ 不驗**內容對不對** —— 那是各家 `*:check` 的事。這一支只問「**誰寫了它**」。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *   node tools/parallel-gates/reconcile.mjs snapshot --out <檔>
 *   node tools/parallel-gates/reconcile.mjs verify --step <名> --before <檔>
 *   共用旗標：--root <repo 根> · --io <sync-io.json>
 *   逃生口：GGD_RECONCILE_OFF=1（用了要在 commit 訊息裡說為什麼）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** 產物住的三個區 —— 與 `product-quarantine.sh` 認得的路徑同一個母體。 */
export const ZONES = ["content", "docs", "data"];

/**
 * ⛔ 不是產物、而且**確實會在產生器跑的時候動**的落點。
 * ⚠️ 每一列要寫得出「誰寫它、為什麼它不該有戶籍」—— ⛔ 不接受「它很吵」。
 * ⭐ 表只能變短。
 */
export const NOT_A_PRODUCT = {
  "docs/_reports/**": "一次性報告落點（CLAUDE.md 的 `_temp_` 命名慣例就是為了它）—— ⛔ 沒有產生器擁有它，也沒有「過期」這回事",
  "docs/_data/gate-timings.json": "`sync.mjs` **排程器自己**的計時帳本（同一份程式碼重跑本來就是不同的秒數）",
  "docs/_data/deploy-timings.json": "部署計時帳本 —— 與上一列同一類，理由逐字寫在 `skillsSyncCoversGenerators.test.ts` 的 `deploy-timing` 那一欄",
  "docs/legacy/_overwrites/**": "覆蓋前的**自動留底** —— 寫它的是 `scripts/preserve-before-overwrite.py`（PreToolUse hook），⛔ 不是產生器",
  "**/.DS_Store": "Finder 的殘渣",
};

/** glob → RegExp。`*`/`?` ⛔ 不跨 `/`（與 python `glob.glob` 逐字一致），`**` 跨。 */
export function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export const matchesGlob = (glob, path) => globToRe(glob).test(path);

/** `sync-io.json` → `Map<step, globs[]>`。 */
export function declaredWrites(io) {
  return new Map((io.steps ?? []).map((s) => [s.name, s.writes ?? []]));
}

/** 這條路徑被哪幾支 step 認領（⛔ 空陣列 = 沒有任何戶籍）。 */
export function ownersOf(path, io) {
  return [...declaredWrites(io)]
    .filter(([, globs]) => globs.some((g) => g === path || matchesGlob(g, path)))
    .map(([name]) => name);
}

const IGNORED = Object.keys(NOT_A_PRODUCT);
export const isIgnored = (path) => IGNORED.some((g) => matchesGlob(g, path));

/**
 * ⭐ 三個產物區**以外**還有戶籍的目錄 —— 從宣告推導，⛔ 不是手寫一張表。
 * 量到的（2026-08-29）：`.`（`README.md` · `寶具總表_EX三階.csv`）·
 * `packages/shared/src/{content,sim}`（兩份推導出來的 .ts）· `tools/{locust-census,sfx-bind,skill-lists}`。
 * ⚠️ 這幾個目錄**只掃一層**（⛔ 不遞迴）—— `.` 遞迴下去是整個 repo。
 */
export function extraDirs(io) {
  const dirs = new Set();
  for (const globs of declaredWrites(io).values()) {
    for (const g of globs) {
      if (ZONES.includes(g.split("/")[0])) continue;
      dirs.add(g.includes("/") ? g.slice(0, g.lastIndexOf("/")) : ".");
    }
  }
  return [...dirs].sort();
}

/**
 * `路徑 → mtime:size` 快照（⛔ 不讀內容 —— 11,678 個檔要毫秒級）。
 *
 * ⚠️ **它管不到的**（誠實）：三個產物區以外**沒有任何戶籍**的新檔 ——
 * 掃描不到那個目錄就看不見它。⭐ 那一族的閘是別的一條：
 * `skillsSyncCoversGenerators.test.ts` 的「寫 docs/ 或 content/ 產物的產生器」掃描。
 */
export function snapshot(root, io) {
  const out = {};
  const take = (abs) => {
    const rel = relative(root, abs);
    if (isIgnored(rel)) return;
    try {
      const st = statSync(abs);
      out[rel] = `${st.mtimeMs}:${st.size}`;
    } catch {
      /* 讀不到就當它不在 —— 下一趟看得到就是「新增」*/
    }
  };
  const walk = (dir, deep) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (deep) walk(abs, true);
      } else if (e.isFile()) take(abs);
    }
  };
  for (const z of ZONES) walk(join(root, z), true);
  for (const d of io ? extraDirs(io) : []) walk(join(root, d), false);
  return out;
}

/** 兩份快照之間**真的被寫過**的檔（新增或 mtime/size 變了）。 */
export function changedBetween(before, after) {
  return Object.keys(after)
    .filter((p) => before[p] !== after[p])
    .sort();
}

/**
 * ⭐ 對帳本體：把「真的被寫過的檔」分成**四**堆。
 * `foreign` 與 `unowned` 都是紅的 —— ⛔ 但它們**不是同一個病**，所以訊息要分開講。
 *
 * ⭐ 第四堆 `pending` 是**棘輪**（`reconcile-pending.json`）：今天就存在、⛔ 而修它需要
 * 重量測 sync-io（＝走 `skills:sync` 那一趟＝**全域鎖**，平行 lane 禁跑）的洞。
 * ⚠️ 它**不擋**（exit 0），⛔ 但它**大聲** —— CLAUDE.md 逐字：「fail-open 沒錯，靜默才是缺陷」；
 * ⭐ 而一條**紅著出貨**的閘會被忽略，被忽略的閘等於沒有閘。
 * ⛔ 棘輪只收 `unowned` 那一類，而且它會**自己到期**（守衛在 `syncIoRuntimeReconcile.test.ts`）。
 */
export function classify(changed, io, step, pending = []) {
  const mine = declaredWrites(io).get(step) ?? [];
  const isMine = (p) => mine.some((g) => g === p || matchesGlob(g, p));
  const ratcheted = (p) => pending.some((r) => r.step === step && r.path === p);
  const foreign = [];
  const unowned = [];
  const known = [];
  for (const p of changed) {
    if (isMine(p)) continue;
    if (ownersOf(p, io).length) foreign.push(p);
    else if (ratcheted(p)) known.push(p);
    else unowned.push(p);
  }
  return { foreign, unowned, pending: known, ok: !foreign.length && !unowned.length };
}

/** 棘輪的列（讀不到就當空 —— ⛔ 但要大聲，靜默地少一張表 = 閘變嚴而訊息不知所云）。 */
export function loadPending(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8")).pending ?? [];
  } catch (e) {
    console.error(`⚠️ 讀不到對帳棘輪 ${path}（${String(e)}）—— 這一輪把已知的洞也當成新的。`);
    return [];
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
  const ROOT = resolve(flag("--root", new URL("../..", import.meta.url).pathname));
  const IO_PATH = resolve(flag("--io", join(ROOT, "tools/parallel-gates/sync-io.json")));
  const mode = argv[0];
  const io = JSON.parse(readFileSync(IO_PATH, "utf8"));

  if (mode === "snapshot") {
    writeFileSync(resolve(flag("--out", "")), JSON.stringify(snapshot(ROOT, io)), "utf8");
    process.exit(0);
  }
  if (mode !== "verify") {
    console.error("用法: reconcile.mjs snapshot --out <檔> | verify --step <名> --before <檔>");
    process.exit(2);
  }

  const step = flag("--step", "");
  // ⭐ 名字不在戶籍表裡 ⇒ **出聲**，⛔ 不是靜默通過（`product-quarantine.sh` 的同一個判準）。
  if (!(io.steps ?? []).some((s) => s.name === step)) {
    console.error(`⚠️ 對帳跳過：'${step}' 不在 sync-io 的 ${(io.steps ?? []).length} 步裡（⛔ 沒有戶籍可以對）。`);
    process.exit(0);
  }
  const res = classify(
    changedBetween(JSON.parse(readFileSync(resolve(flag("--before", "")), "utf8")), snapshot(ROOT, io)),
    io,
    step,
    loadPending(resolve(flag("--pending", join(ROOT, "tools/parallel-gates/reconcile-pending.json")))),
  );
  const { foreign, unowned, ok } = res;

  const list = (xs) => xs.slice(0, 20).map((p) => `     · ${p}`).join("\n") + (xs.length > 20 ? `\n     …還有 ${xs.length - 20} 份` : "");
  // ⚠️ 棘輪那一堆**不擋**，⛔ 但每一次都要印 —— 一個安靜的已知洞讀起來就是「沒有洞」。
  if (res.pending.length)
    console.error(
      `\n⚠️ 對帳：\`${step}\` 寫了 ${res.pending.length} 份**已知無主**的檔（棘輪 reconcile-pending.json，⛔ 這一輪不擋）:\n` +
        `${list(res.pending)}\n     ⇒ 修法：重量測 sync-io（全域鎖，⛔ 平行 lane 禁跑）之後把那幾列刪掉。\n`,
    );
  if (ok) process.exit(0);
  console.error(`\n⛔⛔ 執行期對帳失敗（GH#771）—— \`${step}\` 寫了**不在自己 writes 裡**的檔：\n`);
  if (unowned.length)
    console.error(
      `  🔴 ${unowned.length} 份**全戶籍都沒有人認領**（最嚴重）:\n${list(unowned)}\n` +
        `     ⇒ 它們**沒有被隔離區鎖過** ⇒ 任何通道都寫得進去、⛔ 沒有任何鏈會重生成它們\n` +
        `     ⇒ 它們會 stale 很久而**沒有東西紅**（#771 追記量到的 tts-gen 三份就是這個形狀）\n`,
    );
  if (foreign.length)
    console.error(
      `  🟠 ${foreign.length} 份**別人認領、⛔ 這一支沒宣告**:\n${list(foreign)}\n` +
        `     ⇒ \`bash scripts/genrun.sh ${step}\` 解不開它們 ⇒ 下一次單獨跑吃 **EACCES**\n`,
    );
  console.error(
    `  ⇒ 修的是**宣告**，⛔ 不是在寫入端補一把自解鎖的鑰匙（那是 #771 記著的「治症狀」）：\n` +
      `     ① 在寫入端的原始碼檔頭加 \`// ggd:writes <glob>\`（\`merge-io.mjs\` 會收割，單一住處）\n` +
      `     ② 或重量測 sync-io（trace.mjs 兩趟 → merge-io.mjs）\n` +
      `     ⛔ 不可以手寫 sync-io.json 的 steps —— 手寫的表會過期而且不會有東西紅。\n` +
      `  逃生口 GGD_RECONCILE_OFF=1（用了要在 commit 訊息裡說為什麼）。\n`,
  );
  process.exit(1);
}
