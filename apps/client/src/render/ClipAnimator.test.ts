/**
 * ClipAnimator — model-doc clipMap resolution against real KayKit-style clip
 * names, instance-prefix tolerance (cloned groups are "<entityId>-<clip>"),
 * fuzzy fallback, one-shot speed matching (incl. event-driven windows),
 * run-rate sync and blending setup (all on lightweight fake AnimationGroups;
 * no GLB needed).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import {
  ClipAnimator,
  resolveClips,
  pulseSpeedRatio,
  runSpeedRatio,
  clipNameMatches,
  REFERENCE_RUN_SPEED,
  RUN_RATE_MIN,
  RUN_RATE_MAX,
  PULSE_RATE_MIN,
  PULSE_RATE_MAX,
} from "./ClipAnimator";
import { PULSE_MS } from "./anim/AnimationStateMachine";

class FakeGroup {
  from = 0;
  to = 30; // 0.5s at the loader's 60fps
  speedRatio = 1.0;
  startCalls: { loop: boolean; speed: number }[] = [];
  stops = 0;
  disposes = 0;
  targetedAnimations = [{ animation: { enableBlending: false, blendingSpeed: 0 } }];
  constructor(public name: string) {}
  start(loop: boolean, speed: number): void {
    this.startCalls.push({ loop, speed });
    this.speedRatio = speed;
  }
  stop(): void {
    this.stops++;
  }
  dispose(): void {
    this.disposes++;
  }
}

const asGroups = (groups: FakeGroup[]): AnimationGroup[] => groups as unknown as AnimationGroup[];

/** the real KayKit clip list (subset) as it appears in mage.glb */
const KAYKIT_CLIPS = [
  "1H_Melee_Attack_Slice_Diagonal",
  "2H_Melee_Attack_Spin",
  "Cheer",
  "Death_A",
  "Hit_A",
  "Idle",
  "Running_A",
  "Spellcast_Long",
  "Spellcast_Shoot",
].map((n) => new FakeGroup(n));

/** the same clips as instantiateModelsToScene clones them for entity 42 */
const CLONED_WC3_CLIPS = [
  "42-Stand 2",
  "42-Attack",
  "42-Attack Slam",
  "42-Death",
  "42-Walk",
  "42-Stand",
  "42-Spell",
].map((n) => new FakeGroup(n));

describe("ClipAnimator clip resolution", () => {
  it("resolves the model doc clipMap to exact clips (sela = mage)", () => {
    cover("client-anim-clip-playback");
    const map = resolveClips(KAYKIT_CLIPS, {
      idle: "Idle",
      run: "Running_A",
      attack: "Spellcast_Shoot",
      cast: "Spellcast_Long",
      hurt: "Hit_A",
      death: "Death_A",
    });
    const nameOf = (state: Parameters<typeof map.get>[0]): string | undefined => {
      const idx = map.get(state);
      return idx === undefined ? undefined : KAYKIT_CLIPS[idx]!.name;
    };
    expect(nameOf("idle")).toBe("Idle");
    expect(nameOf("run")).toBe("Running_A");
    expect(nameOf("attack")).toBe("Spellcast_Shoot");
    expect(nameOf("cast")).toBe("Spellcast_Long");
    expect(nameOf("hurt")).toBe("Hit_A");
    expect(nameOf("death")).toBe("Death_A");
  });

  it("tolerates the per-instance clone prefix (imported model wiring)", () => {
    cover("client-anim-clip-playback");
    expect(clipNameMatches("42-Walk", "Walk")).toBe(true);
    expect(clipNameMatches("Walk", "Walk")).toBe(true);
    expect(clipNameMatches("42-Stand 2", "Stand")).toBe(false); // no partial
    // the imported.herosaber clipMap resolves against CLONED group names
    const map = resolveClips(CLONED_WC3_CLIPS, {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    });
    const nameOf = (state: Parameters<typeof map.get>[0]): string | undefined => {
      const idx = map.get(state);
      return idx === undefined ? undefined : CLONED_WC3_CLIPS[idx]!.name;
    };
    expect(nameOf("idle")).toBe("42-Stand"); // exact "Stand", NOT "Stand 2"
    expect(nameOf("run")).toBe("42-Walk");
    expect(nameOf("attack")).toBe("42-Attack");
    expect(nameOf("cast")).toBe("42-Spell");
    expect(nameOf("death")).toBe("42-Death");
  });

  it("falls back to fuzzy matching without a clipMap", () => {
    cover("client-anim-clip-playback");
    const map = resolveClips(KAYKIT_CLIPS);
    expect(KAYKIT_CLIPS[map.get("idle")!]!.name).toBe("Idle");
    expect(KAYKIT_CLIPS[map.get("run")!]!.name).toBe("Running_A");
    expect(KAYKIT_CLIPS[map.get("death")!]!.name).toBe("Death_A");
    expect(KAYKIT_CLIPS[map.get("hurt")!]!.name).toBe("Hit_A");
  });

  it("one-shot speed fits the clip to its pulse window (clamped both ways)", () => {
    cover("client-anim-clip-playback");
    expect(pulseSpeedRatio(0.5, "attack")).toBeCloseTo(0.5 / (PULSE_MS.attack / 1000));
    expect(pulseSpeedRatio(10, "attack")).toBe(PULSE_RATE_MAX); // clamp hi
    expect(pulseSpeedRatio(0.01, "hurt")).toBe(PULSE_RATE_MIN); // clamp lo
    expect(pulseSpeedRatio(0.5, "run")).toBe(1.0); // loops run natural
    expect(pulseSpeedRatio(0.5, "death")).toBe(1.0); // death natural + sticks
    // event-driven window override: 1.4s cast clip over a 2s cast → stretched
    expect(pulseSpeedRatio(1.4, "cast", 2.0)).toBeCloseTo(0.7);
    // 1.2s attack clip squeezed so the strike lands inside a 0.6s wind-up span
    expect(pulseSpeedRatio(1.2, "attack", 0.6)).toBeCloseTo(2.0);
  });

  it("run-rate syncs to ground speed (foot-slide fix), clamped", () => {
    cover("client-anim-clip-playback");
    expect(runSpeedRatio(REFERENCE_RUN_SPEED)).toBeCloseTo(1.0);
    expect(runSpeedRatio(REFERENCE_RUN_SPEED / 2)).toBeCloseTo(0.5 < RUN_RATE_MIN ? RUN_RATE_MIN : 0.5);
    expect(runSpeedRatio(100)).toBe(RUN_RATE_MAX); // clamp hi
    expect(runSpeedRatio(0.01)).toBe(RUN_RATE_MIN); // clamp lo
    expect(runSpeedRatio(0)).toBe(1.0); // unknown speed → authored rate
    expect(runSpeedRatio(-1)).toBe(1.0);
  });
});

