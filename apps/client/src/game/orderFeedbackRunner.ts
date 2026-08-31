/**
 * ⭐⭐ GH#734 —— 指令當下回饋的**狀態**（環的計時器）與**動作**（放環／出聲）。
 *
 * ── owner 2026-07-29（逐字）────────────────────────────────────────────────
 * 「點右鍵攻擊會讓目標物**閃紅圈圈** 並且玩家角色發出**攻擊語音**；
 *  取消...等其他動作也是播對應音效」
 *
 * ⚠️ ⭐ 在這一支出現以前，`GameApp` 的**兩個** `onOrder` 呼叫點都是**直通**
 * `this.sender.setOrder(order)` —— ⛔ 零個回饋呼叫，⭐ 而目標環那一套 decal
 * 早就存在、⛔ 只有**手把**那條路在用（`resolvePadTargetMarker`）。
 *
 * ⭐ **本地零延遲**是規格的一部分（票文逐字：「客戶端自己的指令，⛔ 不等伺服器」）
 * ⇒ ⛔ 這一條路不讀任何 snapshot、不等 ack。
 *
 * ── ⭐ 為什麼它住 `game/`，⛔ 不住 `GameApp.ts` ─────────────────────────────
 * `GameApp.ts` 有一條**棘輪**：`client-gameapp-split` 的第②條逐字說
 * 「只能變短，⛔ 不可以再漲回 4,000 行 —— 新東西請放進 `game/`」。
 * ⭐ 我第一版把它寫在 `GameApp.ts` 裡，⛔ 而那條棘輪當場紅（4,067 行）。
 * ⇒ ⭐ 這正是第〇·七守則的觸發器②（**撞車次數**）在工作：
 *   一個每條 lane 都要改一行的檔，⛔ 不可以再長。
 *
 * ── ⭐ 決定 vs 狀態 vs 動作，三段分開 ──────────────────────────────────────
 * · **決定** 住 `input/orderFeedback.ts`（純函式，⭐ 可單獨跑）
 * · **狀態** 住這裡（環閃到什麼時候）
 * · **動作** 由呼叫端注入（放環／出聲）—— ⛔ 這裡不 import Babylon、不 import 音訊
 *
 * ⚠️ ⭐ 環用**時間戳**過期，⛔ 不是一個 boolean —— 一個 boolean 需要有人記得
 * 把它關掉，⭐ 而時間戳自己會過期。
 */
import type { Order } from "@ggd/shared/sim/intents";
import { orderFeedbackFor, orderFeedbackPolicy, type OrderCue } from "../input/orderFeedback";
import { playContextualVoice } from "../audio/contextualVoice";

/** 指令環閃多久（毫秒）。⭐ 一次心跳的長度 —— ⛔ 不是一個要調的數字。 */
export const ORDER_FLASH_MS = 320;

export class OrderFeedbackRunner {
  private flashEntityId: number | null = null;
  private flashUntilMs = 0;

  /**
   * @param playCue ⭐ 出聲那一半由呼叫端注入（⛔ 這裡不知道語音池長什麼樣）。
   * @param nowMs   ⭐ 時鐘也注入 —— ⛔ 測試不必跟 `performance.now()` 搏鬥。
   */
  constructor(
    /** ⭐ 誰在下指令（回傳 championId）—— ⛔ runner 不知道那是怎麼查的。 */
    private readonly casterId: () => string | null | undefined,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  /**
   * ⭐ cue → **既有**語音池（票文逐字：「選既有池，⛔ 不錄新的」）。
   * ⚠️ `attack` 用的是 WINDUP 那一支**同一個**池 —— ⭐ 而它自己帶著節流
   * （`playContextualVoice` 的 policy）⇒ ⛔ 連點右鍵不會變成一串疊在一起的吼叫。
   */
  private playCue(cue: OrderCue): void {
    playContextualVoice(
      this.casterId(),
      cue === "attack" ? "attack-light" : `order-${cue}`,
    );
  }

  /** 玩家剛下了一個指令。⭐ 本地零延遲：⛔ 不等 ack、⛔ 不讀 snapshot。 */
  apply(order: Order | null | undefined): void {
    const fb = orderFeedbackFor(order, orderFeedbackPolicy());
    if (fb.flashEntityId !== null) {
      this.flashEntityId = fb.flashEntityId;
      this.flashUntilMs = this.nowMs() + ORDER_FLASH_MS;
    }
    if (fb.cue !== null) this.playCue(fb.cue);
  }

  /** 指令環現在該不該畫（⭐ 過期自己收掉，⛔ 不必有人記得關）。 */
  target(): number | null {
    return this.nowMs() < this.flashUntilMs ? this.flashEntityId : null;
  }
}

/**
 * ⭐ **指令環 vs 手把環，誰贏。**
 *
 * ⚠️ 兩者不可能同時要畫：手把那條是「按著技能鍵時的**軟鎖定**」，
 * 指令這條是「剛按下右鍵的那 320ms」——
 * ⭐ 而萬一同時有，**指令環贏**：它是玩家**剛剛做的動作**，
 * ⛔ 手把那個是一個持續狀態。
 *
 * ⭐ 這是一個**決定**，⛔ 不是一段接線 ⇒ 它住 `game/`（`GameApp.ts` 的棘輪
 * 逐字說「新東西請放進 game/」），而 `GameApp` 只呼叫一行。
 */
export function pickTargetRing<T, P, R>(
  fb: OrderFeedbackRunner,
  /** 位置查詢與關係查詢 —— ⭐ 兩條路**共用**它們（⛔ 不是各傳一份）。 */
  posOf: (id: number) => P | null,
  relOf: (id: number) => R,
  resolveOne: (id: number, p: typeof posOf, r: typeof relOf) => T | null,
  resolvePad: (p: typeof posOf, r: typeof relOf) => T | null,
): T | null {
  const t = fb.target();
  return t !== null ? resolveOne(t, posOf, relOf) : resolvePad(posOf, relOf);
}

/**
 * ⭐ 「先給回饋、再送出去」包成**一行** —— ⛔ 而不是在每一個 `onOrder` 呼叫點
 * 各寫五行。
 *
 * ⚠️ ⭐ 那不是潔癖：`GameApp.ts` 有一條**棘輪**（`< 4,000` 行，第〇·七守則），
 * 而它 60 天內被改了 **116 次** ⇒ ⭐ 每一條 lane 往它塞五行，⛔ 那個檔就回不去了。
 * ⇒ **接線一行，決定在這裡。**
 */
export function withOrderFeedback(
  fb: OrderFeedbackRunner,
  send: (order: Order) => void,
): (order: Order) => void {
  return (order) => {
    fb.apply(order);
    send(order);
  };
}
