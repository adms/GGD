/**
 * statusPresets — PURE status-effect body visuals (task #39, item 3).
 *
 * A stunned, rooted or slowed champion looked EXACTLY like a healthy one: the
 * authoritative `flags` bitmask has been on the wire since the protocol was
 * written (`schema.ts`: 1 dashing, 2 rooted, 4 stunned, 8 slowed) and nothing
 * on the client has ever read it — `AnimationStateMachine` only consumes
 * `alive` + `moving`. So a CC chain, the single most important thing to read
 * in a teamfight, was invisible.
 *
 * These are PULSED auras, not persistent emitters: a status re-fires a small
 * pooled burst every `repeatMs` for as long as it holds. That reuses the same
 * BurstPool discipline as every other layer (no per-entity ParticleSystem
 * lifecycle, no start/stop bookkeeping, no leak when an entity despawns
 * mid-stun) and costs a handful of particles per pulse.
 *
 * The four states map onto the classic reads:
 *   stunned — golden stars orbiting ABOVE the head (the universal 昏迷 cue)
 *   rooted  — dark grit clawing UP out of the ground at the feet
 *   slowed  — pale-blue frost motes drifting DOWN the body
 *   dashing — thin white speed lines trailing at hip height
 */
import { hotToCoolStops, popShrinkStops, softBodyColorStops, type BurstSpec, type Rgb } from "./vfxPresets";

/** The authoritative bitmask from protocol/schema.ts EntitySchema.flags. */
export const STATUS_FLAGS = {
  dashing: 1,
  rooted: 2,
  stunned: 4,
  slowed: 8,
} as const;

export type StatusKind = keyof typeof STATUS_FLAGS;

/** Every status, in the order they are drawn (later = drawn on top). */
export const STATUS_KINDS: readonly StatusKind[] = ["dashing", "slowed", "rooted", "stunned"];

/** Decode a flags bitmask into the statuses it carries. PURE. */
export function statusesFrom(flags: number): StatusKind[] {
  if (!Number.isFinite(flags) || flags <= 0) return [];
  return STATUS_KINDS.filter((k) => (flags & STATUS_FLAGS[k]) !== 0);
}

export interface StatusAura {
  /** ms between pulses while the status holds (never every frame) */
  repeatMs: number;
  /** height above the entity's feet the pulse is emitted at */
  y: number;
  spec: BurstSpec;
}

const STUN_TINT: Rgb = [1, 0.85, 0.3];
const ROOT_TINT: Rgb = [0.42, 0.3, 0.2];
const FROST_TINT: Rgb = [0.66, 0.85, 1];
const DASH_TINT: Rgb = [0.9, 0.95, 1];

/**
 * Aura for a status. Every pulse is tiny (3–7 particles) and short-lived, so
 * even four simultaneously-CC'd champions stay well inside the impact budget.
 */
export function statusAura(kind: StatusKind): StatusAura {
  switch (kind) {
    case "stunned":
      return {
        repeatMs: 220,
        y: 2.15, // above the head — never hidden by the body
        spec: {
          count: 4,
          lifetimeSec: { min: 0.24, max: 0.34 },
          speed: { min: 0.9, max: 1.6 },
          sizeStops: popShrinkStops(0.19, { popT: 0.18, endFrac: 0.25 }),
          colorStops: hotToCoolStops(STUN_TINT, { hotT: 0.22 }),
          blend: "additive",
          gravityY: 0.4, // hangs; stars do not fall off a stunned head
          drag: 0.55,
          emitterRadius: 0.34, // a ring orbiting the head
          texture: "assets/textures/particles/star_09.png",
        },
      };
    case "rooted":
      return {
        repeatMs: 260,
        y: 0.12, // at the feet
        spec: {
          count: 5,
          lifetimeSec: { min: 0.2, max: 0.38 },
          speed: { min: 1.4, max: 2.8 },
          sizeStops: popShrinkStops(0.13, { endFrac: 0.2 }),
          colorStops: softBodyColorStops(ROOT_TINT, 0.85),
          blend: "alpha",
          gravityY: -6, // clods lift then fall back — the ground holds you
          drag: 0.4,
          flatRing: { radius: 0.34, height: 0.06 },
          texture: "assets/textures/particles/dirt_01.png",
        },
      };
    case "slowed":
      return {
        repeatMs: 300,
        y: 1.35, // mid-body
        spec: {
          count: 4,
          lifetimeSec: { min: 0.3, max: 0.5 },
          speed: { min: 0.2, max: 0.7 },
          sizeStops: popShrinkStops(0.16, { popT: 0.25 }),
          colorStops: hotToCoolStops(FROST_TINT, { hotT: 0.3, peakAlpha: 0.8 }),
          blend: "additive",
          gravityY: -1.1, // motes sink slowly: everything about you is slower
          drag: 0.7,
          emitterRadius: 0.42,
          texture: "assets/textures/particles/magic_05.png",
        },
      };
    case "dashing":
      return {
        repeatMs: 60, // a dash is brief — it needs a dense trail, fast
        y: 0.95,
        spec: {
          count: 3,
          lifetimeSec: { min: 0.08, max: 0.16 },
          speed: { min: 0.4, max: 1.4 },
          sizeStops: popShrinkStops(0.13),
          colorStops: hotToCoolStops(DASH_TINT, { peakAlpha: 0.7 }),
          blend: "additive",
          drag: 0.9,
          stretched: true,
          tailLength: 3.2,
          emitterRadius: 0.3,
          texture: "assets/textures/particles/spark_05_rotated.png",
        },
      };
  }
}
