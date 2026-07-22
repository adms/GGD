/**
 * Seat — binds a seat index to its champion entity and its current driver.
 * `setDriver()` is THE takeover seam: all gameplay state lives in the sim, so
 * swapping the driver between ticks is the entire Human<->AI handover.
 */
import type { EntityId, SeatId, TeamId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";

export interface SeatDriver {
  readonly kind: "human" | "ai";
  onAttach(seat: Seat): void;
  onDetach(): void;
  produceIntent(seat: Seat, world: SimWorld, tick: number): IntentFrame;
}

export class Seat {
  entityId: EntityId | null = null;
  championId = "";
  sessionId: string | null = null; // colyseus client session (humans)
  accountId = "";
  displayName = "";
  ready = false;
  private driver: SeatDriver;
  /** driver swap requests applied at the next tick boundary */
  private pendingDriver: SeatDriver | null = null;

  constructor(
    public readonly seatId: SeatId,
    public readonly teamId: TeamId,
    initialDriver: SeatDriver,
  ) {
    this.driver = initialDriver;
    initialDriver.onAttach(this);
  }

  get driverKind(): "human" | "ai" {
    return this.driver.kind;
  }

  /** Request a driver swap; applied at the top of the next tick (never mid-tick). */
  setDriver(next: SeatDriver): void {
    this.pendingDriver = next;
  }

  /** Called by the runner at the tick boundary before intents are gathered. */
  applyPendingDriver(): boolean {
    if (!this.pendingDriver) return false;
    this.driver.onDetach();
    this.driver = this.pendingDriver;
    this.pendingDriver = null;
    this.driver.onAttach(this);
    return true;
  }

  produceIntent(world: SimWorld, tick: number): IntentFrame {
    return this.driver.produceIntent(this, world, tick);
  }
}
