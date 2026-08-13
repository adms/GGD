/**
 * `content/config/*.json` 的**後台入口覆蓋率** —— 下一份漏接不可以是靜默的。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼需要這一支
 * ════════════════════════════════════════════════════════════════════════════
 * `config/item-card.json` 是 owner 2026-08-02 剛下過排版指示的一份文件，而它從
 * 出生到 2026-08-02 為止，`apps/admin/src` 全樹對它**零引用** —— 想把
 * `[On-Hit]` 從主動改成被動，只能編 repo、跑 `pnpm content:build`、重新部署。
 * 沒有任何測試會紅，因為「少一頁後台」不是任何一條斷言的反面。
 *
 * 所以判準必須反過來寫：**每一份 config 文件都要嘛有後台入口、要嘛在下面這張
 * 明示的豁免表上**，而豁免表的每一列都要寫得出「為什麼」與「什麼時候該失效」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三個刻意的設計決定
 * ════════════════════════════════════════════════════════════════════════════
 * **① 內容覆蓋層不算入口。** `ui/ContentOverlayPage` 的 `COMMON_COLLECTIONS` 含
 * `"config"`，技術上可以貼整份 JSON 進去改**任何一份**文件。把它算成入口的話 32
 * 份全部通過，這條守衛當場歸零。理由用 `configForms.ts` 自己的檔頭：從 Zod 自動
 * 長出來的表單都已經「不叫可調，叫 JSON 編輯器」了，一個貼整份 JSON 的文字框只會
 * 更遠 —— 沒有中文標籤、沒有「它影響什麼」、沒有上下界。
 *
 * **② 豁免的證據是資料結構，不是原始碼裡出現過那串字**（失敗形態 ⑥）。
 * `OWN_PAGE` 那一族帶的是**那一頁的模組真的匯出的 docId 常數**（下面 import 進來
 * 的那些）與**後台路由 key**；測試直接問 `pageRequiresSession(page)`，不是去
 * grep App.tsx。常數被改名 → 這個檔案編譯不過；常數的值被改掉 → 測試紅；那一頁
 * 從 session 表上被拿掉 → 測試紅。註解做不到這三件事。
 *
 * **③ 豁免表不可以自己長大。** `kind` 是四選一的封閉 union（打一個新字串進去
 * 編譯就不過），而且 `configDocCoverage.test.ts` 把**列數與每一類的列數都釘死**：
 * 加一列必須同時去改那個數字，也就是必須是一個看得見的決定。順手加一列偷渡一份
 * 新文件這件事，做得到，但做不到「沒有人注意到」。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DOC_SPECS } from "./configForms";
// ── 專屬頁模組真的匯出的 docId 常數。**值**被拿來當證據（見檔頭 ②）。
import { BONUS_DOC_ID } from "./baseBonus";
import { COMBAT_FEEL_DOC_ID } from "./combatFeel";
import { FORM_VISUALS_DOC_ID } from "./formVisuals";
import { ARENA_RULES_DOC_ID } from "./itemDraft";
import { MATCH_DOC_ID } from "./matchConfig";
import { CAPS_DOC_ID } from "./statCaps";
import { STORE_DOC_ID } from "./storeEconomy";
import { VFX_FAMILIES_DOC_ID } from "./vfxForge";
import { BARCODE_DOC_ID } from "./voxelBarcode";
import { BODY_DOC_ID } from "./voxelBody";

/**
 * 一份文件為什麼可以沒有通用引擎的頁。**四選一**，不是自由字串 —— 一個自由字串
 * 的分類欄位等於沒有分類，而分類正是「這一列該用哪一種方式驗」的答案。
 */
export type ConfigDocExemptionKind =
  /** 有自己手刻的專屬頁（證據：路由 key + 那個模組匯出的 docId 常數） */
  | "OWN_PAGE"
  /** 它不是參數表：建置產物、保真度台帳、或走訪出來零個可調純量 */
  | "NOT_TUNABLE"
  /** 今天做了是自我一致的謊言（沒有消費端／要配合另一條產線），綁一個到期條件 */
  | "DEFERRED"
  /** **確認是缺口**，只是還沒做。不是免死金牌，是一張帳單 */
  | "KNOWN_GAP";

