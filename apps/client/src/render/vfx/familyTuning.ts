/**
 * EVIDENCE + TUNING → the doc key an ability actually plays.
 *
 * Three layers, resolved here and nowhere else:
 *   1. `w3xFamilyArt.ts`  — what the ORIGINAL MAP proves (family, and the map's
 *                           own scale/tint/flyHeight/anchor for that call site)
 *   2. `bindings.ts`      — the ability's element, classified from its Chinese
 *                           NAME. The colour half of the look, and the ONLY
 *                           layer for the ~390 abilities the import proves
 *                           nothing about. It stays; it is the fallback.
 *   3. `config.vfx-families@1` — the console's live overrides on top of both.
 *
 * PRECEDENCE, stated once: the map's own tint beats the name-classified
 * element; the console beats the map. That order is deliberate — the map is
 * evidence and the name is a guess, but the owner is the owner.
 *
 * WHAT COMES OUT is a `fx.fam.*` doc key plus the SPATIAL bits a `VfxDoc`
 * cannot carry (`heightY`, `anchor`). The key resolves through
 * `ContentDb.vfxFor` exactly like every other vfx key — no new runtime path,
 * and the coverage guards can therefore assert against `vfxFor` output rather
 * than against a doc FIELD (failure ⑦: scanning a property instead of the
 * behaviour).
 *
 * PURE. No content reads, no `@babylonjs/*`; the tuning doc is handed in.
 */
import type { ConfigVfxFamiliesDoc, VfxFamilyTuning } from "@ggd/shared/content";
import {
  DEFAULT_SCALE_MAPPING,
  W3X_ART_FAMILIES,
  W3X_ART_FAMILY_IDS,
  buildFamilyDoc,
  buildFamilyDocWith,
  colourSlug,
  familyHeightY,
  familyVfxKey,
  quantizeScale,
  w3xScaleToDoc,
  type FamilyColour,
  type ScaleMapping,
  type W3xArtFamily,
  type W3xFamilyPrototype,
} from "./w3xArtFamilies";
import { W3X_FAMILY_ART, type W3xFamilyArtRow } from "./w3xFamilyArt";
import { abilityVfxKeys, rosterBindings, SIZE_SCALE, type Size } from "./bindings";
import { elementFromVfxKey, type Element } from "./elements";
import type { VfxDoc } from "@ggd/shared/content";

/** The console doc, or null when none is authored (shipped defaults apply). */
export type FamilyTuningDoc = ConfigVfxFamiliesDoc | null | undefined;

/**
 * The scale compression, from the doc when present. `min`/`max` are treated as
 * an UNORDERED interval: an operator who types them backwards gets a working
 * (if odd) range instead of every cast in the game losing its art. See
 * `vfxFamiliesScaleOrdered` in the shared schema for why this is not a Zod
 * refinement.
 */
export function resolveScaleMapping(doc: FamilyTuningDoc): ScaleMapping {
  if (!doc) return DEFAULT_SCALE_MAPPING;
  const a = doc.scaleMin;
  const b = doc.scaleMax;
  return { gain: doc.scaleGain, min: Math.min(a, b), max: Math.max(a, b) };
}

/** A family's prototype with the console's overrides folded in. */
export function resolvePrototype(family: W3xArtFamily, doc: FamilyTuningDoc): W3xFamilyPrototype {
  const base = W3X_ART_FAMILIES[family];
  const t: VfxFamilyTuning | undefined = doc?.families?.[family];
  if (!t) return base;
  return {
    ...base,
    primitive: t.primitive,
    element: t.element,
    scale: t.scale,
    alpha: t.alpha,
    timeScale: t.timeScale,
    heightY: t.heightY,
  };
}

/** What an ability ends up playing, once all three layers have spoken. */
export interface ResolvedFamilyArt {
  readonly abilityId: string;
  readonly family: W3xArtFamily;
  /** the `fx.fam.*` key — feed it to `ContentDb.vfxFor` */
  readonly vfxKey: string;
  readonly colour: FamilyColour;
  /** doc-space size multiplier this row resolved to, quantised to 0.05 */
  readonly docScale: number;
  /** world-y to play at */
  readonly heightY: number;
  /** WC3 attachment string, or undefined */
  readonly anchor?: string;
  /** the evidence row this came from (absent when the console invented it) */
  readonly evidence?: W3xFamilyArtRow;
}

/** memoized `abilityVfxKeys()` — the name classification, built once. */
let primitiveKeys: Record<string, string> | null = null;

/** The ELEMENT `bindings.ts` classified this ability as, or null. */
export function classifiedElement(abilityId: string): Element | null {
  primitiveKeys ??= abilityVfxKeys();
  return elementFromVfxKey(primitiveKeys[abilityId]);
}

/** memoized slot-size tier from `bindings.ts` (R/EX read large, by design). */
let sizeByAbility: Map<string, Size> | null = null;

/**
 * The SIZE TIER `bindings.ts` gave this ability from its SLOT — ultimates and
 * EX read big, quick utility reads small (task #79's rule, unchanged).
 *
 * This is the size fallback, NOT an override: it only applies when the map
 * stated no `usca` for the call site. It has to exist, and here is the measured
 * reason. `warstompcaster` carries 5 distinct authored scales and
 * `thunderclapcaster` 3 — but NONE of them is attributable to a specific
 * ability (the numbers live on dummy units the JASS spawns, not on the art
 * slot), so all 91 shockwaveRing abilities resolve with `scale: undefined`.
 * Without a fallback every one of them would be the same size, which is
 * precisely the 「哪招是哪招」 flatness #79 was fixed to remove.
 */
