/**
 * ArenaScene — arena visuals in two passes:
 *   1. buildArena(): synchronous, DIRECTLY from the shared ArenaDef so what
 *      you see is exactly what the server collides against — floor + boundary
 *      rim per zone (render/ArenaGround.ts), a LOW-PROFILE marker per obstacle
 *      (stump + floor ring for circles, a low kerb slab for segments), spawn
 *      markers.
 *   2. dressArena(): async, from the authored arena doc — every decor prop
 *      instantiated with rotQuarter/scale, a contact shadow under each of them,
 *      OPTIONAL flame particles on torch tips (see below), water shimmer on hex
 *      water tiles (decor is visual-only; sim collision unchanged).
 *      Every placed prop is checked against the fixed camera's sightline
 *      (occluder audit #29): props that could fully hide a hero are Y-squashed
 *      to SIGHTLINE_HEIGHT_CAP, except FADE_MODELS which keep full height and
 *      auto-fade via the DecorFader when they block a camera→hero sightline.
 *
 * Everything a build/dress pass creates is parented under one `arenaRoot`
 * TransformNode (+ tracked flame ParticleSystems) so `disposeArena()` can tear
 * the whole map down for a clean rebuild when the match's mapId changes.
 *
 * ── 場地環境火焰是一格開關，不是一段程式碼 (GH#251) ─────────────────────────
 * owner 2026-08-01：「場地天空火焰很礙眼 請全部場地都去掉」。
 * 在此之前這裡寫死 `d.model.includes("torch")` → 一定掛火：skeleton（**預設
 * 場地**）16 支、castle 16 支、colosseum 16 支、royale 4 支，dota / godie 0 支，
 * 而且**後台一格都調不到**、一條測試都沒有。
 *
 * 現在它讀 `config/ambient-vfx@1` 的 `arenaFire`（出貨值 `enabled: false`），
 * 判斷集中在 shared 的 `decorModelBurns()`。**程式碼刻意留著**：「場地要不要有
 * 環境火」是一個決策點，owner 改主意時應該是後台打勾，不是再改一次程式＋重新
 * 部署（CLAUDE.md 第一守則）。
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDoc, ArenaFire } from "@ggd/shared/content";
import { DEFAULT_ARENA_FIRE, decorModelBurns } from "@ggd/shared/content";
import type { AssetManager } from "./AssetManager";
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";
import { DecorFader } from "./DecorFade";
import {
  buildContactShadows,
  buildZoneGround,
  CONTACT_SPREAD,
  type ContactShadow,
  type ZoneGround,
} from "./ArenaGround";

/** Decor rotation is authored in quarter-turns (0-3) — pure, unit-tested. */
export function rotQuarterToRadians(rotQuarter: number): number {
  return ((((rotQuarter % 4) + 4) % 4) * Math.PI) / 2;
}

// ---------------------------------------------------------------------------
// fixed-camera sightline math (occluder audit #29)
// ---------------------------------------------------------------------------
// The rig (CameraRig) has no yaw/orbit: it sits due SOUTH of its target at
//   (tx, dolly·sin(pitch), tz − dolly·cos(pitch)),   pitch = 68° (#161),
// looking north — so a prop occludes heroes standing NORTH (+Z) of it. A prop
// whose top is at height H fully hides a hero with head height h everywhere
// within
//   reach(H) = (H − h) · standoff / (eyeHeight − H)
// north of its silhouette, and UNBOUNDEDLY once H reaches the camera eye.
// The worst case inside the dolly clamp is the CLOSEST zoom — DOLLY_MIN = 10,
// which is also the default (#31a): eye ≈ 9.27u, standoff ≈ 3.75u. Capping
// visual tops at 2.4u keeps the full-hide band for a 1.7u hero under
//   (2.4 − 1.7) · 3.75 / (9.27 − 2.4) ≈ 0.38u
// — a body-contact band, never a vanished hero.
const SIGHTLINE_WORST_DOLLY = DOLLY_MIN;
export const SIGHTLINE_EYE_HEIGHT = SIGHTLINE_WORST_DOLLY * Math.sin(CAMERA_PITCH_RAD); // ≈ 9.27u
export const SIGHTLINE_STANDOFF = SIGHTLINE_WORST_DOLLY * Math.cos(CAMERA_PITCH_RAD); // ≈ 3.75u
/** shortest hero head height — reach() is worst for short heroes */
const HERO_HEAD_Y = 1.7;
/** visual height cap for anything standing where heroes fight (see above).
 *  This governs the DECOR squash in dressArena — it is a PERMISSION ceiling
 *  ("a 0.38u dead band is tolerable for an authored prop"), NOT the height the
 *  procedural obstacle markers are built at (see OBSTACLE_MARKER_TOP_Y). */
