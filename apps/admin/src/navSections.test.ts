/**
 * 左欄分類重編（owner 2026-08-02「該頁面左排選單請做成可以收納/展開的形式避免過長，
 * 並且多幾個類別」）的**零遺漏**守衛。
 *
 * 這條守衛的價值在於:搬家的時候漏掉一項是**靜默的**。NAV 是一個 60 幾列的陣列，
 * 把六列從「系統」搬進「戰鬥規則」的時候少貼一列，畫面上不會有任何錯誤 —— 那一頁
 * 只是從此按不到，而它的元件、路由、session gate、測試全都還在，全綠。
 *
 * 所以下面第一條測試不是「數一數還有幾列」，而是**逐一比對兩個集合**:
 * `BASELINE_PAGES` 是重編**之前**（2026-08-02，重編那一刻的工作樹）NAV 裡實際存在的
 * 45 個路由，一個字一個字抄下來；測試對它做雙向集合相等。少一個是「搬丟了」，多一個
 * 是「加了新頁卻沒有人更新這份基準」—— 兩個方向都要紅，因為只擋單向的話，一次
 * 「刪一列 + 加一列」的編輯會安靜地通過。
 *
 * ⚠️ 這裡讀的是**出貨在用的** `NAV` 常數本身（`import { NAV } from "./ui/App"`），
 * 不是把 App.tsx 當文字掃（失敗形態 ⑥）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NAV, SECTION_ORDER, externalRows } from "./ui/App";
import { groupRows, isNavItem, visibleRows, type NavRow } from "./ui/navGroups";
import type { Page } from "./store";

const TAG = "adminui-nav-sections";

/**
 * 重編**之前**左欄上可到達的 45 個路由。
 *
 * ⚠️ 這份清單是基準線，不是「目前的 NAV」的副本 —— 它只有在 owner 真的核准新增或
 * 移除一頁時才該被編輯，而那次編輯應該和 NAV 的編輯出現在同一個 commit 裡。
 */
