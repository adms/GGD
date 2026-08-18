/**
 * ArenaGround — the arena floor as a REAL SURFACE (task #80, phase 2).
 *
 * WHAT THIS REPLACES. The floor used to be a flat one-colour cylinder with a
 * SQUARE GRID of `floor_tile_large.glb` instances laid over it and hard-clipped
 * to the zone circle by `if (dist > r - step*0.15) continue`. Square tiles
 * clipped to a circle can only ever produce a stair-stepped rim — that jagged
 * edge IS the 拼接方塊 the complaint is about — and it cost ~450 draw-call
 * sources per zone to produce it. Here each zone is instead:
 *
 *   floor mesh — one radial disc, genuinely round at the boundary, planar UVs,
 *                carrying the generated PBR set (see groundMaterials.ts).
 *   rim mesh   — one swept ring: kerb + outer apron, so the arena reads as a
 *                raised platform that ENDS rather than tiles trailing off.
 *
 * Two meshes and two materials per zone, four per arena, versus ~900 tile
 * instances before.
 *
 * ── THE THREE THINGS THAT ARE LOAD-BEARING HERE ────────────────────────────
 *
 * 1. COLLISION TRUTH. `boundaryRadius` belongs to the sim; this module only
 *    ever READS it. The floor is drawn out to exactly boundaryRadius and the
 *    kerb's inner face starts exactly there — which is where a hero's *body*
 *    stops, because the sim clamps a body's CENTRE to `boundaryRadius − radius`
 *    (packages/shared/src/sim/collision/resolve.ts). So a hero pressed to the
 *    wall touches the kerb exactly, with no gap and no interpenetration. The
 *    walkable surface is FLAT: units render at y = 0 with no per-pixel ground
 *    query, so vertical displacement inside the play circle would float or sink
 *    them. All in-play relief therefore comes from the normal map, and the only
 *    real geometry lives at/outside the boundary where nothing can stand.
 *
 * 2. THE OCCLUDER GUARANTEE (#29) SURVIVES BY CONSTRUCTION. `KERB_TOP_Y` is
 *    0.42u — below the SHORTEST hero's head (1.7u), so `fullHideReach()` of the
 *    kerb is exactly 0. This is a stronger statement than "under the 2.4u cap":
 *    a 2.4u wall is *permitted* because its full-hide band is only ~0.68u, but a
 *    continuous 2.4u ring would put that dead band around the entire southern
 *    arc. Nothing shorter than a hero's head can ever hide one from a camera
 *    looking DOWN at it, at any zoom, so the ring costs no sightline at all.
 *    ArenaGround.test.ts pins this, and scripts/occluder-sweep.ts re-runs the
 *    full #29 sweep with the ring included.
 *
 * 3. THE MACRO LAYER NEEDS THIS EXACT UV MAPPING. The floor's UV0 is planar in
 *    zone space — u = 0.5 + dx/(2R), v = 0.5 + dz/(2R) — so the non-repeating
 *    macro map lands on the disc exactly once and its `rad` field (0 at centre,
 *    1 at the boundary) means the real centre and the real rim. Get this wrong
 *    and the whole anti-repetition scheme of phase 1 silently stops working.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
// Side-effect: adds thinInstance* to Mesh (contact shadows are one draw call).
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { effectiveQuality } from "./RenderConfig";
import {
  GROUND_BLEND_LEVELS,
  detailUvScale,
  groundTextureSet,
  groundTextureUrls,
  TILE_WORLD_SIZE,
  type GroundTextureSet,
} from "./groundMaterials";

// ---------------------------------------------------------------------------
// heights — every one of these is measured from the walkable plane at y = 0
// ---------------------------------------------------------------------------

/** Top face of the walkable floor. A hair under 0 so prop bases (authored at
 *  y = 0) never z-fight with it; this is the offset the old disc used too. */
export const FLOOR_TOP_Y = -0.01;

