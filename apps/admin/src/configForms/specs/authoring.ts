/**
 * 設定文件的**標籤資料**（編寫規則・新英雄檢查・內容載入・吟唱時間）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigCastTimeDoc,
  zConfigContentLoadDoc,
  zConfigAuthoringRulesDoc,
  zConfigIconUploadDoc,
} from "@ggd/shared/content";
// ⭐ GH#445 —— 「傷害相對冷卻偏低」那一條警示的說明是**現算**的（哪幾格、低幾 %、
//    要跳到哪一級），⛔ 不是後台手寫的一段會過期的散文。
import { describeLowDamageCells } from "@ggd/shared/content/lowDamageCells";
// ⛔ 級距名／形狀名／五級距數字／相稱性推導函式**已經不在這個檔了**（GH#992）——
//    它們原本在這裡被用來現算「編輯器創作規則」那 27 格的標籤，而那 27 格的人話
//    2026-09-07 搬進了 `schema/config/authoringRules.ts` 的 `.describe()`，
//    ⭐ 而那個檔本來就已經 import 同一族函式 ⇒ 搬過去之後這裡不必再 import 一次。
// 創建新英雄的警示開關（GH#480）—— 深路徑：這一份的 Zod 與**規則清單本體**住同一個
// 檔（schema 的 `rules` 物件是從 `NEW_HERO_WARN_RULES` 推導的），⛔ 拆開就會 drift。
import {
  NEW_HERO_CHECKS_DOC_ID,
  NEW_HERO_CHECKS_SCHEMA,
  zConfigNewHeroChecksDoc,
} from "@ggd/shared/content/newHeroChecks";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
export const AUTHORING_RULES_SPEC: ConfigDocSpec<"authoringRules"> = {
  page: "authoringRules",
  collection: "config",
  docId: "authoring-rules",
  schemaTag: "config.authoring-rules@1",
  zod: zConfigAuthoringRulesDoc,
  title: "編輯器創作規則",
  intro: [
    "外部技能編輯器（Codex 那一支）建包時看到的**原則界**。GH#327。",
    "⭐ **這一頁只有原則界,⛔ 硬界不在這裡。** 硬界（升階冷卻上升、AoE 超過決鬥區、階數不符）從既有的 Zod 界與「吟唱規則 / 冷卻規則 / AoE 級距 / 屬性上限」四頁**推導**出來 —— 抄一份到這裡就是第二個住處,而它一定會過期。",
    "⚠️ **違反原則界只警告,不擋。** owner 2026-08-12 的原話是「**原則上**附加技能升級冷卻不會增加」—— 保留刻意破例的空間。一律擋 = 想破例就得改程式;一律放 = 真缺陷跟設計選擇混在同一堆訊息裡。",
    "⭐ 改這一頁 → 端點 `GET /api/v1/content-import/authoring-rules` **下一秒就變**,外部編輯器不用改一行程式。那正是它取代散文的理由。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/）,**覆蓋層會蓋掉 `content/config/authoring-rules.json`**。",
  ],
  consumer:
    "packages/shared/src/content/authoringRules.ts 的 buildAuthoringRules()（唯一知道這些界怎麼組的地方）← content-api 的 /authoring-rules 端點 + content/editor-target-profile.json 的內嵌副本",
  effect: "**外部編輯器下一次讀端點就生效**;內嵌在 profile 裡的那一份要重跑 `pnpm content:build`。",
  // ⭐ GH#992（2026-09-07）：這 27 格的人話**搬回 Zod** —— 冷卻上下界的兩句、相稱性
  //    模型的四個選項（每個模型的範圍五格是現算的）、瞄準風險／期望命中人數各三格、
  //    十五格最低傷害級距（選項標籤從 `DEFAULT_DAMAGE_TIERS` 現算）、以及上限那一格，
  //    全部住 `packages/shared/src/content/schema/config/authoringRules.ts` 的 `.describe()`。
  //    ⛔ 這不是刪掉說明，是**搬家**：那個檔本來就已經在引用 `tableForModel()` /
  //    `describeProportionalityModels()` / `describeProportionalityCeiling()` 這一族推導函式，
  //    所以搬過去之後**沒有多一份會漂的知識**（第〇·四守則）。
  fields: derivedFields(zConfigAuthoringRulesDoc, []),
  preserved: [],
};

/**
 * 創建新英雄的**警示開關**（GH#480）。
 *
 * ⚠️ 這一頁與 編輯器創作規則 是**兩層不同的東西**，刻意分開：那一頁調的是
 * 「一支技能的冷卻該落在哪個區間」（規則的**內容**），這一頁調的是
 * 「哪幾條規則要在作者存檔的那一刻跳出來」（規則的**開關**）。
 */