export interface ConfigDocExemption {
  docId: string;
  kind: ConfigDocExemptionKind;
  /** 為什麼它現在不必走通用引擎。留白 = 三個月後沒有人知道這一列還算不算數。 */
  why: string;
  /** **這個豁免什麼時候該自己失效。** 沒有到期條件的豁免＝把它從稽核範圍刪掉。 */
  expiresWhen: string;
  /** `OWN_PAGE` 專用：後台路由 key（測試會問 `pageRequiresSession`）。 */
  page?: string;
  /**
   * `OWN_PAGE` 專用：那一頁的模組匯出的 docId 常數**的值**。
   * 這裡填的是 import 進來的常數本人，不是重打一次字串 —— 重打一次就是第二份會
   * drift 的知識，而 drift 的症狀正好是這條守衛要抓的那個（豁免還在、頁沒了）。
   */
  docIdConstant?: string;
  /**
   * `NOT_TUNABLE` 專用：出貨文件裡真的存在的**出處欄位**名稱（`source` /
   * `provenance` / `contentDigest`…）。它是「這份文件記的是查到什麼，不是我們想要
   * 什麼」的機器可驗版本；那個欄位消失時，這個豁免的理由也就消失了。
   */
  provenanceKey?: string;
  /** `DEFERRED` / `KNOWN_GAP` 專用：帳單掛在哪一張 issue 上。 */
  issue?: string;
}

/**
 * 豁免表。**加一列要同時改 `configDocCoverage.test.ts` 裡釘死的那幾個數字。**
 *
 * ⚠️ 列的順序沒有意義；分類有。
 */
