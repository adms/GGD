/**
 * modelTint — apply the w3x VERTEX COLOUR (tint) + alpha port (task #49) to a
 * loaded champion model. See `docs/todo/vertex-tint.md` for the content half.
 *
 * THE CONTRACT (mirrors `zTintRgb` / `zAlpha` in shared/content/schema/common):
 *   • `tint` is a per-material **MULTIPLY** on the diffuse/albedo colour —
 *     `out.rgb = base.rgb * tint` — never an overlay, an emissive add, or a
 *     replacement colour. `[1,1,1]` is the identity and an ABSENT tint means
 *     the same thing, so an untinted champion's materials are never touched.
 *   • `alpha` is OPACITY: `1`/absent = opaque, `<1` = translucent (we put the
 *     material into alpha blending and turn on `separateCullingPass` so a
 *     translucent model doesn't self-overlap through its own back faces).
 *
 * WHY THIS IS A STANDALONE MODULE (not a ChampionView method): `ChampionView`
 * and `GameApp` were owned by #43 (render interpolation) while this landed, so
 * the tint is applied from the OUTSIDE through the two public seams the view
 * already exposes (`view.root`, `view.hasGlb`) — neither file was touched.
 * That turned out to be the better shape anyway: it only needs a TransformNode,
 * so it works just as well for a store/champ-select preview.
 *
 * MATERIAL OWNERSHIP — the reason every tinted material is CLONED.
 * `AssetManager` caches one AssetContainer per .glb and every champion
 * instantiates from it with `cloneMaterials: false`, so N champions on the
 * same mesh SHARE one material object. Writing the tint straight onto it would
 * repaint every champion sharing the model — the exact many-to-one bug that
 * kept the tint off `model@1` in the first place. So we clone, tag the clone
 * with its source, and `releaseModelTint` puts the original back before the
 * view is disposed: material lifetime ends up EXACTLY as it was before #49.
 *
 * COMPOSES WITH THE HIT FLASH (#3): the flash is a per-mesh RENDER OVERLAY
 * (`mesh.renderOverlay` / `overlayColor`), a separate pass drawn on top of the
 * shaded pixel — it never writes the material. Tint and flash therefore live
 * on different channels and cannot overwrite each other; the flash stays fully
 * visible on a near-black model like Berserker.
 */
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Material } from "@babylonjs/core/Materials/material";
import type { Color3 } from "@babylonjs/core/Maths/math.color";

/** `[r,g,b]` multiply + opacity, both optional, both already 0..1. */
export interface ModelTint {
  tint?: readonly [number, number, number];
  alpha?: number;
}

/** The identity tint. Absent means the same thing; we never write it. */
export const NEUTRAL_TINT: readonly [number, number, number] = [1, 1, 1];

/** Below this the multiply is a no-op in 8-bit output (0.5/255). */
const TINT_EPSILON = 0.002;

/**
 * Meshes under a champion root that must NEVER be tinted. The team-colour
 * selection ring and the blob shadow are TEAM/UI reads, not champion art —
 * darkening a team ring would break the single most important readability cue
 * on the field. `ChampionView` names them `champ-<id>-teamring` /
 * `champ-<id>-shadow`; the regression test below pins that coupling so a
 * rename fails loudly instead of silently repainting the ring.
 *
 * `-teamband` (task #231) joins them for exactly the same reason, one mesh
 * over. Once the generated voxel skin paints the torso and the legs, that thin
 * chest stripe is the only FLAT team colour left ON THE BODY, and a dark
 * champion tint (Berserker multiplies by 0.3137) would crush it to unreadable.
 */
export const UNTINTED_MESH_SUFFIXES: readonly string[] = ["-teamring", "-shadow", "-teamband"];

/** Tag left on every clone we install, so apply is idempotent and reversible. */
interface TintTag {
  /** the material this clone replaced — restored verbatim on release */
  src: Material;
  /** source colour BEFORE the multiply, so re-tinting never compounds */
  base: [number, number, number] | null;
  baseAlpha: number;
  /** source transparency settings, restored when a later tint is opaque */
  baseMode: number | null | undefined;
  baseSeparateCulling: boolean;
  /** signature of the currently applied tint (skip when unchanged) */
  sig: string;
}

interface TintMetadata {
  ggdTint?: TintTag;
}

/** Duck-typed colour slot: Standard=diffuse, PBR=albedo, PBR-MR=base. */
interface ColoredMaterial {
  diffuseColor?: Color3;
  albedoColor?: Color3;
  baseColor?: Color3;
  subMaterials?: Material[];
  transparencyMode?: number | null;
}

