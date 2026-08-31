#!/usr/bin/env node
/**
 * 🚢 **出貨四閘,一支指令** —— `pnpm ship:check`
 *
 * > owner 2026-08-23：「跑太久了吧 已經超過一小時 **改一個小地方 上線成本這麼高**」
 * > ＋「根據**排隊理論,最慢又不可平行分拆的任務要不要盡可能最先做**」
 * > ＋「**你要記錄一下各單元到底花多少時間做什麼**」
 * > ＋（看到我手打那一串 `( … ) &` 之後）「**這些應該是自動化 script 跑吧？**」
 *
 * ⭐ 最後那一句是這支檔存在的理由：在此之前那是**一行手打的 shell**,
 * 而手打的東西下一次會忘記、會漏一個 suite、會忘記不 fail-fast。
 *
 * ── 形狀（⛔ 不是「全部丟出去」）───────────────────────────────────────
 *
 *   ① **序列段（全域鎖,不可分拆）**  content:build → skills:sync
 *      ⛔ 它們寫 `bundle.json`,全域只能有一條在跑。而且 `contract:numbers`
 *         **必須在 `content:build` 之後** —— 單獨跑會得到「產生器說 OK 但 --check 說 stale」。
 *      ⭐ 排隊理論：最長又不可平行的先跑,它的長度就是整條路的下界。
 *
 *   ② **並行段**  skills:check（自己再並行 36 支,LPT）· typecheck · 每一包 vitest
 *      ⛔ **不 fail-fast** —— 一次撈全部的錯（第零守則：紅了以後不要「跑一次改一個」）。
 *
 * ⚠️ **⛔ 這支不會削弱任何既有的閘。** 它只改變「誰跟誰同時跑」,
 *    每一支閘的指令、判準、離開碼逐字不動。08-01／08-02 兩次「全綠而線上掛掉」
 *    的教訓是**閘不夠**,⛔ 不是閘太多。
 *
 * 用法:
 *   pnpm ship:check          # ①＋②(預設 ＝ **全部**)
 *   pnpm ship:check --no-sync   # 只跑 ② (內容沒動過時)
 *   pnpm ship:check --only-sync # 只跑 ①
 *   pnpm ship:check --suites packages/shared,apps/client   # ⭐ 只跑這幾包 vitest
 *   pnpm ship:check --no-typecheck
 *   pnpm ship:check --sync-base <ref>   # ⭐ skills:sync 只跑「會因為這批改動而過期」的那幾支
 *   pnpm ship:check --sync-paths a.json,b.ts
 *   pnpm ship:check --list              # 只印這一次會跑哪幾支,⛔ 一支都不跑
 *
 * ⭐ 計畫本身可以單獨看: `pnpm sync:plan --base HEAD~5`（`tools/parallel-gates/syncPlan.mjs`）。
 *
 * ⚠️ ⭐ **suites／typecheck 的旗標是給 `pnpm ship`（自動分級）用的,⛔ 不是給人手打的。**
 * 誰該跑由 `tools/deploy-timing/shipPlan.mjs` 從**路徑集合**推導 ——
 * 而**不知道路徑集合時永遠是全跑**：一支「預設就在打折」的閘等於沒有閘。
 * ⭐ vitest 也讀**同一份**路徑集合按 package.json 依賴閉包裁包（`suiteTrim`）——
 * 對不到規則的任何一條路徑 ⇒ 全包,判準逐字不動,裁的只有「跑不跑」。
 * ⭐ 序列段的 `--sync-base` 例外地**有預設**（`origin/main`,理由寫在 syncBase 那一段）——
 * 那⛔ 不是打折:裁剪只裁「跑不跑」,每一支的判準逐字不動,而且五道 fail-closed 全往「全跑」倒。
 * ⛔ 認不得的包名一律回非零,⛔ 不靜默略過(那會變成「我以為它跑了」)。
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { packagesWithVitest, suitesForPaths } from "./packages.mjs";
import { planFromPaths } from "./syncPlan.mjs";
import { appendStage } from "../deploy-timing/run.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const REPO = new URL("../../", import.meta.url).pathname;

const argv = process.argv.slice(2);
const noSync = argv.includes("--no-sync");
const onlySync = argv.includes("--only-sync");
const noTypecheck = argv.includes("--no-typecheck");

const ALL_SUITES = packagesWithVitest(REPO);
const SHIP_LIMIT = Number(process.env.GGD_SHIP_CONCURRENCY ?? Math.max(2, cpus().length - 2));
// ⭐ vitest 選哪幾包（`suiteTrim`）住在 syncPaths **之後** —— 它讀同一份路徑集合。

/**
 * ⭐⭐ **序列段的 `skills:sync` 會按改動裁剪** —— owner 2026-08-23 逐字：
 *
 * > 「**為什麼我要全跑 skills 產生器，即使我沒有做技能更動或小範圍更動也需要全跑嗎
 * >   可以用旗標註明是否有改動需要跑哪支就好？**」
 *
 * 計畫由 `syncPlan.mjs` **推導**（量到的 I/O ＋ 產生器原始碼裡的路徑字面值 ＋ 拓撲閉包），
 * ⛔ 這裡一行手寫的「這支吃哪些檔」都沒有。
 *
 * ── ⛔ fail-closed 是硬要求：**五道全部往「全跑」倒**（⛔ 一道都不減）─────────
 *   ① 預設 base 立不起來（fetch 失敗/逾時 · `origin/main` 解析不到 · 落後本地過多）⇒ 全跑
 *   ② 給了明確 base 但 `git diff` 吃不下它 ⇒ 全跑（⛔ 不是推論成「那就沒改」）
 *   ③ 計畫自己說 `full`（路徑對不到輸入表 / `sync-io.json` 的 chain 過期）⇒ 全跑
 *   ④ 算計畫時擲例外 ⇒ 全跑
 *   ⑤ `--no-sync` 以外任何看不懂的狀態 ⇒ 全跑
 *
 * ── 路徑集合從哪來（⭐ 四條，⛔ 沒有一條是猜的）────────────────────────────
 *   `--sync-paths a,b`   直接給
 *   `--sync-base <ref>`  `git diff --name-only <ref>`（含工作樹）＋未追蹤檔
 *   `GGD_DEPLOYED_REF`   ⭐ `pnpm ship` 的 `pipeline.mjs` 讀的**同一個**環境變數，
 *                        而它是用 `spawn` 起我的 ⇒ 那個起點**自動**流到這裡。
 *   （都沒有）           ⭐⭐ **預設 `origin/main`** —— 理由與守門寫在下面 syncBase。
 *
 * ⚠️ `content:build` **一律留在最前面**（即使計畫沒點它）：它是 bundle 新鮮度那一條的
 * 前置，多跑一次只是慢 12 秒，⛔ 漏跑就是 2026-08-01 那次「過期 bundle 全綠上線」。
 */