export const SIGHTLINE_HEIGHT_CAP = 2.4;
/**
 * Top of the procedural collision markers buildArena draws over every sim
 * obstacle — the SAME number, for the SAME reason, as ArenaGround's
 * `KERB_TOP_Y`: 0.42u is below the shortest hero's head, so
 * `fullHideReach(0.42) === 0` and a marker can never hide any part of a hero at
 * any zoom, while ~1/4 of a hero still reads clearly as a raised stone base
 * from the steep top-down camera.
 *
 * WHY NOT SIGHTLINE_HEIGHT_CAP (task #218). Obstacles used to be drawn as full
 * 2.4u grey drums, removed again only when the authored doc happened to carry
 * `pillar` decor to stand in for them. That made a CAMERA guarantee depend on
 * unrelated CONTENT: deleting arena.skeleton's pillar decor (59c634f) silently
 * switched the removal off and left 6 grey columns on skeleton, 20 on dota and
 * 55 on godie, plus a permanent set on the pre-match SKELETON_ARENA (which has
 * no doc at all, so the dress pass never runs). A 2.4u drum also eats the legs
 * of everyone within 2.4·3.75/(9.27−2.4) ≈ 1.31u north of it. Markers are now
 * built low UNCONDITIONALLY, so no content edit can ever re-arm that bug — and
 * the collision stays VISIBLE (no invisible walls): the sim geometry itself is
 * untouched, only its stand-in silhouette is.
 */
export const OBSTACLE_MARKER_TOP_Y = 0.42;
/** Floor ring drawn on the obstacle's exact collision radius, so the edge you
 *  bump into stays legible from a distance once the stump is this low. */
const OBSTACLE_RING_Y = 0.03;
const OBSTACLE_RING_THICKNESS = 0.18;
/** hero silhouette width the sightline has to get past (±0.5u of body) */
const HERO_WIDTH = 1.0;

/** How far NORTH of its silhouette a prop with top `topY` fully hides a
 *  1.7u hero, at the worst-case (closest) zoom. Pure — unit-tested. */
export function fullHideReach(topY: number): number {
  if (topY <= HERO_HEAD_Y) return 0;
  if (topY >= SIGHTLINE_EYE_HEIGHT) return Infinity;
  return ((topY - HERO_HEAD_Y) * SIGHTLINE_STANDOFF) / (SIGHTLINE_EYE_HEIGHT - topY);
}

/**
 * The narrowest X silhouette that could still FULLY hide a hero, for a prop
 * `depthZ` deep whose top is at `topY`.
 *
 * This replaces a flat `width < 1u ⇒ harmless` test, whose premise — a thing
 * narrower than a hero cannot cover one — is false twice over:
 *
 *  1. PERSPECTIVE. The rays that must all be blocked run from the eye to a 1u
 *     hero silhouette, so they CONVERGE going south: `d` units south of the
 *     hero that pencil of rays is only `1 − d/standoff` wide, pinching to a
 *     point at the eye. A prop standing on the sightline is magnified against
 *     what it hides, and needs correspondingly less width to cover it.
 *  2. DEPTH. A ray crosses the prop's whole Z extent and is blocked if it is
 *     inside the silhouette ANYWHERE in there — so the southernmost, most
 *     pinched face is the one that decides, and depth buys occlusion exactly
 *     like distance does. An edge-on banner 0.6u wide but 3.6u deep screens a
 *     long strip of ground down a 68° sightline, nothing like its plan width.
 *
 * `standoff` is only 3.75u, so anything whose reach plus depth covers that is
 * unconditionally an occluder: it needs no width at all. Pure — unit-tested.
 */
