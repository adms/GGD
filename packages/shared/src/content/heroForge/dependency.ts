import { z } from "zod";
import { HERO_SECTION_IDS } from "./constants";
import { zContractId } from "./plan";

export const zHeroDependencyNode = z
  .object({
    id: zContractId,
    kind: z.enum(["section", "document", "asset", "scenario"]),
  })
  .strict();

export const zHeroDependencyEdge = z
  .object({
    from: zHeroDependencyNode,
    to: zHeroDependencyNode,
    reason: z.string().min(1).max(300),
  })
  .strict();

export type HeroDependencyNode = z.infer<typeof zHeroDependencyNode>;
export type HeroDependencyEdge = z.infer<typeof zHeroDependencyEdge>;

/** First conservative closure; later batches add document/asset/scenario edges. */
export const HERO_SECTION_DEPENDENCIES: Readonly<Record<(typeof HERO_SECTION_IDS)[number], readonly (typeof HERO_SECTION_IDS)[number][]>> =
  Object.freeze({
    identity: ["attributes", "skills", "mechanics", "presentation", "validation", "package"],
    attributes: ["skills", "mechanics", "validation", "package"],
    skills: ["mechanics", "presentation", "validation", "package"],
    mechanics: ["presentation", "validation", "package"],
    presentation: ["validation", "package"],
    validation: ["package"],
    package: [],
  });

export function staleSectionsFrom(sectionId: (typeof HERO_SECTION_IDS)[number]): readonly (typeof HERO_SECTION_IDS)[number][] {
  return HERO_SECTION_DEPENDENCIES[sectionId];
}
