/**
 * CAST FRAME DATA — the body must not lie about when the move comes out.
 *
 * The sim owns WHEN damage lands: `abilitySystem` emits `castBegin` and
 * `CastResolveSystem` runs the effects exactly `round(castTimeSec / dt)` ticks
 * later. The renderer may only ALIGN to that. Before this lane the cast clip
 * was spanned across the startup window, so the release frame — which artists
 * put at ~60% of a cast clip, not at its end — played BEFORE the damage tick.
 *
 * Every clip duration used here is MEASURED from the shipped .glb bytes (the
 * glTF animation input accessors of the clip each model doc's clipMap names for
 * "cast"), not invented:
 *   champ.sela          "Spellcast_Long" 2.5333 s
 *   imported.heropikachu "Spell Throw"   0.1670 s  (clamps: too short)
 *   imported.grandorcaura "Stand"       21.3333 s  (clamps: too long)
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  ClipAnimator,
  alignPulseClip,
  naiveStrikeErrorMs,
  PULSE_RATE_MAX,
  PULSE_RATE_MIN,
} from "./ClipAnimator";
import {
  castFollowThroughMs,
  castStrikeFractionFor,
  DEFAULT_CAST_STRIKE_FRACTION,
  CAST_STRIKE_FRACTION_BY_MODEL,
} from "./anim/castStrike";
import { AnimationStateMachine } from "./anim/AnimationStateMachine";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";

const F = DEFAULT_CAST_STRIKE_FRACTION; // 0.6
/** measured cast-clip durations (seconds), see the file header */
const SELA = 2.5333333;
const PIKACHU = 0.167;
const GRAND_ORC_AURA = 21.3333333;

/** Where the strike frame lands in REAL time, replaying the plan by hand. */
const strikeAtMs = (durSec: number, startupSec: number, f = F): number => {
  const p = alignPulseClip(durSec, startupSec, f);
  return (p.delaySec + (f * durSec - p.skipSec) / p.rate) * 1000;
};

describe("cast strike fraction table", () => {
  it("defaults to 0.6 and only accepts a sane per-model override", () => {
    cover("client-anim-clip-playback");
    expect(castStrikeFractionFor("champ.sela")).toBe(DEFAULT_CAST_STRIKE_FRACTION);
    expect(castStrikeFractionFor(undefined)).toBe(DEFAULT_CAST_STRIKE_FRACTION);
    // the shipped table is deliberately empty — an invented number would look
    // tuned. Every entry has to come from the /frame-data audition page.
    expect(Object.keys(CAST_STRIKE_FRACTION_BY_MODEL)).toHaveLength(0);
  });

  it("the follow-through is the rest of the clip after the release frame", () => {
    // 0.6 s startup at f = 0.6 → the clip spans 1.0 s, so 0.4 s plays AFTER the
    // damage tick. That tail is the whole point: the body finishes the throw.
    expect(castFollowThroughMs(600, 0.6)).toBeCloseTo(400, 6);
    expect(castFollowThroughMs(600, 0.6) + 600).toBeCloseTo(600 / 0.6, 6);
    expect(castFollowThroughMs(0, 0.6)).toBe(0);
  });
});

