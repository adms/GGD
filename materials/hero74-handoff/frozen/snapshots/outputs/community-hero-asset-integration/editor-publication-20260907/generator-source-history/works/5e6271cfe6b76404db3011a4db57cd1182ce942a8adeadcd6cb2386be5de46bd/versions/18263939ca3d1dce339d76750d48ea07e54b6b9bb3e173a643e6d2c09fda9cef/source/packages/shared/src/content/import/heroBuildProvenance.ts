import { z } from "zod";

export const zHeroBuildSourceVersion = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const zHeroBuildProvenance = z.object({
  schema: z.literal("ggd-hero-build-provenance@1"),
  generatorVersion: zHeroBuildSourceVersion,
  processorVersion: zHeroBuildSourceVersion,
  processorFingerprint: z.string().regex(/^[a-f0-9]{12}$/),
  planGeneratorVersion: zHeroBuildSourceVersion.nullable(),
}).strict();
export type HeroBuildProvenance = z.infer<typeof zHeroBuildProvenance>;
