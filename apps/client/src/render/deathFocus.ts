/**
 * deathFocus — the PURE state machine + math behind the death-spectator focus
 * desaturation (task #85): while you are dead IN COMBAT the whole scene drains
 * to a cool grey EXCEPT soft, world-anchored colour pools centred on your own
 * living teammates (and on your revive circle while one is live).
 *
 * Everything that can be wrong here is STATE, not shader: a greyscale that
 * never lifts is the failure mode that ruins a match, so all of the arming /
 * disarming / ramp logic lives in this Babylon-free module and is covered by
 * deathFocus.test.ts. `vfx/DeathFocusFx.ts` is the imperative shell that
 * projects these sources and drives the one full-screen pass.
 *
 * WHY POOLS AND NOT A SILHOUETTE MASK. A render-list mask needs its own depth
 * buffer, so it either draws teammates THROUGH walls or costs a second
 * near-full scene pass per dead viewport (up to 4 in couch play) on an engine
 * whose one existing full-screen pass is already tier-gated off on mobile. A
 * world-anchored radial pool approximates the silhouette for one texture fetch
 * and no extra geometry pass.
 *
 * THE POOLS HUG THE BODY, NOT THE FIGHT. The requirement is "只有自己的隊友保持
 * 有顏色" — teammates keep colour, ENEMIES DESATURATE. So each pool is sized to
 * the champion's own silhouette (ALLY_RADIUS_FULL covers a TARGET_HEIGHT=1.8
 * body of radius 0.6 anchored at the chest, with margin for the deliberately
 * oversized champions of #150) and fades out just past it. An earlier tuning
 * used 4u/11u to keep "the teammate AND their immediate fight" in colour, but
 * in a zone of boundaryRadius 24 that fully exempted every enemy within 4u and
 * left an enemy at 6u still ~80% coloured — the scene barely read as drained.
 *
 * RESIDUAL LIMIT, ON PURPOSE. A circle cannot separate two bodies in melee
 * CONTACT (centres ~1.2u apart at body radius 0.6), so an enemy actually
 * touching your teammate keeps some colour. Everything beyond arm's reach —
 * ranged attackers, the rest of the duel, the other duel — goes grey. Removing
 * that last case needs a real silhouette mask sampled by the shader, which
 * lives in vfx/DeathFocusFx.ts.
 *
 * WHAT "DEAD IN COMBAT" MEANS. `alive === false` alone is four different
 * situations: champ-select (no entity), the whole 60 s intermission (nothing
 * revives at intermission entry, so last round's losers stay dead through the
 * shop), a bye team (MatchController.enterCombat parks EVERY seat dead and
 * revives only the fighters), and the resolution / settlement phases. Only one
 * of them is "you died". So the gate is armed by the sim's `death` EVENT —
 * which DeathSystem emits solely on the hp<=0 crossing and therefore never for
 * a parked or bye seat — and is held open only while the phase is still
 * `combat`, the outcome is undecided, and that same entity is still present
 * and still dead. Any of those going false disarms; a missed event fails SAFE
 * (no desaturation) rather than sticking.
 */
import { KIND_CHAMPION, KIND_REVIVE_CIRCLE } from "./overheadAnchors";

/** The only phase in which a death desaturates the view (MatchState.phase). */
export const COMBAT_PHASE = "combat";

/** Ramp durations (ms) for the greyscale strength. Linear, so it reaches
 *  EXACTLY 0 — an exponential ease never does, and "nearly zero" is a pass
 *  that never detaches. The shader smoothsteps the value for the eased feel. */
export const FOCUS_FADE_IN_MS = 450;
export const FOCUS_FADE_OUT_MS = 220;

/**
 * How long the gate may sit armed-but-unconfirmed. The `death` event and the
 * schema patch that flips `alive` are different messages and can land in
 * either order, so seeing the event while the snapshot still says alive is
 * normal for a frame or two — but it must not wait forever.
 */
export const FOCUS_PENDING_TIMEOUT_MS = 3000;

/** Strength at/below which the effect is off and the pass must detach. */
export const FOCUS_IDLE_EPS = 1e-4;

