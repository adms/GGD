#!/usr/bin/env node
/**
 * 🌲 **一條 lane 一棵 worktree** —— GH#625 的**根因**修復。
 *
 * ── 為什麼（量到的，⛔ 不是感覺）─────────────────────────────────────────────
 * CLAUDE.md 逐字記著併行 commit 的規矩，而它**只擋得住一個方向**：
 *
 *   「pathspec 規則只擋得住我把別人的東西送上車，⛔ 擋不住別人把我的送上車。」
 *
 * 根因是 **index 是全 repo 共用的**（`.git/index` 一份）。2026-08-22 一天破四次，
 * 其中一次一個裸的 `git commit` 送上 **332 個檔**。
 * ⇒ `git worktree` 讓每一棵樹有**自己的 index**（`.git/worktrees/<name>/index`），
 *    於是那個視窗**結構上不存在** —— ⛔ 不是「要記得帶 pathspec」。
 *
 * ── ⚠️ 基礎建設早就有了，沒有人用（量到的）───────────────────────────────────
 * 2026-08-24 量到 **48 棵 worktree 閒置三週**。⇒ 缺的不是 worktree，是**一支 helper**。
 *
 * ── ⛔⛔ 那個「聰明」的 node_modules 做法會讓 lane 測到**別棵樹** ────────────
 * 直覺是把主樹的 `node_modules` symlink 過去省時間。⛔ **不可以。**
 * 量到的：`apps/client/node_modules/@ggd/shared -> ../../../../packages/shared`
 * 是一條**相對** symlink，而 node 走 **realpath**。
 * ⇒ 一旦 `<wt>/apps/client/node_modules` 指向主樹，`@ggd/shared` 就解析成
 *   **主樹的** `packages/shared` —— lane 改了自己的 shared，測試卻**綠得很開心**，
 *   因為它量的是主樹。⭐ 那正是失敗形態⑤（被測的不是出貨的那個）。
 *
 * ⚠️ 而這個坑**已經有人踩過**：主樹裡至今留著四條自我指向的死 symlink
 *   （`apps/client/node_modules/node_modules -> /Users/Takuro/GGD/apps/client/node_modules`
 *    等四處）——`ln -s TARGET DIR` 在 DIR 已存在時會把 link 建到 **DIR 裡面**。
 *
 * ⭐ **誠實的做法反而最快**：`pnpm install --offline` 在新樹裡 **實測 3.4 秒**
 *   （全部從 pnpm 全域 store hardlink，磁碟增量 ≈ 0）。
 *   ⇒ ⛔ 不 symlink。`doctor` 會**驗 realpath 有沒有逃出這棵樹**。
 *
 * ── 用法（三行）──────────────────────────────────────────────────────────
 *   bash scripts/worktree.sh new  <lane>   # 開一棵樹 + 裝好 node_modules，印出 cd 路徑
 *   bash scripts/worktree.sh land <lane>   # 驗過再 merge 回 main（主樹跑）
 *   bash scripts/worktree.sh rm   <lane>   # 收工移除（--force 連未合併的一起）
 *
 * 其他：`list` 看全部 lane、`doctor` 體檢、`gc` 掃掉已合併/失聯的樹。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** ⛔ 這幾支寫全域產物（bundle.json…）⇒ 只能在主樹跑。hook 也擋（preserve-before-overwrite.py）。 */
export const LOCKED_SCRIPTS = ["content:build", "skills:sync", "spec:build", "ship:check"];

