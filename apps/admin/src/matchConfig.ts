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
 * 而且它們已經**互相矛盾**了 —— 文件寫 `progression.levelCap: 18`，程式是
 * `LEVEL_CAP = 99`；文件寫 `tick.snapshotHz: 20`，程式是 `SNAPSHOT_HZ = 30`。
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
  // 階段秒數：10 分鐘。再長的選角／中場／結算都不是設定錯就是誤觸。
  "match.champSelectSec": 600,
  "match.intermissionSec": 600,
  "match.resolutionSec": 600,
  // 戰鬥硬底線：1 小時。殭屍王每次召喚還會 +180 秒，所以基底不需要更大。
  "match.combatMaxSec": 3600,
  "match.fireRing.startSec": 3600,
  "match.fireRing.shrinkSec": 3600,
  // 火圈收完的最小半徑：競技場 boundaryRadius 是 24，比它大等於「火圈永遠在場外」。
  "match.fireRing.minRadius": 24,
  // 金錢／經驗：十萬。一場的確定性收入是 7,600 金，所以十萬已經是「一定是打錯」。
  "economy.startingGold": 100000,
  "economy.killGold": 100000,
  "economy.killBounty": 100000,
  "economy.assistGold": 100000,
  "economy.roundWinGold": 100000,
  "economy.roundLoseGold": 100000,
  // `LEVEL_CAP` 是 99；填得比它大不會多出任何一級。
  "progression.levelCap": 99,
  "progression.xpBase": 100000,
  "progression.xpPerLevel": 100000,
  "progression.xpKill": 100000,
  "progression.xpAssist": 100000,
  "progression.xpRoundSurvive": 100000,
});

export function matchFieldBounds(field: DerivedField): FieldBounds | null {
  return boundsFor(field, MATCH_CONSOLE_MAX);
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
  "match.champSelectSec": {
    zh: "選角秒數",
    note: "champ-select 階段多長。太短玩家來不及看英雄檔案（客戶端的簡報閘要求它有餘裕），太長每一場開頭都在等。",
    live: PHASE,
  },
  "match.intermissionSec": {
    zh: "中場（商店）秒數",
    note: "回合之間逛商店的時間。太短買不完三選一 + 商店；太長節奏會斷。",
    live: PHASE,
  },
  "match.combatMaxSec": {
    zh: "戰鬥硬底線（秒）",
    note:
      "戰鬥階段強制結束的時間點。⚠️ 它**不是**預期的回合長度 —— 火圈會先收完並逼出結果。必須留得下**整個火圈**（起燃秒數＋收圈秒數），否則圈還在縮就被強制結束，僵局破不了。",
    live: PHASE,
  },
  "match.resolutionSec": {
    zh: "結算秒數",
    note: "回合結束後的結算演出長度（勝利畫面、煙火、語音）。",
    live: PHASE,
  },
  "match.fireRing.startSec": {
    zh: "火圈起燃（戰鬥第幾秒）",
    note:
      "**回合長度的單一真相**：戰鬥經過這麼多秒之後，火圈從場地邊界出現並開始收縮。調小 = 每回合更短更急；調大 = 更多對線時間。客戶端的緊張感音樂也是從這一格推出來的。",
    live: RING + "；client audio/fireRingWindow",
  },
  "match.fireRing.shrinkSec": {
    zh: "收圈耗時（秒）",
    note: "從場地邊界收到最小半徑要多久。調小 = 火圈瞬間逼近，走位空間一下子沒了；調大 = 慢慢絞。",
    live: RING + "；client audio/fireRingWindow",
  },
  "match.fireRing.minRadius": {
    zh: "收完後的半徑",
    note:
      "火圈完全收攏後的半徑。刻意設在角色碰撞半徑（0.6）**以下**，所以收完之後沒有任何人整個身體在圈內 —— 「沒有生存空間」不需要第二條規則。設成 0 會讓視覺塌成一個點。",
    live: RING,
  },
  "match.fireRing.burnPctPerSecStart": {
    zh: "起燃時每秒燒（佔最大生命）",
    note: "剛起燃時，圈**外**的人每秒掉多少比例的自身最大生命。這是**真實傷害**：不吃護甲、魔抗，也不吃「戰鬥系統」的傷害倍率。",
    live: RING,
  },
  "match.fireRing.burnPctPerSecEnd": {
    zh: "收完時每秒燒（佔最大生命）",
    note: "火圈完全收攏時的每秒燒傷比例。從起燃值隨收圈進度線性爬到這裡 —— 兩個數字的差距就是「拖到最後有多痛」。",
    live: RING,
  },
  "match.fireRing.maxPctPerSec": {
    zh: "每秒燒傷上限（選填）",
    note: "燒傷比例的安全上限。留白 = 不設限（上面兩格自己說了算）。",
    live: RING,
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
  "progression.levelCap": {
    zh: "等級上限",
    note: "沒有消費端，而且**已經和程式對不上**：文件寫 18，程式是 99。",
    live: null,
    realHome: "packages/shared/src/sim/economy/progression.ts 的 LEVEL_CAP",
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
    intro: "一場對戰的節奏：每個階段多長、整場打幾回合。這一組每一格都真的被 game-server 讀。",
    paths: [
      "match.startingTeamLives",
      "match.champSelectSec",
      "match.intermissionSec",
      "match.combatMaxSec",
      "match.resolutionSec",
    ],
  },
  {
    key: "fireRing",
    title: "火圈（可調）",
    intro:
      "回合的收尾機制：起燃時間就是「這一回合打算打多久」，收圈把僵局逼出結果。整個區塊可以停用 —— 停用之後回合會一路打到硬底線。" +
      "⚠️ 這一組裡有兩個**會延長回合**的格子（殭屍王那兩格）和一個**擋住延長**的格子（回合硬上限）：延長是每召喚一次就加一次，硬上限是總和的天花板。",
    paths: [
      "match.fireRing.startSec",
      "match.fireRing.shrinkSec",
      "match.fireRing.minRadius",
      "match.fireRing.burnPctPerSecStart",
      "match.fireRing.burnPctPerSecEnd",
      "match.fireRing.maxPctPerSec",
      "match.fireRing.roundHardCapSec",
      "match.fireRing.boss.extendCombatSec",
      "match.fireRing.boss.delayFireRingSec",
    ],
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
      "progression.levelCap",
      "progression.xpBase",
      "progression.xpPerLevel",
      "progression.xpKill",
      "progression.xpAssist",
      "progression.xpRoundSurvive",
      "draft.offerCount",
    ],
  },
];

/** 火圈是唯一一個真的 `.optional()`、可以整塊拿掉的區塊。 */
export const FIRE_RING_BLOCK = "match.fireRing";

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
 * 要 PUT 的文件 = **現行文件**（`base`）套上可調的格子。
 *
 * ⚠️ 從 base 出發不是偷懶，是唯一安全的作法：
 *   · `draft.tierSchedule` 是一個 record，這一頁沒有畫它 —— 從零造文件會把它清空
 *   · 那 18 格唯讀的值必須原封不動地帶著（schema 是必填，少一格整份文件被 loader 丟掉）
 *   · 之後 schema 長出新欄位時，這一頁不認得它，但也不會刪掉它
 */
export function matchDocFrom(base: unknown, values: MatchValues, fireRingOn: boolean): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  doc.id = MATCH_DOC_ID;
  doc.schema = MATCH_SCHEMA;
  if (!fireRingOn) {
    deleteAtPath(doc, FIRE_RING_BLOCK);
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
