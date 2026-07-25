/**
 * deathDissolve — the PURE timing/geometry behind 「倒在地上三秒後 半透明飛上天消失」
 * (playtest directive #220): a champion that dies plays its death clip, LIES on
 * the ground for exactly {@link DISSOLVE_LIE_MS}, then rises while fading out
 * and vanishes.
 *
 * WHY A BABYLON-FREE MODULE. Everything that can be wrong here is TIMING and
 * GATING, not shader: a body that vanishes while its revive circle is still
 * claimable deletes the anchor a teammate is channelling on, and a body that
 * never vanishes leaves the arena littered with corpses. Both failure modes are
 * pure state, so they are asserted in deathDissolve.test.ts without a GPU (the
 * headless view tests run on the PROCEDURAL figure only — see ChampionView).
 *
 * THIS IS A CLIENT VISUAL AND NOTHING ELSE. The sim never destroys a dead
 * champion entity (DeathSystem only flips `hp.alive`), the corpse stays in the
 * snapshot until the round tears down, and ReviveSystem alone decides whether a
 * revive is possible. Nothing here may gate any of that — the dissolve only
 * decides what the local renderer draws.
 *
 * THE REVIVE EXCEPTION, and why "circle present" == "still claimable".
 * A revive circle can only ever spawn on the tick of the death itself
 * (`spawnCirclesForDeaths`), and #196 removed its lifetime entirely — it
 * despawns only for a REASON (owner revived / owner gone / team wiped / combat
 * over / completed). So a circle that is absent from this frame's entity set
 * can never come back for that corpse, and its presence means the rescue is
 * still live. The join key is the SEAT (`EntityState.seatId` of a kind-3 entity
 * is the dead owner's seat); there is no ownerId on the wire.
 *
 * #85 COMPATIBILITY. The death-spectator wash is driven purely by snapshot
 * facts (phase / outcome / entity present / alive), none of which this touches,
 * and `buildFocusSources` deliberately never uses the corpse as a colour
 * source. The dissolve is therefore pure alpha + rise: NO emissive "ascension"
 * glow, which would punch a bright hole through 「敵人去飽和」.
 */

/** How long the body lies on the ground before it starts to rise (owner: 3 秒). */
export const DISSOLVE_LIE_MS = 3000;

/** Duration of the rise + fade. Long enough to read as 升天, short enough that
 *  a busy teamfight is not full of half-transparent bodies. */
export const DISSOLVE_RISE_MS = 1400;

/** How far the body climbs over the rise window (world units; a champion is
 *  TARGET_HEIGHT = 1.8 tall, so ~1.8 body-heights of travel). */
export const DISSOLVE_RISE_UNITS = 3.2;

/** Stage of the post-death visual. */
export type DissolvePhase = "lying" | "rising" | "vanished";

export interface DissolveFrame {
  phase: DissolvePhase;
  /** 0..1 progress across the rise/fade window (0 while lying, 1 once vanished). */
  t: number;
  /** vertical offset to add to the champion's ROOT node (world units). */
  riseY: number;
  /**
   * Per-mesh `visibility` multiplier, 1 = fully opaque, 0 = gone. Babylon turns
   * alpha blending on for a mesh whose visibility is < 1, so this fades the body
   * WITHOUT writing `material.alpha` — champion .glb meshes are instantiated
   * with `cloneMaterials: false` and SHARE one material object per model, so a
   * material write would fade every champion on that model at once (and fight
   * the #49 tint clones). It composes with the #49 material tint and the #3
   * `renderOverlay` hit flash, which live on different channels.
   */
  visibility: number;
}

/** Reusable "nothing happened yet" frame (the common case: a living champion). */
const LYING: Readonly<DissolveFrame> = { phase: "lying", t: 0, riseY: 0, visibility: 1 };

/**
 * The dissolve frame for a body that died `elapsedMs` ago.
 *
 * Total wall time from death to vanish is `DISSOLVE_LIE_MS + DISSOLVE_RISE_MS`.
 * `elapsedMs` must be an ABSOLUTE difference (`nowMs - deathAtMs`), never a
 * dt accumulation: the draw-distance cull skips `ChampionView.update` entirely
 * for far-away champions, so an accumulated clock would stall while culled and
 * the body would still be lying there when the player walked back.
 */
export function dissolveFrame(elapsedMs: number): DissolveFrame {
  if (!(elapsedMs > DISSOLVE_LIE_MS)) return { ...LYING };
  const t = Math.min(1, (elapsedMs - DISSOLVE_LIE_MS) / DISSOLVE_RISE_MS);
  if (t >= 1) return { phase: "vanished", t: 1, riseY: DISSOLVE_RISE_UNITS, visibility: 0 };
  return {
    phase: "rising",
    t,
    // ease-in on the climb: the body is DRAWN upward (slow release, then away)
    riseY: DISSOLVE_RISE_UNITS * t * t,
    // linear fade so it reaches EXACTLY 0 at t = 1 — an exponential ease never
    // does, and "nearly invisible" is a corpse that never leaves the screen.
    visibility: 1 - t,
  };
}

/** True once the body is fully gone (nothing left to draw or animate). */
export function isVanished(elapsedMs: number): boolean {
  return elapsedMs >= DISSOLVE_LIE_MS + DISSOLVE_RISE_MS;
}