const optArg = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
// ⚠️ `-c core.quotepath=false`:⛔ 少了它 CJK 檔名會變成加引號的跳脫字串而對不到任何輸入表
//    ⇒ 每一次動到中文檔名的改動都會被誤判成 fail-closed 全跑。
// ⚠️ stderr 丟掉:認不得的 ref 時 git 會印一大段;那不是**我們**要說的話 ——
//    我們要說的是 syncTrim 的「⇒ 全跑」。
const syncGit = (a, extra = {}) =>
  execFileSync("git", ["-c", "core.quotepath=false", ...a], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 1 << 26,
    stdio: ["ignore", "pipe", "ignore"],
    ...extra,
  });

/**
 * ⭐⭐ **base 沒人給的時候,預設 `origin/main`** —— ＝上一次 push ＝上一次部署
 * （這個 repo 的部署協定就是 push 之後遠端 `git pull`,所以 origin/main 就是線上那一版）。
 *
 * 🚨 為什麼要有預設（2026-08-23 量到的）：裁剪引擎（A4）做好**當天**,5 次跑閘
 * **裁剪 0 次生效** —— 沒有人帶 `--sync-base`,每一次都落進「不知道改了哪些路徑 ⇒ 全跑」。
 * 一個要人記得帶旗標才會生效的裁剪,等於沒有（元規則:閘不是判準）。
 *
 * ⛔ 這**不是**削弱閘:裁掉的只有「輸入自上一次部署起一個位元組都沒動」的產生器,
 * 每一支的判準逐字不動;而「上一次部署」這個假設本身有三道守門,全部往「全跑」倒:
 *   · `git fetch` 失敗/逾時 ⇒ 全跑（本機的 origin/main 可能過期,拿過期的 base 裁剪不可信）
 *   · `origin/main` 解析不到 ⇒ 全跑
 *   · origin/main 有本地沒有的 commit,或落後本地超過 `GGD_SYNC_BASE_MAX_BEHIND`（預設 100）
 *     ⇒ **有別的東西先 push 了／base 過舊**,「origin/main ＝ 上一次部署」不可信 ⇒ 全跑並印原因
 * ⚠️ 明確給了 `--sync-base`／`--sync-paths`／`GGD_DEPLOYED_REF` 時**不碰網路**——
 *    那是 `pnpm ship` 算好的起點,fetch 只會拖慢它;`--no-sync` 時序列段根本不跑,也不 fetch。
 */
