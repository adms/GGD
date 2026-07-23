/**
 * The single source of truth for WHICH sim events are fanned out to clients on
 * the MSG.EVENT channel.
 *
 * WHY THIS EXISTS AS ONE LIST. Every combat VISUAL in this game — floating
 * damage/heal/mana numbers, attack and cast animations, hit sparks, projectiles,
 * ability VFX, the shop-feedback toasts — is driven by drained MSG.EVENT
 * messages, NOT by the replicated `MatchState` schema. The live `MatchRoom` and
 * the `ReplayRoom` therefore MUST forward the exact same set, or a replay would
 * render a stripped-down, combat-mute version of the match (HP bars drain with
 * no numbers, champions slide between positions without swinging). The replay is
 * the owner's only feedback channel, so "why round 3 was weird" has to be
 * visible there too. Keeping the whitelist in one place makes it impossible for
 * the two rooms to drift apart.
 */
import type { SimEvent } from "@ggd/shared/sim/SimWorld";

/**
 * The per-tick sim events the client renderer consumes. Ordered/commented by
 * concern so the reasoning behind each inclusion survives.
 */
export const FANNED_OUT_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  // core combat legibility (task #60/#92): damage drives 造成/受到傷害 numbers
  "abilityCast",
  "damage",
  "death",
  "projectileSpawn",
  "projectileHit",
  // a missile that expired without hitting anything → client fizzle, so a ranged
  // auto that whiffs still resolves visually
  "projectileEnd",
  "levelUp",
  "castBegin",
  "castEnd",
  "castInterrupt",
  "attackWindup",
  "basicAttack",
  "basicAttackHit",
  "hitImpact",
  "knockdown",
  "whiff",
  "guardBreak",
  "flowerSpawn",
  "flowerBurst",
  // NEUTRAL DUEL-ZONE GUARDIAN (task #89/#105). Without these the guardian is a
  // ghost: it exists in the sim and deals/takes damage, but the client sees no
  // wake, no health drain feedback, no PRE-LAND punish telegraph (so nobody can
  // dodge), and no last-hit reward. `guardianMark` is the dodge cue (carries the
  // impactTick + the post-multiplier AoE radius); `guardianSlain` names who got
  // the last-hit bounty. Same one-list contract as every other combat visual, so
  // the ReplayRoom forwards the identical set.
  "guardianSpawn",
  "guardianWake",
  "guardianSleep",
  "guardianMark",
  "guardianImpact",
  "guardianHeirPulse",
  "guardianSlain",
  // FLOATING COMBAT TEXT (task #92): 補血 / 補魔 — the half `damage` does not
  // carry. Emitted only for DISCRETE restores, so no steady-state regen spam.
  "heal",
  "manaRestore",
  // revive circles (task #84): spawn/end drive world VFX + the HUD banner.
  "reviveCircleSpawn",
  "reviveCircleEnd",
  "reviveComplete",
  "vfxSpawn",
  // SHOP FEEDBACK (task #38/#60): purchase/sale confirmations + every REJECTION
  // so the client can explain 金幣不足 / 背包已滿 / … instead of a dead button.
  "itemBought",
  "itemSold",
  "buyRejected",
  "sellRejected",
  // buy/sell UNDO (task #121): confirmation + rejection for the undo button.
  "shopUndone",
  "undoRejected",
]);

/** True when this sim event should be broadcast to clients on MSG.EVENT. */
export function isFannedOutEvent(ev: SimEvent): boolean {
  return FANNED_OUT_EVENT_TYPES.has(ev.type);
}
