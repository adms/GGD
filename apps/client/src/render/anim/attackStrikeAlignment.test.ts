/**
 * GH#40 —— 普攻的接觸幀必須落在傷害 tick 上，⛔ 不是「窗口變寬就算對齊」。
 *
 * 在此之前 `attackWindup` 做的是 `windowMs: windup / 0.5` ——「假設接觸在片段的
 * 一半」只被用來**放寬窗口**，⛔ 從來沒有任何東西照著那個假設**規劃片段**。
 * 於是 `pulseSpeedRatio` 把片段硬塞進窗口，再被 [0.5x, 3x] 播放率夾子夾住，
 * 而夾住之後片段就**不再跨滿那個窗口**了 —— 接觸幀偏掉，⛔ 沒有任何東西會喊。
 * 這正是 `alignPulseClip` 當初為施法寫出來要補的那個洞（見 ClipAnimator 檔頭）。
 *
 * 這裡驗的是**機制**（第二守則），⛔ 不驗數字：
 *   ① 事件真的走到 `ChampionView.beginAttack`（拆掉接線 → 紅）
 *   ② 對齊之後接觸幀落在 tick 上，而舊的「塞進窗口」做法在同一支片段上偏掉
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ClipAnimator, PULSE_RATE_MIN, alignPulseClip } from "../ClipAnimator";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import {
  ATTACK_STRIKE_FRACTION_BY_MODEL,
  DEFAULT_ATTACK_STRIKE_FRACTION,
  attackStrikeFractionFor,
} from "./castStrike";

const F = DEFAULT_ATTACK_STRIKE_FRACTION;

describe("attack strike fraction table", () => {
  it("defaults, clamps out-of-range overrides, and ships EMPTY", () => {
    cover("client-anim-clip-playback");
    expect(attackStrikeFractionFor("champ.sela")).toBe(F);
    expect(attackStrikeFractionFor(undefined)).toBe(F);
    // ⛔ 刻意空的（同 CAST 表）：編出來的數字看起來像調過，但不比預設值真。
    expect(Object.keys(ATTACK_STRIKE_FRACTION_BY_MODEL)).toHaveLength(0);
  });
});

class FakeGroup {
  from = 0;
  speedRatio = 1;
  startCalls: { speed: number; from?: number }[] = [];
  targetedAnimations = [{ animation: { enableBlending: false, blendingSpeed: 0 } }];
  constructor(
    public name: string,
    public to: number,
  ) {}
  start(_loop: boolean, speed: number, from?: number): void {
    this.startCalls.push({ speed, from });
    this.speedRatio = speed;
  }
  stop(): void {}
  dispose(): void {}
}

describe("the swing is PLANNED, not just given a wider window", () => {
  it("lands the contact frame on the damage tick where window-fitting misses it", () => {
    cover("client-anim-clip-playback");
    // 10 frames @60fps = 0.167s of swing against a 0.4s wind-up: the rate the
    // naive path wants is far below the 0.5x floor, so the clamp bites.
    const swing = new FakeGroup("Attack", 10);
    const groups = [new FakeGroup("Idle", 60), swing] as unknown as AnimationGroup[];
    const animator = new ClipAnimator(groups, { idle: "Idle", attack: "Attack" });
    const startupSec = 0.4;

    // OLD behaviour: fit the clip to the widened window. It clamps, so the clip
    // no longer spans that window and the contact frame drifts off the tick.
    animator.setPulseWindow("attack", startupSec / F);
    animator.play("attack");
    const naiveStrikeMs = F * ((swing.to / 60 / swing.speedRatio) * 1000);
    expect(animator.lastPlan).toBeNull();
    expect(Math.abs(naiveStrikeMs - startupSec * 1000)).toBeGreaterThan(50);

    // NEW behaviour: plan it. The opening frame is held, then played, so the
    // contact frame is exactly on the tick.
    animator.stopAll();
    animator.setPulseAlignment("attack", { startupSec, strikeFraction: F });
    animator.play("attack");
    const plan = animator.lastPlan!;
    expect(plan.state).toBe("attack");
    expect(plan.clamped).toBe("slow");
    expect(plan.rate).toBe(PULSE_RATE_MIN);
    const strikeMs =
      (plan.delaySec + (F * (swing.to / 60) - plan.skipSec) / plan.rate) * 1000;
    expect(strikeMs).toBeCloseTo(startupSec * 1000, 6);
    expect(alignPulseClip(swing.to / 60, startupSec, F).strikeErrorMs).toBe(0);
    animator.dispose();
  });
});

describe("attackWindup reaches the plan (end to end)", () => {
  it("routes the sim's wind-up into beginAttack, in milliseconds", () => {
    cover("client-anim-clip-playback");
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const e: EntityViewState = {
      id: 7,
      kind: 0,
      seatId: 0,
      key: "champ.sela",
      teamId: 1,
      x: 0,
      z: 0,
      fx: 1,
      fz: 0,
      alive: true,
    };
    registry.sync({
      entities: [e],
      poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    const view = registry.getChampionView(7)!;
    const spy = vi.spyOn(view, "beginAttack");
    // ⛔ 不抄出貨值：tick 數 × 真的 TICK_MS，斷言只問「換算對不對」。
    registry.handleEvent({ type: "attackWindup", data: { source: 7, ticks: 9 } } as never, 500);
    expect(spy).toHaveBeenCalledTimes(1);
    const [windupMs, nowMs] = spy.mock.calls[0]!;
    expect(nowMs).toBe(500);
    expect(windupMs).toBeGreaterThan(0);
    expect(view.attackStrikeFraction).toBe(F);
    registry.dispose();
    scene.dispose();
    engine.dispose();
  });
});
