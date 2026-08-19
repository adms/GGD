/**
 * vfxCensus — 特效真實引用普查 (task #230), the PURE half.
 *
 * THE QUESTION. 「真正做好是追技能真正引用的特效/粒子/球體/蝗蟲群 請你盤點所有英雄、
 * 技能清單，告訴我真實的狀況」. Binding SOME `vfxKey` is not fidelity; fidelity is
 * referencing the effect the ability ACTUALLY used in the source map. This
 * module answers that for every champion × every slot.
 *
 * WHY IT IS COMPUTED AT VIEW TIME AND NOT PUBLISHED AS A REPORT
 * ------------------------------------------------------------
 * The project's standing rule is that findings ship as live pages, never static
 * documents, because a document is only true on the day it is written. That
 * rule bites hardest HERE: the whole point of this census is to be re-read
 * after each rebind, and a baked table would go stale the moment someone edits
 * one `vfxKey`.
 *
 * So the census is a JOIN of two halves with opposite lifetimes:
 *
 *   IMMUTABLE (generated once, shipped as a sidecar)
 *     `content/assets/vfx/w3x-ability-provenance.json` — facts about the SOURCE
 *     MAP. Which `war3map.w3a` record an ability came from, which model each of
 *     its art channels really named, how the art reached it (`jass-literal` >
 *     `w3a-override` > `w3h-override` > `stock-inherited`), and what the emitter
 *     extraction produced from that model. Archaeology cannot change unless the
 *     map does; regenerate with `python3 tools/w3x-import/build_vfx_census.py`.
 *
 *   MUTABLE (read live, every time the page opens)
 *     the ability docs' CURRENT `vfxKey`, which vfx docs exist in `content/vfx`,
 *     and `w3xAbilityArtRows()` — the renderer's own promotion table. Change any of
 *     those and the page changes with no regeneration step at all.
 *
 * The status of every row is derived from the join, never stored. That is what
 * makes 「106 支閒置」 a number the owner can watch move.
 *
 * WHAT `vfxKey` CAN AND CANNOT SAY. `vfxKey` is ONE string, but a WC3 effect is
 * a SET of emitters (`frostnova` is 4, `divinering` is 20). So an ability's
 * `vfxKey` carries the family's dominant emitter and `extraVfxDocIds()` carries
 * the rest. An extraction doc therefore reaches the screen in TWO ways, and the
 * ledger below counts both — treating "not a `vfxKey`" as "unused" is exactly
 * the overstatement this census exists to correct.
 *
 * PURE: no React, no Babylon, no fetch. Everything is a function of its inputs.
 */
import { w3xAbilityArtRows, extraVfxDocIds } from "../../render/vfx/w3xAbilityArt";

// ---------------------------------------------------------------- inputs ---

/** The live half: one ability doc as the codex loaded it. */
export interface CensusAbility {
  readonly id: string;
  readonly name: string;
  readonly slot: string;
  readonly championId: string | null;
  readonly vfxKey: string | null;
}

/** The live half: one champion doc (id + the Chinese name the owner reads). */
export interface CensusChampion {
  readonly id: string;
  readonly name: string;
}

/** One art channel the map really named, from the provenance sidecar. */
export interface RealArt {
  readonly channel: string;
  readonly path: string;
  readonly stem: string;
  readonly form: string;
  readonly provenance: string;
  readonly assetStatus: string;
  readonly emitterCount: number;
}

export interface ProvenanceExtraction {
  readonly stem: string;
  readonly channel: string;
  readonly provenance: string;
  readonly fxId: string | null;
  readonly family: string;
  readonly layerDocIds: readonly string[];
  readonly emitterTotal: number;
  readonly rootAnchored: number;
}