export function minFullHideWidth(depthZ: number, topY: number): number {
  // best case for the prop: the farthest-south hero it still reaches, screened
  // at its own south face — the most pinched point of the ray pencil.
  const span = Math.min(fullHideReach(topY), SIGHTLINE_STANDOFF) + depthZ;
  return Math.max(0, HERO_WIDTH * (1 - span / SIGHTLINE_STANDOFF));
}

/**
 * Could a prop with world AABB [minX..maxX]×[minZ..maxZ] and top `topY` fully
 * hide a hero anywhere heroes can stand? Its occlusion shadow is the footprint
 * extended `fullHideReach(topY)` units north; the prop offends when that
 * rectangle overlaps any zone's playable disc — unless it is too thin to cover
 * a hero at all (`minFullHideWidth`). Pure — unit-tested.
 */
export function occludesPlayArea(
  b: { minX: number; maxX: number; minZ: number; maxZ: number; topY: number },
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
): boolean {
  if (b.topY <= SIGHTLINE_HEIGHT_CAP + 1e-6) return false;
  // too thin to cover a hero even at the point where the sightline pinches
  if (b.maxX - b.minX < minFullHideWidth(b.maxZ - b.minZ, b.topY)) return false;
  const reach = fullHideReach(b.topY);
  const shadowMaxZ = b.maxZ + (Number.isFinite(reach) ? reach : 1e6);
  for (const zone of zones) {
    // closest point of the shadow rectangle to the zone center vs its radius
    const nx = Math.min(Math.max(zone.center.x, b.minX), b.maxX);
    const nz = Math.min(Math.max(zone.center.z, b.minZ), shadowMaxZ);
    const dx = nx - zone.center.x;
    const dz = nz - zone.center.z;
    if (dx * dx + dz * dz <= zone.boundaryRadius * zone.boundaryRadius) return true;
  }
  return false;
}

/** Tall team-colored landmarks the audit marks "fade": keep full height for
 *  identity, auto-fade via DecorFader when they block a camera→hero sightline. */
const FADE_MODELS = ["tower_red", "tower_blue"];

export interface ArenaHandles {
  /** parent of EVERYTHING this arena created — dispose to tear the map down */
  root: TransformNode;
  /** every procedural collision marker — stump + floor ring for each CIRCLE
   *  obstacle, low slab for each SEGMENT obstacle. All of them are tracked
   *  (the segment slabs used to be built and then forgotten, so nothing could
   *  ever find them again); all of them are low-profile by construction. */
  obstacleMeshes: Mesh[];
  /** floor + boundary rim per zone (render/ArenaGround.ts) */
  grounds: ZoneGround[];
  /** torch flame particle systems (not TransformNodes → tracked separately) */
  flames: ParticleSystem[];
  /** auto-fade for the audit's "fade" props (GameApp drives it per frame) */
  fader: DecorFader;
}

/**
 * Build the collision-truthful arena. `groundStyle` comes from the authored doc
 * and is optional ON PURPOSE: the pre-match placeholder arena is built before
 * any doc is loaded, and passing nothing there means the floor uses its flat
 * fallback colour and fetches NO texture set — otherwise every boot would
 * download a stone set that the real map is about to throw away.
 */