const BASELINE_PAGES: readonly Page[] = [
  // 營運
  "approvals",
  "quickApproval",
  "players",
  "matches",
  "replays",
  // #636 傷害排行榜 —— 2026-08-24 新增的一頁（owner:「排名可以容納十萬筆」）。
  // ⭐ 基準線跟著 NAV 在**同一個 commit** 裡動,那正是這條守衛要的東西。
  "damageBoard",
  "announcements",
  "mcoinGrant",
  "invites",
  "audit",
  // 內容·素材管理（生產 build 一定在的那兩列；dev chunk 的那些是動態載入的，
  // 不在 NAV 常數裡，所以也不在這份基準裡）
  "curation",
  "contentOverlay",
  // 資產產線
  "ai",
  "modelBudget",
  "iconTracking",
  "voxelSkins",
  "voxelForge",
  "voxelBarcode",
  "voxelBody",
  // 重編前的「系統」（26 列）
  "hub",
  "combatEnv",
  "baseBonus",
  "statCaps",
  "combatFeel",
  "castApproach",
  "matchConfig",
  "storeEconomy",
  "formVisuals",
  // 對戰錄影 —— 由另一條平行的工作線在 2026-08-02 同一天加進 NAV 的。它不在 owner
  // 核准的四個新分類的搬遷表裡，所以留在「系統」，但它**必須**列在這份基準裡，
  // 否則這條守衛會把「別人加的新頁」誤報成我的搬家出錯。
  "replayPolicy",
  // 內容載入政策 (GH#326, owner 2026-08-14) —— 同一個 `ConfigDocPage` 元件。
  // ⚠️ 它加在「營運」而不是「系統」:除了語意（跟 Audit log 一樣是出事才打開的），
  // 「系統」還有一條「重編後必須比 26 列短」的守衛，往那裡加會把它推回 26。
  "contentLoad",
  // 編輯器創作規則 (GH#327) —— 同一個 `ConfigDocPage` 元件,同在「營運」。
  "authoringRules",
  // 新英雄檢查警示 (GH#480) —— 同一個 `ConfigDocPage` 元件，同在「營運」，
  // 緊接在 編輯器創作規則 後面（那一頁是規則的內容，這一頁是規則的開關）。
  "newHeroChecks",
  "modelLod",
  "vfxCleanup",
  "vfxScripts", // GH#838 演出腳本開關（2026-08-28 登記）
  "vfxBudget", // GH#838 粒子密度上限（2026-08-28 登記）
  // 爽度特效 (GH#494, owner 2026-08-21) —— 同一個 `ConfigDocPage` 元件，
  // 緊接在 特效回收 後面（一個管「留多少在記憶體裡」，一個管「那一瞬間看得到什麼」）。
  "feelFx",
  "gore",
  "damageColors",
  "shieldRules",
  "blockRules",
  // 暴擊規則 —— GH#302 新增的一頁（owner 2026-08-09「每一條暴擊獨立算完傷害
  // 再帶入下一條」）。與 格擋規則 同族，共用 ConfigDocPage。
  "critRules",
  // #278 Wave 0 —— `config.berserk@1` 從「解析器存在但沒有文件」補成一整條路。
  "berserkRules",
  // #278 A4b —— 【淨化】的十一個旋鈕。
  "dispelRules",
  // 冷卻規則 —— owner 2026-08-10「cdr 天花板 0.99，但卡最低 0.1 秒」的**秒數**
  // 那一半（比率那一半在「屬性上限」頁，兩頁刻意相鄰）。
  "cooldownRules",
  // AoE 範圍四級距 —— owner 2026-08-11「原則上不寫範圍數字」。與 冷卻規則 相鄰：
  // 兩者都是「技能的尺」，操作者會一起找。
  "aoeTiers",
  "rangeTiers",
  // 英雄屬性正規化 —— owner 2026-08-12「只有小中大才是真正的分佈」。
  // 與 AoE 級距、屬性上限 相鄰：三者都是「英雄與技能的尺」。
  "statNormalization",
  // GH#322（2026-08-13）：這四頁的 spec 早就註冊了，但導覽列沒有那一列 ⇒ 操作者
  // 點不到。⚠️ 加進基準線是一個**決定**（這一行的 diff 就是那個決定的痕跡），
  // ⛔ 不是為了讓紅燈變綠 —— 少了這四列，那四份 config 只有 API 改得動。
  "castTime",
  "mitigation",
  "displacementTiers",
  "perLevelBonus",
  // GH#324 —— 小地圖規格（動漫競技場產生器的驗收標準）。
  "mapSpec",
  "mapReport",
  "arenaPool",
  // GH#332 —— 戰鬥鏡頭的滾輪縮放界線（owner 2026-08-15「最大視野減少兩節」）。
  "camera",
  "woundRules",
  // 虛弱規則 —— GH#301-4 新增的一頁（與 重創規則 同族，共用 ConfigDocPage）。
  "weaknessRules",
  "damageRules",
  // 批 1（稜彩卡計畫 2026-08-04）新增的一頁：增益卡上「敵方英雄」在殭屍波裡
  // 算不算數。與 護盾規則／格擋規則 同一族，共用 ConfigDocPage。
  "augmentEnemyFilter",
  "stealthRules",
  "tauntRules",
  "bodyScale",
  "regenRules",
  "arenaFire",
  "victoryFx",
  // 回合頒獎台 —— 2026-08-03 由 configDocCoverage 那條「到期條件」逼出來的新頁
  // （`resolveVictoryPodium` 有了 production 呼叫端，DEFERRED 那一列當場過期）。
  // 它和 對戰錄影 同一個理由列在這份基準裡：不列的話這條守衛會把「別人加的新頁」
  // 誤報成分類重編出錯。它留在「系統」，因為 owner 核准的四個新分類沒有點名它。
  "victoryPodium",
  "vfxForge",
  // ⭐ 2026-08-23 新增（GH#571 那一批的世界演出表）—— 這一列不是「搬丟了」，
  //    是**新頁**：基準線與 NAV 一起長，否則這條守衛就沒有比較對象。
  "worldCues",
  "mobWaves",
  "bossIntro",
  "itemDraft",
  "itemCard",
  // 新英雄轉生設計 —— owner 2026-08-13 核准的新頁（六步從出身生一張英雄卡，最後
  // 從鑄技工坊挑六格技能）。列在這裡的理由和 對戰錄影／回合頒獎台 一樣：不列的話
  // 這條守衛會把「新加的一頁」誤報成分類重編出錯。它住在 鑄技工坊 那一組。
  "heroForge",
  "serverOps",
  "dataMigration",
];

