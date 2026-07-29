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
 * about half the shipped .glb have one. `content/assets/models/_lod.json` is written by
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
 * the SHIPPED table keeps "auto" at the top tier. The place that genuinely
 * benefits is first boot: `autoDetectPreset` puts a touch device on "medium"
 * (→ `-mid`) — or on "low" (→ `-small`) when it reports ≤3 cores or <3 GB —
 * before anything is fetched, so a phone never downloads the full-fat corpus.
 *
 * ⚠️ Measured 2026-07-30, correcting what this header used to claim: touch
 * alone does NOT mean "low". A mid-range phone lands on "medium", so the tier
 * a typical phone actually gets is `-mid`, not `-small`.
 *
 * ---------------------------------------------------------------------------
 * THE PRESET→TIER TABLE IS CONTENT, NOT A SWITCH
 * ---------------------------------------------------------------------------
 * Which tier each preset deserves is a 體感 call on real hardware, and owner
 * revises those. `config/model-lod.json` (`config.model-lod@1`) holds the
 * table; `lodTierForPreset` reads it; `DEFAULT_MODEL_LOD` is the fuse for when
 * the doc is absent. `enabled: false` pins everything to "high" — the kill
 * switch for "a tier file shipped broken" that needs no client rebuild, since
 * `content/` is a live bind-mount and the client is baked into its image.
 *
 * ---------------------------------------------------------------------------
 * A MODEL BELOW THE LOD FLOOR LEGITIMATELY SHIPS ONE TIER
 * ---------------------------------------------------------------------------
 * The manifest OMITTING a model is a valid, deliberate state — not missing
 * work. `tools/lod-gen/gen_lod.py` skips anything under ~1,500 triangles /
 * ~64 KB, because a tier file there costs a request and a manifest row to save
 * nothing, and claiming "this is the cheap version" of an already-minimal mesh
 * would be a lie.
 *
 * The four champion stand-ins are the case this rule was written for: #226
 * replaced them with generated ~168-triangle box-men (`tools/voxel-gen`), so
 * their twelve rows were removed from `_lod.json` along with the files. Do not
 * "restore" them. Note the deletion had to be done TOGETHER with the files:
 * a stale row would make `resolveLodPath` hand `AssetManager` a 404 on the LOW
 * and MEDIUM presets only, `loadUncached` would swallow it, and mobile players
 * would be permanently stuck on the procedural fallback while the HIGH preset
 * looked perfect.
 *
 * A tier change mid-session applies to models loaded AFTER it. Already-adopted
 * meshes keep their tier until the scene is rebuilt — deliberately: swapping a
 * champion's mesh under a playing animation is a visible pop, and the next
 * round rebuilds the scene anyway.
 */
import { Configs, DEFAULT_MODEL_LOD, type ConfigModelLodDoc } from "@ggd/shared/content";
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
let policy: ConfigModelLodDoc = DEFAULT_MODEL_LOD;

/**
 * Fired when the preset→tier POLICY changes (not when the tier does).
 *
 * It exists because of an ordering fact: `QualityController` derives
 * `RenderParams.modelLod` through `lodTierForPreset` at boot, i.e. BEFORE the
 * content bundle (and therefore `config/model-lod.json`) has landed. Without a
 * notification the operator's table would be read a few hundred ms too late and
 * the already-published tier would stand for the whole session — the doc would
 * be there, parsed, correct, and have no effect. That is failure mode ②.
 */
const policyListeners = new Set<() => void>();

/** Subscribe to policy adoption; returns the unsubscribe. */
export function subscribeModelLodPolicy(fn: () => void): () => void {
  policyListeners.add(fn);
  return () => policyListeners.delete(fn);
}

/** The preset→tier table currently in force (the shipped default until a doc lands). */
export function getModelLodPolicy(): ConfigModelLodDoc {
  return policy;
}

/**
 * Adopt `config.model-lod@1`. Anything that is not that doc (absent, wrong
 * schema, a half-written override) restores `DEFAULT_MODEL_LOD` — the table is
 * a policy, so "unreadable" must mean "the shipped policy", never "no LOD" and
 * never a half-applied mix of the two.
 */
export function applyModelLodPolicy(doc: unknown): void {
  const d = doc as ConfigModelLodDoc | null | undefined;
  const isTier = (v: unknown): v is ModelLodTier =>
    v === "high" || v === "mid" || v === "small";
  const ok =
    !!d &&
    typeof d === "object" &&
    d.schema === "config.model-lod@1" &&
    typeof d.enabled === "boolean" &&
    !!d.presetTiers &&
    isTier(d.presetTiers.low) &&
    isTier(d.presetTiers.medium) &&
    isTier(d.presetTiers.high) &&
    isTier(d.presetTiers.auto);
  policy = ok ? d : DEFAULT_MODEL_LOD;
  for (const fn of policyListeners) fn();
}

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
 * Preset → tier, READ OUT OF THE OPERATOR'S TABLE (`config/model-lod.json`),
 * not out of a switch. Which tier a preset deserves is a device/體感 judgement
 * owner will revise — hard-coding it means a client rebuild + redeploy per
 * revision, while `content/` is a live bind-mount where saving the file IS the
 * deploy. `enabled: false` pins every preset to "high", i.e. the pre-#115
 * behaviour, and is the one-field kill switch if a tier file ships broken.
 *
 * The SHIPPED table keeps "auto" at "high" on purpose (see the header): the
 * adaptive ladder must never trigger a mid-match asset fetch. An operator can
 * override that — deliberately, in a file, with the reason written next to it.
 */
export function lodTierForPreset(preset: QualityPreset): ModelLodTier {
  if (!policy.enabled) return "high";
  return policy.presetTiers[preset] ?? "high";
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
 *
 * It ALSO adopts the operator's preset→tier table, and does so FIRST, before
 * the fetch can fail. Both halves of #115 become true at the same instant, and
 * they become true at the one moment in the boot where both inputs exist: the
 * caller (`main.tsx`) runs this inside `ensureContentLoaded().then(…)`, so the
 * `Configs` registry is populated by then. Reading the doc here rather than
 * adding a second call site is deliberate — a policy that has to be wired up in
 * two places is a policy that will one day be wired up in one.
 *
 * `readPolicy` is injected purely so tests can drive the table without standing
 * up a content registry.
 */
export async function loadModelLodManifest(
  baseUrl: string,
  stamp: (url: string) => string = (u) => u,
  fetchFn: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
  readPolicy: () => unknown = () => Configs.tryGet("model-lod"),
): Promise<boolean> {
  applyModelLodPolicy(readPolicy());
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