/** Colour pools per viewport (self/revive + up to 3 teammates). */
export const FOCUS_MAX_SOURCES = 4;

// --- pool geometry (world units; a duel zone is boundaryRadius 24, 48u across) ---

/**
 * Fully-coloured radius around a living teammate. Sized to the champion
 * SILHOUETTE, not to their fight: anchored at the chest (ALLY_ANCHOR_Y) a
 * TARGET_HEIGHT=1.8 body of radius 0.6 reaches 1.1 down to the feet and ~1.25
 * to a foot corner, so 1.5 contains the whole body plus margin for the
 * deliberately oversized champions of task #150.
 */
export const ALLY_RADIUS_FULL = 1.5;
/**
 * Radius at which that pool has faded fully to grey — one body-width of soft
 * halo past the silhouette, so the teammate reads as lit rather than cut out,
 * while an enemy at 3u or beyond is fully desaturated.
 */
export const ALLY_RADIUS_FADE = 3;
/** Chest height: the pool is centred on the body, not on the shadow. */
export const ALLY_ANCHOR_Y = 1.1;
export const ALLY_WEIGHT = 1;

/**
 * Revive circle: tight, and only as long as the circle is actually there. The
 * fade margin stays close to the ring so the pool reads as the OBJECTIVE (a lit
 * ring on the ground) rather than as a bubble that re-colours whoever is
 * standing near your corpse.
 *
 * These margins are on the SAME silhouette scale as the ally pools above, and
 * for the same reason. On the schema's default ring radius 2 the old 0.75/2.75
 * pair produced rFull 2.75 / rFade 4.75 — a fully-coloured core almost twice a
 * whole teammate's, and an enemy standing 3u from your corpse left 81% coloured
 * where the same enemy 3u from a living teammate is 0. The revive circle is
 * exactly where enemies camp, so that was the largest remaining hole in
 * 「敵人去飽和」. At 0.25/1.25 the same enemy is 13% coloured.
 */
export const REVIVE_ANCHOR_Y = 0.35;
export const REVIVE_FULL_MARGIN = 0.25;
export const REVIVE_FADE_MARGIN = 1.25;
/**
 * A teammate channelling your revive widens the pool — the moment reads. Kept
 * proportional to the retuned base margin (1.8x, as 4.5 was to 2.75) so the
 * channel still visibly opens up without re-becoming a bubble.
 */
export const REVIVE_FADE_MARGIN_CHANNEL = 2.25;
/** Dimmer than a living teammate: it is an objective, not a fighter. */
export const REVIVE_WEIGHT = 0.85;
/** Ring radius used when the authoritative one is missing (schema default 2). */
export const REVIVE_FALLBACK_RADIUS = 2;

// ---------------------------------------------------------------------------
// arming state machine
// ---------------------------------------------------------------------------

/**
 * idle    — nothing to show.
 * pending — a `death` event named this entity during combat; waiting for the
 *           authoritative `alive === false` to confirm it.
 * dead    — confirmed; the viewport desaturates.
 */
export type FocusArmState = "idle" | "pending" | "dead";

export interface FocusGateInput {
  /** MatchState.phase for this frame. */
  phase: string;
  /** MatchState.outcomeDecided — the settlement freeze owns the camera. */
  outcomeDecided: boolean;
  /** This viewport's champion entity id; -1 when it has none. */
  entityId: number;
  /** That entity is present in this frame's authoritative snapshot. */
  present: boolean;
  /** That entity's authoritative alive bit. */
  alive: boolean;
  /**
   * This viewport's OWN duel is already decided (task #208). While you are dead
   * but your teammates are still fighting in YOUR zone (own duel LIVE), the #85
   * desaturation stays on exactly as before — that is its whole point. But the
   * moment your duel concludes (your team wiped, or won without you) the
   * spectator camera jumps to a still-fighting zone (spectateFocus), and a scene
   * greyed to nothing-but-your-teammates would drain the very fight you are now
   * watching — none of whose fighters are your team. So a decided own-duel lifts
   * the wash and the watched zone reads in full colour. Defaults false, so every
   * existing caller and the original #85 behaviour are unchanged.
   */
  ownDuelDecided?: boolean;
  dtMs: number;
}