/**
 * Top of the boundary kerb. MUST stay below `HERO_HEAD_Y` (1.7) — see note 2 in
 * the module docstring. It is not a look-and-see number: at 0.42u the kerb
 * reads as a kerb from the fixed 55° camera (it is ~1/4 of a hero) while
 * `fullHideReach(0.42) === 0` keeps the #29 guarantee exactly intact.
 */
export const KERB_TOP_Y = 0.42;

/** How far inward from the boundary the floor's baked contact-AO band reaches. */
const KERB_AO_REACH = 1.3;
/** Darkest vertex-colour multiplier in that band (at the wall itself). */
const KERB_AO_MIN = 0.55;

/** Outermost radius of the apron, as an offset beyond `boundaryRadius`. */
export const RIM_OUTER_OFFSET = 6;

/**
 * Anisotropic filtering for the ground's tiling maps.
 *
 * Babylon's default is 4, and on this floor that is visibly not enough: the
 * camera looks down a FIXED 55° pitch, so the ground recedes steeply across the
 * entire frame and every texel past mid-screen is sampled at a grazing angle —
 * precisely the case isotropic mip selection blurs into mush. Compared A/B on
 * the shipped stone set at the closest zoom, 4× visibly softened the far half
 * of the frame (slab joints dissolving into grey) where 8× kept them reading.
 * It is bought on ONE surface, two meshes per zone, rather than on every
 * material in the scene, so the fill cost is contained. Babylon clamps this to
 * the hardware maximum, so asking for more than the GPU has is safe.
 *
 * The mobile tier stays at the default: it is fill-rate bound before it is
 * detail bound (RenderConfig caps its DPR at 1.5 for the same reason).
 */
const GROUND_ANISOTROPY_DESKTOP = 8;

// ---------------------------------------------------------------------------
// pure geometry — no Babylon, unit-tested
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** One ring of the swept rim profile. */
export interface RimRing {
  /** radius offset from `boundaryRadius`, world units (0 = the boundary) */
  dr: number;
  /** height above the walkable plane */
  y: number;
  /** baked vertex-colour brightness (1 = fully lit, 0 = black) */
  shade: number;
  /** how strongly this ring follows the worn-crest wobble (0..1) */
  wobble: number;
}

/**
 * The rim cross-section, swept around the boundary circle. Read it as a
 * draughtsman's section, inside → outside:
 *
 *   dr 0.00  the foot, flush with the floor and dark — the contact crease that
 *            makes the kerb sit ON the ground instead of hovering over it
 *   dr 0.14  top of a near-vertical inner face (0.43u of rise in 0.14u of run)
 *   dr 0.30  the crest, catching the key light — the bright line that says
 *            "the arena ends here" from across the zone
 *   dr 1.15  outer lip, rolling over
 *   dr 1.45+ the apron falls away and darkens to nothing, so each zone reads as
 *            a raised platform in the void rather than a disc pasted on it
 *
 * Pure and exported so the tests can assert monotonic radius, the height cap
 * and the fall-off without constructing a scene.
 */
export const RIM_PROFILE: readonly RimRing[] = [
  { dr: 0.0, y: FLOOR_TOP_Y, shade: 0.32, wobble: 0 },
  { dr: 0.06, y: FLOOR_TOP_Y + 0.19, shade: 0.5, wobble: 0.35 },
  { dr: 0.14, y: KERB_TOP_Y - 0.04, shade: 0.92, wobble: 0.85 },
  { dr: 0.3, y: KERB_TOP_Y, shade: 1.0, wobble: 1 },
  { dr: 0.95, y: KERB_TOP_Y - 0.02, shade: 0.97, wobble: 1 },
  { dr: 1.15, y: KERB_TOP_Y - 0.15, shade: 0.7, wobble: 0.8 },
  { dr: 1.45, y: FLOOR_TOP_Y - 0.32, shade: 0.44, wobble: 0.3 },
  { dr: 2.6, y: FLOOR_TOP_Y - 0.9, shade: 0.24, wobble: 0.1 },
  { dr: 4.2, y: FLOOR_TOP_Y - 1.8, shade: 0.1, wobble: 0 },
  { dr: RIM_OUTER_OFFSET, y: FLOOR_TOP_Y - 3.1, shade: 0.03, wobble: 0 },
];

