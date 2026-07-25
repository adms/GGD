/**
 * ContentDb — fetches the authored JSON content the client renders from:
 * model docs (champion GLB + clip maps), vfx docs (particle defs), ribbon
 * docs (trail defs — same vfx collection, split on `schema`), the ambient-vfx
 * config doc (modelKey → ambient attachment bindings) and the arena doc
 * (decor/groundStyle). Everything is OPTIONAL: lookups return null/[] until
 * (and unless) the docs arrive, and every consumer keeps a procedural
 * fallback, so a missing/broken content mount degrades gracefully.
 * Pure fetch + data — NO @babylonjs imports here (client-08 arch gate).
 */
import type {
  ModelDoc,
  VfxDoc,
  RibbonDoc,
  ArenaDoc,
  ConfigAmbientVfxDoc,
  ConfigGoreDoc,
  AmbientVfxBinding,
} from "@ggd/shared/content";
import { Arenas, Configs, Models, RibbonDefs, VfxDefs } from "@ggd/shared/content";
import { VOXEL_SKINS_SCHEMA, type VoxelSkinOverride } from "@ggd/shared/content/voxelSkin";
import { applyGoreDoc } from "../vfx/goreConfig";
import { ensureContentLoaded } from "./bootContent";
import { withContentVersion } from "./assetVersion";

interface IndexFile {
  entries?: { id: string; path: string }[];
}

/**
 * Per-champion render-SIZE override loaded from content/models/_standin-overrides.json
 * (schema standin-overrides@2). This sidecar is NOT a model@1 doc: it is keyed by
 * championId (not modelKey) and is skipped by the content index builder because of
 * its leading "_" (see fsStore.rebuildCollectionIndex), so it rides in as a direct-
 * path fetch rather than through a collection index. `relativeScale` is the task
 * #150 multiplier applied ON TOP of ChampionView's height-normalization (1.0 = the
 * normalized target); `scale`/`glbPath`/`clipMap` are the legacy task #77 model-swap
 * fields. Its shape mirrors the render layer's `ModelDocOverride` field-for-field, so
 * GameApp hands it straight to EntityViewRegistry.modelOverrideFor without adapting.
 * (Deliberately declared here, not imported from render/**, to keep the content layer
 * free of the babylon-tainted render module — client-08 arch gate.)
 */
export interface StandInOverride {
  relativeScale?: number;
  scale?: number;
  glbPath?: string;
  clipMap?: ModelDoc["clipMap"];
}

/** Shape of the _standin-overrides.json sidecar (schema standin-overrides@2). */
interface StandInOverridesFile {
  schema?: string;
  target?: number;
  overrides?: Record<string, StandInOverride>;
}

/**
 * Hand-authored VOXEL SKIN overrides (task #231) from
 * content/models/_voxel-skins.json (schema voxel-skins@1). Layer L1 of the
 * skin's override chain and the ONLY part of it that is fetched — every other
 * layer is computed from the champion doc the registries already hold.
 * Same sidecar mechanics as _standin-overrides.json above: keyed by championId,
 * leading "_" so the index builder skips it, so it rides in as a direct-path
 * fetch. Declared structurally here rather than imported from the shared voxel
 * skin module so the content layer stays free of render-adjacent imports; the
 * shape is asserted against `VoxelSkinOverride` where it is consumed.
 */
interface VoxelSkinOverridesFile {
  schema?: string;
  overrides?: Record<string, Record<string, unknown>>;
}

const BASE = "/content/";

const NO_BINDINGS: readonly AmbientVfxBinding[] = [];

/**
 * Resolve a content-relative asset path ("assets/…", e.g. a doc's `icon`) to
 * the URL it is served from (same mount as every other content fetch). Returns
 * null for absent/foreign paths so callers keep their non-icon fallback —
 * never fabricates a URL for Blizzard stock art (which carries no icon field).
 */
