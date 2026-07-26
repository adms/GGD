/**
 * EffectDef — the serializable effect union. Abilities, item actives/passives,
 * augment hooks, and status DoTs all execute the SAME ordered EffectDef[] via
 * one interpreter (effectRunner). Data, not code → JSON-authorable.
 */
import type { EntityId, ProjectileId, StatusId } from "../../ids";
import type { Stat } from "../stats/statTypes";
import type { StatModifier } from "../stats/modifiers";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import type { Rng } from "../math/rng";
import type { CastableSlot } from "../intents";

export type DamageType = "physical" | "magic" | "true";

/** Rank-aware scaling: flat + per-rank + stat ratios of the caster. */
export interface Scaling {
  flat?: number;
  perRank?: number[];
  ratios?: { stat: Stat; coeff: number }[];
}

export type EffectDef =
  | { kind: "damage"; damageType: DamageType; amount: Scaling; canCrit?: boolean }
  | { kind: "heal"; amount: Scaling }
  | { kind: "shield"; amount: Scaling; duration: number }
  | {
      kind: "applyStatus";
      statusId: StatusId;
      duration: number;
      moveSpeedMult?: number;
      root?: boolean;
      stun?: boolean;
    }
  /**
   * `perRank` (index rank-1, clamped to the last entry) is the rank-indexed
   * variant: WC3 authors every buff column per ability LEVEL (`Oae1/Oae2`
   * 增加移動速度/攻擊速度, `adur` 持續 …), and a single `modifiers`+`duration`
   * pair can only carry one of them. When present it REPLACES the flat pair for
   * that rank; the flat pair stays as the rank-1 fallback so existing docs and
   * hook-fired buffs (rank 1) are untouched.
   */
  | {
      kind: "applyBuff";
      modifiers: StatModifier[];
      duration: number;
      perRank?: { modifiers: StatModifier[]; duration: number }[];
      /**
       * STACKING (task #244). Without it every application attaches a NEW
       * ModifierSource keyed `buff:<origin>#<tick>` — which has two defects for
       * a "permanent, once per kill" buff: 180 kills leave 180 live sources for
       * `recomputeStats` and `fireHooks` to rescan, and two kills on the SAME
       * TICK (one AoE, two mobs) collide on that id so only ONE lands.
       *
       * With `stackKey` the buff instead lands on ONE source with the fixed id
       * `buff:stack:<stackKey>` and bumps its `stacks` counter. `statPipeline`
       * already multiplies every flat/percent-add modifier by `stacks`, so the
       * arithmetic is identical while the source count stays O(1).
       */
      stackKey?: string;
      /** hard ceiling on `stacks` (absent = unbounded) */
      maxStacks?: number;
      /**
       * This stack is meant to be SEEN: the snapshot sums `stacks` over sources
       * flagged this way and sets the growth-tier ENTITY_FLAG bits, so a
       * champion-agnostic "visible growth" read costs zero new wire fields.
       */
      stackVisual?: boolean;
    }
  /**
   * restore — WC3's `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ` idiom: set a
   * FRACTION of the target's own maximum, not a flat amount. `heal` cannot
   * express it because `Scaling.ratios` reads the CASTER's stats, so a "restore
   * this ally to full" ultimate (初音's `MikuEX`) had nowhere to go and shipped
   * as a damage nuke. 0..1 of the TARGET's max; absent = untouched.
   */
  | { kind: "restore"; healthPct?: number; manaPct?: number }
  | { kind: "dash"; mode: "forward" | "toPoint"; speed: number; maxDistance: number }
  /**
   * leap (task #247) — the map's own parabolic jump, ported from the nine
   * `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` sites in war3map.j. A SEPARATE kind
   * from `dash` because it needs a different integrator: no per-tick collision
   * (terrain crossing IS the point), an absolute parametric position so the arc
   * cannot drift, a height channel, an integer tick budget and a deferred
   * effect payload. See sim/movement/leap.ts for the arc math and the
   * blocked-landing rule.
   */
  | {
      kind: "leap";
      /** who flies: the caster (default), or each resolved target (thrown arcs) */
      applyTo?: "self" | "target";
      /** "toPoint" = the snapshotted cast point; "inPlace" = vertical, distance 0 */
      mode: "toPoint" | "inPlace";
      /** apex height in GGD units (JASS peak × 11/600) */
      apexHeight: number;
      /** flight time; converted to an INTEGER tick count exactly once, at takeoff */
      durationSec: number;
      /**
       * How far a THROWN body travels when there is no cast point to aim at —
       * i.e. `applyTo: "target"` on a unit-targeted ability (52-02 蹂躪編年史
       * hurls its victim 400 wc3 units along the caster's facing, j:51767).
       * GGD units; ignored for `applyTo: "self"` and for `mode: "inPlace"`.
       */
      throwDistance?: number;
      /** landing burst radius, GGD units (0/absent = the flyer alone) */
      landRadius?: number;
      /** effects run on the LANDING tick, centred on the landing point */
      onLand?: EffectDef[];
    }
  | { kind: "spawnProjectile"; projectileId: ProjectileId; onHit: EffectDef[] }
  /**
   * spawnVfx — the WC3 "dummy effect unit" idiom (化繁為簡): a Locust/invuln
   * unit that only carries a MODEL and expires is NOT gameplay, it's a one-shot
   * visual at a position. Emits a `vfxSpawn` sim event carrying a vfx@1 doc id
   * and a world point; the client's VfxSystem plays the doc there. Purely
   * cosmetic — mutates no world state, keeps the sim deterministic.
   */
  | { kind: "spawnVfx"; vfxId: string; at?: "self" | "target" | "point"; durationSec?: number };

export interface EffectContext {
  world: SimWorld;
  caster: EntityId;
  /** rank of the source ability (1 for items/augments/hooks) */
  rank: number;
  targets: EntityId[];
  point?: Vec2;
  direction?: Vec2;
  /** provenance, e.g. "ability:sela.q", "item:serrated-edge" */
  origin: string;
  /** slot of the casting ability (threads through projectiles into hooks) */
  abilitySlot?: CastableSlot;
  rng: Rng;
}

/** Resolve a Scaling against the caster's current final stats. */
export function resolveScaling(
  finalStats: Record<Stat, number>,
  sc: Scaling,
  rank: number,
): number {
  let v = (sc.flat ?? 0) + (sc.perRank?.[Math.max(0, rank - 1)] ?? 0);
  for (const r of sc.ratios ?? []) v += (finalStats[r.stat] ?? 0) * r.coeff;
  return v;
}
