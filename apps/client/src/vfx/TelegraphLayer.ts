/**
 * TelegraphLayer — the UNIVERSAL cast telegraph (task #228).
 *
 * THE BUG IT REPLACES. The telegraph used to be a side effect of one castType:
 * `VfxSystem` spawned a ring only when an `abilityCast` happened to carry a
 * `point`, and `Telegraph` could only draw a circle. The sim sets `point` for
 * `ground` (a real AoE) AND for `targeted` (the victim's feet — not an area),
 * so on the 48-champion open roster 93 single-target cells drew a fabricated
 * `1.2 × 0.6 = 0.72 u` ring that LIED about the hit while all 118 `self` /
 * `skillshot` / `dash` cells drew nothing at all. Honest floor coverage was
 * 43 of 255 castable cells. 「不好閃」 was a correct read of the game.
 *
 * WHAT THIS LAYER GUARANTEES.
 *   1. UNIVERSAL — every cast goes through `deriveTelegraphGeometry`, which is
 *      driven by the ability doc alone (`castType`, `radius`, projectile,
 *      dash distance). Nothing is per-champion. An ability whose shape cannot
 *      be derived returns null and `telegraphCoverage.test.ts` goes RED.
 *   2. HONEST SIZE — every extent comes back post-#136 `abilityRange`, exactly
 *      as `resolveAbilityRadius`/`resolveAbilityRange` compute it in the sim.
 *   3. HONEST TIMING — the fill fraction is READ from the cast bar's own source
 *      (`CastTracker.progressFor`, injected as `castProgress`) every frame, not
 *      integrated locally. So a wind-up paused by hitstop pauses the ring, and
 *      `castInterrupt` CANCELS it with no "it lands HERE" pop. The old ring did
 *      neither: it ran a wall clock and no code path ever cancelled it.
 *   4. CHANNELS — enemy / ally / self differ in hue, fill, edge AND urgency
 *      ramp (see telegraphChannel.ts), so an incoming AoE can never again be
 *      confused with the player's own #152 hold-preview.
 *
 * BUDGET. Spawn tier comes from `telegraphTier(liveCount, relation)`: past
 * `FULL_TIER_CAP` a telegraph degrades to outline-only (no magic-circle fill,
 * no resolve kick), and past `TOTAL_TIER_CAP` only warnings a player must react
 * to survive at all. At the #161 camera pitch a median 3.6 u AoE already covers
 * ~300 px of a 390 px-tall phone, so the cap is a legibility requirement, not
 * an optimisation.
 *
 * OWNERSHIP. One telegraph per CASTER: a champion has exactly one wind-up at a
 * time in the sim (`ab.cast` is a single slot), so re-casting replaces.
 *
 * KNOWN LIMIT (stated rather than papered over). A `lock` telegraph is anchored
 * to the victim's position AT CAST TIME, because `abilityCast` carries the
 * victim's `point` but not their entity id — so if the victim walks during the
 * wind-up, the arc stays where they were. That is still honest about WHO is
 * targeted (the tether points at them from the caster) and about the fact that
 * walking does not save you from a single-target spell; it is only imprecise
 * about WHERE. Fixing it properly needs a `target` field on `abilityCast`,
 * which is a sim/protocol change and therefore out of this task's scope.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createGroundQuad, placeGroundQuad } from "../render/groundShapes";
import { Telegraph } from "./Telegraph";
import {
  paletteFor,
  telegraphAlpha,
  telegraphPulse,
  telegraphTier,
  type TelegraphPalette,
  type TelegraphRelation,
  type TelegraphTier,
} from "./telegraphChannel";
import type { TelegraphShape } from "./telegraphShape";

/** Corridor sits just under the ring (0.06) and over the cast scorch (0.035). */
const CORRIDOR_Y = 0.052;
/** The lock tether rides above both so it stays readable across a busy floor. */
const TETHER_Y = 0.068;
/** Width of the `lock` tether — thin: it is a pointer, not a hit area. */
const TETHER_WIDTH = 0.16;
/** Fade of the corridor / tether after the cast resolves (ms). */
const CORRIDOR_FADE_MS = 160;
/**
 * Fill window for an INSTANT cast's landing flash. There is no wind-up to
 * portray, so the mark appears at full size and fades — it teaches WHERE the
 * ability lands for next time without claiming a dodge window that never
 * existed. (Same rule the cast pillar already follows: no castBegin, no fill.)
 */
export const FLASH_HOLD_MS = 240;
/** Fade tail of a resolved telegraph circle (ms) — Telegraph's own default. */
const RESOLVE_HOLD_MS = 150;

export interface TelegraphLayerCtx {
  /** Rendered position of an entity, or null when unknown. */
  entityPos(id: number): { x: number; z: number } | null;
  /**
   * The CAST BAR's own 0→1 wind-up fraction for an entity, or null when it is
   * not casting. Injected (rather than owned) so the ring and the bar can never
   * disagree — see the header. GameApp passes `CastTracker.progressFor`.
   */
  castProgress?(id: number, nowMs: number): number | null;
}

