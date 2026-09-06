import { forgeChampion } from "./heroForge";
import {
  resolveChampionRole, resolveChampionStats, statNormalizationFromDoc, NORMALIZED_STAT_TO_STAT,
  type StatResolveDeps, type NormalizedStatKey, type Origin,
} from "./statNormalization";
import { resolveSpeedGrowthTiers, speedGrowthTiersFromDoc } from "./speedGrowthTiers";
import { championStatBase } from "../sim/stats/attributes";

const STAT_RESOLVE_DEPS: StatResolveDeps = Object.freeze({
  statAt: (def: unknown, key: NormalizedStatKey, level: number): number => {
    const d = def as { baseStats?: unknown; growth?: unknown };
    return championStatBase({ ...d, baseStats: d.baseStats ?? {}, growth: d.growth ?? {} } as never, NORMALIZED_STAT_TO_STAT[key], level);
  },
});

/** Registration and Editor use the same origin → normalization → override path. */
export function resolveChampionRuntimeStats<T extends object>(source: T, configs: readonly { schema?: string }[]): T {
  const doc = source as Record<string, unknown>;
  let authored = doc;
  // A generated sparse hero references its origin instead of baking its seed.
  // Existing Main champions keep their authored attributes and base values.
  if (typeof doc.origin === "string" && doc.attributes === undefined
    && Object.keys((doc.baseStats as object) ?? {}).length === 0
    && Object.keys((doc.growth as object) ?? {}).length === 0) {
    const defaults = forgeChampion({ id: String(doc.id), name: String(doc.name), description: String(doc.description ?? ""),
      origin: doc.origin as Origin, attackType: doc.attackType as "melee" | "ranged",
    }).draft;
    authored = { ...doc, baseStats: defaults.baseStats, growth: defaults.growth, attributes: defaults.attributes };
  }
  const normalization = statNormalizationFromDoc(configs.find((config) => config.schema === "config.stat-normalization@1"));
  const normalized = resolveChampionStats(authored, normalization, STAT_RESOLVE_DEPS);
  const resolved = resolveSpeedGrowthTiers(normalized, speedGrowthTiersFromDoc(configs.find((config) => config.schema === "config.speed-growth-tiers@1"))) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...resolved, role: resolveChampionRole(resolved, normalization) };
  // This is runtime output. Keeping the authoring marker would seed it twice.
  delete out.statOverrides;
  return out as T;
}