export interface ProvenanceRow {
  readonly rawcodes: readonly string[];
  readonly joinMethod: string;
  readonly joinConfidence: string;
  readonly realArt: readonly RealArt[];
  /**
   * EVERY art channel of this ability that produced shipped emitter docs, best
   * first (fully root-anchored wins, then emitter count). Plural on purpose:
   * 菲特 23-04 雷焰聖劍 names `Lightningnova` on three channels AND `Boomnl` on
   * its buff, and the renderer promoted the former. A census that kept only the
   * top-scoring one would call that shipped promotion mis-bound.
   */
  readonly extractions?: readonly ProvenanceExtraction[];
}

/** Per-source-model renderability + who references it. */
export interface ProvenanceModel {
  readonly fxId: string | null;
  readonly layerDocIds: readonly string[];
  readonly emitterTotal: number;
  readonly rootAnchored: number;
  readonly referencedBy: readonly string[];
}

export interface ProvenanceFile {
  readonly schema: string;
  readonly abilities: Readonly<Record<string, ProvenanceRow>>;
  readonly models: Readonly<Record<string, ProvenanceModel>>;
}

// --------------------------------------------------------------- statuses --

export type CensusStatus =
  /** binds the actual extracted counterpart of its real mdx */
  | "TRUE-PORT"
  /** binds a generic while a real counterpart EXISTS and is unused */
  | "PRIMITIVE-SUBSTITUTE"
  /** binds a generic because NO extraction exists for its real mdx */
  | "PRIMITIVE-NECESSARY"
  /** still on an old off-system key (`fx.firestorm` etc.) */
  | "LEGACY-KEY"
  /** genuinely has no cast VFX — most passives. Correct, not debt. */
  | "NO-CAST"
  /** the map itself specified no effect model */
  | "NO-SOURCE"
  /** bound to an extraction that is NOT this ability's own art — a bug */
  | "MIS-BOUND";

export const STATUS_ORDER: readonly CensusStatus[] = [
  "TRUE-PORT",
  "PRIMITIVE-SUBSTITUTE",
  "PRIMITIVE-NECESSARY",
  "LEGACY-KEY",
  "NO-CAST",
  "NO-SOURCE",
  "MIS-BOUND",
];

export const STATUS_LABEL: Readonly<Record<CensusStatus, string>> = {
  "TRUE-PORT": "真實移植",
  "PRIMITIVE-SUBSTITUTE": "通用替身（原作特效已抽出）",
  "PRIMITIVE-NECESSARY": "通用替身（原作無可抽出）",
  "LEGACY-KEY": "舊制 key",
  "NO-CAST": "無施法特效",
  "NO-SOURCE": "原圖無指定",
  "MIS-BOUND": "綁錯（非本技能的美術）",
};

/**
 * WHY A GATE-PASSING SUBSTITUTE WAS STILL LEFT ALONE.
 *
 * The spec is explicit that a deliberate character-canon restyle must NOT be
 * rebound and must be listed instead. These are the rows whose extraction is
 * fully root-anchored — i.e. the renderer could play it today — and which were
 * still left on their primitive on judgement. Every other left-behind row is
 * left for the mechanical reason in `leftReason`, not for taste.
 */
export const OWNER_DECISIONS: Readonly<Record<string, string>> = {
  "godie-e002.w":
    "20-01 風王結界 — 地圖確實把 A0DZ casterArt 設成 HolyAwakening.mdx（w3a-override，6/6 root，可直接播）。" +
    "但風王結界在原作是「風」，而 HolyAwakening 正是 Saber 20-03 約束與勝利之劍 用的同一顆模型：綁下去，Saber 四招裡會有兩招長成同一團金光。" +
    "忠實度 vs 辨識度，留給擁有者決定。",
  "godie-e00l.w":
    "同上（20-01 風王結界 的 off-roster 分身 godie-e00l）。兩份文件必須一起決定，否則同一招在兩個英雄身上長得不一樣。",
};

