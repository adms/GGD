/**
 * THE SIXTH SLOT, ACTIVE HALF — making the level-1 天生技 castable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS BROKEN
 *
 * 108 `*.passive.json` innates ship and the sixth button RENDERS in-game. Of
 * them ~48 are `innateKind: "passive"` (permanent self-buffs, live since the
 * passive lane: `syncAbilityPassives` attaches `passive.ranks[0]` at spawn) and
 * ~60 are `innateKind: "active"` — REAL WC3 D-slot casts with a cooldown, an
 * effect list and, in most cases, a cast time (`22-00 嗚鎖打!`: 40 s CD, 150 AoE
 * damage + 0.5 s stun + a self speed burst; `76-00 二檔`: 60 s CD, a 20 s
 * +100 % AS / +100 MS / −10 hp-per-second self buff).
 *
 * ZERO of those 60 could be cast. Not because the effects were missing — they
 * are authored and they run fine through `runEffects` — but because there was
 * no way to NAME the slot: `Command.castAbility` carried `AbilitySlot`, which
 * is Q/W/E/R/EX, and the innate lives in `AbilitiesComp.passiveSlot`. The
 * button was addressable (HUD/codex could read it) and unreachable (no intent
 * frame could fire it).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — A NEW TYPE (`CastableSlot`), NOT A WIDER `AbilitySlot`
 *
 * The old comment in intents.ts predicted that the sixth slot would widen
 * `AbilitySlot`. It should not, and the reason is the one that comment itself
 * gave: widening `AbilitySlot` also widens `Command.rankUpAbility`,
 * `Cheat.rankAbility` and every `ab.slots[slot]` index in the tree — a record
 * that has no "PASSIVE" key. The innate is CASTABLE but NEVER RANKABLE, so the
 * two alphabets split (see `intents.ts`):
 *
 *     AbilitySlot   = Q W E R EX          the LEARNED slots (rank/unlock)
 *     CastableSlot  = Q W E R EX PASSIVE  the slots a cast Command may name
 *
 * `rankUpAbility` still takes `CoreAbilitySlot`; `Command.rankUpAbility` still
 * takes `AbilitySlot`. Ranking the innate is therefore not rejected at runtime,
 * it is UNTYPEABLE — nothing had to be guarded, and no existing exhaustive
 * switch or Record changed shape. That is why this lane touches four sim files
 * and breaks no replay.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 2 — THE INNATE PAYS THE SAME PRICE AS EVERY OTHER CAST
 *
 * `castAbility` runs ONE validation ladder (dead → stunned/knocked-down →
 * mid-cast → cooldown → passive → mana → recovery → targeting → cost) and the
 * innate enters it at exactly the same place as Q or EX. It is deliberately NOT
 * a free action:
 *   • it pays mana (`manaCost[0]`; most authored innates are 0, which is a
 *     CONTENT fact from the w3x, not a mechanism exemption),
 *   • it pays its own cooldown, CDR-scaled and `combatEnv.cooldown`-scaled
 *     through the same one line,
 *   • it is blocked by stun / knockdown / an in-progress cast,
 *   • it is blocked by, and arms, RECOVERY (`abilityRecovery.ts`) — an innate
 *     that whiffs commits you exactly like a whiffed Q. 「Hit and you flow,
 *     whiff and you are committed」 has no sixth-slot exception.
 *   • it emits `abilityCast` / `castBegin` / `explosion` / `castRejected` on the
 *     same events with `slot: "PASSIVE"`, so the client's existing cast-feedback
 *     path (#181) needs new BINDINGS, never a new protocol.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 3 — RANK 1 FROM SPAWN, AND NOTHING CAN MOVE IT
 *
 * `spawnChampion` already creates `passiveSlot` at `rank: 1`. So, unlike EX,
 * there is no "locked" state and no unlock event: the ladder's `rank <= 0` gate
 * can only fire for a hero with no innate at all (3 of 111), which correctly
 * reads as "not-learned". Cost/cooldown columns index `[rank - 1] = [0]`, the
 * only column every innate doc authors (`maxRank: 1`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 4 — A `"passive"` INNATE STAYS UNCASTABLE, BY AN EXPLICIT GATE
 *
 * Pressing the sixth button on a 感應意脈 hero must answer "there is nothing to
 * cast", not fire a nuke, and it must do so BEFORE any cost is paid. There are
 * two independent gates and both are kept:
 *
 *   a) `innateCastBlock` (here): `slot === "PASSIVE" && innateKind !== "active"`
 *      → "passive". Keyed on the AUTHORED KIND, so it holds even for a
 *      mis-authored permanent doc that somehow carries an effect.
 *   b) the pre-existing `isPassiveOnly` (a `passive` block + no effects), which
 *      also covers the WC3 `Cool = 0` family in the five learned slots.
 *
 * (a) runs first because it gives the more specific reason for the sixth slot.
 * Neither is load-bearing alone; keeping both means neither a stray effect nor
 * a stray `passive` block can open a door.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 5 — NO AUTO-CAST, NO IMPLICIT USE
 *
 * The sim never fires the innate on its own — not on spawn, not on level-up,
 * not from any system. It moves only when a driver (human seat or AI brain)
 * puts `{ kind: "castAbility", slot: "PASSIVE" }` in an intent frame. That is
 * what keeps the change replay-neutral: every existing recorded match contains
 * no such command, so `passiveSlot.cooldownRemainingTicks` stays 0 forever and
 * the new `tickCooldowns` line is a no-op on every historical input log.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Nothing here draws from `world.rng`, reads a clock, or allocates per tick.
 * The only new mutable state is a cooldown counter that already existed on the
 * instance and was simply never decremented.
 */
