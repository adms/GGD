import type { SimWorld } from "../sim/SimWorld";
import { normalizeCombatEnv, type CombatEnvKey } from "../sim/combatEnv";
import { baseBonusFromDoc, perLevelBonusFromDoc } from "../sim/baseBonus";
import { statCapsFromDoc } from "../sim/statCaps";
import { markedBlinkFromDoc } from "../sim/movement/markedBlink";
import { wallBlockFromDoc } from "../sim/movement/wallBlock";
import { combatFeelFromDoc, COMBAT_FEEL_DOC_ID } from "../sim/combatFeel";
import { shieldRulesFromDoc, SHIELD_DOC_ID } from "../sim/shieldRules";
import { blockRulesFromDoc, BLOCK_DOC_ID } from "../sim/blockRules";
import { critRulesFromDoc, CRIT_DOC_ID } from "../sim/critRules";
import { berserkRulesFromDoc, BERSERK_DOC_ID } from "../sim/abilities/berserkRules";
import { dispelRulesFromDoc, DISPEL_DOC_ID } from "../sim/dispelRules";
import { cooldownRulesFromDoc, COOLDOWN_RULES_DOC_ID } from "../sim/cooldownRules";
import { castTimeRulesFromDoc, CAST_TIME_RULES_DOC_ID } from "../sim/castTimeRules";
import { woundRulesFromDoc, WOUNDS_DOC_ID } from "../sim/grievousWounds";
import { weaknessRulesFromDoc, WEAKNESS_DOC_ID } from "../sim/weakness";
import { damageRulesFromDoc, DAMAGE_RULES_DOC_ID } from "../sim/damageRules";
import { apDamageScalingFromDoc, AP_DAMAGE_SCALING_DOC_ID } from "../sim/combat/apDamageScaling";
import { mitigationRulesFromDoc, MITIGATION_DOC_ID } from "../sim/combat/penetration";
import { augmentEnemyFilterFromDoc, AUGMENT_ENEMY_FILTER_DOC_ID } from "../sim/augmentEnemyFilter";
import { stealthRulesFromDoc, STEALTH_DOC_ID } from "../sim/stealth";
import { tauntRulesFromDoc, TAUNT_DOC_ID } from "../sim/taunt";
import { bodyScaleRulesFromDoc, BODY_SCALE_DOC_ID } from "../sim/bodyScale";
import { regenRulesFromDoc, REGEN_DOC_ID } from "../sim/regenRules";
import { manaEconomyFromDoc, MANA_ECONOMY_DOC_ID } from "../sim/manaEconomy";
import { visionRulesFromDoc } from "../sim/vision";
import { normalizeEconomyRules } from "../sim/economy/economyRules";
import { retiredChampionIdsFromDoc } from "./championRetirement";
import { resolveControllerSchemeOrDefault, CONTROLLER_SCHEME_DOC_ID } from "./schema/config/controllerScheme";
import { SHIPPED_ONE_SHOT_CLAMP, type ConfigOneShotClampDoc } from "./schema/config/oneShotClamp";

/** The same normalizers used by MatchController, snapshotted before tick zero. */
export function worldCombatRules(configs: readonly { id?: unknown }[]) {
  const byId = new Map(configs.map((doc) => [String(doc.id), doc as Record<string, unknown>]));
  const get = (id: string) => byId.get(id);
  const match = get("config.match") as { economy?: Record<string, unknown>; progression?: Record<string, unknown> } | undefined;
  return {
    combatEnv: normalizeCombatEnv(get("combat-env")?.multipliers as Partial<Record<CombatEnvKey, number>> | undefined),
    oneShotClamp: (get("one-shot-clamp") as unknown as ConfigOneShotClampDoc | undefined) ?? SHIPPED_ONE_SHOT_CLAMP,
    baseBonus: baseBonusFromDoc(get("base-bonus")),
    perLevelBonus: perLevelBonusFromDoc(get("per-level-bonus")),
    wallBlock: wallBlockFromDoc(get("displacement-tiers")),
    markedBlink: markedBlinkFromDoc(get("displacement-tiers")),
    statCaps: statCapsFromDoc(get("stat-caps")),
    combatFeel: combatFeelFromDoc(get(COMBAT_FEEL_DOC_ID)),
    economy: normalizeEconomyRules({ ...match?.economy, roundGrantKeepsRemainder: match?.progression?.roundGrantKeepsRemainder }),
    controllerScheme: resolveControllerSchemeOrDefault(get(CONTROLLER_SCHEME_DOC_ID)).scheme,
    shieldRules: shieldRulesFromDoc(get(SHIELD_DOC_ID)),
    blockRules: blockRulesFromDoc(get(BLOCK_DOC_ID)),
    critRules: critRulesFromDoc(get(CRIT_DOC_ID)),
    berserkRules: berserkRulesFromDoc(get(BERSERK_DOC_ID)),
    dispelRules: dispelRulesFromDoc(get(DISPEL_DOC_ID)),
    cooldownRules: cooldownRulesFromDoc(get(COOLDOWN_RULES_DOC_ID)),
    castTimeRules: castTimeRulesFromDoc(get(CAST_TIME_RULES_DOC_ID)),
    woundRules: woundRulesFromDoc(get(WOUNDS_DOC_ID)),
    weaknessRules: weaknessRulesFromDoc(get(WEAKNESS_DOC_ID)),
    damageRules: damageRulesFromDoc(get(DAMAGE_RULES_DOC_ID)),
    apDamageScaling: apDamageScalingFromDoc(get(AP_DAMAGE_SCALING_DOC_ID)),
    mitigationRules: mitigationRulesFromDoc(get(MITIGATION_DOC_ID)),
    augmentEnemyFilter: augmentEnemyFilterFromDoc(get(AUGMENT_ENEMY_FILTER_DOC_ID)),
    stealthRules: stealthRulesFromDoc(get(STEALTH_DOC_ID)),
    visionRules: visionRulesFromDoc(get("arena-rules")),
    retiredChampionIds: retiredChampionIdsFromDoc(get("roster")),
    tauntRules: tauntRulesFromDoc(get(TAUNT_DOC_ID)),
    bodyScaleRules: bodyScaleRulesFromDoc(get(BODY_SCALE_DOC_ID)),
    regenRules: regenRulesFromDoc(get(REGEN_DOC_ID)),
    manaEconomy: manaEconomyFromDoc(get(MANA_ECONOMY_DOC_ID)),
  } satisfies Partial<SimWorld>;
}