/** Why a PRIMITIVE-SUBSTITUTE was not rebound in this pass. */
export type LeftReason =
  /** the family's emitters hang off animated model nodes — flat replay = a blob */
  | "renderer-gate"
  /** the renderer could play it; left on purpose (see OWNER_DECISIONS) */
  | "owner-decision";

// ------------------------------------------------------------------ rows ---

export interface CensusRow {
  readonly championId: string;
  readonly championName: string;
  readonly abilityId: string;
  readonly abilityName: string;
  readonly slot: string;
  readonly rawcodes: readonly string[];
  readonly joinConfidence: string;
  /** the model paths the map really named, strongest provenance first */
  readonly realArt: readonly RealArt[];
  readonly currentVfxKey: string | null;
  readonly extraction: ProvenanceExtraction | null;
  /** every doc of the extraction that actually ships in content/vfx today */
  readonly extractionDocsPresent: readonly string[];
  /** true when EVERY emitter is model-root anchored — the renderability gate */
  readonly rootAnchoredGate: boolean;
  readonly status: CensusStatus;
  readonly leftReason: LeftReason | null;
  readonly ownerNote: string | null;
}

const SLOT_ORDER: Readonly<Record<string, number>> = {
  PASSIVE: 0,
  Q: 1,
  W: 2,
  E: 3,
  R: 4,
  EX: 5,
};

/** Is this key one of the real extracted effects (as opposed to a primitive)? */
export function isExtractionKey(key: string | null | undefined): boolean {
  return !!key && (key.startsWith("fx.w3x.") || key.startsWith("godie-"));
}

export function buildCensusRows(
  abilities: readonly CensusAbility[],
  champions: readonly CensusChampion[],
  provenance: ProvenanceFile | null,
  vfxDocIds: ReadonlySet<string>,
): readonly CensusRow[] {
  const champName = new Map(champions.map((c) => [c.id, c.name]));
  const rows: CensusRow[] = [];

  for (const a of abilities) {
    const championId = a.championId ?? a.id.replace(/\.[^.]*$/, "");
    const prov = provenance?.abilities[a.id];
    const realArt = prov?.realArt ?? [];
    const all = prov?.extractions ?? [];
    // the bound key decides which of the ability's extractions this row is
    // ABOUT; otherwise the best-scoring one is the candidate it could take
    const bound = a.vfxKey ? (all.find((e) => e.layerDocIds.includes(a.vfxKey!)) ?? null) : null;
    const ext = bound ?? all[0] ?? null;
    const present = (ext?.layerDocIds ?? []).filter((id) => vfxDocIds.has(id));
    const gate = !!ext && ext.emitterTotal > 0 && ext.rootAnchored === ext.emitterTotal;
    const usable = !!ext && present.length > 0;

    let status: CensusStatus;
    if (!a.vfxKey) status = "NO-CAST";
    else if (isExtractionKey(a.vfxKey)) {
      status = bound ? "TRUE-PORT" : "MIS-BOUND";
    } else if (!a.vfxKey.startsWith("fx.prim.")) status = "LEGACY-KEY";
    else if (realArt.length === 0) status = "NO-SOURCE";
    else if (usable) status = "PRIMITIVE-SUBSTITUTE";
    else status = "PRIMITIVE-NECESSARY";

    const ownerNote = OWNER_DECISIONS[a.id] ?? null;
    const leftReason: LeftReason | null =
      status === "PRIMITIVE-SUBSTITUTE" ? (gate ? "owner-decision" : "renderer-gate") : null;

    rows.push({
      championId,
      championName: champName.get(championId) ?? championId,
      abilityId: a.id,
      abilityName: a.name,
      slot: (a.slot || "PASSIVE").toUpperCase(),
      rawcodes: prov?.rawcodes ?? [],
      joinConfidence: prov?.joinConfidence ?? "NONE",
      realArt,
      currentVfxKey: a.vfxKey,
      extraction: ext,
      extractionDocsPresent: present,
      rootAnchoredGate: gate,
      status,
      leftReason,
      ownerNote,
    });
  }

  rows.sort(
    (x, y) =>
      x.championName.localeCompare(y.championName) ||
      x.championId.localeCompare(y.championId) ||
      (SLOT_ORDER[x.slot] ?? 9) - (SLOT_ORDER[y.slot] ?? 9),
  );
  return rows;
}