describe("alignPulseClip — the strike frame lands ON the damage tick", () => {
  it("unclamped: sela's 2.53s cast clip fits a 0.6s startup exactly", () => {
    cover("client-anim-clip-playback");
    const p = alignPulseClip(SELA, 0.6, F);
    expect(p.clamped).toBe("none");
    expect(p.delaySec).toBe(0);
    expect(p.skipSec).toBe(0);
    // rate = clip / (startup / f) = 2.5333 / 1.0
    expect(p.rate).toBeCloseTo(2.5333333, 5);
    expect(strikeAtMs(SELA, 0.6)).toBeCloseTo(600, 6);
    // and the tail really plays after the tick
    expect(p.spanSec * 1000).toBeCloseTo(1000, 6);
  });

  it("clamped SLOW: pikachu's 0.167s clip holds its opening frame, then throws on the tick", () => {
    const p = alignPulseClip(PIKACHU, 0.6, F);
    expect(p.clamped).toBe("slow");
    expect(p.rate).toBe(PULSE_RATE_MIN);
    // 0.167s at 0.5x plays for 0.334s; its strike is 0.2004s in, so hold 0.3996s
    expect(p.delaySec).toBeCloseTo(0.3996, 5);
    expect(p.skipSec).toBe(0);
    expect(strikeAtMs(PIKACHU, 0.6)).toBeCloseTo(600, 6);
  });

  it("clamped FAST: the 21.3s aura clip starts partway in instead of striking 3.7s late", () => {
    const p = alignPulseClip(GRAND_ORC_AURA, 0.6, F);
    expect(p.clamped).toBe("fast");
    expect(p.rate).toBe(PULSE_RATE_MAX);
    expect(p.delaySec).toBe(0);
    // skip = f*D - startup*rate = 12.8 - 1.8 = 11.0s of clip time
    expect(p.skipSec).toBeCloseTo(11.0, 5);
    expect(strikeAtMs(GRAND_ORC_AURA, 0.6)).toBeCloseTo(600, 6);
  });

  it("is exact across every measured duration and every plausible startup", () => {
    for (const d of [0.033, 0.167, 0.3, 0.667, 0.9, 1.166, 2.5333333, 6, 21.3333333]) {
      for (const s of [0.6, 0.65, 0.7, 0.8, 0.9, 1.1]) {
        expect(strikeAtMs(d, s)).toBeCloseTo(s * 1000, 6);
        expect(alignPulseClip(d, s, F).strikeErrorMs).toBe(0);
      }
    }
  });

  it("a zero-length / missing clip holds for the startup instead of dividing by zero", () => {
    // 4 shipped models measure 0.000s on their cast clip (earthtornado2,
    // heroeva01s2, heroraichus3, tectonicfury) — geometry-less WC3 dummies.
    const p = alignPulseClip(0, 0.6, F);
    expect(p.delaySec).toBeCloseTo(0.6, 6);
    expect(Number.isFinite(p.rate)).toBe(true);
    expect(Number.isFinite(p.spanSec)).toBe(true);
  });
});

describe("naiveStrikeErrorMs — the lie this lane removes", () => {
  it("reports how early the body used to throw the move", () => {
    cover("client-anim-clip-playback");
    // sela: rate clamps to 3.0, clip plays in 0.844s, strike at 0.507s → 93ms early
    expect(naiveStrikeErrorMs(SELA, 0.6, F)).toBeCloseTo(-93.3, 1);
    // pikachu: 400ms early — two thirds of the whole cast
    expect(naiveStrikeErrorMs(PIKACHU, 0.6, F)).toBeCloseTo(-399.6, 1);
    // the aura clip is the opposite failure: 3.7s LATE
    expect(naiveStrikeErrorMs(GRAND_ORC_AURA, 0.6, F)).toBeCloseTo(3666.7, 1);
  });

  it("is never zero for a clip whose release is not at its very end", () => {
    // the general case: spanning the clip over the startup puts the strike at
    // f*startup, i.e. (1-f) of the startup too early.
    expect(naiveStrikeErrorMs(0.6, 0.6, F)).toBeCloseTo(-240, 6); // 1.0x, no clamp
  });
});

/* ------------------------------------------------------- ClipAnimator wiring */

class AlignFakeGroup {
  from = 0;
  to = 152; // 2.5333s at the loader's 60 fps
  speedRatio = 1;
  startCalls: { loop: boolean; speed: number; from?: number; to?: number }[] = [];
  targetedAnimations = [{ animation: { enableBlending: false, blendingSpeed: 0 } }];
  constructor(
    public name: string,
    frames = 152,
  ) {
    this.to = frames;
  }
  start(loop: boolean, speed: number, from?: number, to?: number): void {
    this.startCalls.push({ loop, speed, from, to });
    this.speedRatio = speed;
  }
  stop(): void {}
  dispose(): void {}
}

const asGroups = (g: AlignFakeGroup[]): AnimationGroup[] => g as unknown as AnimationGroup[];