export const CONFIG_DOC_EXEMPTIONS: readonly ConfigDocExemption[] = [
  {
    docId: "per-level-bonus",
    kind: "KNOWN_GAP",
    why: "⚠️ 這份文件的 `perLevel` 是一個 **`z.record`**（鍵是屬性名，不是固定欄位），而通用表單引擎只走得動**固定形狀的葉節點** —— 它列不出「有哪些鍵」，於是頁面會是空的。做一個空頁比沒有頁更糟：操作者點進去看到什麼都沒有，會以為壞了。",
    expiresWhen: "⚠️ 通用引擎長出「record 型欄位」的支援（新增/刪除鍵 + 每個鍵一組子欄位）的那一天，這一列就該退場，改成一頁真的能編的表。⭐ `config.stat-caps@1` 的 `caps` 是同一個形狀，兩份會一起解鎖。",
  },
  // ── ① OWN_PAGE：有專屬頁。會腐爛，所以每一列都被機器驗兩件事 ────────────
  {
    docId: "arena-rules",
    kind: "OWN_PAGE",
    page: "mobWaves",
    docIdConstant: ARENA_RULES_DOC_ID,
    why: "三頁共同編輯這一份：殭屍波系統（mobWaves 區塊）、傳說武器三選一（itemDraft + retiredLootTables）、對戰設定（draft.offerCount 唯讀 + draft.tierSchedule 曲線）。",
    expiresWhen:
      "⚠️ 這是**文件層**豁免，欄位層仍有破洞：rounds / overflow / flowers / reviveCircles / guardianTower / goldDrop / nightPact / ultUnlockRound / exUnlockRound 九個頂層區塊全部只走 preserved「原封不動帶著走」，一格都調不到。那九塊要嘛長出欄位、要嘛獨立記一張帳 —— 這一列不涵蓋它們。",
  },
  {
    docId: "base-bonus",
    kind: "OWN_PAGE",
    page: "baseBonus",
    docIdConstant: BONUS_DOC_ID,
    why: "專屬頁 ui/BaseBonusPage.tsx（出貨值副本 baseBonus.ts 的 SHIPPED_*，baseBonusShippedCopy.test.ts 在守）。",
    expiresWhen: "那一頁被刪、路由被拔、或 BONUS_DOC_ID 改成別的文件時，這一列當場失效。",
  },
  {
    docId: "combat-feel",
    kind: "OWN_PAGE",
    page: "combatFeel",
    docIdConstant: COMBAT_FEEL_DOC_ID,
    why: "專屬頁 ui/CombatFeelPage.tsx；欄位由 deriveFields(zConfigCombatFeelDoc) 從 schema 推導，掛載由 configPagesRegistered.test.ts 釘住（import + 導覽列 + 路由三層）。",
    expiresWhen:
      "ui/CombatFeelPage.tsx 被刪、combatFeel 從 session 表上消失、或 COMBAT_FEEL_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "config.match",
    kind: "OWN_PAGE",
    page: "matchConfig",
    docIdConstant: MATCH_DOC_ID,
    why: "專屬頁 ui/MatchConfigPage.tsx 的 MATCH_FIELDS（tick / match / economy / progression / draft，每格帶 realHome 指出真正生效的常數）。",
    expiresWhen:
      "ui/MatchConfigPage.tsx 被刪、matchConfig 從 session 表上消失、或 MATCH_DOC_ID 指到別份文件時失效。⚠️ 那一頁自己標了 19 格「沒有消費端」的唯讀欄位，那是另一張帳，這一列不涵蓋它們。",
  },
  {
    docId: "form-visuals",
    kind: "OWN_PAGE",
    page: "formVisuals",
    docIdConstant: FORM_VISUALS_DOC_ID,
    why: "專屬頁 ui/FormVisualsPage.tsx（#249 GH#288：26 對變身裡 21 對前後同一個模型，靠顏色/大小/掛件才看得出來）。",
    expiresWhen:
      "ui/FormVisualsPage.tsx 被刪、formVisuals 從 session 表上消失、或 FORM_VISUALS_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "stat-caps",
    kind: "OWN_PAGE",
    page: "statCaps",
    docIdConstant: CAPS_DOC_ID,
    why: "專屬頁 ui/StatCapsPage.tsx（屬性天花板 + 技能能把天花板抬到哪）。",
    expiresWhen:
      "ui/StatCapsPage.tsx 被刪、statCaps 從 session 表上消失、或 CAPS_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "store",
    kind: "OWN_PAGE",
    page: "storeEconomy",
    docIdConstant: STORE_DOC_ID,
    why: "專屬頁 ui/StoreEconomyPage.tsx（championUnlockCost / freeChampionIds / mcoinRewards）。",
    expiresWhen:
      "ui/StoreEconomyPage.tsx 被刪、storeEconomy 從 session 表上消失、或 STORE_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "vfx-families",
    kind: "OWN_PAGE",
    page: "vfxForge",
    docIdConstant: VFX_FAMILIES_DOC_ID,
    why: "專屬頁 ui/VfxForgePage.tsx（鑄技工坊：每支技能綁哪一個家族原型 + per-invocation 參數）。",
    expiresWhen:
      "ui/VfxForgePage.tsx 被刪、vfxForge 從 session 表上消失、或 VFX_FAMILIES_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "voxel-barcodes",
    kind: "OWN_PAGE",
    page: "voxelBarcode",
    docIdConstant: BARCODE_DOC_ID,
    why: "專屬頁 ui/VoxelBarcodePage.tsx —— 文件自己的 note 就寫「後台『體素條碼』頁寫進來的那一層」。",
    expiresWhen:
      "ui/VoxelBarcodePage.tsx 被刪、voxelBarcode 從 session 表上消失、或 BARCODE_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "voxel-bodies",
    kind: "OWN_PAGE",
    page: "voxelBody",
    docIdConstant: BODY_DOC_ID,
    why: "專屬頁 ui/VoxelBodyPage.tsx（體素鑄造廠）。bodies 目前是空物件＝沒有人被覆寫，那是預期狀態不是缺口。",
    expiresWhen:
      "ui/VoxelBodyPage.tsx 被刪、voxelBody 從 session 表上消失、或 BODY_DOC_ID 指到別份文件時失效。",
  },
  {
    docId: "combat-env",
    kind: "OWN_PAGE",
    page: "combatEnv",
    // ⚠️ 沒有 docIdConstant：這一頁**不寫內容覆蓋層**，見下面的 why。
    why: "專屬頁 ui/CombatEnvPage.tsx，但它寫的是平台自己的表（GET/PUT /admin/combat-env），不是 content overlay。所以 content/config/combat-env.json 是「內容預設值」，線上真正生效的那一份住在平台 —— 「入口存在但不寫這個檔」是一種合法的豁免形態。",
    expiresWhen: "那一頁被刪、或 combatEnv 從 session 表上消失時失效。⚠️ 也在平台開始改讀 content overlay 的那一天失效 —— 到時這一列的整段理由都不再成立。",
  },

  // ── ② NOT_TUNABLE：它不是參數表 ─────────────────────────────────────────
  {
    docId: "icon-plan",
    kind: "NOT_TUNABLE",
    provenanceKey: "provenance",
    why: "建置產物不是參數表：整份由 tools/icon-gen/src/plan.py 覆寫（它自己填 id/schema），欄位是 contentDigest / counts / provenance / dropped / blocked —— 全部是「這次掃描算出什麼」。後台 ui/IconTrackingPage.tsx 只讀它做進度顯示，不寫。給它一張編輯表單的話，操作者填的值會在下一次跑 plan.py 時被無聲蓋掉。",
    expiresWhen: "plan.py 不再覆寫整份、或 schema 長出一格「人來決定」的參數時失效。",
  },
  {
    docId: "unit-tints",
    kind: "NOT_TUNABLE",
    provenanceKey: "source",
    why: "保真度台帳不是偏好表：53 個 unit + 24 筆 transient，每一格都帶 source（w3u-static）與 evidence（指名 war3map.w3u 的 entry 與 trigger 行號）。開一頁讓人手改 RGB＝把一份可稽核的移植紀錄變成沒有出處的偏好，而 evidence 欄位會繼續宣稱有出處（第三守則）。要改顏色的正確路徑是改 importer 或改英雄文件。",
    expiresWhen: "每一格的 source/evidence 不再是必填、或 owner 明說要在後台手調顏色時失效。",
  },
  {
    docId: "victory-taunts",
    kind: "NOT_TUNABLE",
    provenanceKey: "voices",
    why: "108KB 幾乎全是 VO 文案（113 位英雄的 roundWin 池 + fallback + matchWin + 創作簡報）。唯二長得像參數的 voices / rate，schema 自己寫死了它們不是參數 ——「record the cast and speaking rate the clips were rendered WITH: provenance for a re-render, not playback parameters」。每一句都是預錄 mp3，後台把 rate 185 改成 200 而不重跑產線，畫面與耳朵一點變化都沒有。",
    expiresWhen: "播放端開始真的讀 rate（＝它變成播放參數）、或文案編輯搬進後台時失效。owner 會改的是文案，入口是 tools/tts-gen + content/audio-manifests/taunts.json。",
  },

  // ── ③ DEFERRED：今天做了會是一句自我一致的謊言，綁到期條件 ──────────────
  {
    docId: "round-grade",
    kind: "DEFERRED",
    issue: "GH#232",
    why: "刻意不掛，理由是 configForms.ts 檔頭第 1 條（只掛有真消費端的文件）：roundGradeFromDoc 在整個 repo 沒有 production 呼叫端。掛上去就是製造「操作者存了值、重整讀得回來、遊戲一輩子看不到」的自我一致謊言。",
    expiresWhen:
      "GH#232（每回合進商店顯示 S~D 評價）落地的那一刻 —— 那時 roundGradeFromDoc 會有第一個 production 呼叫端，這一列必須當場被刪掉並補一頁。configDocCoverage.test.ts 真的去數呼叫端，所以它會自己紅。",
  },
  {
    docId: "champion-voices",
    kind: "DEFERRED",
    issue: "#142",
    why: "119 個英雄 key，每格是 { select: [資產路徑], source, soundset } —— 走訪出來零個純量葉節點，通用表單引擎畫出來會是一堆讓人打錯字的檔案路徑輸入框。值確實會變（owner 會換「誰講什麼」），但變的形狀是「丟新檔進 content/assets + 重跑產線」，入口是語音產線頁 ui/VoiceGenPage.tsx。",
    expiresWhen: "語音產線頁真的能寫這份 doc 的那一天（或 schema 長出可調純量時）失效。",
  },
  // ── 2026-08-02 收尾：三個 lane 的欄位,落點 1+2 接完了,落點 3 卡在客戶端 ──
  //
  // 這兩份是同一個形狀,也和上面 `round-grade` 是同一個形狀:文件有了、Zod 有了、
  // schema tag 進了 union（那一步是**必要**的,不做才會炸 —— 見 config.ts 的註解），
  // 但**客戶端還在讀寫死的 `DEFAULT_*` 常數,沒有人讀這份文件**。
  //
  // 所以今天替它們開後台頁,就是 configForms.ts 檔頭第 1 條講的那句自我一致的
  // 謊言:操作者存了值、重整讀得回自己填的數字、遊戲一輩子看不到。兩列 DEFERRED
  // 是誠實的那一版,而且到期條件是**機器數出來的**（`productionCallSites`），
  // 不是一句「之後會做」。
  //
  // ⚠️ 原本是**三**列。`victory-podium` 那一列在 2026-08-03 到期並被刪掉 ——
  // `RoundWinnerStage.victoryPodiumPolicy()` 去 Configs 登錄表讀那份文件，
  // `resolveVictoryPodium` 的呼叫端從 0 變成 1，`configDocCoverage.test.ts` 當場紅，
  // 於是 `configForms.ts` 有了 `VICTORY_PODIUM_SPEC`、`store.ts` 有了那個 Page、
  // App.tsx 有了導覽列那一列。**這就是「到期條件是機器數出來的」長什麼樣**：
  // 沒有人需要記得回來看這一列。
  {
    docId: "lobby-layout",
    kind: "DEFERRED",
    issue: "GH#255",
    why: "大廳左欄上下分割政策（friendsShare / splitMinHeightPx / minSlotHeightPx / stackBelowWidthPx）。內容文件與 Zod 都接好了,但唯一的消費端 apps/client/src/ui/platform/LobbyScreen.tsx 讀的是 lobbyLayout.ts 的 DEFAULT_LOBBY_LAYOUT 常數,不是這份文件 —— 今天開一頁後台,操作者改完存檔、重整讀得回來,而大廳一格都不會動。",
    expiresWhen:
      "`resolveLobbyLayout` 出現第一個 production 呼叫端的那一刻（＝有人把 ContentDb 的文件推進 LobbyScreen）。configDocCoverage.test.ts 真的去數呼叫端,所以那天它會自己紅,逼人刪掉這一列並註冊一個 ConfigDocSpec。",
  },
  {
    docId: "valhalla-sandbox",
    kind: "DEFERRED",
    issue: "GH#254",
    why: "英靈殿技能試放空間的七格規則（含 owner 明說的假人 10,000 血與 3 秒補滿）。內容文件與 Zod 都接好了,但 valhallaSandbox.ts 的建構子吃的是 `opts.rules ?? DEFAULT_VALHALLA_SANDBOX`,沒有任何人把這份文件餵進 opts.rules —— 開後台頁一樣是存了不生效。",
    expiresWhen:
      "`resolveValhallaSandbox` 出現第一個 production 呼叫端的那一刻。同上,守衛自己會紅。",
  },

  // ── ④ KNOWN_GAP：確認是缺口，只是還沒做。這是帳單不是免死金牌 ───────────
  {
    docId: "audio-map",
    kind: "KNOWN_GAP",
    issue: "#87 / #109 / #134 / #190 都是 owner 親自調音量與選曲的紀錄",
    why: "12 個 BGM 場景 + 147 個 SFX key，每一格都是真的執行期播放參數（bgm 的 gain/loop、sfx 的 gain/cooldownMs/maxConcurrent），消費端是 apps/client/src/audio/AudioSystem.ts。今天調一格 gain 要編 repo + content deploy。⚠️ 它的形狀不適合通用長表單（147 × 3 格），該是一頁混音表（每列一個 key、gain 滑桿 + 試聽），所以不是「順手註冊一個 spec」就能收掉的。",
    expiresWhen: "那一頁做出來（或 owner 明說音量不必後台調）的那一天。做出來之後這一列會**被守衛強迫刪掉** —— 同時在註冊表與豁免表上是紅的。",
  },
  {
    docId: "origin-routes",
    kind: "KNOWN_GAP",
    issue: "owner 2026-08-12 指名要一頁「新英雄轉生設計」，這一份是它的資料基礎",
    why: "10 個出身 × 一句話 + 32 條路線 × 三句 = **110 個文案葉節點**，而通用長表單畫出來會是 110 個沒有上下界的文字框 —— 那不叫可調。⚠️ 而且 owner 一定會改：那 32 個路線名是 Claude 取的提案，他還沒定稿。⛔ 它也**不是** NOT_TUNABLE —— 內容確實該由人編輯，只是形狀應該是「一頁出身卡＋路線卡」，不是 Zod 走訪出來的欄位清單。今天的入口是內容編輯器（貼整份 JSON）。",
    expiresWhen: "「新英雄轉生設計」那一頁做出來的那一天 —— 它本來就要顯示出身與路線來推薦技能組合，順手就是這一份的編輯入口。做出來之後這一列會被守衛強迫刪掉。",
  },
  {
    docId: "roster",
    kind: "KNOWN_GAP",
    issue: "owner 2026-07-30 與 2026-08-02 就這兩隻改過兩次口徑",
    why: "下架/上架一隻英雄的那張表，而且它自己的 note 是一句假話（第三守則）：「技能補完之後把 id 從這裡拿掉就是重新上架，不用改程式、不用重新部署」—— 實際上 apps/admin/src 對 roster / retiredChampions 零引用，今天要編 repo + pnpm content:build + content deploy。真消費端有兩個且都在關鍵路徑：game-server 的 whitelist.isRetiredChampionId、客戶端的 retiredChampionIds()。⚠️ 後台的 CurationPage 管的是白名單，不是這一份。",
    expiresWhen: "那一頁做出來的那一天（同上，屆時這一列會被守衛強迫刪掉）。⚠️ 在那之前，那句 note 應該先被改成真話。",
  },
];