/**
 * Linear ramp toward `target`, reaching it EXACTLY in `durationMs`. Used for
 * the greyscale strength so "off" is a hard 0 the shell can test against.
 */
export function rampToward(
  current: number,
  target: number,
  dtMs: number,
  durationMs: number,
): number {
  if (!(dtMs > 0)) return current;
  if (!(durationMs > 0)) return target;
  const step = dtMs / durationMs;
  return target > current
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
}

/**
 * One viewport's desaturation gate. Fed the sim's death events and the
 * per-frame authoritative snapshot; emits a 0..1 strength.
 */
export class DeathFocusGate {
  private arm: FocusArmState = "idle";
  private armedEntity = -1;
  private pendingMs = 0;
  private value = 0;

  /** 0..1 greyscale strength (0 = fully off; the pass may detach). */
  get strength(): number {
    return this.value;
  }

  /** Current arming state (introspection / tests). */
  get state(): FocusArmState {
    return this.arm;
  }

  /**
   * A sim `death` event named `entityId`. Only combat deaths arm: an
   * intermission/bye/parked seat never produces one (DeathSystem emits solely
   * on the hp<=0 crossing), and the phase check rejects any that slipped
   * through some other path.
   */
  noteDeath(entityId: number, phase: string): void {
    if (phase !== COMBAT_PHASE || entityId < 0) return;
    if (this.arm === "dead" && this.armedEntity === entityId) return; // already showing
    this.armedEntity = entityId;
    this.arm = "pending";
    this.pendingMs = 0;
  }

  /** Advance one frame; returns the new strength. */
  update(input: FocusGateInput): number {
    const dtMs = Math.max(0, input.dtMs);
    if (this.arm !== "idle" && !this.holds(input)) this.disarm();

    if (this.arm === "pending") {
      if (!input.alive) {
        this.arm = "dead";
        this.pendingMs = 0;
      } else {
        this.pendingMs += dtMs;
        if (this.pendingMs >= FOCUS_PENDING_TIMEOUT_MS) this.disarm();
      }
    } else if (this.arm === "dead" && input.alive) {
      this.disarm(); // revived (task #84) or a new round spawned us in
    }

    const target = this.arm === "dead" ? 1 : 0;
    this.value = rampToward(
      this.value,
      target,
      dtMs,
      target > 0 ? FOCUS_FADE_IN_MS : FOCUS_FADE_OUT_MS,
    );
    if (this.value <= FOCUS_IDLE_EPS) this.value = 0;
    return this.value;
  }

  /** Full reset INCLUDING the strength — teardown only (no fade-out). */
  reset(): void {
    this.disarm();
    this.value = 0;
  }

  /**
   * Every condition that must stay true for an armed gate to survive. Failing
   * any of them drops back to idle and the greyscale ramps out. Deliberately
   * exhaustive rather than clever: this is the anti-stuck contract.
   */
  private holds(input: FocusGateInput): boolean {
    return (
      input.phase === COMBAT_PHASE && // round over / shop / champ-select
      !input.outcomeDecided && // settlement hero shot owns the camera
      !input.ownDuelDecided && // own duel over → spectating a live zone (#208)
      input.entityId >= 0 && // seat lost its champion
      input.entityId === this.armedEntity && // re-seated onto a different body
      input.present // entity gone from the snapshot
    );
  }

  private disarm(): void {
    this.arm = "idle";
    this.armedEntity = -1;
    this.pendingMs = 0;
  }
}

// ---------------------------------------------------------------------------
// colour sources
// ---------------------------------------------------------------------------

/** The entity fields the focus layer reads (a subset of EntityViewState). */
export interface FocusEntity {
  id: number;
  kind: number;
  seatId: number;
  teamId: number;
  alive: boolean;
  x: number;
  z: number;
  revive?: { radius: number; channelling: boolean } | undefined;
}