export function buildArena(scene: Scene, arena: ArenaDef, groundStyle?: string): ArenaHandles {
  const root = new TransformNode(`arena-root-${arena.id}`, scene);
  const handles: ArenaHandles = {
    root,
    obstacleMeshes: [],
    grounds: [],
    flames: [],
    fader: new DecorFader(),
  };

  arena.zones.forEach((zone, zi) => {
    handles.grounds.push(buildZoneGround(scene, root, zone, zi, groundStyle));

    const obstacleMat = new StandardMaterial(`zone-${zi}-obstacle-mat`, scene);
    obstacleMat.diffuseColor = new Color3(0.42, 0.4, 0.45);
    obstacleMat.specularColor = new Color3(0.05, 0.05, 0.05);
    // brighter, slightly warm rim so the collision EDGE reads against every
    // shipped groundStyle (stone / sand / grass / dirt) now that the marker is
    // too low to throw a silhouette.
    const obstacleRimMat = new StandardMaterial(`zone-${zi}-obstacle-rim-mat`, scene);
    obstacleRimMat.diffuseColor = new Color3(0.66, 0.62, 0.58);
    obstacleRimMat.emissiveColor = new Color3(0.12, 0.11, 0.1);
    obstacleRimMat.specularColor = new Color3(0.08, 0.08, 0.08);

    // Every marker below tops out at OBSTACLE_MARKER_TOP_Y, UNCONDITIONALLY —
    // no doc/decor state can change that (task #218). Footprints are copied
    // straight off the sim obstacle, so what you see is still where you collide.
    zone.obstacles.forEach((ob, oi) => {
      if (ob.kind === "circle") {
        const stump = MeshBuilder.CreateCylinder(
          `zone-${zi}-ob-${oi}`,
          { diameter: ob.radius * 2, height: OBSTACLE_MARKER_TOP_Y, tessellation: 24 },
          scene,
        );
        stump.position.set(ob.center.x, OBSTACLE_MARKER_TOP_Y / 2, ob.center.z);
        stump.material = obstacleMat;
        stump.isPickable = false;
        stump.parent = root;
        stump.freezeWorldMatrix();
        handles.obstacleMeshes.push(stump);

        // ring ON the collision radius — tops out at 0.12u, well under the stump
        const ring = MeshBuilder.CreateTorus(
          `zone-${zi}-ob-${oi}-ring`,
          {
            diameter: ob.radius * 2,
            thickness: OBSTACLE_RING_THICKNESS,
            tessellation: 28,
          },
          scene,
        );
        ring.position.set(ob.center.x, OBSTACLE_RING_Y, ob.center.z);
        ring.material = obstacleRimMat;
        ring.isPickable = false;
        ring.parent = root;
        ring.freezeWorldMatrix();
        handles.obstacleMeshes.push(ring);
      } else {
        const dx = ob.b.x - ob.a.x;
        const dz = ob.b.z - ob.a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        // width/depth/rotation/centre are UNCHANGED — only the height drops, so
        // the slab still traces the sim segment exactly.
        const wall = MeshBuilder.CreateBox(
          `zone-${zi}-ob-${oi}`,
          { width: len, height: OBSTACLE_MARKER_TOP_Y, depth: 0.4 },
          scene,
        );
        wall.position.set((ob.a.x + ob.b.x) / 2, OBSTACLE_MARKER_TOP_Y / 2, (ob.a.z + ob.b.z) / 2);
        wall.rotation.y = Math.atan2(dz, dx);
        wall.material = obstacleMat;
        wall.isPickable = false;
        wall.parent = root;
        wall.freezeWorldMatrix();
        handles.obstacleMeshes.push(wall);
      }
    });

    // spawn pads
    const padMat = new StandardMaterial(`zone-${zi}-pad-mat`, scene);
    padMat.diffuseColor = new Color3(0.3, 0.34, 0.4);
    padMat.alpha = 0.65;
    zone.spawns.forEach((side, si) => {
      side.forEach((s, pi) => {
        const pad = MeshBuilder.CreateCylinder(
          `zone-${zi}-spawn-${si}-${pi}`,
          { diameter: 1.6, height: 0.04, tessellation: 20 },
          scene,
        );
        pad.position.set(s.x, 0.02, s.z);
        pad.material = padMat;
        pad.isPickable = false;
        pad.parent = root;
        pad.freezeWorldMatrix();
      });
    });
  });

  return handles;
}

/**
 * Tear down every mesh/material/particle a build+dress pass created (used to
 * rebuild the map when the match's mapId changes). Idempotent.
 */
export function disposeArena(_scene: Scene, handles: ArenaHandles): void {
  for (const ps of handles.flames) ps.dispose();
  handles.flames.length = 0;
  handles.fader.clear(); // fade materials dispose with their meshes below
  // dispose all descendant meshes (with their materials/textures) then the root
  for (const m of handles.root.getChildMeshes(false)) m.dispose(false, true);
  handles.root.dispose();
  handles.obstacleMeshes.length = 0;
  handles.grounds.length = 0;
}

