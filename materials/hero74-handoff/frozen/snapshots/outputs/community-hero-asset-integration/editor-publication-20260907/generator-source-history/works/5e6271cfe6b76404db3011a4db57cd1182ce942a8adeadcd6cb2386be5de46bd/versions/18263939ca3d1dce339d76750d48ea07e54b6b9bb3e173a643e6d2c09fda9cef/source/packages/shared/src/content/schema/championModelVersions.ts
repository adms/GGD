import { z } from "zod";
import { zId, zRef } from "./ref";

export const MODEL_VERSION_PREFIX = "version.body.";
const zDigest = z.string().regex(/^[a-f0-9]{64}$/);

export const zModelVersionSource = z.object({
  kind: z.enum(["exact", "alternate", "style-proxy", "previous"]),
  character: z.string().trim().min(1).max(120),
  work: z.string().trim().min(1).max(160),
  library: z.string().trim().min(1).max(120),
  reference: z.string().trim().min(1).max(1000),
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
}).strict();
export const zChampionModelVersions = z.array(zChampionModelVersion).min(1).max(64);
export type ChampionModelVersion = z.infer<typeof zChampionModelVersion>;
export type ModelVersionSource = z.infer<typeof zModelVersionSource>;

export const zModelVersionCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"), expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceModelKey: zId, label: z.string().trim().min(1).max(160), source: zModelVersionSource,
  }).strict(),
  z.object({
    action: z.literal("activate"), expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), modelKey: zId,
  }).strict(),
]);
export type ModelVersionCommand = z.infer<typeof zModelVersionCommand>;
export interface ChampionModelVersionState {
  championId: string;
  expectedHash: string;
  activeModelKey: string;
  versions: ChampionModelVersion[];
}
