import { z } from "zod";
import { HERO_SLOTS } from "./constants";
import { zHeroProject, type HeroProject } from "./schema";
import { zHeroSourceDesign, type HeroSourceDesign } from "./sourceDesign";
import { sha256Bytes } from "../sha256";
import { zHeroModelProvenance } from "../modelUpload/provenance";

export const zHeroHandoffModelBindings = z.object({ schema: z.literal("ggd-handoff-model-bindings@1"), entries: z.array(z.object({
  projectId: z.string(), name: z.string(), directory: z.string(),
  provenance: zHeroModelProvenance.omit({ schema: true, modelSha256: true }),
})).max(100) });

const zSidecarSlot = z.object({
  slot: z.enum(HERO_SLOTS), name: z.string(), ownerDescription: z.string(),
  currentBehavior: z.string(), requiredRefinement: z.string(),
  refinementContracts: z.array(z.string()).default([]),
});
// The full recipe also contains compiled previews and asset inventories. Import
// only the original design fields; those previews are never trusted as receipts.
const zSidecar = z.object({
  schema: z.literal("ggd-workflow-upload-sidecar@1"), projectId: z.string(),
  displayName: z.string(), identity: z.string(), sourceOwnerText: z.string(),
  reviewText: z.string(), slots: z.array(zSidecarSlot).length(6),
});

export function importHeroHandoff(rawProject: unknown, sidecarText: string): HeroProject {
  if (new TextEncoder().encode(sidecarText).byteLength > 4 * 1024 * 1024) throw new Error("單份英雄交接資料超過 4 MiB。");
  const project = zHeroProject.parse(rawProject);
  const source = zSidecar.parse(JSON.parse(sidecarText));
  if (project.projectId !== source.projectId || project.brief.name !== source.displayName || !project.acceptedPlan) throw new Error("英雄作品與交接原稿的身分或名稱不一致。");
  if (new Set(source.slots.map((slot) => slot.slot)).size !== HERO_SLOTS.length) throw new Error("交接資料必須完整包含六個不重複的技能槽。");
  for (const slot of source.slots) if (project.acceptedPlan.slots[slot.slot].name !== slot.name) throw new Error(`${slot.slot} 招式名稱與原稿不同，請先核對配對檔案。`);
  const design = zHeroSourceDesign.parse({
    schema: "ggd-hero-source-design@1", sourceSha256: sha256Bytes(new TextEncoder().encode(sidecarText)),
    name: source.displayName, identity: source.identity, ownerText: source.sourceOwnerText, reviewText: source.reviewText,
    slots: Object.fromEntries(source.slots.map((slot) => [slot.slot, {
      name: slot.name, ownerDescription: slot.ownerDescription, baselineBehavior: slot.currentBehavior,
      requiredRefinement: slot.requiredRefinement, refinementContracts: slot.refinementContracts,
    }])) as HeroSourceDesign["slots"],
  });
  project.sections.identity.fieldOwnership["brief.name"] = "locked";
  for (const slot of HERO_SLOTS) {
    project.sections.identity.fieldOwnership[`brief.moveNames.${slot}`] = "locked";
    project.sections.skills.fieldOwnership[`acceptedPlan.slots.${slot}.name`] = "locked";
  }
  return zHeroProject.parse({ ...project, revision: project.revision + 1, sourceDesign: design });
}

const zHandoffIndex = z.object({
  schema: z.literal("ggd-workflow-handoff-index@1"),
  heroCount: z.number().int().min(1).max(100), slotCount: z.number().int().min(6).max(600),
  heroes: z.array(z.object({ index: z.string(), name: z.string(), projectId: z.string(), project: z.string(), recipe: z.string() })).min(1).max(100),
});

/** Validate the complete batch before the editor persists any new draft. */
export function importHeroHandoffBatch(indexText: string, files: ReadonlyMap<string, string>): HeroProject[] {
  if (new TextEncoder().encode(indexText).byteLength > 1024 * 1024) throw new Error("英雄交接索引超過 1 MiB。");
  const index = zHandoffIndex.parse(JSON.parse(indexText));
  if (index.heroCount !== index.heroes.length || index.slotCount !== index.heroes.length * HERO_SLOTS.length ||
      new Set(index.heroes.map((hero) => hero.projectId)).size !== index.heroes.length || new Set(index.heroes.map((hero) => hero.index)).size !== index.heroes.length) throw new Error("交接索引的英雄數、技能槽數或身分重複，請核對完整資料夾。");
  return index.heroes.map((entry) => {
    const read = (path: string) => {
      if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("交接檔案路徑不合法。");
      const text = files.get(path);
      if (text === undefined) throw new Error(`${entry.name} 缺少 ${path}。`);
      if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024) throw new Error(`${path} 超過 4 MiB。`);
      return text;
    };
    const project = importHeroHandoff(JSON.parse(read(entry.project)), read(entry.recipe));
    if (project.projectId !== entry.projectId || project.brief.name !== entry.name) throw new Error(`${entry.name} 與索引指向的英雄不一致。`);
    return project;
  });
}