const syncBase = (() => {
  if (optArg("--sync-paths")) return { ref: null, why: null, label: "(--sync-paths)" };
  const explicit = (optArg("--sync-base") ?? process.env.GGD_DEPLOYED_REF ?? "").trim().split(/\s+/)[0];
  if (explicit) return { ref: explicit, why: null, label: explicit };
  if (noSync) return { ref: null, why: null, label: null }; // 序列段不跑 ⇒ ⛔ 不必為它 fetch
  const BASE = "origin/main";
  try {
    syncGit(["fetch", "--quiet", "origin", "main"], {
      timeout: Number(process.env.GGD_SYNC_FETCH_TIMEOUT_MS ?? 10000),
    });
  } catch {
    return { ref: null, why: `⛔ git fetch 失敗/逾時 ⇒ 本機的 ${BASE} 可能過期,拿它裁剪不可信 ⇒ **全跑**`, label: null };
  }
  let behind;
  let aheadRemote;
  try {
    behind = Number(syncGit(["rev-list", "--count", `${BASE}..HEAD`]).trim());
    aheadRemote = Number(syncGit(["rev-list", "--count", `HEAD..${BASE}`]).trim());
  } catch {
    return { ref: null, why: `⛔ ${BASE} 解析不到 ⇒ **全跑**`, label: null };
  }
  const MAX = Number(process.env.GGD_SYNC_BASE_MAX_BEHIND ?? 100);
  if (!Number.isFinite(behind) || !Number.isFinite(aheadRemote) || behind > MAX || aheadRemote > 0) {
    return {
      ref: null,
      why:
        `⛔ ${BASE} 與本地的距離不對勁（落後本地 ${behind} commits,上限 ${MAX};` +
        `遠端多出 ${aheadRemote} commits）⇒ 有別的東西先 push 了／base 過舊,` +
        `「${BASE} ＝ 上一次部署」不可信 ⇒ **全跑**`,
      label: null,
    };
  }
  return { ref: BASE, why: null, label: `${BASE}(預設＝上一次 push)` };
})();

const syncPaths = (() => {
  const csv = optArg("--sync-paths");
  if (csv) return csv.split(",").map((s) => s.trim()).filter(Boolean);
  if (!syncBase.ref) return null;
  try {
    const lines = (a) => syncGit(a).split("\n").filter(Boolean);
    // ⭐ `<base>`（⛔ 不是 `<base>..HEAD`）⇒ 連**還沒 commit** 的工作樹改動都算進來。
    return [
      ...lines(["diff", "--name-only", syncBase.ref]),
      ...lines(["ls-files", "--others", "--exclude-standard"]),
    ];
  } catch {
    return null; // ⇒ 全跑
  }
})();
const syncTrim = (() => {
  if (!syncPaths) {
    // ⭐ base 那一層自己說得出原因（fetch 失敗/落後過多…）就用它的 —— 靜默的 fallback
    //    讀起來會像「全部都跑過了」（第零守則:裁掉了什麼、為什麼沒裁,都要印）。
    return { steps: null, why: syncBase.why ?? "⛔ 不知道這一次改了哪些路徑 ⇒ **全跑**(⛔ 不是「那就沒改」)" };
  }
  try {
    const p = planFromPaths(syncPaths, REPO);
    if (p.full) return { steps: null, why: `⛔ **fail-closed 全跑** —— ${p.fullReason}` };
    return {
      steps: p.steps,
      why:
        `⭐ base ${syncBase.label} · ${syncPaths.length} 個路徑 ⇒ 只跑 ${p.steps.length}/${p.steps.length + p.skipped.length} 支` +
        `（估 ${(p.ms / 1000).toFixed(1)}s，全跑 ${(p.msAll / 1000).toFixed(1)}s）\n` +
        `      ⏭ 不用跑: ${p.skipped.join(" · ") || "(無)"}`,
    };
  } catch (e) {
    return { steps: null, why: `⛔ 算不出計畫(${String(e)}) ⇒ **全跑**` };
  }
})();

/**
 * ⭐⭐ **vitest 按依賴方向裁包** —— 七包全跑 237s,而依賴方向是**單向**的:
 * apps/* 依賴 packages/shared,⛔ 反過來沒有 ⇒ 只動 apps/client 時,
 * 其他包**結構上不可能**被它弄壞,跑它們是純等待（owner 北極星:3 分鐘出貨）。
 *
 * ── 誰贏 ────────────────────────────────────────────────────────────────
 *   `--suites a,b`       pipeline(shipPlan)算好的 ⇒ 照單全收（fail-closed 驗名字）
 *   沒旗標＋有路徑集合    ⭐ `suitesForPaths()`（packages.mjs）—— 依賴邊逐份讀
 *                        package.json 的 dependencies 取**遞移閉包**,⛔ 沒有手寫表
 *   沒旗標＋沒路徑集合    ⛔ **全包**（⛔ 不知道改了什麼就不打折）
 *
 * ⛔ 裁的只有「跑不跑」:每一包 vitest 的指令、判準、離開碼逐字不動;
 * fail-closed 的每一個入口（content/ · 對不到 package · 對不到規則 · 擲例外）
 * 全部往「全包」倒 —— 理由逐條寫在 `suitesForPaths` 檔頭。
 */