/** lane 名字的柵欄：只收 `[a-z0-9._-]`，⛔ 不收斜線（否則會跑出 worktrees 目錄）。 */
export function sanitizeLane(name) {
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) {
    throw new Error(`⛔ lane 名字只收 [A-Za-z0-9._-] 且不可以有 ".."：得到 ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * ⭐ worktree 落在 `.claude/worktrees/`，⛔ 不是隨便挑的：那個目錄**已經**同時被
 * `.git/info/exclude` 與 `vitest.config.ts` 的 `exclude` 蓋住。放別的地方會讓
 * 主樹的 root vitest run 去收集 lane 的測試檔（每一棵樹一份 `*.test.ts`）⇒ 幻影紅燈。
 */
export const laneDir = (repo, lane) => `${repo}/.claude/worktrees/lane-${sanitizeLane(lane)}`;
export const laneBranch = (lane) => `lane/${sanitizeLane(lane)}`;

/**
 * ⭐⭐ **配對式檢查**（`ggd-pairwise-postconditions`）：land 之前要問的**不是**
 * 「主樹乾不乾淨」——它從來就不乾淨（量到的：常態 40+ 個 modified）——
 * 而是「**這條 lane 要動的檔，跟主樹現在髒的檔，有沒有交集**」。
 * 那才是 merge 會踩掉別人未提交改動的**唯一**形狀。
 */
export function overlap(laneFiles, mainDirty) {
  const d = new Set(mainDirty);
  return [...new Set(laneFiles.filter((f) => d.has(f)))].sort();
}

// ── 以下是會碰檔案系統/git 的部分 ────────────────────────────────────────────
const run = (args, cwd, quiet) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: quiet ? ["ignore", "pipe", "pipe"] : undefined }).trim();
const tryRun = (args, cwd) => {
  try {
    return run(args, cwd, true);
  } catch {
    return null;
  }
};

/** 主樹的根 —— 從 `--git-common-dir` 推導，⛔ 不假設 cwd 就是主樹（lane 裡也要能跑）。 */
export function mainRepo(cwd = process.cwd()) {
  const common = run(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd, true);
  return dirname(resolve(common));
}

const dirtyFiles = (cwd) =>
  (tryRun(["status", "--porcelain"], cwd) || "")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""));

function lanes(repo) {
  const out = [];
  const txt = tryRun(["worktree", "list", "--porcelain"], repo) || "";
  for (const block of txt.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) continue;
    const marker = `${path}/.ggd-lane.json`;
    if (!existsSync(marker)) continue;
    let meta = {};
    try {
      meta = JSON.parse(readFileSync(marker, "utf8"));
    } catch {
      /* 標記壞掉不該讓整支 helper 掛掉 */
    }
    out.push({ path, meta, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)" });
  }
  return out;
}

// ── 指令 ────────────────────────────────────────────────────────────────────
function cmdNew(repo, lane, from) {
  const dir = laneDir(repo, lane);
  const branch = laneBranch(lane);
  if (existsSync(dir)) throw new Error(`⛔ ${dir} 已經存在 —— 先 \`rm ${lane}\` 或換個名字`);
  const base = from || (tryRun(["rev-parse", "--verify", "main"], repo) ? "main" : "HEAD");
  mkdirSync(dirname(dir), { recursive: true });
  const exists = tryRun(["rev-parse", "--verify", branch], repo);
  console.log(`🌲 開樹 ${branch} ← ${base}`);
  run(exists ? ["worktree", "add", dir, branch] : ["worktree", "add", "-b", branch, dir, base], repo);

  // ⭐ 誠實的 install（3.4s）。⛔ 不 symlink node_modules —— 見檔頭那一段。
  // ⚠️ `--ignore-scripts` 是安全的:量過全 repo **沒有任何** postinstall/prepare。
  console.log("📦 pnpm install --offline（實測 ~3.4s，全部從全域 store hardlink）");
  execFileSync("pnpm", ["install", "--offline", "--ignore-scripts", "--prefer-offline"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  });

  // ⚠️ 標記**永遠不可以被 commit**（裡面是絕對路徑，而且它是每棵樹各自的）。
  // ⛔ 不加這一行的話它會變成一個永遠存在的未追蹤檔 ⇒ 每一條 lane 都「髒」⇒ `land` 永遠拒絕。
  ensureExcluded(repo, ".ggd-lane.json");
  writeFileSync(
    `${dir}/.ggd-lane.json`,
    `${JSON.stringify({ lane, branch, base, mainRepo: repo, created: new Date().toISOString() }, null, 2)}\n`,
  );
  const bad = escapedWorkspaceLinks(dir);
  if (bad.length) throw new Error(`⛔ workspace link 逃出這棵樹（會測到主樹！）:\n${bad.join("\n")}`);

  console.log(
    [
      "",
      `✅ lane「${lane}」就緒。三行：`,
      `   cd ${dir}`,
      `   …做事，然後 git commit -F /private/tmp/msg-${lane}.txt -- <逐檔列名>   # ⭐ 自己的 index,不會被別人掃走`,
      `   bash scripts/worktree.sh land ${lane}   # 收斂（主樹跑）`,
      "",
      `⛔ 這棵樹裡不要跑：${LOCKED_SCRIPTS.map((s) => `pnpm ${s}`).join(" · ")}（hook 會擋，去主樹跑）`,
    ].join("\n"),
  );
}

/**
 * ⭐ 失敗形態⑤的體檢：workspace link 的 **realpath 有沒有留在這棵樹裡**。
 * 逃出去 = lane 的測試在量主樹，而且**全綠**。
 */
export function escapedWorkspaceLinks(dir) {
  const bad = [];
  for (const p of ["apps/client/node_modules/@ggd/shared", "apps/game-server/node_modules/@ggd/shared"]) {
    const full = `${dir}/${p}`;
    if (!existsSync(full)) continue;
    const real = tryRun(["rev-parse", "--show-toplevel"], full);
    if (real && resolve(real) !== resolve(dir)) bad.push(`   ${p} → ${real}`);
  }
  return bad;
}

function cmdList(repo) {
  const ls = lanes(repo);
  if (!ls.length) return console.log("（沒有 lane worktree）");
  for (const l of ls) {
    const ahead = tryRun(["rev-list", "--count", `main..${l.branch}`], repo) ?? "?";
    const dirty = dirtyFiles(l.path).length;
    console.log(`${l.meta.lane ?? "?"}\t${l.branch}\t+${ahead} commit\t${dirty} 髒檔\t${l.path}`);
  }
}

