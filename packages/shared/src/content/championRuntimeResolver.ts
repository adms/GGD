import { forgeChampion } from "./heroForge";
import type { ChampionStatOverrides } from "./schema/championStats";
import {
  resolveChampionStats, statNormalizationFromDoc, NORMALIZED_STAT_TO_STAT,
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
  const overrides = doc.statOverrides as ChampionStatOverrides | undefined;
  let authored = doc;
  if (overrides) {
    if (typeof doc.origin !== "string") throw new Error("statOverrides requires an explicit origin reference");
    const defaults = forgeChampion({ id: String(doc.id), name: String(doc.name), description: String(doc.description ?? ""),
      origin: doc.origin as Origin, attackType: doc.attackType as "melee" | "ranged", overrides: { attributes: overrides.attributes },
    }).draft;
    authored = { ...doc, baseStats: defaults.baseStats, growth: defaults.growth, attributes: defaults.attributes };
  }
  const normalized = resolveChampionStats(authored, statNormalizationFromDoc(configs.find((config) => config.schema === "config.stat-normalization@1")), STAT_RESOLVE_DEPS);
  const resolved = resolveSpeedGrowthTiers(normalized, speedGrowthTiersFromDoc(configs.find((config) => config.schema === "config.speed-growth-tiers@1"))) as Record<string, unknown>;
  if (!overrides) return resolved as T;
  const out: Record<string, unknown> = { ...resolved,
    baseStats: { ...(resolved.baseStats as object), ...overrides.baseStats },
    growth: { ...(resolved.growth as object), ...overrides.growth },
  };
  // This is runtime output. Keeping the authoring marker would seed it twice.
  delete out.statOverrides;
  return out as T;
}
