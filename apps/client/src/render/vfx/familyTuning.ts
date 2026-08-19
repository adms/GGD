/**
 * EVIDENCE + TUNING → the doc key an ability actually plays.
 *
 * FOUR layers, resolved here and nowhere else:
 *   1. `w3xFamilyArt.ts`  — what the ORIGINAL MAP proves (family, and the map's
 *                           own scale/tint/flyHeight/anchor for that call site)
 *   2. `bindings.ts`      — the ability's element, classified from its Chinese
 *                           NAME. The colour half of the look, and the ONLY
 *                           layer for the ~390 abilities the import proves
 *                           nothing about. It stays; it is the fallback.
 *   3. `ownerFamilyArt.ts` — ⭐ GH#431, owner 的**設計覆寫**（出貨預設）
 *   4. `config.vfx-families@1` — the console's live overrides on top of all.
 *
 * PRECEDENCE, stated once: the map's own tint beats the name-classified
 * element; the console beats the map. That order is deliberate — the map is
 * evidence and the name is a guess, but the owner is the owner.
 *
 * ⭐ **GH#431 把第 3 層插在證據與後台之間**，逐欄套用（`?? ?? ??` 那三行）：
 * **後台 > owner 設計 > 證據 > 家族預設**。為什麼設計層贏過證據 —— 第〇·六守則：
 * owner 的新版說明是第 1 層，w3a 原始設定是第 5 層，⛔ GGD 是重製不是移植。
 * 為什麼後台仍然贏過設計層 —— 那也是 owner，只是他**當下**的手；設計層是
 * **出貨預設**，而那正是 #431 說「後台 overlay 活得下來，但不會變成出貨預設」
 * 的那半個洞。
 *
 * ⛔ 覆寫**沒有**改寫 `w3xFamilyArtRows()`：證據那張表逐位不動，所以
 * `w3xFamilyArt.test.ts` 的反捏造守衛與 `generateFamilyContent` 寫進
 * `config.vfx-families@1.abilities[]` 的鏡像**都不必放寬**。
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
import type { VfxGroundDecal } from "@ggd/shared/content/schema/vfx";
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
import { w3xFamilyArtRows, type W3xFamilyArtRow } from "./w3xFamilyArt";
import { ownerFamilyArtFor, ownerFamilyArtRows, type VfxOwnerBinding } from "./ownerFamilyArt";
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
  /**
   * #205 —— the console's PER-ABILITY opacity override, or undefined.
   *
   * The FAMILY-level `alpha`/`timeScale` are already baked into the minted
   * `fx.fam.*` doc by `buildFamilyDocTuned`. The per-ability ones were not read
   * at all until now, so `config.vfx-families@1.abilities.<id>.alpha` was a
   * knob the console offered, validated, stored — and nobody downstream ever
   * looked at (故障 ②), while both the console hint and the schema comment
   * promised 「單支技能那一格覆寫它」. Surfaced here and applied at play time by
   * `VfxSystem.playCastVfx` through the SAME `applyArtParams` the layer stack
   * uses, so there is one multiplication, not two.
   *
   * Absent = the operator said nothing → the doc is played untouched (object
   * identity, so the pool key and the memoised front-load are unchanged).
   */
  readonly alpha?: number;
  /** #205 —— the console's per-ability lifetime multiplier, same story as `alpha`. */
  readonly timeScale?: number;
  /** WC3 attachment string, or undefined */
  readonly anchor?: string;
  /**
   * GH#439 —— 這一族在地上留下哪一種痕跡，或 undefined（＝操作者沒設 ⇒ 下游
   * 走 `DEFAULT_VFX_GROUND_DECAL`，也就是這一版落地之前每一支技能的焦痕）。
   *
   * ⚠️ 它讀的是 **`doc.families[family]`**，⛔ 不是 `resolvePrototype()` ——
   * 那一支把後台的覆寫折進 `W3X_ART_FAMILIES` 的內建原型，而內建原型表沒有這
   * 一格（21 列都要補一個預設才有），而這裡 ABSENT 本來就有意義。
   */
  readonly groundDecal?: VfxGroundDecal;
  /** the evidence row this came from (absent when the console invented it) */
  readonly evidence?: W3xFamilyArtRow;
  /**
   * GH#431 —— owner 的設計覆寫，如果這一支有的話。
   *
   * ⭐ 它與 `evidence` **同時**出現才是常態（覆寫蓋在證據上，證據原封保留），
   * 所以報表看得到「本來是什麼、現在是什麼、為什麼」三件事。
   */
  readonly design?: VfxOwnerBinding;
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
  const evidence: W3xFamilyArtRow | undefined = w3xFamilyArtRows()[abilityId];
  // ⭐ GH#431 —— owner 的設計覆寫，蓋在證據上、被後台蓋。⛔ 它不改寫證據。
  const design = ownerFamilyArtFor(abilityId);
  const override = doc?.abilities?.[abilityId];
  const family = (override?.family ?? design?.family ?? evidence?.family) as W3xArtFamily | undefined;
  if (!family || !W3X_ART_FAMILIES[family]) return undefined;
  if (isDisabled(abilityId, family, doc)) return undefined;

  const proto = resolvePrototype(family, doc);
  const mapping = resolveScaleMapping(doc);

  // SIZE. The map's own `usca` for this call site, compressed; absent means the
  // map never stated one, so the family default stands alone (NOT 1.0 × the
  // family default — those are the same number here, but the distinction is
  // why `w3xScale` is optional rather than defaulted to 1 in the table).
  const w3xScale = override?.w3xScale ?? design?.scale ?? evidence?.scale;
  const docScale =
    proto.scale *
    (w3xScale === undefined ? SIZE_SCALE[classifiedSize(abilityId) ?? "md"] : w3xScaleToDoc(w3xScale, mapping));
  const scale = quantizeScale(docScale);

  // COLOUR. Map tint > name-classified element > family default.
  const tint = override?.tint ?? design?.tint ?? evidence?.tint;
  const colour: FamilyColour = tint
    ? { kind: "w3x", rgb255: [tint[0], tint[1], tint[2]] }
    : { kind: "element", element: classifiedElement(abilityId) ?? proto.element };

  const flyHeight = override?.flyHeight ?? design?.flyHeight ?? evidence?.flyHeight;
  const heightY = familyHeightY(family, flyHeight) + (proto.heightY - W3X_ART_FAMILIES[family].heightY);

  return {
    abilityId,
    family,
    vfxKey: familyVfxKey(family, colour, scale),
    colour,
    docScale: scale,
    heightY: Math.round(heightY * 1000) / 1000,
    // #205 —— per-ability α / 時間倍率. ONLY the console's override: the family
    // baseline is already inside the minted doc, so reading the family value
    // here too would apply it twice.
    ...(override?.alpha !== undefined ? { alpha: override.alpha } : {}),
    ...(override?.timeScale !== undefined ? { timeScale: override.timeScale } : {}),
    ...(override?.anchor ?? design?.anchor ?? evidence?.anchor
      ? { anchor: override?.anchor ?? design?.anchor ?? evidence?.anchor }
      : {}),
    // GH#439 —— 家族層的地面痕跡。⛔ 沒設就不寫（ABSENT ≠ "scorch"：兩者今天
    // 畫出來一樣，但只有 ABSENT 表示「操作者沒碰過」，而那是 dirty 判斷的依據）。
    ...(doc?.families?.[family]?.groundDecal !== undefined
      ? { groundDecal: doc.families[family].groundDecal }
      : {}),
    ...(evidence ? { evidence } : {}),
    ...(design ? { design } : {}),
  };
}

