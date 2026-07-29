/**
 * IntentSender — builds seq-stamped InputMessages from the input layer.
 * Continuous order/aim coalesce (latest wins) and go out at 30 Hz; discrete
 * commands flush immediately. Sequence numbers wrap in uint16 space (never 0,
 * matching the server mailbox's "diff==0 is stale" rule).
 */
import type { InputMessage } from "@ggd/shared/protocol/messages";
import type { Order, Command } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { TICK_HZ } from "@ggd/shared/constants";

/**
 * 派生,不是字面量:伺服器的信箱一個 sim tick 只吃一筆 intent,所以送出率的
 * 上限就是 tick 率。寫死 30 的話,TICK_HZ 一改這裡就靜默錯開。
 */
const SEND_INTERVAL_MS = 1000 / TICK_HZ;

/**
 * 門檻要比 `SEND_INTERVAL_MS` 早多少毫秒 (task #282)。
 *
 * ⚠️ 這**不是**保險裕度,它是修正本體。天真的 `now - last < interval` 會
 * **自我毀滅**:每一次送出都把 `lastSendMs` 釘在「呼叫到達的那一刻」,所以下一
 * 次只要早 0.03 ms 到就整拍被丟掉,要再等一整個呼叫週期。量到的結果是
 * 30 fps → 19.6/s、60 fps → 20.8/s(見 `input/IntentClock.ts` 檔頭的表)。
 * `render/frameCap.ts` 的 `FRAME_CAP_SLACK_MS` 早就為了**同一個**現象存在,
 * 只是這條節流從來沒有拿到同一份修正。
 *
 * 上游 (`input/IntentClock`) 現在用絕對拍點餵這裡,間隔理論上剛好是
 * `SEND_INTERVAL_MS` —— 但 `origin + 2p` 減 `origin + p` 在浮點下**不保證**
 * 等於 `p`(1000/30 是無限循環小數),所以沒有這個 slack,拍子照樣被吃掉一半。
 *
 * 2 ms 是 33.3 ms 的 6%:足以吸收浮點誤差與計時器抖動,而最壞情況的送出率
 * 只放寬到 1000/31.3 ≈ 31.9/s,仍然貼著 sim 的 30Hz。
 */
const SEND_SLACK_MS = 2;

export class IntentSender {
  private seq = 0;
  private pendingOrder: Order | undefined;
  private pendingAim: Vec2 | undefined;
  private lastSendMs = -Infinity;

  /** Observer hook (e.g. LocalPrediction records sent orders by seq). */
  onSent: ((msg: InputMessage) => void) | null = null;

  constructor(private readonly transmit: (msg: InputMessage) => void) {}

  get lastSeq(): number {
    return this.seq;
  }

  setOrder(order: Order): void {
    this.pendingOrder = order;
  }

  setAim(aim: Vec2): void {
    this.pendingAim = aim;
  }

  /** Discrete commands are urgent: flush now (carrying any pending order/aim). */
  pushCommand(cmd: Command, nowMs: number): void {
    this.flush(nowMs, [cmd]);
  }

  /**
   * Call once per INTENT BEAT (`input/IntentClock`, task #282 — NOT once per
   * animation frame any more); sends coalesced order/aim at most at TICK_HZ.
   * `nowMs` is the beat clock, so the slack below is what keeps the beat from
   * being aliased away — see SEND_SLACK_MS.
   */
  update(nowMs: number): void {
    if (!this.pendingOrder && !this.pendingAim) return;
    if (nowMs - this.lastSendMs < SEND_INTERVAL_MS - SEND_SLACK_MS) return;
    this.flush(nowMs, []);
  }

  private nextSeq(): number {
    this.seq = (this.seq + 1) & 0xffff;
    if (this.seq === 0) this.seq = 1;
    return this.seq;
  }

  private flush(nowMs: number, commands: Command[]): void {
    const msg: InputMessage = { seq: this.nextSeq() };
    if (this.pendingOrder) msg.order = this.pendingOrder;
    if (this.pendingAim) msg.aim = this.pendingAim;
    if (commands.length > 0) msg.commands = commands;
    this.pendingOrder = undefined;
    this.pendingAim = undefined;
    this.lastSendMs = nowMs;
    this.transmit(msg);
    this.onSent?.(msg);
  }
}