describe("ClipAnimator strike alignment", () => {
  const build = (castFrames: number): { cast: AlignFakeGroup; animator: ClipAnimator } => {
    const idle = new AlignFakeGroup("Idle", 60);
    const cast = new AlignFakeGroup("Spellcast_Long", castFrames);
    const animator = new ClipAnimator(asGroups([idle, cast]), {
      idle: "Idle",
      cast: "Spellcast_Long",
    });
    return { cast, animator };
  };

  it("plays the clip at the aligned rate, from the top, when nothing clamps", () => {
    cover("client-anim-clip-playback");
    const { cast, animator } = build(152); // 2.5333s
    animator.setPulseAlignment("cast", { startupSec: 0.6, strikeFraction: F });
    animator.play("cast");
    expect(cast.startCalls).toHaveLength(1);
    expect(cast.startCalls[0]!.loop).toBe(false);
    expect(cast.startCalls[0]!.speed).toBeCloseTo(2.5333, 3);
    expect(cast.startCalls[0]!.from).toBe(0);
    expect(animator.lastPlan?.clamped).toBe("none");
    expect(animator.clipDurationSec("cast")).toBeCloseTo(2.5333, 3);
  });

  it("HOLDS a too-short clip at speed 0 and releases it exactly on schedule", () => {
    const { cast, animator } = build(10); // 0.1667s — clamps slow
    animator.setPulseAlignment("cast", { startupSec: 0.6, strikeFraction: F });
    animator.play("cast");
    expect(animator.lastPlan?.clamped).toBe("slow");
    expect(cast.startCalls[0]!.speed).toBe(0); // held on the opening frame
    animator.advance(200);
    expect(cast.speedRatio).toBe(0); // still holding
    animator.advance(199);
    expect(cast.speedRatio).toBe(0);
    animator.advance(2); // 401ms total > the 399.6ms hold
    expect(cast.speedRatio).toBe(PULSE_RATE_MIN); // now it plays
  });

  it("hitstop PAUSES the hold — the sim pauses the cast wind-up too", () => {
    const { cast, animator } = build(10);
    animator.setPulseAlignment("cast", { startupSec: 0.6, strikeFraction: F });
    animator.play("cast");
    animator.setFrozen(true);
    animator.advance(5000); // frozen: the hold must not tick down
    animator.setFrozen(false);
    expect(cast.speedRatio).toBe(0);
    animator.advance(401);
    expect(cast.speedRatio).toBe(PULSE_RATE_MIN);
  });

  it("SKIPS into a too-long clip instead of striking late", () => {
    const { cast, animator } = build(1280); // 21.333s — clamps fast
    animator.setPulseAlignment("cast", { startupSec: 0.6, strikeFraction: F });
    animator.play("cast");
    expect(animator.lastPlan?.clamped).toBe("fast");
    expect(cast.startCalls[0]!.speed).toBe(PULSE_RATE_MAX);
    // 11.0s of clip time skipped → 660 frames at the loader's 60 fps
    expect(cast.startCalls[0]!.from).toBeCloseTo(660, 0);
    expect(cast.startCalls[0]!.to).toBe(1280);
  });

  it("without an alignment it still behaves exactly as before (attack path)", () => {
    const { cast, animator } = build(152);
    animator.setPulseWindow("cast", 2.0);
    animator.play("cast");
    expect(cast.startCalls[0]!.from).toBeUndefined();
    expect(cast.startCalls[0]!.speed).toBeCloseTo(2.5333 / 2.0, 3);
    expect(animator.lastPlan).toBeNull();
  });
});

/* ------------------------------------------ state machine: release vs cancel */