/**
 * Worn-crest height offset at angle `theta`, in world units.
 *
 * A perfectly extruded torus reads as machined pipe. This wobbles the crest by
 * a few centimetres so the ring looks laid and weathered. It is a sum of sines
 * at INTEGER angular frequencies, which is the whole trick: an integer harmonic
 * of the full turn closes back on itself exactly at theta = 2π, so the ring has
 * no seam. (Noise sampled per segment would not — it would leave one visible
 * step where the sweep wraps.) Deterministic in `seed`, so a zone rebuilds
 * identically and the two zones of an arena differ. Pure — unit-tested.
 */
export function kerbCrestOffset(theta: number, seed: number): number {
  const p = (n: number): number => ((Math.sin(seed * 12.9898 + n * 78.233) + 1) % 1) * Math.PI * 2;
  return (
    0.045 * Math.sin(3 * theta + p(1)) +
    0.03 * Math.sin(7 * theta + p(2)) +
    0.018 * Math.sin(13 * theta + p(3)) +
    0.01 * Math.sin(23 * theta + p(4))
  );
}

/**
 * Baked contact-AO brightness on the FLOOR at radius `r`: full brightness in
 * the open, easing down to `KERB_AO_MIN` where the floor meets the kerb's inner
 * face. This is the cheap depth cue that sells the wall as a wall — a hard
 * geometric join with no darkening reads as a sticker. Pure — unit-tested.
 */
export function floorEdgeShade(r: number, boundaryRadius: number): number {
  const inward = boundaryRadius - r;
  const t = smoothstep01(inward / KERB_AO_REACH);
  return KERB_AO_MIN + (1 - KERB_AO_MIN) * t;
}

/**
 * Radii of the floor's concentric rings. Uniform across the open field (where
 * everything is flat and the pixels come from the textures) and refined over
 * the last `KERB_AO_REACH` units so the baked edge-AO ramp is smooth rather
 * than a visible facet. Pure — unit-tested.
 */
export function floorRingRadii(boundaryRadius: number): number[] {
  const inner = Math.max(0, boundaryRadius - KERB_AO_REACH);
  const coarse = 14;
  const fine = 7;
  const radii: number[] = [];
  for (let i = 0; i <= coarse; i++) radii.push((inner * i) / coarse);
  for (let i = 1; i <= fine; i++) radii.push(inner + ((boundaryRadius - inner) * i) / fine);
  return radii;
}

/**
 * Angular segment count for a zone of the given radius. Chosen so the chord is
 * ~1.2u: the sagitta (bulge error) is then r·(1−cos(π/n)) ≈ 7mm at r = 24,
 * i.e. the rim is round to well under a pixel at the closest zoom. THIS is what
 * kills the stair-stepping — the edge is a real circle, not clipped squares.
 * Pure — unit-tested.
 */
export function ringSegments(boundaryRadius: number): number {
  const target = Math.round((2 * Math.PI * boundaryRadius) / 1.2);
  return Math.min(192, Math.max(48, target + (target % 2)));
}

/**
 * How many whole detail-texture repeats fit around the boundary circle. The rim
 * is UV-mapped by ARC LENGTH, and arc length does not divide evenly by the tile
 * size, so the count is rounded to an integer: without that the texture would
 * not meet itself where the sweep closes and every arena would have one seam
 * running across the kerb. The ≤1.5% scale stretch that buys is invisible.
 * Pure — unit-tested.
 */
