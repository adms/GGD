/**
 * coinThrow —— 陣亡投幣那顆按鈕的**答話**，以及它上面那幾個數字的**唯一住處**。
 *
 * ---------------------------------------------------------------------------
 * 這一支關掉的債
 * ---------------------------------------------------------------------------
 * `sim/coins.dropCoinCommand` 從第一天就替**每一次**被拒的投幣發了
 * `coinDropRejected {seatId, reason}`，`net/eventFanout` 也把它逐座位私訊出去。
 * 而客戶端**一個消費端都沒有** —— fanout 自己的註解逐字寫著
 * 「this event currently has NO client consumer」。
 *
 * ⛔ 結果不是一個罕見的邊角：出貨經濟保證**每個玩家每一場都會撞到**。
 * `goldDrop.coinValue × goldDrop.coinsPerRound` 遠大於 `config@1 match.startingGold`，
 * 所以一毛不花也只供得起其中一部分投幣次數。撞到之後，按鈕仍然亮著、仍然寫著
 * 「丟 N 金 (G) x/y」、仍然可點，而每一次點與每一次 `G` 都被 sim 拒掉 ——
 * ⛔ 沒有 toast、沒有嗶聲、沒有抖動。這是失敗形態②的教科書樣本：
 * 算出來了、上了線、然後在最後一公尺被丟掉。
 *
 * ⚠️ 而 `input/InputCapture` 的 `DROP_COIN_COMMAND` 註解拿「sim 會回答每一次被拒
 * 的按鍵」當作**不設閘的理由** —— 那句話是承重的謊（第三守則）。它現在是真的，
 * 因為這一支存在。
 *
 * ---------------------------------------------------------------------------
 * 為什麼借 `ui/castFeedback` 的告示管線，而不是自己開一條
 * ---------------------------------------------------------------------------
 * 「一場只有一句、~2s TTL、pointerEvents:none、掛在技能列上方」這整套已經是
 * `CastNoticeLine` 在做的事，而 `CastNoticeLine` 在戰鬥階段（陣亡投幣唯一開放的
 * 相位）本來就掛著。第二條管線＝同一個畫面上兩個會互相蓋掉的告示。
 * ⇒ 這裡只提供 `事件 → CastNotice`（純函式），推送走既有的 `pushCastNotice`。
 * 投幣不屬於任何一格技能按鈕，所以 `notice.slot` 是 **null**，⛔ 不是抓一格來抖
 * ——抖錯格子比不抖更難懂。
 *
 * ⚠️ ⛔ 覆蓋層不可以寫進 `hudStore`：`RoomStore` 用 `JSON.stringify(seats)` 比對，
 * 下一個快照會整個蓋掉。所以狀態住在 castFeedback 的告示盒裡（那不是 seats 投影）。
 */
import { Configs, DEFAULT_GOLD_DROP_CONFIG } from "@ggd/shared/content";
import { ARENA_RULES_DOC_ID } from "@ggd/shared/content/schema/config/arenaRules";
import { hudStore } from "../net/RoomStore";
import { pushCastNotice, type CastEventLike, type CastNotice } from "./castFeedback";
import { uiCues } from "./uiCuesConfig";

/** 畫在投幣按鈕上的那兩個數字。⭐ 從 `config.arena-rules@1` 讀，⛔ 不是常數。 */
export interface CoinThrowRules {
  /** 一顆金幣多少錢 —— 按鈕上「丟 N 金」的 N */
  readonly coinValue: number;
  /** 每回合投幣上限 —— 按鈕上「x/y」的 y */
  readonly coinsPerRound: number;
}

/**
 * 這一刻生效的投幣規則（後台覆蓋層 ?? `content/config/arena-rules.json` ?? 出貨值）。
 *
 * ⚠️ 它取代的是 `HudRoot` 與 `TouchControls` **各自**寫死的 `COINS_PER_ROUND = 10`
 * 與字面值「丟 100金」—— 兩個第二住處，而且兩份文案都會在 owner 調
 * `goldDrop.coinValue` 的那一刻同時變成謊話（第〇·四守則）。
 * ⛔ 這裡不 parse 整份 arena-rules：那一份任何**別的**區塊漂掉都會讓整個 parse
 * 失敗，而按鈕上的數字不該被一個不相干的區塊決定（`arenaRules.mobWaves` 的
 * 讀法同理）。
 */
