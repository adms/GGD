/**
 * clips — the seven baked animations, as keyframe tables.
 *
 * NAMES. `idle`, `run`, `attack`, `cast`, `hurt`, `death` (+ `cheer`) exactly.
 * That satisfies BOTH halves of `ClipAnimator.resolveClips`: the model doc's
 * `clipMap` matches them literally, and the fuzzy `DEFAULT_CLIP_NAMES`
 * substring fallback matches them too — belt and braces, so a doc that loses
 * its clipMap still animates. `cheer` is the seventh clip and exists ONLY for
 * the shop: `intermission/reactionClip.pickReactionClip` deliberately ignores
 * `clipMap` and regex-matches raw AnimationGroup names (`victor|cheer|…` first),
 * so without it a purchase reaction silently downgrades from a celebration to
 * the attack swing — a quiet regression of #111/#121/#146.
 *
 * THE AUTHORING RULE THAT MAKES THE WHOLE DESIGN WORK
 * ---------------------------------------------------
 * Every channel targets joint ROTATION, plus hips TRANSLATION. NOTHING targets
 * SCALE, ever. That is the contract `voxelSkin.applyVoxelLook` relies on: the
 * runtime writes per-champion joint scales once at spawn and no clip can
 * overwrite them on the next frame. `gen.test.ts` asserts it on the emitted
 * bytes rather than trusting this comment.
 *
 * EVERY CLIP DRIVES THE SAME CHANNEL SET (hips translation + hips/chest/head/
 * both hands/both feet rotation). That is deliberate and is the #168
 * "model floats while idle" defence: a Babylon AnimationGroup leaves whatever
 * it last wrote in place when it stops, so a clip that does NOT animate a joint
 * inherits the previous clip's residue. Driving all eight channels in all seven
 * clips means every transition re-establishes the full pose.
 *
 * POSE CURVES are lifted from the procedural branch that already ships in
 * `ChampionView.update` (the `state === "run" | "attack" | "cast" | …` ladder),
 * so the baked figure and the procedural fallback are the same character in
 * motion, not two drifting interpretations.
 */
import { PX } from "./boxman";

/** Joints every clip drives, in a fixed order (determinism + no pose residue). */
export const DRIVEN_ROTATION_JOINTS = [
  "hips",
  "chest",
  "head",
  "handLeft",
  "handRight",
  "footLeft",
  "footRight",
] as const;

export type DrivenJoint = (typeof DRIVEN_ROTATION_JOINTS)[number];

/** Euler XYZ radians for one joint at one keyframe. */
export type Euler = readonly [number, number, number];

export interface Keyframe {
  t: number;
  /** joint → euler rotation; omitted joints hold the identity */
  rot: Partial<Record<DrivenJoint, Euler>>;
  /** hips local translation OFFSET from bind, in world units */
  hips: readonly [number, number, number];
}

export interface ClipDef {
  name: string;
  /** seconds */
  duration: number;
  loop: boolean;
  /**
   * Fraction of the clip that has played at the RELEASE frame, for the one-shot
   * clips whose timing the sim aligns to. `attack` is 0.5 =
   * `EntityViewRegistry.ATTACK_STRIKE_FRACTION`; `cast` is 0.6 =
   * `anim/castStrike.DEFAULT_CAST_STRIKE_FRACTION` (whose per-model override
   * table is empty), so `alignPulseClip` needs no compensation at the owner's
   * 0.6 s startup default: windowSec = 0.6/0.6 = 1.0 → rate 1.0 → no clamp,
   * delaySec = skipSec = 0, residual strike error 0.
   */
  strikeFraction?: number;
  keys: readonly Keyframe[];
}

const E0: Euler = [0, 0, 0];
const T0: readonly [number, number, number] = [0, 0, 0];

/** One voxel pixel in world units — the unit the bob/lean offsets are written in. */
const P = PX;

const TAU = Math.PI * 2;

/** Sample a periodic pose at `n` even steps across `dur` (last key repeats the first). */
function loopKeys(
  dur: number,
  n: number,
  at: (phase: number, t: number) => { rot: Partial<Record<DrivenJoint, Euler>>; hips: readonly [number, number, number] },
): Keyframe[] {
  const keys: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (dur * i) / n;
    const phase = (TAU * i) / n;
    const { rot, hips } = at(phase, t);
    keys.push({ t, rot, hips });
  }
  return keys;
}

/**
 * IDLE — 2.0 s loop, and DELIBERATELY GROUNDED. `ChampionView.update`'s idle
 * branch is `idleSway = sin(nowMs/600) * 0.06; armL = idleSway; armR =
 * -idleSway` — arms only, no vertical motion — and this clip matches it. A
 * breathing bob was authored first and cut: measured through the loader, its
 * low phase put the feet 0.023 u under the floor, and #168 is exactly the
 * family of defect where a standing champion does not sit on the ground.
 */
