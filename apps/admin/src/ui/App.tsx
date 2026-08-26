/** App shell — boot → login → console with a left nav rail. */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { pageRequiresSession, useApp, type Page } from "../store";
// GH#493 —— 外框的捲動版型與「切頁回頂」。抽成模組是為了讓守衛驗**關係**
// （有界高度 ⇒ 一定捲得動、右欄永遠不是 hidden），⛔ 不是掃一串字面樣式。
import { resetContentScroll, shellScrollLayout } from "./shellLayout";
import { LoginScreen } from "./LoginScreen";
import { ConsoleHub } from "./ConsoleHub";
import { ApprovalsPage } from "./ApprovalsPage";
// Quick Approval (task #242) — a PLAIN, EAGER, TOP-LEVEL import, on purpose.
// The 內容管理 suite below is reached through an `import.meta.env.DEV`-guarded
// dynamic import so rollup can prove it unreachable and never emit it; this page
// must be the exact opposite. Its whole reason to exist is the owner clearing
// approvals from ggd.adms.ai on a phone — a Quick Approval that only exists on
// localhost is the very problem it was asked to fix. quickApprovalBundle.test.ts
// fails if this line ever moves under a DEV gate or the label leaves the bundle.
import { QuickApprovalPage } from "./QuickApprovalPage";
import { PlayersPage } from "./PlayersPage";
import { MatchesPage } from "./MatchesPage";
import { ReplaysPage } from "./ReplaysPage";
import { DamageBoardPage } from "../damageBoardPage";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { CurationPage } from "./CurationPage";
import { ContentOverlayPage } from "./ContentOverlayPage";
import { CombatEnvPage } from "./CombatEnvPage";
// 殭屍波系統 (task #215's config surface) — EAGER, like 內容覆蓋層 / 體素鑄造廠
// and for the same reason: its save is a platform admin `putOverlayDoc`, so it
// is safe in production BY AUTHORISATION and must exist in the production
// bundle. A zombie-tuning page that only runs on localhost cannot tune the host
// the family actually plays on. mobWaves.test.ts fails if this line ever moves
// under a DEV gate or the nav label leaves the shell.
import { MobWavesPage } from "./MobWavesPage";
// 傳說武器三選一 (GH#249) — EAGER, same reason as 殭屍波系統 above: its save is a
// platform admin `putOverlayDoc` into the SAME arena-rules doc, so it is safe in
// production BY AUTHORISATION and must exist in the production bundle. A draft
// page that only runs on localhost cannot tune the host the family plays on.
import { ItemDraftPage } from "./ItemDraftPage";
import { ServerOpsPage } from "./ServerOpsPage";
import { AiSettingsPage } from "./AiSettingsPage";
import { ModelBudgetPage } from "./ModelBudgetPage";
import { TierOverviewPage } from "./TierOverviewPage";
import { DamageTierWarningsPage } from "../damageTierWarnings";
import { CastTimeListPage, MoveSpeedListPage } from "./SkillListsPage";
// 🔍 GH#776 —— 121 頁沒有搜尋。指令面板（⌘K）＋導覽地圖是「尋找／閱覽」那兩半。
import { CommandPalette, usePaletteHotkey } from "./CommandPalette";
import { NavMapPage } from "./NavMapPage";
import { IconTrackingPage } from "./IconTrackingPage";
import { VoxelSkinSheetPage } from "./VoxelSkinSheetPage";
// 體素鑄造廠 (task #229) — EAGER, like Quick Approval and for the same reason.
// The 鑄形工坊 studio lives in the DEV chunk below and is enforced ABSENT from a
// production build by contentGate.test.ts (it drags Babylon in), which means the
// owner has never been able to open a voxel generator on the host he actually
// uses. This page is the production-shippable one: no Babylon, writes through
// the platform overlay, and it emits the real .glb in the browser.
// voxelFoundryBundle.test.ts fails if this line moves under a DEV gate.
import { VoxelFoundryPage } from "./VoxelFoundryPage";
// 體素條碼 (特徵生成 batch one) — EAGER, third page in the same family and for
// the same reason: its save is a platform `putOverlayDoc`, so it is safe in
// production BY AUTHORISATION and must exist in the production bundle. It also
// costs the bundle nothing extra — the page renders its preview as a stack of
// coloured divs and imports no graphics code at all.
// voxelBarcodeBundle.test.ts fails if this line moves under a DEV gate.
import { VoxelBarcodePage } from "./VoxelBarcodePage";
// 體素身體 (GH#31) — EAGER, same family as 體素條碼 / 體素鑄造廠 and for the same
// reason: a lazy chunk that never loads is indistinguishable from a page that
// does not exist, and this one is the switch the owner was told to use.
import { VoxelBodyPage } from "./VoxelBodyPage";
import { BaseBonusPage } from "./BaseBonusPage";
import { FormVisualsPage } from "./FormVisualsPage";
import { StatCapsPage } from "./StatCapsPage";
// 戰鬥手感 / 對戰設定 — EAGER, same family as 屬性上限 / 基礎加成 and for the same
// reason: both save through `putOverlayDoc`, the platform's admin-only durable
// data/ overlay, so they are safe in production BY AUTHORISATION and must exist
// in the production bundle. 戰鬥手感 in particular carries the one switch the
// owner has not ruled on yet (卡住就自動接敵) — a page that only exists on
// localhost cannot be the place he rules on it.
import { CombatFeelPage } from "./CombatFeelPage";
import { MatchConfigPage } from "./MatchConfigPage";
import { StoreEconomyPage } from "./StoreEconomyPage";
// 英雄上下架 (GH#336) —— `config/roster.json` 的下架 / 隱藏兩張清單。在它之前
// 這份文件是 apps/admin/src 全樹零引用的（configDocCoverage 的 KNOWN_GAP 那一列）。
import { RosterPage } from "./RosterPage";
import { ConfigDocPage } from "./ConfigDocPage";
import { IconWorkshopPage } from "./IconWorkshopPage";
import { MapReportPage } from "./MapReportPage";
import { ArenaPoolPage } from "./ArenaPoolPage";
import { specForPage } from "../configForms";
// 📈 GH#790 —— 每級加成：record 形狀（鍵=屬性 id）通用引擎列不出，同 StatCaps 開專頁。
import { PerLevelBonusPage } from "./PerLevelBonusPage";
// 🧑‍⚖️ GH#669/#785 —— 一頁批次後台驗收（連續圖片＋一鍵否決＋必填原因）。
import { FeatureReviewPage } from "./FeatureReviewPage";
import { VfxForgePage } from "./VfxForgePage";
import { HeroForgePage } from "./HeroForgePage";
import { MCoinGrantPage } from "./MCoinGrantPage";
import { InvitesPage } from "./InvitesPage";
import { AuditPage } from "./AuditPage";
// #243 資料搬遷. A STATIC top-level import, deliberately: the two dev-gated
// pages below reach their modules through `if (!import.meta.env.DEV) return;`
// + a dynamic import, which rollup dead-folds out of a production build. A
// migration tool that only exists on localhost cannot migrate a host, so this
// one must be in the production bundle — see migrationGate.test.ts, which
// fails if it ever leaves.
import { DataMigrationPage } from "./DataMigrationPage";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Btn, Panel } from "./widgets";
import { ACCENT, BG, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { resolveHubLinks, type HubEnv } from "../config";
import {
  allSections,
  groupRows,
  isNavItem,
  isSectionOpen,
  loadCollapsed,
  rowKey,
  saveCollapsed,
  sectionOfPage,
  toggleCollapsed,
  type NavItem,
  type NavLink,
  type NavPrefStore,
  type NavRow,
} from "./navGroups";

// The owner's four-section back-office (directive 2026-07-25). Every EXISTING
// route stays reachable — this only regroups + adds. The dev-only 內容·素材管理
// content routes (audio / champions / newHero / abilities / items / vfx /
// arenas) and 角色語音生成 are SPLICED IN by name from their dev chunk (see the
// hooks below), so a production build simply shows this section with only its
// always-present member (內容白名單) under it.
const SEC_OPS = "營運";
const SEC_CONTENT = "內容·素材管理";
const SEC_ASSETS = "資產產線";
// ── owner 2026-08-02 的四個新分類（「照你的分法」）────────────────────────────
// 在它們出現之前「系統」一組有 26 列，佔了整條左欄的一半以上，而且裡面同時住著
// 倍率表、畫質開關、殭屍節奏與運維工具 —— 想改攻速上限的人要在 26 列裡逐字掃。
// 這四組不新增也不刪除任何一頁，只是把既有的搬出來（navSections.test.ts 逐一比對
// 搬家前後「可到達的頁面集合」，漏一頁就紅）。
const SEC_COMBAT = "戰鬥規則";
// ── owner 2026-08-26「目前後台左測有些分類已經過長」⇒ 再拆兩組 ─────────────────
// 拆之前：戰鬥規則 31 列、系統 36 列。⛔ 一頁都不刪，只搬（navSections.test.ts 的
// APPROVED_MOVES 逐一比對）。判準：五級距/正規化那一族是「數值的形狀」，
// 狀態規則那一族是「一種狀態一頁」—— 兩族的使用者心裡都有名字，掃 31 列是浪費他的眼睛。
const SEC_TIERS = "五級距·數值";
const SEC_STATUS = "狀態規則";
const SEC_ITEMS = "武器道具";
const SEC_MOBS = "肉鴿殭屍";
const SEC_FORGE = "鑄技工坊";
const SEC_SYS = "系統";

/**
 * 左欄由上到下的分組順序。
 *
 * 分組現在是**算出來的**（`groupRows`）而不是靠 NAV 陣列裡剛好連在一起 —— 少了這
 * 一層，把一列搬到別組時忘了同時搬它的位置，畫面上會出現同一個標題印兩次。
 * ⚠️ 這張表沒列到的分組不會消失，只會被排到最後（見 `groupRows` 的註解）。
 */
export const SECTION_ORDER: readonly string[] = [
  SEC_OPS,
  SEC_CONTENT,
  SEC_ASSETS,
  SEC_COMBAT,
  SEC_TIERS,
  SEC_STATUS,
  SEC_ITEMS,
  SEC_MOBS,
  SEC_FORGE,
  SEC_SYS,
  // 🔴 dev-only LIVE 對照·視覺化（GH#775 的 13 頁 —— chunk 自帶 label）
  "技能對照·視覺化",
];

export const NAV: NavItem[] = [
  // 營運 — session-gated player/operations surfaces. 帳號審核 leads (task #126):
  // it is the one page with real people waiting, and it carries the pending badge.
  { page: "approvals", label: "帳號審核", emoji: "🛂", section: SEC_OPS },
  // Quick Approval (task #242) — everything that is waiting on the OWNER
  // specifically, on one page with one submit. Sits next to 帳號審核 because it
  // is the same job (clear what is blocked on a decision) at a wider scope: the
  // account queue is one of its rows, and every other row deep-links to the page
  // that actually owns that thing. This page owns no state of its own.
  { page: "quickApproval", label: "Quick Approval", emoji: "🚦", section: SEC_OPS },
  { page: "players", label: "Players", emoji: "👤", section: SEC_OPS },
  // 管理員預設好友 (GH#499「所有人預設都會加管理員帳號為好友」) —— 緊接在 Players
  // 後面，因為它改的是**每一個帳號**的社交圖，不是任何一場比賽。⚠️ 它的消費端是
  // Go 平台（`internal/friend/adminfriend.go`），存檔就生效。
  { page: "adminFriend", label: "管理員預設好友", emoji: "🤝", section: SEC_OPS },
  { page: "matches", label: "Matches", emoji: "⚔️", section: SEC_OPS },
  // 排名獎勵 (owner 2026-08-17「MMR 倍率跟賽季積分也是類似的規則」) —— 一場比賽
  // 值多少 MMR／賽季積分。⚠️ 放「營運」而**不是**「戰鬥規則」是刻意的：那一區問
  // 的是「英雄在場上多強」，這一頁一個字都不影響場上，它決定的是**打完之後排行榜
  // 怎麼動** —— 跟 Matches／M幣 發放 同一類（玩家帳上的東西）。緊接在 Matches 後面，
  // 因為它調的就是那一頁每一列產出的東西。
  { page: "ranking", label: "排名獎勵", emoji: "🏅", section: SEC_OPS },
  { page: "replays", label: "對戰回放", emoji: "🎞️", section: SEC_OPS },
  { page: "damageBoard", label: "傷害排行榜", emoji: "💥", section: SEC_OPS },
  { page: "announcements", label: "Announcements", emoji: "📢", section: SEC_OPS },
  { page: "mcoinGrant", label: "M幣 發放", emoji: "🪙", section: SEC_OPS },
  // #174: the private deploy's front door — mint a code, see who used it.
  { page: "invites", label: "邀請碼", emoji: "🎟️", section: SEC_OPS },
  { page: "audit", label: "Audit log", emoji: "📜", section: SEC_OPS },
  // GH#326 —— 一份壞文件要不要殺掉整份內容。⚠️ 它屬於「營運」而不是「內容」或
  // 「系統」:它管的不是內容**是什麼**,是內容**載不進來的時候怎麼辦** —— 跟
  // Audit log 一樣是出事之後才會被打開的那一類。
  { page: "contentLoad", label: "內容載入政策", emoji: "🧯", section: SEC_OPS },
  // GH#327 —— 外部編輯器建包時的原則界。⚠️ 放營運:它管的是「別人送進來的東西」
  // 該被怎麼看待,跟 Audit log / 內容載入政策 同一類。
  { page: "authoringRules", label: "編輯器創作規則", emoji: "📐", section: SEC_OPS },
  // GH#480 —— 建立新英雄時「存檔當下」要跳哪幾條警示。⚠️ 緊接在 編輯器創作規則
  // 後面是刻意的：那一頁是規則的**內容**（冷卻該落在哪個區間），這一頁是規則的
  // **開關**（那一條要不要跳）。分開兩頁而相鄰，操作者才分得出自己在改哪一層。
  { page: "newHeroChecks", label: "新英雄檢查警示", emoji: "🚨", section: SEC_OPS },
  // 內容·素材管理 — the dev content routes + 角色語音生成 splice in AFTER audit and
  // BEFORE this always-present member, so the whole section reads contiguously.
  { page: "curation", label: "內容白名單", emoji: "✅", section: SEC_CONTENT },
  // 英雄上下架 (GH#336) —— 下架（誰都拿不到）與隱藏（彩蛋：隨機抽得到、選不到）。
  // ⚠️ 放在 內容白名單 旁邊而**不是**「武器道具」：它編的是 `config/roster.json`
  // 裡的兩張英雄 id 清單，跟白名單是同一類問題（**這位英雄存不存在於這個安裝**），
  // 而武器道具那一區問的是「玩家要打幾場才買得起」。
  { page: "roster", label: "英雄上下架", emoji: "🎭", section: SEC_CONTENT },
  // #189 — the one content-editing route that EXISTS IN A PRODUCTION BUILD.
  // It writes to the platform's durable data/ overlay (admin JWT + audited),
  // never to the loopback content-api, so it needs no dev gate and is the only
  // way to change content on the deployed host.
  { page: "contentOverlay", label: "內容覆蓋層", emoji: "🗂", section: SEC_CONTENT },
  // 資產產線 — the asset consoles (task #102). They RENDER measurements published
  // by #99 (models) and #97/#101 (icons); neither counts anything itself.
  { page: "ai", label: "AI 生成設定", emoji: "🤖", section: SEC_ASSETS },
  { page: "modelBudget", label: "模型預算", emoji: "📐", section: SEC_ASSETS },
  { page: "iconTracking", label: "ICON 生成追蹤", emoji: "🖼️", section: SEC_ASSETS },
  // task #231 — the 驗收 contact sheet for the generated per-champion voxel
  // skins. Sits beside its asset-review siblings because that is where the
  // owner already goes to approve art.
  { page: "voxelSkins", label: "體素外觀對照表", emoji: "🧱", section: SEC_ASSETS },
  // task #229 — the generator itself, next to the sheet that reviews its output.
  // The label is written HERE, in the eager shell, which is exactly what makes
  // it survive `vite build`; the dev studio's label travels with its chunk and
  // does not.
  { page: "voxelForge", label: "體素鑄造廠", emoji: "🧰", section: SEC_ASSETS },
  // 特徵生成 batch one — the 11-slot colour barcode that says WHO a champion is
  // (黃髮／膚／黑西裝／黑鞋). Sits next to the two pages that consume it: the
  // 鑄造廠 bakes figures and the 對照表 reviews them. The label is written HERE,
  // in the eager shell, which is what makes it survive `vite build`.
  { page: "voxelBarcode", label: "體素條碼", emoji: "🎨", section: SEC_ASSETS },
  { page: "voxelBody", label: "體素身體", emoji: "🧍", section: SEC_ASSETS },
  // ── 戰鬥規則 (owner 2026-08-02) ────────────────────────────────────────────
  // 「一位英雄站上場的時候有多強」的全部六頁,而且它們是六種**不同的語意**:
  // 倍率(戰鬥系統) / 加數(基礎加成) / 天花板(屬性上限) / 規則參數(戰鬥手感) /
  // 一場的時鐘(對戰設定) / 一條公式(體型與射程)。相鄰就是警告 —— 填的 4.0
  // 在哪一頁代表什麼,靠的就是它上面那個標題。
  { page: "combatEnv", label: "戰鬥系統", emoji: "⚖️", section: SEC_COMBAT },
  // 基礎加成 — sits right after 戰鬥系統 because it is the OTHER half of the same
  // question, and the adjacency is the warning: that page holds MULTIPLIERS,
  // this one holds FLAT GRANTS that deliberately escape them.
  { page: "baseBonus", label: "基礎加成", emoji: "➕", section: SEC_TIERS },
  // 屬性上限 — 這三頁是同一個問題的三個面:戰鬥系統 = 倍率,基礎加成 = 加數,
  // 這一頁 = 天花板(以及技能能把天花板抬到哪)。相鄰就是警告。
  { page: "statCaps", label: "屬性上限", emoji: "⛰️", section: SEC_TIERS },
  { page: "cooldownRules", label: "冷卻規則", emoji: "⏱", section: SEC_COMBAT },
  { page: "aoeTiers", label: "AoE 範圍五級距", emoji: "◎", section: SEC_TIERS },
  // 施法距離五級距 (GH#414)。緊鄰 AoE —— 同一條梯子的兩個視窗。
  { page: "rangeTiers", label: "施法距離五級距", emoji: "➶", section: SEC_TIERS },
  // 冷卻 (GH#445) 與傷害 (GH#447) 五級距。緊鄰 AoE／施法距離 —— 四軸是一組尺，
  // 而 GH#465 的相稱性規則把「成本兩軸」與「回報一軸」綁在一起，⛔ 不可以分開調。
  { page: "cooldownTiers", label: "冷卻五級距", emoji: "⏲", section: SEC_TIERS },
  { page: "damageTiers", label: "傷害五級距", emoji: "💥", section: SEC_TIERS },
  { page: "manaTiers", label: "耗魔五級距", emoji: "🔷", section: SEC_TIERS },
  // 移速／攻速的**每級成長**五級距 (2026-08-21)。緊鄰上面五軸 —— 同一組級距名、
  // 同一個「級別住內容、數字住 config」的形狀，只是它掛在**英雄卡**上不是技能。
  { page: "speedGrowthTiers", label: "速度成長五級距", emoji: "🏃", section: SEC_TIERS },
  // 移速**加成**五級距 (GH#789)。緊鄰成長那一頁 —— 同一組級距名，一頁管「每級長多快」，
  // 這一頁管「buff／道具／增益卡一次加多少 %」。
  { page: "moveSpeedTiers", label: "移速加成五級距", emoji: "💨", section: SEC_TIERS },
  { page: "skillNormalize", label: "技能正規化決策點", emoji: "🧮", section: SEC_TIERS },
  // 回魔地板 (GH#446)。緊鄰上面兩頁：owner 那三張單是同一次反算出來的。
  { page: "manaEconomy", label: "魔力經濟（建議滿魔時間）", emoji: "🔵", section: SEC_TIERS },
  // 五級距總覽 (owner 2026-08-21「後台設定及說明⋯全部都是推導動態即時產生」)。
  // ⭐ 它排在四張級距頁**後面**是刻意的：先看得到四把尺各自在哪一頁，再看它們
  // 攤平之後的樣子。它唯讀，而且是唯一同時印出「卡面 → 實際」兩欄的地方 ——
  // 那兩欄不一樣，正是 owner 那句「不計入系統倍率」造成的。
  { page: "tierOverview", label: "五級距總覽（卡面→實際）", emoji: "🪜", section: SEC_TIERS },
  // ⚠️ 不吃五級距的傷害節點 (owner #534)。⭐ 緊鄰總覽是刻意的：總覽說「級距表長
  // 這樣」，這一頁說「⛔ 但這幾十個節點不聽它的」。分開放的話，owner 調完級距
  // 之後不會有任何東西提醒他還有一批數字原地不動 —— 而那正是這一頁在防的誤判。
  { page: "damageTierWarnings", label: "⚠️ 不吃五級距的傷害節點", emoji: "🚫", section: SEC_TIERS },
  // GH#682 / GH#683 —— owner 2026-08-24 各逐字點名第二次的兩張清單（md ＋ 後台）。
  // 唯讀、與 docs 的 md 共用 `tools/skill-lists/lists.json` 同一次計算。
  { page: "castTimeList", label: "詠唱超過1秒", emoji: "📜", section: SEC_COMBAT },
  { page: "msBuffList", label: "移速加成清單", emoji: "💨", section: SEC_COMBAT },
  { page: "uiLexicon", label: "介面用語（Fate）", emoji: "🏆", section: SEC_COMBAT },
  { page: "statNormalization", label: "英雄屬性正規化", emoji: "📐", section: SEC_TIERS },
  // GH#322 —— 這四頁的 spec 早就寫好了，但導覽列沒有那一列 ⇒ 操作者點不到。
  // ⚠️ 「有 spec」與「到得了」是兩件事，`configDocCoverage.test.ts` 兩個方向都驗。
  { page: "castTime", label: "吟唱規則", emoji: "⏳", section: SEC_COMBAT },
  { page: "mitigation", label: "減傷規則", emoji: "🛡️", section: SEC_COMBAT },
  { page: "displacementTiers", label: "位移級距", emoji: "💨", section: SEC_TIERS },
  { page: "perLevelBonus", label: "每級加成", emoji: "📈", section: SEC_TIERS },
  { page: "mapSpec", label: "小地圖規格", emoji: "🗺️", section: SEC_COMBAT },
  { page: "camera", label: "戰鬥鏡頭", emoji: "🎥", section: SEC_COMBAT },
  { page: "mapReport", label: "地圖驗證報告", emoji: "📋", section: SEC_COMBAT },
  { page: "arenaPool", label: "場地輪替", emoji: "🎲", section: SEC_COMBAT },
  // 戰鬥手感 — 第四種語意。前三頁是倍率 / 加數 / 天花板,這一頁每一格是**一條
  // 規則的參數**(擊退門檻、站定門檻、面向鎖 tick、卡住判定),而且四張子表全部
  // 是 owner 口中的「決策點」。相鄰就是提醒:填的 0.05 在這一頁是「5% 的門檻」。
  { page: "combatFeel", label: "戰鬥手感", emoji: "🥊", section: SEC_COMBAT },
  { page: "castApproach", label: "走過去放技能", emoji: "🏃", section: SEC_COMBAT },
  // 對戰設定 — 一場對戰的**時鐘**(階段秒數、起始隊伍生命、火圈),和上面四頁的
  // 「英雄在場上多強」是不同的軸。⚠️ 這份文件有 19 格沒有消費端,頁面上是唯讀的。
  { page: "matchConfig", label: "對戰設定", emoji: "⏱️", section: SEC_COMBAT },
  // 競技場規則 (GH#410) —— 緊接在 對戰設定 後面，因為兩頁編的是**同一份**
  // `config/arena-rules.json`：那一頁管一場的時鐘，這一頁管場上的東西
  // （治療花／復活圈／守護塔／掉金／大絕與 EX 解鎖回合／普通武器上不上架）。
  // ⚠️ 這八個區塊在 2026-08-20 之前一格都調不到，改一個數字要完整部署。
  { page: "arenaTuning", label: "競技場規則", emoji: "🏟️", section: SEC_COMBAT },
  // 體型與射程 (GH#252 · owner 2026-08-01「身體放大倍數 會影響攻擊距離延長倍數」)
  // —— 這一頁只管普攻;技能距離在 戰鬥系統 的 abilityRange 那一格。
  { page: "bodyScale", label: "體型與射程", emoji: "📏", section: SEC_COMBAT },
  // ── 武器道具 (owner 2026-08-02) ────────────────────────────────────────────
  // 玩家「拿得到什麼」的兩頁:一頁決定英雄要打幾場才解鎖得到,一頁決定回合獎勵的
  // 三張卡從哪裡抽。
  // 商店經濟 — 英雄解鎖統一價 + 免費名單 (owner 2026-07-30). 它問的不是英雄在場上
  // 多強,而是玩家要打幾場才拿得到他。
  { page: "storeEconomy", label: "商店經濟", emoji: "💎", section: SEC_ITEMS },
  // 傳說武器三選一 — 候選不足時的補抽規則 (GH#249). ⚠️ 它與 殭屍波系統 編輯的是
  // **同一份** `config/arena-rules.json` 的不同區塊,雖然現在分屬兩個分類。
  { page: "itemDraft", label: "傳說武器三選一", emoji: "🗡️", section: SEC_ITEMS },
  // ── 肉鴿殭屍 (owner 2026-08-02) ────────────────────────────────────────────
  // 殭屍波系統 — the roguelite mob waves (出怪節奏 / 逐回合上限 / 能力數值 /
  // 擊殺獎勵 / 由誰擔任).
  { page: "mobWaves", label: "殭屍波系統", emoji: "🧟", section: SEC_MOBS },
  // 殭屍王出場演出 (owner 2026-08-02「殭屍王出場 會音效+大字講該英雄的名言，然後
  // 跳出該英雄的描述及攻略注意要點及弱點等提示，五秒後提示淡出消失」) —— 緊接在
  // 殭屍波系統 後面，因為王是那一頁生出來的東西；那一頁決定牠多強，這一頁決定牠
  // 走進場的那五秒畫面上出現什麼。⚠️ 王的臉是那一頁的 championSource 抽的，出貨
  // 是隨機，所以這一頁的逐英雄文案表天生是不完整的。
  { page: "bossIntro", label: "殭屍王出場演出", emoji: "📜", section: SEC_MOBS },
  // ── 鑄技工坊 (owner 2026-08-02 · #205 / #230 / #272) ───────────────────────
  // ⚠️ 這一組現在只有一頁半:住在 admin 裡的是**特效綁定**(下面這一列),而 /editor/
  // 那一整套鑄技工坊還沒搬進來(#272 未完)。外部入口寫在 `NAV_EXTERNAL`,而不是在
  // 這裡放一個指不到東西的路由。
  // 鑄技工坊 · 特效綁定 —— 每支技能綁哪一個特效家族原型 + per-invocation 參數。
  { page: "vfxForge", label: "鑄技工坊 · 特效綁定", emoji: "🔮", section: SEC_FORGE },
  // 新英雄轉生設計 (owner 2026-08-13) —— 六步從出身生一張英雄卡，最後從鑄技工坊
  // 挑六格技能組起來。放在 鑄技工坊 這一組而不是 內容·素材管理，因為它的第⑤步就是
  // 鑄技工坊的目錄，操作者會把兩頁一起用。
  { page: "heroForge", label: "新英雄轉生設計", emoji: "🧬", section: SEC_FORGE },
  // ── 系統 ──────────────────────────────────────────────────────────────────
  { page: "hub", label: "Console Hub", emoji: "🗂️", section: SEC_SYS },
  // 🗺 GH#776 —— 導覽地圖：11 組排成 treemap，一眼看得到這個 console 的全形狀。
  { page: "navMap", label: "導覽地圖", emoji: "🗺", section: SEC_SYS },
  // 🧑‍⚖️ owner 2026-08-27:「你還是沒告訴我去後台哪裡審查 [一頁批次後台驗收]」
  //    ⇒ 在此之前它**不在後台**（只活在 client dev server）。現在是真的一頁。
  { page: "featureReview", label: "批次驗收（連續圖片）", emoji: "🧑‍⚖️", section: SEC_OPS },
  // 變身外觀 (#249 GH#288) —— 26 對變身裡有 21 對前後同一個模型,所以「看不看得
  // 出來」全靠顏色/大小/球體掛件這三樣,而它們在 w3x 裡是空的。
  { page: "formVisuals", label: "變身外觀", emoji: "✨", section: SEC_SYS },
  // E2 —— 四份原本完全沒有後台入口的 config。共用 ui/ConfigDocPage 一個元件，
  // 欄位從 Zod schema 長出來、中文說明逐格手寫在 ../configForms。標籤寫在這裡
  // （eager shell）而不是隨元件走，理由和 體素鑄造廠 那一行一樣：這樣它才活得過
  // `vite build`。
  // 畫質分級 / 特效回收 挨在一起，因為它們是同一個問題的兩半：一個決定「載進來
  // 多重」，一個決定「打完之後留多少在記憶體裡」。owner 的原話是「一場就很燙」。
  // 對戰錄影 (owner 2026-08-02「請幫我預設打開」)。放在系統設定區,因為它和
  // 畫質分級/特效回收一樣是「一份 config 文件 = 一頁」的同一個引擎。
  { page: "replayPolicy", label: "對戰錄影", emoji: "🎬", section: SEC_SYS },
  { page: "modelLod", label: "畫質分級", emoji: "🪄", section: SEC_SYS },
  // 場地天氣 (GH#610 第二批, owner 2026-08-23「do it, 但有開關」／「有些場景是
  // 室內，請不要下雨」) —— 緊接在 畫質分級 後面，因為兩頁問的是同一類問題：
  // 「這台機器／這張圖，畫面上該出現多少東西」。⛔ 這一頁沒有一格會改變碰撞或視野。
  { page: "weather", label: "場地天氣", emoji: "🌧️", section: SEC_SYS },
  { page: "vfxCleanup", label: "特效回收", emoji: "🧹", section: SEC_SYS },
  // 爽度特效 (GH#494, owner 2026-08-21「提高爽度 模仿肉鴿遊戲的氛圍感」) —— 緊接在
  // 特效回收 後面，因為它是同一個引擎的另一半：一個管「留多少在記憶體裡」，
  // 一個管「那一瞬間看得到、聽得到什麼」。⛔ 這一頁沒有一格會改變任何人的金幣。
  { page: "feelFx", label: "爽度特效", emoji: "🪙", section: SEC_SYS },
  // 濺血程度 —— 調性決定，不是效能決定。放在它們後面而不是中間。
  { page: "gore", label: "濺血程度", emoji: "🩸", section: SEC_SYS },
  // 傷害數字配色 (owner 2026-08-01) —— 物理紅／魔法紫／真實白／治療綠。緊接在
  // 濺血程度 後面，因為兩頁問的是同一類問題：「打中的那一瞬間畫面上出現什麼」。
  { page: "damageColors", label: "傷害數字配色", emoji: "🎨", section: SEC_SYS },
  // 範圍指引與預告 (GH#376) —— 緊接在 傷害數字配色 後面，因為三頁問的是同一類
  // 問題：「打之前／打中的那一瞬間，地板與畫面上出現什麼」。這一頁管的是**打之前**
  // （我瞄得到多遠、那一圈是誰放的）。同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  { page: "rangeGuide", label: "範圍指引與預告", emoji: "🎯", section: SEC_SYS },
  { page: "toggleAbility", label: "開關型技能外觀", emoji: "🌀", section: SEC_SYS },
  // 畫面提示 (GH#576/#573) —— 緊接在 範圍指引與預告 後面，因為兩頁都在回答
  // 「畫面有沒有把剛剛發生的事說出來」。同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  { page: "uiCues", label: "畫面提示", emoji: "💬", section: SEC_SYS },
  // 世界演出 (2026-08-23 稽核) —— 緊接在 畫面提示 後面，因為兩頁問的是同一類問題：
  // 「那一刻，畫面上出現什麼」。這一頁管的是**世界裡**那一團（誰出現了、誰消失了、
  // 哪一條被掃過），⛔ 不是螢幕上的那一層。
  { page: "worldCues", label: "世界演出", emoji: "✨", section: SEC_SYS },
  // 混音 (owner 2026-08-17「其他角色語音應該是自己的一半」) —— 緊接在 傷害數字配色
  // 後面，因為兩頁問的是同一類問題的兩個感官：「打中的那一瞬間**看到**什麼／**聽到**
  // 什麼」。同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  { page: "audioMix", label: "混音", emoji: "🎚️", section: SEC_SYS },
  // 練習模式 (GH#343)：選場地 + 選角色進場、不對戰、可用測試碼與即時生怪。
  // 六格開關（總開關／無限戰鬥／自動生怪／火圈／自動復活／一次生幾隻）。
  // 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  { page: "practice", label: "練習模式", emoji: "🎯", section: SEC_SYS },
  { page: "lobbyRally", label: "大廳集合令", emoji: "📣", section: SEC_SYS },
  // 手把手感 (GH#520)：死區／兩個前導距離／搜敵半徑／長按門檻。同一個 `ConfigDocPage`
  // 元件、同一條 `putOverlayDoc`。⚠️ 消費端是客戶端，玩家重整一次分頁就生效。
  { page: "gamepad", label: "手把手感", emoji: "🎮", section: SEC_SYS },
  // 圖示風格 (GH#178)：地端兩階段產圖器的 PASS-2 風格字串與參數。
  // ⚠️ 它是**產圖時**的設定，不是遊戲執行期的 —— 改了要重跑產圖器才看得到。
  { page: "iconStyle", label: "圖示風格", emoji: "🖌", section: SEC_ASSETS },
  // 圖示工坊 (owner 2026-08-17「動態單個/批次產生的功能頁」)：緊接在 圖示風格
  // 後面，因為那一頁決定「畫成什麼樣子」而這一頁決定「畫哪幾張」——
  // 操作者的順序永遠是先調風格再重畫。
  { page: "iconWorkshop", label: "圖示工坊", emoji: "🏭", section: SEC_ASSETS },
  // 護盾規則 —— 一個人身上兩道盾時誰先被吃掉。它是**傷害結算規則**（跟 戰鬥系統
  // 的倍率、屬性上限的天花板同一個家族），不是畫質也不是調性，但排在這裡是因為
  // 它和上面三頁共用同一個 schema 驅動的元件；改到它的人會從左欄找「護盾」。
  { page: "shieldRules", label: "護盾規則", emoji: "🛡️", section: SEC_STATUS },
  // 格擋規則 —— 緊接在 護盾規則 後面，因為兩頁問的是同一段結算的相鄰兩步：
  // 格擋在護盾之前判、而且刻意不吃護盾。owner 2026-07-31 裁決兩件格擋要獨立
  // 各判一次，那條裁決就住在這一頁。
  { page: "blockRules", label: "格擋規則", emoji: "🪖", section: SEC_STATUS },
  // 暴擊規則 (GH#302) —— 緊接在 格擋規則 後面，因為兩頁問的是**同一個問題的兩側**：
  // 「同一發上有好幾條同類判定時怎麼合成」。格擋是防守側（獨立鏈式、會收斂），
  // 暴擊是進攻側（獨立相乘、會爆炸），兩條規則不同而且各自有理由 —— 放在一起
  // 才看得出來那是一個決定，不是一個疏忽。
  { page: "critRules", label: "暴擊規則", emoji: "💥", section: SEC_STATUS },
  { page: "berserkRules", label: "暴走規則", emoji: "😡", section: SEC_STATUS },
  { page: "dispelRules", label: "淨化規則", emoji: "✨", section: SEC_STATUS },
  { page: "woundRules", label: "重創規則", emoji: "🩸", section: SEC_STATUS },
  // 虛弱規則 (GH#301-4) —— 緊接在 重創規則 後面：兩頁都是「一個狀態把一根數值
  // 打折」的全域定義，而且兩頁的倍率都不進屬性面板。
  { page: "weaknessRules", label: "虛弱規則", emoji: "🥀", section: SEC_STATUS },
  { page: "damageRules", label: "傷害規則", emoji: "⚔️", section: SEC_STATUS },
  // AP 傷害加成 (owner 2026-08-21) —— 緊接在 傷害規則 後面：那一頁決定技能傷害吃
  // 護甲還是魔抗,這一頁決定它乘多少。兩頁合起來才是「一發技能到底打多痛」。
  { page: "apDamageScaling", label: "AP 傷害加成", emoji: "🔮", section: SEC_STATUS },
  // 增益卡敵方過濾 (批 1 決策點 1-1) —— 稜彩卡上「敵方英雄」那句話在殭屍波裡算不算
  // 數。緊接在 格擋規則 後面：三頁都是「同一段結算的規則」，而這一頁決定的是
  // hook 到底跑不跑，也就是前兩頁那些判定有沒有機會被叫到。
  { page: "augmentEnemyFilter", label: "增益卡敵方過濾", emoji: "🧟", section: SEC_STATUS },
  { page: "stealthRules", label: "隱形規則", emoji: "👻", section: SEC_STATUS },
  // 嘲弄規則 —— 唯一一條會**強迫**一個單位改打別人的機制(目前只有鍊金術之盾用到)。
  // 緊接在 隱形規則 後面,因為兩頁問的是同一類問題:「索敵看得到誰 / 索敵被誰綁架」。
  { page: "tauntRules", label: "嘲弄規則", emoji: "🎯", section: SEC_STATUS },
  // 回血與扣血規則 (GH#253 · owner 2026-08-02「Berserker 是每秒損失 1%生命,
  // 直到生命不足1%」—— 8/1 那句「回血 1%每秒」的方向更正)。百分比回血與固定
  // 回血的關係、以及百分比自傷停在哪裡。
  { page: "regenRules", label: "回血與扣血規則", emoji: "💚", section: SEC_STATUS },
  // 場地環境火焰 (GH#251 · owner 2026-08-01「場地天空火焰很礙眼 請全部場地都去
  // 掉」) —— 出貨已經關掉，這一頁是「改主意的時候不用再改程式」的那把開關。
  // 排在 濺血程度 / 傷害數字配色 這些「畫面上出現什麼」的隔壁而不是效能三頁旁邊。
  { page: "arenaFire", label: "場地環境火焰", emoji: "🔥", section: SEC_SYS },
  // 勝利煙火 (#93 / #235 · owner 2026-08-02「請你直接取消煙火(變成後台開關)」)
  // —— 出貨已經關掉,這一頁同樣是「改主意的時候不用再改程式」的那把開關。
  // 緊接在 場地環境火焰 後面,因為兩頁問的是同一種問題:場上該不該有這團火。
  { page: "victoryFx", label: "勝利煙火", emoji: "🎆", section: SEC_SYS },
  // 回合頒獎台 (GH#257 / GH#256 · owner 2026-08-03「回合勝利出現的 3d model 是勝利
  // 角色 但現在不是」) —— 站幾個人／誰站正中間／誰在慶祝／第一名說什麼。緊接在
  // 勝利煙火 後面，因為兩頁問的是同一個時刻：贏了那一秒畫面上發生什麼事。
  { page: "victoryPodium", label: "回合頒獎台", emoji: "🏆", section: SEC_SYS },
  // 道具卡片排版 (owner 2026-08-02「卡片道具的排版連在一起不好閱讀，關於效果及數值
  // 的部分應該要特殊顏色表示」)。⚠️ 這一頁不改 owner 手寫的 description 一個字：
  // 排版是渲染時解析出來的（`legendary49OwnerText.test.ts` 逐位元組守著那些原文）。
  // ⚠️ 它留在「系統」而不是搬進「武器道具」，因為 owner 2026-08-02 核准的分類表
  // 只點名了 商店經濟 與 傳說武器池 兩項；把沒被點名的東西一起搬走是替他決定。
  { page: "itemCard", label: "道具卡片排版", emoji: "🃏", section: SEC_SYS },
  { page: "serverOps", label: "系統運維", emoji: "🛠️", section: SEC_SYS },
  // #243 — 一鍵打包 ZIP 匯出／匯入平台資料，無痛移機. Session-gated (see
  // store.ts) and PRESENT IN THE PRODUCTION BUNDLE, because a migration tool
  // that only runs on localhost cannot migrate a host.
  { page: "dataMigration", label: "資料搬遷", emoji: "📦", section: SEC_SYS },
];

/**
 * 指向 console **以外**的入口。
 *
 * 目前只有一列:/editor/ 的鑄技工坊。#272(把 /editor/ 的編輯能力搬進線上 admin)
 * 不在這次的範圍內,所以這裡刻意**不是**一個 `Page` —— 它是一個真的會開啟的網址
 * 加一句說明「它還在外面」。兩個被拒絕的替代方案:
 *
 *   • 加一個 `page: "forgeStudio"` 卻沒有元件 → 點下去一片空白(失敗形態 ②)。
 *   • 什麼都不放 → owner 看到「鑄技工坊」這個分類底下只有特效綁定,會以為搬完了。
 *
 * 網址走 `resolveHubLinks` 而不是寫死 "/editor/",因為 dev 的編輯器在
 * 127.0.0.1:5174、線上才是同源的 /editor/ —— 寫死其中一個,另一個環境就是死連結。
 */
export function externalRows(): NavLink[] {
  const raw = (import.meta as unknown as { env?: HubEnv & { PROD?: boolean } }).env ?? {};
  const editor = resolveHubLinks(raw, raw.PROD === true ? "prod" : "dev").find((l) => l.key === "editor");
  return [
    {
      key: "forgeStudioExternal",
      label: "鑄技工坊（/editor/）",
      emoji: "↗️",
      section: SEC_FORGE,
      href: editor?.url ?? "/editor/",
      note: "技能／特效編輯器目前仍住在獨立的 /editor/，尚未搬進本後台（#272）。這一列會在新分頁開啟它。",
    },
  ];
}

/**
 * THE DEV GATE for 內容管理 (task #102).
 *
 * `import.meta.env.DEV` is written BARE and unguarded: vite replaces it with
 * the literal `false` at build time, rollup dead-folds the body, and the
 * ./ContentPage chunk — with everything it pulls in, the write module
 * (../contentApi) included — is never emitted. A production admin build does
 * not merely hide the content editor, it does not CONTAIN it. That is the same
 * shape #96 proved out in the game client, and contentGate.test.ts pins it,
 * including an opt-in test that runs a real `vite build` and greps dist/.
 *
 * The nav entry is driven off the loaded component rather than off the flag a
 * second time, so there is exactly ONE decision: if the chunk did not load,
 * the route does not exist in the UI either.
 */
interface ContentAdmin {
  readonly Page: React.ComponentType;
  readonly nav: { page: Page; label: string; emoji: string };
}

/**
 * The 內容·素材管理 SUITE (owner directive 2026-07-25). Same dev gate as before —
 * a bare `import.meta.env.DEV` early return immediately above a statically
 * analysable `import("./ContentPage")` — but the chunk now contributes a LIST of
 * nav routes (m.CONTENT_ROUTES: audio · champions · newHero · abilities · items
 * · vfx · arenas) and a `render` function that mounts the right dev page for
 * each. Everything (routes, labels, editor engine, write module) still travels
 * with this one chunk, so a production build contains none of it. All routes
 * stay OUT of SESSION_REQUIRED_PAGES → loopback no-login editing is preserved.
 */
interface ContentSuite {
  readonly routes: readonly NavItem[];
  readonly render: (page: Page, onNavigate: (page: string, selectId?: string) => void) => React.JSX.Element | null;
}

/**
 * 🔴 LIVE 對照·視覺化 SUITE（GH#775）。與 useContentSuite 同一個 DEV 閘姿勢：
 * bare `import.meta.env.DEV` early-return ＋ 靜態可分析的 `import("./live")`
 * ⇒ production build **不含**這 13 頁（連 label 字串都不含）。
 * 資料面也只在 dev 存在（/__live 是 vite dev middleware）—— 兩層一起消失，
 * ⛔ 不會出現「頁面在、資料 404」的半殘。
 */
interface LiveSuite {
  readonly routes: readonly NavItem[];
  readonly render: (page: Page) => React.JSX.Element | null;
}

function useLiveSuite(): LiveSuite | null {
  const [loaded, setLoaded] = useState<LiveSuite | null>(null);
  useEffect(() => {
    // ⭐ GH#794 起這一行**拿掉了**（原本是 `if (!import.meta.env.DEV) return;`）。
    //
    // ⚠️ ⛔ 這幾行行註解裡**不要寫 glob 的 `/**`** —— `contentGate.test.ts` 的
    //    `code()` 先剝區塊註解（`/\*…\*/`），而 `//` 行裡的 `/**` 會被當成
    //    區塊註解的開頭，一路吃到下一個 `*/` ⇒ 那支閘會用一句**與真相無關**的
    //    訊息紅（GH#798）。這裡寫 `/__live/` 就好。
    //
    // ⚠️ 那道閘在寫下來的當下是**對的**：`/__live/` 那一族只掛在 vite dev server 上，
    //    正式 build 裝了也只會 fetch 到 404 ⇒ 與其給 13 個壞掉的頁，不如不給。
    // ⛔ 但 #794 之後 `/__live/` **線上真的有了**（review sidecar ＋ nginx 的
    //    location），於是這道閘變成了「owner 打不開他剛要求上線的那 13 頁」——
    //    ⭐ 這與 FeatureReviewPage 檔頭那句「正式 build 沒有這條路由」是**同一句
    //    過期的散文**（第三守則：註解會說謊，而它連著程式一起說）。
    //
    // ⭐ 現在的降級是誠實的：`/__live` 打不到時，每一頁自己會顯示
    //    「/__live/<dataset> 回報：<錯誤>」——⛔ 不是白畫面。
    let alive = true;
    void import("./live").then(
      (m) => {
        if (!alive) return;
        const routes: NavItem[] = m.LIVE_ROUTES.map((r) => ({
          page: r.page as Page,
          label: r.label,
          emoji: r.emoji,
          section: m.LIVE_SECTION,
        }));
        setLoaded({ routes, render: (page) => m.renderLivePage(page) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

function useContentSuite(): ContentSuite | null {
  const [loaded, setLoaded] = useState<ContentSuite | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./ContentPage").then(
      (m) => {
        if (!alive) return;
        // labels + routes travel WITH the chunk, so a production bundle does not
        // even contain the strings for pages it cannot mount.
        const routes: NavItem[] = m.CONTENT_ROUTES.map((r) => ({
          page: r.page as Page,
          label: r.label,
          emoji: r.emoji,
          section: m.CONTENT_SECTION,
        }));
        setLoaded({ routes, render: (page, onNav) => m.renderContentDevPage(page, onNav) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

/**
 * THE SAME DEV GATE, for 角色語音生成 (owner spec step 4).
 *
 * Deliberately a SECOND hook rather than a parameterised one: the guard has to
 * sit as a bare `if (!import.meta.env.DEV) return;` immediately above a
 * STATICALLY ANALYSABLE `import("./VoiceGenPage")`, or rollup cannot prove the
 * chunk is unreachable and will emit it. A generic helper taking `() =>
 * import(...)` would hide the specifier behind a closure and quietly reinstate
 * the very thing the gate exists to prevent — the voice page carries a write
 * path to the loopback generation daemon.
 */
function useVoiceGenPage(): ContentAdmin | null {
  const [loaded, setLoaded] = useState<ContentAdmin | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./VoiceGenPage").then(
      (m) => {
        if (alive) setLoaded({ Page: m.VoiceGenPageRoot, nav: { ...m.VOICE_NAV } });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

/**
 * THE PHONE BREAKPOINT (task #126).
 *
 * The shell was a hard `220px 1fr` grid, which on a 375px phone leaves ~155px
 * for the entire console — every page unusable, buttons wrapping one glyph per
 * line. That was survivable while the console was a desk tool. It is not
 * survivable for 帳號審核: the moment this page exists to serve is the owner
 * ON HIS PHONE with a relative waiting, and a queue whose 通過 button renders
 * as a vertical stack of two characters is not a one-tap action.
 *
 * Below the breakpoint the rail becomes a horizontally-scrollable strip above
 * the content and the grid collapses to one column. matchMedia rather than a
 * resize listener: it fires only on the crossing, so there is no per-pixel
 * re-render, and it is the same signal a CSS media query would use — which
 * inline styles cannot express.
 */
const NARROW_QUERY = "(max-width: 720px)";

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => globalThis.matchMedia?.(NARROW_QUERY).matches ?? false,
  );
  useEffect(() => {
    const mq = globalThis.matchMedia?.(NARROW_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

const CONTENT_SUITE_PAGES: ReadonlySet<Page> = new Set<Page>([
  "audio",
  "champions",
  "newHero",
  "abilities",
  "items",
  "vfx",
  "arenas",
  // 鑄形工坊 (task #229). ONE line, deliberately: reusing the existing
  // ContentPage dev gate rather than adding a third `useVoxelStudio()` hook
  // means the studio adds ZERO new dynamic-import surface, and its label stays
  // inside the dev chunk where contentGate.test.ts requires it to be.
  "voxelStudio",
]);

/** True for a 內容·素材管理 route that the dev chunk owns (so we can show a spinner). */
function isContentSuitePage(page: Page): boolean {
  return CONTENT_SUITE_PAGES.has(page);
}

/** Slot a block of dev-only nav entries immediately after `after`, or append. */
function insertBlockAfter(nav: readonly NavItem[], after: Page, block: readonly NavItem[]): NavItem[] {
  const at = nav.findIndex((n) => n.page === after);
  if (at < 0) return [...nav, ...block];
  return [...nav.slice(0, at + 1), ...block, ...nav.slice(at + 1)];
}

/** Slot a dev-only nav entry immediately BEFORE `before`, or append. */
function insertBefore(nav: readonly NavItem[], before: Page, entry: NavItem): NavItem[] {
  const at = nav.findIndex((n) => n.page === before);
  if (at < 0) return [...nav, entry];
  return [...nav.slice(0, at), entry, ...nav.slice(at)];
}

/**
 * 偏好存放處。包在 try 裡是因為 Safari 的隱私模式讀 `localStorage` 會直接丟例外,
 * 而「記不住收納狀態」不該讓整個後台開不起來。node（vitest）下它是 undefined。
 */
function browserPrefStore(): NavPrefStore | null {
  try {
    return (globalThis as { localStorage?: NavPrefStore }).localStorage ?? null;
  } catch {
    return null;
  }
}

export interface NavRailProps {
  rows: readonly NavRow[];
  /** 目前這一頁（決定哪一列 active、以及哪一組被強制展開）。 */
  page: Page;
  /** 手機的橫向捲動條版型。 */
  narrow: boolean;
  /** 帳號審核的等待數（0 或負數 = 不畫徽章）。 */
  pendingCount: number;
  /** 這一頁沒有 session 就進不去嗎（畫 🔒）。 */
  isLocked: (page: Page) => boolean;
  onNavigate: (page: Page) => void;
  /**
   * 收納偏好的存放處。⚠️ `undefined`（沒傳）= 用瀏覽器的 localStorage；
   * `null` = 明確地不要存。測試餵一個假的進來驗真的行為，而不是掃字串。
   */
  prefStore?: NavPrefStore | null;
}

/**
 * 左欄導覽（owner 2026-08-02「請做成可以收納/展開的形式避免過長，並且多幾個類別」）。
 *
 * 抽成獨立的 export 元件，是為了讓守衛可以 `renderToString` 它而不必連帶啟動整個
 * console（那會拉起 boot、輪詢、以及三十幾個頁面的 effect）。⚠️ 這正是失敗形態 ⑤
 * 的反面：測試驗的就是出貨在用的這一個元件，不是測試自己另外寫一份導覽列。
 */
export function NavRail(props: NavRailProps): React.JSX.Element {
  const { rows, page, narrow, pendingCount, isLocked, onNavigate } = props;
  const store = props.prefStore === undefined ? browserPrefStore() : props.prefStore;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadCollapsed(store));
  const currentSection = sectionOfPage(rows, page);
  const groups = groupRows(rows, SECTION_ORDER);
  const everyOpen = groups.every((g) => !collapsed.has(g.section));

  const apply = (next: Set<string>): void => {
    setCollapsed(next);
    saveCollapsed(store, next);
  };

  return (
    <nav
      data-testid="nav-rail"
      style={
        narrow
          ? // one scrollable row; nothing wraps, so the strip never eats the
            // screen no matter how many consoles get added later
            { display: "flex", flexDirection: "row", gap: 6, overflowX: "auto", paddingBottom: 4, alignItems: "center" }
          : { display: "flex", flexDirection: "column", gap: 4, flex: 1 }
      }
    >
      {/* 一鍵把八組全部收掉 —— owner 要的「避免過長」在這裡是一次點擊而不是八次。
          收完之後畫面上只剩「你正在看的那一組」（`isSectionOpen` 強制展開它）。 */}
      <button
        onClick={() => apply(everyOpen ? new Set(allSections(rows, SECTION_ORDER)) : new Set())}
        title={everyOpen ? "把所有分組收起來（目前所在的那一組會留著）" : "把所有分組展開"}
        style={{
          alignSelf: narrow ? "center" : "flex-start",
          marginBottom: narrow ? 0 : 6,
          padding: "4px 8px",
          borderRadius: 6,
          border: PANEL_BORDER,
          background: "transparent",
          color: TEXT_DIM,
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {everyOpen ? "⊟ 全部收合" : "⊞ 全部展開"}
      </button>
      {groups.map((g) => {
        const open = isSectionOpen(g.section, collapsed, currentSection);
        const pinned = g.section === currentSection && collapsed.has(g.section);
        return (
          <Fragment key={g.section}>
            <button
              onClick={() => apply(toggleCollapsed(collapsed, g.section))}
              aria-expanded={open}
              title={
                pinned
                  ? `${g.section}：你正在看這一組裡的頁面，所以它先留著展開`
                  : open
                    ? `收起 ${g.section}`
                    : `展開 ${g.section}（${g.rows.length} 項）`
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                textAlign: "left",
                padding: narrow ? "4px 8px" : "2px 8px",
                margin: narrow ? 0 : "10px 0 2px 0",
                border: narrow ? PANEL_BORDER : "none",
                borderRadius: 6,
                background: "transparent",
                color: TEXT_DIM,
                opacity: 0.85,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              <span>{g.section}</span>
              <span style={{ opacity: 0.6, letterSpacing: 0 }}>{g.rows.length}</span>
              {/* ⚠️ 收納會吃掉徽章。#126 的整個重點是「有親戚在等審核」這件事要在
                  owner 人不在那一頁的時候看得到 —— 一個被收起來的分組如果順手把
                  待審人數也藏掉,收納功能就把那個通知殺掉了。所以組收起來的時候,
                  徽章往上跳到標題上。 */}
              {!open && pendingCount > 0 && g.rows.some((r) => isNavItem(r) && r.page === "approvals") && (
                <span
                  title={`${pendingCount} 個帳號在等審核（在收起來的「${g.section}」裡）`}
                  style={{
                    marginLeft: 4,
                    minWidth: 18,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: WARN,
                    color: "#1a1206",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0,
                    textAlign: "center",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
            {open &&
              g.rows.map((row) => {
                if (!isNavItem(row)) {
                  // 外部入口（/editor/ 的鑄技工坊）。是 <a> 不是 <button>：它真的
                  // 離開這個 SPA，而做成假的路由就是「點了沒反應」的那一類缺陷。
                  return (
                    <Fragment key={rowKey(row)}>
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noreferrer"
                        title={row.note}
                        style={{
                          textAlign: "left",
                          padding: "9px 12px",
                          borderRadius: 8,
                          border: `1px dashed ${PANEL_BORDER.split(" ").pop() ?? ACCENT}`,
                          background: "transparent",
                          color: TEXT_DIM,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          textDecoration: "none",
                        }}
                      >
                        <span style={{ marginRight: 8 }}>{row.emoji}</span>
                        <span style={{ flex: 1 }}>{row.label}</span>
                      </a>
                      {!narrow && (
                        <div style={{ fontSize: 10, color: TEXT_DIM, opacity: 0.7, lineHeight: 1.5, margin: "0 8px 4px 8px" }}>
                          {row.note}
                        </div>
                      )}
                    </Fragment>
                  );
                }
                const active = row.page === page;
                const locked = isLocked(row.page);
                return (
                  <button
                    key={rowKey(row)}
                    onClick={() => onNavigate(row.page)}
                    title={locked ? "需登入（平台管理 API）" : undefined}
                    style={{
                      textAlign: "left",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: active ? `1px solid ${ACCENT}` : "1px solid transparent",
                      background: active ? "#1b2338" : "transparent",
                      color: active ? TEXT_MAIN : TEXT_DIM,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ marginRight: 8 }}>{row.emoji}</span>
                    <span style={{ flex: 1 }}>{row.label}</span>
                    {/* the waiting-queue badge — a filled amber pill, not a dot:
                        the NUMBER is what tells the owner whether one cousin or the
                        whole family is stuck on the approval screen */}
                    {row.page === "approvals" && pendingCount > 0 && (
                      <span
                        title={`${pendingCount} 個帳號在等審核`}
                        style={{
                          marginLeft: 6,
                          minWidth: 18,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: WARN,
                          color: "#1a1206",
                          fontSize: 11,
                          fontWeight: 800,
                          textAlign: "center",
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                    {locked && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>🔒</span>}
                  </button>
                );
              })}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function App(): React.JSX.Element {
  const screen = useApp((s) => s.screen);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (screen === "boot") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: TEXT_DIM }}>
        Loading…
      </div>
    );
  }
  if (screen === "login") return <LoginScreen />;
  return <Console />;
}

/**
 * ⚠️ `export` 是給守衛用的（同 `NavRail` 的理由）：`shellScroll.test.ts` 要
 * `renderToString` **出貨在用的那一棵**渲染樹來讀 `<main>` 的樣式，⛔ 而不是掃
 * 原始碼字串 —— 少了它，把外框樣式換回會截斷內容的那一版照樣全綠（失敗形態⑤）。
 */
export function Console(): React.JSX.Element {
  const page = useApp((s) => s.page);
  const navigate = useApp((s) => s.navigate);
  const account = useApp((s) => s.account);
  const doLogout = useApp((s) => s.doLogout);
  const showLogin = useApp((s) => s.showLogin);
  const contentSuite = useContentSuite();
  const voiceAdmin = useVoiceGenPage();
  const narrow = useIsNarrow();
  const pendingCount = useApp((s) => s.pendingCount);
  const refreshPendingCount = useApp((s) => s.refreshPendingCount);
  // E2 —— 畫質分級 / 特效回收 / 濺血程度 / 護盾規則。四個路由、一個元件、四份
  // 標籤表。不是這幾個路由時回 null，所以 render 那邊不需要再列一次每一個 key
  // （加第五頁時 render 那一行一個字都不用改）。
  const configDocSpec = specForPage(page);

  /**
   * Poll the 帳號審核 queue for the nav badge (task #126).
   *
   * It lives in the SHELL, not on the approval page, and that is the whole
   * point: the owner is normally somewhere else in the console — or has the tab
   * parked — when a relative registers. A count that only appears once you open
   * the page you were never going to open is not a notification.
   *
   * 30s is a deliberate compromise: fast enough that "he says he registered"
   * resolves while the phone call is still happening, slow enough to be
   * invisible next to the hub's own 15s health pings. Failures are swallowed by
   * the store (an older platform build simply has no such route).
   */
  useEffect(() => {
    if (account === null) return;
    void refreshPendingCount();
    const timer = setInterval(() => void refreshPendingCount(), 30_000);
    return () => clearInterval(timer);
  }, [account, refreshPendingCount]);
  // 變更密碼 lives on the LOGGED-IN side only: the platform route needs both a
  // session and the current password, so there is nothing to show without one.
  const [changingPassword, setChangingPassword] = useState(false);
  // The dev content routes exist only when the dev chunk loaded; their labels
  // come FROM that chunk. Spliced BY NAME into 內容·素材管理: the content block
  // right after 營運's last row (audit), then 角色語音生成 right before the
  // always-present 內容白名單 — so the section reads audio · … · arenas · voiceGen
  // · curation. A production build shows the section with only curation.
  const withContent =
    contentSuite === null ? NAV : insertBlockAfter(NAV, "audit", contentSuite.routes);
  const liveSuite = useLiveSuite();
  const navBase =
    voiceAdmin === null
      ? withContent
      : insertBefore(withContent, "curation", { ...voiceAdmin.nav, section: SEC_CONTENT });
  // 🔴 LIVE 13 頁接在尾端 —— 分組是算出來的（groupRows），落點由 section 決定。
  const nav = liveSuite === null ? navBase : [...navBase, ...liveSuite.routes];
  // 內部路由 + 外部入口（/editor/ 的鑄技工坊）。分組是算出來的，所以外部那一列擺在
  // 陣列尾端也照樣落進「鑄技工坊」那一組。
  const rows: NavRow[] = [...nav, ...externalRows()];
  const onNavigate = (p: string, _selectId?: string): void => navigate(p as Page);

  // 🔍 GH#776 —— ⌘K 指令面板。⭐ 它吃的是**左欄真的畫的那一份** `rows`
  //（含 dev chunk 的 21 頁與 /editor/ 外部列），⛔ 不另組一份清單（第〇·四守則）。
  //  ⚠️ 回頭點：把這三行與下面 <CommandPalette/> 那一段拿掉 —— 一個 commit，
  //  ⛔ 這條路徑上沒有後台旋鈕（它是 console 自己的介面，玩家看不到）。
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteHotkey(openPalette);

  // THE SPLIT GATE (task #102): a page whose data lives on the Go platform admin
  // API needs a real operator session; the content editor + local consoles do
  // not. With no session those player-ops pages show a 需登入 state instead.
  const gated = account === null && pageRequiresSession(page);

  // GH#493 —— 切頁後右欄回到最上面。桌機捲的是 `<main>` 自己、手機捲的是文件，
  // 所以兩個都重設（`resetContentScroll` 的註解記了為什麼缺一不可）。
  const contentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const w = globalThis as { scrollTo?: (x: number, y: number) => void };
    resetContentScroll({
      pane: contentRef.current,
      win: typeof w.scrollTo === "function" ? { scrollTo: w.scrollTo.bind(w) } : null,
    });
  }, [page]);
  const layout = shellScrollLayout(narrow);

  return (
    <div
      style={{
        ...layout.shell,
        display: "grid",
        gridTemplateColumns: narrow ? "1fr" : "220px 1fr",
        background: BG,
      }}
    >
      <aside
        style={{
          ...layout.rail,
          background: PANEL_BG,
          // on a phone the rail is a strip ABOVE the content, so its divider
          // has to move from the right edge to the bottom one
          borderRight: narrow ? "none" : PANEL_BORDER,
          borderBottom: narrow ? PANEL_BORDER : "none",
          padding: narrow ? "10px 12px" : 16,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {!narrow && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN, marginBottom: 2 }}>GGD Ops</div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>operator console</div>
          </>
        )}
        <NavRail
          rows={rows}
          page={page}
          narrow={narrow}
          pendingCount={pendingCount}
          isLocked={(p) => account === null && pageRequiresSession(p)}
          onNavigate={(p) => navigate(p)}
        />
        <div
          style={
            narrow
              ? // on a phone the account block sits inline under the strip
                { marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }
              : { marginTop: 16, borderTop: PANEL_BORDER, paddingTop: 12 }
          }
        >
          {account ? (
            <>
              <div
                style={{
                  fontSize: 12,
                  color: TEXT_MAIN,
                  marginBottom: narrow ? 0 : 8,
                  flex: narrow ? 1 : undefined,
                }}
              >
                {account.username}
              </div>
              <Btn
                small
                onClick={() => setChangingPassword(true)}
                style={narrow ? undefined : { width: "100%", marginBottom: 6 }}
              >
                變更密碼 Change password
              </Btn>
              <Btn small onClick={() => void doLogout()} style={narrow ? undefined : { width: "100%" }}>
                Sign out
              </Btn>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: TEXT_DIM,
                  marginBottom: narrow ? 0 : 8,
                  lineHeight: 1.5,
                  flex: narrow ? 1 : undefined,
                }}
              >
                內容編輯免登入 · 玩家管理需登入
              </div>
              <Btn small kind="primary" onClick={() => showLogin()} style={narrow ? undefined : { width: "100%" }}>
                登入 Sign in
              </Btn>
            </>
          )}
        </div>
      </aside>
      {/* GH#493 —— 高度與 overflow 由 `shellScrollLayout` 決定：桌機兩欄各自捲、
          文件本身不捲；手機整頁捲（那時把 main 釘成 100vh 會把下半頁關在外面）。
          ⛔ 不要在這裡補上 `overflow: hidden` 或一個捲不動的固定高度 ——
          那會讓超過一個螢幕的內容看不到也捲不到，而畫面上看起來完全正常。 */}
      <main
        ref={contentRef}
        data-testid="content-pane"
        style={{
          ...layout.content,
          padding: narrow ? 12 : 20,
          minWidth: 0,
        }}
      >
        {gated ? (
          <SessionRequired onLogin={() => showLogin()} />
        ) : (
          <>
            {page === "hub" && <ConsoleHub />}
            {page === "iconWorkshop" && <IconWorkshopPage />}
            {page === "approvals" && <ApprovalsPage />}
            {page === "quickApproval" && <QuickApprovalPage />}
            {page === "players" && <PlayersPage />}
            {page === "matches" && <MatchesPage />}
            {page === "replays" && <ReplaysPage />}
            {page === "damageBoard" && <DamageBoardPage />}
            {page === "announcements" && <AnnouncementsPage />}
            {page === "curation" && <CurationPage />}
            {page === "contentOverlay" && <ContentOverlayPage />}
            {/* 內容·素材管理 dev routes — all mounted from the one dev chunk. */}
            {contentSuite !== null && contentSuite.render(page, onNavigate)}
            {/* 🔴 LIVE 對照·視覺化（GH#775）—— chunk 沒載到就不存在這些路由 */}
            {liveSuite !== null && liveSuite.render(page)}
            {/* 🗺 GH#776 導覽地圖 —— rows 是左欄真的畫的那一份，⛔ 不是第二份清單 */}
            {page === "navMap" && <NavMapPage rows={rows} onNavigate={onNavigate} />}
            {contentSuite === null && isContentSuitePage(page) && (
              <div style={{ color: TEXT_DIM, padding: 8 }}>載入內容·素材管理…</div>
            )}
            {page === "combatEnv" && <CombatEnvPage />}
            {page === "mobWaves" && <MobWavesPage />}
            {page === "itemDraft" && <ItemDraftPage />}
            {page === "serverOps" && <ServerOpsPage />}
            {page === "dataMigration" && <DataMigrationPage />}
            {page === "ai" && <AiSettingsPage />}
            {page === "modelBudget" && <ModelBudgetPage />}
            {page === "tierOverview" && <TierOverviewPage />}
            {page === "damageTierWarnings" && <DamageTierWarningsPage />}
            {page === "castTimeList" && <CastTimeListPage />}
            {page === "msBuffList" && <MoveSpeedListPage />}
            {page === "iconTracking" && <IconTrackingPage />}
            {page === "voxelSkins" && <VoxelSkinSheetPage />}
            {page === "voxelForge" && <VoxelFoundryPage />}
            {page === "voxelBarcode" && <VoxelBarcodePage />}
            {page === "voxelBody" && <VoxelBodyPage />}
            {page === "baseBonus" && <BaseBonusPage />}
            {page === "formVisuals" && <FormVisualsPage />}
            {page === "vfxForge" && <VfxForgePage />}
            {page === "heroForge" && <HeroForgePage />}
            {page === "statCaps" && <StatCapsPage />}
            {page === "perLevelBonus" && <PerLevelBonusPage />}
            {page === "featureReview" && <FeatureReviewPage />}
            {page === "combatFeel" && <CombatFeelPage />}
            {page === "matchConfig" && <MatchConfigPage />}
            {page === "storeEconomy" && <StoreEconomyPage />}
            {page === "roster" && <RosterPage />}
            {/*
              E2 —— 四份原本沒有後台入口的 config，共用同一個 schema 驅動的元件。
              路由 key 和 `configForms.ts` 裡 spec 的 `page` 一字不差；對不上的話
              `specForPage` 回 null，下面這一行就什麼都不畫（而不是畫一個空表單）。
            */}
            {configDocSpec !== null && <ConfigDocPage spec={configDocSpec} />}
            {page === "mapReport" && <MapReportPage />}
            {page === "arenaPool" && <ArenaPoolPage />}
            {page === "voiceGen" && voiceAdmin !== null && <voiceAdmin.Page />}
            {page === "voiceGen" && voiceAdmin === null && (
              <div style={{ color: TEXT_DIM, padding: 8 }}>載入語音生成頁…</div>
            )}
            {page === "mcoinGrant" && <MCoinGrantPage />}
            {page === "invites" && <InvitesPage />}
            {page === "audit" && <AuditPage />}
          </>
        )}
      </main>
      {changingPassword && account && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      {/* 🔍 GH#776 ⌘K —— open=false 時回 null，所以無條件掛在這裡（position:fixed）。 */}
      <CommandPalette
        rows={rows}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * The 需登入 state shown in place of a player-ops page when there is no operator
 * session. The page's data lives on the Go platform admin API, which rejects an
 * unauthenticated caller regardless — this makes that honest instead of showing
 * a page full of errors.
 */
function SessionRequired(props: { onLogin: () => void }): React.JSX.Element {
  return (
    <div style={{ maxWidth: 520 }}>
      <Panel title="需登入 · Operator sign-in required">
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 16 }}>
          此頁面為玩家 / 營運管理功能，資料由平台 admin API 提供，需要管理員登入才能使用。
          英雄 / 技能 / 道具的內容編輯不需登入即可使用。
          <br />
          This page is backed by the platform admin API and requires an operator sign-in. Content
          editing (heroes / skills / items) needs no login.
        </div>
        <Btn kind="primary" onClick={props.onLogin}>
          登入 Sign in
        </Btn>
      </Panel>
    </div>
  );
}