export function rimArcRepeats(boundaryRadius: number): number {
  return Math.max(1, Math.round((2 * Math.PI * boundaryRadius) / TILE_WORLD_SIZE));
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

/**
 * Fallback flat colours, used before/without a texture set — the look the arena
 * had before this task. Keeping them means a failed texture fetch degrades to
 * the old floor instead of a black hole.
 */
const GROUND_BASE: Record<string, Color3> = {
  stone: new Color3(0.16, 0.155, 0.17),
  dirt: new Color3(0.22, 0.17, 0.12),
  wood: new Color3(0.24, 0.18, 0.12),
  grass: new Color3(0.22, 0.4, 0.19),
  sand: new Color3(0.6, 0.5, 0.32),
  tatami: new Color3(0.3, 0.31, 0.16),
  obsidian: new Color3(0.09, 0.09, 0.12),
};

/** The kerb is built masonry, not more field: darker and flatter than the floor
 *  it borders, so the boundary reads as a made edge in every arena.
 *  ⭐ GH#362 —— 這是**沒宣告 `scenery.palette` 時**的值；宣告了就用 `palette.wall`
 *  （出貨預設 `#9e99a1` 逐字等於這裡的 0.62/0.6/0.63）。 */
const KERB_TINT = new Color3(0.62, 0.6, 0.63);

/**
 * ⭐ GH#362 —— 一張場地的地板／牆壁染色。
 *
 * owner 2026-08-18：「**地板與牆壁顏色**等應該都要有該場景特色」。
 *
 * ⚠️ 它是**乘在 albedo 上的染色**，⛔ 不是換一張貼圖：貼圖組由 `groundStyle`
 * 決定（7 組，各自 4 張 PNG），而同一組 `stone` 染成冷灰藍 / 血紅 / 金綠就是
 * 三個地方 —— **沒有多下載一個位元組**。
 * `undefined` = 出貨前的樣子（地板不染、牆用 `KERB_TINT`）。
 */
export interface GroundPalette {
  /** 0..1 rgb，乘在地板 albedo 上 */
  floor: { r: number; g: number; b: number };
  /** 0..1 rgb，乘在牆／裙邊 albedo 上（取代 `KERB_TINT`） */
  wall: { r: number; g: number; b: number };
}

/**
 * Load one texture from the generated set.
 *
 * `gammaSpace` is the whole reason this helper exists. Only the albedo is
 * colour; `normal`, `orm` and `macro` carry DATA, and Babylon gamma-decodes any
 * texture with `gammaSpace` left at its default `true` — which silently bends
 * every roughness and normal value and turns the floor shiny and over-embossed
 * with no error anywhere. See groundMaterials.ts note 1.
 */
function dataTexture(url: string, scene: Scene, gammaSpace: boolean, wrap: boolean): Texture {
  const tex = new Texture(url, scene, false, false);
  tex.gammaSpace = gammaSpace;
  const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  tex.wrapU = mode;
  tex.wrapV = mode;
  return tex;
}

/** Textures shared by a zone's floor and rim materials (one fetch, two users). */
interface GroundTextures {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
  macro: Texture;
}

function loadGroundTextures(
  scene: Scene,
  set: GroundTextureSet,
  boundaryRadius: number,
): GroundTextures {
  const urls = groundTextureUrls(set);
  const scale = detailUvScale(boundaryRadius);
  const albedo = dataTexture(urls.albedo, scene, true, true);
  const normal = dataTexture(urls.normal, scene, false, true);
  const orm = dataTexture(urls.orm, scene, false, true);
  // The detail maps repeat once per TILE_WORLD_SIZE world units. Both the floor
  // (planar UVs over the bounding square) and the rim (arc-length UVs divided
  // by the same 2R) are authored so this ONE scale is correct for both — which
  // is what lets them share these texture objects.
  const aniso = effectiveQuality() === "mobile" ? albedo.anisotropicFilteringLevel : GROUND_ANISOTROPY_DESKTOP;
  for (const t of [albedo, normal, orm]) {
    t.uScale = scale;
    t.vScale = scale;
    t.anisotropicFilteringLevel = aniso;
  }
  // The macro layer is the anti-repetition half of phase 1: stretched over the
  // zone EXACTLY ONCE (uScale = vScale = 1) and clamped, never tiled.
  const macro = dataTexture(urls.macro, scene, false, false);
  return { albedo, normal, orm, macro };
}

/** Common PBR setup for both ground materials. */
function baseGroundMaterial(name: string, scene: Scene, tex: GroundTextures | null): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metallic = 0;
  mat.roughness = 0.9;
  // No IBL in this scene — the hemispheric fill plus the directional key are
  // the whole light rig (render/Lighting.ts), so direct light carries the image
  // and the environment term is left ready for an IBL rather than faked.
  mat.environmentIntensity = 0;
  mat.specularIntensity = 0.35; // damp dielectric sheen; this is dirt and stone
  mat.backFaceCulling = true;
  if (tex) {
    mat.albedoTexture = tex.albedo;
    mat.bumpTexture = tex.normal;
    // glTF ORM packing — R = occlusion, G = roughness, B = metallic. Babylon
    // reads all three off the ONE `metallicTexture` once these flags are set.
    mat.metallicTexture = tex.orm;
    mat.useAmbientOcclusionFromMetallicTextureRed = true;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.useRoughnessFromMetallicTextureAlpha = false;
  }
  return mat;
}