// ---------------------------------------------------------------------------
// pass 2 — authored decor
// ---------------------------------------------------------------------------

const FLAME_TEXTURE = "/content/assets/textures/particles/flame_01.png";

let instCounter = 0;

/** Instance a loaded prop container at a world pose (returns the root).
 *  `uniqueMaterials` clones real meshes + materials (no instancing) so the
 *  prop can be faded per-instance — reserve it for the few FADE_MODELS. */
function placeInstance(
  scene: Scene,
  parent: TransformNode,
  container: AssetContainer,
  x: number,
  z: number,
  yawRad: number,
  scale: number,
  uniqueMaterials = false,
): TransformNode {
  const inst = uniqueMaterials
    ? container.instantiateModelsToScene((n) => `decor-${instCounter++}-${n}`, true, {
        doNotInstantiate: true,
      })
    : container.instantiateModelsToScene((n) => `decor-${instCounter++}-${n}`, false);
  const root = new TransformNode(`decor-root-${instCounter}`, scene);
  root.parent = parent;
  for (const node of inst.rootNodes) node.parent = root;
  root.position.set(x, 0, z);
  root.rotation.y = yawRad;
  root.scaling.setAll(scale);
  for (const mesh of root.getChildMeshes(false)) mesh.isPickable = false;
  return root;
}

/** Give hex water tiles a cheap, watery read: soft blue emissive + specular. */
function makeWaterish(root: TransformNode): void {
  for (const mesh of root.getChildMeshes(false)) {
    const mat = mesh.material as Material | null;
    if (mat instanceof StandardMaterial) {
      mat.emissiveColor = new Color3(0.05, 0.16, 0.28);
      mat.specularColor = new Color3(0.5, 0.6, 0.7);
      mat.specularPower = 64;
    } else if (mat && "emissiveColor" in mat) {
      // PBR (glTF) material — nudge emissive toward blue
      (mat as unknown as { emissiveColor: Color3 }).emissiveColor = new Color3(0.05, 0.16, 0.28);
    }
  }
}

/** Is a prop's whole contact blob inside some zone's floor disc? Props authored
 *  on or beyond the rim (banners, gate pieces) would otherwise cast a shadow
 *  onto the kerb and the empty apron behind it. Pure — unit-tested. */
export function standsOnFloor(
  x: number,
  z: number,
  footprint: number,
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
): boolean {
  return zones.some((zone) => {
    const dx = x - zone.center.x;
    const dz = z - zone.center.z;
    const reach = zone.boundaryRadius - footprint * CONTACT_SPREAD;
    return reach > 0 && dx * dx + dz * dz <= reach * reach;
  });
}

/** Base flame particle size (world units) — `arenaFire.sizeScale` scales both. */
const FLAME_MIN_SIZE = 0.3;
const FLAME_MAX_SIZE = 0.6;