// --------------------------------------------------------------- rollups ---

export interface StatusTotals {
  readonly totals: Readonly<Record<CensusStatus, number>>;
  readonly rows: number;
}

export function statusTotals(rows: readonly CensusRow[]): StatusTotals {
  const totals = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<CensusStatus, number>;
  for (const r of rows) totals[r.status] += 1;
  return { totals, rows: rows.length };
}

export interface ChampionRollup {
  readonly championId: string;
  readonly championName: string;
  readonly rows: readonly CensusRow[];
  readonly truePort: number;
  readonly substitute: number;
}

export function perChampion(rows: readonly CensusRow[]): readonly ChampionRollup[] {
  const by = new Map<string, CensusRow[]>();
  for (const r of rows) {
    const list = by.get(r.championId);
    if (list) list.push(r);
    else by.set(r.championId, [r]);
  }
  return [...by.entries()]
    .map(([championId, list]) => ({
      championId,
      championName: list[0]!.championName,
      rows: list,
      truePort: list.filter((r) => r.status === "TRUE-PORT").length,
      substitute: list.filter((r) => r.status === "PRIMITIVE-SUBSTITUTE").length,
    }))
    .sort((a, b) => b.truePort - a.truePort || a.championName.localeCompare(b.championName));
}

// ---------------------------------------------------------------- ledger ---

/** How a shipped extraction doc reaches the screen — or why it does not. */
export type Reach =
  /** it IS some ability's `vfxKey` */
  | "primary"
  /** it plays alongside a primary through `extraVfxDocIds()` */
  | "extra"
  | "unreached";

export type UnreachedWhy =
  /** the family has ZERO root-anchored emitters — flat replay collapses it */
  | "layout-gate"
  /** no ability doc references the source model at all (orb carriers, items) */
  | "no-referencing-ability"
  /** the extraction carries a layout only — there is no geometry to draw (#98) */
  | "zero-geometry"
  /** renderable, referenced, simply not promoted yet — the real backlog */
  | "not-promoted";

export interface LedgerEntry {
  readonly docId: string;
  readonly fxId: string;
  /** 粒子 / 球體 / 蝗蟲群 */
  readonly family: string;
  readonly stem: string;
  readonly reach: Reach;
  readonly why: UnreachedWhy | null;
  readonly referencedBy: readonly string[];
  readonly rootAnchored: number;
  readonly emitterTotal: number;
}

/** One `fx.w3x.*` family as `w3x-families.json` publishes it. */
export interface FamilyManifestEffect {
  readonly id: string;
  readonly family: string;
  readonly label: string;
  readonly source?: { readonly model?: string };
  readonly layers?: readonly { readonly docId: string }[];
}
export interface FamilyManifest {
  readonly effects: readonly FamilyManifestEffect[];
}

function stemOf(model: string | undefined): string {
  if (!model) return "";
  const base = model.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/\.[^.]*$/, "").toLowerCase();
}

/**
 * The 118-doc ledger: every shipped `fx.w3x.*` layer, whether the renderer can
 * reach it, and — when it cannot — WHY. `abilities` supplies the live `vfxKey`
 * set; the extras come from the renderer's own promotion table, so a doc that
 * plays only as a secondary layer is correctly counted as USED.
 */
