/**
 * Per-seat buffered client input. The network layer pushes; the HumanDriver
 * drains once per tick. Movement/aim keep only the LATEST value; discrete
 * commands queue in seq order.
 *
 * ⚠️ AIM IS NOT LIKE ORDER (task #280). An `order` is CONTINUOUS state on the
 * sim side — `nav.moveTarget` survives the drain, so a tick that receives no
 * message keeps steering. `aim` is a PER-TICK EVENT: `MovementSystem` asks
 * `world.aimTick.get(id) === world.tick`, so a tick with no message reads as
 * 「玩家沒有在瞄」 and the #264 facing lock takes the body back. With the sender
 * at 30Hz and the sim at 30Hz, "no message this tick" happens constantly, and
 * the body jumped back and forth every other tick inside the lock window.
 *
 * `AimHold` (shared/sim/aimHold.ts) is what tells 「這一 tick 沒有訊息」 apart
 * from 「這一 tick 的訊息說我放手了」 — a distinction that exists ONLY here, at
 * the network boundary, and is gone by the time the frame reaches the sim.
 */
import type { Order, Command } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { AimHold } from "@ggd/shared/sim/aimHold";
import type { InputMessage } from "@ggd/shared/protocol/messages";

/**
 * Hard ceiling on commands buffered between drains. drain() hands the ENTIRE
 * accumulated array to one synchronous ctl.tick(), so an unbounded buffer is
 * both an O(N)-per-tick event-loop stall and a memory-growth vector if the room
 * is between drains or stalled. Excess commands past this cap are dropped. The
 * network ingress already validates + caps each message (net/validateInput.ts);
 * this is the defense-in-depth accumulation cap across many messages per tick.
 */
export const MAX_BUFFERED_COMMANDS = 256;

export class InputMailbox {
  private latestOrder: Order | undefined;
  private commands: Command[] = [];
  private _lastSeq = 0;
  /** #280 — carries the aim across a tick that received no message at all. */
  private readonly aim = new AimHold();

  push(msg: InputMessage): void {
    // wrap-aware seq acceptance (uint16 space)
    if (msg.seq !== undefined) {
      const diff = (msg.seq - this._lastSeq + 65536) % 65536;
      if (diff === 0 || diff > 32768) return; // stale/duplicate
      this._lastSeq = msg.seq;
    }
    if (msg.order) this.latestOrder = msg.order;
    // EVERY accepted message is observed, aim or not: a message WITHOUT aim is
    // the release signal, and it must not be mistaken for a dropped tick.
    this.aim.push(msg.aim);
    if (msg.commands?.length) {
      // Never buffer past the cap: take only what still fits, drop the rest.
      const room = MAX_BUFFERED_COMMANDS - this.commands.length;
      if (room > 0) {
        const incoming =
          msg.commands.length > room ? msg.commands.slice(0, room) : msg.commands;
        this.commands.push(...incoming);
      }
    }
  }

  /**
   * Drain into an IntentFrame for this tick. `tick` is the ABSOLUTE sim tick —
   * it is what bounds the #280 aim carry-forward (see AimHold).
   */
  drain(tick: number): { order?: Order; aim?: Vec2; commands: Command[] } {
    const frame = {
      order: this.latestOrder,
      aim: this.aim.drain(tick),
      commands: this.commands,
    };
    this.latestOrder = undefined;
    this.commands = [];
    return frame;
  }

  get lastSeq(): number {
    return this._lastSeq;
  }

  clear(): void {
    this.latestOrder = undefined;
    this.aim.clear();
    this.commands = [];
  }
}
