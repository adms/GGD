import { resolveShippedTemplateVersion } from "../src/content/templates/shippedHistory";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTION_NAMES, type TemplateDoc } from "../src/content/schema";
import { zHeroProject, type HeroProject } from "../src/content/heroForge/schema";
import { HERO_SECTION_IDS } from "../src/content/heroForge/constants";
import { createDeterministicHeroPlans } from "../src/content/heroForge/planner";
import { defaultHeroPresentation } from "../src/content/heroForge/presentation";
import type { HeroPackageCatalog } from "../src/content/import/heroPackage";

export function shippedHeroCatalog(): HeroPackageCatalog {
  const root = resolve(import.meta.dirname, "../../../content");
  const documents = new Map<string, Record<string, unknown>>();
  for (const collection of COLLECTION_NAMES) for (const file of readdirSync(resolve(root, collection))) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const document = JSON.parse(readFileSync(resolve(root, collection, file), "utf8")) as Record<string, unknown>;
    documents.set(`${collection}/${document.id}`, document);
  }
  return { documents, resolveTemplateVersion: resolveShippedTemplateVersion, readAsset: (path) => existsSync(resolve(root, path)) ? new Uint8Array(readFileSync(resolve(root, path))) : undefined };
}

export function heroPackageProject(catalog: HeroPackageCatalog, projectId = "community-package-proof"): HeroProject {
  const templates = [...catalog.documents.entries()].filter(([key, doc]) => key.startsWith("ability-templates/") && doc.status === "enabled").map(([, doc]) => doc as TemplateDoc);
  const brief = { name: "封包驗證英雄", concept: "完整 Owner 原文。\n「這句玩笑不代表技能機制！」\n第三行仍保留。", moveNames: {} };
  const sourceLock = { canonicalId: "original-character", versionId: "original-version" };
  const acceptedPlan = createDeterministicHeroPlans({ projectId, brief, sourceLock, origin: "鬥士", availableTemplateIds: templates.map((template) => template.id), availableTemplates: templates })[0]!;
  acceptedPlan.slots.Q.products.push({ ...structuredClone(acceptedPlan.slots.Q.products[0]!), instanceId: "repeated-product" });
  acceptedPlan.slots.Q.templateConflictPolicy = "lastWins";
  return zHeroProject.parse({ schema: "ggd-hero-project@2", projectId, revision: 8, brief, sourceLock, acceptedPlan,
    presentation: defaultHeroPresentation(), receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map((section) => [section, { revision: 8, state: "draft", fieldOwnership: section === "skills" ? { "acceptedPlan.slots.Q.products.1": "locked" } : {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map((section) => [section, { revision: 8, status: "idle", diagnosticCodes: [] }])),
  });
}