// ─────────────────────────────────────────────────────────────── 掃描 ─────

/** 掃出來的一份文件。 */
export interface ScannedConfigDoc {
  /** 檔名去掉 `.json` */
  file: string;
  /** 文件自己的 `id` 欄位 */
  id: string;
  /** 文件自己的 `schema` 欄位 */
  schema: string;
}

/**
 * 掃 `content/config/` 下每一份**真的文件**。
 *
 * 跳過兩種檔案，而且兩種都是明著跳過的：
 *   · `_` 開頭 —— `_index.json`（打包索引）與 `_purchase-lines.json`（沒有
 *     id/schema 的裸資料）。
 *
 * ⚠️ **GUARD-THE-GUARD：一份都沒掃到就丟例外，不是回空陣列。** 這個 repo 有前科：
 * `bundle.test.ts` 驗的是打包器而不是出貨的那一份，759 條全綠的情況下推了一份過期
 * 的 bundle 上線，客戶端整個選人畫面空掉。一條「對零份文件都通過」的覆蓋率守衛
 * 是同一個形狀的東西 —— 路徑打錯、目錄搬家、glob 壞掉，它會安靜地全綠。
 */
export function scanConfigDocs(dir: string): ScannedConfigDoc[] {
  const out: ScannedConfigDoc[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
    out.push({
      file: name.slice(0, -".json".length),
      id: typeof raw["id"] === "string" ? raw["id"] : "",
      schema: typeof raw["schema"] === "string" ? raw["schema"] : "",
    });
  }
  if (out.length === 0) {
    throw new Error(
      `GUARD-THE-GUARD：在 ${dir} 一份 config 文件都沒掃到。這條覆蓋率守衛對零份文件會全綠，` +
        `所以它寧可在這裡爆炸也不要安靜地通過。`,
    );
  }
  return out;
}