const navPages = (): Page[] => NAV.map((n) => n.page);

/** owner 2026-08-02 核准的四個新分類，以及他點名要搬進去的成員。 */
const APPROVED_MOVES: readonly { section: string; pages: readonly Page[] }[] = [
  {
    // ── ⭐ GH#775 AC3「無一組 > 20」—— 2026-08-31 第三次拆組 ───────────────────
    //   拆之前「系統」**30 列**。⛔ 一頁都沒刪,只搬。
    //   ⭐ 判準是**職責**,⛔ 不是「切成兩半」:這 20 列回答的是
    //   「**這一發看起來/聽起來怎麼樣**」(特效·演出·音訊·HUD·配色),
    //   而留在「系統」的是「**這台機器怎麼跑**」(運維·錄影·搬遷·練習·手把·導覽)。
    //   ⚠️ `itemCard` 刻意**不在這裡** —— 它是道具卡的排版,家在「武器道具」。
    section: "畫面·演出",
    pages: [
      "formVisuals",
      "modelLod",
      "weather",
      "vfxCleanup",
      "vfxScripts",
      "vfxBudget",
      "feelFx",
      "gore",
      "damageColors",
      "rangeGuide",
      "toggleAbility",
      "hudLayout",
      "voxelLook",
      "uiCues",
      "worldCues",
      "audioMix",
      "audioMap",
      "arenaFire",
      "victoryFx",
      "victoryPodium",
    ],
  },
  // 戰鬥系統 · 基礎加成 · 屬性上限 · 戰鬥手感 · 對戰設定 · 體型與射程
  // ⚠️ 2026-08-10 加入 cooldownRules —— 它刻意排在 statCaps 旁邊：owner 那一句
  //「cdr 天花板 0.99，但卡最低 0.1 秒」是**兩個**旋鈕，比率那一半在 statCaps，
  //  秒數那一半在 cooldownRules。分到兩個不同分類會讓操作者只找到一半。
  {
    section: "戰鬥規則",
    pages: [
      // ⚠️ 2026-08-26 owner「目前後台左測有些分類已經過長」⇒ 15 張五級距/數值頁
      // 搬去新分類「五級距·數值」（見下面那一列）—— 一頁都沒刪。
      "combatEnv",
      "cooldownRules",
      // GH#445 / #447 / #446 —— 四軸的第三、第四軸與它們反算出來的回魔地板。
      // 2026-08-21 owner「後台設定及說明⋯全部都是推導動態即時產生」——
      // ⭐ 五級距總覽（唯讀，卡面→實際）。它必須和上面四張級距頁同一區：
      // 分到別區的話，操作者調完一格之後要跨兩區才看得到它換算成幾秒。
      // 2026-08-22 owner #534 —— ⚠️ 不吃五級距的傷害節點（唯讀）。它必須和
      // tierOverview 同一區：那一頁說「級距表長這樣」，這一頁說「⛔ 但這幾十個
      // 節點不聽它的」，分到兩區等於把警告藏起來。
      // 2026-08-24 GH#682 / GH#683 —— owner 各逐字點名第二次的兩張唯讀清單
      //（詠唱>1秒／移速加成）。它們讀的是技能資料的推導表，所以住戰鬥規則區，
      // 緊鄰同為唯讀的 tierOverview / damageTierWarnings。
      "castTimeList",
      "msBuffList",
      "castTime",
      "mitigation",
      "mapSpec",
      "mapReport",
      "arenaPool",
      "camera",
      "combatFeel",
      "castApproach",
      "matchConfig",
      // 2026-08-20 GH#410 —— 競技場規則。⚠️ 它和 matchConfig 編的是**同一份**
      // `config/arena-rules.json`（那一頁管時鐘、這一頁管場上的東西），所以它
      // 必須和 matchConfig 同一區，⛔ 不是自成一區。
      "arenaTuning",
      "bodyScale",
      // 2026-08-17 —— 介面用語（Fate）。⚠️ 它不是戰鬥數值，但它調的是**抽卡與
      // 商店那幾個畫面**的文案，而那兩個畫面的其他旋鈕都在這一區；放進「系統」
      // 會讓操作者在改抽卡文案時要跨兩區找。
      "uiLexicon",
    ],
  },
  // 商店經濟 · 傳說武器池
  // ⭐ GH#775 AC3（2026-08-31）:itemCard 從「系統」搬來 —— 它是**道具卡的排版**,
  //   家在道具,⛔ 不是泛用的畫面設定。
  { section: "武器道具", pages: ["storeEconomy", "itemDraft", "itemCard"] },
  // 小怪波設定 · 殭屍王
  { section: "肉鴿殭屍", pages: ["mobWaves", "bossIntro"] },
  // 鑄技工坊（admin 裡的特效綁定那一頁；/editor/ 的本體是外部入口，見下面）
  // ⚠️ 2026-08-13 加入 heroForge —— 新英雄轉生設計的第⑤步就是在挑鑄技工坊裡的技能，
  //    所以它和特效綁定同一組，操作者會把兩頁一起用。
  { section: "鑄技工坊", pages: ["vfxForge", "heroForge"] },
  // ── 2026-08-26 owner「目前後台左測有些分類已經過長」⇒ 再拆兩組 ──────────────
  // 拆之前：戰鬥規則 31 列、系統 36 列。判準：五級距/正規化是「數值的形狀」一族，
  // 狀態規則是「一種狀態一頁」一族 —— 使用者心裡有名字，⛔ 不必掃 31 列。
  {
    section: "五級距·數值",
    pages: [
      "baseBonus",
      "statCaps",
      "aoeTiers",
      "rangeTiers",
      "cooldownTiers",
      "damageTiers",
      "manaTiers",
      "castTimeTiers",
      "apCoefficient",
      "rankGrowth",
      "oneShotClamp",
      "speedGrowthTiers",
      // 2026-08-27 GH#789：移速**加成**五級距 —— 與成長那一頁同族（同一組級距名），
      // 一頁管「每級長多快」，這一頁管「buff／道具／增益卡一次加多少 %」。
      "moveSpeedTiers",
      "skillNormalize",
      "manaEconomy",
      "tierOverview",
      "damageTierWarnings",
      "statNormalization",
      "displacementTiers",
      "perLevelBonus",
    ],
  },
  {
    section: "狀態規則",
    pages: [
      "shieldRules",
      "blockRules",
      "critRules",
      "berserkRules",
      "dispelRules",
      "woundRules",
      "weaknessRules",
      "damageRules",
      "apDamageScaling",
      "augmentEnemyFilter",
      "stealthRules",
      "tauntRules",
      "regenRules",
    ],
  },
];