/**
 * The colour the tint multiplies, plus which colour SPACE that slot lives in.
 *
 * This distinction is the difference between Berserker reading 黑 and reading
 * "slightly dim". WC3 multiplies the vertex colour into the DISPLAYED (gamma)
 * texel: `out_srgb = tex_srgb * tint`. Babylon's two material families do not
 * agree on the space:
 *   • StandardMaterial is a gamma-space pipeline — `diffuseColor` multiplies
 *     the stored texel and the result is written out as-is. Same as WC3, so
 *     the ported value is used verbatim.
 *   • PBRMaterial (what the glTF loader builds for every .glb, WC3 overlay
 *     models included) is a LINEAR pipeline — the albedo texture is
 *     sRGB-decoded, `albedoColor` multiplies in linear light, and the frame is
 *     gamma-encoded on the way out. A raw multiply by `t` therefore renders at
 *     `t^(1/2.2)` of the original brightness: measured live on Berserker's
 *     Hapm.glb, `0.3137` came out at ~0.6 of stock — visibly dim but nowhere
 *     near the map's near-black. Pre-raising the factor to `t^2.2` restores
 *     `out_srgb = tex_srgb * t`, which is what the content ledger's numbers
 *     mean (measured back at 0.32 of stock after this correction).
 */
function colorSlot(mat: Material): { color: Color3; linear: boolean } | null {
  const m = mat as unknown as ColoredMaterial;
  const pbr = m.albedoColor ?? m.baseColor;
  if (pbr) return { color: pbr, linear: true };
  return m.diffuseColor ? { color: m.diffuseColor, linear: false } : null;
}

/** Display gamma. `tint^GAMMA` converts a WC3 gamma-space multiply to linear. */
const DISPLAY_GAMMA = 2.2;

/** A tint that changes nothing: absent, or `[1,1,1]` within 8-bit precision. */
export function isNeutralTint(tint?: readonly [number, number, number] | null): boolean {
  if (!tint) return true;
  return tint.every((c) => Math.abs(c - 1) < TINT_EPSILON);
}

/** Opacity that changes nothing: absent, or `1` within 8-bit precision. */
export function isOpaque(alpha?: number | null): boolean {
  return alpha === undefined || alpha === null || alpha >= 1 - TINT_EPSILON;
}

/** True when applying this would be a no-op (both channels are the identity). */
export function isIdentityTint(t?: ModelTint | null): boolean {
  return !t || (isNeutralTint(t.tint) && isOpaque(t.alpha));
}

/**
 * Champion tint + the equipped skin's OVERRIDE, resolved field by field: a
 * skin swaps the mesh, so it must be able to restate the colour (or clear a
 * tinted champion back to neutral with an explicit `[1,1,1]`). Returns null
 * when the result is the identity, so callers can skip all Babylon work.
 */
export function resolveModelTint(
  champion?: ModelTint | null,
  skin?: ModelTint | null,
): ModelTint | null {
  const tint = skin?.tint ?? champion?.tint;
  const alpha = skin?.alpha ?? champion?.alpha;
  const out: ModelTint = {};
  if (!isNeutralTint(tint)) out.tint = tint;
  if (!isOpaque(alpha)) out.alpha = alpha;
  return isIdentityTint(out) ? null : out;
}

function signature(t: ModelTint): string {
  const c = t.tint ?? NEUTRAL_TINT;
  return `${c[0]},${c[1]},${c[2]},${t.alpha ?? 1}`;
}

function tagOf(mat: Material): TintTag | undefined {
  return (mat.metadata as TintMetadata | null | undefined)?.ggdTint;
}

/** Write the multiply + opacity onto one already-cloned material. */
function paint(mat: Material, tag: TintTag, t: ModelTint): void {
  const slot = colorSlot(mat);
  if (slot && tag.base) {
    const c = t.tint ?? NEUTRAL_TINT;
    const g = slot.linear ? DISPLAY_GAMMA : 1; // see `colorSlot`
    slot.color.r = tag.base[0] * Math.pow(c[0], g);
    slot.color.g = tag.base[1] * Math.pow(c[1], g);
    slot.color.b = tag.base[2] * Math.pow(c[2], g);
  }
  mat.alpha = tag.baseAlpha * (t.alpha ?? 1);
  if (mat.alpha < 1 - TINT_EPSILON) {
    // PBR ignores `alpha` unless the transparency mode says so; Standard
    // derives needAlphaBlending() from alpha < 1 on its own but setting the
    // mode is harmless there. separateCullingPass draws back faces first so a
    // translucent model reads as one solid shape instead of an X-ray tangle.
    (mat as unknown as ColoredMaterial).transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.separateCullingPass = true;
  } else {
    // a later opaque tint must not leave the model in the blend pass
    (mat as unknown as ColoredMaterial).transparencyMode = tag.baseMode ?? null;
    mat.separateCullingPass = tag.baseSeparateCulling;
  }
}