const suiteTrim = (() => {
  const i = argv.indexOf("--suites");
  if (i >= 0) {
    const want = (argv[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const bad = want.filter((s) => !ALL_SUITES.includes(s));
    if (!want.length || bad.length) {
      // ⛔ fail-closed:認不得的名字**不可以**被當成「那就不跑」——
      //    包改名之後那一包會靜默消失,而出貨前它一次都不會紅。
      console.error(`⛔ --suites 認不得: ${bad.join(",") || "(空的)"}\n   有 vitest 的包: ${ALL_SUITES.join(" · ")}`);
      process.exit(2);
    }
    return { suites: want, extras: [], why: "--suites 指定(pipeline 算好的)" };
  }
  if (!syncPaths) return { suites: ALL_SUITES, extras: [], why: "⛔ 不知道這一次改了哪些路徑 ⇒ 全包" };
  try {
    const p = suitesForPaths(syncPaths, REPO);
    if (!p.suites) return { suites: ALL_SUITES, extras: [], why: `⛔ 全包 —— ${p.why}` };
    return { suites: p.suites, extras: p.extras, why: `⭐ ${p.why}` };
  } catch (e) {
    return { suites: ALL_SUITES, extras: [], why: `⛔ 算不出依賴閉包(${String(e)}) ⇒ 全包` };
  }
})();
const wantSuites = suiteTrim.suites;

/**
 * 每一包 vitest 分到幾個 fork。⭐ 從**核數**與**同時在跑幾包**推導,
 * ⛔ 不是抄各自 config 裡的 16（那個數字是「單獨跑這一包」時才對）。
 *
 * ⭐ **兩倍超訂**（`cpus × 2 ÷ 包數`），⛔ 不是 `cpus ÷ 包數`。
 *
 * 三個量到的點（2026-08-23，18 核）決定了這個係數：
 *   · **不設限**（每包照自己 config 的 16）⇒ 112 fork 搶 18 核 ⇒ 並行段 wall **218.8s**，
 *     ⛔ 但 `mobWavesSave` 從 885ms 飄到 **5472ms** 撞破 5 秒額度
 *   · **`cpus ÷ 包數 = 2`** ⇒ 逐包序列化，`packages/shared` 光自己就要 ≈730 CPU-秒 ÷ 2
 *     ⇒ 並行段會**比不設限還久**
 *   · ⇒ **×2 超訂 = 每包 5** —— vitest 的 fork 多數時間在等 I/O 與 transform，
 *     超訂拿得到吞吐，而 5 × 7 = 35 個 fork 對 18 核不會把單條測試餓到破額度
 *
 * ⛔ 覆寫 `minForks` 是必要的：各包 config 寫 `minForks: 4`，而
 * `min > max` 會讓 vitest 直接 `RangeError` 收工（⛔ 不是慢，是一條測試都不跑）。
 */
const SUITE_COUNT = wantSuites.length;
const FORKS_PER_SUITE = Math.max(
  4,
  Math.floor((cpus().length * 2) / Math.max(1, Math.min(SHIP_LIMIT, SUITE_COUNT))),
);

/** 序列段:全域鎖。⛔ 順序有意義（`contract:numbers` 在 `content:build` 之後）。 */
// ⚠️⚠️ ⛔ **不可以**把計畫裡的 `content:build` 濾掉再靠開頭那一支頂替 ——
//    開頭那一支跑在 `tiers:apply`／`skillremake:json` **之前**,它讀到的是**還沒被重寫**
//    的 `content/abilities/**` ⇒ `bundle.json` 會停在舊的那一天而每一支自己都說 OK
//    （＝2026-08-01 事故的形狀）。⭐ 原本的 `skills:sync` 本來就會跑它兩次,這裡逐字保留。
// ⭐⭐ GH#710 —— 一次完整鏈**收斂不了**：`sync-io.json` 量到 3 支產生器
//    （`jasscombo:build` 28 · `vfxbind:build` 29 · `sfxbind:build` 30）排在
//    `content:build`（11）**後面**，而它們寫的檔正是 `content:build` 自己會讀的
//    ⇒ 它們一改輸出，`bundle.json`／`contract:numbers` 就落後一步。
//    2026-08-26 實測要跑**兩次**完整鏈才綠。
//    ⇒ 走 `sync:converge`（跑到不動點，上限 3 輪），⛔ 不動那條鏈的拓撲序
//      —— `sync-io.json` 的 chain 字串是**身分**，改一個字就要重量整張圖。
// 🔙 rollback：`GGD_SYNC_CONVERGE=0` 退回舊行為（單跑一次 `skills:sync`）。
const SYNC_STEP = process.env.GGD_SYNC_CONVERGE === "0" ? "skills:sync" : "sync:converge";
const SERIAL = syncTrim.steps ? ["content:build", ...syncTrim.steps] : ["content:build", SYNC_STEP];

/**
 * 並行段。⭐ 每一格是「一件會回非零的事」,⛔ 不是「一個資料夾」。
 * `skills:check` 走 run.mjs（它自己再 LPT 並行 36 支）。
 */
const PARALLEL = [
  { name: "skills:check", cmd: ["node", [`${HERE}run.mjs`, "skills:check"]] },
  // 👁 owner 2026-08-24:「我不想當你的人肉測試機」——改到畫面層卻沒有終端證據 ⇒ 紅。
  //    ⭐ 它很快（一次 git diff），⛔ 不會拖慢地板（地板是 vitest apps/client ~220s）。
  { name: "visual-proof", cmd: ["bash", ["scripts/visual-proof.sh"]] },
  // 🐹 GH#653 —— platform 的 Go 對帳**紅了幾天沒人看見**（#633 的 AttrDefaults 漂移,
  //    keysync_test.go 早就紅著,而 ship:check 只跑 vitest）。~1.6s,⛔ 不動地板。
  //    ⚠️ 沒有 Go 工具鏈時要**說出來再跳過**,⛔ 不是靜靜過(那是另一個綠的謊)——
  //    scripts/go-test-or-skip.sh 負責這件事。
  { name: "go test (platform)", cmd: ["bash", ["scripts/go-test-or-skip.sh"]] },
  // 🏷️ GH#663 —— `commit-ref-lint.sh` 在 2026-08-24 就寫好了，⛔ **而沒有任何東西跑它**。
  //    ⭐ 一個沒有人跑的閘等於沒有閘（本 repo 已經記錄過四次同型）。
  //    ⚠️ 刻意接在**這裡**（部署前）⛔ 不是 commit-msg hook：`.git/hooks/` 不進版控，
  //    clone 一次就沒了，而併行 lane 每一條都在 commit ⇒ 那個洞是量產的。
  //    它自己會判「離線/快取缺號 ⇒ 警告後放行」（⛔ 不擋剛開票的人），
  //    只有 lane 代號寫成 `#A5` 這種**不需要外部知識就判得出來**的形狀才硬紅。~0.3s。
  { name: "commit-ref-lint", cmd: ["bash", ["scripts/commit-ref-lint.sh", "--recent", "50"]] },
  ...(noTypecheck ? [] : [{ name: "typecheck", cmd: ["pnpm", ["typecheck"]] }]),
  // ⭐ **這條管線自己的守衛**（分級表 + 閘選擇 + 部署步驟）。
  // ⚠️ 它在此之前**沒有被任何閘跑到**:`pnpm test` 是 `pnpm -r`（逐 package）,
  //    而 `tools/deploy-timing/` 不是一個 workspace package ⇒ `tier.test.mjs`
  //    只有人手打 `npx vitest run` 時才跑。一支決定「哪些閘可以不跑」的程式
  //    自己沒有閘,是這整條路上最不能接受的洞。
  { name: "vitest tools/deploy-timing", cmd: ["npx", ["vitest", "run", "tools/deploy-timing"]] },
  ...wantSuites.map((r) => ({
    name: `vitest ${r}`,
    // ⛔⛔ **分核預算,⛔ 不是「每一包都開 16 forks」。**
    //
    // ⚠️ 這是我這支腳本第一版的真缺陷（2026-08-23 當場量到）：
    // 7 包 vitest 同時跑,每一包照自己 config 的 `maxForks: 16`
    // ⇒ **112 個 fork 搶 N 顆核** ⇒ `mobWavesSave.test.ts` 從單獨跑的
    // **885ms** 飄到 **5472ms** 而撞破 5 秒額度。
    //
    // ⛔ 那時候**最不該做的事是調高那一條的 timeout** —— 那會把「機器很忙」
    // 永久靜音,而下一個真的變慢的東西就再也沒有人會發現。
    // ⭐ 正解是讓並行段**自己知道它切了幾刀**：核數 ÷ 同時在跑的包數。
    cmd: ["npx", ["vitest", "run", "--root", r, "--poolOptions.forks.maxForks", String(FORKS_PER_SUITE),
      "--poolOptions.forks.minForks", "1"]],
  })),
  // ⭐ 被改到的 tool **自己的測試**（`suitesForPaths` 的 extras）——
  //    tools/ 不在上面那份掃描裡,⛔ 不跑它們就是「動了產生器而它的守衛一次都不會紅」。
  //    有 package.json 的用 `--root`（findUp 會撿到它自己的 config）,沒有的走根 config。
  ...suiteTrim.extras
    .filter((d) => d !== "tools/deploy-timing") // 上面那格永遠在跑,⛔ 不重複
    .map((d) => ({
      name: `vitest ${d}`,
      cmd: existsSync(`${REPO}${d}/package.json`)
        ? ["npx", ["vitest", "run", "--root", d]]
        : ["npx", ["vitest", "run", d]],
    })),
];

// ⭐ `--list` 印出**這一次真的會跑哪幾支**然後收工（⛔ 一支都不跑）。
// ⚠️ 它存在的理由是守衛:`pnpm ship` 的分級只有透過這幾個旗標才會變成
//    「少跑一包」,而**旗標接錯線不會紅** —— 那一包只是安靜地不見了
//    （CLAUDE.md 失敗形態③:可以從樹上刪掉而測試全綠）。
if (argv.includes("--list")) {
  // ⭐ 裁剪的決定印到 **stderr** —— stdout 是給機器逐行 parse 的名單
  //   （`shipPlan.test.mjs` 就在讀它),⛔ 不可以混進去。
  if (!noSync) console.error(`# skills:sync 裁剪: ${syncTrim.why}`);
  console.log([...(noSync ? [] : SERIAL), ...(onlySync ? [] : PARALLEL.map((j) => j.name))].join("\n"));
  process.exit(0);
}

const LOGDIR = process.env.GGD_SHIP_LOGDIR ?? "/private/tmp/ggd-ship";
mkdirSync(LOGDIR, { recursive: true });

/**
 * ⏲️ **逐 suite 看門狗**（owner 2026-08-24：「工作流跑超過5分鐘,你應該要去看
 * 是不會陷入loop了」）—— 2026-08-23 實測 `packages/shared` 的 vitest 在併行負載下
 * **worker 卡死（0% CPU）**,而沒有看門狗的那一版等了 11 分鐘。
 *
 * ⛔⛔ **GH#858 —— 這隻看門狗在 2026-08-30 之前有三個缺陷,而它們合起來的症狀
 * 正是「卡死看起來像綠燈」。三個都是量到的,⛔ 不是推測：**
 *
 *   ① ⭐ **`estMs` 是死參數。** 兩個呼叫點都只傳三個引數
 *      （`run(s,"pnpm",[s])` / `run(job.name,job.cmd[0],job.cmd[1])`）
 *      ⇒ `estMs` 永遠是預設的 0 ⇒ `limit` 永遠 = 5 分鐘的地板。
 *      檔頭寫的「帳本估時×3」**一次都沒有發生過**。
 *      而帳本量到 `packages/shared` 正常要 **225–283s**（且在長大）——
 *      距離 300s 的地板只剩 6% 餘裕。2026-08-28 11:40–12:18 **連續四次**
 *      shared 與 client 一起在 300s 被砍,記成 `hung`。
 *      ⇒ ⭐ 那是**假紅**,而且它**蓋掉了真紅** —— 同一支在 05:37／05:46／06:56
 *        本來是 `code 1`（真的有測試在紅）,被砍之後永遠跑不到它自己的結論。
 *
 *   ② ⭐ **`p.kill()` 只殺得到直屬子行程。** 2026-08-30 在真的跑裡量到的行程樹是
 *      `node ship.mjs` → **`npm exec vitest …`（直屬子）** → `node (vitest)` → `node (vitest N)` fork。
 *      SIGKILL 打在 `npm exec` 上,孫、曾孫**全部活著**,而它們握著 stdout/stderr 的 pipe
 *      ⇒ ⭐ **`'close'` 事件永遠不來** ⇒ 這個 Promise 永遠不 resolve
 *      ⇒ `Promise.all(workers)` 永遠不 resolve ⇒ **看門狗「開火」之後 ship.mjs 靜靜卡死**。
 *      （最小重現驗過：SIGKILL 直屬子之後 `exit` 有來、`close` 沒來。）
 *      ⚠️ 帳本上那四次之所以還記得到,是因為孤兒 vitest **剛好自己跑完了** ——
 *        「300s 開火」與記錄到的 310–347s 之間那 10–47 秒,就是孤兒的指紋。
 *        孤兒**真的**卡在 0% CPU 時,那個差就是無限大。
 *
 *   ③ ⭐ **開火的當下終端上一個字都沒有。** 那句 hung 訊息被推進 `out[]`,
 *      而 `out[]` 只有在 `close` 時才寫進 log ⇒ 卡死期間「還在跑」與「已經被判死」
 *      **長得一模一樣** ⇒ 人 Ctrl-C 掉它,而 Ctrl-C 掉的那一次**帳本上什麼都沒有**。
 *
 * ── ⭐ 修法（三個都修,⛔ 不是只修最上面那個）──────────────────────────────
 *   ① 估時**真的**從帳本讀（`estimateMs`,同一份 `deploy-timings.json`）並傳進來;
 *      地板抬到 10 分鐘 —— 一支正常 283s 的 suite ⛔ 不可以被判死。
 *   ② `detached:true` 讓子行程自成一個 **process group**,逾時殺 `-pid`（**整組**）,
 *      SIGTERM → 寬限 → SIGKILL。⇒ 孤兒不再握著 pipe,也不再繼續吃 CPU 拖垮同儕。
 *   ③ ⭐⭐ **無論如何都會 settle**：`close` 沒來就靠 `exit`＋寬限計時器收尾,
 *      再不行就在硬上限收尾。⛔ **這支腳本再也不會「等下去」。**
 *      而且開火的當下**立刻印到 stderr**,⛔ 不是只寫進 log。
 *   ⇒ 逾時 = **非零離開碼（124）** ＋ 名字帶 `（hung,看門狗殺的）` ＋ 進最後那張失敗表。
 *
 * 🔙 **rollback（這支腳本自己的慣例就是環境變數:`GGD_SHIP_CONCURRENCY`／`GGD_SYNC_CONVERGE`）**
 *   `GGD_SHIP_WATCHDOG_FLOOR_MS=300000` 退回舊地板 · `GGD_SHIP_WATCHDOG_MULT=0` 退回「只看地板」
 *   `GGD_SHIP_WATCHDOG_OFF=1` 整隻關掉（⚠️ 那就回到「等 11 分鐘」的那一版）
 */
const WATCHDOG_FLOOR_MS = Number(process.env.GGD_SHIP_WATCHDOG_FLOOR_MS ?? 10 * 60 * 1000);
const WATCHDOG_MULT = Number(process.env.GGD_SHIP_WATCHDOG_MULT ?? 3);
// 送出 SIGKILL（或看到 exit）之後,還等多久 `close` —— 等不到就自己收尾。
const WATCHDOG_GRACE_MS = Number(process.env.GGD_SHIP_WATCHDOG_GRACE_MS ?? 20000);

/**
 * ⭐ 這一支上一次跑了多久 —— 從**同一份**帳本讀中位數（⛔ 不是另開一份估時表）。
 * ⚠️ 被看門狗殺過的那幾筆名字帶著「（hung,看門狗殺的）」⇒ 它們是**不同的 key**,
 *    ⭐ 自動不會污染中位數（⛔ 拿被砍的長度去算下一次的上限 = 上限每次自己長高）。
 * ⚠️ 讀不到／沒有歷史 ⇒ 回 0 ⇒ 落到地板（fail-safe:寧可等久一點,⛔ 不要誤殺）。
 */
const LEDGER_PATH = `${REPO}docs/_data/deploy-timings.json`;
function estimateMs(name) {
  try {
    const led = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
    const xs = [];
    for (const r of led.runs ?? []) for (const st of r.stages ?? []) if (st.name === `ship:${name}`) xs.push(st.ms);
    if (!xs.length) return 0;
    xs.sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  } catch {
    return 0;
  }
}

/** ⭐ 還活著的子行程群組 —— Ctrl-C 時要把它們一起帶走（`detached` 讓它們不再自動跟著死）。 */
const LIVE_GROUPS = new Set();
const killGroup = (pid, sig) => {
  try { process.kill(pid, sig); } catch { /* MUTANT: 只殺直屬子 */ }
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    for (const pid of LIVE_GROUPS) killGroup(pid, "SIGKILL");
    process.exit(130);
  });
}
process.on("exit", () => { for (const pid of LIVE_GROUPS) killGroup(pid, "SIGKILL"); });

