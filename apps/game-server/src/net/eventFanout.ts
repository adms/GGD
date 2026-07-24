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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE FOR ADDING TO IT — READ THIS BEFORE YOU ADD A `world.emit`
 *
 * A whitelist FAILS SILENTLY. An event that the sim emits and the client has a
 * handler for, but that is missing here, produces no error, no warning and no
 * crash: the feature simply never happens in a real match. That is exactly how
 * `evade` / `explosion` / `buffApply` / `reviveChannel` / `fireRingStart` /
 * `rankUp` sat "complete, tested and shipping" for months while being invisible
 * in game (audit: docs/_false-completions.md, class S2).
 *
 * So the contract is: EVERY `world.emit("x", …)` in packages/shared/src/sim
 * MUST appear in EXACTLY ONE of the two sets below —
 *   • `FANNED_OUT_EVENT_TYPES` — it crosses the wire, with a stated consumer;
 *   • `SERVER_ONLY_EVENT_TYPES` — it deliberately does NOT, with a stated reason.
 * `eventFanout.test.ts` scrapes the sim for emit sites and goes red on any event
 * that is in neither (a new emit with nobody having made the call) or in both.
 * Adding a sim event is therefore a two-file change, on purpose.
 *
 * Three things to check before you move a name into the fanned-out set:
 *   1. CADENCE. This is an unfiltered broadcast to every client, every tick. A
 *      per-tick or per-tick-per-champion event is a wire flood, not a visual —
 *      see `fireRingTick` / `fireRingDamage` below for how that is handled.
 *   2. PAYLOAD. `MatchRoom`/`ReplayRoom` forward `ev.data` WHOLE and unchanged,
 *      so anything msgpack can encode survives — but the CONSUMER's field names
 *      must match what the emit site actually writes. An event that arrives with
 *      the wrong shape is worse than one that never arrives, because the handler
 *      silently no-ops and the feature still looks "done".
 *   3. DOUBLE-FIRE. Some cues are already derived client-side from schema edges
 *      (`audio/sfxEdges.ts` diffs the local tally for kill/death/levelUp/exUnlock).
 *      Fanning out the sim twin of one of those makes the sound play twice —
 *      which is why `death`/`levelUp` cross the wire for VFX but are left
 *      unmapped in `audio/combatSfx.ts`.
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
  // A DODGED BASIC ATTACK (sim/combat/evasion.ts). `whiff` (the attacker missed
  // on their own) has always crossed; `evade` (the DEFENDER's 迴避 stat ate the
  // swing) did not, so the single most-asked-about stat in the game produced no
  // feedback whatsoever — the hit just silently did nothing, indistinguishable
  // from a dropped packet or a bug. Carries `{ source, target, x, z }`, i.e. the
  // victim's world position, so the floating MISS text has somewhere to spawn.
  // Emitted ONLY from the basic-attack path and only when `evasion > 0`, so its
  // rate is bounded by attack speed, not by ticks.
  "evade",
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
  // GROUND-AOE DETONATION → the 爆裂 cue + blast VFX (audio COMBAT-AUDIO). Two
  // emit sites for the ONE moment, and they are mutually exclusive per cast: an
  // instant ground ability blasts in `abilitySystem` the tick it is cast, one
  // with a cast time blasts in `CastResolveSystem` when the wind-up elapses.
  // `{ caster, abilityId, x, z }` — the point, so the effect plays where the
  // ability landed rather than on the caster.
  "explosion",
  // A STAT BUFF ACTUALLY ATTACHED (effects/effectRunner). One discrete 增益 cue
  // per resolved buff effect, fired only when the target set was non-empty, so
  // an ability that buffed nobody stays silent. Rate is bounded by casts.
  "buffApply",
  // revive circles (task #84): spawn/end drive world VFX + the HUD banner.
  "reviveCircleSpawn",
  "reviveCircleEnd",
  // A TEAMMATE COMMITTED TO A REVIVE (task #84). Fires on the 0→>0 channel edge
  // only — not per channelling tick — so the 詠唱進行中 bed plays once per fresh
  // commitment. Without it the dead player's screen gave no sign that anyone had
  // come for them, which is the whole emotional beat of the mechanic.
  "reviveChannel",
  "reviveComplete",
  "vfxSpawn",
  // THE FIRE RING BEGINS TO CLOSE (task #132) — the one-shot ignition beat, the
  // 火圈 scene cue. START ONLY: see `fireRingTick`/`fireRingDamage` in the
  // server-only set for the per-tick twins that must NOT cross the wire.
  "fireRingStart",
  // A SKILL POINT WAS SPENT (abilities/abilitySystem). The 技能升級 chime + the
  // ability bar's rank pip. `levelUp` already crosses; without its twin, ranking
  // Q up was the only progression beat in the game with no feedback at all.
  // `{ id, slot, rank }` — `id` is the ENTITY, not a seat, so a client cue that
  // should only fire for the local hero has to gate on it (the same way
  // `combatSfx.guardianRewardKey` gates the bounty chime on the local seat).
  "rankUp",
  // SHOP FEEDBACK (task #38/#60): purchase/sale confirmations + every REJECTION
  // so the client can explain 金幣不足 / 背包已滿 / … instead of a dead button.
  "itemBought",
  "itemSold",
  "buyRejected",
  "sellRejected",
  // buy/sell UNDO (task #121): confirmation + rejection for the undo button.
  "shopUndone",
  "undoRejected",
  // CAST FEEDBACK (playtest P7). `CommandSystem` has always emitted this with
  // the exact `CastResult` — 冷卻中 / 魔力不足 / 尚未學習 / 距離太遠 / 沒有目標 —
  // and this whitelist filtered it out before it reached a socket, so pressing
  // Q on a cooling ability was indistinguishable from a dropped packet. It is
  // the ability bar's exact analogue of `buyRejected` and belongs to the same
  // one-list contract, so the replay explains a fumbled round too.
  "castRejected",
]);