/**
 * Apply `t` to every tintable mesh under `root`. Idempotent: materials already
 * carrying this exact tint are skipped, and re-applying a DIFFERENT tint
 * recomputes from the remembered source colour instead of compounding. Safe to
 * call again after an async .glb swap — only the newly-arrived meshes do work.
 *
 * @returns how many meshes were (re)painted this call.
 */
export function applyModelTint(
  root: TransformNode,
  t: ModelTint | null | undefined,
  opts: { skipSuffixes?: readonly string[] } = {},
): number {
  if (isIdentityTint(t)) return 0;
  const tint = t as ModelTint;
  const sig = signature(tint);
  const skip = opts.skipSuffixes ?? UNTINTED_MESH_SUFFIXES;
  // one clone per SOURCE material, so meshes sharing a material inside this
  // one model keep sharing it (a champion glb is 1-5 materials, not 1 per mesh)
  const clones = new Map<Material, Material>();
  let painted = 0;

  for (const mesh of root.getChildMeshes(false)) {
    if (skip.some((s) => mesh.name.endsWith(s))) continue;
    const current = mesh.material;
    if (!current) continue;

    const existing = tagOf(current);
    if (existing) {
      if (existing.sig === sig) continue; // already wearing this exact tint
      existing.sig = sig;
      for (const m of withSubMaterials(current)) {
        const tag = tagOf(m);
        if (tag) paint(m, tag, tint);
      }
      painted++;
      continue;
    }

    let clone = clones.get(current);
    if (!clone) {
      const fresh = cloneTinted(current, sig, tint);
      if (!fresh) continue; // unclonable material — leave it alone
      clone = fresh;
      clones.set(current, fresh);
    }
    mesh.material = clone;
    painted++;
  }
  return painted;
}

function withSubMaterials(mat: Material): Material[] {
  const subs = (mat as unknown as ColoredMaterial).subMaterials;
  return subs && subs.length > 0 ? [mat, ...subs.filter((s): s is Material => !!s)] : [mat];
}

function cloneTinted(src: Material, sig: string, t: ModelTint): Material | null {
  // `true` = clone children for a MultiMaterial; plain materials ignore it.
  const clone = (src.clone as (name: string, cloneChildren?: boolean) => Material | null)(
    `${src.name}#tint`,
    true,
  );
  if (!clone) return null;
  for (const m of withSubMaterials(clone)) {
    const slot = colorSlot(m);
    const tag: TintTag = {
      src, // only the outer tag is ever read on release
      base: slot ? [slot.color.r, slot.color.g, slot.color.b] : null,
      baseAlpha: m.alpha,
      baseMode: (m as unknown as ColoredMaterial).transparencyMode,
      baseSeparateCulling: m.separateCullingPass,
      sig,
    };
    // fresh object: `clone()` may hand us the SOURCE's metadata by reference
    const meta: TintMetadata & Record<string, unknown> = {
      ...((m.metadata as Record<string, unknown> | null) ?? {}),
      ggdTint: tag,
    };
    m.metadata = meta;
    paint(m, tag, t);
  }
  return clone;
}

/**
 * Undo `applyModelTint`: put every original material back and dispose the
 * clones we installed. MUST run before the view's own dispose so the material
 * lifetime the rest of the engine sees is byte-for-byte what it was pre-#49 —
 * `ChampionView.dispose()` deliberately leaves materials alone (they belong to
 * the AssetManager cache, not the view), so a clone nobody restores is a leak
 * that also strands the cached material swapped out of its meshes.
 *
 * @returns how many meshes were restored.
 */
export function releaseModelTint(root: TransformNode): number {
  const clones = new Set<Material>();
  let restored = 0;
  // PASS 1 — restore every mesh first. `Material.dispose()` unbinds itself
  // from every mesh still holding it (nulling their `material`), so disposing
  // mid-walk would strand the other meshes sharing that clone.
  for (const mesh of root.getChildMeshes(false)) {
    const current = mesh.material;
    if (!current) continue;
    const tag = tagOf(current);
    if (!tag) continue;
    mesh.material = tag.src;
    clones.add(current);
    restored++;
  }
  // PASS 2 — drop the clones. Textures are shared with the source, so they are
  // never force-disposed; a MultiMaterial's cloned children are ours too and
  // Material.dispose does not recurse into subMaterials.
  for (const clone of clones) {
    for (const m of withSubMaterials(clone)) m.dispose(false, false);
  }
  return restored;
}

/** Meshes under `root` currently wearing a tint clone (test/debug seam). */
export function tintedMeshes(root: TransformNode): AbstractMesh[] {
  return root.getChildMeshes(false).filter((m) => m.material && tagOf(m.material));
}
