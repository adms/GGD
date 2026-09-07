/**
 * skillsSyncCoversGenerators.test.ts —— ⭐ **聚合指令自己不可以過期。**
 *
 * owner 2026-08-20：
 *
 * > 「每一次更動技能相關機制或內容，要整理所有相關技能 —— 包含球體綁定位置、
 * >  特效 pitch/scale/color/透明度、特效音效綁定、五級距、說明↔實際實作 JSON ——
 * >  都請整理更新到 **JSON** 並讓 **script 動態更新**所有相關文件與 codex 編輯器契約文件、
 * >  後台設定參數與介面更新等，**避免資訊不同步造成的錯誤**」
 *
 * ⇒ `pnpm skills:sync` / `pnpm skills:check` 就是那條指令。
 *
 * ⚠️ 但**聚合指令本身是一個新的單點失效**：這個 repo 已經有 **14 支**新鮮度守衛，
 * 有人加第 15 支而忘了接進 `skills:check`，那支就悄悄地不在「一次跑完」的範圍內 ——
 * 而且**沒有任何東西會紅**（正是元規則說的「判準 0/4 全破」的形狀）。
 *
 * ⇒ 這一條把它關起來：**package.json 裡每一支 `*:check` 都必須**
 * 要嘛在 `skills:check` 裡，要嘛在下面的豁免表裡**帶著理由**。
 * 加一支新的產生器而不做選擇 → 紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 豁免 = 「這支的產出**不可能**因為技能／特效／級距／卡面說明的改動而變」。
 * ⛔ 理由要具體到能被反駁；⛔ 不接受「跟技能無關」這種同義反覆。
 */
/**
 * **純守衛**：這幾支 `*:check` 沒有產物，所以「重生成」對它們沒有意義。
 * ⚠️ 與上面的 `EXEMPT` 不同 —— 那些是「不會因為技能改動而過期」，
 * 這些是「**過期**這個概念對它們不成立」。兩種都要寫得出理由。
 */
const NO_ARTIFACT: Record<string, string> = {
  roster: "英雄上下架的純守衛 —— 它驗一致性,⛔ 沒有任何檔案是它寫的",
  coord:
    "⭐ GH#985 —— Main↔Codex packet 的**協定 lint**（`tools/coord/check.mjs`，" +
    "全檔 0 個 `writeFileSync`／`mkdirSync`，實查）⇒ ⛔ 沒有任何產物，「重生成」對它不成立。" +
    "它驗的是**一份 packet 與四個外部事實的關係**（`origin/main` 的祖先關係 · " +
    "`ggd-type-catalog.json` 的指紋 · 驗收包裡的 row id · 指令前綴白名單）——" +
    "而那四個都不是它寫的。⭐ 反駁法：哪一天它開始寫檔（例如把 packet 正規化寫回去），" +
    "這一列就要刪掉並給它一支 `coord:build` 接進 `skills:sync`。",
  ruleslip:
    "📋 守則犯錯帳本（owner 2026-08-27）—— 它的資料列是**我犯錯的當下**用 " +
    "`bash scripts/rule-slip.sh <守則> <成因> <一句話>` 一列一列記進去的,⛔ 沒有任何來源可以" +
    "把它「重生成」:一次犯錯是一個歷史事件,⛔ 不是可推導的產物。" +
    "⭐ `--check` 驗的是**統計區與資料列一致**（那一半是可重算的:`--stats`）＋" +
    "**代號在封閉詞彙表裡**（打錯字會讓統計靜默分裂成兩列)。" +
    "⇒ 「過期」這個概念對資料列不成立,對統計區成立而它有自己的重算指令。",
  models:
    "GH#540 殘留屍體的**反向閘**：帶 gore geoset 卻沒宣告 `hiddenPrimitives` 的就紅。" +
    "⛔ 刻意沒有 build —— 填哪幾個圖元要人看過那顆模型再決定,而**藏錯比屍體更嚴重**" +
    "(藏掉一塊身體 = 英雄缺一角,而且畫面上不會有任何錯誤)。" +
    "⭐ 自動填的那一版會把「幾何很像屍體」直接當成「就是屍體」—— 那正是這條閘的反面。",
};

/**
 * ⭐⭐ 2026-08-23 —— 上面那條閘**自己有一個洞**:它列舉的是 `*:check` **腳本名**。
 *
 * ⇒ 一支**連腳本都沒有**的產生器對它是**不存在的**。量到的實例:
 * `tools/ability-templates/` 三支 python 產出 `docs/ability-templates.{csv,md}`
 * （模板總類表,owner 點名要更新的那一份），`grep '"[a-z]+:[a-z]+".*template' package.json`
 * → **0 筆**。⇒ 它從 2026-07-25 起漂了一個月:654 份技能剩 413 份,而產物停在舊的那一天,
 * ⛔ 沒有任何東西會紅。
 *
 * ⇒ 下面這一條從**產物**那一端問同一個問題:
 * 「有沒有一支 tools/ 底下的程式在寫 git 追蹤的 `docs/` 或 `content/` 檔,
 *   而它的目錄**完全不在**聚合指令的視野裡?」
 *
 * ⚠️ ⛔ 不可以誤報 —— 一條會誤報的閘會被人放寬。所以偵測是**保守**的:
 *   · 路徑字面值要**真的**對得上一個 git 追蹤的檔或目錄（⛔ 不是任何看起來像路徑的字串）
 *   · 同一行要有**寫入**呼叫,或這一行把路徑綁到一個名字而那個名字出現在寫入呼叫裡
 *   · python 的 `open()` 要真的帶 `"w"`/`"a"` 模式（⛔ 否則 `DictReader(open(…))` 會被誤判）
 *   · 一次性的報告落點（`docs/_reports/` · `docs/_daily/` · 任何 `_temp_`）不算產物
 * 2026-08-23 實測:21 個產生器目錄、11 個沒被涵蓋,逐支分類後 6 支進豁免、2 支補了腳本。
 */
