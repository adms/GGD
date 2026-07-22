/**
 * TimeSync — estimates the server's current tick from `state.tick` patch
 * arrivals so the client can advance a smooth interpolation clock between
 * snapshots. Pure TS; the caller supplies the local clock (ms).
 */
import { TICK_MS, INTERP_DELAY_MS } from "@ggd/shared/constants";

export class TimeSync {
  private offsetTicks = Number.NaN; // serverTick - localMs/TICK_MS (smoothed)

  /** Feed every observed `state.tick` with the local receive time. */
  noteServerTick(tick: number, nowMs: number): void {
    const observed = tick - nowMs / TICK_MS;
    if (!Number.isFinite(this.offsetTicks)) {
      this.offsetTicks = observed;
      return;
    }
    // Large discontinuity (reconnect, long stall) → resync hard.
    if (Math.abs(observed - this.offsetTicks) > 3000 / TICK_MS) {
      this.offsetTicks = observed;
      return;
    }
    // Smooth: exponential moving average keeps the clock steady under jitter.
    this.offsetTicks += (observed - this.offsetTicks) * 0.1;
  }

  get ready(): boolean {
    return Number.isFinite(this.offsetTicks);
  }

  /** Estimated authoritative tick right now (fractional). */
  estimateServerTick(nowMs: number): number {
    return this.offsetTicks + nowMs / TICK_MS;
  }

  /** The tick remote entities should be rendered at (~INTERP_DELAY_MS ago). */
  renderTick(nowMs: number, delayMs: number = INTERP_DELAY_MS): number {
    return this.estimateServerTick(nowMs) - delayMs / TICK_MS;
  }
}