/**
 * Resolve EVERY ability the evidence table covers (plus any the console added).
 * This is what the doc generator enumerates and what the coverage guards count,
 * so "which docs must exist" and "which docs are shipped" come from one
 * function rather than from two lists that can drift.
 */
export function resolveAllFamilyArt(doc: FamilyTuningDoc): ResolvedFamilyArt[] {
  const ids = new Set<string>(Object.keys(w3xFamilyArtRows()));
  // GH#431 —— owner 可以把一支**原作證明不了任何東西**的技能綁上家族原型。
  // ⛔ 少了這一行，那種列就不會出現在「哪些 fx.fam 文件必須存在」裡 ⇒ 產生器
  // 不會烘它、`familyArtCoverage` 不會要求它，而它在遊戲裡靜靜地掉回替身（故障②）。
  for (const id of Object.keys(ownerFamilyArtRows())) ids.add(id);
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

// ---------------------------------------------------------------------------
// THE BAKED SET — which `fx.fam.*` docs actually exist as FILES
// ---------------------------------------------------------------------------

/**
 * ⚠️ THE TRAP THIS SECTION EXISTS FOR (measured, GH#230 L2).
 *
 * `fx.fam.*` docs are STATIC content files, generated once by
 * `generateFamilyContent.ts` and keyed by (family, colour, quantised scale).
 * The runtime does NOT rebuild them per cast — it resolves a KEY and hands it
 * to `ContentDb.vfxFor`. So any console knob that moves the KEY
 * (`families.*.scale`, `families.*.element`, per-ability `tint` / `w3xScale`)
 * used to compute a key with no file behind it:
 *
 *     vfxFor(key) → null → playCastVfx's doc set is empty → rung 1 refuses
 *     → rung 3 → the generic `fx.prim.*` stand-in.
 *
 * i.e. an operator who nudged the shockwave ring up one notch watched the
 * FAMILY ART OF 91 ABILITIES VANISH. Measured: `families.shockwaveRing.scale`
 * 1 → 1.3 makes all 91 resolved keys miss the 78 baked files.
 *
 * `w3xAbilityArt.ts` fixes that in two layers — it MINTS the tuned docs into
 * the live registry (so the knob really applies), and when the registry cannot
 * answer it snaps to the nearest BAKED doc through the functions below, so the
 * effect degrades to "not tuned yet" instead of to "gone".
 *
 * WHY THIS IS ALLOWED TO BE COMPUTED RATHER THAN READ FROM DISK: the baked set
 * is BY CONSTRUCTION `resolveAllFamilyArt(null)` — the generator writes exactly
 * those files and sweeps every orphan. `familyArtCoverage.test.ts` ("the shipped
 * fx.fam.* doc set is exactly what the resolver asks for") pins that equality
 * against `readdirSync(content/vfx)`, and `familyTuningDegrade.test.ts` pins
 * `bakedFamilyKeys()` itself against the same directory listing.
 */
interface BakedVariant {
  readonly key: string;
  /** `colourSlug` of the baked doc — the middle segment of the key */
  readonly colour: string;
  /** the quantised doc-space scale the file was baked at */
  readonly scale: number;
}

let bakedIndex: { keys: Set<string>; byFamily: Map<W3xArtFamily, BakedVariant[]> } | null = null;

function bakedCatalogue(): { keys: Set<string>; byFamily: Map<W3xArtFamily, BakedVariant[]> } {
  if (bakedIndex) return bakedIndex;
  const keys = new Set<string>();
  const byFamily = new Map<W3xArtFamily, BakedVariant[]>();
  // `null` tuning ON PURPOSE: the files on disk were generated with no console
  // doc, so the untuned resolve is the only thing that describes them.
  for (const r of resolveAllFamilyArt(null)) {
    if (keys.has(r.vfxKey)) continue;
    keys.add(r.vfxKey);
    const list = byFamily.get(r.family) ?? [];
    list.push({ key: r.vfxKey, colour: colourSlug(r.colour), scale: r.docScale });
    byFamily.set(r.family, list);
  }
  for (const list of byFamily.values()) list.sort((a, b) => a.key.localeCompare(b.key));
  bakedIndex = { keys, byFamily };
  return bakedIndex;
}

/** Every `fx.fam.*` key that has a FILE behind it (= the shipped 78). */
export function bakedFamilyKeys(): ReadonlySet<string> {
  return bakedCatalogue().keys;
}

/**
 * The baked doc closest to a (possibly untuned-and-unbaked) request, or
 * undefined when the family has nothing baked at all (`blood` / `starfall`
 * carry no abilities, so they have no files).
 *
 * ORDER, and why: exact key first; then the SAME COLOUR at the nearest scale —
 * a recoloured ring reads as the wrong ability, a slightly-wrong-sized one only
 * reads as un-tuned; then any colour of the family at the nearest scale, which
 * is still that family's silhouette. Ties break on the key so the choice is
 * deterministic (this feeds a cached row; a coin-flip would make two clients
 * disagree).
 */
export function nearestBakedFamilyKey(
  family: W3xArtFamily,
  colour: FamilyColour,
  scale: number,
): string | undefined {
  const cat = bakedCatalogue();
  const exact = familyVfxKey(family, colour, scale);
  if (cat.keys.has(exact)) return exact;
  const variants = cat.byFamily.get(family);
  if (!variants || variants.length === 0) return undefined;
  const slug = colourSlug(colour);
  const sameColour = variants.filter((v) => v.colour === slug);
  const pool = sameColour.length > 0 ? sameColour : variants;
  let best = pool[0]!;
  for (const v of pool) {
    const d = Math.abs(v.scale - scale);
    const bd = Math.abs(best.scale - scale);
    if (d < bd || (d === bd && v.key < best.key)) best = v;
  }
  return best.key;
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
  // GH#431 —— 設計覆寫要在報表上**看得出來**，否則「這一支為什麼跟原作不一樣」
  // 只剩下人的記憶。⛔ 覆寫在時它排在證據前面，因為它才是真正決定的那一層。
  const src = r.design
    ? `owner-design(${r.design.why.slice(0, 24)})`
    : r.evidence
      ? `${r.evidence.provenance}/${r.evidence.via}`
      : "console";
  return `${proto.label} · ${colourSlug(r.colour)} · ×${r.docScale} ← ${src}`;
}
