/**
 * statPathReadout —— 「**連續買 N 次能力屬性強化會有特殊加成**」這件事**畫在畫面上**
 * 的唯一一份文案推導（GH#972）。
 *
 * owner 2026-09-02（逐字）：
 * > 「隨機能力三選一那邊 **似乎沒有足夠提示 連續20次會有特殊加成**」
 *
 * ── ⭐ 先講**不是**缺口的那一半（前提回驗，2026-09-03）─────────────────────
 * ⭐ `statStacks` **早就在線上**：`net/snapshot.ts` 的 `ss.statStacks` →
 * `SeatView.statStacks` → 商店的 `StatPanel`。⇒ ⛔ 這**不是**失敗形態②
 * （「算出來了但從沒送到客戶端」）—— 缺的是**畫**：
 *
 * | 畫面 | 2026-09-03 之前 |
 * |---|---|
 * | **三選一**（owner 點名的那一頁） | ⛔ **一個字都沒有** |
 * | 商店的屬性面板 | 有 `N / 20`，⛔ 而「買道具會歸零」只活在 `title=` 的**滑鼠提示**裡 |
 * | 解鎖回合（`capstoneRoundGate`） | ⛔ **從來沒有出現在任何一個畫面上** |
 *
 * ⚠️ ⭐ `title=` 不算「玩家看得到」：手把與觸控**沒有 hover**，⇒ 那一句話對
 * 一半的輸入方式**不存在**。
 *
 * ── ⛔⛔ 而分母**寫死了** ────────────────────────────────────────────────
 * `statPathView(stacks, pct)` 的第三個參數缺席 ⇒ 退回 `DEFAULT_ECONOMY` 的 20。
 * ⭐ 而 `statTickTarget` 今天**是後台一格**（`config.match@1` 的
 * `economy.statTickTarget`，`MatchController` 在 tick 0 之前灌進 `world.economy`）
 * ⇒ owner 把它調成 5，⛔ 畫面照樣寫 20 ＝ **一句謊話**
 * （第〇·四守則：算得出來的值不可以有第二個住處）。
 * ⇒ ⭐ 這一支從**同一份文件**解析那兩個數字，⛔ 文案裡一個數字都沒有。
 *
 * ⚠️ 純函式那一半（{@link statPathReadout}）⛔ 不碰登錄表，所以 node 測得動；
 * 讀設定的那一半（{@link statPathEconomy}）走 `uiCuesConfig` 同一條**懶讀**路 ——
 * ⛔ 沒有第二個「必須記得接上」的點（失敗形態⑧）。
 */
import { Configs } from "@ggd/shared/content";
import {
  DEFAULT_ECONOMY,
  normalizeEconomyRules,
  type EconomyRules,
} from "@ggd/shared/sim/economy/economyRules";
import { statPathView, type StatPathView } from "@ggd/shared/sim/economy/statPath";

/** ⚠️ `MatchController` 讀的是同一個字面值（它自己的模組層常數，⛔ 沒有匯出）。 */
const MATCH_CONFIG_DOC_ID = "config.match";
/** 回合總數住這裡（`config.arena-rules@1` 的 `finalRound`，出貨 10）。 */
const ARENA_RULES_DOC_ID = "arena-rules";

let cachedDoc: unknown = Symbol("never");
let cachedRules: EconomyRules = DEFAULT_ECONOMY;

/**
 * 這一刻生效的 `economy` 量值（後台覆蓋層 ?? `content/config/config.match.json`
 * ?? 出貨值）。⚠️ key 是**文件物件本身**（`===`）——覆蓋層換上新文件就是一顆新
 * 物件，快取自己失效；同一份文件被讀一百萬次則只解析一次。
 *
 * ⭐ 走**和伺服器同一支** `normalizeEconomyRules`，⛔ 不是在這裡再夾一次上下界
 * （兩份夾法就是兩份會 drift 的規則）。
 */
export function statPathEconomy(): EconomyRules {
  const doc = Configs.tryGet(MATCH_CONFIG_DOC_ID) as { economy?: unknown } | undefined;
  if (doc === cachedDoc) return cachedRules;
  cachedDoc = doc;
  cachedRules = normalizeEconomyRules(doc?.economy ?? {});
  return cachedRules;
}

/** 丟掉快取。**測試專用**。 */
export function resetStatPathEconomyCache(): void {
  cachedDoc = Symbol("never");
  cachedRules = DEFAULT_ECONOMY;
}