const GENERATOR_NO_CHECK: Record<string, string> = {
  "vfx-forge":
    "⭐ GH#838 —— 它是**編輯器的寫入端**，⛔ 不是產生器：`middleware.mjs` 只在 dev " +
    "server 上把**人在 studio 裡拖 slider 拖出來的東西**寫進 `content/vfx-scripts/`。" +
    "⇒ 那些 JSON 沒有「上游來源」可以重新推導出來 —— 它們**就是**來源（手編集合，" +
    "genguard 對它們回『沒有產生器擁有者』）。⛔ 給它一支 `*:check` 會變成一條" +
    "「比對編輯器的輸出與它自己」的空閘。" +
    "⚠️ 它真正該有的閘是**別的兩條**，而兩條都已經在：" +
    "① `content:build` 的 fail-closed Zod（一份壞掉的 script 進不了 bundle）；" +
    "② `vfxScriptShippedChain.test.ts`（出貨 script 的段真的走到場景樹）。" +
    "⇒ 這一列的到期條件：哪一天 vfx-script 變成從別的東西**推導**出來的（例如從 JASS " +
    "自動翻譯），它就該有 `*:check`，這一列當場作廢。",
  "bgm-gen": "產物是**渲染出來的音樂**與它的 MANIFEST —— 輸入是取樣器與曲式,技能改動不會動到任何一個位元組",
  "icon-gen": "產物是**圖示點陣圖**（本機擴散模型跑出來的 PNG）。它的可審查那一半是提示詞常數,而那一半已經有 `iconstyle:check`",
  "item-csv": "owner 的 CSV **往返編輯**流程（export → 他填三欄 → import）。⛔ `items.csv` 不在 repo 裡,沒有一份會過期的產物",
  "champion-csv": "同 `item-csv` —— `champions.csv` 是 owner 的編輯載體,⛔ 不是 repo 裡的產物",
  "augment-csv": "同 `item-csv` —— 增益卡的 CSV 往返,⛔ 沒有一份被 commit 的產物會過期",
  "voice-gen": "`index-lines.mjs` 索引的是**已經錄好的語音檔** —— MANIFEST 隨音檔增減而變,⛔ 不隨技能數值或說明變",
  "legendary-status": "一份**當時做到哪**的進度報告,⛔ 逐位元組比對對它不成立（它本來就該停在寫下的那一天）",
  "ttk-sim": "產物是**實驗報告**（`docs/_ttk-retune.md` / `_ttk-experiment-153.md`）—— 它記的是那一次掃描的結果,重跑本來就會不一樣",
  "deploy-timing":
    "⭐ 產物是**計時帳本**（`docs/_data/deploy-timings.json`）—— 它記的是「這一次跑了幾秒」，" +
    "⛔ 逐位元組比對對它不成立（同一份程式碼重跑本來就會是不同的秒數）。" +
    "它與 `ttk-sim` 同一類：**量測紀錄**，⛔ 不是從內容推導出來的產物。" +
    "⚠️ 它真正該有的閘是「**不可以有第二份帳本**」，而那一條住 `shipGateScript.test.ts`" +
    "（`ship.mjs` 必須 import 這一支的 `appendStage`，⛔ 不可以自己寫檔）——" +
    "我第一版真的開了第二份同名不同義的，那條守衛就是為此而立。",
  "vfx-census": "⭐ 它**自己的檔頭**逐字寫著「⛔ 這不是新鮮度閘，⛔ 沒有 `--check`：它是一份會隨內容成長的普查」—— 理由已經被寫下並且可以被反駁",
  // ⭐ 2026-08-24 GH#612 —— `hero-archetypes` 那一列**刪掉了**,因為那個洞補起來了:
  //    `tools/hero-archetypes/build.ts` 有了 `--check`(逐位元組、零時鐘欄位),
  //    `archetypes:check` 接進了 `skills:check`。⛔ 留著一列說「這是個洞」的豁免,
  //    下一個人讀到的是「這裡沒事」——而那正是這張表要防的東西。
};

/**
 * ⭐⭐ GH#804 —— **反方向**。CLAUDE.md 失敗形態⑫逐字：
 * 「這條掃描**從哪一頭走**？從『宣告』走 ⇒ 一定漏掉『有實體而無宣告』的
 *  ⇒ ⭐ **兩頭都要走**，⛔ 一頭不算。」
 *
 * 上面三條全部從 **`*:check` 那一頭**（或產物那一頭）走 ⇒
 * 一支「**在 `skills:sync` 裡跑、卻沒有任何 `*:check`**」的產生器對它們是**隱形的**。
 *
 * ⭐ 量到的實例 `vfxfam:build`（2026-08-29）—— 它同時繞開了**兩條**既有掃描：
 *   · 它沒有 `vfxfam:check` ⇒ 第一條（列舉 `*:check`）看不到它
 *   · 它的原始碼住 `apps/client/src/render/vfx/` ⇒ 第三條（只掃 `tools/`）也看不到它
 * ⇒ 它寫 **68 份**產物（`content/vfx/fx.fam.*.json` ＋ `content/config/vfx-families.json`），
 *   而「它過期了」在這個檔裡**沒有任何東西會紅**。
 *
 * ⇒ 這張表的語意：「這一支在鏈裡跑，⛔ 而它的新鮮度**不是**由一支 `*:check` 守的 ——
 *   守它的是**這一條具體的東西**」。⛔ 「還沒做」不是理由；理由要能被反駁。
 *
 * ── 突變紀錄 ─────────────────────────────────────────────────────────────
 *  · 把下面那條 `!(step in SYNC_STEP_NO_CHECK)` 換成空表 → 新的那一條紅，並**逐名**列出
 *    `quarantine:unlock` · `castderive:build:raw` · `vfxfam:build` · `content:build` ·
 *    `quarantine:lock`（＝正好是今天沒有 `*:check` 的那五支）。實測過。
 */