/** Small additive flame on a torch tip; returns the system so it's tracked. */
function attachFlame(
  scene: Scene,
  x: number,
  y: number,
  z: number,
  fire: ArenaFire,
): ParticleSystem {
  const ps = new ParticleSystem(`torch-flame-${instCounter++}`, 24, scene);
  ps.particleTexture = new Texture(FLAME_TEXTURE, scene);
  ps.emitter = new Vector3(x, y, z);
  ps.minEmitBox = new Vector3(-0.08, 0, -0.08);
  ps.maxEmitBox = new Vector3(0.08, 0.1, 0.08);
  ps.color1 = new Color4(1, 0.7, 0.25, 1);
  ps.color2 = new Color4(1, 0.45, 0.12, 0.9);
  ps.colorDead = new Color4(0.6, 0.1, 0.02, 0);
  ps.minSize = FLAME_MIN_SIZE * fire.sizeScale;
  ps.maxSize = FLAME_MAX_SIZE * fire.sizeScale;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.7;
  ps.emitRate = fire.emitRate;
  ps.direction1 = new Vector3(-0.05, 0.8, -0.05);
  ps.direction2 = new Vector3(0.05, 1.2, 0.05);
  ps.minEmitPower = 0.3;
  ps.maxEmitPower = 0.7;
  ps.gravity = new Vector3(0, 0.6, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.start();
  return ps;
}

/**
 * Apply the authored arena doc: decor props, a contact shadow under each one,
 * torch flames, water shimmer. Any load failure leaves the procedural pass
 * untouched — and the procedural obstacle markers are never touched at all
 * (see the note at the end of this function, task #218).
 *
 * The floor itself is NO LONGER touched here. It used to be re-tinted from the
 * doc and, for stone/dirt/wood, buried under a square grid of instanced
 * `floor_tile_large.glb` clipped to the zone circle — the stair-stepped rim of
 * task #80. The floor is now real geometry built by buildArena from the same
 * `groundStyle`, so this pass only adds what stands ON it.
 */
export async function dressArena(
  scene: Scene,
  assets: AssetManager,
  arena: ArenaDef,
  doc: ArenaDoc,
  handles: ArenaHandles,
  /**
   * 場地環境火焰政策（`config/ambient-vfx@1` 的 `arenaFire`，GH#251）。
   * 省略 = `DEFAULT_ARENA_FIRE`，也就是**關的** —— 呼叫端忘了接線時的結果是
   * 「沒有火」而不是「有火」，因為 owner 明說要拿掉。
   */
  fire: ArenaFire = DEFAULT_ARENA_FIRE,
): Promise<void> {
  // ---- decor props ----
  const uniquePaths = [...new Set(doc.decor.map((d) => d.model))];
  const containers = new Map<string, AssetContainer | null>();
  await Promise.all(
    uniquePaths.map(async (p) => {
      containers.set(p, await assets.load(p));
    }),
  );

  const contacts: ContactShadow[] = [];
  for (const d of doc.decor) {
    const container = containers.get(d.model);
    if (!container) continue;
    const isFade = FADE_MODELS.some((m) => d.model.includes(m));
    const root = placeInstance(
      scene,
      handles.root,
      container,
      d.x,
      d.z,
      rotQuarterToRadians(d.rotQuarter),
      d.scale,
      isFade,
    );
    // measure the PLACED hierarchy (world space, rot + scale applied)
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    let topY = max.y; // world top AFTER any sightline squash below
    if (isFade) {
      // audit "fade": full-height team landmark — ghost it when it blocks a
      // camera→hero sightline instead of lowering it (GameApp drives update).
      handles.fader.register(root, min, max);
    } else if (
      occludesPlayArea({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z, topY: max.y }, arena.zones)
    ) {
      // audit "lower": VISUAL-ONLY squash so the top sits at the sightline
      // cap — footprint (and the sim obstacle underneath) stays exactly as
      // authored, so what you collide with is unchanged. A capped pillar
      // reads as a broken-column stump rather than disappearing.
      root.scaling.y *= SIGHTLINE_HEIGHT_CAP / max.y;
      topY = SIGHTLINE_HEIGHT_CAP;
    }
    if (decorModelBurns(fire, d.model) && handles.flames.length < fire.maxEmitters) {
      // ride the POST-squash tip so the flame never floats off a capped torch
      handles.flames.push(attachFlame(scene, d.x, Math.max(topY * 0.92, 0.5), d.z, fire));
    } else if (d.model.includes("water")) {
      makeWaterish(root);
    }
    // Contact shadow, sized from the placed footprint. Only for props standing
    // ON the floor — a rim banner's blob would spill over the kerb and float in
    // the void, so anything not comfortably inside a zone is skipped.
    const footprint = Math.max(max.x - min.x, max.z - min.z) / 2;
    if (footprint > 0 && standsOnFloor(d.x, d.z, footprint, arena.zones)) {
      contacts.push({ x: d.x, z: d.z, radius: footprint });
    }
  }
  buildContactShadows(scene, handles.root, contacts);

  // NOTE (task #218): there is deliberately NO "dispose the obstacle meshes
  // when pillar decor exists" branch here any more. It made a CAMERA guarantee
  // depend on CONTENT — deleting a doc's pillar rows silently re-armed the tall
  // grey columns — and it could never cover the doc-less pre-match arena. The
  // markers buildArena draws are low-profile unconditionally instead, and on
  // the arenas that DO carry pillar props those props stand exactly on the same
  // circles, so the marker simply disappears under the prop's base.
}
