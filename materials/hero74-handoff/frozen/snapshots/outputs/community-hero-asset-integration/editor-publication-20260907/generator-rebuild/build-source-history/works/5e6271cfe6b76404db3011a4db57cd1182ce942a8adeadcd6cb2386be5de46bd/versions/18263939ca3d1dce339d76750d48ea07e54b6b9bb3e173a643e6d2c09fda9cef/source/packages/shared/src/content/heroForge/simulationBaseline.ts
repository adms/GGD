import { ContentStore } from "../store";
import { validateDoc } from "../loader";
import { Arenas, registerAll } from "../registries";
import { isCollectionName, type CollectionName } from "../schema/index";
import { contentSha256 } from "../import/jcs";
import { worldCombatRules } from "../worldCombatRules";
import { emptyRegistryContext, extendRegistryContext, withRegistryContext, type RegistryContext } from "../../sim/content/registryContext";
import { registerSkeletonContent } from "../../sim/content/skeleton";
import type { ArenaDef } from "../../sim/world/ArenaDef";

// Every collection consumed by SimWorld/registerAll, excluding render-only
// documents. Configs, statuses, items and proxy/transform targets must be present
// even when they are not directly named by the six authored template cards.
export const HERO_SIMULATION_COLLECTIONS = ["champions", "abilities", "items", "augments", "projectiles", "status-effects", "loot-tables", "arenas", "config", "ability-templates"] as const satisfies readonly CollectionName[];
export interface HeroSimulationBaseline {
  context: RegistryContext;
  digest: string;
  arena: ArenaDef;
  rules: ReturnType<typeof worldCombatRules>;
  counts: Readonly<Record<string, number>>;
}

/** Full Main catalog, parsed and registered once; ambient roots never leak in. */
export function createHeroSimulationBaseline(documents: ReadonlyMap<string, Record<string, unknown>>, arenaId = "arena.skeleton"): HeroSimulationBaseline {
  const store = new ContentStore();
  const selected = [...documents].filter(([key]) => (HERO_SIMULATION_COLLECTIONS as readonly string[]).includes(key.split("/")[0]!)).sort(([a], [b]) => a.localeCompare(b, "en"));
  for (const [key, raw] of selected) {
    const collection = key.split("/")[0]!;
    if (!isCollectionName(collection) || key !== `${collection}/${raw.id}`) throw new Error(`模擬基線身分不符：${key}`);
    const parsed = validateDoc(collection, raw);
    if (!parsed.ok) throw new Error(`模擬基線無效：${key} ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；")}`);
    store.add(collection, String(raw.id), parsed.doc);
  }
  for (const collection of HERO_SIMULATION_COLLECTIONS) if (!store.count(collection)) throw new Error(`模擬基線缺少 ${collection}，不能使用部分目錄驗收。`);
  const digest = contentSha256(selected.map(([key]) => [key, store.get(key.split("/")[0] as CollectionName, key.slice(key.indexOf("/") + 1))]));
  const context = extendRegistryContext(emptyRegistryContext("hero-simulation-empty"), digest, () => {
    registerAll(store, { onTemplateFailure: "throw" });
    registerSkeletonContent();
  });
  return { context, digest, arena: withRegistryContext(context, () => Arenas.get(arenaId)),
    rules: worldCombatRules(store.all("config")), counts: Object.fromEntries(HERO_SIMULATION_COLLECTIONS.map((collection) => [collection, store.count(collection)])) };
}