const SYNC_STEP_NO_CHECK: Record<string, string> = {
  "quarantine:unlock":
    "它只 chmod —— **產物零份**，「過期」對權限位不成立（`syncIoDeclaresWrites.test.ts` 的 " +
    "`READ_ONLY_BY_DESIGN` 用同一個理由豁免它）。守它的是 `productQuarantine.test.ts`" +
    "（真的 chmod、真的用檔案 API 寫、真的吃 EACCES）。",
  "quarantine:lock": "同上",
  "castderive:build:raw":
    "⭐ 它的新鮮度閘是一條 **vitest**，⛔ 不是 `*:check` 腳本：" +
    "`packages/shared/src/content/castTimeCoverage.test.ts` 逐支比對 " +
    "`d.castTimeSec !== deriveCastTime(d, cdMult).castTimeSec` ⇒ 內容一漂就紅（＝逐值對帳）。" +
    "另外 `packages/shared/scripts/contentValidate.ts` 的 3d 段做同一件事並印出修法指令，" +
    "而「安靜地跳過一位英雄」那一半由 `deriveCastTimesFailsLoud.test.ts` 守（GH#708）。" +
    "⇒ 到期條件：哪一天那條 vitest 不再逐支比對，這一列當場作廢。",
  "content:build":
    "它是**三支子產生器的聚合**，而三支各自的 `*:check` 都在 `skills:check` 裡" +
    "（`spec:check` · `overview:check` · `tiers:check`）。它自己多做的那一半是打包 —— " +
    "守它的是 `shippedBundleIsCurrent.test.ts`（比對 repo 裡**被 commit 的**那一份）＋ " +
    "`shippedBundleHasTrackedSources.test.ts`（比對 `git ls-files`）。" +
    "⛔ 給它一支 `content:check` 會變成第四份重複的新鮮度比對。",
  "vfxfam:build":
    "⭐ 它的 68 份產物**兩半各有一條會紅的 vitest**，⛔ 只是沒有包成 `*:check` 腳本：" +
    "① `content/vfx/fx.fam.*.json`（67 份）—— `apps/client/src/render/vfx/familyArtCoverage.test.ts` " +
    "的「every shipped fx.fam doc is byte-identical to what the generator produces now」" +
    "**逐位元組**比對磁碟上那一份與現在跑出來的（外加 missing / orphan 兩個方向）；" +
    "② `content/config/vfx-families.json`（1 份，兩個寫入端）—— `pitch:check` 在 `skills:check` 裡驗它，" +
    "而「產生器不可以刪掉它不擁有的欄位」由 `generateFamilyContent.test.ts` 真的跑產生器守著（GH#378/#427）。" +
    "⇒ 到期條件：哪一天那條逐位元組斷言被拿掉或放寬，這一列當場作廢 —— " +
    "那時正解是給 `generateFamilyContent.ts` 一個 `--check` 並接進 `skills:check`。",
};

/**
 * ⭐ 豁免「它的 build 不必在 `skills:sync` 的鏈上」——
 * 理由要能被反駁：⭐ 說得出**為什麼那份產物不會因為聚合重生成而變**。
 */
const CHECK_STEP_NO_SYNC: Record<string, string> = {
  "echoloop:check":
    "⭐ 它**不寫任何檔** —— `tools/balance-alert/echoLoop.ts` 全檔零個 `writeFileSync`（2026-09-03 實查）," +
    "而 `echoloop` 與 `echoloop:check` 是**同一支腳本**,`--check` 只改嚴格度。" +
    "⇒ ⭐ 沒有產物就沒有「過期」這回事,接進 `skills:sync` 只是把同一個分析跑第二次。" +
    "⚠️ 它守的是**平衡公式自洽**（每一格倍率 ×0.5／×2 重算,兩邊一起動而佔血條不動 = 回音迴圈）," +
    "⛔ 不是某份文件的新鮮度。反駁法:如果哪天它開始寫檔,這一列就要刪掉。",
  "collections:check":
    "⭐ GH#998 —— 這一列是**暫時**的（帶票號）。`tools/collections-gen/gen.ts` 從 " +
    "`packages/shared/src/content/schema/index.ts` 的 `COLLECTIONS` 推導 Go 的 " +
    "`apps/platform/internal/contentoverlay/collections_gen.go`；它**不讀** content/ 或 docs/ 的" +
    "任何一個位元組 ⇒ 聚合重生成（為**內容**改動而存在）碰不到它的輸入 —— 它只在" +
    "「改 schema 的那一次 PR」會過期，而那一次 `collections:check`（skills:check）＋ Go 的 " +
    "`TestKnownCollectionsMatchTheSharedSchemaTable`（CI go-platform）**兩條**都會紅並指名 " +
    "`pnpm collections:build`。⭐ 為什麼今天沒接進 `skills:sync`：`sync.mjs` 閘① —— chain 字串" +
    "改了就**拒跑**（exit 2），而 `sync-io.json` 在這條 lane 的柵欄外 ⇒ 兩件事必須同一個 commit 落地" +
    "（`7e6153c3e` 的形狀：`node tools/parallel-gates/trace.mjs --script collections:build --out <tmp>` " +
    "單步量進戶籍 ＋ `skills:sync` 加 `&& pnpm collections:build`）。" +
    "⭐ 到期條件（一行可查）：`grep -c 'pnpm collections:build' package.json` ≥ 2 的那一刻，這一列刪掉。",
  "skillforge:visual-advisory:check":
    "⭐ GH#986 —— 這一列是**暫時**的（帶票號）。2026-09-07 這一支從 `EXEMPT` 搬進 `skills:check`：" +
    "它的產物（`docs/_reports/editor-skill-codex-advisory/review.{json,md}`）**會過期**，所以它該被驗，" +
    "而 `--check` 今天回 0（`node tools/skill-forge/build-codex-visual-advisory.mjs --check`）。" +
    "⭐ 為什麼 `skillforge:visual-advisory:build` 今天還沒進 `skills:sync`：與 `collections:check` **同一個原因** —— " +
    "`sync.mjs` 閘① 拿 `sync-io.json` 記的 chain 字串跟 package.json 逐字比，改了就**拒跑**（exit 2），" +
    "而 `tools/parallel-gates/sync-io.json` 在這條 lane 的柵欄外 ⇒ 兩件事必須同一個 commit 落地" +
    "（`node tools/parallel-gates/trace.mjs --script skillforge:visual-advisory:build --out <tmp>` 單步量進戶籍 " +
    "＋ `skills:sync` 在 `pnpm skillforge:visual-review:build` **之後**加 `&& pnpm skillforge:visual-advisory:build`" +
    "—— ⚠️ 順序是硬的：advisory 讀的是 visual-review 產出的審查包）。" +
    "⭐ 到期條件（一行可查）：`grep -c 'pnpm skillforge:visual-advisory:build' package.json` ≥ 1 的那一刻" +
    "（今天量到 **0**），這一列刪掉。",
};