function run(name, bin, args, estMs = 0) {
  return new Promise((res) => {
    const t = Date.now();
    const log = `${LOGDIR}/${name.replace(/[^a-z0-9]+/gi, "_")}.log`;
    const out = [];
    // ⭐ `detached:true` ⇒ 子行程自成 process group ⇒ 逾時殺得掉**整棵樹**
    //    （`npm exec` → `node (vitest)` → fork）。⛔ 沒有它,SIGKILL 只殺得到最上面那一層。
    const p = spawn(bin, args, { cwd: REPO, env: process.env }); /* MUTANT: 不 detached */
    if (p.pid) LIVE_GROUPS.add(p.pid);
    const est = Number.isFinite(estMs) ? estMs : 0;
    const limit = process.env.GGD_SHIP_WATCHDOG_OFF === "1"
      ? Number.POSITIVE_INFINITY
      : Math.max(WATCHDOG_FLOOR_MS, est * WATCHDOG_MULT);
    let hung = false;
    let settled = false;
    let grace = null;
    const settle = (code, note) => {
      if (settled) return;
      settled = true;
      clearTimeout(dog);
      if (grace) clearTimeout(grace);
      if (p.pid) { LIVE_GROUPS.delete(p.pid); } /* MUTANT */
      if (note) out.push(Buffer.from(note));
      try { writeFileSync(log, Buffer.concat(out)); } catch { /* log 寫不出來不擋收尾 */ }
      res({ name: hung ? `${name}（hung,看門狗殺的）` : name, code, ms: Date.now() - t, log });
    };
    const dog = Number.isFinite(limit)
      ? setTimeout(() => {
          hung = true;
          const msg =
            `\n⏲️ 看門狗:${name} 超過 ${(limit / 60000).toFixed(1)} 分鐘` +
            `（帳本估 ${(est / 1000).toFixed(0)}s × ${WATCHDOG_MULT},地板 ${(WATCHDOG_FLOOR_MS / 60000).toFixed(0)}m）` +
            ` —— 判定 hung,殺**整個 process group**。單獨重跑通常會過(併行撞車)。\n`;
          out.push(Buffer.from(msg));
          // ③ ⭐ **立刻印到終端** —— ⛔ 不是只寫進 log（不然卡死期間看起來就是「還在跑」）。
          process.stderr.write(msg);
          p.kill("SIGKILL"); /* MUTANT: 出貨那一版逐字 —— SIGKILL 直接打直屬子,⛔ npm 不會轉發 */
          // ⭐⭐ 硬收尾：`close` 不來也要 settle（⛔ 這支腳本不再「等下去」）。
          /* MUTANT: 寬限收尾拿掉 */
        }, limit)
      : null;
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => out.push(d));
    // ⚠️ `error`（bin 不存在之類）也要 settle,⛔ 不然那一格也是永遠不回來。
    p.on("error", (e) => settle(127, `\n⛔ 起不來: ${String(e)}\n`));
    // ⭐ `exit` 比 `close` 早（`close` 要等 stdio 全關）—— 開一個寬限,等不到 close 就自己收。
    p.on("exit", (code) => {
      if (settled) return;
      /* MUTANT: exit 寬限拿掉 */ void code;
    });
    p.on("close", (code) => settle(hung ? 124 : (code ?? 1)));
  });
}