/**
 * Floor material: the tiling detail set PLUS the non-repeating macro layer on
 * Babylon's detail map. The macro layer is the point — see groundMaterials.ts
 * note 3 for why its channel order is R = albedo, G = normal.y, B = roughness,
 * A = normal.x and not the obvious one.
 */
function createFloorMaterial(
  scene: Scene,
  name: string,
  tex: GroundTextures | null,
  fallback: Color3,
  palette?: GroundPalette,
): PBRMaterial {
  const mat = baseGroundMaterial(name, scene, tex);
  // ⚠️ 斷言要讀**這一顆最終物件**：染色是乘進 `albedoColor` 的，⛔ 不是換掉貼圖 ——
  //    對 `albedoTexture` 寫的斷言不管有沒有染色都會過（`views/mobTint.test.ts` 檔頭）。
  const base = tex ? Color3.White() : fallback;
  mat.albedoColor = palette
    ? base.multiply(new Color3(palette.floor.r, palette.floor.g, palette.floor.b))
    : base;
  if (tex) {
    mat.detailMap.texture = tex.macro;
    mat.detailMap.diffuseBlendLevel = GROUND_BLEND_LEVELS.diffuse;
    mat.detailMap.roughnessBlendLevel = GROUND_BLEND_LEVELS.roughness;
    mat.detailMap.bumpLevel = GROUND_BLEND_LEVELS.bump;
    mat.detailMap.isEnabled = true;
  }
  return mat;
}

/**
 * Kerb/apron material. Deliberately NO detail map: the macro layer is authored
 * in disc space (its `rad` is distance from the zone centre), and the rim's UVs
 * are arc-length, so feeding it the macro would smear one arbitrary column of
 * that map around the ring. The rim gets its variation from the crest wobble
 * and the baked vertex shading instead, which cost nothing.
 */
function createRimMaterial(
  scene: Scene,
  name: string,
  tex: GroundTextures | null,
  fallback: Color3,
  palette?: GroundPalette,
): PBRMaterial {
  const mat = baseGroundMaterial(name, scene, tex);
  const wall = palette
    ? new Color3(palette.wall.r, palette.wall.g, palette.wall.b)
    : KERB_TINT;
  mat.albedoColor = (tex ? Color3.White() : fallback).multiply(wall);
  mat.roughness = 0.95;
  return mat;
}

// ---------------------------------------------------------------------------
// meshes
// ---------------------------------------------------------------------------