/** One world-anchored colour pool. */
export interface FocusSource {
  /** entity the pool follows (dedupe key while selecting the nearest allies) */
  id: number;
  x: number;
  y: number;
  z: number;
  /** fully-coloured radius (world units) */
  rFull: number;
  /** radius at which the pool has faded fully to grey */
  rFade: number;
  /** 0..1 pool strength; 0 = unused slot */
  weight: number;
}

/** Pre-allocated source pool — the hot path never allocates. */
export function makeFocusSourcePool(): FocusSource[] {
  return Array.from({ length: FOCUS_MAX_SOURCES }, () => ({
    id: -1,
    x: 0,
    y: 0,
    z: 0,
    rFull: 1,
    rFade: 2,
    weight: 0,
  }));
}

function chosen(out: FocusSource[], count: number, id: number): boolean {
  for (let i = 0; i < count; i++) if (out[i]!.id === id) return true;
  return false;
}

/**
 * Fill `out` with the world points that stay in COLOUR for a dead player and
 * return how many slots were used:
 *   slot 0 — this player's own revive circle, IF one is live (task #84). The
 *            corpse itself is not a source: colour means "still actionable",
 *            and once the revive window lapses the body is just scenery.
 *   rest   — the nearest LIVING teammates (same team, champions, not self).
 * Enemies, neutral flowers, dead allies and the other duel are never sources.
 *
 * `posOf` supplies the RENDERED (interpolated) position of an entity; it falls
 * back to the authoritative one, so a champion whose view has not spawned yet
 * still anchors a pool.
 */
export function buildFocusSources(
  selfEntityId: number,
  selfSeatId: number,
  selfTeamId: number,
  entities: readonly FocusEntity[],
  posOf: (id: number) => { x: number; z: number } | null,
  out: FocusSource[],
): number {
  let count = 0;
  const cap = out.length;

  // --- slot 0: the player's own revive circle, while it exists ---
  for (const e of entities) {
    if (count >= cap) break;
    if (e.kind !== KIND_REVIVE_CIRCLE || e.seatId !== selfSeatId) continue;
    const p = posOf(e.id) ?? e;
    const radius = Math.max(0.5, e.revive?.radius ?? REVIVE_FALLBACK_RADIUS);
    const s = out[count]!;
    s.id = e.id;
    s.x = p.x;
    s.y = REVIVE_ANCHOR_Y;
    s.z = p.z;
    s.rFull = radius + REVIVE_FULL_MARGIN;
    s.rFade =
      radius + (e.revive?.channelling ? REVIVE_FADE_MARGIN_CHANNEL : REVIVE_FADE_MARGIN);
    s.weight = REVIVE_WEIGHT;
    count++;
    break;
  }

  // --- origin for "nearest": the corpse, else the revive circle, else none ---
  let originX = 0;
  let originZ = 0;
  let haveOrigin = false;
  for (const e of entities) {
    if (e.id !== selfEntityId) continue;
    const p = posOf(e.id) ?? e;
    originX = p.x;
    originZ = p.z;
    haveOrigin = true;
    break;
  }
  if (!haveOrigin && count > 0) {
    originX = out[0]!.x;
    originZ = out[0]!.z;
    haveOrigin = true;
  }

  // --- remaining slots: nearest living teammates (selection, no allocation) ---
  // Ranking uses the AUTHORITATIVE positions so `posOf` (which allocates) is
  // called only for the handful of entities actually picked, not O(n*slots).
  // A teammate's interpolation offset is far below the pool radius, so it can
  // never change who the nearest two are in a 3v3.
  while (count < cap) {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (e.kind !== KIND_CHAMPION || !e.alive) continue;
      if (e.teamId !== selfTeamId || e.id === selfEntityId) continue;
      if (chosen(out, count, e.id)) continue;
      const dx = e.x - originX;
      const dz = e.z - originZ;
      // no origin (corpse already despawned): fall back to snapshot order
      const d = haveOrigin ? dx * dx + dz * dz : i;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const e = entities[bestIdx]!;
    const p = posOf(e.id) ?? e;
    const s = out[count]!;
    s.id = e.id;
    s.x = p.x;
    s.y = ALLY_ANCHOR_Y;
    s.z = p.z;
    s.rFull = ALLY_RADIUS_FULL;
    s.rFade = ALLY_RADIUS_FADE;
    s.weight = ALLY_WEIGHT;
    count++;
  }

  for (let i = count; i < cap; i++) out[i]!.weight = 0;
  return count;
}