const EXEMPT: Record<string, string> = {
  // ⭐ 2026-09-06 GH#990 —— vfx-script 的子模組正規化器
  "vfxsub:check":
    "⭐ **不是新鮮度閘、沒有產物**：`tools/vfx-subtypes/callify.mjs --check` **不寫任何檔（0 個寫入呼叫）**，" +
    "它讀 `content/vfx-scripts/*.json`＋`content/vfx-subtypes/*.json`，只驗**冪等**（每一支展得開 ＋ 再跑一次 callify 什麼都不變）。" +
    "callify 是**正規化器**（就地把逐位元組等價的 inline 段換成 `{call}`），⛔ 不是作者 —— vfx-scripts 沒有產生器擁有者（genguard 實查）。" +
    "它只會在有人手改腳本時紅，修法是作者改內容或跑 `pnpm vfxsub:build`，⛔ 不是 sync 重生成；棘輪 `vfxSubtypesRatchet.test.ts` 走同一支展開器守著呼叫段。" +
    "反駁方式：哪天 callify 變成腳本的**作者**（從子模組表批次產出腳本），就用 trace.mjs 量進 sync-io 並接進 skills:sync／skills:check。",
  // ⭐ 2026-09-04 Codex `35b231ef` 帶進來的兩支 —— 兩個**不同**的理由，⛔ 不要混。
  "skillforge:check":
    "⭐ **不寫任何檔**（`tools/skill-forge/check.mjs` 0 個寫入呼叫，實查）⇒ 沒有產物就不會過期。" +
    "它是**驗收彙總**（把 audit / visual-* / sim-preview 的收據合起來報），" +
    "⛔ 不是新鮮度閘。⚠️ 它彙總的那幾支之一是 `visual-advisory`，" +
    "而那一支 **2026-09-07 起已經接進 `skills:check`**（GH#986 F 收尾，豁免那一列已刪）。",
  // ⭐⭐ 2026-09-04 Codex 合併帶進來的兩支 —— ⛔ 它們**不寫任何檔**
  //    （`tools/vfx-asset-safety/check.py` 與 `tools/vfx-forge/check.mjs`
  //     全檔 **0 個** `write_text`／`writeFileSync`／`open(...,"w")`，實查）
  //    ⇒ ⭐ 沒有產物就沒有「過期」這回事 —— 它們是**安全閘**，⛔ 不是新鮮度閘。
  //    寫入端是另外兩支手動步驟（`vfxassets:repair` / `vfxforge:*`）。
  // ⚠️⚠️ ⭐ **誠實**：這兩支今天是**紅的**（`vfxassets:check` 45 個
  //    `MODEL_TEXTURE_BACKDROP` blocker —— 跑過 Codex 自己的 repair 之後從 74 降到 45，
  //    剩下的是**內嵌在 .glb 裡**的貼圖，repair 修不動；`vfxforge:check` 的
  //    conflicts 計數斷言 27 對不上）。
  //    ⛔ 豁免的是「要不要進 skills:check」，⛔ **不是**「這兩個紅可以無視」。
  //    ⭐ 反駁法：修好之後把這兩列刪掉並接進 skills:check（那時它們才有資格）。
  "vfxassets:check":
    "⭐ 不寫任何檔（0 個寫入呼叫，實查）⇒ 沒有產物就不會過期。它守的是**貼圖/模型的 additive 底板**" +
    "（alpha=0 而 RGB 亮 ⇒ ONE+ONE 會把底板畫進遊戲），⛔ 不是某份文件的新鮮度。" +
    "⚠️ 今天紅：45 個 blocker，全部是內嵌在 .glb 裡的貼圖，`vfxassets:repair` 修不動。",
  "vfxforge:check":
    "⭐ 不寫任何檔（0 個寫入呼叫，實查）⇒ 同上。它守的是特效工坊的**驗收收據**，" +
    "⛔ 不是產物新鮮度。⚠️ 今天紅：conflicts 計數斷言（27）對不上合併後的內容。",
  "voxel:check": "體素**角色身體**產生器 —— 讀的是英雄外觀，不讀 abilities/vfx/級距",
  "voxel:build:check": "同上，只是驗產物",
  "scenery:check": "競技場**道具散佈** —— 讀 arena 幾何，不讀技能",
  // ⭐ GH#987 —— 這一列的舊理由逐字是「掃**原始碼**裡的 TODO 註解」，⛔ 而那是假的
  //    （第三守則的形狀）：`tools/todo-check/src/cli.ts` 的 `loadTodos()` 讀的是
  //    `docs/todo/*.md`，⛔ 一行原始碼都不掃。理由重寫成量得到的那一件事。
  "todo:check":
    "驗 `docs/todo/*.md` 的待辦項（id / test_id 唯一、列舉合法）—— ⛔ **不讀** `content/`：" +
    "技能／特效／級距／卡面說明一個位元組都不會進來。⛔ 它也不是新鮮度閘（欄位缺了才紅，不是過期才紅）",
  "docs:status:test": "這是那支產生器**自己的單元測試**，不是新鮮度閘",
  "iconstyle:check": "圖示的**美術指導**快照 —— 讀 icon-gen 的提示詞常數，不讀 abilities/vfx/級距",
  "legacyindex:check":
    "掃 `docs/legacy/` 與 `content/_legacy/` 底下**有哪些檔**（簡介取自那個檔自己的第一段）—— " +
    "⛔ **不讀**出貨中的 `content/abilities|vfx|config`：⭐ 只有把檔案搬進／搬出 legacy 才會動它的產物",
  "scenerycc0:check": "把 CC0 資產的 bbox 最低點推到 y=0 —— 讀 GLB 位元組，不讀技能",
  "map:check": "競技場**幾何**產生器 —— 讀地圖模板與圖論規則，不讀 abilities/vfx/級距",
  "budget:check": "模型多邊形**預算**閘 —— 它不是新鮮度閘（超標才紅，不是過期才紅）",
  // ⭐ GH#621 —— `ship:check` 是**聚合指令自己**（它跑 content:build + skills:sync
  // + skills:check + typecheck + 每一包 vitest）。把它放進 `skills:check` 會變成
  // ⛔ **無窮遞迴**（skills:check → ship:check → skills:check）。
  // 它自己的閘是 `shipGateScript.test.ts`（驗「每一包 vitest 都在裡面」等三個關係）。
  "ship:check": "**出貨聚合指令本身** —— 它*跑* skills:check，放進去會遞迴；它自己的閘是 shipGateScript.test.ts",
};

