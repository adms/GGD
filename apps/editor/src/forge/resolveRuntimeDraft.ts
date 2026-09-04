import type { TemplateDoc } from "@ggd/shared/content";
import { aoeTiersFromDoc, resolveRadiusTier } from "@ggd/shared/content/aoeTiers";
import { DEFAULT_CAST_TIME_TIERS, resolveCastTimeTierOnDoc } from "@ggd/shared/content/castTimeTiers";
import { cooldownTiersFromDoc, resolveCooldownTier } from "@ggd/shared/content/cooldownTiers";
import { damageTiersFromDoc, resolveDamageTier } from "@ggd/shared/content/damageTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
  resolveDisplacementTier,
} from "@ggd/shared/content/displacementTiers";
import { manaTiersFromDoc, resolveManaCostTier } from "@ggd/shared/content/manaTiers";
import { resolveModelFxPreset } from "@ggd/shared/content/modelFxPreset";
import { moveSpeedTiersFromDoc, resolveMsBonusTier } from "@ggd/shared/content/moveSpeedTiers";
import {
  DEFAULT_RANK_GROWTH_RULES,
  resolveRankGrowthOnDoc,
  type RankGrowthRules,
} from "@ggd/shared/content/rankGrowth";
import { rangeTiersFromDoc, resolveRangeTier } from "@ggd/shared/content/rangeTiers";
import {
  normalizeComboTable,
  resolveComboFamilies,
} from "@ggd/shared/sim/effects/comboFamilies";
import type { RuntimeResolverConfigDocs } from "./skillTierCatalog";

/**
 * Resolve an Editor draft with Main's shipped resolver bricks before Sim sees
 * it. This is deliberately an adapter, not a second implementation: every
 * lookup and rewrite below calls the authoritative Main helper.
 *
 * Order mirrors `content/registries.ts::withTiers`. Rank growth must remain
 * last because it consumes the flat damage written by `resolveDamageTier`.
 */
export function resolveRuntimeDraft(
  doc: Readonly<Record<string, unknown>>,
  templates: ReadonlyMap<string, TemplateDoc>,
  configs: RuntimeResolverConfigDocs,
): Record<string, unknown> {
  const configDocs = Object.values(configs).filter(
    (value): value is Record<string, unknown> => value !== undefined,
  );

  let resolved = resolveModelFxPreset({ ...doc }, templates);
  resolved = resolveRadiusTier(resolved, aoeTiersFromDoc(configs["aoe-tiers"]));
  resolved = resolveRangeTier(resolved, rangeTiersFromDoc(configs["range-tiers"]));
  resolved = resolveDisplacementTier(
    resolved,
    displacementTiersFromDoc(
      configs["displacement-tiers"],
      minBodyRadiusFromConfigs(configDocs),
    ),
  );
  resolved = resolveDamageTier(resolved, damageTiersFromDoc(configs["damage-tiers"]));
  resolved = resolveCooldownTier(resolved, cooldownTiersFromDoc(configs["cooldown-tiers"]));
  resolved = resolveManaCostTier(resolved, manaTiersFromDoc(configs["mana-tiers"]));
  resolved = resolveComboFamilies(
    resolved,
    normalizeComboTable(configs["combo-strikes"]),
  );
  resolved = resolveMsBonusTier(
    resolved,
    moveSpeedTiersFromDoc(configs["move-speed-tiers"]),
  );
  resolved = resolveCastTimeTierOnDoc(
    resolved,
    (configs["cast-time-tiers"] as unknown as typeof DEFAULT_CAST_TIME_TIERS | undefined)
      ?? DEFAULT_CAST_TIME_TIERS,
  );
  return resolveRankGrowthOnDoc(
    resolved,
    (configs["rank-growth"] as unknown as RankGrowthRules | undefined)
      ?? DEFAULT_RANK_GROWTH_RULES,
  );
}
