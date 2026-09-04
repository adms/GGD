/**
 * 對戰設定 (`config.match@1`) —— 後台頁的純邏輯。
 *
 * ── ⚠️ 這一頁最重要的一件事：**32 個數字欄位裡有 19 個沒有任何消費端** ────────
 * 開工前先量了一遍「誰真的讀這份文件」：
 *
 *     grep -rn 'Configs.tryGet("config.match")' apps packages   →  只有兩個檔
 *       · apps/game-server/src/match/phaseConfig.ts   （三支 resolve*）
 *       · apps/client/src/audio/fireRingWindow.ts     （火圈音效窗口）
 *
 * 也就是說 `economy` / `progression` / `draft` / `tick` / `teamCount` /
 * `teamSize` 這幾塊在 TypeScript 這一側**一格都沒有人讀**：起始金錢走
 * `sim/economy/progression.ts` 的 `STARTING_GOLD`，擊殺獎金走 `GOLD_REWARDS`，
 * 背包格數走 `sim/economy/shop.ts` 的 `INVENTORY_SLOTS`，三選一的 tier 表走
 * `content/config/arena-rules.json`，隊伍數走 `constants.ts`。
 *
 * ⭐ **2026-08-20：`progression.levelCap` 那一筆矛盾修掉了**（出貨 18 → 99，
 * 對齊 `LEVEL_CAP`）。這一段以前逐字寫著「文件寫 18，程式是 99」，而**沒有任何
 * 測試在比對這兩者** —— 一句散文替一個出貨的謊背了書。現在
 * `matchConfig.test.ts` 的「出貨 config 不跟程式常數說反話」是那道閘。
 * ⚠️ 還沒修的那一筆：文件寫 `tick.snapshotHz: 20`，程式是 `SNAPSHOT_HZ = 30`。
 *
 * 把那 18 格做成可以編輯的輸入框，就是這張單要防的那個缺陷本身：操作者把起始
 * 金錢改成 2000、存檔、重啟 shard，**什麼都不會發生**，而頁面重整之後還會理直
 * 氣壯地顯示 2000（覆蓋層優先）。所以它們在這一頁是**唯讀**的，而且每一格都寫
 * 著真正的數字住在哪個檔。
 *
 * ── Go 那一側（`apps/platform/internal/opsenv`）───────────────────────────
 * 平台的「系統運維」唯讀清單會讀 `CONTENT_DIR/config/config.match.json` 來推導
 * 「一場對戰實際多長」。⚠️ 它讀的是**磁碟上的內容檔**，不是耐久覆蓋層 ——
 * `LoadMatchShape(contentDir)` 直接 `os.ReadFile`。所以在這一頁存檔之後，
 * game-server 會改變（重啟後），而平台那張表**不會**：兩邊會開始講不同的故事。
 * 這是 openQuestion，不是這一頁能修的（Go 不是這條 lane 的領域）。
 *
 * ── 存檔的基底 ────────────────────────────────────────────────────────────
 * 這一頁**不會**自己造一份 `config.match` 出來。它一定先讀到現行文件（覆蓋層
 * 優先、其次內容檔），在那份上面覆寫可調的格子再寫回去 —— 這樣 `draft.tierSchedule`
 * 那種頁面沒有畫的欄位、以及上面那 18 格唯讀的值，都原封不動。讀不到現行文件
 * 時**拒絕存檔**，因為替代方案是用一份猜出來的文件覆蓋線上。
 */
import { zConfigMatchDoc } from "@ggd/shared/content/schema/config";
import { TICK_HZ } from "@ggd/shared/constants";
import {
  fireRingRatePerSec,
  fireRingRulesFromConfig,
  type FireRingConfigLike,
} from "@ggd/shared/sim/fireRing";
import {
  boundsFor,
  deriveFields,
  deleteAtPath,
  getAtPath,
  setAtPath,
  validateNumeric,
  type DerivedField,
  type FieldBounds,
} from "./configFields";
import { validateCurve, type ConfigCurveSpec, type CurveRowDraft } from "./configCurve";

export const MATCH_COLLECTION = "config";
export const MATCH_DOC_ID = "config.match";
export const MATCH_SCHEMA = "config@1";

/** 從 Zod 推導出來的欄位清單 —— 這一頁唯一的欄位真相來源。 */
export const MATCH_DERIVED = deriveFields(zConfigMatchDoc);
export const MATCH_FIELDS: readonly DerivedField[] = MATCH_DERIVED.fields;

/**
 * schema **沒有**上界的欄位，後台自己補的上界（CLAUDE.md #277：「欄位要有上界，
 * 不是只有下界」）。
 *
 * ⚠️ 這一份 schema 的 32 個數字欄位裡，只有 8 個兩邊都有界；另外 24 個只宣告了
 * 下界（`z.number().positive()` 或 `.int().min(0)`）。所以這張表不是保險，是
 * **這一頁能不能擋住手滑的全部**。
 * 補上界的正確位置其實是 schema —— 那是 openQuestion，不是這條 lane 的領域。
 *
 * 每一個數字都有理由，而且會動的那幾個由 `matchConfig.test.ts` 釘在**真正的
 * 常數**上（`MAX_STARTING_TEAM_HEALTH` / `LEVEL_CAP` / 競技場半徑），不是打字。
 */
export const MATCH_CONSOLE_MAX: Readonly<Record<string, number>> = Object.freeze({
  // 唯讀的兩格，但推導的不變式要求每一格都有界。
  "tick.tickHz": 240,
  "tick.snapshotHz": 240,
  "match.teamCount": 8,
  "match.teamSize": 8,
  // `resolveStartingTeamHealth` 會夾到 MAX_STARTING_TEAM_HEALTH(60)；填得比它大
  // 只會讓畫面和實戰不一致，所以後台就擋在同一個數字。
  "match.startingTeamLives": 60,
  // 結算秒數：10 分鐘。再長的結算演出不是設定錯就是誤觸。
  // ⚠️ `champSelectSec` / `champSelectSecVsBot` / `intermissionSec` /
  // `combatMaxSec` / `maxRounds` **不在這張表裡** —— 它們的上界寫在 Zod schema
  // （600 / 1800 / 600 / 1800 / 50），而 `matchFieldBounds` 以 schema 優先。
  // 在這裡再補一份會變成第二個住處，兩邊漂開的時候後台會擋在一個平台根本不認的
  // 數字上（或反過來放行一個會被 PUT 退回的值）。
  // 前兩格是 2026-08-03 搬進 Zod 的；後三格是 2026-08-08（#288）—— 那三格從此
  // **開房房主也能覆蓋**，而房主那條路不經過這張表，界只能有一份，住在
  // `packages/shared/src/roomSettings.ts` 的 `ROOM_SETTING_LIMITS`。
  "match.resolutionSec": 600,
  "match.fireRing.startSec": 3600,
  "match.fireRing.shrinkSec": 3600,
  // 火圈收完的最小半徑：競技場 boundaryRadius 是 24，比它大等於「火圈永遠在場外」。
  "match.fireRing.minRadius": 24,
  // ⚠️ 二段制那三格（stage1Radius / stage2StartSec / stage2ShrinkSec）**不在這張表**：
  // 它們在 Zod 自己就有上界（24 / 3600 / 3600），`boundsFor` 會直接拿到。抄一份到
  // 這裡就是第二個「上限是多少」的答案 —— 這張表存在的理由正好相反。
  // 金錢／經驗：十萬。一場的確定性收入是 7,600 金，所以十萬已經是「一定是打錯」。
  "economy.startingGold": 100000,
  "economy.killGold": 100000,
  "economy.killBounty": 100000,
  "economy.assistGold": 100000,
  "economy.roundWinGold": 100000,
  "economy.roundLoseGold": 100000,
  // `LEVEL_CAP` 是 99；填得比它大不會多出任何一級。
  "progression.levelCap": 99,
  // ⚠️ `progression.heroStartLevel` **不在這張表裡**（2026-08-23 加進來又拿掉）：
  // 它的上下界寫在 Zod（`.int().min(1).max(99)`），而 `boundsFor` 以 schema 優先
  // ⇒ 在這裡再寫一份是**第二個住處，而且是一格死的**。那一格當時填的是 `6`
  // （owner 要的**出貨值**，不是上界）—— 假如哪天 Zod 那邊的上界被拿掉，
  // 這張表就會接手，把後台的上限靜靜夾成 6，而畫面上看不出來。
  "progression.xpBase": 100000,
  "progression.xpPerLevel": 100000,
  "progression.xpKill": 100000,
  "progression.xpAssist": 100000,
  "progression.xpRoundSurvive": 100000,
});

