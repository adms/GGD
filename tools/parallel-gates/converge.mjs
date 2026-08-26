#!/usr/bin/env node
/**
 * ⭐⭐ **`skills:sync` 跑到不動點** —— GH#710。
 *
 * ── 病（量出來的，⛔ 不是感覺）────────────────────────────────────────────
 * `sync-io.json` 量到 **3 支產生器排在 `content:build`（鏈上第 11 支）後面，
 * 而它們寫的檔正是 `content:build` 自己會讀的**：
 *
 *   28 `jasscombo:build` → `content/config/combo-strikes.json`（前面 5 支讀它）
 *   29 `vfxbind:build`   → `content/config/ability-vfx-bindings.json`（前面 4 支讀它）
 *   30 `sfxbind:build`   → `content/audio-manifests/ability-sfx-cues.json`（前面 2 支讀它）
 *
 * ⇒ 只要這三支之中有**一支**改了輸出，`bundle.json` / `_index.json` /
 *   `contract:numbers` 就落後一步 ⇒ **一次完整鏈跑完仍然是 stale**。
 *   2026-08-26 實測：要跑**兩次**完整鏈才綠。
 *
 * ── 為什麼是「跑到不動點」而**不是**重排鏈的拓撲序 ──────────────────────
 * `sync-io.json` 的 `chain` 字串是**身分**：`sync.mjs` 的閘①逐字比對它與
 * `package.json` 的 `skills:sync`，對不上就**拒跑**。⇒ 動一個字就要重跑
 * 3-pass trace 重量整張圖（那是大工程），而且 `skills:sync` 這個名字被
 * **20 幾份產生的文件**逐字引用（`tools/ap-conversion/gen.py` 還印它的位置表）
 * ⇒ 改名／改順序的下游成本遠大於這一支迴圈。
 * ⭐ 這一支**一個字都不動那條鏈**。
 *
 * ── ⛔ 上限存在的理由 ─────────────────────────────────────────────────────
 * 產生器鏈**不保證**收斂：兩支可以互相把對方的輸入寫回去（震盪）。
 * ⇒ 上限 3 輪，⛔ 不是「跑到綠為止」。超過就**回非零並列出仍然 stale 的那幾支**，
 *   ⛔ 不是安靜地放行（fail-open 沒錯，靜默才是缺陷）。
 * ⭐ 而且**連兩輪 stale 集合一模一樣**就提早停 —— 那是震盪，第三輪不會不一樣。
 *
 *   node tools/parallel-gates/converge.mjs              # 跑到不動點（最多 3 輪）
 *   node tools/parallel-gates/converge.mjs --rounds 1   # 🔙 rollback：退回舊行為（跑一輪就算）
 *   GGD_SYNC_CONVERGE=0 node tools/parallel-gates/converge.mjs   # 同上（環境變數版）
 *
 * ⚠️ 它會跑 `pnpm skills:sync` ⇒ 寫 `bundle.json` ⇒ **全域只能有一條工作流跑它**。
 */
import { spawn } from "node:child_process";

const ROOT = new URL("../../", import.meta.url).pathname;
const HERE = new URL(".", import.meta.url).pathname;

/** 預設輪數上限。⭐ 3 是**上限**不是目標 —— 正常情況第 2 輪就綠。 */
export const DEFAULT_MAX_ROUNDS = 3;

/**
 * ⭐ 從 `run.mjs` / `sync.mjs` 的失敗區塊撈出**是哪幾支** stale。
 * 兩支腳本都印 `═══ <name>（exit N）`（run.mjs 用全形括號，sync.mjs 用半形）。
 */
