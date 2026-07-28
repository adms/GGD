/** HumanDriver — drains the seat's network InputMailbox each tick. */
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import { InputMailbox } from "./InputMailbox";
import type { Seat, SeatDriver } from "./Seat";

export class HumanDriver implements SeatDriver {
  readonly kind = "human" as const;
  readonly mailbox = new InputMailbox();

  onAttach(_seat: Seat): void {
    // stale pre-takeover input must not fire after regaining control
    this.mailbox.clear();
  }

  onDetach(): void {
    this.mailbox.clear();
  }

  produceIntent(_seat: Seat, _world: SimWorld, tick: number): IntentFrame {
    // The ABSOLUTE tick goes into the drain: it is the clock the #280 aim
    // carry-forward expires on (no per-tick decrement, no ordering trap).
    const { order, aim, commands } = this.mailbox.drain(tick);
    return { order, aim, commands };
  }
}