import type { AbilityDef } from "../content/defs";
import type { CastableSlot } from "../intents";
import type { AbilityInstance, AbilitiesComp } from "../stats/statsComp";
import { INNATE_SLOT, isCoreAbilitySlot } from "../intents";

/**
 * THE ONE slot → instance resolver. Every reader of "the ability in slot X"
 * (cast validation, cooldown ticking, a HUD sweep, a cheat) must go through
 * this, so a sixth slot can never be half-known: before it existed, callers
 * open-coded `slot === "EX" ? ab.exSlot : ab.slots[slot]` and each of those
 * ternaries was a place the innate could be silently forgotten.
 *
 * Returns `null`/`undefined` when the champion does not own the slot (no EX, or
 * one of the 3 heroes with no `NN-00`) — the caller reports "not-learned".
 *
 * EVERY branch is an explicit equality against a known slot name, and the final
 * `undefined` catches anything else. That matters beyond tidiness: the old
 * open-coded `ab.slots[slot]` INDEXED A RECORD WITH THE CALLER'S STRING, so an
 * unsanitized `slot: "constructor"` off the wire read `Object.prototype`'s own
 * property and carried a junk "instance" into the cast ladder (the game-server's
 * `sec-input-01` suite pins that this is what made `validateInput`'s whitelist
 * load-bearing). Here no untrusted string can reach a property lookup at all,
 * and — the trap this function was rewritten to avoid — a junk slot must fall
 * through to `undefined`, NEVER to `passiveSlot`, or garbage input would fire
 * the sixth slot.
 */
export function abilityInstanceFor(
  ab: AbilitiesComp,
  slot: CastableSlot,
): AbilityInstance | null | undefined {
  if (isCoreAbilitySlot(slot)) return ab.slots[slot];
  if (slot === "EX") return ab.exSlot;
  if (slot === INNATE_SLOT) return ab.passiveSlot;
  return undefined;
}

/** True for the sixth slot (the level-1 天生技). */
export function isInnateSlot(slot: CastableSlot): boolean {
  return slot === INNATE_SLOT;
}

/**
 * Why this def may not be cast from the sixth slot, or `null` when it may.
 * See DECISION 4 — keyed on the authored `innateKind`, not on the shape of the
 * doc, so a permanent innate stays uncastable even if content later grows it a
 * stray effect.
 */
export function innateCastBlock(def: AbilityDef): "passive" | null {
  if (def.slot !== INNATE_SLOT) return null;
  return def.innateKind === "active" ? null : "passive";
}