/**
 * Sim events that are emitted but DELIBERATELY never broadcast — each with the
 * reason, so "it's missing" can be told apart from "nobody decided". Listing
 * them is what lets `eventFanout.test.ts` prove the sim's emit set is fully
 * classified; a name here is a decision, not an oversight.
 */
export const SERVER_ONLY_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  // ── WIRE FLOOD: per-tick, and the client already has the beat it needs ─────
  // `fireRingTick` is emitted UNCONDITIONALLY every tick from the moment the
  // ring arms until the round ends — 30 messages/second/client for ~60 s, and
  // it carries only `{ ratePerSec, ticksSinceStart }`, which the client can
  // derive from `fireRingStart` + its own clock. `fireRingDamage` is worse: one
  // message PER LIVING CHAMPION per tick (~12 × 30 = 360/s) of pure %-HP burn.
  // Neither has a consumer (`audio/combatSfx` maps `fireRingStart` alone), and
  // the HP drain is already visible through the replicated health in
  // `MatchState`. If the ring ever needs a per-tick client visual, send a
  // THROTTLED intensity event — do not open these two.
  "fireRingTick",
  "fireRingDamage",
  // ── NO CONSUMER: bookkeeping the client re-derives from state ─────────────
  // Aura attach/detach churn (sim/aura/aura.ts). Transition-only, but a unit
  // walking the aura boundary attaches/detaches on ALTERNATE TICKS whenever
  // content leaves `lingerSec` at its 0 default (DECISION 6), so the worst case
  // is emitters × targets × 15 Hz of flicker. Nothing on the client listens;
  // the resulting stat change is already replicated. Needs a debounced,
  // presentation-shaped event (or the linger knob set) before it can cross.
  "auraApply",
  "auraEnd",
  // Post-cast recovery / 後搖 window (abilities/abilityRecovery + RecoverySystem).
  // Cast-bounded, so cadence is fine — but there is no client handler and no
  // recovery indicator in the HUD today, and the payload is sim-internal
  // (`ticksSaved`, `reason: hit|interrupt|elapsed`). Fan these out together
  // WITH the UI that draws them, not before: an event with no consumer is
  // indistinguishable on the wire from one whose consumer silently no-ops.
  "recoveryBegin",
  "recoveryEnd",
  // Guardian's last-hit buff expiring (GuardianSystem). The buff itself shows
  // through replicated stats; no cue was ever authored for its end.
  "guardianBuffExpire",
  // ── ALREADY DELIVERED ANOTHER WAY — fanning out would duplicate ───────────
  // Draft + shop economy. The 3-choose-1 offers reach the client as
  // `SeatState.offers` in the replicated schema (net/snapshot.ts), and the
  // RESULT of a pick shows up as gold/items/stats in the same schema. Only the
  // shop's own accept/reject toasts (`itemBought`/`buyRejected`/…) are event-
  // driven, and those are already whitelisted above.
  "augmentOffer",
  "augmentPicked",
  "itemOffer",
  "itemPicked",
  "gachaItem",
  "legendaryOrbRolled",
  "statUpgradeBought",
  "statCapstoneGranted",
  "statPathReset",
  // Command echoes from CommandSystem: the seat's ready flag and the accepted
  // offer id are both replicated state — the echo is for server-side traces.
  "ready",
  "pickOffer",
  // Entity creation. The client learns a champion exists from the entity map in
  // `MatchState`; the event carries the same identity with no extra art data.
  "championSpawn",
  // EX unlocked. The client's `audio/sfxEdges` already derives this from the
  // 0→1 `exRank` edge on the LOCAL seat's schema — correctly seat-gated, which
  // the broadcast event would not be. Fanning it out would ring the sting a
  // second time, for every champion in the match. (Same reason `death` and
  // `levelUp` cross the wire for VFX but stay unmapped in `combatSfx`.)
  "exUnlock",
]);

/** True when this sim event should be broadcast to clients on MSG.EVENT. */
export function isFannedOutEvent(ev: SimEvent): boolean {
  return FANNED_OUT_EVENT_TYPES.has(ev.type);
}
