/**
 * 飛行 (無視碰撞) — 莉娜因巴斯 04-00 翔封界, redesigned by the owner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE SOURCE SAID, AND WHAT THE OWNER REPLACED IT WITH
 *
 * The shipped tooltip promised 「可抵擋負性魔法一次」 — a one-shot spell block on a
 * 50 s cooldown. owner, 2026-07-30:
 *
 *     「改成可以無視碰撞的飛行狀態就好，記得改說明。」
 *
 * So this is not a port, it is a REPLACEMENT, and the descriptions of both
 * copies of the doc (godie-h020 / godie-hjai) are rewritten to promise what the
 * data actually does. Leaving the old sentence in place would be the 「舊文案就是
 * 謊話」 failure CLAUDE.md names explicitly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE COLLISION ACTUALLY LIVES — measured, not assumed
 *
 * `MovementSystem` is the only owner of planar contact, and there are exactly
 * THREE places a body is pushed:
 *
 *   1. `moveWithCollision(body, delta, zone)` in the steering step — stops the
 *      body at a WALL/pillar (`zone.obstacles`).
 *   2. the unit-vs-unit soft separation pass (`separatePair`, and the
 *      `pushOutOfObstacle` branch for STATIC props: flowers + guardians).
 *   3. the post-separation sweep — `pushOutOfObstacle` per obstacle, then
 *      `clampToBoundary`.
 *
 * `world.grid` (the broad phase) is NOT one of them: it is a query index used
 * by targeting and by AoE, and dropping out of it would make the flyer
 * un-attackable, which nobody asked for. That is the trap this file exists to
 * avoid — 「無視碰撞」 must not become 「無敵」.
 *
 * The precedent for all three exemptions already exists and is quoted in
 * MovementSystem: a body mid-LEAP (#247) skips exactly the same three places.
 * 翔封界 is that state made PERMANENT and made CONTENT, rather than a fourth
 * bespoke branch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE BOUNDARY IS THE ONE THING THAT IS *NOT* IGNORED BY DEFAULT
 *
 * The immediate question 「這會不會讓她走出場外／穿過火圈？」 has a specific answer:
 *
 *   · ARENA BOUNDARY — `stayInsideBoundary` ships TRUE, so `clampToBoundary`
 *     still runs on a flyer. Without it she walks off the disc and every
 *     zone-scoped mechanic (duel resolution, `teamAliveInZone`, the minimap)
 *     starts reasoning about a champion who is nowhere.
 *   · THE FIRE RING (#195/#270) is NOT collision at all — `FireRingSystem`
 *     burns whoever is OUTSIDE a shrinking radius. Flight touches none of it,
 *     so a flyer still burns exactly like everybody else. Stated here because
 *     「穿過火圈」 sounds like a collision question and is not one.
 *
 * Both `ignoreUnits` and `ignoreObstacles` are separate fields rather than one
 * boolean because they are separate decisions with different blast radii:
 * walking through BODIES is a duel-positioning change, walking through PILLARS
 * is a map-geometry change, and the owner may well want the first without the
 * second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② THE PLAYER HAS TO SEE IT
 *
 * `hoverHeight` rides the EXISTING `EntityState.h` channel (the one #247's leap
 * writes) — see `apps/game-server/src/net/snapshot.ts`. Deliberately WITHOUT
 * `ENTITY_FLAG.AIRBORNE`: that bit tells the renderer 「suppress locomotion, the
 * body is on a ballistic arc」, and a flyer who WALKS must keep her run cycle.
 * No new schema field, no `defineTypes` append (which is irreversible), and no
 * spend from the single remaining ENTITY_FLAG bit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Reconciled from state every tick out of a SORTED id list, exactly like
 * `stealthSystem`: a grant can arrive from an innate, an item, an augment, an
 * aura or a 變身, and there is no single "a source attached" event to subscribe
 * to. No rng, no clock, no trig, no `**`. A world where nobody carries a grant
 * leaves `world.flight` empty and every one of the MovementSystem predicates
 * returns false on its first line, so every existing recording is unchanged.
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/**
 * 飛行狀態 as a passive payload. A FOURTH payload kind next to `modifiers` /
 * `auras` / `vision`, and for the same reason `vision` needed to be one:
 * 「碰不碰得到」 is not a number on a stat table and it is not projected onto
 * anybody else.
 */