export function matchFieldBounds(field: DerivedField): FieldBounds | null {
  return boundsFor(field, MATCH_CONSOLE_MAX);
}

/**
 * 布林格的兩個狀態**叫什麼**。
 *
 * ⚠️ 這張表存在的理由不是美觀。`boundsFor` 對布林回 `null`（一個開關沒有上下界
 * 可講），而這一頁在 2026-08-03 之前**只有數字**一條路：每一格都畫成文字輸入框、
 * 存檔走 `Number(raw)`。把一個布林塞進那條路的結果是 `Number("true") = NaN`
 * → 那一格**永遠不會被寫進文件**，而畫面上看起來一切正常。半套的可調欄位比寫死
 * 更糟：它看起來可以調，實際上不生效 —— A1 上一輪就是因為這個被退回的。
 *
 * 一個布林值以裸的 "1"/"0"（或這裡的 "true"/"false"）顯示在控制台上是不可讀的，
 * 操作者得猜哪一邊是哪一邊，所以畫面上只出現這兩句中文，原始值不上螢幕。
 * `matchConfig.test.ts` 要求**每一個**布林欄位都在這張表裡。
 */
export interface MatchBoolLabels {
  on: string;
  off: string;
}

export const MATCH_BOOL_LABELS: Readonly<Record<string, MatchBoolLabels>> = Object.freeze({
  "match.champSelectEarlyStartVsBot": {
    on: "鎖定就開打（出貨）",
    off: "一律等選角倒數跑完",
  },
  "match.intermissionEarlyStartVsBot": {
    on: "真人按 Ready 就開打（出貨）",
    off: "一律等每一個座位都 Ready",
  },
  "match.forceSettleVsBot": {
    on: "我這場打完就結算其他場（出貨）",
    off: "等每一區自己打完",
  },
  "match.settlementCardOnHealthSpent": {
    on: "血一歸零就發結算卡（舊行為）",
    off: "只有整場結束才結算（出貨）",
  },
  "match.disposeEmptyChampSelect": {
    on: "沒有真人就收房（出貨）",
    off: "照樣配好 12 個 bot 打完",
  },
  "match.fireRing.lethalSaveApplies": {
    on: "免死擋得住火圈（回合可能被拖長）",
    off: "火圈無視免死，燒到 0 就是死（出貨）",
  },
  // GH#588 第二半 / GH#726 —— 三格的解析端在 game-server 上已經跑了一段時間，
  // 這裡補的是第一守則的第三個住處（後台）。⚠️ 「哪一邊是出貨」寫在解析端的
  // `DEFAULT_*` 常數上，⛔ 這裡不重抄一次數字。
  "match.roomCombatCapEnabled": {
    on: "打太久的房間會被收掉（出貨）",
    off: "不設上限（壓力測試／長時間錄影素材）",
  },
  "match.championLockEnforced": {
    on: "伺服器承認鎖定，鎖了就不能改選（出貨）",
    off: "鎖定只是客戶端的顯示（沙發同樂／賽事裁判要讓一個座位重選時）",
  },
  "match.scoreCheatedMatches": {
    on: "用過作弊碼的場次照樣結算分數與藍水晶",
    off: "用了就沒有分數與藍水晶（出貨，owner 明說的那一邊）",
  },
});

/** 這一格是不是布林（＝畫成開關而不是輸入框）。 */
export function isBoolField(path: string): boolean {
  return MATCH_FIELDS.find((f) => f.path === path)?.kind === "boolean";
}

// ------------------------------------------------------- 誰真的讀這一格 -----

/**
 * 一格的**消費端**。`live` 是讀它的模組；`null` 表示這份文件裡有這一格，但
 * 執行期沒有任何人讀它 —— 那種格子在頁面上是唯讀的。
 */
export interface MatchFieldInfo {
  zh: string;
  /** 它影響什麼 */
  note: string;
  /** 讀這一格的模組（顯示在畫面上，讓操作者知道改了誰會動） */
  live: string | null;
  /** `live === null` 時：真正在用的數字住在哪裡 */
  realHome?: string;
}

const RING = "game-server phaseConfig.resolveFireRing → sim/fireRing.fireRingRulesFromConfig";
const PHASE = "game-server phaseConfig.resolvePhaseConfig → PhaseMachine";

