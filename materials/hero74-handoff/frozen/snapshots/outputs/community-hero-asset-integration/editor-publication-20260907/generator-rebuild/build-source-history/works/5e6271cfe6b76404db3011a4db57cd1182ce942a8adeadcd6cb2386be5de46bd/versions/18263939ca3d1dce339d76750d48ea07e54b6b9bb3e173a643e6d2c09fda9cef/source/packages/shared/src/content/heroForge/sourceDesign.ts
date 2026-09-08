import { z } from "zod";
import { HERO_SLOTS } from "./constants";

/** Original design travels with drafts and published packages, independently of generated prose. */
const zSourceSlot = z.object({
  name: z.string().min(1).max(160),
  ownerDescription: z.string().min(1).max(12000),
  baselineBehavior: z.string().max(12000),
  requiredRefinement: z.string().max(12000),
  refinementContracts: z.array(z.string().regex(/^M\d{2}$/)).max(32),
}).strict();
export const zHeroSourceDesign = z.object({
  schema: z.literal("ggd-hero-source-design@1"),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(80),
  identity: z.string().max(12000),
  ownerText: z.string().min(1).max(64000),
  reviewText: z.string().max(12000),
  slots: z.object({ PASSIVE: zSourceSlot, Q: zSourceSlot, W: zSourceSlot, E: zSourceSlot, R: zSourceSlot, EX: zSourceSlot }).strict(),
}).strict();
export type HeroSourceDesign = z.infer<typeof zHeroSourceDesign>;

/** Author notes are not review verdicts and never suppress the source requirements. */
export const zHeroRefinementNotes = z.object(Object.fromEntries(HERO_SLOTS.map((slot) => [slot, z.string().max(8000).optional()])) as Record<(typeof HERO_SLOTS)[number], z.ZodOptional<z.ZodString>>).strict();