// ───────────────────────────────────────────────────────────── 判決 ───────

export interface CoverageVerdict {
  /** 走通用引擎（`CONFIG_DOC_SPECS`）的 */
  covered: string[];
  /** 在豁免表上的 */
  exempt: string[];
  /** **缺口** —— 兩邊都不在。這一條非空就是紅 */
  unresolved: string[];
  /** 同時在註冊表與豁免表上（做完了卻沒把豁免刪掉）。這一條非空就是紅 */
  duplicated: string[];
  /** 豁免表上有、`content/config/` 裡沒有（文件被刪了，豁免變成一段死註解） */
  stale: string[];
}

/**
 * 每一份文件的去向。
 *
 * `duplicated` 是**讓豁免自己到期**的那個機制：`audio-map` 的頁做出來、spec 被
 * 註冊進 `CONFIG_DOC_SPECS` 的那一刻，那一列 KNOWN_GAP 就從「帳單」變成「謊言」，
 * 而這條守衛會紅，逼人把它刪掉。
 */
export function coverageVerdict(
  scanned: readonly ScannedConfigDoc[],
  coveredDocIds: readonly string[],
  exemptions: readonly ConfigDocExemption[],
): CoverageVerdict {
  const covered = new Set(coveredDocIds);
  const exempt = new Set(exemptions.map((e) => e.docId));
  const onDisk = new Set(scanned.map((d) => d.id));
  const verdict: CoverageVerdict = {
    covered: [],
    exempt: [],
    unresolved: [],
    duplicated: [],
    stale: [],
  };
  for (const doc of scanned) {
    const c = covered.has(doc.id);
    const e = exempt.has(doc.id);
    if (c && e) verdict.duplicated.push(doc.id);
    else if (c) verdict.covered.push(doc.id);
    else if (e) verdict.exempt.push(doc.id);
    else verdict.unresolved.push(doc.id);
  }
  for (const e of exemptions) if (!onDisk.has(e.docId)) verdict.stale.push(e.docId);
  return verdict;
}