export function extractionLedger(
  manifest: FamilyManifest | null,
  abilities: readonly CensusAbility[],
  provenance: ProvenanceFile | null,
): readonly LedgerEntry[] {
  if (!manifest) return [];
  const primaries = new Set(abilities.map((a) => a.vfxKey).filter((k): k is string => !!k));
  const extras = new Set<string>();
  for (const id of Object.keys(w3xAbilityArtRows())) for (const d of extraVfxDocIds(id)) extras.add(d);

  const out: LedgerEntry[] = [];
  for (const eff of manifest.effects) {
    const stem = stemOf(eff.source?.model);
    const model = provenance?.models[stem] ?? null;
    const layers = eff.layers ?? [];
    for (const layer of layers) {
      const reach: Reach = primaries.has(layer.docId)
        ? "primary"
        : extras.has(layer.docId)
          ? "extra"
          : "unreached";
      let why: UnreachedWhy | null = null;
      if (reach === "unreached") {
        if (!model || model.emitterTotal === 0) why = "zero-geometry";
        else if (model.referencedBy.length === 0) why = "no-referencing-ability";
        else if (model.rootAnchored === 0) why = "layout-gate";
        else why = "not-promoted";
      }
      out.push({
        docId: layer.docId,
        fxId: eff.id,
        family: eff.family,
        stem,
        reach,
        why,
        referencedBy: model?.referencedBy ?? [],
        rootAnchored: model?.rootAnchored ?? 0,
        emitterTotal: model?.emitterTotal ?? 0,
      });
    }
  }
  return out;
}

export interface LedgerTotals {
  readonly layers: number;
  readonly primary: number;
  readonly extra: number;
  readonly unreached: number;
  readonly byWhy: Readonly<Record<UnreachedWhy, number>>;
  readonly byFamily: Readonly<Record<string, { total: number; reached: number }>>;
}

export function ledgerTotals(entries: readonly LedgerEntry[]): LedgerTotals {
  const byWhy: Record<UnreachedWhy, number> = {
    "layout-gate": 0,
    "no-referencing-ability": 0,
    "zero-geometry": 0,
    "not-promoted": 0,
  };
  const byFamily: Record<string, { total: number; reached: number }> = {};
  let primary = 0;
  let extra = 0;
  for (const e of entries) {
    if (e.reach === "primary") primary += 1;
    else if (e.reach === "extra") extra += 1;
    else if (e.why) byWhy[e.why] += 1;
    const f = (byFamily[e.family] ??= { total: 0, reached: 0 });
    f.total += 1;
    if (e.reach !== "unreached") f.reached += 1;
  }
  return {
    layers: entries.length,
    primary,
    extra,
    unreached: entries.length - primary - extra,
    byWhy,
    byFamily,
  };
}

// -------------------------------------------------- missing-extraction ------

export interface MissingExtraction {
  readonly stem: string;
  readonly emitterTotal: number;
  readonly rootAnchored: number;
  readonly referencedBy: readonly string[];
  /** already extracted under the older #182 pass, just not re-derived (#183) */
  readonly hasGodieDocs: boolean;
}

/**
 * Models an ability really references for which NO `fx.w3x.*` family exists.
 * Split by `emitterTotal`: >0 is the #183 re-derivation backlog; 0 is mesh-only
 * art that the particle pipeline can never produce and that needs the MESH path
 * instead — reporting them together would misstate both.
 */
export function missingExtractions(
  provenance: ProvenanceFile | null,
  vfxDocIds: ReadonlySet<string>,
): readonly MissingExtraction[] {
  if (!provenance) return [];
  const out: MissingExtraction[] = [];
  for (const [stem, m] of Object.entries(provenance.models)) {
    if (m.fxId || m.referencedBy.length === 0) continue;
    out.push({
      stem,
      emitterTotal: m.emitterTotal,
      rootAnchored: m.rootAnchored,
      referencedBy: m.referencedBy,
      hasGodieDocs: m.layerDocIds.some((d) => vfxDocIds.has(d)),
    });
  }
  return out.sort(
    (a, b) => b.emitterTotal - a.emitterTotal || b.referencedBy.length - a.referencedBy.length,
  );
}