export function staleStepsFrom(out) {
  const names = new Set();
  for (const m of String(out).matchAll(/═══\s+([^\s（(]+)\s*[（(]exit/g)) names.add(m[1]);
  return [...names].sort();
}

/**
 * 不動點迴圈。⭐ 純的：`runSync` / `runCheck` 由呼叫端注入，所以守衛不必真的跑一次 sync。
 *
 * @param {{runSync:(round:number)=>Promise<{code:number,out:string}>,
 *          runCheck:(round:number)=>Promise<{code:number,out:string}>,
 *          maxRounds?:number, log?:(s:string)=>void}} io
 * @returns {Promise<{converged:boolean, rounds:number, stale:string[], reason:string}>}
 */
export async function converge({
  runSync,
  runCheck,
  /** 每一次收斂開跑前做一次的事（戰情表每日輪替）。⛔ 注入式：測試不必真的滾板子。 */
  beforeSync = undefined,
  // ⭐ 預設回綠 = 舊行為（注入版的測試不必知道 bundle 這一層）;
  //    出貨的呼叫端一定要傳真的那一支,見檔尾。
  runBundleCheck = async () => ({ code: 0, out: "" }),
  maxRounds = DEFAULT_MAX_ROUNDS,
  log = () => {},
}) {
  let prevStale = null;
  for (let round = 1; round <= maxRounds; round++) {
    log(`\n🔁 第 ${round}/${maxRounds} 輪 —— skills:sync`);
    if (round === 1 && beforeSync) await beforeSync();
    const sync = await runSync(round);
    if (sync.code !== 0) {
      // ⛔ sync 自己紅了 ⇒ 不是「還沒收斂」，再跑一輪只會把同一個錯再印一次。
      return { converged: false, rounds: round, stale: staleStepsFrom(sync.out), reason: "skills:sync 自己紅了" };
    }
    log(`   ✓ sync 綠 —— 驗 skills:check`);
    const check = await runCheck(round);
    if (check.code === 0) {
      // ⛔⛔ `skills:check` **不涵蓋 bundle**：它跑的是 40 幾支產生器的 `--check`,
      //    而「bundle 的位元組等於用 content/ 重建出來的」是一條 **vitest** 守衛
      //    (`shippedBundleIsCurrent.test.ts`,重建到 temp 樹比對 ⇒ 唯讀)。
      // ⚠️ 2026-08-26 實測:converge 宣告「第 1 輪不動點」而 bundle 是 stale 的 ——
      //    `vfxbind:build`(29) 在 `content:build`(11) 之後寫了 `ability-vfx-bindings`,
      //    而那正是這一整支要治的病。⇒ **不驗 bundle 的不動點是假的不動點。**
      const bundle = await runBundleCheck(round);
      if (bundle.code === 0) {
        return { converged: true, rounds: round, stale: [], reason: `第 ${round} 輪達到不動點` };
      }
      log(`   ⛔ 產生器全綠但 **bundle 仍 stale** —— 再跑一輪`);
      const bStale = ["content:build(bundle)"];
      if (prevStale && prevStale.length === 1 && prevStale[0] === bStale[0]) {
        return { converged: false, rounds: round, stale: bStale, reason: "震盪 —— bundle 連兩輪都 stale" };
      }
      prevStale = bStale;
      continue;
    }
    const stale = staleStepsFrom(check.out);
    log(`   ⛔ 仍然 stale ${stale.length} 支: ${stale.join(" · ") || "(認不出名字)"}`);
    // ⭐ 震盪偵測：連兩輪一模一樣 ⇒ 再跑不會不一樣，提早停（⛔ 不要燒掉第三輪）。
    if (prevStale && prevStale.length === stale.length && prevStale.every((n, i) => n === stale[i])) {
      return { converged: false, rounds: round, stale, reason: "震盪 —— 連兩輪 stale 的是同一批，鏈不收斂" };
    }
    prevStale = stale;
  }
  return { converged: false, rounds: maxRounds, stale: prevStale ?? [], reason: `跑滿 ${maxRounds} 輪仍未收斂` };
}

/** `pnpm <script>` / `node <script.mjs>`，回傳離開碼與全部輸出（同時原樣轉印）。 */
function run(bin, args) {
  return new Promise((res) => {
    const p = spawn(bin, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const tap = (d) => {
      out += String(d);
      process.stderr.write(String(d));
    };
    p.stdout.on("data", tap);
    p.stderr.on("data", tap);
    p.on("close", (code) => res({ code: code ?? 1, out }));
  });
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--rounds");
  // 🔙 rollback 開關：`--rounds 1` ＝ 舊行為（跑一輪就算，⛔ 不驗不動點）。
  const maxRounds =
    i >= 0 ? Math.max(1, Number(argv[i + 1] ?? 1)) : process.env.GGD_SYNC_CONVERGE === "0" ? 1 : DEFAULT_MAX_ROUNDS;
  const passthrough = argv.filter((a, k) => a !== "--rounds" && k !== i + 1);

  const r = await converge({
    maxRounds,
    log: (s) => console.log(s),
    // 📰 owner 2026-08-26：「**每天自動輪替**，輪替前整份備份 戰情版_temp_{timestamp}.md」
    // ⇒ 每一次收斂都先把戰情表滾到今天（跨日時會自動整份備份）。
    // ⛔ 不放進 `skills:sync` 的 chain 字串 —— 那是 sync-io 的**身分**，改它要重跑 3-pass trace（GH#710）。
    // ⭐ 放這裡是安全的：converge.mjs 是我們自己的包裝，不參與 chain 比對。
    beforeSync: () => run("pnpm", ["board:roll"]),
    runSync: () => run("pnpm", ["skills:sync", ...passthrough]),
    // ⭐ check 走 run.mjs（它自己再並行 40 幾支），⛔ 不是串行的 `pnpm skills:check`。
    runCheck: () => run("node", [`${HERE}run.mjs`, "skills:check"]),
    // ⭐ 唯讀:這支守衛把 content/ 重建到 temp 樹再逐位元組比對出貨的 bundle。
    //    ⛔ 不可以用 `pnpm content:build` 代替 —— 那會**寫**,而且產物此刻是 444。
    runBundleCheck: () =>
      run("npx", [
        "vitest",
        "run",
        "packages/shared/src/content/shippedBundleIsCurrent.test.ts",
      ]),
  });

  if (r.converged) {
    console.log(`\n✅ skills:sync 收斂 —— ${r.reason}（跑了 ${r.rounds} 輪）`);
    process.exit(0);
  }
  console.error(
    `\n⛔ skills:sync **沒有收斂** —— ${r.reason}（跑了 ${r.rounds} 輪，上限 ${maxRounds}）\n` +
      `   仍然 stale: ${r.stale.join(" · ") || "(認不出名字，往上讀完整輸出)"}\n` +
      `   ⭐ 這通常代表鏈上有一支**排在它的下游後面**（量出來的三支：\n` +
      `      jasscombo:build · vfxbind:build · sfxbind:build 都排在 content:build 後面），\n` +
      `      或者兩支互相把對方的輸入寫回去（震盪）。⛔ 不要再手動多跑一次就當它好了。`,
  );
  process.exit(1);
}
