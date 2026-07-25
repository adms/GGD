/**
 * ArenaRules — the MatchController's data-driven round-rules table, resolved
 * from the `config.arena-rules@1` content doc (LoL-Arena style: per-round
 * level/gold grants, auto-learned QWE, augment tiers, free legendary-weapon
 * offers, R unlock round). DEFAULT_ARENA_RULES reproduces the legacy skeleton
 * behavior EXACTLY (augments rounds 1/3/5, gacha round 2+, classic 6/11/16 R
 * gate, no grants) so every existing unit test and any match created without
 * the doc behaves as before.
 */
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import type { AugmentTier } from "@ggd/shared/sim/content/defs";
import { AUGMENT_TIER_SCHEDULE } from "@ggd/shared/sim/economy/draft";
import { Configs } from "@ggd/shared/content";
import type {
  ConfigArenaRulesDoc,
  FlowerConfig,
  ReviveCircleConfig,
  GuardianTowerConfig,
  GoldDropConfig,
} from "@ggd/shared/content";

export interface RoundGrant {
  grantLevels?: number;
  grantGold?: number;
  autoLearn?: CoreAbilitySlot[];
  augmentTier?: AugmentTier;
  weaponLootTable?: string;
}

export interface ArenaRules {
  /** round from which R is learnable at any level; null = classic 6/11/16 */
  ultUnlockRound: number | null;
  /** round from which champions with an exAbility unlock EX; null = never */
  exUnlockRound: number | null;
  /** choices per offer (augment + weapon offers) */
  offerCount: number;
  /** round number -> grants applied at that round's intermission entry */
  rounds: ReadonlyMap<number, RoundGrant>;
  /** grants for every round past the highest `rounds` key (escalating gold) */
  overflow: {
    grantLevels: number;
    grantGold: number;
    grantGoldPerRound: number;
    /** augment tier offered on overflow rounds (so "every round" stays literal) */
    augmentTier?: AugmentTier;
  } | null;
  /** legacy per-round free item gacha; null = disabled */
  gacha: { fromRound: number; lootTable: string } | null;
  /** healing-flower rules (combat-phase plants); null = no flowers (legacy) */
  flowers: FlowerConfig | null;
  /** revive-circle rules (task #84); null = mechanic off (legacy) */
  reviveCircles: ReviveCircleConfig | null;
  /** neutral duel-zone guardian rules (task #89); null = mechanic off (legacy) */
  guardianTower: GuardianTowerConfig | null;
  /** 陣亡投幣 rules (task #191); null = dead players cannot throw gold (legacy) */
  goldDrop: GoldDropConfig | null;
}

/** Legacy behavior: augment tiers per AUGMENT_TIER_SCHEDULE + round-2+ gacha. */
export const DEFAULT_ARENA_RULES: ArenaRules = {
  ultUnlockRound: null,
  exUnlockRound: null,
  offerCount: 3,
  rounds: new Map(
    Object.entries(AUGMENT_TIER_SCHEDULE).map(([round, tier]) => [
      Number(round),
      { augmentTier: tier },
    ]),
  ),
  overflow: null,
  gacha: { fromRound: 2, lootTable: "round-reward" },
  flowers: null,
  reviveCircles: null,
  guardianTower: null,
  goldDrop: null,
};

/** Convert a parsed config.arena-rules@1 doc into the controller's rule table. */
export function rulesFromDoc(doc: ConfigArenaRulesDoc): ArenaRules {
  const rounds = new Map<number, RoundGrant>();
  for (const [key, grant] of Object.entries(doc.rounds)) {
    if (!grant) continue;
    rounds.set(Number(key), {
      grantLevels: grant.grantLevels,
      grantGold: grant.grantGold,
      autoLearn: grant.autoLearn,
      augmentTier: grant.augmentTier,
      weaponLootTable: grant.weaponLootTable,
    });
  }
  return {
    ultUnlockRound: doc.ultUnlockRound ?? null,
    exUnlockRound: doc.exUnlockRound ?? null,
    offerCount: doc.offerCount,
    rounds,
    overflow: doc.overflow ?? null,
    gacha: doc.gacha ?? null,
    flowers: doc.flowers ?? null,
    reviveCircles: doc.reviveCircles ?? null,
    guardianTower: doc.guardianTower ?? null,
    goldDrop: doc.goldDrop ?? null,
  };
}

/** The grant for a round: explicit table entry, or the overflow escalation. */
export function grantForRound(rules: ArenaRules, round: number): RoundGrant | null {
  const explicit = rules.rounds.get(round);
  if (explicit) return explicit;
  if (!rules.overflow) return null;
  const maxRound = Math.max(0, ...rules.rounds.keys());
  if (round <= maxRound) return null;
  return {
    grantLevels: rules.overflow.grantLevels,
    grantGold: rules.overflow.grantGold + rules.overflow.grantGoldPerRound * (round - maxRound - 1),
    augmentTier: rules.overflow.augmentTier,
  };
}

/**
 * Resolve the active rules from the content registry (populated at boot by the
 * ContentLoader). Absent doc (unit tests / skeleton fallback) -> legacy rules.
 */
export function resolveArenaRules(): ArenaRules {
  const doc = Configs.tryGet("arena-rules") as unknown as ConfigArenaRulesDoc | undefined;
  if (!doc || doc.schema !== "config.arena-rules@1") return DEFAULT_ARENA_RULES;
  return rulesFromDoc(doc);
}
