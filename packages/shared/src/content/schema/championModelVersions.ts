import { z } from "zod";
import { zId, zRef } from "./ref";

export const MODEL_VERSION_PREFIX = "version.body.";
const zDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const MODEL_SOURCE_ORDER = ["300heroes", "mba", "original", "w3x"] as const;
export const MODEL_SOURCE_LABELS = { "300heroes": "300英雄", mba: "MBA", original: "原版", w3x: "借用 W3X" } as const;
export const MODEL_SELECTION_ORDER = ["manual", "canonical-game", "community-mod", "retextured-proxy", "similar-proxy", ...MODEL_SOURCE_ORDER] as const;
export const MODEL_SELECTION_LABELS = { manual: "手動指定模型", "canonical-game": "原著模型", "community-mod": "MOD社群修改", "retextured-proxy": "相似模型貼圖修改", "similar-proxy": "相似模型", ...MODEL_SOURCE_LABELS } as const;
export const zModelSelectionMode = z.enum(["automatic", "manual"]);

export const zModelVersionSource = z.object({
  kind: z.enum(["exact", "alternate", "style-proxy", "previous"]),
  character: z.string().trim().min(1).max(120),
  work: z.string().trim().min(1).max(160),
  library: z.string().trim().min(1).max(120),
  reference: z.string().trim().min(1).max(1000),
  tier: z.enum(MODEL_SOURCE_ORDER).optional(),
  // Selection class is independent of the preserved source library/tier.
  selectionClass: z.enum(MODEL_SELECTION_ORDER).optional(),
}).strict();

/** A retained model document pins the GLB AND the complete animation/appearance binding. */
export const zChampionModelVersion = z.object({
  modelKey: zRef("models").refine((id) => id.startsWith(MODEL_VERSION_PREFIX)),
  label: z.string().trim().min(1).max(160),
  sourceModelKey: zId,
  modelSha256: zDigest,
  binarySha256: zDigest,
  registeredAt: z.string().datetime(),
  source: zModelVersionSource,
  // Explicit approval lets the 11 owner-approved proxy copies participate in defaults.
  automaticEligible: z.boolean().optional(),
}).strict();
export const zChampionModelVersions = z.array(zChampionModelVersion).min(1).max(64);
export type ChampionModelVersion = z.infer<typeof zChampionModelVersion>;
export type ModelVersionSource = z.infer<typeof zModelVersionSource>;

/** Explicit provenance wins; retain compatibility with versions saved before tiers. */
export function modelSourceTier(source: ModelVersionSource): typeof MODEL_SOURCE_ORDER[number] {
  if (source.tier) return source.tier;
  if (/300heroes|300英雄/i.test(source.library)) return "300heroes";
  if (/\bmba\b|magical[-_ ]battle[-_ ]arena|魔法少女武鬥祭/i.test(source.library)) return "mba";
  if (/w3x|warcraft/i.test(source.library)) return "w3x";
  return "original";
}

export function modelSelectionClass(source: ModelVersionSource): typeof MODEL_SELECTION_ORDER[number] {
  return source.selectionClass ?? (source.kind === "style-proxy" ? "similar-proxy" : modelSourceTier(source));
}

/** Preserve every version; use the owner order, newest first within a class. */
export function sortModelVersions(versions: readonly ChampionModelVersion[]): ChampionModelVersion[] {
  return [...versions].reverse().sort((a, b) => MODEL_SELECTION_ORDER.indexOf(modelSelectionClass(a.source)) - MODEL_SELECTION_ORDER.indexOf(modelSelectionClass(b.source)));
}

/** Eligibility changes automatic selection, never the retained dropdown list. */
export function preferredModelVersion(versions: readonly ChampionModelVersion[]): ChampionModelVersion | undefined {
  return sortModelVersions(versions).find(modelVersionAutomaticEligible);
}

export function modelVersionAutomaticEligible(version: ChampionModelVersion): boolean {
  return version.automaticEligible ?? version.source.kind !== "style-proxy";
}

export const zModelVersionCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"), expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceModelKey: zId, label: z.string().trim().min(1).max(160), source: zModelVersionSource,
    automaticEligible: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal("activate"), expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), modelKey: zId,
  }).strict(),
  z.object({ action: z.literal("automatic"), expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict(),
]);
export type ModelVersionCommand = z.infer<typeof zModelVersionCommand>;
export const zChampionModelVersionState = z.object({
  championId: zId,
  expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  activeModelKey: zId,
  selectionMode: zModelSelectionMode,
  preferredModelKey: zId,
  versions: z.array(zChampionModelVersion).max(64),
});
export type ChampionModelVersionState = z.infer<typeof zChampionModelVersionState>;