function cmdLand(repo, lane, force) {
  const dir = laneDir(repo, lane);
  const branch = laneBranch(lane);
  if (!existsSync(dir)) throw new Error(`⛔ 沒有這棵樹：${dir}`);
  const dirty = dirtyFiles(dir);
  if (dirty.length && !force) {
    throw new Error(`⛔ lane 還有 ${dirty.length} 個未提交的檔 —— 先 commit（merge 不會帶走它們）:\n   ${dirty.slice(0, 10).join("\n   ")}`);
  }
  const ahead = (tryRun(["rev-list", "--count", `main..${branch}`], repo) ?? "0").trim();
  if (ahead === "0") throw new Error(`⛔ ${branch} 沒有領先 main 的 commit —— 沒有東西可以 land`);
  const laneFiles = (tryRun(["diff", "--name-only", `main...${branch}`], repo) || "").split("\n").filter(Boolean);
  const clash = overlap(laneFiles, dirtyFiles(repo));
  if (clash.length && !force) {
    throw new Error(
      `⛔ 這 ${clash.length} 個檔 **lane 改過、而主樹現在也是髒的** ⇒ merge 會踩掉別人未提交的改動：\n` +
        `   ${clash.join("\n   ")}\n   ⇒ 請主 session 先處理主樹那幾個檔（--force 可強行）`,
    );
  }
  console.log(`🔀 merge ${branch}（${ahead} commit，${laneFiles.length} 檔）→ main`);
  run(["merge", "--no-ff", "--no-edit", branch], repo);
  console.log(`✅ 已 land。⇒ 收工：bash scripts/worktree.sh rm ${lane}`);
}

function cmdRm(repo, lane, force) {
  const dir = laneDir(repo, lane);
  const branch = laneBranch(lane);
  if (existsSync(dir)) run(["worktree", "remove", ...(force ? ["--force"] : []), dir], repo);
  run(["worktree", "prune"], repo);
  if (tryRun(["rev-parse", "--verify", branch], repo)) {
    if (tryRun(["branch", force ? "-D" : "-d", branch], repo) === null) {
      console.log(`⚠️ 分支 ${branch} 還沒合併進 main ⇒ 留著（--force 才刪）`);
    }
  }
  console.log(`🧹 ${lane} 已移除`);
}

function cmdDoctor(repo) {
  const all = (tryRun(["worktree", "list", "--porcelain"], repo) || "").split("\n\n").filter(Boolean);
  const ls = lanes(repo);
  console.log(`🌲 worktree 共 ${all.length} 棵，其中 lane（有標記）${ls.length} 棵`);
  const prunable = all.filter((b) => /^prunable /m.test(b)).length;
  if (prunable) console.log(`🧹 ${prunable} 棵失聯（工作目錄不見了）⇒ \`gc\` 會清掉`);
  let bad = 0;
  for (const l of ls) {
    const problems = [];
    if (!existsSync(`${l.path}/node_modules`)) problems.push("⛔ 沒有 node_modules（vitest 會解析不到 zod）");
    problems.push(...escapedWorkspaceLinks(l.path).map((s) => `⛔ workspace link 逃出這棵樹 →${s.trim()}`));
    if (problems.length) {
      bad++;
      console.log(`  ${l.meta.lane}: ${problems.join(" / ")}`);
    }
  }
  console.log(bad ? `⛔ ${bad} 棵有問題` : "✅ 每一棵 lane 都有自己的 node_modules，且 workspace link 沒有逃出去");
}

function cmdGc(repo) {
  run(["worktree", "prune"], repo);
  let n = 0;
  for (const l of lanes(repo)) {
    const merged = (tryRun(["branch", "--merged", "main", "--list", l.branch], repo) || "").trim();
    if (merged && !dirtyFiles(l.path).length) {
      cmdRm(repo, l.meta.lane, false);
      n++;
    }
  }
  console.log(`🧹 gc 完成（清掉 ${n} 條已合併且乾淨的 lane）`);
}

const USAGE = `用法：bash scripts/worktree.sh <new|list|land|rm|doctor|gc> [lane] [--from <ref>] [--force]`;

export function parseArgs(argv) {
  const flags = { force: argv.includes("--force") };
  const i = argv.indexOf("--from");
  if (i >= 0) flags.from = argv[i + 1];
  const pos = argv.filter((a, k) => !a.startsWith("--") && argv[k - 1] !== "--from");
  return { cmd: pos[0], lane: pos[1], ...flags };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cmd, lane, from, force } = parseArgs(process.argv.slice(2));
  try {
    const repo = mainRepo();
    if (cmd === "new") cmdNew(repo, lane, from);
    else if (cmd === "list") cmdList(repo);
    else if (cmd === "land") cmdLand(repo, lane, force);
    else if (cmd === "rm") cmdRm(repo, lane, force);
    else if (cmd === "doctor") cmdDoctor(repo);
    else if (cmd === "gc") cmdGc(repo);
    else {
      console.error(USAGE);
      process.exit(2);
    }
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