interface Live {
  shape: TelegraphShape;
  relation: TelegraphRelation;
  palette: TelegraphPalette;
  tier: Exclude<TelegraphTier, "drop">;
  /** the circle/arc half (every shape except `line` has one) */
  circle: Telegraph | null;
  /** corridor quad for `line`, tether quad for `lock` */
  quad: Mesh | null;
  /** caster whose live position re-anchors a caster-anchored shape */
  caster: number;
  /** instant casts are born resolved: flash + fade, never a filling ring */
  instant: boolean;
  /** last wind-up fraction fed to the meshes */
  t: number;
  /** wall-clock ms at which the cast resolved (−1 while winding up) */
  resolvedAtMs: number;
  done: boolean;
}

export class TelegraphLayer {
  private readonly live = new Map<number, Live>();
  /** free-list of corridor/tether quads — zero allocation per cast after warm-up */
  private readonly quadPool: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly ctx: TelegraphLayerCtx,
  ) {}

  /** Number of telegraphs currently on the floor (test/observability seam). */
  get activeCount(): number {
    return this.live.size;
  }

  /** Tier a given telegraph was spawned at, or null when none is live. */
  tierOf(caster: number): TelegraphTier | null {
    return this.live.get(caster)?.tier ?? null;
  }

  /** Relation channel a live telegraph is drawn in (test seam). */
  relationOf(caster: number): TelegraphRelation | null {
    return this.live.get(caster)?.relation ?? null;
  }

  /** Shape a live telegraph is drawing (test seam — asserts honest geometry). */
  shapeOf(caster: number): TelegraphShape | null {
    return this.live.get(caster)?.shape ?? null;
  }

  /**
   * Start (or replace) the telegraph for one caster.
   *
   * `windupMs <= 0` means an INSTANT cast: no `castBegin`, no dodge window, so
   * the shape is drawn as a one-shot landing flash instead of a filling ring.
   */
  begin(
    caster: number,
    shape: TelegraphShape,
    relation: TelegraphRelation,
    windupMs: number,
    nowMs: number,
  ): void {
    const existing = this.live.get(caster);
    if (existing) this.destroy(existing);
    // Tier is decided ONCE, at spawn, from how many are already on the floor —
    // never re-decided per frame, because a telegraph that changes its look
    // mid-wind-up is itself a state change the player has to interpret.
    const tier = telegraphTier(this.live.size, relation);
    if (tier === "drop") {
      this.live.delete(caster);
      return;
    }
    const palette = paletteFor(relation);
    const instant = !(windupMs > 0);
    const rec: Live = {
      shape,
      relation,
      palette,
      tier,
      circle: null,
      quad: null,
      caster,
      instant,
      t: instant ? 1 : 0,
      // an instant cast is born RESOLVED: it lands on this very frame, so its
      // only remaining life is the fade that teaches where it landed
      resolvedAtMs: instant ? nowMs : -1,
      done: false,
    };

    const outlineOnly = tier === "outline";
    if (shape.kind !== "line") {
      // circle / self marker / lock arc all render through the SAME pooled
      // ground-ring machinery the AoE telegraph has always used.
      rec.circle = new Telegraph(
        this.scene,
        shape.x,
        shape.z,
        shape.radius,
        nowMs,
        Math.max(1, windupMs),
        instant ? FLASH_HOLD_MS : RESOLVE_HOLD_MS,
        { palette, outlineOnly, quiet: instant },
      );
      rec.circle.setProgress(rec.t);
    }
    if (shape.kind === "line" || shape.kind === "lock") {
      rec.quad = this.acquireQuad(palette);
    }
    this.live.set(caster, rec);
    this.applyMeshes(rec, nowMs);
  }

  /**
   * The cast RESOLVED (`castEnd` — the frame the sim's effects run). Drives the
   * fill to exactly 1 so the pop lands with the damage, never before it.
   */
  resolve(caster: number, nowMs: number): void {
    const rec = this.live.get(caster);
    if (!rec || rec.resolvedAtMs >= 0) return;
    rec.t = 1;
    rec.resolvedAtMs = nowMs;
    rec.circle?.setProgress(1);
    rec.circle?.update(nowMs);
  }

  /**
   * The cast was INTERRUPTED (stun / knockdown / death mid-cast). Everything
   * goes away with no resolve pop: nothing landed, so nothing may claim to.
   */
  interrupt(caster: number): void {
    const rec = this.live.get(caster);
    if (!rec) return;
    rec.circle?.cancel();
    this.destroy(rec);
    this.live.delete(caster);
  }

  update(nowMs: number): void {
    for (const [caster, rec] of this.live) {
      if (!rec.instant && rec.resolvedAtMs < 0) {
        // THE HONEST FILL: re-read the cast bar's fraction every frame instead
        // of integrating a local timer, so hitstop/hitstun pauses carry over.
        const p = this.ctx.castProgress?.(caster, nowMs) ?? null;
        if (p !== null) {
          rec.t = p;
          rec.circle?.setProgress(p);
        } else if (rec.t > 0) {
          // The tracker dropped the cast without a castEnd/castInterrupt event
          // reaching us (a dropped packet). Treat it as resolved rather than
          // leaving a ring burning on the floor forever.
          rec.t = 1;
          rec.resolvedAtMs = nowMs;
          rec.circle?.setProgress(1);
        }
      }
      rec.circle?.update(nowMs);
      this.applyMeshes(rec, nowMs);
      if (this.isFinished(rec, nowMs)) {
        this.destroy(rec);
        this.live.delete(caster);
      }
    }
  }

  /** Drop everything (round end / disposal). */
  clear(): void {
    for (const rec of this.live.values()) {
      rec.circle?.cancel();
      this.destroy(rec);
    }
    this.live.clear();
  }

  dispose(): void {
    this.clear();
    for (const q of this.quadPool) q.dispose(false, true);
    this.quadPool.length = 0;
  }

  // -------------------------------------------------------------------------

  private isFinished(rec: Live, nowMs: number): boolean {
    if (rec.resolvedAtMs < 0) return false;
    const tail = rec.instant ? FLASH_HOLD_MS : Math.max(RESOLVE_HOLD_MS, CORRIDOR_FADE_MS);
    if (nowMs - rec.resolvedAtMs < tail) return false;
    // the circle may still be paying off its shockwave — let it finish
    return rec.circle === null || rec.circle.done;
  }

  /** Re-place + re-tint the per-shape meshes for this frame. */
  private applyMeshes(rec: Live, nowMs: number): void {
    const shape = rec.shape;
    // caster-anchored shapes follow the LIVE caster position: `self` markers
    // and `dash`/`skillshot` corridors originate at the champion, and a cast
    // with `rootWhileCasting: false` really can move mid-wind-up.
    const from =
      shape.kind === "line" || shape.kind === "self"
        ? (this.ctx.entityPos(rec.caster) ?? null)
        : null;
    const fade =
      rec.resolvedAtMs < 0
        ? 1
        : Math.max(0, 1 - (nowMs - rec.resolvedAtMs) / CORRIDOR_FADE_MS);
    const alpha =
      telegraphAlpha(rec.palette, rec.t) * telegraphPulse(rec.palette, rec.t, nowMs) * fade;

    if (shape.kind === "self" && rec.circle && from) {
      rec.circle.moveTo(from.x, from.z);
    }
    if (!rec.quad) return;
    const mat = rec.quad.material as StandardMaterial;
    mat.alpha = alpha;
    if (shape.kind === "line") {
      const fx = from?.x ?? shape.fromX;
      const fz = from?.z ?? shape.fromZ;
      // The corridor SWEEPS: it grows from the caster to its full reach over
      // the real wind-up, so "how long until it covers me" is readable from the
      // shape itself, not only from the bar over the caster's head.
      const len = shape.length * Math.max(0.02, rec.t);
      placeGroundQuad(rec.quad, fx, fz, shape.dirX, shape.dirZ, len, shape.width, CORRIDOR_Y);
    } else if (shape.kind === "lock") {
      const dx = shape.x - shape.fromX;
      const dz = shape.z - shape.fromZ;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) {
        rec.quad.setEnabled(false);
        return;
      }
      rec.quad.setEnabled(true);
      // TETHER, not a corridor: nobody standing between caster and victim is
      // hit. It says "this one is aimed at YOU" — the shape-language answer to
      // a single-target spell, which has no area to step out of.
      placeGroundQuad(
        rec.quad,
        shape.fromX,
        shape.fromZ,
        dx / len,
        dz / len,
        len,
        TETHER_WIDTH,
        TETHER_Y,
      );
    }
  }

  private acquireQuad(palette: TelegraphPalette): Mesh {
    const mesh = this.quadPool.pop() ?? this.makeQuad();
    const mat = mesh.material as StandardMaterial;
    mat.emissiveColor.set(palette.ring[0], palette.ring[1], palette.ring[2]);
    mat.alpha = telegraphAlpha(palette, 0);
    mesh.setEnabled(true);
    return mesh;
  }

  private makeQuad(): Mesh {
    const mesh = createGroundQuad(this.scene, "telegraph-corridor");
    const mat = new StandardMaterial("telegraph-corridor-mat", this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 0.22, 0.14);
    mesh.material = mat;
    return mesh;
  }

  private destroy(rec: Live): void {
    if (rec.done) return;
    rec.done = true;
    rec.circle?.dispose();
    rec.circle = null;
    if (rec.quad) {
      rec.quad.setEnabled(false);
      this.quadPool.push(rec.quad);
      rec.quad = null;
    }
  }
}