describe("AnimationStateMachine cast release", () => {
  it("keeps the follow-through after the action frame, but movement breaks it", () => {
    cover("client-anim-clip-playback");
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0, 1000); // 600ms startup + 400ms tail
    expect(sm.update({ alive: true, moving: false }, 300)).toBe("cast");
    sm.release("cast", 600, 400); // castEnd — the damage just landed
    expect(sm.inRecovery).toBe(true);
    expect(sm.update({ alive: true, moving: false }, 800)).toBe("cast"); // tail plays
    expect(sm.update({ alive: true, moving: true }, 850)).toBe("run"); // but yields to a move
    expect(sm.inRecovery).toBe(false);
  });

  it("movement does NOT break the wind-up before the action frame", () => {
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0, 1000);
    // the caster is rooted by the sim during the wind-up; the body must hold
    expect(sm.update({ alive: true, moving: true }, 300)).toBe("cast");
  });

  it("the tail ends on its own", () => {
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0, 1000);
    sm.release("cast", 600, 400);
    expect(sm.update({ alive: true, moving: false }, 999)).toBe("cast");
    expect(sm.update({ alive: true, moving: false }, 1001)).toBe("idle");
  });

  it("extendPulse grows the window by a hitstop freeze", () => {
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0, 1000);
    sm.extendPulse("cast", 120);
    expect(sm.update({ alive: true, moving: false }, 1100)).toBe("cast");
    sm.extendPulse("hurt", 500); // wrong kind — ignored
    expect(sm.update({ alive: true, moving: false }, 1121)).toBe("idle");
  });
});

/* --------------------------------------------------- end-to-end through events */

describe("EntityViewRegistry cast events (end to end)", () => {
  const champ = (id: number, alive = true): EntityViewState => ({
    id,
    kind: 0,
    seatId: 0,
    key: "champ.sela",
    teamId: 1,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive,
  });
  const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
    x: e.x,
    z: e.z,
    fx: e.fx,
    fz: e.fz,
  });

  it("castBegin holds the pose past the damage tick, and castEnd does NOT cut it", () => {
    cover("client-anim-clip-playback");
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (nowMs: number): void =>
      registry.sync({
        entities: [champ(9)],
        poseFor: passthrough,
        nowMs,
        dtMs: 16,
        loadModels: false,
      });
    sync(0);
    const view = registry.getChampionView(9)!;

    // 18 ticks = 0.6s (the owner's new default cast time)
    registry.handleEvent(
      { type: "castBegin", data: { caster: 9, ticks: 18, castTimeSec: 0.6 } } as never,
      0,
    );
    sync(300);
    expect(view.anim.state).toBe("cast");
    // the damage tick — the sim resolves here and the release frame plays NOW
    registry.handleEvent({ type: "castEnd", data: { caster: 9 } } as never, 600);
    sync(700);
    expect(view.anim.state).toBe("cast"); // follow-through, not a snap to idle
    sync(1050);
    expect(view.anim.state).toBe("idle"); // 600 + 400ms tail has elapsed

    registry.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("castInterrupt still cuts the pose immediately (the move never came out)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (nowMs: number): void =>
      registry.sync({
        entities: [champ(10)],
        poseFor: passthrough,
        nowMs,
        dtMs: 16,
        loadModels: false,
      });
    sync(0);
    const view = registry.getChampionView(10)!;
    registry.handleEvent({ type: "castBegin", data: { caster: 10, ticks: 18 } } as never, 0);
    sync(200);
    expect(view.anim.state).toBe("cast");
    registry.handleEvent({ type: "castInterrupt", data: { caster: 10 } } as never, 300);
    sync(310);
    expect(view.anim.state).toBe("idle");
    registry.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("prefers the sim's integer tick count over castTimeSec", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (nowMs: number): void =>
      registry.sync({
        entities: [champ(11)],
        poseFor: passthrough,
        nowMs,
        dtMs: 16,
        loadModels: false,
      });
    sync(0);
    const view = registry.getChampionView(11)!;
    // ticks says 30 (1.0s); castTimeSec says 0.1s. CastResolveSystem counts the
    // TICKS, so the body must follow the ticks.
    registry.handleEvent(
      { type: "castBegin", data: { caster: 11, ticks: 30, castTimeSec: 0.1 } } as never,
      0,
    );
    sync(900);
    expect(view.anim.state).toBe("cast");
    registry.dispose();
    scene.dispose();
    engine.dispose();
  });
});