export function coinThrowRules(): CoinThrowRules {
  const doc = Configs.tryGet(ARENA_RULES_DOC_ID) as { goldDrop?: Partial<CoinThrowRules> } | undefined;
  const gd = doc?.goldDrop;
  const value = typeof gd?.coinValue === "number" ? gd.coinValue : DEFAULT_GOLD_DROP_CONFIG.coinValue;
  const per = typeof gd?.coinsPerRound === "number" ? gd.coinsPerRound : DEFAULT_GOLD_DROP_CONFIG.coinsPerRound;
  return { coinValue: value, coinsPerRound: per };
}

/**
 * 金幣不足時，那顆按鈕要不要**先**變灰（`config.ui-cues@1 coinThrowButtonMode`）。
 *
 * ⛔ 它管不到「有沒有回饋」—— 被拒的每一次都會說出原因，那是第一·五守則。
 */
export function coinThrowGreysWhenPoor(): boolean {
  return uiCues().coinThrowButtonMode === "grey-when-poor";
}

/**
 * 這一格的金幣夠不夠丟下一顆。⭐ 純函式，`grey-when-poor` 那條路才問它。
 * ⚠️ `seatGold` 是快照投影（有延遲），所以它**只**拿來畫灰，⛔ 不拿來擋送出。
 */
export function coinThrowAffordable(seatGold: number, rules: CoinThrowRules): boolean {
  return seatGold >= rules.coinValue;
}

/**
 * 拒絕原因 → 玩家看得懂的一句話。每一句都說「你要**做什麼**」，⛔ 不是回一個代號。
 * 鏡射 `sim/coins.CoinDropRejection`，⛔ 但刻意是本地 union：未來多一個原因會退到
 * {@link COIN_REJECT_GENERIC}，⛔ 不是讓 HUD 的型別檢查紅（那顆事件是**權威的**，
 * 而客戶端可能比伺服器舊）。
 */
export const COIN_REJECT_TEXT: Record<string, string> = {
  "no-gold": "金幣不足，丟不出這一顆",
  "cap-reached": "這一回合的投幣次數用完了",
  alive: "還活著的時候不能投幣",
  "not-in-round": "這一回合沒有你的場次，不能投幣",
  "no-champion": "還沒有英雄，不能投幣",
  "phase-closed": "現在不是戰鬥階段，不能投幣",
};

/** 這一版不認得的原因（伺服器比客戶端新）。 */
export const COIN_REJECT_GENERIC = "現在不能投幣";

/** 這顆事件是不是投幣回饋要的（排水口的便宜前置過濾）。 */
export function isCoinFeedbackEvent(type: string): boolean {
  return type === "coinDropRejected";
}

/**
 * PURE：一顆 `coinDropRejected` → 要顯示的告示，或 null（不是給我的）。
 *
 * `slot: null` —— 投幣沒有技能格，所以沒有按鈕要抖。
 */
export function coinRejectionFromEvent(
  ev: CastEventLike,
  localSeatId: number | null,
): CastNotice | null {
  if (!isCoinFeedbackEvent(ev.type) || localSeatId === null) return null;
  const seatId = ev.data.seatId;
  if (typeof seatId !== "number" || seatId !== localSeatId) return null;
  const reason = typeof ev.data.reason === "string" ? ev.data.reason : "";
  return {
    slot: null,
    abilityName: "陣亡投幣",
    text: `陣亡投幣：${COIN_REJECT_TEXT[reason] ?? COIN_REJECT_GENERIC}`,
    // ⛔ **null，⛔ 不是 `CAST_DENY_SFX`** —— 第一·五守則。實測過：`notice.sfx`
    // 在整個客戶端**沒有任何消費端**（唯一的訂閱者 `CastNoticeLine` 只畫
    // `notice.text`），所以填一個 key 進來只會是一句「會嗶一聲」的空話。
    // ⚠️ 連帶：`audio/combatSfxSpatial.ts` 那句「ui/castFeedback owns the refusal
    // cue」今天仍然不成立 —— 那份檔在音效 lane 手上，這裡只記錄，⛔ 不動它。
    sfx: null,
    secondsLeft: 0,
    seq: ++coinSeq,
  };
}

let coinSeq = 900_000;

/**
 * 把一顆排水口的事件折進告示管線。⭐ **`GameApp` 的事件排水口呼叫的就是這一支**，
 * 形狀與 `recordCastEvent` / `recordShopEvent` 一模一樣。
 *
 * ⛔ 拿掉這一行，整個回饋就消失而所有測試照樣綠（失敗形態③）——
 * `coinThrow.test.ts` 跑的是 `GameApp` 真的那條排水口，正是為了讓它會紅。
 */
export function recordCoinEvent(ev: CastEventLike): void {
  if (!isCoinFeedbackEvent(ev.type)) return;
  const notice = coinRejectionFromEvent(ev, hudStore.getState().localSeatId);
  if (notice) pushCastNotice(notice);
}
