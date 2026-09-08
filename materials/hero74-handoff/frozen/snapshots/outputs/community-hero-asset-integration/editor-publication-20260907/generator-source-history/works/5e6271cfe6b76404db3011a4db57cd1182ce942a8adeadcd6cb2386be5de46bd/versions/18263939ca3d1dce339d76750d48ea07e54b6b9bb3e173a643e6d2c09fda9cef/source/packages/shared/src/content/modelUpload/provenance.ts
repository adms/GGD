import { z } from "zod";

/** Public source description; never includes a contributor's private local paths. */
export const zHeroModelProvenance = z.object({
  schema: z.literal("ggd-hero-model-provenance@1"),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceAssetId: z.string().min(1).max(160),
  sourceCharacter: z.string().min(1).max(160),
  sourceWork: z.string().min(1).max(240),
  relationship: z.enum(["exact", "alternate", "style-proxy"]),
  notes: z.string().max(8000),
}).strict();
export type HeroModelProvenance = z.infer<typeof zHeroModelProvenance>;