const IDLE: ClipDef = {
  name: "idle",
  duration: 2.0,
  loop: true,
  keys: loopKeys(2.0, 8, (p) => ({
    rot: {
      handLeft: [0.06 * Math.sin(p), 0, 0],
      handRight: [-0.06 * Math.sin(p), 0, 0],
      chest: [0.02 * Math.sin(p), 0, 0],
      head: [0.015 * Math.sin(p + Math.PI / 3), 0, 0],
    },
    // NO hips bob. ChampionView's idle branch moves only the arms, and a
    // vertical breath here would push the feet BELOW the floor on its low
    // phase — the #168 family of defect, measured at -0.023 u before this was
    // removed. The channel still exists (constant at the bind value) so a
    // transition out of run/death cannot leave hips residue behind.
    hips: T0,
  })),
};

/**
 * RUN — 0.60 s = ONE FULL STRIDE, authored so rate 1.0 reads correctly at
 * `ClipAnimator.REFERENCE_RUN_SPEED = 5.8` u/s; `runSpeedRatio` then clamps
 * [0.6, 1.8] around it. Swing amplitudes are ChampionView's exact numbers
 * (arms ±0.8, legs ±0.75). The vertical bounce runs at TWICE the stride (one
 * per footfall) and is written as `(1 - cos)/2` so it is 0 at the contact pose
 * and never negative — a `|cos|` bob would start the clip mid-air.
 */
const RUN: ClipDef = {
  name: "run",
  duration: 0.6,
  loop: true,
  keys: loopKeys(0.6, 12, (p) => ({
    rot: {
      handLeft: [0.8 * Math.sin(p), 0, 0],
      handRight: [-0.8 * Math.sin(p), 0, 0],
      footLeft: [0.75 * Math.sin(p), 0, 0],
      footRight: [-0.75 * Math.sin(p), 0, 0],
      chest: [0.1, 0, 0.04 * Math.sin(p)],
      head: [-0.06, 0, 0],
    },
    hips: [0, 0.045 * (1 - Math.cos(2 * p)) * 0.5, 0],
  })),
};

/**
 * ATTACK — 0.50 s one-shot, RELEASE AT 50 % (t = 0.25 s), matching
 * `EntityViewRegistry`'s attack strike fraction. Anticipation (arm back, torso
 * coiled) → strike (`handRight = -2.0`, ChampionView's own raised-strike value)
 * → follow-through back to neutral.
 */