/**
 * ⭐ #467 —— **root 以外的 package.json 也要掃**。
 *
 * ⚠️ 這一支在 2026-08-20 之前只讀 root，於是一支藏在子專案裡的 `*:check`
 * （`tools/anime-arena-map` 的 `map:check`）對這條閘是**不存在的** —— 而
 * 「產生器對聚合指令不可見」正是 `tools/w3x-import` 那兩支能互相打架三個月的機制。
 * ⛔ 一個只看得到一半的閘，紅不起來的那一半才是它要防的東西。
 *
 * ⚠️ 鍵名相同時以 root 為準（`caps:check` 兩邊都有，聚合指令引用的是 root 那一支）。
 */
function scripts(): Record<string, string> {
  const read = (p: string) => (JSON.parse(readFileSync(p, "utf8")).scripts ?? {}) as Record<string, string>;
  const paths = pkgJsonPaths();
  const all: Record<string, string> = {};
  for (const p of paths.filter((p) => p !== "package.json")) Object.assign(all, read(join(REPO, p)));
  return { ...all, ...read(join(REPO, "package.json")) };
}

const ls = (args: string[]) =>
  execFileSync("git", ["ls-files", ...args], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((p) => p && !p.includes("node_modules"));
const pkgJsonPaths = () => ls(["package.json", "**/package.json"]);

/**
 * 每個腳本名住在**哪幾份** package.json。
 * ⚠️ 一定要是多對一:`voxel:check` 在 root 與 `tools/voxel-gen/package.json` **各有一份**
 * （root 那一支只是 `pnpm --filter` 轉發）。只留最後一份的話,`tools/voxel-gen/` 就變成
 * 「零腳本」而被誤報 —— 而誤報會讓人去放寬這條閘。
 */
function scriptHomes(): Record<string, string[]> {
  const homes: Record<string, string[]> = {};
  for (const p of pkgJsonPaths()) {
    for (const k of Object.keys(JSON.parse(readFileSync(join(REPO, p), "utf8")).scripts ?? {})) {
      homes[k] = [...(homes[k] ?? []), p];
    }
  }
  return homes;
}

/** `tools/<dir>` → 它寫出去的 git 追蹤產物（保守偵測，見 {@link GENERATOR_NO_CHECK} 的檔頭）。 */
function generatorDirs(): Map<string, string[]> {
  const tracked = ls(["docs", "content"]);
  const trackedFiles = new Set(tracked);
  const known = new Set(tracked);
  for (const f of tracked) {
    const seg = f.split("/");
    for (let i = 1; i < seg.length; i++) known.add(seg.slice(0, i).join("/"));
  }
  const WRITE =
    /open\([^)]*["'][wa]\+?b?["']|write_text\(|write_bytes\(|writeFileSync|DictWriter|writeFile\(|mkdirSync|makedirs\(/;
  const LIT = /["'`]([A-Za-z0-9_./*+-]*)["'`]/g;
  /**
   * 一行裡所有**串得起來**的 docs//content/ 路徑。
   * ⚠️ 一定要串:出貨的產生器有兩種寫法，而只認第一種的偵測**看不到第二種** ——
   *   `ROOT / "docs/x.csv"`            ← 一個字面值
   *   `ROOT / "docs" / "x.csv"`        ← 三個字面值（`join(REPO, "docs", "x.csv")` 同理）
   * 2026-08-23 實測:只認第一種時，這支閘對它自己剛剛接上的 `tools/ability-templates/gen.py`
   * 是**瞎的**（突變沒紅）。⛔ 一個只看得到一半的閘，紅不起來的那一半才是它要防的東西。
   */
  const pathsOn = (line: string, known: ReadonlySet<string>): string[] => {
    const lits = [...line.matchAll(LIT)].map((m) => m[1]!.replace(/^(\.\.\/)+/, ""));
    const found: string[] = [];
    for (let i = 0; i < lits.length; i++) {
      if (!/^(docs|content)(\/|$)/.test(lits[i]!)) continue;
      let acc = lits[i]!;
      for (let j = i; j < lits.length; j++) {
        if (j > i) acc += `/${lits[j]}`;
        if (known.has(acc)) found.push(acc);
      }
    }
    return found;
  };
  const out = new Map<string, string[]>();
  for (const f of ls(["tools"])) {
    if (!/\.(py|ts|tsx|mjs)$/.test(f) || f.includes("/out/") || /\.test\./.test(f)) continue;
    const text = readFileSync(join(REPO, f), "utf8");
    if (!WRITE.test(text)) continue;
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      for (const p of pathsOn(line, known)) {
        // ⛔ 一次性的報告落點不是產物（CLAUDE.md 的 `_temp_` 命名慣例就是為了這個）
        if (/_temp_|^docs\/(_reports|_daily)\//.test(p)) continue;
        // ⭐ 指名一份**追蹤中的檔** + 這支檔案有寫入呼叫 ⇒ 它是那份產物的產生器。
        //    ⚠️ 這一格是必要的:出貨的產生器多半把落點寫成一個模組級常數,再在別的地方
        //    透過**別的名字**（迴圈變數、dict 的鍵）寫出去 —— 逐行追名字追不到它。
        let writes = trackedFiles.has(p);
        if (!writes) writes = WRITE.test(line);
        if (!writes) {
          const bind = line.match(/^\s*(?:export\s+)?(?:const|let|var)?\s*([A-Za-z_]\w*)\s*[:=]/);
          if (bind) {
            const use = new RegExp(
              `(?:open|writeFileSync|writeFile|mkdirSync)\\(\\s*${bind[1]}\\b|${bind[1]}\\.(?:write_text|open|write)\\(`,
            );
            writes = lines.some((l, j) => j !== i && use.test(l));
          }
        }
        if (writes) {
          const dir = f.split("/")[1]!;
          out.set(dir, [...(out.get(dir) ?? []), `${f} → ${p}`]);
        }
      }
    }
  }
  return out;
}

/**
 * ⭐⭐ GH#987 —— 上面五張表的**理由**在此之前**沒有閘**。
 *
 * 判準逐字是 `k in EXEMPT`（下面那條 `missing`）⇒ ⛔ **值是空字串也會過**。
 * 「理由要能被反駁」是這個檔頭寫了五次的**散文**，而元規則說得很清楚：
 * 判準 0/4 全破，只有閘有用。⭐ 量到的實例就躺在表裡：
 * `skillforge:visual-advisory:check` 的理由自己寫著「它會寫檔 ⇒ 照規矩它該接進
 * skills:check —— 這一列是**暫時**的」⇒ **一個已知的真缺口在豁免表裡全綠**。
 *
 * ⇒ 兩種列、兩條規則（⛔ 刻意**不**做「必須含反駁法」—— 那會讓 13/14 列當天全紅，
 *   而一條讓整張表被改寫的閘，下一個人的正確反應是關掉它）：
 *
 * | 列 | 規則 | 它擋住什麼 |
 * |---|---|---|
 * | 永久列 | 理由要說出**它讀／寫哪一組輸入**（{@link EXEMPT_SAYS_ITS_INPUTS}）＋ ≥ 20 字 | 「跟技能無關」這種同義反覆、空字串 |
 * | 暫時列（含「暫時」） | **改問票號**：要帶 `GH#\d+`（⛔ 不問它讀什麼 —— 它自己已經承認是缺口） | 一個**已知的缺口**用「之後再說」永久住在表裡 |
 *
 * ⭐ 「同上」是合法的（`voxel:build:check`），但要驗**上一列真的存在**並拿上一列的
 * 理由再驗一次 —— ⛔ 不是驗「同上」這兩個字（那又變成一個字串判準）。
 *
 * ⛔ 為什麼**不能只加長度下限**：一段夠長的空話照樣過。⛔ 也不能只驗 token：
 * 「不讀」兩個字自己就會過。⇒ 兩個一起要。
 */
const EXEMPT_SAYS_ITS_INPUTS = /不讀|不寫|沒有寫|寫入呼叫|沒有產物|產物零份|沒有任何檔案是它寫的|不是新鮮度閘|遞迴/;
const EXEMPT_MIN_CHARS = 20;

/** 一列豁免理由的問題（`undefined` = 這一列合格）。⭐ 兩個方向的 sentinel 在測試裡跑。 */
function exemptRowProblem(key: string, why: string, prevWhy: string | undefined): string | undefined {
  // 「同上」= 繼承上一列的理由 ⇒ 上一列要存在,而且驗的是**兩列合起來**的文字。
  const inherits = /^\s*同上/.test(why);
  if (inherits && prevWhy === undefined) return `${key}: 理由是「同上」而它是第一列 —— 上面沒有東西可以繼承`;
  const text = inherits ? `${prevWhy}${why}` : why;
  if (text.trim().length < EXEMPT_MIN_CHARS) return `${key}: 理由只有 ${text.trim().length} 個字 —— 說不出任何可以被反駁的東西`;
  // ⭐ 兩種列**兩條規則**，⛔ 不是同一條：
  //   · 暫時列**已經承認**自己是缺口（「它會寫檔 ⇒ 該接進 skills:check」）——
  //     ⇒ 對它要的不是「它不讀什麼」，是**誰在追這件事**（票號）。
  //   · 永久列的宣稱是「它不會過期」—— ⇒ 那句話要指得出它讀／寫哪一組輸入。
  if (/暫時/.test(text)) {
    return /GH#\d+/.test(text)
      ? undefined
      : `${key}: 這是一列**暫時**的豁免（＝一個已知的缺口）而它**沒有票號** —— 補上 GH#<票號>,否則它會永久住在這張表裡`;
  }
  if (!EXEMPT_SAYS_ITS_INPUTS.test(text)) {
    return `${key}: 理由沒有說出**它讀／寫哪一組輸入** —— 要出現「不讀…」「不寫／0 個寫入呼叫」「沒有產物」「不是新鮮度閘」「遞迴」其中一種`;
  }
  return undefined;
}

describe("skills:sync / skills:check 涵蓋所有產生器", () => {
  it("每一支 *:check 不是被 skills:check 跑到,就是帶著理由被豁免", () => {
    cover("skills-sync-covers");
    const s = scripts();
    const aggregate = s["skills:check"] ?? "";
    expect(aggregate, "skills:check 不見了").toBeTruthy();

    const missing = Object.keys(s)
      .filter((k) => k.endsWith(":check") && k !== "skills:check")
      .filter((k) => !aggregate.includes(k) && !(k in EXEMPT));

    expect(
      missing,
      `這幾支產生器沒有被 skills:check 跑到,也沒有豁免理由:\n  ${missing.join("\n  ")}\n` +
        `→ 把它加進 package.json 的 skills:check,或在 EXEMPT 裡寫下為什麼它不會過期。`,
    ).toEqual([]);
  });

  // ⭐⭐ GH#987 —— 見 {@link exemptRowProblem} 的檔頭。
  it("⭐ 豁免表的每一列**理由**都說得出它讀哪一組輸入（暫時列還要帶票號）", () => {
    const rows = Object.entries(EXEMPT);
    expect(rows.length, "豁免表讀回空的 —— 偵測壞了,⛔ 不是真的沒有豁免").toBeGreaterThan(5);

    // ⭐ 量尺先自證（兩個方向）：已知**壞**的抓得到,已知**好**的不誤報。
    //   ⛔ 一把只驗過單邊的尺不算自證過（CLAUDE.md：`calibrate()` 要驗兩個方向）。
    expect(exemptRowProblem("sentinel", "", undefined), "空理由竟然過了 —— 這條閘是瞎的").toBeTruthy();
    expect(
      exemptRowProblem("sentinel", "這一支跟技能完全無關,加進去只是把同一件事再跑一次而已,沒有必要", undefined),
      "一段夠長的空話竟然過了 —— 這條閘只在量長度",
    ).toBeTruthy();
    expect(
      exemptRowProblem("sentinel", "這一列是**暫時**的:它會寫檔,⛔ 照規矩該接進 skills:check", undefined),
      "暫時列沒帶票號竟然過了",
    ).toBeTruthy();
    expect(
      exemptRowProblem("sentinel", "⭐ 不寫任何檔（0 個寫入呼叫，實查）⇒ 沒有產物就不會過期", undefined),
      "一列合格的理由被誤報 —— 一條會誤報的閘會被人放寬",
    ).toBeUndefined();

    const bad = rows
      .map(([k, why], i) => exemptRowProblem(k, why, rows[i - 1]?.[1]))
      .filter((p): p is string => p !== undefined);
    expect(
      bad,
      "⛔⛔ 豁免表這幾列的**理由**過不了閘:\n  " +
        bad.join("\n  ") +
        "\n⇒ ⭐ 一列豁免要說出**它讀／寫哪一組輸入**（那是可以被反駁的東西）," +
        "\n  ⛔ 不是「跟技能無關」這種同義反覆;暫時的豁免要帶票號,否則它會永久住在這裡。",
    ).toEqual([]);
  });

  it("skills:sync 對每一個被 skills:check 驗的東西都有重生成的辦法", () => {
    const s = scripts();
    // ⭐ 只驗「有沒有對應的重生成路徑」,⛔ 不驗指令字串長什麼樣(那會變成第二個住處)
    const aggregate = s["skills:check"] ?? "";
    /**
     * ⭐ 一支 `*:check` 有沒有**真的被聚合指令跑到**。
     *
     * ⚠️⚠️ ⭐ **必須比對整個 token，⛔ 不可以用 `includes`** —— 這個病發生過**兩次**：
     * · `skills:check` 含 `"docs:readme:check"` ⇒ `"docs:readme"` 是它的子字串
     * · ⭐ **2026-08-31**：新加的 `jasstplmap:check` 含 `"map:check"`
     *   （`tools/anime-arena-map` 的那一支）⇒ 那一支被誤判成「在聚合指令裡」
     *   ⇒ 閘接著問它的 build 在哪 ⇒ 紅，⛔ **而訊息指著一支完全無辜的 script**。
     * ⇒ ⭐ 切成 token 再逐一比對；⛔ 子字串比對治不了它，只會換一個名字再中一次。
     */
    const runsIn = (agg: string, name: string): boolean =>
      agg.split("&&").some((seg) => seg.trim().replace(/^pnpm\s+/, "").split(/\s/)[0] === name);
    const checked = Object.keys(s).filter(
      (k) => k.endsWith(":check") && k !== "skills:check" && runsIn(aggregate, k),
    );
    const unbuildable = checked.filter((k) => {
      const base = k.slice(0, -":check".length);
      // ⭐ 純守衛(沒有產物,所以沒有「重生成」這回事)。⛔ 這裡是**帶理由的表**,
      //    ⛔ 不是一串 `if (base === "…")` —— 一個沒有理由的例外過幾個月就沒有人敢動它。
      if (base in NO_ARTIFACT) return false;
      /**
       * ⭐ `:write` 是第三種合法的「重生成辦法」，⛔ 而它與 `:build` 的差別是**語意的**：
       *
       * | | |
       * |---|---|
       * | `:build` / `:export` | **重生成** —— 同樣的輸入必得同樣的輸出 ⇒ 進得了 `skills:sync` |
       * | `:write` | **提案** —— 它替人做一個判斷 ⇒ ⛔ **不可以**進 `skills:sync` |
       *
       * ⚠️ 前例 `beam:write`：它從幾何推「哪一軸是長軸」，而 `imported.tectonicfury`
       * 的 bbox 與偏心**指向不同的軸** ⇒ 那一支它刻意不提案並要求人去看。
       * 把它丟進 `skills:sync` 等於讓產生器替內容做設計決定。
       *
       * ⇒ 這條閘要的是「**紅了跑什麼**」，而 `pnpm beam:write` 就是答案 ——
       * ⛔ 它只是不能自動跑。
       */
      return !(base in s || `${base}:build` in s || `${base}:export` in s || `${base}:write` in s);
    });
    expect(
      unbuildable,
      `這幾支驗得到卻**重生成不了** —— 閘紅了沒有人知道要跑什麼:\n  ${unbuildable.join("\n  ")}`,
    ).toEqual([]);
  });

  // ⭐⭐ GH#804 —— 反方向（見 {@link SYNC_STEP_NO_CHECK} 的檔頭）。
  it("⭐ `skills:sync` 跑的每一支,新鮮度都有東西在守（一支 *:check,或帶理由的豁免）", () => {
    const s = scripts();
    const sync = s["skills:sync"] ?? "";
    const aggregate = s["skills:check"] ?? "";
    expect(sync, "skills:sync 不見了").toBeTruthy();

    const steps = [...sync.matchAll(/pnpm ([A-Za-z0-9_:.-]+)/g)].map((m) => m[1]!);
    expect(steps.length, "sync 鏈解析回空的 —— 偵測壞了,⛔ 不是真的沒有步驟").toBeGreaterThan(20);

    // sentinel：豁免表只能指向**真的在鏈裡**的步驟（幽靈列 = 一句看起來有防的散文）。
    expect(
      Object.keys(SYNC_STEP_NO_CHECK).filter((n) => !steps.includes(n)),
      "SYNC_STEP_NO_CHECK 指向不在 skills:sync 裡的步驟",
    ).toEqual([]);

    const blind = steps
      .filter((step) => !step.endsWith(":check") && !(step in SYNC_STEP_NO_CHECK))
      // ⭐ 候選名兩個：`<step>:check`，以及把最後一段換成 `check`
      //   （`pitch:build`→`pitch:check` · `board:build`→`board:check` · `caps:export`→`caps:check`）。
      .filter((step) => ![`${step}:check`, `${step.replace(/:[^:]+$/, "")}:check`].some((c) => aggregate.includes(c)));

    expect(
      blind,
      `這幾支在 skills:sync 裡跑,而**沒有任何 *:check 在 skills:check 裡驗它們的產物**:\n` +
        blind.map((n) => `  ${n}`).join("\n") +
        `\n→ 給它一支 *:check 並接進 package.json 的 skills:check,` +
        `\n  或在 SYNC_STEP_NO_CHECK 裡寫下**是哪一條具體的東西在守它的新鮮度**（要能被反駁）。`,
    ).toEqual([]);
  });

  // ⭐⭐⭐ **第三個方向**（2026-09-03 補）—— ⛔ 上面兩條都走不到這一段。
  //
  // ⚠️ 它們走的是：① 每一支 `*:check` → 在 `skills:check` 裡嗎 ·
  //   ② `skills:sync` 的每一步 → 有 `*:check` 守嗎。
  // ⭐ 而**沒有人走**「`skills:check` 會跑的那一支 → 它的 `build` 在 `skills:sync` 裡嗎」
  //   ⇒ 一支「有 check、⛔ 沒 build 在鏈上」的產生器**掉進兩條掃描之間的縫**（形態⑫）。
  //
  // 📏 量到的實例（2026-09-03 批收尾當場撞到）：`editorcov:check` 在 `skills:check` 裡（①過）、
  //   而 `editorcov:build` ⛔ 不在 `skills:sync` 也不在 sync-io 的 45 步裡（②看不到它）
  //   ⇒ ⭐ **每一次批收尾都紅,而聚合指令修不好它** —— 要人手動記得跑 `editorcov:build`。
  //   ⚠️ 而「要記得跑」正是這份文件記錄過五次失效的那種東西。
  it("⭐⭐ `skills:check` 驗的每一支,它的 build 都在 `skills:sync` 的鏈上（第三個方向）", () => {
    const s = scripts();
    const sync = s["skills:sync"] ?? "";
    const aggregate = s["skills:check"] ?? "";
    // ⭐⭐ 展開要**跟著真正的呼叫鏈遞移**，⛔ 不是只讀最上層那一行字串。
    //
    // ⚠️ 量到的實例：`content:build` 的字面是 `bash scripts/genrun.sh content:build content:build:raw`
    //   ⇒ 它一個 `pnpm X` 都沒有；⭐ 而 `content:build:raw` 逐字是
    //   `pnpm --filter @ggd/shared content:build && pnpm spec:build && pnpm overview:build && pnpm tiers:build`
    //   ⇒ ⛔ 只讀最上層會把 `spec` / `overview` 誤報成孤兒（我第一版就報了 14 支，而真缺口只有 6 支）。
    //   ⭐ 一個會誤報 8 支的閘，下一個人的正確反應是**關掉它**。
    const reach = (name: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(name) || !(name in s)) return seen;
      seen.add(name);
      const body = s[name] ?? "";
      for (const m of body.matchAll(/pnpm (?:--filter \S+ )?([A-Za-z0-9_:.-]+)/g)) reach(m[1]!, seen);
      for (const m of body.matchAll(/genrun\.sh \S+ (\S+)/g)) reach(m[1]!, seen);
      return seen;
    };
    const syncSteps = [...reach("skills:sync")];
    const checkSteps = [...aggregate.matchAll(/pnpm ([A-Za-z0-9_:.-]+)/g)].map((m) => m[1]!);
    expect(checkSteps.length, "check 鏈解析回空的 —— 偵測壞了,⛔ 不是真的沒有步驟").toBeGreaterThan(10);

    // sentinel：豁免表只能指向**真的在 check 鏈裡**的步驟（幽靈列 = 一句看起來有防的散文）。
    expect(
      Object.keys(CHECK_STEP_NO_SYNC).filter((n) => !checkSteps.includes(n)),
      "CHECK_STEP_NO_SYNC 指向不在 skills:check 裡的步驟 ⇒ ⭐ 那一列在防一個不存在的東西",
    ).toEqual([]);

    const orphan = checkSteps
      .filter((step) => step.endsWith(":check") && !(step in CHECK_STEP_NO_SYNC))
      .filter((step) => {
        const stem = step.replace(/:check$/, "");
        const cands = [`${stem}:build`, `${stem}:export`, `${stem}:apply`, stem];
        // ⭐ **純驗證器不在射程內**：它根本沒有 build 腳本 ⇒ 沒有東西可以接進 sync。
        //   ⚠️ 量到 6 支（roster · models · echoloop · beam · board:roll · ruleslip）——
        //   ⛔ 對它們喊「你的 build 不在鏈上」是要求一個不存在的東西。
        // ⚠️ ⭐ `stem` 自己也算一支產生器：`board:roll:check` 的產生器**就叫 `board:roll`**
        //   （⛔ 不是 `board:roll:build`）。第一版把它讀成「純驗證器」而放行 ——
        //   ⇒ ⭐ 七天窗沒有人滾，而 `board:roll:check` 每天都紅。2026-09-03 當場撞到。
        if (!cands.some((c) => c in s)) return false;
        return !cands.some((c) => syncSteps.includes(c));
      });

    expect(
      orphan,
      "⛔⛔ 這幾支被 `skills:check` 驗,而**它們的產生器不在 `skills:sync` 的鏈上**:\n" +
        orphan.map((n) => `  ${n}`).join("\n") +
        "\n⇒ ⭐ 症狀是「批收尾每次都紅,而跑聚合指令修不好」—— 只能靠人記得單獨跑一次。" +
        "\n→ 把它的 build 接進 package.json 的 `skills:sync`," +
        "\n  或在 `CHECK_STEP_NO_SYNC` 裡寫下**為什麼它的產物不需要被聚合重生成**（要能被反駁）。",
    ).toEqual([]);
  });

  // ⭐⭐ 上面三條看的是**腳本名**;這一條從**產物**那一端看,補的是「連腳本都沒有的產生器」那個洞。
  it("每一支寫 docs/ 或 content/ 產物的產生器,目錄都在聚合指令的視野裡", () => {
    const s = scripts();
    const homes = scriptHomes();
    const aggregate = s["skills:check"] ?? "";
    const gens = generatorDirs();
    expect(gens.size, "產生器掃描回空的 —— 偵測壞了,⛔ 不是真的沒有產生器").toBeGreaterThan(10);

    const blind = [...gens.keys()].sort().filter((dir) => {
      if (dir in GENERATOR_NO_CHECK) return false;
      const refs = Object.entries(s)
        .filter(([k, v]) => v.includes(`tools/${dir}/`) || (homes[k] ?? []).includes(`tools/${dir}/package.json`))
        .map(([k]) => k);
      // ⭐ 「在視野裡」= 有一支 `*:check` 被 skills:check 跑到,或那一支已經帶著理由被豁免。
      return !refs.some((k) => k.endsWith(":check") && (aggregate.includes(k) || k in EXEMPT));
    });

    expect(
      blind,
      `這幾個目錄在寫 git 追蹤的產物,卻**沒有任何 `+"`*:check`"+` 在聚合指令裡看得到它們:\n` +
        blind.map((d) => `  tools/${d}/  ← ${gens.get(d)![0]}`).join("\n") +
        `\n→ 給它一支 *:build/*:check 並接進 package.json 的 skills:sync / skills:check,` +
        `\n  或在 GENERATOR_NO_CHECK 裡寫下**為什麼它的產物不會過期**（要能被反駁）。`,
    ).toEqual([]);
  });
});