describe("分類重編一頁都沒有掉", () => {
  it("重編後可到達的頁面集合，與重編前逐一相等（雙向）", () => {
    cover(TAG);
    const before = new Set<string>(BASELINE_PAGES);
    const after = new Set<string>(navPages());
    const lost = [...before].filter((p) => !after.has(p));
    // 基準線之後**刻意**新增的頁。⛔ 不改 BASELINE_PAGES —— 那是「重編那一刻」
    // 的快照，動它會讓這條守衛失去它比較的那個時間點。新頁走這張明示的清單，
    // 一列一個看得見的決定（同 configDocCoverage 的豁免表精神）。
    const SINCE_BASELINE = new Set<string>([
      // 🗺 2026-08-26 GH#776：導覽地圖。owner「後台左側選項已經太長 不容易尋找、
      // 閱覽及管理」—— 左欄是一條線，這一頁是一個平面（11 組 treemap＋覆蓋層徽章）。
      // ⚠️ 它自己也是一列 —— 但它是**入口**，不是第 122 個要掃過去的項目。
      "navMap",
      // 🧑‍⚖️ 2026-08-27 GH#669/#785：一頁批次後台驗收。owner「你還是沒告訴我去
      // 後台哪裡審查」—— 在此之前它**不在後台**（只活在 client dev server）。
      "featureReview",
      // 📥 2026-09-02 GH#908 / owner 2026-09-01：「所有技能效果機制動畫特效由 AI
      // 來調整變更都要經過**後台一頁批核審查頁 通過才能套用**」。
      // ⭐ 與上一列的預設**相反**：那一頁先上線事後否決，這一頁先不上線通過才套用。
      "submissionsReview",
      // 圖示工坊 (owner 2026-08-17「動態單個/批次產生的功能頁」)。
      "iconWorkshop",
      // 2026-08-17：介面用語（Fate）—— owner「這些替換的介面提示等用語，
      // 應該是一個 JSON 檔，可以在後台替換設定」。
      "uiLexicon",
      // 2026-08-17 GH#336：英雄上下架。⚠️ 它補的是一個**存在已久的洞** ——
      // `configDocCoverage` 一直把 `config.roster@1` 記成 KNOWN_GAP
      //（「apps/admin/src 對 roster / retiredChampions 零引用」），
      // 而那份 JSON 自己的 note 卻寫著「不用改程式、不用重新部署」。
      "roster",
      // 2026-08-17 GH#339：混音（其他角色的語音音量倍率）。
      "audioMix",
      // 🔊 音訊對照表（GH#806）—— 緊接在 混音 後面：那一頁調匯流排，這一頁調逐一顆音。
      "audioMap",
      // 2026-08-17 GH#343：練習模式（總開關 + 五格行為）。
      "practice",
      // 2026-08-17：圖示風格（地端兩階段產圖器的 PASS-2 風格與參數）。
      // ⚠️ 它是 authoring-time 的設定，消費端是 Python 不是遊戲。
      "iconStyle",
      // 2026-08-17：排名獎勵（真人倍率進 MMR／賽季積分 + 宿敵加成）。
      // ⚠️ 它住「營運」不是「戰鬥規則」：那一區問的是英雄在場上多強，
      // 這一頁決定的是打完之後排行榜怎麼動。消費端是 Go（platform）。
      "ranking",
      // 2026-08-18 GH#376：範圍指引與預告（hold/hover 的兩個圈 + #228 三條
      // 地面預告通道）。⚠️ 它補的是 GH#367 誠實留下的那張帳單 —— 那六個旋鈕
      // 當時只收斂成一個具名物件，還住在程式裡。
      "rangeGuide",
      // 2026-08-22 GH#546：開關型技能的「開啟中」外觀（圖示流轉）。
      // ⭐ owner：「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**」——
      // ⚠️ 在此之前「開著」與「單純冷卻好了」在畫面上**長得一模一樣**，
      // 而那一半（手部跟隨特效）走 `ability@1.persistentVfx`，⛔ 不在這一頁。
      "toggleAbility",
      // 2026-08-20 GH#410：競技場規則。⚠️ 它補的是一個**結構性**的洞 ——
      // `config.arena-rules@1` 走的是 configDocCoverage 的**文件層**豁免
      // （三頁專屬頁），而文件層豁免一旦成立，欄位層就沒有任何守衛在數，
      // 於是八個頂層區塊（治療花／復活圈／守護塔／掉金／overflow／回合表／
      // 大絕與 EX 解鎖回合）一格都調不到，而且沒有任何測試會紅。
      "arenaTuning",
      // 2026-08-20 GH#445 / #447 / #446：冷卻五級距、傷害五級距、回魔地板。
      // ⚠️ 三頁一起加是刻意的 —— owner 2026-08-19 的那三張單是**同一次反算**
      // 出來的（單體極小 6 卡面秒 = 1.2 實際秒 → 20 次殺死 → 傷害下限 →
      // 耗魔與回魔），⛔ 分開調任何一格都會讓另外兩格的推導失效。
      "cooldownTiers",
      "damageTiers",
      "manaEconomy",
      // 2026-08-21：耗魔五級距 —— 五軸的**最後一軸**。⚠️ 它補的洞與上面三頁
      // 同型但更徹底：`ability@1` 上根本沒有 `manaCostTier` 一格，所以另外四軸
      // 各有 96–350 支填了級別，而這一軸是 **0 支**。
      "manaTiers",
      "castTimeTiers",
      "apCoefficient",
      "rankGrowth",
      "oneShotClamp",
      // 2026-08-21：移速／攻速的每級成長五級距。⚠️ 它與上面四頁的起點相反 ——
      // 那些是「216 支各帶一個自由數字」，這一軸是「49 位共用一個常數」
      // （ms 成長全部 0、as 全部 0.02），所以它開的是一個今天不存在的維度。
      "speedGrowthTiers",
      // 2026-08-21：技能正規化決策點 —— owner「決策點一律做成後台開關，
      // 預設 = 你的建議」。⚠️ 它是這一區裡唯一一頁 **authoring-time** 的設定
      // （決定閘怎麼問），但它必須和五張級距頁同一區：九格裡有一格直接決定
      // 「哪些傷害葉會被收進級距」，改它等於改上面那張傷害表的作用範圍。
      "skillNormalize",
      // 2026-08-21：五級距總覽。⚠️ 它和上面三頁不同 —— 它**不編輯任何文件**，
      // 所以它也不在 SESSION_REQUIRED_PAGES 裡（唯讀主控台，同 hub / modelBudget）。
      "tierOverview",
      // 2026-08-21 GH#492：大廳集合令（廣播確認視窗 / 倒數秒數 / 一鍵開打走不走
      // 集合令 / 玩家名冊要不要出現）。⭐ owner 明說死的只有「最多等 10 秒」，
      // 其餘七格是決策點 —— 而決策點就是第一守則要做成欄位的東西。
      "lobbyRally",
      // 2026-08-22 GH#520：手把手感（死區／兩個前導距離／搜敵半徑／長按門檻）。
      // 五格在此之前是 `input/GamepadInput.ts` 的 module-level 常數 —— 調一格要
      // 重建 client 映像。⭐ 出貨值逐字等於那五個常數，這一頁上線當天手感零改動。
      "gamepad",
      // 2026-08-21 GH#499：管理員預設好友。⭐ owner「所有人預設都會加管理員帳號
      // 為好友」「管理員是強制雙向 不必請求」。⚠️ 它住「營運」而不是「系統」：
      // 那一格改的是**每一個帳號**的社交圖與「誰看得到全站的在線狀態」，
      // 一個字都不影響任何一場比賽。消費端是 Go（platform）。
      "adminFriend",
      // ⚠️ 2026-08-21 順手補上的基準線缺口：`apDamageScaling` 早就在 NAV 上，
      // 而這份基準沒跟上，所以這條守衛從那次起就一直是紅的（它擋不了任何東西）。
      // ⛔ 這一列不是新頁，是把基準線補回可以比較的狀態。
      "apDamageScaling",
      // 2026-08-22 owner #534「①②③ 作為例外在後台跳出警告就好」——
      // ⚠️ 不吃五級距的傷害節點。⭐ 它補的是第〇·四守則**唯一的例外**在畫面上
      // 沒有住處：豁免只寫在一份 JSON 裡的話，級距一改它們原地不動，而
      // `content:build` 與全套測試都是綠的。
      "damageTierWarnings",
      // 2026-08-23 GH#576 / GH#573（commit 6410d79c）：畫面提示。⭐ 三格看起來
      // 不相干（白色魔法陣／被動觸發閃圖示／集合令「再多等一分鐘」），但它們回答的
      // 是**同一個**問題：一件事真的發生了，畫面上有沒有東西說出來。
      // ⚠️ 它住「系統」而不是「範圍指引與預告」：那一頁決定圈畫多大，這一頁決定
      // 圈長什麼樣子 —— 而白色魔法陣那兩格是**樣式**，三條通道的顏色仍在那一頁。
      // ⭐ HUD 底部版面 —— 2026-08-30 新增的一頁（GH#873）。
  //   ⛔ 它不是「多做一頁」：#873 的 AC3 要一格後台開關，而複驗量到
  //   `applyHudClusterOverride` 的**生產呼叫端是零** ⇒ 那格旋鈕**轉不到**。
  //   ⇒ ⭐ 一格轉不到的旋鈕不是 rollback 開關（owner 常設：「留後台開關可以簡易 rollback」）。
  //   ⭐ 基準線跟著 NAV 在**同一個 commit** 裡動，那正是這條守衛要的東西。
  "hudLayout",
  "voxelLook",
  "uiCues",
      // 2026-08-23 GH#610 第二批：場地天氣（`config/weather.json`）—— 逐場地的
      // 濕地面／積水／閃電打光／霧濃度，以及 owner 2026-08-23「有些場景是**室內**，
      // 請**不要下雨**」的那一格（`arenas` 逐場地 preset）。
      // ⚠️ 它住「系統」而不是「戰鬥規則」：⛔ 沒有一格會改變任何碰撞、視野或傷害
      // （積水沒有實體、霧只是渲染），所以它問的是畫面長什麼樣，不是誰比較強。
      "weather",
  // 手把操作版本（GH#863）—— owner 2026-08-28「當作 v4 後台可切換的其中一種手把操作版本」。
      "controllerScheme",
      // 2026-08-24 GH#682 / GH#683：詠唱>1秒清單 ＋ 移速加成清單 —— 兩頁唯讀，
      // 資料與 docs 的兩份 md 共用 `tools/skill-lists/lists.json` 同一次計算。
      "castTimeList",
      "msBuffList",
      // 2026-08-27 GH#789：移速**加成**五級距（owner「%轉換為五級距⋯0.1~4」）——
      // #683 清單頁的「表那一格」就住在這裡（msBonusTier → 五格解析值）。
      "moveSpeedTiers",
    ]);
    const added = [...after].filter((p) => !before.has(p) && !SINCE_BASELINE.has(p));
    expect(lost, `搬家把這些頁面弄丟了（元件還在，但左欄按不到）：${lost.join(", ")}`).toEqual([]);
    expect(
      added,
      `NAV 多了基準線沒有的頁面：${added.join(", ")}。這不一定是錯，但要連同 BASELINE_PAGES 一起更新，否則這條守衛就失去比較對象。`,
    ).toEqual([]);
  });

  it("沒有任何一頁被列兩次（複製貼上搬家的典型後果）", () => {
    cover(TAG);
    const pages = navPages();
    expect(new Set(pages).size, "NAV 裡有重複的 page").toBe(pages.length);
  });

  it("owner 核准的四個新分類，成員逐一對得上", () => {
    cover(TAG);
    for (const { section, pages } of APPROVED_MOVES) {
      const actual = NAV.filter((n) => n.section === section).map((n) => n.page);
      expect(actual.sort(), `「${section}」的成員和 owner 核准的分法不一致`).toEqual([...pages].sort());
    }
  });

  it("每一列的分組都在 SECTION_ORDER 裡（打錯字的分組會被排到最後，不是消失）", () => {
    cover(TAG);
    const known = new Set(SECTION_ORDER);
    const strays = NAV.filter((n) => !known.has(n.section)).map((n) => `${n.page}→${n.section}`);
    expect(strays, `這些列的分組不在 SECTION_ORDER 裡：${strays.join(", ")}`).toEqual([]);
  });

  it("「系統」沒有把搬出去的頁面收回來 —— 這次重編的目的就是這件事", () => {
    cover(TAG);
    // ⚠️ 這一條原本是 `sys.length < 26`（重編前的列數）。那是一個**會過期的絕對
    // 數字**：後來每加一頁真正屬於系統的設定（GH#339 混音、GH#343 練習模式）
    // 它就會紅，而訊息會說「分類搬走了但成員沒跟著走」—— 一個與缺陷無關的謊。
    // ⇒ 改成守真正的性質：**被搬走的那些頁，一頁都不可以回到「系統」**。
    // 它擋得住真正的回歸（有人把 storeEconomy 改回 SEC_SYS），而且加新的系統頁
    // 不會誤報。
    const sys = new Set(NAV.filter((n) => n.section === "系統").map((n) => n.page));
    const movedOut = APPROVED_MOVES.flatMap((m) => m.pages);
    const backInSys = movedOut.filter((p) => sys.has(p));
    expect(backInSys, `這些頁被搬出「系統」之後又跑回去了：${backInSys.join(", ")}`).toEqual([]);
  });
});