/** 走通用引擎的那幾份的 docId（給呼叫端省一行 map）。 */
export function registeredConfigDocIds(): string[] {
  return CONFIG_DOC_SPECS.map((s) => s.docId);
}

// ───────────────────────────────────── DEFERRED 的到期條件（呼叫端計數）──

const SOURCE_ROOTS = ["apps", "packages"] as const;

/** 把註解剝掉 —— 這個 repo 的長註解裡什麼字都有，不能讓散文算成一個呼叫端。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * 一個函式在 **production 原始碼**裡有幾個呼叫端（排除註解、測試、自己的宣告，
 * 以及這個檔案自己）。
 *
 * 這是 `round-grade` 那一列 DEFERRED 的到期條件：它的理由是
 * 「`roundGradeFromDoc` 沒有 production 呼叫端」，而理由要是一條**會自己失效**的
 * 斷言，不是一句註解。GH#232 落地那天呼叫端出現，這個數字變成 1，守衛紅。
 *
 * ⚠️ 誠實地說清楚它**不是**什麼：它數的是剝掉註解之後的 `符號(` 字面出現次數，
 * 不是真的 import graph。它證明得了「沒有人呼叫它」，證明不了「有人呼叫 ⇒ 那條路
 * 真的跑得到」。對「豁免該不該到期」這個問題，前者剛好就是要的那一半。
 *
 * ⚠️ `excludePaths` 必須包含**這個檔案自己**：上面那張豁免表在字串裡寫著
 * 「roundGradeFromDoc 沒有呼叫端」，一支會數到自己那份文書作業的守衛永遠不會綠。
 */
export function productionCallSites(
  repoRoot: string,
  symbol: string,
  excludePaths: readonly string[],
): number {
  const needle = `${symbol}(`;
  let count = 0;
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(ent.name) || /\.test\.tsx?$/.test(ent.name)) continue;
      if (excludePaths.some((p) => full.endsWith(p))) continue;
      const src = stripComments(readFileSync(full, "utf8"));
      for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) count++;
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(repoRoot, root));
  return count;
}
