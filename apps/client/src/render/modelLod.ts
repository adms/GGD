/**
 * modelLod — the seam that makes the graphics-quality setting change WHICH .glb
 * FILE IS FETCHED (task #115).
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ACTUALLY BROKEN
 * ---------------------------------------------------------------------------
 * The quality dropdown was not fake — it really moved `resolutionScale`,
 * `particleDensity`, `shadows`, `drawDistance`, `antialias` and `fpsCap`. But
 * `RenderParams` had NO model dimension at all and `AssetManager.load()` took a
 * raw path straight from the model doc, so "low" and "high" downloaded and drew
 * byte-identical geometry. On the phones the low preset exists for, the models
 * are the single largest cost in the frame AND on the wire. This module adds
 * the missing dimension, and does it in ONE place: every consumer already goes
 * through `AssetManager.load`, so nothing else in render/** has to know.
 *
 * ---------------------------------------------------------------------------
 * WHY A MANIFEST AND NOT A 404 PROBE
 * ---------------------------------------------------------------------------
 * The obvious implementation — try `mage-small.glb`, fall back to `mage.glb` on
 * 404 — reintroduces exactly the pathology `AssetManager`'s header calls out:
 * it DOUBLES the round-trip count for every model that has no tier, and only
 * 89 of the 163 shipped .glb do. `content/assets/models/_lod.json` is written by
 * `tools/lod-gen/gen_lod.py` alongside the tier files, is a few KB, is fetched
 * ONCE per boot, and rides the same `?h=` immutable cache key as everything
 * else — so resolution is a pure map lookup and a missing tier costs zero
 * requests. No manifest (old deploy, fetch failed) → every path resolves to
 * itself, i.e. exactly today's behaviour.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TIER FOLLOWS THE PRESET AND NOT THE ADAPTIVE LADDER
 * ---------------------------------------------------------------------------
 * `AdaptiveManager` re-rungs on a seconds-scale timer while the match is
 * running. Resolution scale and particle budgets are free to move on that clock
 * — they are per-frame GPU knobs. A model tier is NOT: switching it evicts the
 * AssetContainer and issues a NETWORK FETCH, and a ladder oscillating around a
 * threshold would issue them repeatedly, mid-fight, on the exact device that is
 * already struggling. So the tier is derived from the fixed preset only, and
 * "auto" deliberately stays at the top tier. The place that genuinely benefits
 * is first boot: `autoDetectPreset` puts a weak/touch device on "low" before
 * anything is fetched, so it never downloads the full-fat corpus at all.
 *
 * A tier change mid-session applies to models loaded AFTER it. Already-adopted
 * meshes keep their tier until the scene is rebuilt — deliberately: swapping a
 * champion's mesh under a playing animation is a visible pop, and the next
 * round rebuilds the scene anyway.
 */
import type { QualityPreset } from "../settings";

/** Model detail tier. "high" = the authored file, i.e. no LOD swap. */
export type ModelLodTier = "high" | "mid" | "small";

/** One generated tier's record in `_lod.json`. */
export interface LodTierEntry {
  path: string;
  bytes: number;
  triangles: number;
}

export interface LodModelEntry {
  /** authored file size / triangle count, for the payload accounting. */
  bytes?: number;
  triangles?: number;
  mid?: LodTierEntry;
  small?: LodTierEntry;
}

export interface LodManifest {
  schema?: string;
  generatedAt?: string;
  tiers?: string[];
  models: Record<string, LodModelEntry>;
}

let manifest: LodManifest | null = null;
let tier: ModelLodTier = "high";

/** Publish the generated-tier index. Null/malformed clears it (→ no swapping). */
export function setModelLodManifest(next: LodManifest | null | undefined): void {
  manifest = next && typeof next === "object" && next.models ? next : null;
}

export function getModelLodManifest(): LodManifest | null {
  return manifest;
}

export function setModelLodTier(next: ModelLodTier): void {
  tier = next;
}

export function getModelLodTier(): ModelLodTier {
  return tier;
}

/**
 * Preset → tier. "auto" holds at "high" on purpose (see the header): the
 * adaptive ladder must never trigger a mid-match asset fetch.
 */
export function lodTierForPreset(preset: QualityPreset): ModelLodTier {
  switch (preset) {
    case "low":
      return "small";
    case "medium":
      return "mid";
    default:
      return "high";
  }
}

/**
 * Content-relative glb path → the path to actually fetch for `at`.
 *
 * Pure and total: an unknown path, a missing manifest or a tier that was never
 * generated for this model all return `path` unchanged. When "small" is asked
 * for and only "mid" exists, "mid" is served — a partial generation run degrades
 * to less saving, never to a 404.
 */
export function resolveLodPath(
  path: string,
  at: ModelLodTier = tier,
  from: LodManifest | null = manifest,
): string {
  if (at === "high" || !from) return path;
  const entry = from.models[path];
  if (!entry) return path;
  if (at === "small") return entry.small?.path ?? entry.mid?.path ?? path;
  return entry.mid?.path ?? path;
}

/**
 * Fetch `_lod.json` and publish it. Resolves false (leaving swapping disabled)
 * on any failure — a deploy without the tier files must still boot and play.
 * `stamp` is `withContentVersion`, injected so this module stays free of the
 * content layer in tests.
 */
export async function loadModelLodManifest(
  baseUrl: string,
  stamp: (url: string) => string = (u) => u,
  fetchFn: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<boolean> {
  if (!fetchFn) return false;
  try {
    const res = await fetchFn(stamp(`${baseUrl}/assets/models/_lod.json`));
    if (!res.ok) return false;
    const json = (await res.json()) as LodManifest;
    if (!json || typeof json !== "object" || !json.models) return false;
    setModelLodManifest(json);
    return true;
  } catch {
    return false;
  }
}