describe("ClipAnimator playback", () => {
  const build = (): { groups: FakeGroup[]; animator: ClipAnimator } => {
    const groups = [
      new FakeGroup("Idle"),
      new FakeGroup("Running_A"),
      new FakeGroup("Spellcast_Shoot"),
      new FakeGroup("Death_A"),
    ];
    const animator = new ClipAnimator(asGroups(groups), {
      idle: "Idle",
      run: "Running_A",
      attack: "Spellcast_Shoot",
      death: "Death_A",
    });
    return { groups, animator };
  };

  it("enables blending on every targeted animation", () => {
    const { groups } = build();
    for (const g of groups) {
      expect(g.targetedAnimations[0]!.animation.enableBlending).toBe(true);
      expect(g.targetedAnimations[0]!.animation.blendingSpeed).toBeCloseTo(0.1);
    }
  });

  it("loops locomotion, one-shots attack, sticks death, restarts pulses", () => {
    const { groups, animator } = build();
    const [idle, run, attack, death] = groups as [FakeGroup, FakeGroup, FakeGroup, FakeGroup];

    animator.play("idle");
    expect(idle.startCalls).toEqual([{ loop: true, speed: 1.0 }]);
    animator.play("idle"); // idempotent per frame
    expect(idle.startCalls).toHaveLength(1);

    animator.play("run");
    expect(run.startCalls[0]!.loop).toBe(true);

    animator.play("attack");
    expect(attack.startCalls[0]!.loop).toBe(false);
    expect(attack.startCalls[0]!.speed).toBeGreaterThan(1); // 0.5s clip in 350ms

    animator.restart("attack"); // attack spam re-fires the swing
    expect(attack.startCalls).toHaveLength(2);

    animator.play("death");
    expect(death.startCalls[0]!.loop).toBe(false);
    expect(death.startCalls[0]!.speed).toBe(1.0);
    animator.play("death"); // sticks — no restart
    expect(death.startCalls).toHaveLength(1);
  });

  it("pulse windows from events stretch/squeeze the one-shot", () => {
    cover("client-anim-clip-playback");
    const { groups, animator } = build();
    const attack = groups[2]!; // 0.5s clip
    animator.setPulseWindow("attack", 1.0); // 1s wind-up span
    animator.play("attack");
    expect(attack.startCalls[0]!.speed).toBeCloseTo(PULSE_RATE_MIN); // 0.5/1.0 clamped lo
    animator.setPulseWindow("attack", undefined); // back to the default window
    animator.restart("attack");
    expect(attack.startCalls[1]!.speed).toBeCloseTo(0.5 / (PULSE_MS.attack / 1000));
  });

  it("locomotion speed applies to a playing run loop and future starts", () => {
    cover("client-anim-clip-playback");
    const { groups, animator } = build();
    const run = groups[1]!;
    animator.play("run");
    expect(run.startCalls[0]!.speed).toBe(1.0);
    animator.setLocomotionSpeed(REFERENCE_RUN_SPEED * 2); // live change
    expect(run.speedRatio).toBe(RUN_RATE_MAX);
    animator.play("idle");
    animator.play("run"); // restart uses the synced rate
    expect(run.startCalls[1]!.speed).toBe(RUN_RATE_MAX);
  });
});

describe("ClipAnimator.dispose", () => {
  it("disposes EVERY handed group, including clips no state resolved to", () => {
    // instantiateModelsToScene clones the container's whole animation list, so
    // "Cheer" is a live scene object even though no AnimState maps to it. A
    // dispose that only walked the resolved byState map would strand it.
    const groups = [
      new FakeGroup("Idle"),
      new FakeGroup("Running_A"),
      new FakeGroup("Cheer"), // unmapped — leaks unless the full list is kept
    ];
    const animator = new ClipAnimator(asGroups(groups), { idle: "Idle", run: "Running_A" });
    animator.play("run");

    animator.dispose();
    for (const g of groups) expect(g.disposes).toBe(1);
    expect(animator.hasClips).toBe(false);

    animator.dispose(); // idempotent — despawn paths may double-dispose
    for (const g of groups) expect(g.disposes).toBe(1);
  });
});