// ---------------------------------------------------------------------------
// pool falloff (a TS mirror of the shader, so the LOOK is testable headlessly)
// ---------------------------------------------------------------------------

/** GLSL `smoothstep`. Undefined for edge0 >= edge1, exactly like the real one. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How much ORIGINAL COLOUR a pool retains at distance `dist` from its centre —
 * the `m` term of the fragment shader, where 1 = untouched and 0 = fully
 * desaturated. A deliberate mirror of `pool()` in vfx/DeathFocusFx.ts:
 *
 *     return w * (1.0 - smoothstep(s.z, s.w, length(d)));
 *
 * The two must stay in sync; this exists because it is the ONLY way to assert
 * the requirement "enemies desaturate" without a GPU. It is valid in WORLD
 * units even though the shader works in UV: `projectFocusSource` scales the
 * centre distance and both radii by the same factor `k`, so the ratio the
 * smoothstep depends on is unchanged by the projection (and therefore by task
 * #43's live resolution rescaling).
 */
export function poolColourAt(
  dist: number,
  rFull: number,
  rFade: number,
  weight = 1,
): number {
  if (weight <= 0) return 0;
  return weight * (1 - smoothstep(rFull, rFade, dist));
}

// ---------------------------------------------------------------------------
// projection (world → viewport-normalized UV)
// ---------------------------------------------------------------------------

/**
 * Project one source into the post-process's UV space.
 *
 * `m` is a Babylon view*projection matrix's raw elements (row-major, row-vector
 * convention — `Matrix.m`); `fy` is the projection matrix's vertical scale term
 * (`projection.m[5]`, i.e. 1/tan(fov/2) for the default vertical-fixed FOV).
 *
 * Everything here is NORMALIZED — UV in 0..1 across the camera's own viewport,
 * radii in "half-height" units — so it is independent of both the canvas size
 * and the engine hardware-scaling level. Task #43's adaptive resolution can
 * rescale the render target mid-match and the pools stay welded to the world.
 *
 * The radius is analytic rather than a second projection: a world radius R at
 * view depth w subtends R·fy/(2w) of the viewport height. The perspective
 * divide's w IS the view-space depth for a standard LH perspective matrix, so
 * one transform yields the centre and the scale together.
 *
 * Writes (u, v, rFull, rFade) into `out[base .. base+3]` and returns the pool
 * weight — 0 when the point is at or behind the eye plane and unprojectable.
 */
export function projectFocusSource(
  s: FocusSource,
  m: ArrayLike<number>,
  fy: number,
  out: Float32Array,
  base: number,
): number {
  const w = s.x * m[3]! + s.y * m[7]! + s.z * m[11]! + m[15]!;
  if (!(w > 1e-4)) {
    out[base] = 0;
    out[base + 1] = 0;
    out[base + 2] = 0;
    out[base + 3] = 1;
    return 0;
  }
  const inv = 1 / w;
  const ndcX = (s.x * m[0]! + s.y * m[4]! + s.z * m[8]! + m[12]!) * inv;
  const ndcY = (s.x * m[1]! + s.y * m[5]! + s.z * m[9]! + m[13]!) * inv;
  // post-process vUV = ndc * 0.5 + 0.5 (y UP, matching the fullscreen quad)
  out[base] = ndcX * 0.5 + 0.5;
  out[base + 1] = ndcY * 0.5 + 0.5;
  const k = fy * 0.5 * inv;
  const rFull = Math.max(0, s.rFull * k);
  out[base + 2] = rFull;
  // smoothstep(edge0, edge1, x) is undefined for edge0 >= edge1
  out[base + 3] = Math.max(s.rFade * k, rFull + 1e-5);
  return s.weight;
}
