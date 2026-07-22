/**
 * Match phase state machine, driven by TICK COUNT (deterministic — never wall
 * clock). champSelect → [intermission → combat → resolution]* → matchEnd.
 */
import { TICK_HZ } from "@ggd/shared/constants";

export type MatchPhase = "champSelect" | "intermission" | "combat" | "resolution" | "matchEnd";

export interface PhaseConfig {
  champSelectTicks: number;
  intermissionTicks: number;
  combatMaxTicks: number;
  resolutionTicks: number;
}

/**
 * FALLBACK durations only. The SHIPPED numbers live in the content doc
 * `config.match@1` (`content/config/config.match.json`) and are resolved per
 * match by `phaseConfig.ts` → `resolvePhaseConfig()`; this table is what a
 * match built without a loaded content tree (unit tests, skeleton boot) gets.
 *
 * `intermissionTicks` is the PREP WINDOW. It is 60 s, not the old 25 s: task
 * #38 moved the shop to centre stage during intermission, and 25 s is not
 * enough to read a catalogue, compare skills and still ready up — the Ready
 * button exists precisely so a player who is done can skip the remainder.
 * Keep this in sync with the content doc so the two never disagree on a
 * skeleton boot.
 *
 * `champSelectTicks` is 60 s for the same reason, and on the user's direct
 * instruction (「戰鬥開始英雄選擇時間應該是 60秒」). 15 s was never enough to
 * read a champion's kit, and task #76 is adding a rules briefing plus a full
 * profile panel with a 3D model — content that cannot be consumed in fifteen
 * seconds. The content doc is the shipped value; this constant only has to
 * agree with it so a skeleton boot behaves like the real thing.
 */
export const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  champSelectTicks: 60 * TICK_HZ,
  intermissionTicks: 60 * TICK_HZ,
  combatMaxTicks: 90 * TICK_HZ,
  resolutionTicks: 5 * TICK_HZ,
};

export class PhaseMachine {
  phase: MatchPhase = "champSelect";
  round = 0;
  ticksLeft: number;

  constructor(private readonly cfg: PhaseConfig = DEFAULT_PHASE_CONFIG) {
    this.ticksLeft = cfg.champSelectTicks;
  }

  /** Force-advance to the next phase (timer expiry or early completion). */
  advance(): MatchPhase {
    switch (this.phase) {
      case "champSelect":
        this.round = 1;
        this.enter("intermission");
        break;
      case "intermission":
        this.enter("combat");
        break;
      case "combat":
        this.enter("resolution");
        break;
      case "resolution":
        this.round++;
        this.enter("intermission");
        break;
      case "matchEnd":
        break;
    }
    return this.phase;
  }

  end(): void {
    this.phase = "matchEnd";
    this.ticksLeft = 0;
  }

  private enter(phase: MatchPhase): void {
    this.phase = phase;
    this.ticksLeft =
      phase === "intermission"
        ? this.cfg.intermissionTicks
        : phase === "combat"
          ? this.cfg.combatMaxTicks
          : phase === "resolution"
            ? this.cfg.resolutionTicks
            : 0;
  }

  /** Tick the timer; returns true if the phase timer expired this tick. */
  tickTimer(): boolean {
    if (this.phase === "matchEnd") return false;
    if (this.ticksLeft > 0) this.ticksLeft--;
    return this.ticksLeft === 0;
  }
}
