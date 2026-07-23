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
import { applyGoreDoc } from "../vfx/goreConfig";

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
  return BASE + path;
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
  private models = new Map<string, ModelDoc>();
  private vfx = new Map<string, VfxDoc>();
  private ribbons = new Map<string, RibbonDoc>();
  private ambientVfx: ConfigAmbientVfxDoc | null = null;
  private arenaDoc: ArenaDoc | null = null;
  private standInOverrides = new Map<string, StandInOverride>();
  private loaded = false;

  /** Kick off all fetches; resolves when everything settled (never rejects). */
  async load(arenaId = "arena.skeleton"): Promise<void> {
    const [models, vfxDocs, ambient, gore, arena, standin] = await Promise.all([
      fetchCollection<ModelDoc>("models"),
      // the vfx collection mixes vfx@1 particle docs and ribbon@1 trail docs
      fetchCollection<VfxDoc | RibbonDoc>("vfx"),
      // fetched by direct path (works even before content:build re-indexes it)
      fetchJson<ConfigAmbientVfxDoc>("config/ambient-vfx.json"),
      fetchJson<ConfigGoreDoc>("config/gore.json"),
      fetchJson<ArenaDoc>(`arenas/${arenaId}.json`),
      // per-champion model-SIZE overrides (task #77/#150). Direct-path fetch: the
      // "_"-prefixed sidecar is intentionally excluded from the models _index.json,
      // so it is loaded here alongside the model docs it complements. Loading it in
      // the SAME pass as the model collection guarantees the override is resolvable
      // the instant modelFor() first returns a doc (the frame the glb upgrade runs).
      fetchJson<StandInOverridesFile>("models/_standin-overrides.json"),
    ]);
    this.models = models;
    this.vfx = new Map();
    this.ribbons = new Map();
    for (const doc of vfxDocs.values()) {
      if (doc.schema === "ribbon@1") this.ribbons.set(doc.id, doc);
      else this.vfx.set(doc.id, doc);
    }
    this.ambientVfx =
      ambient?.schema === "config.ambient-vfx@1" && ambient.bindings ? ambient : null;
    // 濺血 style knob (task #39): push the art-directed baseline + per-champion
    // overrides into the vfx layer. A missing/404 doc leaves the shipped
    // default (blood @ 0.85) — the player's own setting still wins over both.
    applyGoreDoc(gore?.schema === "config.gore@1" ? gore : null);
    this.arenaDoc = arena;
    // per-champion render-size overrides (task #77/#150). Guarded by schema so a
    // stale/foreign file is ignored; a missing/404 file leaves the map empty and
    // every champion renders at the normalized default (relativeScale 1.0).
    this.standInOverrides = new Map();
    if (standin?.schema === "standin-overrides@2" && standin.overrides) {
      for (const [championId, ov] of Object.entries(standin.overrides)) {
        if (ov && typeof ov === "object") this.standInOverrides.set(championId, ov);
      }
    }
    this.loaded = true;
  }

  /**
   * Fetch a single arena doc by id (used when the match's mapId is known/
   * changes). Independent of `load()` — resolves null on any failure so the
   * caller can fall back to the skeleton geometry.
   */
  async loadArena(arenaId: string): Promise<ArenaDoc | null> {
    const doc = await fetchJson<ArenaDoc>(`arenas/${arenaId}.json`);
    this.arenaDoc = doc ?? this.arenaDoc;
    return doc;
  }

  get ready(): boolean {
    return this.loaded;
  }

  modelFor(modelKey: string): ModelDoc | null {
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

  vfxFor(vfxKey: string): VfxDoc | null {
    return this.vfx.get(vfxKey) ?? null;
  }

  ribbonFor(ribbonKey: string): RibbonDoc | null {
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