export function classifiedSize(abilityId: string): Size | null {
  if (!sizeByAbility) {
    sizeByAbility = new Map();
    for (const b of rosterBindings()) sizeByAbility.set(b.abilityId, b.size);
  }
  return sizeByAbility.get(abilityId) ?? null;
}

function isDisabled(abilityId: string, family: W3xArtFamily, doc: FamilyTuningDoc): boolean {
  if (!doc) return false;
  if (!doc.enabled) return true;
  if (doc.families?.[family]?.enabled === false) return true;
  return doc.abilities?.[abilityId]?.enabled === false;
}

/**
 * Resolve ONE ability. Returns undefined when the ability has no evidence row
 * and the console adds none, or when any of the three enable switches is off —
 * in every one of those cases the caller keeps the ability's own `vfxKey`,
 * which is the `fx.prim.*` baseline. There is no silent third state.
 */
export function resolveFamilyArt(
  abilityId: string | undefined,
  doc: FamilyTuningDoc,
): ResolvedFamilyArt | undefined {
  if (!abilityId) return undefined;
  const evidence: W3xFamilyArtRow | undefined = W3X_FAMILY_ART[abilityId];
  const override = doc?.abilities?.[abilityId];
  const family = (override?.family ?? evidence?.family) as W3xArtFamily | undefined;
  if (!family || !W3X_ART_FAMILIES[family]) return undefined;
  if (isDisabled(abilityId, family, doc)) return undefined;

  const proto = resolvePrototype(family, doc);
  const mapping = resolveScaleMapping(doc);

  // SIZE. The map's own `usca` for this call site, compressed; absent means the
  // map never stated one, so the family default stands alone (NOT 1.0 × the
  // family default — those are the same number here, but the distinction is
  // why `w3xScale` is optional rather than defaulted to 1 in the table).
  const w3xScale = override?.w3xScale ?? evidence?.scale;
  const docScale =
    proto.scale *
    (w3xScale === undefined ? SIZE_SCALE[classifiedSize(abilityId) ?? "md"] : w3xScaleToDoc(w3xScale, mapping));
  const scale = quantizeScale(docScale);

  // COLOUR. Map tint > name-classified element > family default.
  const tint = override?.tint ?? evidence?.tint;
  const colour: FamilyColour = tint
    ? { kind: "w3x", rgb255: [tint[0], tint[1], tint[2]] }
    : { kind: "element", element: classifiedElement(abilityId) ?? proto.element };

  const flyHeight = override?.flyHeight ?? evidence?.flyHeight;
  const heightY = familyHeightY(family, flyHeight) + (proto.heightY - W3X_ART_FAMILIES[family].heightY);

  return {
    abilityId,
    family,
    vfxKey: familyVfxKey(family, colour, scale),
    colour,
    docScale: scale,
    heightY: Math.round(heightY * 1000) / 1000,
    ...(override?.anchor ?? evidence?.anchor ? { anchor: override?.anchor ?? evidence?.anchor } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

/**
 * Resolve EVERY ability the evidence table covers (plus any the console added).
 * This is what the doc generator enumerates and what the coverage guards count,
 * so "which docs must exist" and "which docs are shipped" come from one
 * function rather than from two lists that can drift.
 */
export function resolveAllFamilyArt(doc: FamilyTuningDoc): ResolvedFamilyArt[] {
  const ids = new Set<string>(Object.keys(W3X_FAMILY_ART));
  for (const id of Object.keys(doc?.abilities ?? {})) ids.add(id);
  const out: ResolvedFamilyArt[] = [];
  for (const id of [...ids].sort()) {
    const r = resolveFamilyArt(id, doc);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Every DOC the resolved set needs, keyed by id. One family × colour × tier =
 * one doc, which is what keeps 258 abilities from meaning 258 files.
 */
export function requiredFamilyDocs(doc: FamilyTuningDoc): Map<string, VfxDoc> {
  const out = new Map<string, VfxDoc>();
  for (const r of resolveAllFamilyArt(doc)) {
    if (out.has(r.vfxKey)) continue;
    out.set(r.vfxKey, buildFamilyDocTuned(r.family, r.colour, r.docScale, doc));
  }
  return out;
}

/** `buildFamilyDoc` with the console's family overrides applied first. */
export function buildFamilyDocTuned(
  family: W3xArtFamily,
  colour: FamilyColour,
  scale: number,
  doc: FamilyTuningDoc,
): VfxDoc {
  const t = doc?.families?.[family];
  if (!t) return buildFamilyDoc(family, colour, scale);
  // Rebuild through the same path with the tuned prototype swapped in. Done by
  // temporarily composing rather than by duplicating `buildFamilyDoc`'s body:
  // two copies of the doc assembly is exactly how preview stops matching ship.
  return buildFamilyDocWith(resolvePrototype(family, doc), colour, scale, familyVfxKey(family, colour, scale));
}

/** Family → how many abilities resolve onto it (the report number). */
export function familyCoverage(doc: FamilyTuningDoc): Record<W3xArtFamily, number> {
  const out = {} as Record<W3xArtFamily, number>;
  for (const f of W3X_ART_FAMILY_IDS) out[f] = 0;
  for (const r of resolveAllFamilyArt(doc)) out[r.family] += 1;
  return out;
}

/** Human-readable one-liner for the console/report rows. */
export function describeResolved(r: ResolvedFamilyArt): string {
  const proto = W3X_ART_FAMILIES[r.family];
  const src = r.evidence ? `${r.evidence.provenance}/${r.evidence.via}` : "console";
  return `${proto.label} · ${colourSlug(r.colour)} · ×${r.docScale} ← ${src}`;
}