describe("/editor/ 的鑄技工坊是一個誠實的外部入口，不是死連結也不是假搬家", () => {
  it("它有真的網址與一句說明，而且刻意不是一個 Page 路由", () => {
    cover(TAG);
    const links = externalRows();
    expect(links.length).toBeGreaterThan(0);
    const forge = links.find((l) => l.key === "forgeStudioExternal");
    expect(forge, "鑄技工坊的外部入口不見了").toBeDefined();
    expect(forge!.href.length, "href 是空的 —— 那就是一個死連結").toBeGreaterThan(0);
    expect(forge!.href).toMatch(/editor/);
    // 說明必須說出「它還在外面」，否則 owner 會以為 #272 搬完了。
    expect(forge!.note).toContain("/editor/");
    expect(forge!.note).toContain("尚未搬進");
    expect(forge!.section).toBe("鑄技工坊");
    // 對照組：它沒有偷偷變成一個沒有元件的路由（那會是「點下去一片空白」）。
    expect(navPages()).not.toContain("forgeStudioExternal" as Page);
  });
});

describe("收納直接決定「點得到什麼」", () => {
  const rows = (): NavRow[] => [...NAV, ...externalRows()];

  it("全部展開時，可到達集合 = NAV 全部", () => {
    cover(TAG);
    const visible = visibleRows(rows(), new Set(), "hub");
    const pages = visible.filter(isNavItem).map((n) => n.page);
    expect(new Set(pages)).toEqual(new Set(navPages()));
  });

  it("收起一組 = 剛好少掉那一組的成員，其他一個都不少", () => {
    cover(TAG);
    const all = rows();
    const collapsed = new Set(["戰鬥規則"]);
    const visible = visibleRows(all, collapsed, "hub").filter(isNavItem).map((n) => n.page);
    const expected = navPages().filter((p) => NAV.find((n) => n.page === p)!.section !== "戰鬥規則");
    expect(new Set(visible)).toEqual(new Set(expected));
    // 方向斷言：那一組真的不見了（少了這一行，一個「collapsed 永遠被忽略」的實作
    // 也會讓上面那條過 —— 因為 expected 會等於全部）。
    // ⚠️ 少掉幾頁**從 NAV 推導**，不抄 6 —— 這一組會長大（2026-08-10 加了
    //    冷卻規則），抄字面值的那一版會用「收納壞了」的訊息紅。
    const combatCount = NAV.filter((n) => n.section === "戰鬥規則").length;
    expect(visible).not.toContain("combatEnv");
    expect(visible.length).toBe(navPages().length - combatCount);
  });

  it("目前所在的那一組就算被收起來也還是看得到自己", () => {
    cover(TAG);
    const visible = visibleRows(rows(), new Set(["戰鬥規則"]), "combatEnv")
      .filter(isNavItem)
      .map((n) => n.page);
    expect(visible, "站在一個被收起來的分組裡卻看不到它 —— 操作者會以為頁面沒了").toContain("combatEnv");
  });

  it("分組是算出來的，所以同一個標題不會被印兩次", () => {
    cover(TAG);
    const groups = groupRows(rows(), SECTION_ORDER);
    const names = groups.map((g) => g.section);
    expect(new Set(names).size).toBe(names.length);
    // 而且分組不會吃掉任何一列。
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(rows().length);
  });
});