const ATTACK: ClipDef = {
  name: "attack",
  duration: 0.5,
  loop: false,
  strikeFraction: 0.5,
  keys: [
    { t: 0, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
    {
      t: 0.12,
      rot: {
        chest: [0, -0.22, 0],
        head: [0, -0.12, 0],
        handRight: [0.45, 0, 0],
        handLeft: [-0.15, 0, 0],
        footLeft: [-0.1, 0, 0],
        footRight: [0.08, 0, 0],
      },
      hips: [0, 0, -0.3 * P],
    },
    {
      // RELEASE FRAME — the sim's damage tick lands here.
      t: 0.25,
      rot: {
        chest: [0.12, 0.28, 0],
        head: [0.06, 0.14, 0],
        handRight: [-2.0, 0, 0],
        handLeft: [0.3, 0, 0],
        footLeft: [0.25, 0, 0],
        footRight: [-0.18, 0, 0],
      },
      hips: [0, 0, 0.5 * P],
    },
    {
      t: 0.35,
      rot: {
        chest: [0.06, 0.16, 0],
        head: [0.03, 0.08, 0],
        handRight: [-1.4, 0, 0],
        handLeft: [0.2, 0, 0],
        footLeft: [0.14, 0, 0],
        footRight: [-0.1, 0, 0],
      },
      hips: [0, 0, 0.25 * P],
    },
    { t: 0.5, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
  ],
};

/**
 * CAST — 1.00 s one-shot, RELEASE AT 60 % (t = 0.60 s). Both arms rise to
 * ChampionView's `-1.6` cast pose, HOLD ACROSS THE RELEASE FRAME (so a small
 * timing error still shows the intended pose), then settle.
 */
const CAST: ClipDef = {
  name: "cast",
  duration: 1.0,
  loop: false,
  strikeFraction: 0.6,
  keys: [
    { t: 0, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
    {
      t: 0.2,
      rot: { chest: [0.1, 0, 0], head: [0.08, 0, 0], handLeft: [-0.5, 0, 0.12], handRight: [-0.5, 0, -0.12], footLeft: E0, footRight: E0 },
      hips: [0, 0, 0],
    },
    {
      t: 0.45,
      rot: { chest: [-0.12, 0, 0], head: [-0.18, 0, 0], handLeft: [-1.6, 0, 0.22], handRight: [-1.6, 0, -0.22], footLeft: [0.06, 0, 0], footRight: [-0.06, 0, 0] },
      hips: [0, 0.35 * P, 0],
    },
    {
      // RELEASE FRAME — held from 0.45 so the pose reads across the tick.
      t: 0.6,
      rot: { chest: [-0.12, 0, 0], head: [-0.18, 0, 0], handLeft: [-1.62, 0, 0.22], handRight: [-1.62, 0, -0.22], footLeft: [0.06, 0, 0], footRight: [-0.06, 0, 0] },
      hips: [0, 0.35 * P, 0],
    },
    {
      t: 0.78,
      rot: { chest: [0.05, 0, 0], head: [0.04, 0, 0], handLeft: [-0.9, 0, 0.1], handRight: [-0.9, 0, -0.1], footLeft: E0, footRight: E0 },
      hips: [0, 0, 0],
    },
    { t: 1.0, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
  ],
};

/**
 * HURT — 0.35 s one-shot. ChampionView's flinch is `armL = armR = 0.5`; the
 * torso recoils backward and the hips shift back one voxel-px, then snap home.
 */
const HURT: ClipDef = {
  name: "hurt",
  duration: 0.35,
  loop: false,
  keys: [
    { t: 0, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
    {
      t: 0.08,
      rot: { chest: [-0.22, 0, 0], head: [-0.3, 0, 0.08], handLeft: [0.5, 0, -0.25], handRight: [0.5, 0, 0.25], footLeft: [0.12, 0, 0], footRight: [-0.12, 0, 0] },
      hips: [0, 0, -1.0 * P],
    },
    {
      t: 0.2,
      rot: { chest: [-0.1, 0, 0], head: [-0.14, 0, 0.04], handLeft: [0.3, 0, -0.12], handRight: [0.3, 0, 0.12], footLeft: [0.06, 0, 0], footRight: [-0.06, 0, 0] },
      hips: [0, 0, -0.45 * P],
    },
    { t: 0.35, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
  ],
};

/**
 * DEATH — 0.40 s one-shot, NON-LOOPING, and THE LAST FRAME IS THE RESTING POSE
 * because `ClipAnimator` sticks the corpse on its final frame. The ramp is
 * ChampionView's own `deathT` fall: `rotation.x → -π/2` (fall backward) plus a
 * sink. The sink is authored on the HIPS TRANSLATION so the body ends up lying
 * ON the floor rather than floating at hip height — rotating about the hips
 * alone would leave the whole figure 0.675 u up.
 */
const DEATH: ClipDef = {
  name: "death",
  duration: 0.4,
  loop: false,
  keys: [
    { t: 0, rot: { hips: E0, chest: E0, head: E0, handLeft: E0, handRight: E0, footLeft: E0, footRight: E0 }, hips: T0 },
    {
      t: 0.12,
      rot: { hips: [-0.45, 0, 0], chest: [0.1, 0, 0], head: [0.15, 0, 0], handLeft: [0.6, 0, -0.3], handRight: [0.55, 0, 0.3], footLeft: [0.2, 0, 0], footRight: [-0.15, 0, 0] },
      hips: [0, -0.035, 0],
    },
    {
      t: 0.28,
      rot: { hips: [-1.3, 0, 0], chest: [0.16, 0, 0.05], head: [0.24, 0, 0], handLeft: [0.9, 0, -0.5], handRight: [0.85, 0, 0.5], footLeft: [0.32, 0, 0], footRight: [-0.22, 0, 0] },
      hips: [0, -0.125, 0],
    },
    {
      // RESTING POSE — the corpse holds here.
      t: 0.4,
      rot: { hips: [-Math.PI / 2, 0, 0], chest: [0.18, 0, 0.06], head: [0.26, 0, 0], handLeft: [1.0, 0, -0.55], handRight: [0.95, 0, 0.55], footLeft: [0.35, 0, 0], footRight: [-0.24, 0, 0] },
      hips: [0, -0.16, 0],
    },
  ],
};

/**
 * CHEER — 1.2 s loop, the purchase-reaction clip (see the header). Both arms
 * punch overhead with a double pump and the hips hop; nothing in `EXCLUDE`
 * (idle/walk/death/hurt/…) appears in the name, so `pickReactionClip` takes it
 * on the first tier.
 */
const CHEER: ClipDef = {
  name: "cheer",
  duration: 1.2,
  loop: true,
  keys: loopKeys(1.2, 12, (p) => {
    const pump = (1 - Math.cos(2 * p)) * 0.5; // 0 → 1 → 0 → 1 → 0
    return {
      rot: {
        handLeft: [-2.0 - 0.7 * pump, 0, 0.25],
        handRight: [-2.0 - 0.7 * pump, 0, -0.25],
        chest: [-0.06 * pump, 0.08 * Math.sin(p), 0],
        head: [-0.12 * pump, 0.1 * Math.sin(p), 0],
        footLeft: [0.1 * pump, 0, 0],
        footRight: [-0.1 * pump, 0, 0],
      },
      hips: [0, 1.6 * P * pump, 0],
    };
  }),
};

export const CLIPS: readonly ClipDef[] = [IDLE, RUN, ATTACK, CAST, HURT, DEATH, CHEER];

/** The six logical states a `model@1` clipMap must name, in doc order. */
export const CLIP_MAP = {
  idle: "idle",
  run: "run",
  attack: "attack",
  cast: "cast",
  hurt: "hurt",
  death: "death",
} as const;
