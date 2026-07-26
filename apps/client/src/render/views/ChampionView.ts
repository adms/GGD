/**
 * ChampionView — the DEFAULT visual is a PROCEDURAL Minecraft-like voxel
 * figure built from Babylon boxes (head / torso / 2 arms / 2 legs, classic
 * 8:12:4 proportions), team-tinted, animated by deterministically swinging
 * the limb boxes. When a model doc exists for the modelKey, the AssetManager
 * loads its .glb (KayKit rigged character) and swaps it in: a ClipAnimator
 * then drives the real AnimationGroups via the doc's clipMap — the
 * procedural figure remains the instant fallback (client-06). Every champion
 * also gets a team-colored ground ring + blob shadow (KayKit models are not
 * team-tinted; the ring is the team read).
 */
import type { Scene } from "@babylonjs/core/scene";
// SIDE EFFECT, LOAD-BEARING: `mesh.renderOverlay` (the hit-flash channel used by
// applyFlash below) does not exist until this module installs the accessor on
// Mesh.prototype and registers the OutlineRenderer scene component that draws
// the overlay pass. Without it every flash wrote an inert expando and NOTHING
// was ever rendered — verified against the client's exact babylon module set.
import "@babylonjs/core/Rendering/outlineRenderer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { ModelDoc } from "@ggd/shared/content";
import {
  faceUVQuads,
  motifFaceUVQuads,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";
import { acquireVoxelSkinTexture, releaseVoxelSkinTexture } from "./voxelSkinTexture";
import { AnimationStateMachine, type AnimState, type AnimPulse } from "../anim/AnimationStateMachine";
import { ClipAnimator } from "../ClipAnimator";
import type { AssetManager } from "../AssetManager";
import {
  facingToYaw,
  nlerpFacing,
  smoothingAlpha,
  TELEPORT_STEP_UNITS,
  type Facing2,
} from "../math/motion";
import { FLASH_ALPHA, FLASH_MS, hitstopShiver } from "../combatFeedback";
import { dissolveFrame } from "../deathDissolve";
import { glbYawOffset } from "./glbFacing";
import { castFollowThroughMs, castStrikeFractionFor } from "../anim/castStrike";
import { ARCHETYPE_BY_MODEL_KEY, fallbackAccentFor, type VoxelLook } from "./voxelLook";
import { applyVoxelLook, releaseVoxelLook, type VoxelLookHandle } from "./voxelSkin";
import {
  GROWTH_RING_FADE_MS,
  GROWTH_SCALE_EASE_MS,
  GROWTH_TIER_SCALE,
  type GrowthTier,
} from "./growthTier";

/**
 * Yaw turn rate (per second) for visual rotation smoothing. The rendered model
 * eases toward the authoritative facing instead of snapping. ~14/s ≈ a 70 ms
 * time constant — quick enough to feel responsive, slow enough to read as a
 * turn. Exposed so it can be tuned (or hooked to settings) in one place.
 */
export const YAW_SMOOTH_RATE = 14;

/** Team palette (team 0..3). */
export const TEAM_COLORS: readonly [number, number, number][] = [
  [0.25, 0.45, 0.95], // blue
  [0.92, 0.28, 0.25], // red
  [0.28, 0.8, 0.42], // green
  [0.95, 0.78, 0.22], // gold
];

/**
 * Accent colour of the PROCEDURAL fallback figure.
 *
 * This used to be a two-entry table keyed by modelKey, which could not do the
 * job it looked like it was doing: a modelKey is shared by up to 18 champions
 * and only two of the four stand-ins were even listed, so 42 heroes rendered
 * the same grey. Since #226 the colour is derived from the CHAMPION id through
 * the same seed the baked mesh's palette uses (`voxelLook`), so the fallback
 * and the .glb are the same character in the same colours — a champion does
 * not change appearance the moment its model finishes loading.
 *
 * `championId` is null until the composition root resolves the seat (and for
 * mobs, which have no champion), in which case this returns the neutral grey
 * it always did.
 */
function accentFor(modelKey: string, championId: string | null): [number, number, number] {
  return fallbackAccentFor(championId, ARCHETYPE_BY_MODEL_KEY[modelKey] ?? "mage");
}

const PX = 1.8 / 32; // 32 voxel-pixels tall → 1.8 world units

/** `[u1,v1,u2,v2]` quads → Babylon's `faceUV` array. */
const toFaceUV = (quads: number[][]): Vector4[] =>
  quads.map((q) => new Vector4(q[0] as number, q[1] as number, q[2] as number, q[3] as number));

/**
 * MOTIF GEOMETRY (task #231). Each entry is the boxes one motif adds, in voxel
 * pixels relative to `bodyRoot`: `[w, h, d, x, y, z]`. FRONT is +Z (see
 * `facingToYaw`), so a cape sits at negative Z.
 *
 * Kept to 1–2 small boxes per slot on purpose — the whole reason #226 exists is
 * that the old champions were too heavy, and a silhouette that accumulates
 * accessories stops being a silhouette. `mask` is deliberately absent: it is
 * painted into the face texture and costs no geometry at all.
 */
const MOTIF_GEOMETRY: Readonly<Record<string, readonly (readonly number[])[]>> = Object.freeze({
  // head (head box is 8³ centred at y = 28)
  hood: [[9, 5, 9, 0, 31, 0]],
  horns: [
    [2, 4, 2, -3, 34, 0],
    [2, 4, 2, 3, 34, 0],
  ],
  "beast-ears": [
    [2, 3, 1, -3, 34, 0],
    [2, 3, 1, 3, 34, 0],
  ],
  "brim-hat": [[12, 1, 12, 0, 32.5, 0]],
  crown: [[9, 2, 9, 0, 33, 0]],
  halo: [[8, 1, 8, 0, 37, 0]],
  antenna: [[1, 5, 1, 0, 35, 0]],
  headband: [[9, 2, 9, 0, 30.5, 0]],
  // shoulder (arm pivots sit at y = 24, x = ±6)
  pauldrons: [
    [4, 2, 5, -6, 24.5, 0],
    [4, 2, 5, 6, 24.5, 0],
  ],
  spikes: [
    [2, 4, 2, -5, 26, 0],
    [2, 4, 2, 5, 26, 0],
  ],
  epaulets: [
    [5, 1, 5, -6, 24, 0],
    [5, 1, 5, 6, 24, 0],
  ],
  shawl: [[10, 3, 5, 0, 23, 0]],
  // back (torso is 8w × 12h × 4d centred at y = 18)
  cape: [[8, 12, 1, 0, 18, -2.6]],
  "scarf-tail": [[2, 8, 1, 0, 20, -2.6]],
  tail: [[2, 2, 6, 0, 13, -4]],
  backpack: [[6, 6, 3, 0, 19, -3.6]],
  "wing-stubs": [
    [3, 5, 1, -3, 21, -2.6],
    [3, 5, 1, 3, 21, -2.6],
  ],
});

/** `#rrggbb` → the 0..1 triple a `Color3` wants. */
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Options bag for the view — additive, so the 4-arg call sites still compile. */
export interface ChampionViewOptions {
  /**
   * The champion's generated voxel skin (task #231). Absent/null keeps the
   * pre-#231 flat team-coloured figure EXACTLY as it was, which is what lets
   * every existing caller and test stay untouched.
   */
  skin?: VoxelSkinRecipe | null;
}

/**
 * HEIGHT-NORMALIZATION target (task #150). Every loaded champion .glb is scaled
 * so its full silhouette stands ≈ this many world units tall, REGARDLESS of the
 * glb's native mesh height — which varies wildly per champion (measured 1.70u to
 * 2.32u rendered across the roster; the four shared CC0 stand-in meshes are the
 * oversized group, champ.sela renders 2.32u, while imported.heroshana renders
 * 1.70u and reads small next to them). Before #150 the render scale was the model
 * doc's raw `scale` applied as an ABSOLUTE — so consistency depended on every
 * doc.scale being hand-tuned per glb (fragile: any new/un-tuned import renders
 * wrong). Normalizing here makes size CONSISTENT by construction. A per-champion
 * RELATIVE multiplier (see tryUpgradeToGlb's `relativeScale`, from
 * content/models/_standin-overrides.json) then intentionally shrinks lore-small
 * creatures / enlarges giants. ~1.8u ≈ a standing human (夏娜 = the normal case).
 */
export const TARGET_HEIGHT = 1.8;

/**
 * A glb whose measured native height is below this (world units at scale 1) is
 * treated as unmeasurable — a degenerate / geometry-less rig — and falls back to
 * the model doc's declared `scale` rather than producing an absurd normalization
 * factor (dividing the target by a near-zero height). Real champions measure
 * >1u; this only trips on broken geometry.
 */
const MIN_NATIVE_HEIGHT = 0.05;

export class ChampionView {
  readonly root: TransformNode;
  readonly anim = new AnimationStateMachine();

  private readonly bodyRoot: TransformNode;
  private readonly head: Mesh;
  private readonly torso: Mesh;
  private readonly armL: TransformNode;
  private readonly armR: TransformNode;
  private readonly legL: TransformNode;
  private readonly legR: TransformNode;
  private readonly proceduralParts: Mesh[] = [];
  /** meshes tinted by the hit flash (procedural parts + any loaded .glb meshes). */
  private readonly flashMeshes: AbstractMesh[] = [];
  /**
   * Materials THIS VIEW CREATED — the only ones `dispose()` may destroy. A .glb
   * mesh's material belongs to the AssetManager's container cache, not to us.
   */
  private readonly ownedMaterials: StandardMaterial[] = [];
  private readonly teamRing: Mesh;
  private readonly blobShadow: Mesh;
  /** The generated voxel skin this figure was built with (task #231), if any. */
  private readonly skin: VoxelSkinRecipe | null = null;
  /** championId whose cached atlas this view holds a reference to (or null). */
  private atlasChampionId: string | null = null;

  private clipAnimator: ClipAnimator | null = null;
  private glbRoot: TransformNode | null = null;
  /** procedural-fallback materials this view repaints from the champion's seed. */
  private skinMat!: StandardMaterial;
  private accentMat!: StandardMaterial;
  /** per-champion blocky look (#226), or null until the seat resolves. */
  private voxelLook: VoxelLook | null = null;
  /**
   * The cloned material + generated palette texture `applyVoxelLook` created.
   * Tracked SEPARATELY from `ownedMaterials` because those are the procedural
   * figure's StandardMaterials; this one is a clone of the .glb's shared PBR
   * material and must be freed without ever touching the shared original.
   */
  private voxelHandle: VoxelLookHandle | null = null;
  /** skeletons of THIS instance (from instantiateModelsToScene), for the look. */
  private glbSkeletons: { bones: { name: string }[] }[] = [];
  /** The render scale actually applied to the adopted .glb — the height-normalized
   *  factor × the per-champion relative multiplier (task #150; #77 declared scale). */
  private declaredScaleValue: number | null = null;
  /**
   * TASK #247 airborne/scale state.
   *
   * `baseScale` is the #150-NORMALISED size, written ONCE at glb adoption and
   * never touched by an ability. `groundOffsetUnit` is the model's foot offset
   * expressed at UNIT scale, so it can be re-multiplied whenever the scale
   * changes — the trap `tryUpgradeToGlb` sets is that its `position.y = -min.y`
   * shift is measured in the ALREADY-SCALED frame, so naively multiplying the
   * scaling would leave the offset stale and sink (or float) the champion by
   * `(m-1) x groundOffset`. Keeping the offset at unit scale is the fix.
   *
   * `scaleMul` of 1 therefore restores the normalised size BIT-EXACTLY, so no
   * ability can permanently disturb #150 — not even one interrupted mid-ramp,
   * because the sim deletes the airborne entry and the wire sends sc = 0, which
   * the client maps to 1 (never to 0).
   */
  private baseScale = 1;
  private groundOffsetUnit = 0;
  /** interpolated fly height in GGD units (0 = grounded). */
  private leapY = 0;
  /** ENTITY_FLAG.AIRBORNE this frame — true on the takeoff/landing ticks too. */
  private airborne = false;
  /** interpolated temporary scale multiplier (1 = the #150-normalised size). */
  private scaleMul = 1;
  private upgradeStarted = false;
  private walkPhase = 0;
  private lastPose = { x: 0, z: 0 };
  private deathT = 0;
  /** hit flash (white physical/true, red magic) — brief emissive-style overlay. */
  private flashUntilMs = 0;
  private flashRgb: [number, number, number] = [1, 1, 1];
  /** per-flash overlay strength (0..1) — tier-driven, defaults to FLASH_ALPHA. */
  private flashAlpha = FLASH_ALPHA;
  private flashActive = false;
  /** hitstop: freeze this model's animation until this time (sim-synced). */
  private hitstopUntilMs = 0;
  /** follow-through span of the in-flight cast (set by `beginCast`). */
  private castTailMs = 0;
  /** true while the body is offset by the hitstop micro-shiver (needs a reset). */
  private shiverActive = false;
  private disposed = false;
  /**
   * CORPSE DISSOLVE (playtest directive #220). `deathAtMs` is armed by the sim's
   * `death` EVENT (via `noteDeath`), never by `alive === false` — the flag is
   * also false in champ-select, through the whole intermission, for a bye/parked
   * seat and during settlement, and dissolving those bodies would delete every
   * champion on screen outside combat. Null = this body never died (so it never
   * dissolves, whatever its alive flag says).
   */
  private deathAtMs: number | null = null;
  /** true while a claimable revive circle exists for this body's seat (#84/#196). */
  private reviveProtected = false;
  /** true once the dissolve has written rise/visibility (so a reset is owed). */
  private dissolveDirty = false;
  /** true once the body is fully gone; cleared on the revive/respawn edge. */
  private vanishedFlag = false;
  /** smoothed facing state (unit vectors); yaw eases cur→target every frame */
  private curFacing: Facing2 = { x: 0, z: 1 };
  private targetFacing: Facing2 = { x: 0, z: 1 };
  private facingInit = false;

  // ---- #244 GROWTH TIER (黑泥吞噬) ----
  /** Tier the SERVER says this body is at (0/1/2), from two EntityState flag bits. */
  private growthTier: GrowthTier = 0;
  /** Tier the scale has actually been written for — the idempotence guard. */
  private growthApplied: GrowthTier = 0;
  /** A tier that arrived before the .glb landed, replayed at the end of the adopt. */
  private growthPending = false;
  /** Lazily built on the tier-2 edge; a persistent spreading black-mud ring. */
  private mudRing: Mesh | null = null;
  private mudRingMat: StandardMaterial | null = null;
  /** ms at which the current tier became active (drives the ease + the fade). */
  private growthSinceMs = 0;
  /** the scale factor currently written to the body (the eased value). */
  private growthFactor = 1;
  /** factor the running ease started from (so a mid-ease change never snaps). */
  private growthEaseFrom = 1;
  /** true once a factor has actually been written (first write is unconditional). */
  private growthFactorWritten = false;

  constructor(
    scene: Scene,
    readonly entityId: number,
    readonly modelKey: string,
    teamId: number,
    opts: ChampionViewOptions = {},
  ) {
    this.root = new TransformNode(`champ-${entityId}`, scene);
    this.bodyRoot = new TransformNode(`champ-${entityId}-body`, scene);
    this.bodyRoot.parent = this.root;

    const team = TEAM_COLORS[((teamId % 4) + 4) % 4]!;
    const skin = opts.skin ?? null;
    this.skin = skin;
    // #231 wins when a generated skin is present (its palette IS the champion's
    // look); otherwise #226's `accentFor` — the two-entry `ACCENTS` table it
    // replaced no longer exists, and it gives all 44 stand-in champions their
    // own colour instead of one shared grey.
    const accent = skin ? hexRgb(skin.palette.accent) : accentFor(modelKey, null);

    const mat = (name: string, rgb: [number, number, number]): StandardMaterial => {
      const m = new StandardMaterial(`champ-${entityId}-${name}`, scene);
      m.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      this.ownedMaterials.push(m);
      return m;
    };
    // THE PAINTED ATLAS (#231). With a skin, `champ-<id>-skin` carries the
    // 64×64 texture and a WHITE diffuse, so Standard shading resolves to
    // `texture × diffuseColor` — which is exactly the slot the #49 vertex tint
    // multiplies into, so tint composes over the painted surface uniformly and
    // modelTint.ts needs no change at all. Without a skin the material keeps
    // its pre-#231 flat flesh colour.
    const skinMat = mat("skin", skin ? [1, 1, 1] : [0.87, 0.72, 0.58]);
    const atlas = skin ? acquireVoxelSkinTexture(scene, skin) : null;
    if (atlas) {
      skinMat.diffuseTexture = atlas;
      this.atlasChampionId = skin ? skin.championId : null;
    } else if (skin) {
      // texture upload refused (exotic engine): fall back to a flat outfit
      // colour rather than rendering a white figure.
      skinMat.diffuseColor = new Color3(...hexRgb(skin.palette.outfitPrimary));
    }
    const teamMat = mat("team", team);
    const accentMat = mat("accent", accent);
    // kept so `setVoxelLook` can repaint the fallback once the composition root
    // resolves this entity's championId (it is not known at construction).
    this.skinMat = skinMat;
    this.accentMat = accentMat;

    const box = (
      name: string,
      w: number,
      h: number,
      d: number,
      m: StandardMaterial,
      parent: TransformNode,
      y: number,
      extra?: { x?: number; z?: number; faceUV?: Vector4[] },
    ): Mesh => {
      const b = MeshBuilder.CreateBox(
        `champ-${entityId}-${name}`,
        {
          width: w * PX,
          height: h * PX,
          depth: d * PX,
          ...(extra?.faceUV ? { faceUV: extra.faceUV, wrap: true } : {}),
        },
        scene,
      );
      b.material = m;
      b.parent = parent;
      b.position.set((extra?.x ?? 0) * PX, y * PX, (extra?.z ?? 0) * PX);
      b.isPickable = false;
      this.proceduralParts.push(b);
      this.flashMeshes.push(b); // procedural parts flash by default
      return b;
    };

    // UV quads for each part, or undefined when this champion has no skin (the
    // box then keeps Babylon's default whole-texture UVs on a flat material).
    const uv = (part: "head" | "torso" | "armL" | "armR" | "legs"): Vector4[] | undefined =>
      skin ? toFaceUV(faceUVQuads(part)) : undefined;

    // Minecraft proportions (voxel px): legs 12, torso 12, head 8 → 32 tall.
    // WITH a skin the torso and legs wear the painted atlas; WITHOUT one they
    // stay flat team colour, which is the pre-#231 team read.
    const bodyMat = skin ? skinMat : teamMat;
    this.torso = box("torso", 8, 12, 4, bodyMat, this.bodyRoot, 18, { faceUV: uv("torso") });
    this.head = box("head", 8, 8, 8, skinMat, this.bodyRoot, 28, { faceUV: uv("head") });

    // limbs pivot at their attachment point (shoulder/hip)
    const limb = (
      name: string,
      m: StandardMaterial,
      px: number,
      pivotY: number,
      faceUV?: Vector4[],
    ): TransformNode => {
      const pivot = new TransformNode(`champ-${entityId}-${name}-pivot`, scene);
      pivot.parent = this.bodyRoot;
      pivot.position.set(px * PX, pivotY * PX, 0);
      box(name, 4, 12, 4, m, pivot as TransformNode, -6, { faceUV });
      return pivot;
    };
    const limbMat = skin ? skinMat : accentMat;
    const legMat = skin ? skinMat : teamMat;
    this.armL = limb("armL", limbMat, -6, 24, uv("armL"));
    this.armR = limb("armR", limbMat, 6, 24, uv("armR"));
    this.legL = limb("legL", legMat, -2, 12, uv("legs"));
    this.legR = limb("legR", legMat, 2, 12, uv("legs"));

    if (skin) {
      // ---- TEAM BAND (#231 team composition) ----------------------------
      // The skin repaints the torso and both legs, which used to BE the team
      // read. It is replaced by a dedicated chest band in the flat team colour
      // plus the emissive ring below — and `-teamband` is in
      // modelTint.UNTINTED_MESH_SUFFIXES so a dark #49 tint cannot crush the
      // stripe to unreadable, the same protection the ring already has.
      // The material keeps the name `champ-<id>-team`; only what it paints moved.
      box("teamband", 8.6, 3, 4.6, teamMat, this.bodyRoot, 21);

      // ---- MOTIFS (≤6 boxes, budget-enforced by the generator) -----------
      // Created through `box()` on purpose: that is what puts them in BOTH
      // `proceduralParts` (so they hide when a glb is adopted) AND
      // `flashMeshes` (so #64's hit flash paints them).
      const motifSlots: [string, number][] = [
        [skin.motifs.head, 0],
        [skin.motifs.shoulder, 1],
        [skin.motifs.back, 2],
      ];
      for (const [motif, cell] of motifSlots) {
        const boxes = MOTIF_GEOMETRY[motif];
        if (!boxes) continue; // "none", or a texture-only motif such as `mask`
        const faceUV = atlas ? toFaceUV(motifFaceUVQuads(cell)) : undefined;
        boxes.forEach((b, i) => {
          box(
            `motif-${motif}-${i}`,
            b[0] as number,
            b[1] as number,
            b[2] as number,
            skinMat,
            this.bodyRoot,
            b[4] as number,
            { x: b[3] as number, z: b[5] as number, faceUV },
          );
        });
      }
    }

    // ---- team identity ring + blob shadow (independent of model source) ----
    const ringMat = new StandardMaterial(`champ-${entityId}-ring`, scene);
    ringMat.emissiveColor = new Color3(team[0], team[1], team[2]);
    ringMat.disableLighting = true;
    ringMat.alpha = 0.85;
    this.ownedMaterials.push(ringMat);
    this.teamRing = MeshBuilder.CreateTorus(
      `champ-${entityId}-teamring`,
      { diameter: 1.25, thickness: 0.07, tessellation: 40 },
      scene,
    );
    this.teamRing.material = ringMat;
    this.teamRing.parent = this.root;
    this.teamRing.position.y = 0.04;
    this.teamRing.isPickable = false;

    const shadowMat = new StandardMaterial(`champ-${entityId}-blob`, scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.emissiveColor = new Color3(0, 0, 0);
    shadowMat.specularColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.38;
    this.ownedMaterials.push(shadowMat);
    this.blobShadow = MeshBuilder.CreateDisc(
      `champ-${entityId}-shadow`,
      { radius: 0.52, tessellation: 24 },
      scene,
    );
    this.blobShadow.material = shadowMat;
    this.blobShadow.parent = this.root;
    this.blobShadow.rotation.x = Math.PI / 2;
    this.blobShadow.position.y = 0.03;
    this.blobShadow.isPickable = false;
  }

  /**
   * Adopt this champion's per-champion blocky look (#226).
   *
   * Called by `EntityViewRegistry` as soon as the composition root can resolve
   * the entity → championId hop, which is NOT at construction time (render/**
   * is walled off from the seat table, client-08). Idempotent and cheap: the
   * first non-null look wins and later calls are ignored, so it is safe to call
   * every frame while the seat is still resolving.
   *
   * Applying it repaints the PROCEDURAL fallback immediately; the .glb half is
   * applied in `tryUpgradeToGlb` once the mesh actually lands (and this may run
   * either before or after that, so both sides check).
   */
  setVoxelLook(look: VoxelLook | null | undefined): void {
    if (!look || this.voxelLook || this.disposed) return;
    this.voxelLook = look;
    const [sr, sg, sb] = look.palette[0];
    this.skinMat.diffuseColor.set(sr, sg, sb);
    const [ar, ag, ab] = look.palette[3];
    this.accentMat.diffuseColor.set(ar, ag, ab);
    // the .glb may already be adopted (look arrived late) — paint it now
    this.applyVoxelLookToGlb();
  }

  /**
   * Paint + reshape the adopted .glb from the champion's look. Runs BEFORE
   * `applyModelTint` (#49) in every ordering: the registry only tints once
   * `view.hasGlb` is true, and `hasGlb` is set at the very end of the adopt
   * path, after this. That order matters — the tint MULTIPLIES `albedoColor`,
   * which this leaves white, so tint × palette composes as documented.
   */
  private applyVoxelLookToGlb(): void {
    if (!this.voxelLook || !this.glbRoot || this.voxelHandle) return;
    this.voxelHandle = applyVoxelLook(
      this.glbRoot.getChildMeshes(false),
      // THIS INSTANCE's skeletons, captured from `instantiateModelsToScene` —
      // never `scene.skeletons`, which holds every other champion's too.
      this.glbSkeletons,
      this.voxelLook,
      this.root.getScene(),
      `champ-${this.entityId}-voxel`,
    );
  }

  /** The tier the SIZE is currently written for (test/diagnostics seam). */
  get appliedGrowthTier(): GrowthTier {
    return this.growthApplied;
  }

  /** True once the tier-2 black-mud foot ring exists (test/diagnostics seam). */
  get hasMudRing(): boolean {
    return this.mudRing !== null;
  }

  /**
   * GROWTH TIER (task #244) — the SIZE half of 黑泥吞噬. Called by the registry
   * every sync from two `EntityState.flags` bits; idempotent and early-returns
   * when the tier has not moved, so the per-frame cost is one integer compare.
   *
   * WHAT IT SCALES, AND WHAT IT DELIBERATELY DOES NOT.
   *   • `bodyRoot` (the procedural figure) and `glbRoot` (the adopted mesh) —
   *     the champion's ART, which is the whole point.
   *   • `blobShadow` — a bigger thing casts a bigger shadow, and from a fixed
   *     camera the shadow is most of what sells the size read.
   *   • NOT `root`: the shadow and the team ring hang off it. And NOT
   *     `teamRing`, ever. That torus is a UI affordance that must be the same
   *     size on every champion or team identity stops being legible — #231
   *     already flags team colour as the highest-risk surface of this work.
   *
   * THE GROUND SHIFT IS THE EASY THING TO GET WRONG. `tryUpgradeToGlb` sets
   * `glbRoot.position.y = -min.y` measured in the OLD scaled frame. Scaling to
   * 1.25× without re-measuring sinks a quarter of the body through the floor,
   * so the shift is recomputed here every time the scale changes.
   *
   * #150 is NOT re-opened: that contract is about the DECLARED per-champion size
   * baked at load time. This is a live combat-state modifier — the same category
   * as a size buff — and it composes ON TOP of the normalization (always off the
   * STORED `declaredScaleValue`, never off the current scaling, or the multiply
   * would compound every call).
   */
  setGrowthTier(tier: GrowthTier, nowMs = 0): void {
    if (this.disposed) return;
    if (tier === this.growthApplied && !this.growthPending) return;
    if (tier !== this.growthTier) {
      this.growthTier = tier;
      // ease FROM whatever factor is on screen right now, so a tier change
      // mid-ease continues smoothly instead of snapping back to the old base
      this.growthEaseFrom = this.growthFactor;
      this.growthSinceMs = nowMs;
    }
    this.growthApplied = tier;
    this.growthPending = false;
    if (tier >= 2) this.ensureMudRing();
    else this.mudRing?.setEnabled(false);
    // write the first frame immediately so a tier that arrives with nowMs=0
    // (tests, a fresh view) is visible without waiting for an update tick
    this.applyGrowthScale(nowMs);
  }

  /** Ease the body/shadow to the current tier's factor and re-seat the glb. */
  private applyGrowthScale(nowMs: number): void {
    const target = GROWTH_TIER_SCALE[this.growthTier] ?? 1;
    const t =
      GROWTH_SCALE_EASE_MS <= 0
        ? 1
        : Math.min(1, Math.max(0, (nowMs - this.growthSinceMs) / GROWTH_SCALE_EASE_MS));
    // ease-out cubic — fast at the start so the swell reads as a lurch
    const e = 1 - (1 - t) * (1 - t) * (1 - t);
    const f = this.growthEaseFrom + (target - this.growthEaseFrom) * e;
    if (Math.abs(f - this.growthFactor) < 1e-4 && this.growthFactorWritten) return;
    this.growthFactor = f;
    this.growthFactorWritten = true;
    this.bodyRoot.scaling.setAll(f);
    this.blobShadow.scaling.setAll(f);
    if (this.glbRoot) {
      if (this.declaredScaleValue === null) {
        this.growthPending = true; // adopt mid-flight; replay when it finishes
      } else {
        this.glbRoot.scaling.setAll(this.declaredScaleValue * f);
        this.reground();
      }
    } else if (!this.upgradeStarted) {
      this.growthPending = true; // no glb yet — replay after it lands
    }
  }

  /** Re-seat the adopted glb on y=0 after its scale changed (see setGrowthTier). */
  private reground(): void {
    const g = this.glbRoot;
    if (!g) return;
    g.computeWorldMatrix(true);
    const { min } = g.getHierarchyBoundingVectors(true);
    if (Number.isFinite(min.y)) g.position.y = -min.y;
  }

  /**
   * The tier-2 BLACK-MUD FOOT RING. Built lazily on the edge (a champion who
   * never reaches 50 stacks never pays for it) and kept for the rest of the
   * match, because the stack is permanent — this is not a transient cue.
   *
   * Modelled on the two ground discs this view already owns (`blobShadow`) and
   * on ReviveCircleView, the closest existing precedent for a persistent
   * animated ground ring: an unlit alpha-blended disc, `isPickable = false`, and
   * its material in `ownedMaterials` so `dispose()` frees it. Sits at y=0.02 —
   * above the blob shadow (0.03 is the shadow; the ring goes just under it at
   * 0.02 so the shadow still reads) and below the team ring (0.04), which must
   * stay the topmost ground mark.
   */
  private ensureMudRing(): void {
    if (this.mudRing || this.disposed) return;
    const scene = this.root.getScene();
    const mat = new StandardMaterial(`champ-${this.entityId}-mudring-mat`, scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(0.07, 0.05, 0.09);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 0; // faded in by `update`
    this.ownedMaterials.push(mat);
    this.mudRingMat = mat;
    const ring = MeshBuilder.CreateDisc(
      `champ-${this.entityId}-mudring`,
      { radius: 0.95, tessellation: 40 },
      scene,
    );
    ring.material = mat;
    ring.parent = this.root;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    ring.isPickable = false;
    this.mudRing = ring;
  }

  /**
   * Per-frame growth animation: the 0.35 s scale ease and the ring's fade +
   * slow pulse. Driven off the `nowMs` the registry already threads into
   * `update`, so there is no new clock and nothing to keep in sync.
   */
  private updateGrowth(nowMs: number): void {
    this.applyGrowthScale(nowMs);
    const ring = this.mudRing;
    if (!ring || !this.mudRingMat) return;
    if (this.growthTier < 2) {
      this.mudRingMat.alpha = 0;
      return;
    }
    const since = Math.max(0, nowMs - this.growthSinceMs);
    const fade = Math.min(1, since / GROWTH_RING_FADE_MS);
    // slow 2.2 s breathe so it reads as spreading mud, not a static decal
    const pulse = 1 + 0.05 * Math.sin((since / 2200) * Math.PI * 2);
    this.mudRingMat.alpha = 0.55 * fade;
    ring.scaling.x = pulse;
    ring.scaling.y = pulse;
  }

  /**
   * Imperative transform write — never routed through React/Zustand. Position
   * is applied immediately; the authoritative facing is only recorded as the
   * TARGET here (the yaw eases toward it in `update`), except on the very first
   * pose where there is no prior orientation to preserve, so we snap once.
   */
  setPose(x: number, z: number, fx: number, fz: number, h = 0, sc = 1, airborne = false): void {
    // TASK #247: height and temporary scale are recorded here and APPLIED in
    // `update`, which is where the dissolve/bob/idle writers also live so all
    // three compose on the correct nodes instead of fighting over `root`.
    this.leapY = h;
    this.scaleMul = sc > 0 ? sc : 1;
    this.airborne = airborne;
    const dx = x - this.lastPose.x;
    const dz = z - this.lastPose.z;
    const step = Math.sqrt(dx * dx + dz * dz);
    // The limb swing is driven by DISTANCE TRAVELLED, so a relocation (spawn,
    // respawn, blink) would spin the walk cycle through a random phase in one
    // frame. A step this large is never locomotion (the fastest dash covers
    // ~1 u per 30 Hz tick), so treat it as a teleport and hold the phase.
    // A leaping champion covers ~0.33 u/tick planar — under TELEPORT_STEP_UNITS
    // — so without the airborne gate it would RUN THROUGH THE AIR with its legs
    // cycling. Hold the phase for the whole flight (#247).
    if (step < TELEPORT_STEP_UNITS && !airborne) this.walkPhase += step * 4.2;
    this.lastPose = { x, z };
    this.root.position.x = x;
    this.root.position.z = z;
    if (fx * fx + fz * fz > 1e-9) {
      this.targetFacing.x = fx;
      this.targetFacing.z = fz;
      if (!this.facingInit) {
        this.facingInit = true;
        this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, 1); // snap on spawn
        this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
      }
    }
  }

  /**
   * Ease the rendered yaw toward the authoritative facing. Runs every frame
   * regardless of the model source (procedural or .glb), so the fix applies to
   * every champion. nlerp on the 2D facing vector → bounded step → never snaps.
   */
  private stepFacing(dtMs: number): void {
    if (!this.facingInit) return;
    this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, smoothingAlpha(YAW_SMOOTH_RATE, dtMs));
    this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
  }

  /**
   * Event-driven animation pulse (attack/cast/hurt) from MSG.EVENT fanout.
   * `windowMs` holds the state for a real event-derived duration (cast time /
   * attack wind-up); `clipWindowMs` stretches/squeezes the one-shot clip to
   * that span; `restartClip: false` extends the state without re-firing the
   * clip (basicAttack landing mid-wind-up must not restart the swing).
   */
  pulse(
    kind: AnimPulse,
    nowMs: number,
    opts?: { windowMs?: number; clipWindowMs?: number; restartClip?: boolean },
  ): void {
    this.anim.trigger(kind, nowMs, opts?.windowMs);
    if (this.clipAnimator) {
      const clipWin = opts?.clipWindowMs ?? opts?.windowMs;
      if (clipWin !== undefined || opts?.restartClip !== false) {
        // a restarting pulse (re)defines its window; a non-restarting extend
        // (basicAttack mid-wind-up) leaves the wind-up's window in place
        this.clipAnimator.setPulseWindow(kind, clipWin !== undefined ? clipWin / 1000 : undefined);
      }
      if (opts?.restartClip !== false) this.clipAnimator.restart(kind);
    }
  }

  /**
   * The fraction of this model's cast clip that has played at the release
   * frame — the strike fraction the whole cast alignment is built on. Per-model
   * (see anim/castStrike), so a rig whose clip throws early/late can be tuned
   * without touching content/** or the sim.
   */
  get castStrikeFraction(): number {
    return castStrikeFractionFor(this.modelKey);
  }

  /**
   * CAST WIND-UP — the honest version (task: "stop the body lying").
   *
   * `startupMs` is the sim's authoritative wind-up: `castBegin` fires now and
   * `CastResolveSystem` runs the effects exactly that long afterwards. The clip
   * is planned so its RELEASE FRAME lands on that damage tick, with the
   * anticipation before it and the follow-through after — the same treatment
   * `attackWindup` already gives basic attacks. The state window is the whole
   * span (startup + tail), not just the startup, so the follow-through has
   * somewhere to play.
   *
   * The old call spanned the clip across `startupMs` itself, which threw the
   * move ~(1 - f) × startup EARLY — 240 ms on a 0.6 s cast at f = 0.6.
   */
  beginCast(startupMs: number, nowMs: number): void {
    const f = this.castStrikeFraction;
    const startup = Math.max(1, startupMs);
    this.castTailMs = castFollowThroughMs(startup, f);
    this.anim.trigger("cast", nowMs, startup + this.castTailMs);
    if (this.clipAnimator) {
      this.clipAnimator.setPulseAlignment("cast", {
        startupSec: startup / 1000,
        strikeFraction: f,
      });
      this.clipAnimator.restart("cast");
    }
  }

  triggerHurt(nowMs: number): void {
    this.pulse("hurt", nowMs);
  }

  /**
   * Bigger reaction for an unblocked heavy hit → KNOCKDOWN: hold the hurt flinch
   * for a longer window (the sim roots the victim prone for a short getup).
   */
  triggerKnockdown(nowMs: number): void {
    this.pulse("hurt", nowMs, { windowMs: 550, clipWindowMs: 550 });
  }

  /**
   * HIT FLASH — briefly tint the struck model (white physical/true, red magic)
   * via a per-mesh render overlay (never mutates shared .glb materials, so one
   * champion's flash can't bleed onto another sharing the material). Duration +
   * strength are tier-driven by combatFeedback's plan; both default to the
   * medium-hit values (FLASH_MS / FLASH_ALPHA) for direct callers.
   */
  flash(
    rgb: [number, number, number],
    nowMs: number,
    durMs: number = FLASH_MS,
    alpha: number = FLASH_ALPHA,
  ): void {
    this.flashRgb = rgb;
    this.flashAlpha = alpha;
    this.flashUntilMs = Math.max(this.flashUntilMs, nowMs + durMs);
  }

  /**
   * HITSTOP — freeze this model's animation until `nowMs + ms`, syncing the
   * struck model to the sim's deterministic hitstop tick-freeze so the hit reads
   * as impact. Only the animation clip freezes; the imperative position write
   * keeps flowing, so knockback still slides.
   */
  setHitstop(ms: number, nowMs: number): void {
    if (!(ms > 0)) return;
    const prevEnd = this.hitstopUntilMs;
    this.hitstopUntilMs = Math.max(prevEnd, nowMs + ms);
    // A mid-cast hit freezes the CLIP (ClipAnimator.setFrozen) and the sim
    // freezes the cast wind-up with it (CastResolveSystem skips a tick while
    // world.hitstop > 0). The pulse WINDOW is wall-clock, though, so without
    // this it would expire while the frozen clip still has frames to play and
    // the body would snap to idle before the move came out. Grow it by exactly
    // the freeze the model actually gained.
    const gained = this.hitstopUntilMs - Math.max(prevEnd, nowMs);
    if (gained > 0) this.anim.extendPulse("cast", gained);
  }

  /**
   * The sim RESOLVED the cast (castEnd) — the damage has landed on this exact
   * frame. Do NOT cut the clip here: the release frame is playing right now and
   * the follow-through is what sells it. Re-anchor the tail on the real event
   * instead of the predicted one, because hitstop/hitstun legitimately push
   * `castEnd` past `castTimeSec`. The tail is movement-interruptible (the sim
   * has already dropped the cast root).
   */
  releaseCast(nowMs: number): void {
    this.anim.release("cast", nowMs, this.castTailMs);
    this.castTailMs = 0;
  }

  /** The cast was BROKEN (castInterrupt: stun/knockdown/death) — cut the pose. */
  endCast(): void {
    this.castTailMs = 0;
    this.anim.cancel("cast");
  }

  /**
   * The sim says this champion just DIED (`death` event) — start the #220
   * corpse clock. Idempotent within one death: a duplicated/replayed event must
   * not restart the 3 s lie-down. Re-arming after a revive is what the
   * `alive` edge in `updateDissolve` clears the state for.
   */
  noteDeath(nowMs: number): void {
    if (this.deathAtMs === null) this.deathAtMs = nowMs;
  }

  /**
   * REVIVE EXEMPTION (#220): while a claimable revive circle exists for this
   * body's seat, the corpse must NOT dissolve — the circle is the anchor a
   * teammate channels on (#84/#206) and #196 gave it no expiry, so the body has
   * to stay put as the thing being rescued. Pushed in every frame by the
   * registry (never latched), because the `death` event and the snapshot patch
   * that adds the circle can land in either order.
   */
  setReviveProtected(protectedNow: boolean): void {
    this.reviveProtected = protectedNow;
  }

  /** True once the corpse has fully risen and faded out (#220). */
  get vanished(): boolean {
    return this.vanishedFlag;
  }

  /** Milliseconds since the arming `death` event, or null if this body never died. */
  deathElapsedMs(nowMs: number): number | null {
    return this.deathAtMs === null ? null : nowMs - this.deathAtMs;
  }

  /**
   * CORPSE DISSOLVE (#220) — lie 3 s, then rise + fade + vanish. Returns true
   * once the body is gone, so `update` can skip the rest of the frame's work.
   *
   * The clock is ABSOLUTE (`nowMs - deathAtMs`), never dt-accumulated: the
   * draw-distance cull skips `update` entirely for far champions, so an
   * accumulated clock would freeze while culled.
   *
   * While a revive is still claimable the death timestamp is RE-ANCHORED to now
   * instead of the phase being latched — that both holds the body at the
   * lie-down stage for as long as the circle burns AND self-heals a body that
   * had already started rising when protection (re)appeared, since
   * `dissolveFrame(0)` restores full opacity and zero rise.
   */
  private updateDissolve(state: AnimState, nowMs: number): boolean {
    if (state !== "death") {
      // alive again (revive completed / next round spawned this seat) — the same
      // edge #85 disarms on. Undo everything the dissolve wrote.
      if (this.deathAtMs !== null || this.dissolveDirty) this.resetDissolve();
      return false;
    }
    // dead but never armed by a `death` event: a parked/bye/champ-select seat.
    // It lies there exactly as it did before #220 — it did not die.
    if (this.deathAtMs === null) return false;
    // gone and staying gone (a circle cannot spawn for a corpse after the death
    // tick, so protection can never reappear) — cheapest possible frame.
    if (this.vanishedFlag && !this.reviveProtected) return true;
    if (this.reviveProtected) this.deathAtMs = nowMs; // hold at the lie-down stage
    const f = dissolveFrame(nowMs - this.deathAtMs);
    if (f.phase === "lying" && !this.dissolveDirty && !this.vanishedFlag) return false; // free
    this.root.position.y = f.riseY;
    for (const m of this.flashMeshes) m.visibility = f.visibility;
    this.dissolveDirty = f.phase !== "lying";
    if (f.phase === "vanished") {
      if (!this.vanishedFlag) this.setBodyVisible(false, nowMs);
      return true;
    }
    if (this.vanishedFlag) this.setBodyVisible(true, nowMs); // protection reappeared
    return false;
  }

  /** Enable/disable the body nodes + clips at the vanish (and on the way back). */
  private setBodyVisible(visible: boolean, nowMs: number): void {
    this.vanishedFlag = !visible;
    // Toggle the BODY nodes, never `root`: the registry's draw-distance cull owns
    // `root.setEnabled` and would re-enable a vanished corpse the moment it came
    // back into range. The ring/shadow are already off for the dead (see below);
    // re-enabling them here is harmless because the death branch re-hides them.
    this.bodyRoot.setEnabled(visible);
    this.glbRoot?.setEnabled(visible);
    if (!visible) {
      this.teamRing.setEnabled(false);
      this.blobShadow.setEnabled(false);
      // #244: the mud ring is a ground mark of a LIVING body — a corpse must not
      // leave one behind. Re-enabled by `resetDissolve` with the other two.
      this.mudRing?.setEnabled(false);
      // An AnimationGroup is NOT a node: a hidden body whose death clip is still
      // "playing" keeps costing per-frame work in scene.animationGroups. Stop
      // them all; `play()` restarts cleanly if this body is ever revived.
      this.clipAnimator?.stopAll();
      // drop the hit-flash overlay on the way out (nothing left to flash)
      this.flashUntilMs = 0;
      this.applyFlash(nowMs);
    }
  }

  /** Undo every write the dissolve made — the body is alive/rendered again. */
  private resetDissolve(): void {
    this.deathAtMs = null;
    this.root.position.y = 0;
    if (this.dissolveDirty) {
      for (const m of this.flashMeshes) m.visibility = 1;
      this.dissolveDirty = false;
    }
    if (this.vanishedFlag) {
      this.setBodyVisible(true, 0);
      this.teamRing.setEnabled(true);
      this.blobShadow.setEnabled(true);
      if (this.growthTier >= 2) this.mudRing?.setEnabled(true);
    }
  }

  /** Advance the visual animation for this frame. */
  update(state: AnimState, nowMs: number, dtMs: number, speedUnitsPerSec = 0): void {
    this.stepFacing(dtMs); // yaw smoothing — model-source independent
    // #244: the growth ease + the tier-2 mud ring, before the dissolve early-out
    // (a corpse's ring is switched off by setBodyVisible, not by skipping this).
    this.updateGrowth(nowMs);
    // #220: 3 s on the ground, then rise + fade. Once vanished there is nothing
    // left to animate, so the rest of the frame is skipped entirely.
    if (this.updateDissolve(state, nowMs)) return;
    this.applyAirborne(); // #247 fly height + temporary scale (see below)
    const frozen = nowMs < this.hitstopUntilMs; // hitstop window
    this.applyHitstopShiver(nowMs, frozen); // 破碎 buzz on the frozen body
    if (this.clipAnimator?.hasClips) {
      this.clipAnimator.setFrozen(frozen); // freeze/unfreeze the clip
      if (!frozen) {
        this.clipAnimator.setLocomotionSpeed(speedUnitsPerSec); // foot-slide fix
        this.clipAnimator.play(state);
        // release a HELD clip start (a cast clip too short to fill its window
        // waits on its opening frame so the strike still lands on the tick).
        // Inside the !frozen branch on purpose: hitstop must pause the hold.
        this.clipAnimator.advance(dtMs);
      }
      // keep the team ring readable but dim it for the dead
      const dead = state === "death";
      this.teamRing.setEnabled(!dead);
      this.blobShadow.setEnabled(!dead);
      this.applyFlash(nowMs);
      return;
    }
    // ---- procedural voxel animation ----
    if (frozen) {
      // hitstop: hold the current limb pose, only keep the flash alive
      this.applyFlash(nowMs);
      return;
    }
    const dt = Math.min(dtMs, 100) / 1000;
    const swing = Math.sin(this.walkPhase);

    let armL = 0;
    let armR = 0;
    let leg = 0;
    let bob = 0;
    if (state === "run") {
      armL = swing * 0.8;
      armR = -swing * 0.8;
      leg = swing * 0.75;
      bob = Math.abs(Math.cos(this.walkPhase)) * 0.05;
    } else if (state === "attack") {
      armR = -2.0; // raised strike
      armL = 0.3;
    } else if (state === "cast") {
      armL = -1.6; // both arms forward/up
      armR = -1.6;
    } else if (state === "hurt") {
      armL = 0.5;
      armR = 0.5;
    } else if (state === "idle") {
      const idleSway = Math.sin(nowMs / 600) * 0.06;
      armL = idleSway;
      armR = -idleSway;
    }

    if (state === "death") {
      this.deathT = Math.min(1, this.deathT + dt * 2.5);
    } else {
      this.deathT = Math.max(0, this.deathT - dt * 5);
    }
    // fall backward + sink slightly
    this.bodyRoot.rotation.x = -this.deathT * (Math.PI / 2);
    this.bodyRoot.position.y = -this.deathT * 0.35;
    this.teamRing.setEnabled(this.deathT < 0.5);
    this.blobShadow.setEnabled(this.deathT < 0.5);

    const k = 1 - Math.pow(0.5, dtMs / 40); // limb smoothing
    this.armL.rotation.x += (armL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (armR - this.armR.rotation.x) * k;
    this.legL.rotation.x += (leg - this.legL.rotation.x) * k;
    this.legR.rotation.x += (-leg - this.legR.rotation.x) * k;
    // Writers of bodyRoot.position.y, in order: the death sink (above), this
    // bob, and #247's leapY. They COMPOSE additively and all three belong on
    // bodyRoot — never on `root`, which also parents the team ring and the blob
    // shadow (see applyAirborne).
    this.bodyRoot.position.y = this.bodyRoot.position.y + bob + this.leapY;

    this.applyFlash(nowMs);
  }

  /**
   * TASK #247 — apply the interpolated fly height and temporary model scale.
   *
   * NOT ON `root`. `root` parents four things: bodyRoot, glbRoot, the TEAM RING
   * and the BLOB SHADOW. Writing height there would fly the ring and the shadow
   * into the air with the body, destroying the one cue that tells a player where
   * a leaper is going to land. So the height goes on the BODY nodes only, and
   * the shadow instead shrinks and fades with altitude — the classic, and free,
   * jump-readability cue.
   *
   * No conflict with the #220 dissolve (which writes `root.position.y`) or with
   * the idle bob (which writes `bodyRoot.position.y`): different nodes /
   * additive composition, both documented at their own sites.
   *
   * SCALE composes with #150 rather than replacing it: `baseScale` is the
   * normalised factor captured once at load, and the ground offset is re-derived
   * at the new scale so a grown champion neither sinks into nor floats above the
   * floor. m = 1 restores the normalised size exactly.
   *
   * IT ALSO COMPOSES WITH #244's GROWTH FACTOR (integration batch A). Both
   * features arrived independently and both write `bodyRoot` / `glbRoot` /
   * `blobShadow` scaling, and this one runs LAST every frame — so reading only
   * `scaleMul` here silently reverted a 黑泥 boss to normal size on the very next
   * frame after `setGrowthTier`. The composed factor is the product: growth is
   * the persistent combat-state size, `scaleMul` is the transient one, and
   * `baseScale`/`declaredScaleValue` (the same #150 number) is the base both
   * multiply. The shadow multiplies growth by the altitude shrink for the same
   * reason — a big champion mid-leap casts a big shadow that shrinks with height.
   */
  private applyAirborne(): void {
    const m = this.scaleMul * this.growthFactor;
    if (this.glbRoot) {
      this.glbRoot.scaling.setAll(this.baseScale * m);
      this.glbRoot.position.y = this.leapY + this.groundOffsetUnit * this.baseScale * m;
    } else if (m !== 1) {
      // procedural voxel figure: no measured ground offset, its feet are at y=0
      this.bodyRoot.scaling.setAll(m);
    } else if (this.bodyRoot.scaling.x !== 1) {
      this.bodyRoot.scaling.setAll(1);
    }
    // Ground cues stay ON THE GROUND; the shadow reads the altitude instead.
    const shrink = 1 / (1 + Math.max(0, this.leapY) * 0.15);
    this.blobShadow.scaling.setAll(this.growthFactor * shrink);
    const shadowMat = this.blobShadow.material as { alpha?: number } | null;
    if (shadowMat) shadowMat.alpha = 0.38 * shrink;
  }

  /**
   * HITSTOP MICRO-JITTER (audit strong-P2 / 破碎 buzz): while the body is frozen
   * on contact, offset it by a tiny high-frequency shiver (~1–2px) so the freeze
   * BUZZES with impact energy instead of reading as a dead pause. Client-only and
   * cosmetic — it moves `bodyRoot` (the visual body), never the `root` world
   * transform (position/ring/shadow keep flowing, so knockback still slides), and
   * it snaps to zero the instant the freeze lifts (收尾精準, no settle tail).
   * Edge-guarded: costs nothing outside the hitstop window.
   */
  private applyHitstopShiver(nowMs: number, frozen: boolean): void {
    if (!frozen) {
      if (this.shiverActive) {
        this.bodyRoot.position.x = 0;
        this.bodyRoot.position.z = 0;
        this.shiverActive = false;
      }
      return;
    }
    // phase off the entity id so attacker + victim don't buzz in lock-step
    const s = hitstopShiver(nowMs, this.hitstopUntilMs, this.entityId * 0.7);
    this.bodyRoot.position.x = s.x;
    this.bodyRoot.position.z = s.z;
    this.shiverActive = true;
  }

  /**
   * Drive the hit-flash render overlay. Edge-guarded: writes every frame while
   * lit (colour is stable + cheap), clears once on the trailing edge, and does
   * nothing while idle — no per-frame cost outside the ~80 ms flash window.
   */
  private applyFlash(nowMs: number): void {
    const on = nowMs < this.flashUntilMs;
    if (!on && !this.flashActive) return;
    for (const m of this.flashMeshes) {
      m.renderOverlay = on;
      if (on) {
        m.overlayColor.copyFromFloats(this.flashRgb[0], this.flashRgb[1], this.flashRgb[2]);
        m.overlayAlpha = this.flashAlpha;
      }
    }
    this.flashActive = on;
  }

  get hasGlb(): boolean {
    return this.glbRoot !== null;
  }

  /**
   * The live clip animator, or null while the champion is still on its
   * procedural stand-in. READ-ONLY DIAGNOSTICS: the /frame-data audition page
   * uses it to read back the plan a real `beginCast` produced on a real .glb,
   * so the page proves the RENDERER's timing rather than re-deriving it.
   * Nothing in the game should drive animation through this — go through
   * `pulse`/`beginCast`/`update`.
   */
  get animator(): ClipAnimator | null {
    return this.clipAnimator;
  }

  /**
   * The render scale actually applied to the adopted .glb, or null while the
   * champion is still on its procedural stand-in. As of task #150 this is the
   * HEIGHT-NORMALIZED factor (TARGET_HEIGHT ÷ the glb's native height) times the
   * per-champion `relativeScale` multiplier — NOT the model doc's raw `scale`
   * (which is now only a fallback for a degenerate glb). It never silently
   * substitutes a generic default (task #77): the procedural voxel figure stands
   * in only when there is genuinely no renderable model.
   */
  get declaredScale(): number | null {
    return this.declaredScaleValue;
  }

  get upgradeAttempted(): boolean {
    return this.upgradeStarted;
  }

  /**
   * Swap in the model doc's .glb (async). Idempotent — safe to call every
   * frame until a doc is available; only the first call with a doc loads.
   *
   * `relativeScale` (task #150, default 1.0) is the per-champion INTENTIONAL size
   * multiplier applied on top of height-normalization: 1.0 renders at the common
   * TARGET_HEIGHT, <1 deliberately smaller (lore-small creatures/mascots), >1
   * bigger (giants/mecha). It comes from content/models/_standin-overrides.json
   * via EntityViewRegistry.modelOverrideFor and is the ONLY size-exception knob —
   * the doc's raw `scale` no longer sets the on-screen size.
   */
  tryUpgradeToGlb(assets: AssetManager, doc: ModelDoc | null, relativeScale = 1): void {
    // TASK #231 — a champion whose recipe says `preferVoxelBody` has NO art of
    // its own: its modelKey points at one of the four shared stand-in meshes,
    // which is precisely the "44 heroes wearing 4 faces" problem. Adopting that
    // glb would hide the generated skin behind somebody else's body, so the
    // upgrade is declined outright and the champion keeps its own voxel figure.
    // Latch `upgradeStarted` so the registry stops asking every frame. When
    // #226 deletes the KayKit glbs this branch becomes a no-op rather than a
    // behaviour change.
    if (this.skin?.preferVoxelBody) {
      this.upgradeStarted = true;
      return;
    }
    if (!doc || this.upgradeStarted || this.disposed) return;
    this.upgradeStarted = true;
    void assets
      .load(doc.glbPath)
      .then((container) => {
        if (!container || this.disposed || this.glbRoot) return;
        const inst = container.instantiateModelsToScene((n) => `${this.entityId}-${n}`, false, {
          doNotInstantiate: true,
        });
        const glbRoot = new TransformNode(`champ-${this.entityId}-glb`, this.root.getScene());
        glbRoot.parent = this.root;
        // Measure at the NATIVE scale first (task #150): normalization needs the
        // glb's own height before any scaling is applied.
        glbRoot.scaling.setAll(1);
        // facing convention lives in one place (glbFacing); imported .glbs
        // need a different offset than native/KayKit ones. Yaw is about Y, so it
        // does not affect the vertical bounding measure below.
        glbRoot.rotation.y = glbYawOffset(doc.glbPath, this.modelKey);
        for (const node of inst.rootNodes) node.parent = glbRoot;
        const glbMeshes = glbRoot.getChildMeshes(false);
        // EMPTY-GLB → KEEP THE PROCEDURAL FALLBACK (task #69). A few imported
        // "models" are geometry-less WC3 dummies — e.g. `imported.collision`, a
        // 0-mesh bone-only unit whose only clip is a static "Stand". No champion
        // points at one any more (#77 moved godie-u011 「死亡老二 - 克勞薩先生」,
        // the last holdout, off `imported.collision` — a WC3 collision dummy is
        // a SPEC for an invisible unit, not a body, and it left the only
        // champion in the roster with nothing to render). The guard stays as
        // the defence for any future doc that resolves to an empty glb:
        // adopting one hid the voxel figure AND installed a ClipAnimator whose
        // "attack" resolved to "Stand" — an INVISIBLE champion. Discard
        // the empty instance and let the procedural figure (which DOES animate
        // attack/hurt/run) stand in. `upgradeStarted` stays true, so no retry.
        if (glbMeshes.length === 0) {
          inst.dispose(); // frees the cloned nodes + skeletons + animation groups
          glbRoot.dispose(false, false);
          return;
        }
        for (const mesh of glbMeshes) {
          mesh.isPickable = false;
          this.flashMeshes.push(mesh); // .glb meshes flash via per-mesh overlay
        }
        // HEIGHT-NORMALIZE (task #150): scale the glb so its full silhouette
        // stands ≈ TARGET_HEIGHT tall, then apply the champion's relative
        // multiplier — REPLACING the old raw-doc.scale-as-absolute so every
        // champion reads a consistent size regardless of its native mesh height.
        // A degenerate/geometry-less glb (native height unmeasurable) falls back
        // to the doc's declared scale rather than a nonsense normalization factor.
        glbRoot.computeWorldMatrix(true);
        const native = glbRoot.getHierarchyBoundingVectors(true);
        const nativeH = native.max.y - native.min.y;
        const rel = relativeScale > 0 ? relativeScale : 1;
        const baseScale =
          Number.isFinite(nativeH) && nativeH > MIN_NATIVE_HEIGHT
            ? TARGET_HEIGHT / nativeH
            : doc.scale;
        const finalScale = baseScale * rel;
        glbRoot.scaling.setAll(finalScale);
        // GROUND (task #61 "flying"/"sinking" fix): lift the model so its lowest
        // vertex sits on the arena floor (y=0). Imported rigs bake their feet at
        // an arbitrary local Y — `imported.ma` floats 0.72u above the origin,
        // `imported.picacugy`/`gumdam` dip ~0.6u below it (half-buried). This is
        // the SAME per-model root shift StorePreview (#129) and the intermission
        // mount (#111 int-32) apply, ported to the in-arena view so every
        // champion stands ON the ground, not above or sunk into it. Runs after
        // the FINAL scaling so the shift is in the rendered (scaled) frame.
        glbRoot.computeWorldMatrix(true);
        const { min } = glbRoot.getHierarchyBoundingVectors(true);
        if (Number.isFinite(min.y)) glbRoot.position.y = -min.y;
        // #247: remember the #150-normalised factor and the ground offset AT
        // UNIT SCALE, so a temporary scale multiplier can re-derive both without
        // ever overwriting the normalisation. `finalScale` is never mutated
        // afterwards — that is what makes m = 1 restore #150 bit-exactly.
        this.baseScale = finalScale;
        this.groundOffsetUnit =
          Number.isFinite(min.y) && finalScale > 0 ? -min.y / finalScale : 0;
        this.glbRoot = glbRoot;
        this.glbSkeletons = inst.skeletons as unknown as { bones: { name: string }[] }[];
        // #226 per-champion palette/proportions/props. MUST run before the
        // registry's applyModelTint, which it does: the registry gates on
        // `view.hasGlb`, and `hasGlb` reads `glbRoot`, set one line above —
        // but the tint only happens on the NEXT sync, after this returns.
        this.applyVoxelLookToGlb();
        this.declaredScaleValue = finalScale; // the render scale actually applied
        // #244: a growth tier that arrived while this load was in flight has
        // nothing to scale yet. Replay it now that `declaredScaleValue` exists —
        // strictly AFTER the assignment above, because `applyGrowthScale`
        // multiplies off the STORED value.
        if (this.growthPending || this.growthTier !== 0) {
          this.growthPending = false;
          this.growthFactorWritten = false; // force the write
          this.applyGrowthScale(this.growthSinceMs + GROWTH_SCALE_EASE_MS);
        }
        this.clipAnimator = new ClipAnimator(inst.animationGroups, doc.clipMap);
        // hide the procedural fallback
        for (const p of this.proceduralParts) p.setEnabled(false);
        // #220: the load can resolve AFTER this body already dissolved (a death
        // early in a match, on a cold asset cache). Adopt the corpse's current
        // dissolve state instead of popping a fully opaque model back on screen.
        if (this.vanishedFlag) {
          glbRoot.setEnabled(false);
          this.clipAnimator.stopAll();
        }
      })
      .catch((err) => {
        /* keep the procedural figure */
        console.warn(`[ChampionView] glb upgrade failed for ${this.modelKey}:`, err);
      });
  }

  /**
   * MATERIAL OWNERSHIP — why this does NOT pass `disposeMaterialAndTextures`.
   * `tryUpgradeToGlb` instantiates with `cloneMaterials: false`, so every .glb
   * child mesh points straight at the AssetContainer's material — the object
   * `AssetManager` CACHES per glb path and hands to every other champion on
   * that model and to every future spawn. Babylon's `dispose(_, true)` runs
   * `material.dispose(false, true)` on EVERY child mesh (note: forceDisposeTextures),
   * so the first champion to despawn would strip the shared material and its
   * textures out from under everyone still using it. We therefore let materials
   * outlive the view and dispose only the ones we created ourselves.
   */
  dispose(): void {
    this.disposed = true;
    // ANIMATION GROUPS are not nodes: `instantiateModelsToScene` clones the
    // container's groups into `scene.animationGroups` (a list Babylon walks
    // every frame) and `root.dispose()` below never touches them. Free them
    // FIRST, while their targets are still alive.
    this.clipAnimator?.dispose();
    this.clipAnimator = null;
    const scene = this.root.getScene();
    this.root.dispose(false, false);
    // The generated atlas is CACHE-OWNED and refcounted per championId (six
    // champions on the same hero share one 16 KB texture), so it is released,
    // never force-disposed — `dispose(false, true)` below would otherwise tear
    // it out from under every other view still rendering that champion. Release
    // FIRST, so the material we are about to dispose no longer points at a
    // texture the cache might legitimately keep alive.
    if (this.atlasChampionId) {
      releaseVoxelSkinTexture(scene, this.atlasChampionId);
      for (const m of this.ownedMaterials) m.diffuseTexture = null;
      this.atlasChampionId = null;
    }
    for (const m of this.ownedMaterials) m.dispose(false, true);
    this.ownedMaterials.length = 0;
    // The #226 palette clone + its generated RawTexture are view-owned too, but
    // are freed through their own path: `releaseVoxelLook` disposes the CLONE
    // without `forceDisposeTextures`, so the shared source material and its
    // textures — which belong to the AssetManager's container cache — survive.
    releaseVoxelLook(this.voxelHandle);
    this.voxelHandle = null;
    this.glbSkeletons = [];
  }
}
