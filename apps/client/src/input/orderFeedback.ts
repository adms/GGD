/**
 * ⭐⭐ **右鍵指令按下去的那一刻要答得回來**（GH#734）。
 *
 * ── owner 2026-07-29（逐字）────────────────────────────────────────────────
 * 「點右鍵攻擊會讓目標物**閃紅圈圈** 並且玩家角色發出**攻擊語音**；
 *  取消...等其他動作也是播對應音效」
 *
 * ── 2026-08-31 量到的現況 ─────────────────────────────────────────────────
 * ⭐ `onOrder` 在 `GameApp.ts` 有**三個**呼叫點，而**三個都是直通**
 * `this.sender.setOrder(order)` —— ⛔ 零個回饋呼叫。
 * ⭐ 而 `resolveTargetMarker()` 那一套環**已經存在**，⛔ 只有**手把**那條路在用它
 * （`resolvePadTargetMarker`，:1856）—— 右鍵那條路一次都沒接上。
 *
 * ── ⭐ 為什麼是一支**純函式**，⛔ 不是在 `onOrder` 裡寫三行 ────────────────
 * `apps/client` 沒有 React 測試環境，而 `GameApp.ts` 是一個 4,041 行、
 * **每條 lane 都要改一行**的檔（CLAUDE.md 第〇·七守則的觸發器②）。
 * ⇒ ⭐ 決定住這裡（可單獨跑），`onOrder` 只呼叫一行。
 * ⛔ 判斷留在 `.tsx`/`GameApp` 裡等於**只驗得到字串**（失敗形態⑥）。
 *
 * ── ⚠️ 零延遲是**規格的一部分** ──────────────────────────────────────────
 * 票文逐字：「本地零延遲播放（客戶端自己的指令，**不等伺服器**）」
 * ⇒ ⭐ 這支只看**玩家剛按下的那個 order**，⛔ 不讀任何 snapshot。
 */
// ⭐ 用**出貨的** `Order`（`sim/intents.ts:86`）——⛔ 我第一版寫了一個不存在的
//   `OrderMsg`，⭐ 而 tsc 當場指名。⚠️ 真的 `OrderKind` 是
//   `move | attackMove | attackTarget | stop | hold` ——⛔ 沒有 `moveTo`。
import type { Order } from "@ggd/shared/sim/intents";
import { Configs, DEFAULT_FEEL_FX, type ConfigFeelFxDoc } from "@ggd/shared/content";

/** 一次指令要給出的回饋。⭐ 兩個軸各自可以是空的（⛔ 不是一個 enum）。 */
export interface OrderFeedback {
  /** 目標腳下閃一下的實體 id；`null` = 這一次不閃（地面指令／取消）。 */
  readonly flashEntityId: number | null;
  /** 要播的語音/音效 cue；`null` = 這一次不出聲。 */
  readonly cue: OrderCue | null;
}

/**
 * ⭐ 封閉列舉 —— ⛔ 不是自由字串。
 * ⚠️ 每一格都要對得上 `contextualVoice` 既有的池（票文逐字：「選既有池，⛔ 不錄新的」）。
 */
export const ORDER_CUES = ["attack", "move", "stop", "cancel"] as const;
export type OrderCue = (typeof ORDER_CUES)[number];

/** 這一次指令要不要給回饋 —— ⭐ 三個住處的那一格（出貨預設 on）。 */
export interface OrderFeedbackPolicy {
  readonly enabled: boolean;
  /** ⭐ 閃圈與出聲**分開** —— 有人只想要其中一個（⛔ 不是一個總開關）。 */
  readonly ring: boolean;
  readonly voice: boolean;
}

export const DEFAULT_ORDER_FEEDBACK: OrderFeedbackPolicy = {
  enabled: true,
  ring: true,
  voice: true,
};

/** ⭐ 什麼都不做的回饋（⛔ 用同一個物件，讓呼叫端的 `===` 也成立）。 */
export const NO_ORDER_FEEDBACK: OrderFeedback = { flashEntityId: null, cue: null };

/**
 * ⭐ 一次指令 → 一份回饋。
 *
 * | order | 環 | 音 |
 * |---|---|---|
 * | `attackTarget` 且有 entity | ⭐ 那個實體 | `attack` |
 * | `attackTarget` 但沒有 entity（打地板） | — | `attack` |
 * | `move` / `attackMove` | — | `move` |
 * | `stop` / `hold` | — | `stop` |
 * | `null`（取消） | — | `cancel` |
 *
 * ⚠️ ⭐ 「打地板也出聲」是刻意的：玩家按了鍵，⛔ 而沉默與「按鍵沒吃到」
 * 在他手上長得一模一樣（CLAUDE.md：fail-open 沒錯，**靜默**才是缺陷）。
 */
export function orderFeedbackFor(
  order: Order | null | undefined,
  policy: OrderFeedbackPolicy = DEFAULT_ORDER_FEEDBACK,
): OrderFeedback {
  if (!policy.enabled) return NO_ORDER_FEEDBACK;
  const cueOf = (): OrderCue | null => {
    if (order === null || order === undefined) return "cancel";
    switch (order.kind) {
      case "attackTarget":
        return "attack";
      case "move":
      // ⭐ `attackMove`（A 鍵點地）也是移動 —— ⛔ 它不是 `attack`：
      //   玩家還沒有指定目標，⭐ 而攻擊語音會讓他以為鎖到人了。
      case "attackMove":
        return "move";
      case "stop":
      case "hold":
        return "stop";
      default:
        // ⛔ 認不得的 order kind ⇒ **不出聲**（⭐ 而不是猜一個）——
        //   ⚠️ 猜錯的音效比沒有音效更難查。
        return null;
    }
  };
  const ent =
    order !== null && order !== undefined && order.kind === "attackTarget"
      ? ((order as { entity?: number }).entity ?? null)
      : null;
  return {
    flashEntityId: policy.ring ? ent : null,
    cue: policy.voice ? cueOf() : null,
  };
}

/**
 * ⭐ 從 `config.feel-fx@1` 讀出這一格 —— ⭐ 出貨預設的**唯一住處**是
 * `DEFAULT_FEEL_FX`（第〇·四守則），⛔ 這裡只取別名。
 *
 * ⚠️ 與 `feelFx()` 那一族同一個語意：後台改了要**玩家下一次重新整理**才生效。
 */
export function orderFeedbackPolicy(): OrderFeedbackPolicy {
  const doc = Configs.tryGet("feel-fx") as ConfigFeelFxDoc | undefined;
  const p = doc?.orderFeedback ?? DEFAULT_FEEL_FX.orderFeedback;
  // ⛔ 讀不到就退回**出貨預設**（⭐ 不是「全關」——那會讓一次載入失敗把功能靜靜關掉）
  return p ?? DEFAULT_ORDER_FEEDBACK;
}