export const NEW_HERO_CHECKS_SPEC: ConfigDocSpec<"newHeroChecks"> = {
  page: "newHeroChecks",
  collection: "config",
  docId: NEW_HERO_CHECKS_DOC_ID,
  schemaTag: NEW_HERO_CHECKS_SCHEMA,
  zod: zConfigNewHeroChecksDoc,
  title: "新英雄檢查警示",
  intro: [
    "建立一位新英雄時，**按下建立的那一刻**要跳哪幾條警示。owner 2026-08-20：「⋯**生成代入與檢查跳警示**都要記得更新，特別是 **script 程式自動化跟警示**的部分」。",
    "⭐ 七條**全部只警告、一條都不擋**（owner 2026-08-12：「只是個警告標記，並不會擋」）。唯一標成 block 的是「超出 Zod 上下界」，而那是**事實陳述** —— 伺服器真的會 422，⛔ 不是這一頁決定要擋。",
    "⚠️ 關掉一條的代價是**它變回靜默**：那個問題仍然存在，只是要等到 `content:build`（或更晚，等到玩家撞上）才會被發現。⛔ 關掉之前先想清楚「那誰會告訴作者？」",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/new-hero-checks.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/newHeroChecks.ts 的 newHeroChecksFromDoc()（唯一知道這幾格怎麼作用的地方）← apps/admin 的 heroForgePage.ts（鑄英雄工坊的目錄載入）與 heroTemplate.ts（新英雄模板頁），以及 authoringRules.ts 把同一份開關送給外部編輯器",
  effect:
    "**後台這兩頁下一次重新載入時生效**（它們開頁時抓一次這份文件）；外部編輯器則是下一次讀 `/authoring-rules` 端點就變。",
  fields: [
    {
      path: "rules.empty-column",
      zh: "六欄留白",
      note: "說明／施展距離／範圍／傷害／冷卻／耗魔 這一格該有而是空的或 0 時跳。⚠️ 不適用的組合不算（self 技沒有施展距離）。關掉它，一位六欄全空的新英雄可以一路存進內容庫而 `content:build` 全綠。",
    },
    {
      path: "rules.out-of-bounds",
      zh: "超出 Zod 上下界",
      note: "界線**從出貨 schema 讀**，⛔ 不抄字面值。這一類寫進去伺服器會 422，所以關掉它不會讓那份草稿存得進去 —— 只會讓作者填完整張表才在儲存時吃到一串英文錯誤。",
    },
    {
      path: "rules.principle-band",
      zh: "冷卻不在原則區間",
      note: "冷卻落在「編輯器創作規則」那一頁的單體／範圍區間外時跳。⚠️ owner 說的是「原則上」，所以它保留刻意破例的空間 —— 如果你的這一批英雄就是要破例，關掉它比讓作者習慣忽略警告好。",
    },
    {
      path: "rules.claim-mismatch",
      zh: "說明的數字對不上 JSON",
      note: "卡面寫「25 秒冷卻」而 `cooldown` 是 60 時跳（冷卻／耗魔／持續／傷害四類）。⛔ 模板技整條不判 —— 它的 effects 在磁碟上本來就是空的，判下去 100% 誤報，而一條會誤報的警示會被下一個人整條關掉。",
    },
    {
      path: "rules.no-op-effect",
      zh: "說了但不會發生",
      note: "整棵效果樹一個數字都動不到時跳（第一·五守則：卡片上不可以有「說了但不會發生」的字）。關掉它，一張印著效果、遊戲裡什麼都不發生的技能卡會完全靜默地上線。",
    },
    {
      path: "rules.dialogue-claim",
      zh: "機制數字寫進了台詞",
      note: "⭐「」裡是**角色對白不是效果** —— 寫在裡面的冷卻／耗魔／傷害／持續引擎一格都不讀。這是七條裡唯一沒有前例的一條：既有的每一支都只做到「剝掉台詞」，於是作者永遠不知道他剛剛寫了一句不會生效的話。",
    },
    {
      // ⭐ GH#445 —— owner 2026-08-20：「**傷害太低要跳出警告清單給我，後台跟 codex
      //    編輯器也同步跳警告**」。⛔ 這一格的說明**不是手寫的**：
      //    `describeLowDamageCells()` 現算「哪幾格、低幾 %、要跳到哪一級」，
      //    所以後台看到的話與 `docs/傷害偏低警告清單.md`、與 codex 端點
      //    **不可能分岔**（它們是同一個函式的三個呼叫點）。
      path: "rules.low-damage-cell",
      zh: "傷害相對冷卻偏低",
      note:
        `${describeLowDamageCells()}` +
        "⚠️ 這一條**沒有門檻可以在這裡調**：判準是「低於錨點」，而錨點是傷害五級距表" +
        "自己的起點。⇒ 要放寬就去調上游那三張表（**冷卻五級距** / **傷害五級距** / " +
        "**編輯器創作規則**的「期望命中人數」），這一條下一秒就跟著動。" +
        "⭐ 同一份推導還有兩個消費端：`pnpm lowdmg:build` 產的 " +
        "`docs/傷害偏低警告清單.md`，以及「創建新英雄」的冷卻預設 —— " +
        "生成的新技能**不會出生在**這幾格裡。",
    },
    {
      path: "minSample",
      zh: "中位數的最小樣本數",
      note: "六欄預設值從出貨技能語料取中位數時，同一桶（同槽位＋同施放型態）少於這個數就往上一層退（槽位 → 全語料 → 保守值）。調小＝更貼那一格的同型技能但更容易被三五支離群值帶偏；調大＝更穩但多數格子會退到全語料中位數。⚠️ 上界 200：出貨語料才 420 支，填 800 等於每一格都退到最後的保守值，而畫面上看起來完全正常。",
    },
    {
      path: "autofillDescription",
      zh: "自動代入技能說明",
      note: "新技能出生時要不要用**同一組數字**生一段機制說明（「指定單一敵人，施法距離 9.5，造成 160 點傷害。冷卻 32.5 秒，消耗[MP] 60。」）。⭐ 開著的價值是「說明↔JSON 一致」依構造成立；關掉之後那一格是空的，而空說明在卡片上就是一片空白。",
    },
  ],
  // 兩格純量 + 一個固定形狀的 rules 物件，沒有不編輯的分支要原封帶走。
  preserved: [],
};

export const CONTENT_LOAD_SPEC: ConfigDocSpec<"contentLoad"> = {
  page: "contentLoad",
  collection: "config",
  docId: "content-load",
  schemaTag: "config.content-load@1",
  zod: zConfigContentLoadDoc,
  title: "內容載入政策",
  intro: [
    "一份壞掉的內容文件，要不要殺掉**整份**內容。owner 2026-08-14：「遊戲主程式應該要把**全有全無**的這種奇怪機制改掉，應該改為**不同部分各自 check 載入成功**」。",
    "⭐ 這一頁存在是因為那個「全有全無」其實只是一行程式的決定，不是架構限制 —— `loader.ts` 從第一天就**逐份**收集錯誤（每一份壞的都記下 collection、id、Zod 的逐條 issue），只是最後一行把整批丟掉。",
    "⚠️ **代價已經發生過兩次**（2026-08-01、08-02）：四份 config 文件的 schema tag 不在已部署映像的 Zod union 裡 → 內容載入整份失敗 → 客戶端 fail-open 退回 2 隻骨架英雄 → 選人畫面空掉、沒有人進得去。**而網站看起來完全正常**，唯一說實話的是 console 一行 log。隔離之後，同一次的結果會是「少四份設定」。",
    "⛔ **隔離不等於安靜**：被隔離的每一份都會出現在 game shard 的 `GET /healthz` 的 `content.quarantined` 與 `content.quarantinedDocs`，開機 log 也會逐份印出來。那是這一頁能存在的前提 —— 一個沒有人知道的隔離，比整份失敗更糟。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/content-load.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/loader.ts 的 ContentLoader.load()（唯一知道這三格怎麼作用的地方）← game-server 開機、客戶端 main.tsx 的內容載入都走它。⚠️ 政策文件自己也在被載入的那一批裡，所以它**在迴圈跑完之後才被讀**；它自己壞掉時退回出貨預設，而且會出現在隔離清單裡。",
  effect:
    "**要重啟 game-server shard 才生效**（客戶端則是下一次重新整理）。",
  fields: derivedFields(zConfigContentLoadDoc, []),
  // 三格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ── 🖼 編輯器 icon 上傳（config/icon-upload）—— GH#966 ──────────────────────
export const ICON_UPLOAD_SPEC: ConfigDocSpec<"iconUpload"> = {
  page: "iconUpload",
  collection: "config",
  docId: "icon-upload",
  schemaTag: "config.icon-upload@1",
  zod: zConfigIconUploadDoc,
  title: "編輯器 icon 上傳",
  intro: [
    "owner 2026-09-02：「codex 技能編輯器要能**打包 icon 圖片**。設計者可以用 codex 技能編輯器**上傳設定圖片檔（但不是真的馬上上傳）**，而編輯器會**自動縮圖轉檔放入一起打包**」",
    "⭐ 流程：編技能 → 選一張自己畫的圖（**先留在編輯器裡**，⛔ 不上傳）→ 匯出時圖跟技能 JSON **進同一個 zip**（路徑 `assets/icon/<collection>/<技能 id>/source.png`）→ Main 收到後驗位元組、轉成出貨規格（128² WebP q90）、存進 `content/assets/icons/`、把文件的 `icon` 欄位指過去。",
    "⛔⛔ **在此之前放進 zip 的圖會無聲消失** —— 傳輸層把每一個檔都當 UTF-8 文字讀，然後把不是 `authoring/` 的路徑**靜靜跳過**。症狀是最糟的一種：匯出成功·上傳成功·validate 通過·⛔ 而 icon 不見了。⭐ 現在 zip 裡有而 manifest 沒宣告（或反過來）會**報錯並指名那個路徑**。",
    "⚠️ ⭐ **編輯器不可以自己轉檔** —— 轉檔規則只有一個住處（`packages/shared/src/content/icons/encodeIcon.ts`，CLI 與 API 共用）。兩份實作的症狀是「預覽看到的圖 ≠ 遊戲裡的圖」，⛔ 而沒有任何東西會紅。編輯器要預覽就顯示**原圖縮放**。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/icon-upload.json`**。",
  ],
  consumer:
    "apps/content-api/src/importRoutes.ts 的 `iconPolicy()` → `checkIconAssets()`（驗）與 `landIconAssets()`（轉檔＋落地）。⚠️ 兩條路都在 `POST /api/v1/content-import/{validate,apply}` 底下，⛔ 而 `/validate` 一個位元組都不寫。",
  effect:
    "**下一次匯入就生效**（每一次請求都重讀這份設定，⛔ 不快取）。⛔ 不必重新部署、⛔ 不必重啟。",
  fields: derivedFields(zConfigIconUploadDoc, []),
  // 四格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

export const CAST_TIME_SPEC: ConfigDocSpec<"castTime"> = {
  page: "castTime",
  collection: "config",
  docId: "cast-time",
  schemaTag: "config.cast-time@1",
  zod: zConfigCastTimeDoc,
  title: "吟唱規則",
  intro: [
    "技能按下去到生效之間，玩家站著不動多久。owner 2026-08-13：「請你照我的 **0.06~4.00 秒**來設定吟唱時間（所有的技能都有最低吟唱技能時間 0.06 秒，讓 tick 一定可以處理）」＋「**吟唱時間倍率**也可以在系統後台設定」＋「吟唱時間**上下限**也可以一起設定」。",
    "⭐ **三格是同一條算式的三個位置**，所以住同一頁：先把技能算出來的吟唱夾進 [下限, 上限] → 乘倍率 → **再夾一次** → 對齊整數 sim tick。夾兩次是刻意的：先夾擋作者打錯的「吟唱 10 秒」，後夾讓倍率 3 也不會把 2 秒推成 6 秒。",
    "⚠️ **下限的下界是一個 sim tick（≈0.034 秒），不是 0。** sim 是 30 Hz，用 `round(秒數 ÷ 1/30)` 換算 tick：0.06 秒 = 2 tick（穩）、0.02 秒 = 1 tick、0.01 秒 = **0 tick ⇒ sim 當它瞬發**。而客戶端**照樣畫得出**吟唱條與向天光束預告 —— 兩邊都不報錯，只有玩家看得出來。這就是 owner 那句「讓 tick 一定可以處理」在說的事。",
    "⛔ **不要改用「戰鬥系統」頁的冷卻倍率代替**：冷卻管「多久能再按一次」，吟唱管「按下去到生效多久」。用同一個旋鈕會把兩者一起動，等於什麼都沒調。",
    "⭐ **連段窗口起算點**（GH#1086）：「在 X 發動後 1 秒內施展 Y」這一族從**按下**還是**吟唱結束**開始數。GH#1074 量到：紀錄在按下、求值在吟唱結束，而上面那格「詠唱調整上限」把 W/E 夾成 1.0 秒 ⇒ 1 秒窗口被吟唱整個吃光，07 者皆陣的 Q→W→E **任何時序都按不出來**。出貨 `commit`；`resolve` 是 2026-09-06 前的行為（一鍵 rollback）。⚠️ 它不動任何數值。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cast-time.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/castTimeRules.ts 的 applyCastTimeRules（唯一知道三格怎麼作用的地方）← abilities/abilitySystem.ts 每一次施法時呼叫一次，瞄準鎖窗口／實際吟唱 tick／送給客戶端畫吟唱條的秒數**三者共用同一個結果**；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.castTimeRules。comboWindowFrom 的讀端：sim/content/condition.ts 的 recentCast 分支（comboWindowBaseTick）與 abilities/abilitySystem.ts 提交點的 comboBonus 烘焙（comboWindowFrozenAtCommit）",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 冷卻規則／淨化規則／格擋規則 同一個形態(#278)。",
  fields: derivedFields(zConfigCastTimeDoc, []),
  // 六格純量（#787 加了 castTimeMaxSec、GH#1086 加了 comboWindowFrom），沒有不編輯的分支要原封帶走。
  preserved: [],
};