/** 這一場總共打幾回合（讀不到 ⇒ `0` ＝ 不知道，⛔ 不是「沒有回合」）。 */
export function statPathFinalRound(): number {
  const doc = Configs.tryGet(ARENA_RULES_DOC_ID) as { finalRound?: unknown } | undefined;
  const n = doc?.finalRound;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

export interface StatPathReadoutInput {
  /** `SeatView.statStacks` —— 伺服器算的連續次數。 */
  stacks: number;
  /** `SeatView.statCapstonePct` —— 0 = 頂點還沒發。 */
  capstonePct: number;
  /** `HudState.round` —— 0 = 還不知道（開場前 / 單元測試）。 */
  round?: number;
  /** 缺席 ⇒ `statPathEconomy()`。測試從這裡灌一份假的設定進來。 */
  rules?: EconomyRules;
  /** 缺席 ⇒ `statPathFinalRound()`。 */
  finalRound?: number;
}

/**
 * 一份**已經算好的畫面文案**。⭐ 每一格要嘛是字串要嘛是 `null`，
 * ⛔ 面板不再自己判斷「這一行要不要出現」—— 那個判斷只有一個住處。
 */
export interface StatPathReadout {
  /** 路線還活著（頂點還沒發下來）。 */
  live: boolean;
  /** 「7 / 20」—— ⭐ 分母來自設定。 */
  progress: string;
  /** 一行主標。 */
  headline: string;
  /** 「集滿 20 次 ⇒ 傳說·萬象強化」。已達成 ⇒ `null`。 */
  goal: string | null;
  /** ⭐⭐ 歸零警告 —— 只在**真的有東西會被毀掉**的時候（`atRisk > 0`）。 */
  resetWarning: string | null;
  /** 解鎖回合條件。閘 ≤ 1（等於沒有閘）或已達成 ⇒ `null`。 */
  gateNote: string | null;
  /**
   * ⚠️ 閘排在**最後一回合之後** ⇒ 這條路線這一場**走不到**。
   * ⭐ 誠實地說出來，⛔ 不硬擋 —— 那是設定的問題，而一個永遠達不到的目標
   * 至少不該假裝自己達得到。
   */
  unreachableNote: string | null;
  /** 共用推導（`sim/economy/statPath`）—— ⛔ 面板不要自己算 remaining/atRisk。 */
  view: StatPathView;
}

/**
 * ⭐ **唯一**一支把「連續強化」翻成畫面文字的函式。純的：⛔ 不讀登錄表、
 * ⛔ 不讀時鐘，所以 node 測得動而且測到的就是玩家讀到的那幾個字。
 */
export function statPathReadout(input: StatPathReadoutInput): StatPathReadout {
  const rules = input.rules ?? statPathEconomy();
  const finalRound = input.finalRound ?? statPathFinalRound();
  const round = input.round ?? 0;
  const view = statPathView(input.stacks, input.capstonePct, rules.statTickTarget);
  const gate = rules.capstoneRoundGate;
  const progress = `${view.stacks} / ${view.target}`;

  if (!view.live) {
    return {
      live: false,
      progress,
      headline: `傳說·萬象強化 已達成 +${view.capstonePct}%`,
      goal: null,
      resetWarning: null,
      gateNote: null,
      unreachableNote: null,
      view,
    };
  }

  return {
    live: true,
    progress,
    headline: `連續屬性強化 ${progress} 次`,
    goal: `連續集滿 ${view.target} 次 ⇒ 傳說·萬象強化（還差 ${view.remaining} 次）`,
    // ⭐ `atRisk`（⛔ 不是 `stacks > 0`）——「買一件道具現在會毀掉幾層」是共用
    //   推導的答案，而頂點發下來之後它就是 0（那時已經沒有東西可以被毀掉）。
    resetWarning:
      view.atRisk > 0 ? `⛔ 買任何一般道具會把已累積的 ${view.atRisk} 次歸零` : null,
    // ⛔ 閘 ≤ 1 等於沒有閘（第 1 回合就開得了）—— 那時候印它只是噪音。
    gateNote:
      gate > 1
        ? round > 0 && round < gate
          ? `第 ${gate} 回合起才會發放（現在第 ${round} 回合）`
          : `第 ${gate} 回合起才會發放`
        : null,
    unreachableNote:
      finalRound > 0 && gate > finalRound
        ? `⚠️ 目前設定的解鎖回合（${gate}）在最後一回合（${finalRound}）之後 —— 這一場拿不到`
        : null,
  };
}