/** Build the walkable disc: planar UVs, flat, with edge-AO in vertex colours. */
function buildFloorMesh(scene: Scene, name: string, boundaryRadius: number): Mesh {
  const radii = floorRingRadii(boundaryRadius);
  const segments = ringSegments(boundaryRadius);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // centre vertex, then one full ring of `segments` vertices per radius
  const push = (x: number, z: number, shade: number): void => {
    positions.push(x, FLOOR_TOP_Y, z);
    normals.push(0, 1, 0);
    // planar UV over the zone's bounding square: this is what puts the macro
    // map on the disc exactly once, centred (module docstring note 3)
    uvs.push(0.5 + x / (2 * boundaryRadius), 0.5 + z / (2 * boundaryRadius));
    colors.push(shade, shade, shade, 1);
  };

  push(0, 0, floorEdgeShade(0, boundaryRadius));
  for (let ri = 1; ri < radii.length; ri++) {
    const r = radii[ri]!;
    const shade = floorEdgeShade(r, boundaryRadius);
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      push(Math.cos(theta) * r, Math.sin(theta) * r, shade);
    }
  }

  // centre fan
  for (let s = 0; s < segments; s++) {
    indices.push(0, 1 + s, 1 + ((s + 1) % segments));
  }
  // quad bands between successive rings
  for (let ri = 1; ri < radii.length - 1; ri++) {
    const a = 1 + (ri - 1) * segments;
    const b = a + segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      indices.push(a + s, b + s, b + s1);
      indices.push(a + s, b + s1, a + s1);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.useVertexColors = true;
  return mesh;
}

/** Build the kerb + apron ring swept from RIM_PROFILE. */
function buildRimMesh(scene: Scene, name: string, boundaryRadius: number, seed: number): Mesh {
  const segments = ringSegments(boundaryRadius);
  const repeats = rimArcRepeats(boundaryRadius);
  const rings = RIM_PROFILE;

  // Arc length along the profile, so the texture runs across the kerb at the
  // same world scale as it does along it (no stretch at the section corners).
  const profileV: number[] = [0];
  for (let i = 1; i < rings.length; i++) {
    const dr = rings[i]!.dr - rings[i - 1]!.dr;
    const dy = rings[i]!.y - rings[i - 1]!.y;
    profileV.push(profileV[i - 1]! + Math.hypot(dr, dy));
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // `segments + 1` columns: the last duplicates the first POSITION but carries
  // u = repeats instead of u = 0, so the texture closes cleanly on itself.
  for (let s = 0; s <= segments; s++) {
    const theta = ((s % segments) / segments) * Math.PI * 2;
    const wob = kerbCrestOffset(theta, seed);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i]!;
      const r = boundaryRadius + ring.dr;
      positions.push(cos * r, ring.y + wob * ring.wobble, sin * r);
      uvs.push(
        ((s / segments) * repeats * TILE_WORLD_SIZE) / (2 * boundaryRadius),
        profileV[i]! / (2 * boundaryRadius),
      );
      colors.push(ring.shade, ring.shade, ring.shade, 1);
    }
  }

  const n = rings.length;
  for (let s = 0; s < segments; s++) {
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i;
      const b = (s + 1) * n + i;
      indices.push(a, a + 1, b + 1);
      indices.push(a, b + 1, b);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = indices;
  // Smooth normals from the swept surface: the profile's own corners are sharp
  // enough in section that the crest still reads as an edge.
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh);
  mesh.useVertexColors = true;
  return mesh;
}

/** Everything one zone's ground owns, so the arena can tear it down. */
export interface ZoneGround {
  floor: Mesh;
  rim: Mesh;
}

/**
 * Build a zone's floor + rim under `parent`. `groundStyle` undefined means "no
 * doc yet" — the meshes are built with the flat fallback colour and NO texture
 * fetch, so the pre-match placeholder arena never downloads a set the real map
 * is about to replace.
 */
/**
 * 矩形場地的地板（GH#324）。
 *
 * ⚠️ 刻意**只畫一片平面 + 一圈裙邊**，⛔ 沒有圓形版本的同心環與波浪外緣 ——
 * 那些是為圓盤設計的（`floorRingRadii` / `kerbCrestOffset` 都吃半徑）。
 * 在矩形上硬套會讓四個角出現對不齊的弧線。graybox 階段不需要它們。
 */
