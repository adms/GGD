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
 * ⚠️ **兩層各自有一個後台開關**（`config/victory-fx@1`，owner 2026-08-02
 * 「請你直接取消煙火(變成後台開關)」），而**出貨值兩格都是關的**。閘門在
 * `sync()` 裡、就在 `play()` 之前 —— 刻意放在這裡而不是 `play()` 裡面，因為
 * `playChicken` / `playRoundVolley` 是 audition 頁（`render/presentationAudition`）
 * 的入口，那一頁存在的唯一理由就是把煙火看清楚，關掉出貨煙火不該讓它變成一張黑畫面。
 *
 * ⚠️ 閘門**只擋煙火**。`onRoundWin` / `onMatchWin` 照樣在同一格 fire —— 那兩個
 * callback 帶的是灰底/暗底與嘲弄語音，owner 要拿掉的是煙火，不是整個勝利表演。
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
import { victoryFxPolicy } from "./victoryFxPolicy";
import type { VictoryFxPolicy } from "@ggd/shared/content";

export interface VictoryFireworksOptions extends ChickenFireworkOptions {
  cameraFor?: () => Camera | null;
  /** Fired on the frame a round win is detected (screen-grey + taunt hook). */
  onRoundWin?: (round: number) => void;
  /** Fired on the frame the match win is detected (screen-dark + savage VO). */
  onMatchWin?: () => void;
  /**
   * 煙火開關的來源（測試 seam）。省略 = 讀 `vfx/victoryFxPolicy` 的現行政策,
   * 也就是 `content/config/victory-fx.json` 推進來的那一份。
   *
   * ⚠️ 這是一個 **seam,不是一個必填的接線**。省略時的行為是「讀真正生效的
   * 那份政策」而不是「一律放」—— 忘了接的結果必須和出貨狀態一致,否則這個
   * 選項本身就會變成第②號故障（後台關了但某條路照樣放煙火）的來源。
   */
  policy?: () => VictoryFxPolicy;
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
    // 後台開關 (config/victory-fx@1, owner 2026-08-02「請你直接取消煙火」)。
    // 出貨兩格都是關的,所以出貨狀態下這兩個 play() 一次都不會被呼叫。
    const policy = this.opts.policy?.() ?? victoryFxPolicy();
    if (fire.kind === "round") {
      if (policy.roundVolley.enabled) this.small.play(nowMs, fire.round);
      this.opts.onRoundWin?.(fire.round);
    } else if (fire.kind === "match") {
      if (policy.matchChicken.enabled) this.chicken.play(nowMs);
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
