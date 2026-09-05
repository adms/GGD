import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

/**
 * GH#428 —— 這個檔在 2026-08-20 之前**不存在**，而 repo 根的 `vitest.config.ts`
 * 檔頭宣稱「per-package runs do NOT read this file」。**那句話對本套件是假的**
 * （CLAUDE.md 第三守則：註解會說謊，去驗證）。
 *
 * 出貨程式怎麼說（`node_modules/vitest/dist/chunks/cli-api.*.js` 的 `createVitest`）：
 *
 *   const root = slash(resolve(options.root || process.cwd()));
 *   const configPath = … : await findUp(configFiles, { cwd: root });
 *                              ^^^^^^ 往上走
 *
 * `root` 停在 cwd（＝ `packages/shared`），但 `configPath` 是 **findUp** ——
 * 找不到就一路往上撿到 repo 根那一份。於是根設定裡加的每一格
 * （setupFiles / environment / globals / coverage 門檻）都會**默默**套進本套件的
 * 415 支測試，而**相對路徑會用 `packages/shared/` 當基準去解析**。
 * 實測（#428 的 lane Q）：往根設定加一格
 * `setupFiles: ["./apps/client/src/testSetup.vfxContent.ts"]`
 * → `cd packages/shared && npx vitest run` 當場 **29 個檔一起紅**：
 *   `Failed to load url /Users/Takuro/GGD/packages/shared/apps/client/src/…`
 *
 * ⇒ 修法是讓**程式符合散文**（#428 的 (a)），不是把散文改得更小心。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼這裡**沒有** `include`
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/game-server/vitest.config.ts` 的 `include` 只收 `src/` 底下的 `*.test.ts`，
 * 照抄過來會**靜默少收一支**：`testkit/starterRoster.test.ts` 不在 `src/` 底下。
 * 量到的（2026-08-20，`vitest list --filesOnly`）：415 支，其中 414 支在 `src/`，
 * 第 415 支就是它。⇒ 用 vitest 預設的 include，收到的檔案集合與加這個檔之前
 * **逐行相同**（前後 diff 為空，這是驗收條件）。CLAUDE.md 失敗形態 ③：
 * 少收的那一支不會紅，它只是不見了。
 *
 * 同理**沒有** `exclude`：根設定多出來的四格（`.backup*` / `backup-*` /
 * `.claude/worktrees` / `docs/legacy`）全部在 repo 根，本套件底下一個都沒有
 * （量過：backupdirs = 0），寫進來只是抄一份會腐爛的名單。
 */
export default defineConfig({
  // ⚠️ 唯一**不可以**省的一格。少了它，`.js` 會排在 `.ts` 前面，一個手滑
  // `tsc` 掉出來的 `foo.js` 就能讓 `src/sim/content/registry.ts` 的
  // module-level singleton 存在兩份 —— `registerAll()` 填一份、`Champions.get()`
  // 讀另一份空的，然後丟 `content not registered: <id>`。全部理由在
  // `vitest.shared.ts` 的檔頭，守衛是 `src/staleArtifacts.test.ts`。
  resolve: RESOLVE_TS_FIRST,
  test: {
    // 明寫出來，不是靠 vitest 預設 —— 這個套件是純邏輯（sim / content / ops），
    // 任何人想在這裡開 jsdom 都應該是一個看得見的決定。
    environment: "node",
    // ⚡ owner 2026-08-23：「我的本地端機器是 M5 Max 128G 非常高效能，請你盡量壓榨
    // 多執行緒跟記憶體在本地端最大加速完成任務」，並對「worker 數：forks 16，
    // ⛔ 不要 threads」回覆「以上都同意」。
    //
    // ⛔ `threads` 會炸：這個 repo 有 Babylon 的 headless mock 與 CJS/ESM 混用。
    // `forks` 剛好也是 vitest 2.x 的預設 pool —— 明寫出來是為了讓「有人把它換成
    // threads」變成一個看得見的決定，而不是一次沉默的預設漂移（同上一格的理由）。
    pool: "forks",
    poolOptions: { forks: { maxForks: 16, minForks: 4 } },
    // ⏱ GH#979 —— **包級**逾時，⛔ 不是逐支打地鼠。
    //
    // ⚠️ ⭐ 這一包有一整族測試在 `it` 裡跑**整棵出貨內容樹**的 `ContentLoader.load()`
    //   （本機 0.7 秒、GitHub runner 5.0+ 秒）⇒ vitest 的預設 **5s** 在 CI 上必炸。
    //   2026-09-05 CI 第一次真的跑起來時，它一次讓 **8 支**紅
    //   （`abilityAffordableAtUnlock` 5,036ms · `abilityRadiusWithinZone` 5,045ms ·
    //    `skillTierLadder` · `itemTiers` · `abanTwoStrike` · `arenaSpawnSeats` ·
    //    `retiredLootTables`×2）。
    //
    // ⛔⛔ ⭐ 而它最貴的地方是**症狀**：vitest 把「超時」印成
    //   `FAIL <檔> > <測試名>` —— **與斷言失敗長得一模一樣**
    //   ⇒ 讀的人會去查內容與產生器（我第一輪就是那樣查的）。
    //
    // ⭐ 這是放寬**時鐘**，⛔ 不是放寬斷言：沒有任何一條斷言因此改變。
    // ⚠️ 代價誠實寫在這裡：一支真的**掛住**的測試現在要 60 秒才會被殺掉，
    //   ⛔ 不是 5 秒。⇒ 那一層由 `ship.mjs` 的逐 suite 看門狗守（CLAUDE.md 第零守則⏲）。
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