const results = [];
const T0 = Date.now();

// ── ① 序列段 ───────────────────────────────────────────────────────────
if (!noSync) {
  console.log(`🔒 序列段 ${SERIAL.length} 支（全域鎖）· skills:sync 裁剪: ${syncTrim.why}`);
  // 🔒 產物隔離區:序列段跑**個別**產生器（content:build 等,不經過 sync.mjs 的
  //    解鎖）⇒ 這裡也要解鎖。⛔ 不鎖回去交給 sync.mjs 的 exit handler /
  //    下面的 finally —— 兩邊都鎖是冪等的,少一邊才是洞。
  try {
    execFileSync("bash", ["scripts/product-quarantine.sh", "unlock"], { cwd: REPO, stdio: "inherit" });
  } catch (e) { console.error(`⚠️ 隔離區 unlock 失敗(不擋): ${String(e)}`); }
  process.on("exit", () => {
    try { execFileSync("bash", ["scripts/product-quarantine.sh", "lock"], { cwd: REPO, stdio: "ignore" }); }
    catch { /* 鎖不回去不擋出貨 */ }
  });
  for (const s of SERIAL) {
    process.stdout.write(`🔒 ${s} …`);
    const r = await run(s, "pnpm", [s], estimateMs(s)); // ⭐ GH#858:估時**真的**傳進去
    results.push({ ...r, phase: "serial" });
    process.stdout.write(` ${(r.ms / 1000).toFixed(1)}s ${r.code === 0 ? "✓" : "✗"}\n`);
    // ⛔ 序列段紅了就停:下游全部會拿到過期的產物,再跑只是製造誤導的紅燈。
    if (r.code !== 0) {
      console.error(`\n⛔ ${s} 失敗（全域鎖那一段）—— 後面不跑了,因為產物是過期的。`);
      console.error(`   log: ${r.log}`);
      process.exit(1);
    }
  }
}

