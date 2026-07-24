/**
 * RECOVERY (後搖) — the caster's post-resolve commitment, and the HIT-CANCEL
 * rule that turns it into a combo system. Task: LANE D.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 *
 * Before this file the sim had NO recovery phase: `CastResolveSystem` cleared
 * `ab.cast` on the resolve tick and the caster was free the very next tick, so
 * the ONLY cost of any ability was its startup. Startup is the VICTIM's warning
 * (task Lane A put 0.6 s of it on all 554 abilities). Recovery is the ATTACKER's
 * commitment. Without one, an ability is all warning and no commitment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN, IN ONE SENTENCE (the owner's, and the reason there is no combo table)
 *
 *   In a fighting game you do NOT combo because the second move got faster —
 *   its startup is identical. You combo because the FIRST move's recovery is
 *   CANCELLED by the hit. So: HIT → recovery cancelled, you flow.
 *                             WHIFF → you eat all of it and are committed.
 *
 * That asymmetry needs exactly one question ("did it connect?"), never a table
 * of which-move-follows-which — which is precisely what leaves combo discovery
 * to the players. DOTA2 does the same thing with cast backswing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — WHAT COUNTS AS A LANDED HIT (`ConnectRule`)
 *
 * "Damage dealt to at least one enemy" is right for the 329 abilities that can
 * deal damage, and MEANINGLESS for the 216 that cannot. Judging a self-buff or
 * a pure dash by whether it damaged someone would make all 216 permanently
 * whiffed — a dash would eat full recovery every single time, which the owner
 * called out by name as unacceptable.
 *
 * So the rule generalises to: **did this ability do the thing it is for, to
 * somebody?** Classified from the REAL content (measured, not assumed — see
 * `scripts/probeRecoveryCombo.ts`, which prints this census from the live
 * registry):
 *
 *   ConnectRule       count  what it is                     connects when
 *   ───────────────── ─────  ─────────────────────────────  ────────────────────
 *   "damage"            329  any `damage` effect, incl. the  a damage packet from
 *                            ones nested in a projectile's   THIS ability lands on
 *                            `onHit`                         >= 1 enemy
 *   "applied"            19  no damage, but lands on someone the resolved target
 *                            ELSE: targeted heals (10),      list is non-empty
 *                            ground status/AoE buffs (9)
 *   "unwhiffable"       197  affects ONLY the caster:        always, on the
 *                            `self` casts (184: buffs,       resolve tick
 *                            restores, self-heals) and
 *                            `dash` (13: pure movement)
 *   (never cast)          9  passive-only (WC3 `Cool = 0`) — `castAbility`
 *                            rejects with "passive" before any of this runs
 *
 * `unwhiffable` therefore observes ZERO recovery in practice: it arms and is
 * cancelled on the same tick, because it genuinely cannot miss. That is the
 * dash guarantee the owner asked for, derived from one rule rather than
 * special-cased. An author who WANTS a self-buff to be a commitment can still
 * have it — see DECISION 4.
 *
 * `applied` deliberately keeps a real whiff case: a ground CC/AoE that catches
 * nobody has an empty resolved target list and eats the full recovery, exactly
 * like a damaging AoE that catches nobody. Same question, same answer.
 *
 * A targeted heal / targeted nuke always connects because `castAbility` already
 * validated the target — you cannot whiff a lock-on. That is not a loophole,
 * it is the existing targeting contract (see docs/design/cast-telegraph.md §4.5a
 * on why 211 targeted abilities can't be dodged today).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 2 — RECOVERY DOES NOT ROOT (default `recoveryRoots: false`)
 *
 * Startup ALREADY hard-roots (`rootWhileCasting` defaults true and no ability
 * overrides it). Stacking a rooting recovery on top means every single ability
 * press pins the caster for 0.6 + 0.6 = 1.2 s minimum, up to 0.9 + 0.9 = 1.8 s,
 * which reads as "the game froze", not "I am committed".
 *
 * The DOTA/LoL shape is used instead: recovery blocks OUTPUT (no cast, no basic
 * attack) but not FOOTWORK. What the opponent buys is "he cannot answer for
 * 0.6 s", not "he is a statue".
 *
 * This also matches the measured geometry already recorded in
 * docs/design/cast-telegraph.md §0.5.3/§4.5(e): 80 of 113 champions are 1.6 u
 * melee, a victim who walks out of a median AoE ends up 4.96–6.88 u away, and
 * the caster's median move speed (5.9) EXCEEDS the chaser's (5.6) — so no
 * recovery value of any length produces a chase-and-punish window in this
 * geometry. Rooting recovery would not buy a punish either; it would only buy
 * a worse feel. Reported to the owner rather than silently assumed.
 *
 * It is a PER-ABILITY OVERRIDE (`recoveryRoots: true`), not a hardcoded choice,
 * so a heavy ultimate can opt into the full fighting-game lock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 3 — WHEN IT STARTS
 *
 * At the END of startup, i.e. on the resolve tick — for the instant path
 * (`castAbility`, castTimeSec 0) and the deferred path (`CastResolveSystem`)
 * alike. Never later. Both call `armRecovery` at the same logical moment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 4 — THE DEFAULT IS LIVE, NOT ZERO
 *
 * `recoverySec` unset falls back to `DEFAULT_RECOVERY_SEC` (0.6 s, the floor of
 * the owner's stated 0.6–0.9 s range) rather than 0. A 0 default would make
 * this whole lane inert until Lane A wrote content values — which is exactly
 * how five previous features in this project shipped as dead code with green
 * tests. Authored `recoverySec` always wins over the default.
 *
 * Determinism: every value here is a pure function of (content, world state).
 * Seconds are converted to ticks ONCE with `Math.round`, and the tick count is
 * what is authoritative from then on — no wall-clock, no rng, no float clock.
 */