export const MATCH_FIELD_INFO: Readonly<Record<string, MatchFieldInfo>> = Object.freeze({
  "tick.tickHz": {
    zh: "模擬頻率 (Hz)",
    note:
      "文件裡有這一格，但**沒有任何程式讀它**。模擬頻率是編譯期常數，所有手感時間（硬直 2/6、受擊 12、擊倒 14）都以 tick 數表示，改頻率等於把它們全部縮放一遍，而且已錄製的對戰無法重播。",
    live: null,
    realHome: "packages/shared/src/constants.ts 的 TICK_HZ",
  },
  "tick.snapshotHz": {
    zh: "快照頻率 (Hz)",
    note:
      "同樣沒有消費端，而且**已經和程式對不上**：文件寫 20，程式是 30。客戶端插值緩衝需要約兩個快照間隔的餘裕，所以它是以「拒絕不相容的頻率」的形式被強制的，不是一個自由欄位。",
    live: null,
    realHome: "packages/shared/src/constants.ts 的 SNAPSHOT_HZ",
  },
  "match.teamCount": {
    zh: "隊伍數",
    note: "沒有消費端。座位配置是編譯期常數（4 隊 × 3 人 = 12 個座位），競技場的 zone 數也跟著它走。",
    live: null,
    realHome: "packages/shared/src/constants.ts 的 TEAM_COUNT",
  },
  "match.teamSize": {
    zh: "每隊人數",
    note: "沒有消費端，理由同上。",
    live: null,
    realHome: "packages/shared/src/constants.ts 的 TEAM_SIZE",
  },
  "match.startingTeamLives": {
    zh: "起始隊伍生命值",
    note:
      "整場對戰有多長就是這一格決定的：每回合輸的隊伍扣 2/4/6…（第 7 回合起再多 3），扣到 0 淘汰。調大 = 回合數變多、整場變長；調小 = 很快就結束。⚠️ 名字寫「生命」但它是一池**分數**，不是每人幾條命。",
    live: "game-server phaseConfig.resolveStartingTeamHealth → PairedDuels",
  },
  "match.maxRounds": {
    zh: "總回合數上限",
    note:
      "一場最多打幾回合。**0 = 不設限**，也就是照賽制打到最後一回合（決賽）為止（＝現在的行為，出貨值）。" +
      "填 6 = 第 6 回合打完就結算，不管各隊的團隊生命還剩多少。⚠️ 它只加一條**提前**結束的條件，" +
      "原本「打完決賽才結束」那條一格都沒被碰到（兩條是 OR，先到的算），所以填得比決賽回合數還大 = 沒有效果。" +
      "⚠️ 不要把它想成「打到團隊生命歸零」—— owner 2026-07-27 取消淘汰之後，生命歸零**不會讓任何人出局**，" +
      "它只是決定名次的計分板（見 game-server 的 PairedDuels.FINAL_ROUND 檔頭）。" +
      "⚠️ **開房的房主可以覆蓋這一格**（#288）——這裡設的是「房主沒特別指定時用哪個」，不是每一場的最終值。",
    live: "game-server MatchRoom 回合上限（roomSettings.roundCapReached）→ 提前進入結算",
  },
  "match.champSelectSec": {
    zh: "選角秒數（有人類對手）",
    note: "champ-select 階段多長。太短玩家來不及看英雄檔案（客戶端的簡報閘要求它有餘裕），太長每一場開頭**其他人**都在等。",
    live: PHASE,
  },
  "match.champSelectSecVsBot": {
    zh: "選角秒數（vs bot 一鍵開打）",
    note: "只有自己一個人、其餘都是 bot 的那種局，選角可以拉多長。沒有人在等你，所以這一格可以放心調大（出貨值 320 秒）。⚠️ 判準是「人類座位只有 1 個」，不是「場上有 bot」—— 每一場都有 bot 填空位。留空 = 跟上面那格一樣。",
    live: PHASE,
  },
  "match.champSelectEarlyStartVsBot": {
    zh: "vs bot：鎖定英雄就直接開打",
    note:
      "只有自己一個人類、其餘都是 bot 的那種局，人類鎖定英雄的那一刻就進戰鬥，不等上面那個選角倒數跑完（owner 2026-08-03:「vs bot 選角後就可以開始進入戰鬥不用等，一樣是因為不用等其他 bot」）。" +
      "關掉＝一律等倒數，也就是這一格出現之前的行為。⚠️ 沒有第三種「等 bot 也選完」——bot 不在選角階段選，牠們是在階段結束時一次配好的。" +
      "⚠️ 判準是「人類座位只有 1 個」，不是「場上有 bot」：每一場都有 bot 填空位，用它判會讓三個朋友一起打的局也被第一個鎖定的人拖走。",
    live: PHASE,
  },
  "match.forceSettleVsBot": {
    zh: "vs bot：我這場打完就強制結算其他場",
    note:
      "一個回合有兩個競技場，而相位要**每一區都有勝負**才結束 —— 所以一個人打 bot 局時，自己三十秒打完之後還要看著另一區的兩隊 bot 慢慢磨到火圈。" +
      "開著（出貨）＝人類那一區記下勝負的同一刻，其餘還在打的區用**和時間到完全一樣的裁決**（團隊血量比例高者勝、平手擲骰）立刻結算。" +
      "⚠️ 它只縮短**等待**，不改變任何一區的勝負規則，也碰不到你自己那一場的結果。人類那一隊輪空（這一回合沒有配對）時不會觸發 —— 否則那一回合會在第一個 tick 就結束。",
    live: PHASE,
  },
  "match.settlementCardOnHealthSpent": {
    zh: "隊伍生命歸零就發「戰鬥結束」結算卡",
    note:
      "團隊生命打到 0 的那一刻，要不要**當場**發給那一隊一張結算卡（評價 + 返回大廳）。" +
      "⚠️ 開著會有一個真實的後果：團隊生命是**計分板**，它只決定 2/3/4 名 —— 第 1 名由第 10 回合的決賽決定，**不看團隊生命**。" +
      "所以一支第 7 回合把血打光的隊伍照樣打完全場、照樣可能奪冠，而牠已經先收到一張寫著「戰鬥結束」的卡並被請去大廳。按下去就是放棄一場自己會贏的比賽（GH#264 實測：seed 4242 的 team 0 就是這樣拿第 1 名的）。" +
      "關著（出貨）= owner 2026-07-27「不管前面被淘汰與否，大家都回來打第 10 回合」的字面意思：比賽沒結束就沒有人出局，離場走一般的「確定要離開嗎」確認框。" +
      "打開的代價換來的是：計分板墊底的人可以提早看自己的評價再走。",
    live: "game-server MatchController.eliminatedTeams → takeEliminationSettlements → MatchRoom 廣播",
  },
  "match.disposeEmptyChampSelect": {
    zh: "選角結束時沒有真人 → 收房",
    note:
      "選角相位結束的那一刻，如果房裡**一個真人都沒有**（沒有連線、也沒有還沒被領走的保留席位），要不要直接把房間收掉。" +
      "開著（出貨）＝收掉。owner 2026-08-23:「限制一名玩家同時最多只能在一個房間，如果有玩家馬上 kill AI」。" +
      "關掉＝這一格出現之前的行為：系統幫 12 個座位全部配好英雄，然後一場**沒有人在看**的比賽以 30Hz 打到底；" +
      "練習房更是永遠打不完（`endlessCombat` 讓相位停在戰鬥，實測 60,660 tick 還在跑）。那正是「離開房間之後還有隱形英雄在打我」的來源。" +
      "⚠️ 保留席位那一條不能少：客戶端要先下載資產才連得上遊戲 socket（保留席位開 120 秒），而 PvP 的選角只有 20 秒 —— 少了它，網路慢的玩家會在自己還在讀取時被收房。",
    live: "game-server MatchRoom.loop（選角相位結束的那一 tick）",
  },
  "match.roomCombatMaxSec": {
    zh: "房間進入戰鬥後的存活上限（秒）",
    note:
      "owner 2026-08-23:「每間房間存活時間**只要開始進入戰鬥後**，存活時間最多 30 分鐘，避免幽靈房間」。" +
      "計時的起點是**戰鬥第一次開始**的那一刻（選角／中場／商店都不算），量的是**牆上時鐘**而不是 tick —— " +
      "掉 tick 的房間跑得比真實時間慢，而幽靈房間吃的是真實的 CPU 秒。" +
      "⚠️ 它是一條**獨立於相位機**的兜底：練習房的相位永遠停在戰鬥（`endlessCombat`），所以「等相位走完」對它結構性失明。" +
      "⚠️ **留白 = 用解析端的預設**（`DEFAULT_ROOM_COMBAT_MAX_SEC`），⛔ 不是 0 —— 0 會被下界擋掉（那等於「一進戰鬥就收房」）。",
    live: "game-server rooms/roomLifetime.resolveRoomCombatLifetime → MatchRoom 的收房判斷",
  },
  "match.roomCombatCapEnabled": {
    zh: "上面那條存活上限要不要生效",
    note:
      "關掉整條兜底。⚠️ 這一格存在的理由是**回頭**，⛔ 不是觀望：壓力測試與長時間錄影素材是關掉它的合法用途，" +
      "而關著的代價正是 owner 抱怨的那個 —— 一場沒有人在看的比賽以 30Hz 打到底，佔著一顆核心。" +
      "⚠️ 留白 = 用解析端的預設（`DEFAULT_ROOM_COMBAT_CAP_ENABLED`），⛔ 不是關。",
    live: "game-server rooms/roomLifetime.resolveRoomCombatLifetime",
  },
  "match.championLockEnforced": {
    zh: "伺服器強制英雄鎖定",
    note:
      "選角時按下鎖定之後，伺服器要不要**拒絕**後續的改選。" +
      "關掉＝鎖定只是客戶端的顯示，於是一個改造過的客戶端可以鎖定後一直換人，而其他人看到的是他早就定案了。" +
      "⚠️ 合法的關掉理由只有一種：沙發同樂／賽事裁判真的要讓某一個座位重選。" +
      "⚠️ 留白 = 用解析端的預設（`DEFAULT_CHAMPION_LOCK_ENFORCED`）。",
    live: "game-server match/integrityPolicy.resolveChampionLockEnforced → MatchRoom 的選角訊息處理",
  },
  "match.scoreCheatedMatches": {
    zh: "用過作弊碼的場次照樣結算",
    note:
      "owner:「1 vs bot 可以用作弊碼，但**用了就沒有分數與藍水晶**」。開著＝那一場照樣進 MMR／賽季積分與錢包。" +
      "⚠️ 合法的打開理由：內部壓力測試想要一份真的有結算的錄影。" +
      "⚠️ 它一個字都不改任何傷害數字 —— 只決定伺服器承不承認這一場的結果。" +
      "⚠️ 留白 = 用解析端的預設（`DEFAULT_SCORE_CHEATED_MATCHES`）。",
    live: "game-server match/integrityPolicy.resolveScoreCheatedMatches → MatchRoom 結算",
  },
  "match.intermissionSec": {
    zh: "中場（商店）秒數",
    note:
      "回合之間逛商店的時間。太短買不完三選一 + 商店；太長節奏會斷。" +
      "⚠️ **開房的房主可以覆蓋這一格**（#288）——這裡設的是「房主沒特別指定時用哪個」。",
    live: PHASE,
  },
  "match.combatMaxSec": {
    zh: "戰鬥硬底線（秒）",
    note:
      "戰鬥階段強制結束的時間點。⚠️ 它**不是**預期的回合長度 —— 火圈會先收完並逼出結果。必須留得下**整個火圈**（起燃秒數＋收圈秒數），否則圈還在縮就被強制結束，僵局破不了。" +
      "⚠️ **開房的房主可以覆蓋這一格**（#288），而房主那一側的**最小值是從火圈設定推導的**（起燃 + 整個圈收完）：這裡把火圈調長，房主能設的每回合時間下限就跟著往上。",
    live: PHASE,
  },
  "match.resolutionSec": {
    zh: "結算秒數",
    note: "回合結束後的結算演出長度（勝利畫面、煙火、語音）。",
    live: PHASE,
  },
  "match.fireRing.startSec": {
    zh: "① 第一段起燃（戰鬥第幾秒）",
    note:
      "**回合長度的單一真相**：戰鬥經過這麼多秒之後，火圈從場地邊界出現並開始收縮（第一段）。調小 = 每回合更短更急；調大 = 更多對線時間。客戶端的緊張感音樂也是從這一格推出來的。" +
      "⚠️ 下面的『第二段起燃』是**戰鬥第幾秒**的絕對值，但實際生效的是兩者的**差**：殭屍王把起燃往後推的時候，第二段會跟著推同樣多，整個圈的形狀不會被拆開。",
    live: RING + "；client audio/fireRingWindow",
  },
  "match.fireRing.shrinkSec": {
    zh: "② 第一段縮多久（秒）",
    note:
      "第一段從場地邊界收到『停止縮圈的半徑』要多久。調小 = 火圈瞬間逼近，走位空間一下子沒了；調大 = 慢慢絞。收圈**速率**是推出來的（（場地半徑 − 停止縮圈的半徑）÷ 這一格），所以動這一格不會動到口袋大小。",
    live: RING + "；client audio/fireRingWindow",
  },
  "match.fireRing.stage1Radius": {
    zh: "第一段停下來的半徑（可以站的口袋）",
    note:
      "owner 2026-08-02「第一段燒 20 秒就**停止縮圈**」—— 停在這個半徑，直到第二段開始。" +
      "⚠️ **它必須比角色碰撞半徑（0.6）大**，否則「停止縮圈」只是把處決延後：判定是「整個身體要在圈內」，圈比身體小就等於全場沒有一個站得住的位置。出貨 4.0 = 可站立的圓盤半徑 3.4，三個人塞得下、又被逼到貼身。下界 1 就是為了守住這件事。" +
      "⚠️ 留白 = **沒有口袋**，第一段直接縮到『全地圖淹沒後的半徑』（也就是二段制之前的行為）。",
    live: RING,
  },
  "match.fireRing.stage2StartSec": {
    zh: "③ 第二段起燃（戰鬥第幾秒）",
    note:
      "owner 2026-08-02「第二段燒到**全地圖淹沒**，起始於 90 秒」。從這一秒起火圈**恢復收縮**，一路收到下面那個半徑。出貨 60 / 20 / 90 = 起燃 60、80 秒停住、喘息 10 秒、90 秒開始淹。" +
      "⚠️ **必須 >= 第一段起燃 + 第一段縮多久**，否則喘息期是負的（存檔時會被擋下並指名這一格）。" +
      "⚠️ **這一格留白 = 整個第二段關掉**，火圈就只有一段（二段制之前的行為）。線上如果先前存過一份舊的對戰設定，它裡面沒有這一格 —— 那一場會是單段，直到在這一頁把它存進去。",
    live: RING,
  },
  "match.fireRing.stage2ShrinkSec": {
    zh: "④ 第二段縮多久（秒）",
    note:
      "第二段從『停止縮圈的半徑』收到『全地圖淹沒』要多久。調小 = 口袋瞬間消失，沒有走位餘地；調大 = 最後的絞殺拉長。只有在『第二段起燃』有填的時候才會被讀；留白 = 20 秒（和第一段一樣）。",
    live: RING,
  },
  "match.fireRing.minRadius": {
    zh: "全地圖淹沒後的半徑",
    note:
      "第二段的終點。出貨 **0** = owner 說的「全地圖淹沒」：圈收到沒有，全場都是火。" +
      "⚠️ 任何小於角色碰撞半徑（0.6）的值都已經是「沒有生存空間」（判定是整個身體要在圈內），所以 0 和 0.5 在**機制上**一樣；差別是 0 才誠實地說出「淹沒」這件事。" +
      "⚠️ 客戶端的火牆是一圈**帶狀**網格，半徑 0 的那一瞬間它會縮到看不見 —— 那是渲染的限制，不是機制的。",
    live: RING,
  },
  "match.fireRing.maxPctPerSec": {
    zh: "每秒燒傷上限（佔最大生命）",
    note:
      "**站在圈外時，每一秒最多能被扣掉最大生命的百分之幾。** 0.5 = 一秒最多掉半條命（滿血撐兩秒）；調到 1.0 = 一秒滿血變空；調低 = 圈外活得更久，收圈的壓迫感整個變鈍。owner 2026-08-02：「可以把燃燒真傷上限數值設定放在後台，例如預設最高是50%之類，不必到100%」。" +
      "⚠️ 它是夾在灼燒曲線**之上**的一道牆，出貨值 0.5 **確實低於曲線的尾巴**（最後一列是 1.0）：第 100 秒那一下被夾成每秒半條命，還是必死，只是要兩秒不是一秒。要讓曲線的高處真的燒出來，就把這一格調高。" +
      "⚠️ 留白 = 回到出貨的 0.5，**不是「不設限」**（schema 與 sim 兩層填的是同一個常數）。上界 1.0 以上不會改變任何玩家看得到的東西。",
    live: RING,
  },
  "match.fireRing.lethalSaveApplies": {
    zh: "火圈燒傷擋不擋得住【免死】",
    note:
      "**火圈燒傷會不會被【免死】擋下來。** 關閉（出貨預設）= 火圈無視免死，燒到 0 就是死 —— 火圈存在的理由是**強制結束回合**。" +
      "開啟 = 帶免死標記的英雄（例如狂戰士【十二道試煉】的 12 層）會在火圈裡**逐層消耗**免死次數，等於一個人可以在圈外站 12 次，回合會被拖長。" +
      "⚠️ 這一格 owner 還沒表態，所以預設是「保留今天的行為」那一個；要不要讓試煉在火圈裡也算數，是這個開關要問的問題。" +
      "⛔ **無敵不吃這一格**：那是每支技能自己卡片上的 `blocksTrueDamage`，不是全域開關 —— 同一個問題只有一個地方回答。",
    live: RING + " → sim/combat/environmentalBurn",
  },
  "match.fireRing.roundHardCapSec": {
    zh: "回合硬上限（秒）",
    note:
      "**回合到這個時間一定開始收場，任何延長條件都無效。** 戰鬥經過這麼多秒之後，火圈一定起燃並開始收縮，不管殭屍王延後了幾次。owner 2026-08-01：「不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場，不會無限增加時間」。" +
      "⚠️ 它擋的是**累加**：殭屍王每 100 隻殭屍可以再召喚一次（每位英雄各自計數），每一次都 +180 秒 —— 上面兩格的上界只擋單次，擋不住總和。" +
      "沒有「停用」開關：要打馬拉松就把這個數字調大（上限 1800 = 30 分鐘），這樣至少還是有一個界。",
    live: RING + " → sim/fireRing.applyRoundHardCap",
  },
  "match.fireRing.boss.extendCombatSec": {
    zh: "殭屍王出現時，戰鬥硬底線延長（秒）",
    note:
      "每召喚一次殭屍王，戰鬥硬底線往後推這麼多秒。owner 2026-07-30：「殭屍王出現回合結束時間延長 3 分鐘…避免打到一半結果回合結束」。0 = 關掉這一半。" +
      "⚠️ 它會被**回合硬上限**截斷：超過上限的那幾秒不會發生，而且畫面上的倒數也只會拿到真的加上去的秒數（不是這一格的數字）。",
    live: RING + " → sim/fireRing.extendRoundForBoss",
  },
  "match.fireRing.boss.delayFireRingSec": {
    zh: "殭屍王出現時，火圈起燃延後（秒）",
    note:
      "每召喚一次殭屍王，火圈的起燃時間往後推這麼多秒。⚠️ 它和上面那一格是**兩個不同的期限**（一個是節奏，一個是回合上限），而且延後不可以大過延長 —— 否則王一出現，火圈就被推到硬底線之後，僵局破不了的那一回合正好是最需要它的那一回合（schema 有一條檢查在守）。" +
      "⚠️ 一樣會被**回合硬上限**截斷：推到上限就停，第三隻王不會再把火圈往後推。",
    live: RING + " → sim/fireRing.extendRoundForBoss",
  },
  "economy.startingGold": {
    zh: "起始金錢",
    note:
      "沒有消費端。整條價格階梯是照一場 7,600 金的收入推的，而 600 剛好是兩件 300 金的初級道具 —— 那個「兩件便宜的還是存起來」的抉擇就是靠它成立的。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 STARTING_GOLD",
  },
  "economy.killGold": {
    zh: "擊殺金錢",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS.kill",
  },
  "economy.killBounty": {
    zh: "首殺賞金（選填）",
    note: "沒有消費端。每位敵方英雄第一次被殺時，在擊殺金錢之上額外付一次。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS.killBounty",
  },
  "economy.assistGold": {
    zh: "助攻金錢",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS.assist",
  },
  "economy.roundWinGold": {
    zh: "回合勝利金錢",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS.roundWin",
  },
  "economy.roundLoseGold": {
    zh: "回合失敗金錢",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 GOLD_REWARDS.roundLose",
  },
  "economy.sellRefund": {
    zh: "賣出退款比例",
    note: "沒有消費端。賣掉道具退回原價的多少（0～1）。",
    live: null,
    realHome: "packages/shared/src/sim/economy/shop.ts 的 SELL_REFUND",
  },
  "economy.inventorySlots": {
    zh: "背包格數",
    note: "沒有消費端。角色生成時的道具格數。",
    live: null,
    realHome: "packages/shared/src/sim/economy/shop.ts 的 INVENTORY_SLOTS",
  },
  "economy.legendaryOrbPrice": {
    zh: "傳說寶玉一次多少錢",
    note: "⭐ 有消費端（2026-09-01 接上）—— 商店裡抽一次傳說的價錢。⛔ 在此之前它是程式常數。",
    live: "sim economy/legendaryOrb.buyLegendaryOrb → shopChargeFor（開賽前定格在 world.economy）",
    realHome: "packages/shared/src/sim/economy/economyRules.ts 的 DEFAULT_ECONOMY",
  },
  "economy.statTickPrice": {
    zh: "一次屬性精粹多少錢",
    note: "⭐ 有消費端（2026-09-01 接上）—— 買一次三圍精粹的價錢。",
    live: "sim economy/statPath.buyStatUpgrade → shopChargeFor（開賽前定格在 world.economy）",
    realHome: "packages/shared/src/sim/economy/economyRules.ts 的 DEFAULT_ECONOMY",
  },
  "economy.statTickTarget": {
    zh: "累積幾次精粹解鎖頂點",
    note:
      "⭐ 有消費端（2026-09-01 接上）。⚠️ 它與底下的「第幾回合起解鎖」**相乘**才是「這條路線打不打得開」——" +
      "CLAUDE.md 逐字記著前科：兩個常數乘起來變成不可能，而且一個都改不到。⛔ 下界 1：0 = 開場就有頂點（機制消失）。",
    live: "sim economy/statPath.statTicksRemaining / grantCapstone ＋ 結算面板的分母",
    realHome: "packages/shared/src/sim/economy/economyRules.ts 的 DEFAULT_ECONOMY",
  },
  "economy.capstoneRoundGate": {
    zh: "第幾回合起頂點才解鎖",
    note:
      "⭐ 有消費端（2026-09-01 接上）。⭐ 0 = 不設閘（第一回合就開得了）。" +
      "⚠️ 實打一場只有 5–6 回合 ⇒ 這一格設得比回合數高，那條路線就**永遠開不了**（#82 的前科）。",
    live: "sim economy/statPath.capstoneRoundReached（每一次商店開啟都問它）",
    realHome: "packages/shared/src/sim/economy/statPath.ts 的 capstoneRoundReached",
  },
  "economy.assistWindowTicks": {
    zh: "助攻認定窗（tick）",
    note:
      "⭐ 有消費端（2026-09-01 接上）。死前這麼多 tick 內打過它的敵人（⛔ 不含補刀的那個）算一次助攻。" +
      "30 tick = 1 秒 ⇒ 出貨 300 ＝ 10 秒。⛔ **連殺窗刻意不可調**：客戶端音效直接共用那個常數，" +
      "做成設定而客戶端讀不到，會讓記分板與音效對「8–10 秒的第二顆人頭」說不同的話（那是 #234 修掉的 bug）。",
    live: "sim stats/matchStats.recordChampionDeath（每一次英雄死亡都問它）",
  },
  "progression.roundGrantKeepsRemainder": {
    zh: "回合給等**保留**經驗條餘額",
    note:
      "⭐ **出貨開著**（GH#910）。owner 2026-09-01：「殭屍給的經驗值好像有問題」·「**不是故意的**」。" +
      "⛔ 關掉＝舊行為：回合給等只補「差到下一級的那一段」⇒ 玩家累積在條上的進度被系統**吸收掉**。" +
      "⚠️ 一場有 49 次回合給等 ⇒ 量到中等強度的玩家**打的殭屍有六到七成白打**（每回合殺 25 隻 ⇒ 191/250 隻）。" +
      "⭐ 打開＝給滿一整級的量，餘額往上疊；⚠️ 玩家等級會**變高**（量到 +3～4 級），⭐ 那是這一格的目的。",
    live: "sim economy/progression.grantLevels（每一次回合給等、每 30 隻殭屍的加等都問它）",
  },
  "progression.levelCap": {
    zh: "等級上限",
    note: "沒有消費端 —— `grantLevels` / `grantXp` 讀的是程式裡的 `LEVEL_CAP`。⭐ 2026-08-20 起出貨值**與它相等**（99），由測試釘住；在此之前文件寫 18 而程式是 99，兩邊說了六個月的反話。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 LEVEL_CAP",
  },
  "progression.heroStartLevel": {
    zh: "⭐ 英雄登場初始等級",
    note: "owner 2026-08-23 逐字：「**英雄登場初始等級設定為 6**」。⚠️ 在這一格出現之前這個數字**不存在** —— `spawnChampion` 的 `level: args.level ?? 1` 是一個**寫死的預設**，而 `MatchController` 從來沒傳過 `level` ⇒ 每一場都從 LV1 開始、⛔ 而後台調不到（第一守則）。⭐ 為什麼它重要（2026-08-23 量到的）：五級距是**固定值**（極大 2000），而血量隨等級成長 ⇒ **同一發極大在 LV1 佔 41.7%、在 LV99 佔 3.0%，差 14 倍**。owner 回報「技能兩三發就會死」的位置正是 LV1–LV5，而抬高登場等級**直接**把那一段的血條墊厚。⇒ 調小＝開場更脆、調大＝開場更耐打（也更快接近等級上限）。",
    // ⭐ 它**真的有消費端**（`isEditable` 就是問這件事）：
    //    `MatchController.ts:1470` 每一次 `spawnChampion` 都讀
    //    `heroStartLevel(Configs.tryGet("config.match"))`。
    // ⚠️ 這一格加進來的時候寫的是 `live: null` ⇒ 畫面上被畫成 **disabled**，
    //    也就是 owner 2026-08-23 明說要調的那一格，後台**點不動** ——
    //    比寫死更糟的「半套可調欄位」（同這個檔在布林那一段記的教訓）。
    //    `matchConfig.test.ts` 的「19 格唯讀」與 `matchConfigSave.test.ts` 的
    //    「唯讀都是 disabled」兩條同時紅，正是抓到它。
    live: "apps/game-server/src/match/MatchController.ts → spawnChampion({ level })",
  },
  "progression.xpBase": {
    zh: "升級經驗基底",
    note: "沒有消費端。`xpToNext(level) = xpBase + xpPerLevel × (level − 1)` 的第一項。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 xpToNext",
  },
  "progression.xpPerLevel": {
    zh: "每級遞增經驗",
    note: "沒有消費端，理由同上。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 xpToNext",
  },
  "progression.xpKill": {
    zh: "擊殺經驗",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 XP_REWARDS.kill",
  },
  "progression.xpAssist": {
    zh: "助攻經驗",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 XP_REWARDS.assist",
  },
  "progression.xpRoundSurvive": {
    zh: "回合存活經驗",
    note: "沒有消費端。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 XP_REWARDS.roundSurvive",
  },
  "rating.kda": {
    zh: "(擊殺+助攻)/死亡 拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.killParticipation": {
    zh: "參團數拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.damage": {
    zh: "輸出拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.tanked": {
    zh: "承傷拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.healed": {
    zh: "治療拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.ccTicks": {
    zh: "控場拿滿分的門檻（tick，30 = 1 秒）",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.objectives": {
    zh: "目標分拿滿分的門檻（吃花數）",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "rating.rescues": {
    zh: "救援拿滿分的門檻",
    note: "⭐ **賽後評分的基準錨**（2026-09-01 起可調）。每一格是「這一軸拿滿分要多少」——⭐ **調小 = 更容易拿高分**。⚠️ 它在此之前是 `sim/stats/rating.ts` 裡的一個寫死常數，⛔ 而那個檔的檔頭自己寫著「documented so balance/**tuning is auditable**」⇒ 它明說這是要調的東西，而它調不到。⛔ 填 0 或負值會被退回出貨值（那會讓這一軸永遠滿分）。",
    live: "game-server MatchController 結算 → grade(…, ratingRefs) → 賽後評級 S+…C-",
    realHome: "packages/shared/src/sim/stats/rating.ts 的基準錨",
  },
  "draft.offerCount": {
    zh: "三選一的卡片數",
    note: "沒有消費端。真正決定發幾張卡的是競技場規則那一份文件。",
    live: null,
    realHome: "content/config/arena-rules.json → game-server arenaRules.ts",
  },
});

export function matchInfoFor(path: string): MatchFieldInfo {
  return (
    MATCH_FIELD_INFO[path] ?? {
      zh: path,
      note: "（這一格還沒有說明 —— 請補進 MATCH_FIELD_INFO）",
      live: null,
      realHome: "未知",
    }
  );
}

/** 這一格在頁面上編不編得動 = 執行期有沒有人讀它。 */
export function isEditable(path: string): boolean {
  return matchInfoFor(path).live !== null;
}

// -------------------------------------------------------------- 群組 --------

export interface MatchGroup {
  key: string;
  title: string;
  intro: string;
  paths: readonly string[];
}

/** 顯示分組。`groupsCoverAllFields` 要求每一個推導出來的欄位都在其中一組。 */
export const MATCH_GROUPS: readonly MatchGroup[] = [
  {
    key: "clock",
    title: "回合時鐘（可調）",
    intro:
      "一場對戰的節奏：每個階段多長、整場打幾回合。這一組每一格都真的被 game-server 讀。" +
      "⚠️ 其中四格（選角秒數／中場秒數／戰鬥硬底線／總回合數上限）從 #288 起**開房的房主可以覆蓋**：" +
      "這一頁設的是**房主沒特別指定時**用哪個值，房主動過的那一場以房間設定為準。房主沒碰的欄位一律退回這裡的值 —— 包含 vs bot 的選角秒數。",
    paths: [
      "match.startingTeamLives",
      "match.maxRounds",
      "match.champSelectSec",
      "match.champSelectSecVsBot",
      "match.champSelectEarlyStartVsBot",
      "match.forceSettleVsBot",
      "match.settlementCardOnHealthSpent",
      "match.disposeEmptyChampSelect",
      "match.intermissionSec",
      "match.combatMaxSec",
      "match.resolutionSec",
    ],
  },
  {
    key: "roomIntegrity",
    title: "房間存活與誠信（可調）",
    intro:
      "這一組**不影響任何一場比賽裡發生的事** —— 它決定「這間房還該不該存在」與「伺服器承不承認客戶端說的話」，" +
      "所以刻意與上面的回合時鐘分開：那一組調的是節奏，這一組調的是**邊界**。" +
      "⚠️ 四格全部是 `.optional()`，**留白 = 用 game-server 解析端的 `DEFAULT_*`** —— " +
      "⛔ 不是 0／關。畫面上留白不代表功能沒開，代表「沒有人在這裡覆蓋它」。" +
      "⚠️ 存檔之後要**重啟 game-server shard**才生效（同這一頁其餘每一格）。",
    paths: [
      "match.roomCombatMaxSec",
      "match.roomCombatCapEnabled",
      "match.championLockEnforced",
      "match.scoreCheatedMatches",
    ],
  },
  {
    key: "fireRing",
    title: "火圈（可調）",
    intro:
      "回合的收尾機制：起燃時間就是「這一回合打算打多久」，收圈把僵局逼出結果。整個區塊可以停用 —— 停用之後回合會一路打到硬底線。" +
      "**二段制**（owner 2026-08-02）：①第一段起燃 → ②縮 N 秒後**停在一個站得住的口袋** → ③第二段起燃 → ④再縮 N 秒到**全地圖淹沒**。出貨是 60 / 20 / 90 / 20，也就是 60 起、80 停、90 續、110 淹沒。" +
      "⚠️ 這一組裡有兩個**會延長回合**的格子（殭屍王那兩格）和一個**擋住延長**的格子（回合硬上限）：延長是每召喚一次就加一次，硬上限是總和的天花板。它們推的是**整個圈**，兩段之間的間隔不會被拉開。",
    paths: [
      "match.fireRing.startSec",
      "match.fireRing.shrinkSec",
      "match.fireRing.stage1Radius",
      "match.fireRing.stage2StartSec",
      "match.fireRing.stage2ShrinkSec",
      "match.fireRing.minRadius",
      "match.fireRing.maxPctPerSec",
      "match.fireRing.lethalSaveApplies",
      "match.fireRing.roundHardCapSec",
      "match.fireRing.boss.extendCombatSec",
      "match.fireRing.boss.delayFireRingSec",
    ],
  },
  {
    key: "progression",
    title: "英雄登場（可調）",
    intro:
      "英雄第一次站上場地時的起點。⭐ 這一組目前只有一格 —— **登場初始等級**，" +
      "`MatchController` 每一次 `spawnChampion` 都真的讀它（owner 2026-08-23「英雄登場初始等級設定為 6」）。" +
      "⚠️ 底下那一組（唯讀）裡的等級上限與經驗欄位**不在這裡**：那些的數字住在程式常數，" +
      "調了不會生效 —— 兩組的差別就是「有沒有人讀」。",
    paths: ["progression.heroStartLevel"],
  },
  {
    key: "dead",
    title: "⚠️ 唯讀 · 這些格子沒有任何消費端",
    intro:
      "這份文件裡有它們、schema 也驗它們，但執行期**沒有任何程式讀**：真正在用的數字是編譯進去的常數或別份文件。" +
      "做成可編輯的話，操作者會存下一個永遠不會生效的值，而頁面重整之後還會顯示它 —— 那正是這一頁要防的缺陷。" +
      "每一格下面寫著真正的數字住在哪裡。",
    paths: [
      "tick.tickHz",
      "tick.snapshotHz",
      "match.teamCount",
      "match.teamSize",
      "economy.startingGold",
      "economy.killGold",
      "economy.killBounty",
      "economy.assistGold",
      "economy.roundWinGold",
      "economy.roundLoseGold",
      "economy.sellRefund",
      "economy.inventorySlots",
      "economy.legendaryOrbPrice",
      "economy.statTickPrice",
      "economy.statTickTarget",
      "economy.capstoneRoundGate",
      "economy.assistWindowTicks",
      "progression.levelCap",
      "progression.roundGrantKeepsRemainder",
      "progression.xpBase",
      "progression.xpPerLevel",
      "progression.xpKill",
      "progression.xpAssist",
      "progression.xpRoundSurvive",
      "rating.kda",
      "rating.killParticipation",
      "rating.damage",
      "rating.tanked",
      "rating.healed",
      "rating.ccTicks",
      "rating.objectives",
      "rating.rescues",
      "draft.offerCount",
    ],
  },
];

/** 火圈是唯一一個真的 `.optional()`、可以整塊拿掉的區塊。 */
export const FIRE_RING_BLOCK = "match.fireRing";

// ------------------------------------------------------ 灼燒曲線（斷點表）----

/**
 * `match.fireRing.burnCurve` —— owner 2026-08-02 的「隨秒數越高越燒越痛」。
 *
 * 它是**陣列**，所以 `deriveFields` 走不進去（放不進一個輸入框），會落在
 * `MATCH_DERIVED.unsupported`。而「不編輯的分支只能原封不動帶著走」對這一張表
 * 是錯的 —— 這次改動的**全部**就是這張表，把它宣告成「這一頁不編輯」等於這次
 * 改動在後台不存在（`configCurve.ts` 檔頭對 `attackRangeCurve` 講的同一件事）。
 * 所以它走 `configCurve.ts` 那條既有的「可加/刪列」路徑，不是 `MATCH_FIELDS`。
 */
export const BURN_CURVE_PATH = "match.fireRing.burnCurve";

export const BURN_CURVE_SPEC: ConfigCurveSpec = {
  path: BURN_CURVE_PATH,
  title: "灼燒曲線（越燒越痛）",
  intro: [
    "火圈**點燃之後**，圈外的人每秒掉多少比例的**自身最大生命**。這是真實傷害：不吃護甲、魔抗，也不吃「戰鬥系統」的傷害倍率，所以 276,944 血的殭屍王和 3,000 血的英雄用的是同一個時鐘。",
    "兩列之間**線性內插**，最後一列之後**維持**在那個值（不會繼續往上爬）。要更陡或更長就**加一列**，最多 8 列。",
    "⚠️ 第一欄是「**點燃後**第幾秒」，不是「回合第幾秒」。殭屍王會把起燃往後推 180 秒、決賽輪直接改成 180 秒 —— 用回合秒數的話，那些回合的圈一出現就已經是最痛的那一格，圈外的人一秒蒸發。所以下面每一列都同時標出「回合第幾秒」，那一欄會跟著上面的『火圈起燃』一起動。",
    "⚠️ 1.0 = 每秒燒掉一整條滿血 = 一秒必死（owner 說的極端值）。上限開到 2.0（半秒必死），再往上火圈就不是危險而是一條瞬殺線 —— 那是『收完後的半徑』的工作。",
  ],
  x: {
    key: "sec",
    zh: "點燃後第幾秒",
    note: "從火圈出現那一刻起算的秒數。第一列必須是 0（起燃當下），而且必須由小到大。",
    min: 0,
    max: 600,
  },
  y: {
    key: "pctPerSec",
    zh: "每秒燒掉幾成最大生命",
    note: "0.2 = 每秒 20%（五秒燒完一條命）。1 = 每秒 100% = 一秒必死。",
    min: 0,
    max: 2,
  },
  minRows: 2,
  maxRows: 8,
  // `curvePreviewRows` 是 bodyScale 專用的,火圈走下面自己那一支。
  previewAt: [],
};

/** 曲線預覽的一列。 */
export interface BurnCurvePreviewRow {
  /** 點燃後第幾秒 */
  sinceIgniteSec: number;
  /** 同一刻是「回合第幾秒」（= 火圈起燃 + 上面那個數字） */
  roundSec: number;
  /** 這一刻每秒燒掉的最大生命比例（已經夾過上限） */
  pctPerSec: number;
  /** 從這一刻起站在圈外不回來，還能撐幾秒（null = 這條曲線燒不死人） */
  secondsToDeath: number | null;
}

/** 預覽要問哪幾個「點燃後秒數」。涵蓋收圈中、剛收完、和 owner 的尾巴。 */
const PREVIEW_SECONDS = [0, 5, 10, 20, 30, 40, 60] as const;

/**
 * 「這條曲線實際上怎麼燒人」的預覽。
 *
 * ⚠️ 走的是 sim **出貨的** `fireRingRulesFromConfig` + `fireRingRatePerSec`，
 * 不是後台自己再算一次內插 —— 抄一份公式進來，後台就會很有自信地畫出一條和
 * 伺服器不一樣的曲線，而兩邊都不會報錯（CLAUDE.md 第⑤種故障）。
 *
 * `secondsToDeath` 用和 sim 一樣的 30 Hz 逐格累加算，不是解析積分：實際扣血就是
 * 一格一格 `maxHp * ratePerSec * dt` 扣的，用積分算出來的數字會和玩家數到的秒數
 * 差一點點，而這一欄存在的意義就是「玩家會數到幾秒」。
 */
export function burnCurvePreview(
  points: readonly { [k: string]: number }[] | null,
  startSec: number,
  maxPctPerSec: number | undefined,
): BurnCurvePreviewRow[] {
  if (points === null || points.length === 0) return [];
  const cfg: FireRingConfigLike = {
    startSec: startSec > 0 ? startSec : 1,
    burnCurve: points.map((p) => ({ sec: p.sec!, pctPerSec: p.pctPerSec! })),
    maxPctPerSec,
  };
  const dt = 1 / TICK_HZ;
  const rules = fireRingRulesFromConfig(cfg, dt);
  // 上限：跑滿 10 分鐘的點燃後時間就停。一條 rate 恆為 0 的曲線本來就燒不死人，
  // 那時回 null 而不是一個假的大數字。
  const MAX_TICKS = 600 * TICK_HZ;
  const deathFrom = (fromTick: number): number | null => {
    let hp = 1; // 一條滿血 = 1.0（比例制，和英雄的最大生命無關）
    for (let t = fromTick; t < MAX_TICKS; t++) {
      hp -= fireRingRatePerSec(rules, t) * dt;
      if (hp <= 0) return (t - fromTick + 1) / TICK_HZ;
    }
    return null;
  };
  return PREVIEW_SECONDS.map((s) => {
    const tick = Math.round(s * TICK_HZ);
    return {
      sinceIgniteSec: s,
      roundSec: startSec + s,
      pctPerSec: fireRingRatePerSec(rules, tick),
      secondsToDeath: deathFrom(tick),
    };
  });
}

// --------------------------------------------------------------- 值 ---------

export type MatchValues = Record<string, string>;

function show(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export interface MatchDocRead {
  /** 攤平成字串的值（`.default()` 已經套用，因為 loader 也會套） */
  values: MatchValues;
  /** 火圈區塊在不在 */
  fireRingOn: boolean;
  /**
   * ⚠️ 這份文件過不過 Zod。過不了 = **game-server 的 loader 會整份丟掉**
   * （`loader.ts` 是 `spec.schema.parse(raw)`，失敗就記一筆錯誤、不加進 store），
   * 也就是遊戲現在跑的是編譯內建值，不是這份文件。畫面必須說出來。
   */
  parseError: string | null;
}

/**
 * 用 loader 的同一份 schema 讀一份文件。
 *
 * `safeParse` 成功時用**解析後**的資料（`.default()` 套好），因為那正是
 * `Configs` 裡那份文件的樣子；失敗時退回原始值，並把理由帶出去顯示。
 */
export function readMatchDoc(doc: unknown): MatchDocRead {
  const parsed = zConfigMatchDoc.safeParse(doc);
  const src: unknown = parsed.success ? parsed.data : doc;
  const values: MatchValues = {};
  for (const f of MATCH_FIELDS) values[f.path] = show(getAtPath(src, f.path));
  return {
    values,
    fireRingOn: getAtPath(src, FIRE_RING_BLOCK) !== undefined,
    parseError: parsed.success
      ? null
      : parsed.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`)
          .join("；"),
  };
}

/** 一格的錯誤（null = 合法）。唯讀的格子永遠合法 —— 它們不會被寫。 */
export function validateMatchField(path: string, raw: string, fireRingOn: boolean): string | null {
  const field = MATCH_FIELDS.find((f) => f.path === path);
  if (!field) return `未知的欄位 ${path}`;
  if (!isEditable(path)) return null;
  if (!fireRingOn && path.startsWith(`${FIRE_RING_BLOCK}.`)) return null;
  if (field.kind === "boolean") {
    const t = raw.trim();
    // 空白 = 「不設定」,只有 `.optional()` 的格子可以留白（缺席 ⇒ schema 的預設）。
    if (t === "") return field.optional ? null : "不能空白";
    return t === "true" || t === "false" ? null : "只能是開或關";
  }
  const bounds = matchFieldBounds(field);
  if (!bounds) return null;
  return validateNumeric(raw, bounds, field.kind, field.optional);
}

export function validateMatchValues(values: MatchValues, fireRingOn: boolean): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of MATCH_FIELDS) {
    const err = validateMatchField(f.path, values[f.path] ?? "", fireRingOn);
    if (err) errs[f.path] = err;
  }
  return errs;
}

/**
 * 灼燒曲線的判決。火圈停用時整張表不參與驗證 —— 那時它根本不會被寫進文件。
 * 走的是 `configCurve.ts` 的 `validateCurve`（空白 / 超界 / 列數 / 順序重複），
 * 也就是 `attackRangeCurve` 用的同一支。
 */
export function validateBurnCurve(
  rows: readonly CurveRowDraft[],
  fireRingOn: boolean,
): ReturnType<typeof validateCurve> {
  if (!fireRingOn) return { rows: rows.map(() => ({})), table: null, points: [] };
  return validateCurve(rows, BURN_CURVE_SPEC);
}

/**
 * 要 PUT 的文件 = **現行文件**（`base`）套上可調的格子。
 *
 * ⚠️ 從 base 出發不是偷懶，是唯一安全的作法：
 *   · `draft.tierSchedule` 是一個 record，這一頁沒有畫它 —— 從零造文件會把它清空
 *   · 那 18 格唯讀的值必須原封不動地帶著（schema 是必填，少一格整份文件被 loader 丟掉）
 *   · 之後 schema 長出新欄位時，這一頁不認得它，但也不會刪掉它
 */
export function matchDocFrom(
  base: unknown,
  values: MatchValues,
  fireRingOn: boolean,
  /**
   * 灼燒曲線的列。`undefined` = 這個呼叫端沒有畫那張表 → **原封不動**帶著基底
   * 裡那一份走（和 `draft.tierSchedule` 同一條規則）。傳了但驗不過 → 一樣不寫，
   * 因為半張表寫進文件會被 loader 整份丟掉。
   */
  burnCurveRows?: readonly CurveRowDraft[],
): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  doc.id = MATCH_DOC_ID;
  doc.schema = MATCH_SCHEMA;
  if (!fireRingOn) {
    deleteAtPath(doc, FIRE_RING_BLOCK);
  } else if (burnCurveRows !== undefined) {
    const verdict = validateCurve(burnCurveRows, BURN_CURVE_SPEC);
    if (verdict.points !== null) setAtPath(doc, BURN_CURVE_PATH, verdict.points);
  }
  for (const f of MATCH_FIELDS) {
    if (!isEditable(f.path)) continue;
    if (!fireRingOn && f.path.startsWith(`${FIRE_RING_BLOCK}.`)) continue;
    const raw = (values[f.path] ?? "").trim();
    if (raw === "") {
      // 選填欄位留白 = 不寫這一格（schema 的 `.default()` 或「不設限」接手）
      if (f.optional) deleteAtPath(doc, f.path);
      continue;
    }
    // ⚠️ 布林要先攔下來。`Number("true")` 是 NaN,所以少了這一段,一個布林欄位
    // 會**永遠寫不進文件**而畫面上毫無異狀（見 MATCH_BOOL_LABELS 的說明）。
    if (f.kind === "boolean") {
      setAtPath(doc, f.path, raw === "true");
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) setAtPath(doc, f.path, n);
  }
  return doc;
}

/**
 * 存檔前用 loader 的同一份 schema 再驗一次 —— 這是**跨欄位**規則唯一的檢查點
 * （火圈必須在硬底線之前收完；殭屍王延長之後也一樣）。單格的上下界擋不住它們。
 */
export function matchDocIssues(doc: unknown): string[] {
  const parsed = zConfigMatchDoc.safeParse(doc);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`);
}
