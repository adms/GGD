import { useQuery } from "@tanstack/react-query";
import { ContentLoader, HttpContentSource, HERO_SIMULATION_COLLECTIONS, type TemplateDoc, type ProjectileDoc } from "@ggd/shared/content";
import { zTemplateDoc } from "@ggd/shared/content/schema/template";
import type { VfxSubtypeDoc } from "@ggd/shared/content/schema/vfxSubtype";
import { pickableTemplateIds } from "../forge/typeCatalog";

// Shipped catalog is available even before this device has a network session.
const simulationFiles = import.meta.glob("../../../../content/{champions,abilities,items,augments,projectiles,status-effects,loot-tables,arenas,config,ability-templates,vfx-subtypes}/*.json", { eager: true, import: "default" });
const modelFiles = import.meta.glob("../../../../content/models/*.json", { eager: true, query: "?url", import: "default" });

export interface HeroCatalog {
  templates: TemplateDoc[];
  configs: Record<string, unknown>[];
  projectiles: ProjectileDoc[];
  vfxSubtypes?: VfxSubtypeDoc[];
  modelIds: string[];
  simulationDocuments: Array<[string, Record<string, unknown>]>;
  source: "local-api" | "bundled";
}
function fromDocuments(simulationDocuments: HeroCatalog["simulationDocuments"], modelIds: ReadonlySet<string>, source: HeroCatalog["source"]): HeroCatalog {
  const docs = (collection: string) => simulationDocuments.filter(([key]) => key.startsWith(`${collection}/`)).map(([, document]) => document);
  return { simulationDocuments, source, configs: docs("config"),
    templates: docs("ability-templates").flatMap((value) => {
      const parsed = zTemplateDoc.safeParse(value);
      return parsed.success && pickableTemplateIds("doc").has(parsed.data.id) ? [parsed.data] : [];
    }),
    projectiles: docs("projectiles") as unknown as ProjectileDoc[],
    vfxSubtypes: docs("vfx-subtypes") as unknown as VfxSubtypeDoc[],
    // Body models come from real champion bindings. FX/props are never offered
    // as a body just because they happen to be model@1 documents too.
    modelIds: [...new Set(docs("champions").map((doc) => String(doc.modelKey)).filter((id) => modelIds.has(id)))].sort(),
  };
}
const simulationDocuments: HeroCatalog["simulationDocuments"] = Object.entries(simulationFiles).flatMap(([path, raw]) => {
  const document = raw as Record<string, unknown>;
  return typeof document.id === "string" && !path.split("/").at(-1)!.startsWith("_") ? [[`${path.split("/").at(-2)}/${document.id}`, document]] : [];
});
export const bundledHeroCatalog = fromDocuments(simulationDocuments, new Set(Object.keys(modelFiles).map((path) => path.split("/").at(-1)!.replace(/\.json$/, ""))), "bundled");

export function useHeroCatalog() {
  return useQuery({
    queryKey: ["hero-catalog"], initialData: bundledHeroCatalog,
    queryFn: async (): Promise<HeroCatalog> => {
      try {
        const { store } = await new ContentLoader(new HttpContentSource({ baseUrl: "/content-api", mode: "api", fetchFn: (input, init) => globalThis.fetch(input, init) })).load({ policy: "fail-closed" });
        return fromDocuments([...HERO_SIMULATION_COLLECTIONS, "vfx-subtypes" as const].flatMap((collection) => store.all<Record<string, unknown>>(collection).map((document) => [`${collection}/${document.id}`, document] as [string, Record<string, unknown>])), new Set(store.ids("models")), "local-api");
      } catch { return bundledHeroCatalog; }
    },
    staleTime: 30_000,
  });
}
