/**
 * DecorFade — auto-fade for the few TALL landmark props the occluder audit
 * (#29) deliberately keeps at full height (team-colored towers on arena.dota):
 * whenever any active camera's line of sight to any alive hero passes through
 * a registered prop's world AABB, the prop's materials ease down to a ghost
 * alpha; they ease back the moment every sightline clears. Everything else in
 * the play space is height-capped instead (see ArenaScene sightline math) —
 * register ONLY props the audit marks "fade".
 *
 * Per-frame work is allocation-free: pure scalar segment-vs-AABB slab tests
 * over bounds measured once at placement, fed by pooled position arrays.
 */
import { Material } from "@babylonjs/core/Materials/material";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** ghost alpha while a registered prop blocks a camera→hero sightline */
export const DECOR_FADE_ALPHA = 0.25;
/** ease half-life (ms) — short enough to read as immediate, without a pop */
export const DECOR_FADE_HALFLIFE_MS = 80;
/** sightline focus height on the hero (chest — heroes stand ~1.7–2.2u) */
export const DECOR_FADE_FOCUS_Y = 1.1;

/** One dt-robust exponential-ease step of `current` toward `target` (snaps
 *  onto the target when close so a settled fader costs zero material writes). */
export function easeFadeStep(current: number, target: number, dtMs: number): number {
  const next = current + (target - current) * (1 - Math.pow(0.5, dtMs / DECOR_FADE_HALFLIFE_MS));
  return Math.abs(next - target) < 0.005 ? target : next;
}

/**
 * Does the segment p0→p1 pass through the AABB? Classic slab test unrolled
 * per axis — scalars only, allocation-free (runs cams × heroes × props per
 * frame).
 */
export function segmentIntersectsAabb(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  let tMin = 0;
  let tMax = 1;

  const dx = x1 - x0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x0) * inv;
    let t2 = (maxX - x0) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }

  const dy = y1 - y0;
  if (Math.abs(dy) < 1e-9) {
    if (y0 < minY || y0 > maxY) return false;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - y0) * inv;
    let t2 = (maxY - y0) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }

  const dz = z1 - z0;
  if (Math.abs(dz) < 1e-9) {
    if (z0 < minZ || z0 > maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - z0) * inv;
    let t2 = (maxZ - z0) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }

  return true;
}

export interface FadeVec3 {
  x: number;
  y: number;
  z: number;
}

export interface FadeVec2 {
  x: number;
  z: number;
}

interface FadeEntry {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** per-instance materials (placeInstance clones them for fade props) */
  materials: Material[];
  /** authored alpha / transparencyMode to restore when the sightline clears */
  baseAlpha: number[];
  baseMode: (number | null)[];
  /** current eased fade factor: 1 = fully opaque, DECOR_FADE_ALPHA = ghost */
  fade: number;
}

export class DecorFader {
  private readonly entries: FadeEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  /**
   * Register a placed prop: its (pre-measured, static) world AABB plus every
   * unique material under `root`. The prop must have per-instance materials —
   * fading shared/instanced materials would ghost every copy of the model.
   */
  register(root: TransformNode, min: FadeVec3, max: FadeVec3): void {
    const materials: Material[] = [];
    const baseAlpha: number[] = [];
    const baseMode: (number | null)[] = [];
    for (const mesh of root.getChildMeshes(false)) {
      const mat = mesh.material;
      if (!mat || materials.includes(mat)) continue;
      materials.push(mat);
      baseAlpha.push(mat.alpha);
      baseMode.push(mat.transparencyMode);
    }
    this.entries.push({
      minX: min.x,
      minY: min.y,
      minZ: min.z,
      maxX: max.x,
      maxY: max.y,
      maxZ: max.z,
      materials,
      baseAlpha,
      baseMode,
      fade: 1,
    });
  }

  /** Drop every entry (arena teardown — the meshes dispose their materials). */
  clear(): void {
    this.entries.length = 0;
  }

  /**
   * Per-frame sweep: a prop fades while ANY camera→hero segment crosses its
   * AABB (couch play: every viewport camera counts — mesh alpha is global).
   * `cams`/`heroes` are pooled arrays with explicit live counts, so callers
   * can reuse the same objects every frame (zero allocation).
   */
  update(
    dtMs: number,
    cams: readonly FadeVec3[],
    camCount: number,
    heroes: readonly FadeVec2[],
    heroCount: number,
  ): void {
    for (const e of this.entries) {
      let blocked = false;
      for (let c = 0; c < camCount && !blocked; c++) {
        const cam = cams[c]!;
        for (let h = 0; h < heroCount; h++) {
          const hero = heroes[h]!;
          if (
            segmentIntersectsAabb(
              cam.x,
              cam.y,
              cam.z,
              hero.x,
              DECOR_FADE_FOCUS_Y,
              hero.z,
              e.minX,
              e.minY,
              e.minZ,
              e.maxX,
              e.maxY,
              e.maxZ,
            )
          ) {
            blocked = true;
            break;
          }
        }
      }
      const target = blocked ? DECOR_FADE_ALPHA : 1;
      const next = easeFadeStep(e.fade, target, dtMs);
      if (next === e.fade) continue; // settled — no material writes
      e.fade = next;
      this.apply(e);
    }
  }

  /** Flush the eased factor to the materials. Alpha-blend only WHILE ghosted;
   *  at rest the authored transparencyMode comes back, so fog/glow/depth
   *  interactions of the untouched prop are exactly as before. */
  private apply(e: FadeEntry): void {
    const ghosted = e.fade < 1;
    for (let i = 0; i < e.materials.length; i++) {
      const mat = e.materials[i]!;
      if (ghosted) {
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        mat.alpha = e.baseAlpha[i]! * e.fade;
      } else {
        mat.alpha = e.baseAlpha[i]!;
        mat.transparencyMode = e.baseMode[i]!;
      }
    }
  }
}