// ── ② 並行段 ───────────────────────────────────────────────────────────
if (!onlySync) {
  const limit = SHIP_LIMIT;
  console.log(
    `⚡ 並行段 ${PARALLEL.length} 支 · 上限 ${limit} · 每包 ${FORKS_PER_SUITE} forks（${cpus().length} 核 ÷ ${SUITE_COUNT} 包）· ⛔ 不 fail-fast\n   vitest 裁包: ${suiteTrim.why}`,
  );
  const queue = [...PARALLEL];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const r = await run(job.name, job.cmd[0], job.cmd[1], estimateMs(job.name)); // ⭐ GH#858
      results.push({ ...r, phase: "parallel" });
      process.stdout.write(`   ${r.code === 0 ? "✓" : "✗"} ${job.name} ${(r.ms / 1000).toFixed(1)}s\n`);
    }
  });
  await Promise.all(workers);
}

// ── 帳本 ───────────────────────────────────────────────────────────────
// ⭐ 寫進**同一份** `docs/_data/deploy-timings.json`,用 `tools/deploy-timing`
//    的 `ggd-deploy-timings@1` schema —— ⛔ 不是自己再開一份。
// ⚠️ 我第一版真的自己寫了一份同名不同義的帳本（第〇·四守則的反例：
//    同一份知識兩個住處,之後各自漂）。
const wall = (Date.now() - T0) / 1000;
const serialMs = results.filter((r) => r.phase === "serial").reduce((s, r) => s + r.ms, 0);
const parMs = results.filter((r) => r.phase === "parallel").reduce((s, r) => s + r.ms, 0);
for (const r of results) appendStage(`ship:${r.name}`, r.ms, r.code, { phase: r.phase });
appendStage("ship:total", Math.round(wall * 1000), results.some((r) => r.code !== 0) ? 1 : 0, {
  phase: "summary",
  serialSec: Number((serialMs / 1000).toFixed(1)),
  parallelCpuSec: Number((parMs / 1000).toFixed(1)),
  forksPerSuite: FORKS_PER_SUITE,
});

const failed = results.filter((r) => r.code !== 0);
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
console.log(
  `\n🚢 出貨四閘 —— wall ${wall.toFixed(1)}s` +
    (noSync ? "" : ` （其中全域鎖 ${(serialMs / 1000).toFixed(1)}s **不可分拆**）`) +
    `\n   並行段累計 CPU ${(parMs / 1000).toFixed(1)}s ⇒ 平行度 ${(parMs / 1000 / Math.max(0.001, wall - serialMs / 1000)).toFixed(1)}×` +
    `\n   最慢五支: ${slowest.map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(" · ")}` +
    `\n   ⭐ 時間帳本: docs/_data/deploy-timings.json（與 tools/deploy-timing 同一份）`,
);

if (failed.length === 0) {
  console.log("\n✅ 四閘全綠。");
  process.exit(0);
}
// ⭐ 一次列完（⛔ 不是「修一個再跑一次」）—— 而且指名 log 檔,不截斷。
console.error(`\n⛔ ${failed.length} 支紅了 —— ⭐ 一次列完:`);
for (const f of failed) console.error(`   ✗ ${f.name}（exit ${f.code}） → ${f.log}`);
process.exit(1);