import type { AbilityId, EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import type { CastableSlot } from "../intents";
import type { EffectDef } from "../effects/effect";

/**
 * Recovery used when an ability doc omits `recoverySec`. 0.6 s = the floor of
 * the owner's 0.6–0.9 s range. See DECISION 4 above for why this is not 0.
 */
export const DEFAULT_RECOVERY_SEC = 0.6;

/** Hard ceiling on authored/derived recovery, so no doc can stall a match. */
export const MAX_RECOVERY_SEC = 2.0;

/** How the sim decides whether a resolved cast "connected". See DECISION 1. */
export type ConnectRule =
  /** has a damage effect (directly or inside a projectile's onHit) */
  | "damage"
  /** no damage, but it lands on someone other than the caster */
  | "applied"
  /** affects only the caster (self-cast, or a pure dash) — it cannot miss */
  | "unwhiffable";

/** Whether `effects` contain a damage effect, following projectile `onHit`. */
function hasDamage(effects: readonly EffectDef[]): boolean {
  for (const e of effects) {
    if (e.kind === "damage") return true;
    // a skillshot's damage lives one level down, on the projectile it spawns
    if (e.kind === "spawnProjectile" && hasDamage(e.onHit)) return true;
  }
  return false;
}

/**
 * Memo of the derived rule. Keyed on the def OBJECT, so a re-registered doc
 * (the editor sandbox, `overrideAbilities`) is re-derived rather than serving a
 * stale answer. A WeakMap keeps no def alive and, being read-only lookup, has
 * no effect on iteration order or on the digest.
 */
const ruleCache = new WeakMap<AbilityDef, ConnectRule>();

/** The connect rule for an ability, derived from its content. Pure. */
export function connectRuleOf(def: AbilityDef): ConnectRule {
  const cached = ruleCache.get(def);
  if (cached !== undefined) return cached;
  let rule: ConnectRule;
  if (hasDamage(def.effects)) rule = "damage";
  // `self` resolves targets to [caster] and `dash` to [] — in both cases
  // nothing but the caster is touched, so there is nothing to miss.
  else if (def.castType === "self" || def.castType === "dash") rule = "unwhiffable";
  else rule = "applied";
  ruleCache.set(def, rule);
  return rule;
}

/** Recovery length in TICKS for an ability (0 = none). Pure, integer output. */
export function recoveryTicksFor(world: SimWorld, def: AbilityDef): number {
  const secs = Math.min(MAX_RECOVERY_SEC, Math.max(0, def.recoverySec ?? DEFAULT_RECOVERY_SEC));
  return Math.round(secs / world.dt);
}

/**
 * Whether the resolved cast connected AT RESOLVE TIME, i.e. before any damage
 * has had a chance to land. True for `unwhiffable` always, and for `applied`
 * when the resolved target list holds someone other than the caster.
 *
 * A `damage` ability is NEVER settled here even when it has targets: its answer
 * comes from `noteAbilityConnect` when a packet actually resolves, because a
 * shield/immunity/death between resolve and `combatResolveSystem` can still
 * mean nothing landed — and a skillshot's projectile may not connect for many
 * ticks yet.
 */
export function connectsOnResolve(
  rule: ConnectRule,
  caster: EntityId,
  targets: readonly EntityId[],
): boolean {
  if (rule === "unwhiffable") return true;
  if (rule === "damage") return false;
  return targets.some((t) => t !== caster);
}

/**
 * Begin the caster's recovery for a cast that has just RESOLVED (end of
 * startup). No-op when the ability connected on the spot (see
 * `connectsOnResolve`) or when its recovery is 0 ticks — an ability that cannot
 * whiff pays nothing, which is the dash guarantee.
 */
export function armRecovery(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
  def: AbilityDef,
  targets: readonly EntityId[],
): void {
  const ab = world.abilities.get(caster);
  if (!ab) return;
  const rule = connectRuleOf(def);
  if (connectsOnResolve(rule, caster, targets)) {
    // it already did its job — no commitment to pay. Cleared explicitly in case
    // a previous recovery was still running (a cast can only start when none is,
    // so this is belt-and-braces for host-driven out-of-tick casts).
    ab.recovery = null;
    return;
  }
  const ticks = recoveryTicksFor(world, def);
  if (ticks <= 0) {
    ab.recovery = null;
    return;
  }
  ab.recovery = {
    slot,
    abilityId: def.id as AbilityId,
    ticksLeft: ticks,
    totalTicks: ticks,
    roots: def.recoveryRoots === true,
  };
  world.emit("recoveryBegin", {
    caster,
    slot,
    abilityId: def.id,
    ticks,
    recoverySec: ticks * world.dt,
    rule,
  });
}

/** Whether `id` is currently committed to a recovery (blocks cast + auto). */
export function isRecovering(world: SimWorld, id: EntityId): boolean {
  return (world.abilities.get(id)?.recovery?.ticksLeft ?? 0) > 0;
}

/**
 * THE HIT-CANCEL. Called from `combatResolveSystem` the moment a damage packet
 * actually resolves against an enemy, on the SAME tick the damage lands.
 * Cancels the source's recovery when the packet came from the ability the
 * source is recovering from.
 *
 * KNOWN, ACCEPTED IMPRECISION: the damage `origin` carries only the ability id,
 * not a per-cast sequence number, so a lingering DoT from an EARLIER cast of the
 * same ability can cancel a LATER cast's recovery. Left as-is deliberately —
 * that DoT is still this ability connecting, so cancelling reads correctly, and
 * the alternative (stamping every `DamagePacket` with a cast sequence) is a
 * type + wire change for a corner case that needs a DoT to outlive its own
 * cooldown.
 */
export function noteAbilityConnect(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  origin: string,
): void {
  if (source === target) return; // self-damage is not "connecting"
  const ix = origin.indexOf("ability:");
  if (ix < 0) return; // basics / item / augment / DoT-without-ability origins
  const abilityId = origin.slice(ix + "ability:".length);
  const ab = world.abilities.get(source);
  const rec = ab?.recovery;
  if (!ab || !rec || rec.ticksLeft <= 0 || rec.abilityId !== abilityId) return;

  // Only an ENEMY counts. Same predicate as `enemiesInCircle` (a neutral with
  // no TeamComp — flower, guardian — reads as an enemy there too, so the two
  // can never disagree about what "hit an enemy" means).
  const selfTeam = world.team.get(source);
  const tgtTeam = world.team.get(target);
  if (tgtTeam && selfTeam && tgtTeam.teamId === selfTeam.teamId) return;

  ab.recovery = null;
  world.emit("recoveryEnd", {
    caster: source,
    slot: rec.slot,
    abilityId: rec.abilityId,
    reason: "hit",
    ticksSaved: rec.ticksLeft,
  });
}
