/**
 * GGD eslint — flat config, monorepo-wide.
 *
 * ── 為什麼這個檔案在 2026-08-02 才出現 ─────────────────────────────────────
 *
 * 那天 owner 回報**五次**「所有介面突然都消失，只剩人物跟戰鬥場景」。root cause
 * 是 Rules of Hooks 違規：`KillCombo.tsx` / `MobBossOverlay.tsx` 把
 * `useBossHealthBarSpec()`（一條 ≥12 個 hook 的鏈）寫在 `return null` **之後**，
 * 於是殭屍連殺出現的那一幀 hook 數暴增，React 丟「Rendered more hooks than
 * during the previous render.」，而 render 期間的未捕捉例外 = React 18 卸載整個
 * root。缺陷活了四個版本（v0.9.17~20）。
 *
 * `react-hooks/rules-of-hooks` 會**直接**抓到那兩行 —— 而在此之前這個 repo
 * **根本沒有 eslint 設定**（根與各 workspace 下都沒有 `eslint.config.*` /
 * `.eslintrc*`，外掛也沒裝）。程式碼裡卻散落著
 * `// eslint-disable-next-line react-hooks/exhaustive-deps`，讀起來像有 linter
 * 在守。那是假的 —— 正是 CLAUDE.md 第三守則說的「註解會說謊」。
 *
 * ── 規則集為什麼這麼小（這是刻意的，不是偷懶）───────────────────────────
 *
 * 一次開一百條規則會噴幾千個 warning，然後沒有人會跑它 —— 那等於沒做。
 * 所以這裡的分層是「量出來之後」決定的，不是憑感覺。
 *
 * ── ⛔⛔ 這一格在此之前寫的是一句**謊話**（GH#979，2026-09-05）───────────
 *
 * 逐字：「ERROR **現在是 0 筆** → `pnpm lint` 今天就是綠的，所以 CI 可以真的擋。」
 *
 * ⭐ 而 2026-09-05 實測是 **24 個 error / 173 個 warning**，`pnpm lint` **EXIT=1**
 *   —— CI 的 `unit` job 因此 **0/200 綠，從 2026-07-30 起**。
 * ⚠️ ⭐ 這正是 CLAUDE.md 第三守則的形狀，而且是最貴的那一種：
 *   **一句散文守著一個數字，寫在守著這條閘的檔案的檔頭上，
 *   而那個數字過期的時候沒有任何東西變紅。**
 *   ⛔ 它自己點名的第一條 `no-fallthrough`，正好是後來真的紅的兩筆之一。
 *
 * ── ⭐ 量到的（2026-09-05；⛔ 不是估的）────────────────────────────────────
 *
 *   指令   `pnpm lint`（＝ `NODE_OPTIONS=--max-old-space-size=8192 eslint apps packages tools`）
 *   結果   **0 error / 173 warning，EXIT=0**（本輪 24 個 error 逐條修完之後）
 *   OFF    unused-vars（114）+ explicit-any（106）+ control-regex（6，見下面那一格）
 *
 * ⚠️⚠️ ⭐ **上面那三行數字會過期，而這一次的教訓就是「它過期時沒人知道」。**
 *   ⇒ ⛔ **紅了不要把它改回一句斷言**（「現在是 0 筆」那種）——
 *   ⭐ 正確動作是**重量一次**再把新數字連同日期寫回來：
 *
 *       pnpm lint > /tmp/lint.log 2>&1; echo "EXIT=$?"; tail -3 /tmp/lint.log
 *
 *   ⭐ 而真正該做的是讓這個數字**不必靠人維護** —— 它今天靠的是 CI 的
 *   `Lint (eslint)` 那一步會回非零（⛔ 不要加 `|| true`、⛔ 不要加 `--max-warnings 0`）。
 *   ⇒ ⭐ 這幾行是**給人讀的背景**，⛔ 不是閘；⭐ 閘是那一步的離開碼。
 *
 * ⚠️ **把「已知會噴一堆」的規則關掉是可接受的；假裝它們過了不是。**
 * 下面每一條的括號是實測筆數（2026-08-02 的工作樹，1,915 個檔，
 * 用 `eslint --format json` 逐條數出來的，不是估的）——
 * ⚠️ ⭐ 那些括號**也是 2026-08-02 的**，同樣會過期，判準同上。
 *
 * ── ⛔ 另外一件 2026-09-05 才量到的事：`pnpm lint` 會 **OOM** ────────────
 *
 *   裸跑 `eslint apps packages tools` → **EXIT=134**（heap limit，4,069 MB 撐 ~92 秒）
 *   加 `NODE_OPTIONS=--max-old-space-size=8192` → 跑得完
 * ⇒ ⭐ 所以 `package.json` 的 `lint` / `lint:fix` 兩支都帶著那個環境變數。
 * ⚠️ 它的失敗形態**看起來不像 lint 失敗**：一大片 V8 堆疊，⛔ 沒有一行寫著哪個檔案。
 *   ⇒ 下一次 EXIT=134 時，先看是不是 repo 又長大了，⛔ 不要去找「哪一條規則壞了」。
 *
 * ── 下一批（按價值排序，等有人願意做清理才開）─────────────────────────
 *
 *   1. `@typescript-eslint/no-unused-vars`（114 筆）—— 但更好的家其實是
 *      `tsconfig.base.json` 的 `noUnusedLocals` / `noUnusedParameters`，
 *      那樣 `pnpm typecheck` 就會擋，不必多跑一個工具。先清 114 筆再開。
 *   2. 型別感知那一組再往外擴：`no-unnecessary-condition`、
 *      `require-await`。現在只開了三條 promise 規則（見檔案下半部），
 *      因為那一組要跑 TS program，是這份設定裡唯一昂貴的部分。
 *   3. `@typescript-eslint/no-explicit-any`（106 筆）—— 純風格，價值最低，
 *      排最後。
 *
 * ── 執行 ─────────────────────────────────────────────────────────────────
 *
 *   pnpm lint        整個 monorepo（CI 的 unit job 會跑，見 .github/workflows/ci.yml）
 *   pnpm lint:fix    只修可自動修的
 *
 * ⚠️ 檔名是 `.mjs` 不是 `.js`：根 `package.json` 沒有 `"type": "module"`，
 * 所以 `eslint.config.js` 會被當成 CommonJS，而這份是 ESM。
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * 不進 lint 的東西。
 *
 * `.venv` 與 `.backup*` 不是潔癖：實測第一次跑的時候，`tools/icon-gen/.venv/`
 * 裡 pytorch 附的壓過的 preact.mjs 一個人就貢獻了 60+ 筆 —— 那種噪音正是
 * 「沒有人會跑它」的起點。
 */
const IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.d.ts",
  // python venv（tools/icon-gen、tools/voice-gen 等）裡有 vendored 壓過的 JS
  "**/.venv/**",
  // 背景工作留在 repo 裡的整棵樹快照（.gitignore 也在擋）
  "**/.backup*/**",
  "**/backup-*/**",
  ".backups/**",
  "tools/icon-gen/out/**",
  "tools/icon-gen/models/**",
  // Go / Python，不是這個 linter 的事
  "apps/platform/**",
  "voice-reference-pipeline/**",
  // 資料，不是程式
  "content/**",
  "data/**",
  "scratchpad/**",
  // vite 跑起來時暫時寫在 apps/*/ 底下的設定 bundle
  "**/vite.config.*.timestamp-*.mjs",
];

export default tseslint.config(
  { ignores: IGNORES },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      // 這個 repo 一個檔案裡同時有瀏覽器與 node 的東西（vite 設定、腳本、
      // 共用模組），逐目錄拆 globals 只會製造假的 no-undef。兩邊都給。
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      // ⚠️ 這一條本身就是第三守則的守衛：repo 裡散落著針對「從沒跑過的
      // linter」寫的 `eslint-disable`。開著它，那些裝飾用的註解會被指名
      // （實測 8 筆），而不是繼續假裝有人在守。設 warn 不設 error，因為
      // 它們是既有債、不是新缺陷。
      reportUnusedDisableDirectives: "warn",
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // ════════════════════════════════════════════════════════════════
      // ERROR —— 現存 0 筆，所以這一層今天是綠的，CI 可以真的擋
      // ════════════════════════════════════════════════════════════════

      /**
       * ★ 這條規則就是這整個檔案存在的理由。
       *
       * 它抓的是「hook 在條件式/early return 之後才被呼叫」——
       * 也就是 2026-08-02 讓整個 HUD 消失四個版本的那個形狀。
       * 行為守衛在 `apps/client/src/ui/hud/hookOrder.test.ts` 第④組：
       * 那條測試真的跑這個 eslint 設定去 lint 一段有缺陷形狀的程式碼，
       * 並斷言它報錯。**這條永遠不准降級成 warn 或 off。**
       */
      "react-hooks/rules-of-hooks": "error",

      /**
       * 全形空白（U+3000）、BOM 之類的隱形字元跑進**程式碼 token 之間**。
       *
       * 這在一個註解、字串、UI 文案全是中文的 repo 特別容易發生，而且
       * 看不見 —— 所以它是 error。
       *
       * 五個 skip 都是必要的，不是放水：中文排版本來就會用 `　` 當字距
       * （`${t.id}　${label}`），regex 也真的要匹配 U+3000 / U+FEFF
       * （`controlLegendModel.ts` 的 CJK_RANGE、`serve.mjs` 的去 BOM）。
       * 不 skip 的話這條會誤報 29 筆，全部是刻意的 —— 而一條會誤報的
       * error 規則兩天內就會被整條關掉。
       */
      "no-irregular-whitespace": [
        "error",
        {
          skipComments: true,
          skipStrings: true,
          skipTemplates: true,
          skipJSXText: true,
          skipRegExps: true,
        },
      ],

      /**
       * ⛔⛔ `no-control-regex` —— **關掉，而且這是量出來之後的裁決**（GH#979）。
       *
       * ⚠️ 2026-09-05 實測：它在這個 repo 觸發 **7 個站點，而 7 個全部是誤報**
       *   （6 筆報成 error ＋ 1 筆早就被一行 `eslint-disable-next-line` 壓著 ——
       *   ⭐ 第 7 個正是這條規則「在這裡永遠是錯的」最好的證據：有人已經一個一個關過了）。
       * ⭐ 每一個的意圖逐字都是「我**就是要**匹配控制字元」：
       *
       *   apps/admin/src/changePassword.ts:62（原本帶 disable 註解，本輪一併拿掉）
       *     密碼**不可以**含控制字元 —— 這條 regex 就是那條規則本身
       *   packages/shared/src/content/import/zipSafety.ts:229
       *     `[ -�]` —— zip entry 名稱的**控制字元偵測**，
       *     ⭐ 那正是這條安全檢查存在的理由（NUL 截斷 ＋ U+FFFD 解碼殘骸）
       *   packages/shared/src/content/modelFxTextureBackdrop.test.ts:63
       *   packages/shared/src/content/modelTextureAlphaMode.test.ts:48
       *     `[  ]+$` —— GLB 的 JSON chunk 是**用 NUL 補齊到 4 byte 的**，
       *     ⛔ 不剝掉 `JSON.parse` 直接爆
       *   packages/shared/src/ops/shellWideCharVars.test.ts:23
       *     `[^\x00-\x7F]` —— 「非 ASCII」的標準寫法
       *   tools/deploy-timing/run.mjs:281
       *     `\x1b\[[0-9;]*m` —— 剝 ANSI 色碼
       *
       * ⭐ 規則自己的說法是「這些字元很少出現在字串裡 ⇒ 寫進 regex **多半是手滑**」。
       * ⇒ ⛔ 在一個要解 GLB / zip / ANSI log 的 repo 裡，那個前提不成立：
       *   真陽性 0、假陽性 7。⚠️ 而一條 100% 誤報的 error 規則的下場只有一個 ——
       *   有人在它擋路的第二天把**整步 lint 刪掉**（這份檔頭已經記過同一個形狀）。
       *
       * ⛔ **為什麼不逐點 `eslint-disable`**：那是 7 個註解要各自維護，
       * ⭐ 而它們講的是同一件事。判準：一條規則如果在**這個 codebase 的每一次觸發**
       * 上都是錯的，那它該關在設定裡（帶著這份清單），⛔ 不是散在七個檔裡。
       * ⚠️ 這一格要**重量**的時機：有人真的因為手滑打進控制字元而出事的那一天。
       */
      "no-control-regex": "off",

      // js.configs.recommended + tseslint recommended 其餘每一條都留在 error。
      // ⚠️⚠️ ⭐ **2026-09-05 更正**：這裡在此之前寫著「實測它們現在**一筆都沒有**
      //   （no-fallthrough / no-dupe-keys / …）」—— ⛔ **那句話已經過期，
      //   而且它點名的第一條 `no-fallthrough` 正好是後來真的紅的兩筆之一。**
      //   ⇒ 這一段現在**不寫斷言**，只寫「留著它們的理由」：新寫出來的那一筆會紅。
      //   ⭐ 今天的實際筆數以檔頭那張表為準（那張表自己也會過期，紅了就重量）。

      // ════════════════════════════════════════════════════════════════
      // WARN —— 現存少量債。看得到、不擋人。括號內是 2026-08-02 實測筆數。
      // ════════════════════════════════════════════════════════════════

      // (20) 有名的吵。但它真的抓得到 stale closure，而且 repo 裡已經有人
      // 為它寫過 disable 註解（雖然那時沒有 linter 在跑）—— 代表這個團隊
      // 願意面對它。留 warn，清完再升 error。
      "react-hooks/exhaustive-deps": "warn",

      // (21) 「賦值了但後面沒人讀」。多半是 `let x = init` 之後整條路徑
      // 都會覆寫，無害；偶爾是真的漏掉一個分支。
      "no-useless-assignment": "warn",

      // (15) 幾乎都是腳本裡的 `cond && doThing()`。
      "@typescript-eslint/no-unused-expressions": "warn",

      // (18) / (4) / (3) / (2) / (1)×5 —— 零星，集中在 scripts/ 與 tools/
      // 以及測試檔。全部可以慢慢清，沒有一筆是缺陷。
      "prefer-const": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "preserve-caught-error": "warn",
      "no-ex-assign": "warn",
      "no-empty-pattern": "warn",
      "no-regex-spaces": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",

      // ════════════════════════════════════════════════════════════════
      // OFF —— 現存 100+ 筆。開了會把上面的訊號整個淹掉。
      // 每一條都寫了「什麼時候開」，見檔頭「下一批」。
      // ════════════════════════════════════════════════════════════════

      // (114) 真正的家是 tsconfig 的 noUnusedLocals / noUnusedParameters，
      // 那樣 `pnpm typecheck` 就會擋，不必多跑一個工具。先清完再說。
      "@typescript-eslint/no-unused-vars": "off",

      // (106) 純風格，抓不到缺陷。價值最低，排最後。
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  /**
   * eslint-plugin-react-hooks v7 另外帶了一整包 React Compiler 規則
   * （`immutability` / `static-components` / `set-state-in-effect` /
   * `preserve-manual-memoization` …）。它的 `recommended` preset 會全開。
   *
   * **這裡刻意不用那個 preset**，只挑上面兩條。理由同上：那一包在這個
   * codebase 會噴到四位數，而它們講的是「要不要走 React Compiler」這個
   * 尚未做過的決定，不是「今天有沒有缺陷」。
   */

  /**
   * ⭐ CommonJS 檔（`.cjs`）—— `require()` 在這裡**是唯一正確的寫法**，⛔ 不是債。
   *
   * ⚠️ 2026-09-05 量到（GH#979）：`@typescript-eslint/no-require-imports` 在
   * `tools/parallel-gates/hooks/node-trace.cjs` 報了 **3 筆** —— ⭐ 而那個檔案
   * **必須**是 CJS：它靠 `NODE_OPTIONS=--require <這個檔>` 掛進去，而 `--require`
   * 逐字**只吃 CommonJS**。⇒ ⛔ 改成 `import` 那支探針會直接不啟動，
   * 而它的失敗形態是**靜默的**（trace log 空了，而 sync-io.json 看起來只是變短）。
   *
   * ⭐ 所以這不是「關掉一條擋路的規則」，是**把規則對到它適用的模組系統**：
   * `.ts`/`.mts`/`.mjs` 那一側**仍然是 error**，新寫的 `require()` 照樣紅。
   */
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 型別感知（TYPE-AWARE）—— 只有這一塊要跑 TS program，也只有這三條
  // ══════════════════════════════════════════════════════════════════════
  /**
   * 為什麼值得付這個代價：`no-floating-promises` 在第一次跑就抓到
   * `apps/client/src/ui/codex/useCodex.ts:114` —— 一個沒有 `.catch` 的
   * `.then()`，也就是一個真的會變成 unhandled rejection 的點。那是語法層
   * 規則永遠看不到的一類缺陷。
   *
   * 範圍只到各 workspace 的 `src` 樹（下面 `files` 那兩個 glob），因為
   * `projectService` 需要每個被 lint 的檔案都在某個 tsconfig 的 `include`
   * 裡 —— 而那兩個 glob 剛好對應到各 workspace tsconfig 實際涵蓋的範圍。
   * tools 底下與各 app 的 scripts 目錄沒有一致的 tsconfig，硬拉進來只會炸。
   *
   * 三條都是 warn 而不是 error：現存 3 筆（1 筆 floating、2 筆
   * misused-in-conditional）。等那三筆有人裁決過再升。
   */
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/await-thenable": "warn",
    },
  },
);