export interface FlightGrant {
  /**
   * 離地高度, GGD 單位. Purely presentational — nothing in the sim reads it.
   * 0 is legal and means 「無視碰撞但貼著地面走」.
   */
  hoverHeight?: number;
  /** 穿過其他單位 (soft separation + static props). ABSENT = true. */
  ignoreUnits?: boolean;
  /** 穿過牆與柱子 (`zone.obstacles`). ABSENT = true. */
  ignoreObstacles?: boolean;
  /**
   * 仍然被場地邊界夾住. ABSENT = **true**, and that default is the answer to
   * 「會不會飛出場外」. Setting it false is a deliberate 「讓她離開競技場」 choice,
   * which breaks zone-scoped resolution — see the header.
   */
  stayInsideBoundary?: boolean;
}

/** Bounds for the one number a grant carries. */
export const FLIGHT_MAX_HOVER_HEIGHT = 6;

/**
 * Is `id` flying right now? The ONE predicate every consumer asks, so the three
 * MovementSystem exemptions can never disagree about who is airborne.
 */
export function isFlying(world: SimWorld, id: EntityId): boolean {
  return world.flight.has(id);
}

/** 這個人可以穿過別的身體嗎 (ABSENT on the grant = yes). */
export function flightIgnoresUnits(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f !== undefined && f.ignoreUnits !== false;
}

/** 這個人可以穿過牆與柱子嗎 (ABSENT on the grant = yes). */
export function flightIgnoresObstacles(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f !== undefined && f.ignoreObstacles !== false;
}

/**
 * 這個人還要不要被場地邊界夾住 (ABSENT = **yes**).
 *
 * The polarity is deliberately the opposite of the two above: ignoring things
 * is the point of flight, but leaving the arena is a bug wearing a feature's
 * clothes, so the permissive default is "still clamped".
 */
export function flightStaysInBoundary(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f === undefined || f.stayInsideBoundary !== false;
}

/** Presentation height for the snapshot, 0 when not flying. */
export function flightHoverHeight(world: SimWorld, id: EntityId): number {
  const h = world.flight.get(id)?.hoverHeight ?? 0;
  if (!(h > 0)) return 0;
  return h > FLIGHT_MAX_HOVER_HEIGHT ? FLIGHT_MAX_HOVER_HEIGHT : h;
}

/**
 * Reconcile `world.flight` against the grants attached to `id`.
 *
 * MAX-NOT-SUM on the height, and OR on each permission: two grants make you
 * fly higher and pass through more, never less. `stayInsideBoundary` is the
 * exception and folds with AND-of-defaults — a single grant that opts out is
 * enough, because opting out is an explicit authoring act and the other grant
 * simply did not say anything about it.
 */
function syncFlightGrants(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  let found = false;
  let hover = 0;
  let ignoreUnits = false;
  let ignoreObstacles = false;
  let stayInside = true;
  if (sc) {
    for (const src of sc.sources) {
      if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
      const f = src.flight;
      if (!f) continue;
      found = true;
      const h = f.hoverHeight ?? 0;
      if (h > hover) hover = h;
      if (f.ignoreUnits !== false) ignoreUnits = true;
      if (f.ignoreObstacles !== false) ignoreObstacles = true;
      if (f.stayInsideBoundary === false) stayInside = false;
    }
  }
  if (!found) {
    world.flight.delete(id);
    return;
  }
  world.flight.set(id, {
    hoverHeight: hover,
    ignoreUnits,
    ignoreObstacles,
    stayInsideBoundary: stayInside,
  });
}

/**
 * Slot 1d in `SimWorld.step` — immediately after `stealthSystem`, i.e. after
 * the stat recompute that could have attached a grant and BEFORE
 * `movementSystem` (5), which is the only consumer. Any later and a flyer would
 * be collided-with for one tick after gaining flight; any earlier and a grant
 * attached this tick would not be seen until the next one.
 *
 * Iterates a SORTED id list, never Map insertion order (sim purity).
 */
export function flightSystem(world: SimWorld): void {
  const ids: EntityId[] = [];
  for (const id of world.stats.keys()) ids.push(id);
  ids.sort((a, b) => a - b);
  for (const id of ids) syncFlightGrants(world, id);
}
