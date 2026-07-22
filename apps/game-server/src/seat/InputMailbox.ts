/**
 * Per-seat buffered client input. The network layer pushes; the HumanDriver
 * drains once per tick. Movement/aim keep only the LATEST value; discrete
 * commands queue in seq order.
 */
import type { Order, Command } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { InputMessage } from "@ggd/shared/protocol/messages";

export class InputMailbox {
  private latestOrder: Order | undefined;
  private latestAim: Vec2 | undefined;
  private commands: Command[] = [];
  private _lastSeq = 0;

  push(msg: InputMessage): void {
    // wrap-aware seq acceptance (uint16 space)
    if (msg.seq !== undefined) {
      const diff = (msg.seq - this._lastSeq + 65536) % 65536;
      if (diff === 0 || diff > 32768) return; // stale/duplicate
      this._lastSeq = msg.seq;
    }
    if (msg.order) this.latestOrder = msg.order;
    if (msg.aim) this.latestAim = msg.aim;
    if (msg.commands?.length) this.commands.push(...msg.commands);
  }

  /** Drain into an IntentFrame for this tick. */
  drain(): { order?: Order; aim?: Vec2; commands: Command[] } {
    const frame = {
      order: this.latestOrder,
      aim: this.latestAim,
      commands: this.commands,
    };
    this.latestOrder = undefined;
    this.latestAim = undefined;
    this.commands = [];
    return frame;
  }

  get lastSeq(): number {
    return this._lastSeq;
  }

  clear(): void {
    this.latestOrder = undefined;
    this.latestAim = undefined;
    this.commands = [];
  }
}
