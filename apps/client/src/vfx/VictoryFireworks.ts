/**
 * VictoryFireworks — the one object the game holds for the task #93 victory
 * celebration. It composes the two tiers built here and drives them from the
 * pure `VictoryGate` edge-detector, so the whole feature is:
 *
 *   const fw = new VictoryFireworks(scene, { cameraFor });
 *   // once per frame, from the match-state frame loop:
 *   fw.sync({ phase, outcomeDecided, round, myTeamId, myRoundWins, myPlacement }, nowMs);
 *   fw.update(nowMs);
 *   // teardown:
 *   fw.dispose();
 *
 * The two tiers are deliberately DIFFERENT effects, not one at two sizes:
 *   ROUND WIN → a short SmallFireworkFx volley (punctuation, fires every round).
 *   MATCH WIN (吃雞) → the full-screen ChickenFireworkFx (the joke, fires once).
 *
 * This file owns NEITHER the screen tint (grey for a round, dark for the match)
 * NOR the taunt VO. Those belong to the umbrella presentation task, which owns
 * the death-grey reuse (#85) and the settlement (#25); this exposes exactly the
 * hooks that layer needs — `onRoundWin` / `onMatchWin` callbacks fired on the
 * same edge as the firework — so the tint and the voice line land on the beat
 * without this module reaching across those file-ownership boundaries.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { ChickenFireworkFx, type ChickenFireworkOptions } from "./ChickenFireworkFx";
import { SmallFireworkFx } from "./SmallFireworkFx";
import { VictoryGate, type VictoryFire, type VictoryInput } from "./victoryTrigger";

export interface VictoryFireworksOptions extends ChickenFireworkOptions {
  cameraFor?: () => Camera | null;
  /** Fired on the frame a round win is detected (screen-grey + taunt hook). */
  onRoundWin?: (round: number) => void;
  /** Fired on the frame the match win is detected (screen-dark + savage VO). */
  onMatchWin?: () => void;
}

export class VictoryFireworks {
  private readonly gate = new VictoryGate();
  private readonly chicken: ChickenFireworkFx;
  private readonly small: SmallFireworkFx;

  constructor(
    scene: Scene,
    private readonly opts: VictoryFireworksOptions = {},
  ) {
    this.chicken = new ChickenFireworkFx(scene, opts);
    this.small = new SmallFireworkFx(scene, opts);
  }

  /** True while EITHER tier is in flight (settlement camera / audio ducking). */
  get active(): boolean {
    return this.chicken.active || this.small.active;
  }

  /** Point count of the built chicken cloud (observability). */
  get chickenPointCount(): number {
    return this.chicken.pointCount;
  }

  /**
   * Feed the authoritative match state once per frame. Fires the matching
   * celebration on the frame an edge is crossed. Returns the edge (or none)
   * so a caller can also react without a callback.
   */
  sync(input: VictoryInput, nowMs: number): VictoryFire {
    const fire = this.gate.update(input);
    if (fire.kind === "round") {
      this.small.play(nowMs, fire.round);
      this.opts.onRoundWin?.(fire.round);
    } else if (fire.kind === "match") {
      this.chicken.play(nowMs);
      this.opts.onMatchWin?.();
    }
    return fire;
  }

  /** Fire the match-win chicken directly (audition / debug console). */
  playChicken(nowMs: number): void {
    this.chicken.play(nowMs);
  }

  /** Fire a round-win volley directly (audition / debug console). */
  playRoundVolley(nowMs: number, round = 0): void {
    this.small.play(nowMs, round);
  }

  /** Advance both tiers. Call once per frame. */
  update(nowMs: number): void {
    this.chicken.update(nowMs);
    this.small.update(nowMs);
  }

  /** New match / room re-join: re-arm the gate so a new win can fire. */
  reset(): void {
    this.gate.reset();
    this.chicken.stop();
    this.small.stop();
  }

  dispose(): void {
    this.chicken.dispose();
    this.small.dispose();
  }
}