function buildRectGround(
  scene: Scene,
  parent: TransformNode,
  center: { x: number; z: number },
  bounds: { halfW: number; halfD: number },
  zoneIndex: number,
  groundStyle: string | undefined,
  palette: GroundPalette | undefined,
): ZoneGround {
  const tex = groundStyle
    ? loadGroundTextures(scene, groundTextureSet(groundStyle), Math.max(bounds.halfW, bounds.halfD))
    : null;
  const fallback = GROUND_BASE[groundStyle ?? "stone"] ?? GROUND_BASE.stone!;

  // ⚠️ 用 `VertexData` 手搭四邊形，⛔ 不用 `MeshBuilder` —— 這個檔全程都是
  //    VertexData（那是刻意的：不拖進 MeshBuilder 的 side-effect import）。
  const quad = (name: string, hw: number, hd: number): Mesh => {
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = [-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd];
    vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    vd.uvs = [0, 0, hw / 4, 0, hw / 4, hd / 4, 0, hd / 4];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(m);
    return m;
  };

  const floor = quad(`zone-${zoneIndex}-floor`, bounds.halfW, bounds.halfD);
  floor.material = createFloorMaterial(scene, `zone-${zoneIndex}-floor-mat`, tex, fallback, palette);

  // 裙邊：比可玩範圍大一圈的暗色平面，讓邊界看起來有厚度而不是憑空切斷。
  const APRON = 3;
  const rim = quad(`zone-${zoneIndex}-rim`, bounds.halfW + APRON, bounds.halfD + APRON);
  rim.material = createRimMaterial(scene, `zone-${zoneIndex}-rim-mat`, tex, fallback, palette);

  for (const [mesh, y] of [
    [rim, -0.02],
    [floor, 0],
  ] as const) {
    mesh.position.set(center.x, y, center.z);
    mesh.isPickable = false;
    mesh.parent = parent;
    mesh.freezeWorldMatrix();
  }
  return { floor, rim };
}

export function buildZoneGround(
  scene: Scene,
  parent: TransformNode,
  zone: {
    center: { x: number; z: number };
    boundaryRadius: number;
    bounds?: { kind: "disc" } | { kind: "rect"; halfW: number; halfD: number };
  },
  zoneIndex: number,
  groundStyle: string | undefined,
  /** ⭐ GH#362 —— 這張場地的地板／牆壁染色。省略 = 出貨前的樣子（逐像素不變）。 */
  palette?: GroundPalette,
): ZoneGround {
  // ⭐ GH#324 —— **矩形場地要畫矩形地板。**
  //
  // ⚠️ 這不是美觀問題：矩形場地的 `boundaryRadius` 是**外接圓**（24×18 格 ⇒ 30），
  // 而地板本來畫到 `boundaryRadius` ⇒ 圓盤會從四條牆**外面**冒出來，玩家會看到
  // 走不到的地板，然後以為自己被卡住。這正是「畫面說的和碰撞說的不一樣」那一類。
  const rectBounds = zone.bounds !== undefined && zone.bounds.kind === "rect" ? zone.bounds : null;
  if (rectBounds !== null) {
    return buildRectGround(scene, parent, zone.center, rectBounds, zoneIndex, groundStyle, palette);
  }
  const r = zone.boundaryRadius;
  const tex = groundStyle ? loadGroundTextures(scene, groundTextureSet(groundStyle), r) : null;
  const fallback = GROUND_BASE[groundStyle ?? "stone"] ?? GROUND_BASE.stone!;

  const floor = buildFloorMesh(scene, `zone-${zoneIndex}-floor`, r);
  floor.material = createFloorMaterial(scene, `zone-${zoneIndex}-floor-mat`, tex, fallback, palette);
  const rim = buildRimMesh(scene, `zone-${zoneIndex}-rim`, r, zoneIndex + 1);
  rim.material = createRimMaterial(scene, `zone-${zoneIndex}-rim-mat`, tex, fallback, palette);

  for (const mesh of [floor, rim]) {
    mesh.position.set(zone.center.x, 0, zone.center.z);
    mesh.isPickable = false;
    mesh.parent = parent;
    mesh.freezeWorldMatrix();
  }
  return { floor, rim };
}

