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
 * 所以這裡的分層是「量出來之後」決定的，不是憑感覺：
 *
 *   ERROR  現在是 **0 筆** → `pnpm lint` 今天就是綠的，所以 CI 可以真的擋。
 *          任何**新**違規會紅。這是這個檔案的全部價值所在。
 *   WARN   現存 **102 筆**既有債，看得到、可以慢慢清，但不擋任何人。
 *   OFF    現存 220 筆（unused-vars 114 + explicit-any 106），
 *          開了會把上面那 102 筆連同 ERROR 的訊號一起淹掉。
 *
 * ⚠️ **把「已知會噴一堆」的規則關掉是可接受的；假裝它們過了不是。**
 * 下面每一條的括號都是實測筆數（2026-08-02 的工作樹，1,915 個檔，
 * 用 `eslint --format json` 逐條數出來的，不是估的）。
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

      // js.configs.recommended + tseslint recommended 其餘每一條都留在 error。
      // 實測它們現在**一筆都沒有**（no-fallthrough / no-dupe-keys /
      // no-self-assign / no-constant-condition / no-unsafe-finally …），
      // 所以留著是純賺：不擋任何人，但新寫出來的那一筆會紅。

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
