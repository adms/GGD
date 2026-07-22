/**
 * IntentSender — builds seq-stamped InputMessages from the input layer.
 * Continuous order/aim coalesce (latest wins) and go out at 30 Hz; discrete
 * commands flush immediately. Sequence numbers wrap in uint16 space (never 0,
 * matching the server mailbox's "diff==0 is stale" rule).
 */
import type { InputMessage } from "@ggd/shared/protocol/messages";
import type { Order, Command } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

const SEND_INTERVAL_MS = 1000 / 30;

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

  /** Call once per frame; sends coalesced order/aim at most at 30 Hz. */
  update(nowMs: number): void {
    if (!this.pendingOrder && !this.pendingAim) return;
    if (nowMs - this.lastSendMs < SEND_INTERVAL_MS) return;
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