// ---------------------------------------------------------------------------
// contact shadows
// ---------------------------------------------------------------------------

/** Height above the floor at which contact blobs are drawn (z-fight clearance). */
const CONTACT_Y = FLOOR_TOP_Y + 0.012;
/** Peak darkness directly under a prop. */
const CONTACT_ALPHA = 0.5;
/** Blob radius as a multiple of the prop's footprint half-extent. Exported so
 *  the caller's "is this prop clear of the rim?" test uses the SAME spread the
 *  blob is actually drawn at — two copies of 1.2 would drift apart in a week. */
export const CONTACT_SPREAD = 1.2;

/** A prop that should darken the floor where it stands. */
export interface ContactShadow {
  x: number;
  z: number;
  /** footprint half-extent (world units) */
  radius: number;
}

/**
 * Build one alpha-graded disc and thin-instance it under every prop: props are
 * modelled sitting ON the floor with nothing under them, which from this fixed
 * overhead camera makes them look pasted onto the ground. There is no shadow
 * map in this renderer (Lighting.ts only modulates the key light), so this is
 * the entire contact cue — and at one draw call for the whole arena it is the
 * cheapest quality-per-millisecond in the scene.
 *
 * The gradient lives in VERTEX ALPHA, not a texture: no fetch, no atlas entry,
 * nothing to keep in sync, and a handful of rings is plenty for a soft blob.
 * Returns null when there is nothing to shade.
 */
export function buildContactShadows(
  scene: Scene,
  parent: TransformNode,
  props: readonly ContactShadow[],
): Mesh | null {
  if (props.length === 0) return null;

  const rings = [0, 0.32, 0.58, 0.8, 1];
  const segments = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const alphaAt = (t: number): number => CONTACT_ALPHA * (1 - t) * (1 - t);

  positions.push(0, 0, 0);
  colors.push(0, 0, 0, alphaAt(0));
  for (let ri = 1; ri < rings.length; ri++) {
    const t = rings[ri]!;
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(theta) * t, 0, Math.sin(theta) * t);
      colors.push(0, 0, 0, alphaAt(t));
    }
  }
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let ri = 1; ri < rings.length - 1; ri++) {
    const a = 1 + (ri - 1) * segments;
    const b = a + segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      indices.push(a + s, b + s1, b + s);
      indices.push(a + s, a + s1, b + s1);
    }
  }

  const mesh = new Mesh("contact-shadows", scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.normals = Array.from({ length: positions.length }, (_, i) => (i % 3 === 1 ? 1 : 0));
  data.applyToMesh(mesh);

  const mat = new StandardMaterial("contact-shadow-mat", scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.Black();
  // Blobs overlap where props cluster; without this they'd occlude each other
  // in the depth buffer and punch holes in one another.
  mat.disableDepthWrite = true;
  mesh.material = mat;
  mesh.useVertexColors = true;
  // Alone, this is what puts the mesh in the transparent queue —
  // `needAlphaBlendingForMesh` checks it before the material's own alpha, so no
  // fake `alpha = 0.999` is needed to trigger blending.
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.parent = parent;

  const matrices = new Float32Array(props.length * 16);
  const at = new Vector3();
  props.forEach((p, i) => {
    const s = Math.max(0.25, p.radius * CONTACT_SPREAD);
    const m = Matrix.Scaling(s, 1, s);
    m.setTranslation(at.set(p.x, CONTACT_Y, p.z));
    m.copyToArray(matrices, i * 16);
  });
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  mesh.thinInstanceRefreshBoundingInfo();
  // The blobs are scattered across the whole arena; one bounding box around all
  // of them fails frustum culling badly, so skip the test rather than flicker.
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}