export function contentAssetUrl(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("assets/")) return null;
  // `?h=<contentVersion>` is what flips nginx from `no-cache` to
  // `immutable` for this URL (see assetVersion.ts). Before the manifest lands
  // it is a no-op and the bare URL revalidates, exactly as it always did.
  return withContentVersion(BASE + path);
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(BASE + path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch every doc listed in a collection _index.json. */
async function fetchCollection<T extends { id: string }>(collection: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const index = await fetchJson<IndexFile>(`${collection}/_index.json`);
  if (!index?.entries) return out;
  const docs = await Promise.all(index.entries.map((e) => fetchJson<T>(e.path)));
  for (const doc of docs) {
    if (doc && typeof doc.id === "string") out.set(doc.id, doc);
  }
  return out;
}

export class ContentDb {
  /**
   * true = every doc lookup reads the shared registries the ContentLoader
   * hydrated at boot (the normal path — zero per-match doc requests). false =
   * the degraded self-fetch path below, used only when the content boot failed
   * and fell back to the skeleton registry.
   */
  private fromRegistries = false;
  /** degraded path only: docs this db fetched itself (empty when registry-backed). */
  private models = new Map<string, ModelDoc>();
  private vfx = new Map<string, VfxDoc>();
  private ribbons = new Map<string, RibbonDoc>();
  private fetchedConfigs = new Map<string, { schema?: string }>();
  private ambientVfx: ConfigAmbientVfxDoc | null = null;
  private arenaDoc: ArenaDoc | null = null;
  private standInOverrides = new Map<string, StandInOverride>();
  private voxelSkinOverrides = new Map<string, VoxelSkinOverride>();
  private loaded = false;

  /**
   * Populate the db; resolves when everything settled (never rejects).
   *
   * REGISTRY-FIRST (was: 507 HTTP requests / 516,392 B on EVERY match entry).
   * The 117 model docs, the 388 vfx/ribbon docs, the arenas and the config docs
   * are ALL loaded, schema-validated and registered by the shared ContentLoader
   * at client boot (bootContent → registerAll), long before `screen` can become
   * "match". Re-fetching them here downloaded the same bytes a second time. We
   * now await the single-flight boot (already settled by this point — no network)
   * and read the registries.
   *
   * THE GATE IS DELIBERATELY KEPT. `modelFor()` returning null is what stops
   * `ChampionView.tryUpgradeToGlb` from latching (`upgradeStarted`) before the
   * per-champion size override is resolvable — the override sidecar is NOT in the
   * models index (leading "_"), so it is still a direct-path fetch, and a champion
   * that adopted its glb one frame early would keep relativeScale 1.0 FOREVER
   * (小叮噹 at 1.8u instead of 1.17u). So `this.loaded` stays an explicit gate and
   * every accessor honours it: models become visible in the SAME step the
   * overrides do, exactly as before. That costs the one sidecar request.
   */
  async load(arenaId = "arena.skeleton"): Promise<void> {
    const [boot, standin, voxelSkins] = await Promise.all([
      // single-flight; at match entry this is an already-resolved promise (0 requests)
      ensureContentLoaded(),
      // per-champion model-SIZE overrides (task #77/#150). Direct-path fetch: the
      // "_"-prefixed sidecar is intentionally excluded from the models _index.json,
      // so the ContentLoader never sees it. Resolving it in the SAME step as the
      // model docs is the invariant described above.
      fetchJson<StandInOverridesFile>("models/_standin-overrides.json"),
      // hand-authored voxel-skin overrides (task #231). Same sidecar mechanics,
      // same step — the skin is a CONSTRUCTION-TIME input to ChampionView, so a
      // champion whose view was built before its override landed would wear the
      // un-overridden look for the rest of the match.
      fetchJson<VoxelSkinOverridesFile>("models/_voxel-skins.json"),
    ]);
    // per-champion render-size overrides (task #77/#150). Guarded by schema so a
    // stale/foreign file is ignored; a missing/404 file leaves the map empty and
    // every champion renders at the normalized default (relativeScale 1.0).
    this.standInOverrides = new Map();
    if (standin?.schema === "standin-overrides@2" && standin.overrides) {
      for (const [championId, ov] of Object.entries(standin.overrides)) {
        if (ov && typeof ov === "object") this.standInOverrides.set(championId, ov);
      }
    }
    // task #231 — schema-guarded exactly like the sidecar above: a stale or
    // foreign file is ignored and every champion simply keeps its GENERATED
    // look, which is a complete look on its own. The override file is an
    // art-direction channel, never a prerequisite.
    this.voxelSkinOverrides = new Map();
    if (voxelSkins?.schema === VOXEL_SKINS_SCHEMA && voxelSkins.overrides) {
      for (const [championId, ov] of Object.entries(voxelSkins.overrides)) {
        if (ov && typeof ov === "object") {
          this.voxelSkinOverrides.set(championId, ov as VoxelSkinOverride);
        }
      }
    }

    if (boot.ok) {
      this.fromRegistries = true;
      this.arenaDoc = Arenas.tryGet(arenaId) ?? this.arenaDoc;
    } else {
      // Content boot fell back to the skeleton (a doc failed schema/ref
      // validation, or the mount is broken): the registries hold 2 champions and
      // NO model/vfx docs. The old tolerant per-doc path is kept for exactly this
      // case — it does no schema validation, so a single bad doc cannot cost the
      // whole match its models. This is the ONLY path that still fetches the
      // collections.
      this.fromRegistries = false;
      await this.loadByFetch(arenaId);
    }
    this.ambientVfx = this.configDoc<ConfigAmbientVfxDoc>("ambient-vfx", "config.ambient-vfx@1");
    // 濺血 style knob (task #39): push the art-directed baseline + per-champion
    // overrides into the vfx layer. A missing doc leaves the shipped default
    // (blood @ 0.85) — the player's own setting still wins over both.
    applyGoreDoc(this.configDoc<ConfigGoreDoc>("gore", "config.gore@1"));
    this.loaded = true;
  }

  /** Registry-or-fetched config doc, narrowed by `schema` (null when absent). */
  private configDoc<T extends { schema: string }>(id: string, schema: string): T | null {
    const doc = this.fromRegistries
      ? (Configs.tryGet(id) as unknown)
      : (this.fetchedConfigs.get(id) as unknown);
    return (doc as T | undefined)?.schema === schema ? (doc as T) : null;
  }

  /**
   * DEGRADED path only (see `load`): the original 507-request per-doc fetch.
   * Reached solely when the shared content boot failed and fell back to the
   * skeleton registry.
   */
  private async loadByFetch(arenaId = "arena.skeleton"): Promise<void> {
    const [models, vfxDocs, ambient, gore, arena] = await Promise.all([
      fetchCollection<ModelDoc>("models"),
      // the vfx collection mixes vfx@1 particle docs and ribbon@1 trail docs
      fetchCollection<VfxDoc | RibbonDoc>("vfx"),
      // fetched by direct path (works even before content:build re-indexes it)
      fetchJson<ConfigAmbientVfxDoc>("config/ambient-vfx.json"),
      fetchJson<ConfigGoreDoc>("config/gore.json"),
      fetchJson<ArenaDoc>(`arenas/${arenaId}.json`),
    ]);
    this.models = models;
    this.vfx = new Map();
    this.ribbons = new Map();
    for (const doc of vfxDocs.values()) {
      if (doc.schema === "ribbon@1") this.ribbons.set(doc.id, doc);
      else this.vfx.set(doc.id, doc);
    }
    this.fetchedConfigs.clear();
    if (ambient) this.fetchedConfigs.set("ambient-vfx", ambient);
    if (gore) this.fetchedConfigs.set("gore", gore);
    this.arenaDoc = arena;
  }

  /**
   * Arena doc by id (used when the match's mapId is known/changes). Served from
   * the registry the ContentLoader already populated — the 5 arena docs are part
   * of the boot load, so this is a synchronous lookup wearing an async signature
   * (the caller is a `.then()` chain in GameApp.applyArena). Falls back to a
   * direct fetch only in the degraded no-registry case. Resolves null on any
   * failure so the caller can fall back to the skeleton geometry.
   */
  async loadArena(arenaId: string): Promise<ArenaDoc | null> {
    // awaited (not `this.fromRegistries`) because GameApp calls applyArena in the
    // same tick as load(), before that flag is decided. Single-flight, already
    // settled at match entry → no request either way.
    const boot = await ensureContentLoaded();
    const doc = boot.ok
      ? (Arenas.tryGet(arenaId) ?? null)
      : await fetchJson<ArenaDoc>(`arenas/${arenaId}.json`);
    this.arenaDoc = doc ?? this.arenaDoc;
    return doc;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Model doc for a modelKey, or null until `load()` settles.
   *
   * The `!this.loaded` guard is LOAD-BEARING, not defensive tidiness: it is the
   * gate that keeps `ChampionView.tryUpgradeToGlb` from latching `upgradeStarted`
   * before `modelOverrideFor` can answer. Reading the registry unguarded would
   * hand out a doc on frame 0 and permanently strip the per-champion size
   * override from any champion whose entity exists that frame. See `load()`.
   */
  modelFor(modelKey: string): ModelDoc | null {
    if (!this.loaded) return null;
    if (this.fromRegistries) return Models.tryGet(modelKey) ?? null;
    return this.models.get(modelKey) ?? null;
  }

  /**
   * Per-champion render-SIZE override (task #77/#150) by championId, or null when
   * the champion has none — the common case (~105 of 113), for which the render
   * layer defaults `relativeScale` to 1.0 (ChampionView's height-normalized target
   * size). Only the 8 curated exceptions in _standin-overrides.json (小叮噹 0.65 …
   * 初號機 1.55) return a non-null override. Empty until `load()` settles. Keyed by
   * championId (NOT modelKey) because stand-ins share a modelKey — the size
   * exception is per champion, so the composition root must resolve championId
   * before calling this (GameApp.modelOverrideFor).
   */
  modelOverrideFor(championId: string): StandInOverride | null {
    return this.standInOverrides.get(championId) ?? null;
  }

  /**
   * Hand-authored VOXEL SKIN override (task #231) by championId, or null — the
   * common case, because the generator produces a complete, distinct look for
   * every champion on its own. This is the 驗收 channel: when the owner calls
   * out a hero on the 體素外觀對照表, the fix lands here as a few authored
   * fields rather than as a special case in the generator.
   *
   * Deliberately NOT gated on `this.loaded`: the recipe is computed from the
   * champion registry, so the only thing an early call can miss is the
   * override, and the sidecar resolves in the same step as the model docs.
   */
  voxelSkinOverrideFor(championId: string): VoxelSkinOverride | null {
    return this.voxelSkinOverrides.get(championId) ?? null;
  }

  vfxFor(vfxKey: string): VfxDoc | null {
    if (this.fromRegistries) return VfxDefs.tryGet(vfxKey) ?? null;
    return this.vfx.get(vfxKey) ?? null;
  }

  ribbonFor(ribbonKey: string): RibbonDoc | null {
    if (this.fromRegistries) return RibbonDefs.tryGet(ribbonKey) ?? null;
    return this.ribbons.get(ribbonKey) ?? null;
  }

  /** Ambient attachment bindings for a modelKey ([] when none authored). */
  ambientBindingsFor(modelKey: string): readonly AmbientVfxBinding[] {
    return this.ambientVfx?.bindings[modelKey] ?? NO_BINDINGS;
  }

  get arena(): ArenaDoc | null {
    return this.arenaDoc;
  }
}
