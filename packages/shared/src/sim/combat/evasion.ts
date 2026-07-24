/**
 * EVASION (迴避) — the defender's pre-damage miss roll.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * 108 innate (天生技) docs were recovered and the 6th ability slot renders
 * in-game, but 29 of the 48 `innateKind: "passive"` ones ship EMPTY modifier
 * blocks — they have zero combat effect. The single biggest reason, measured
 * rather than assumed, is that **the sim had no evasion stat at all**: the
 * dominant inert group is 迴避 passives — `12-00 感應意脈` (+20% 迴避),
 * `74-00 JENOVA` (15%), `92-00 憂鬱的眼神` (18%). There was nothing for a
 * content author to point a modifier at, so the docs were written honest-empty.
 *
 * This file is the MECHANISM half. It writes no content: `Stat.Evasion` is 0 on
 * every champion today and this module is a strict no-op at 0 (see THE ZERO
 * GUARANTEE below). A later content lane fills the 29 blocks with
 * `{ stat: "evasion", op: "flat", value: 0.20 }` and they become live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL, AND WHY
 *
 * DECISION 1 — BASIC ATTACKS ONLY. Not abilities. Two independent reasons:
 *
 *   (a) SOURCE FIDELITY. Every one of these passives is WC3 `Evasion`
 *       (`Aevd` / the hero `ACev` 迴避 column). In WC3 that ability dodges
 *       ATTACKS and only attacks — a spell has never been evadable — so
 *       extending it to abilities would not be porting the passive, it would be
 *       inventing a stronger one and calling it 感應意脈.
 *
 *   (b) IT WOULD CONTRADICT THE TELEGRAPH DESIGN. `abilities/abilityRecovery.ts`
 *       (DECISION 1, closing paragraph) points at docs/design/cast-telegraph.md
 *       §4.5(a): 211 targeted abilities lock their victim at cast, so they
 *       "can't be dodged today". That is stated as a STRUCTURAL problem with a
 *       named structural fix — `resolveRecheck: "lock" | "range"`, i.e. give the
 *       victim POSITIONAL agency by re-checking range at resolve. The whole
 *       thesis of that document is 「公平性的終點不是『一定躲得掉』，是『躲不躲得掉
 *       取決於你』」 — dodging must be something the player DID. A hidden dice
 *       roll on ability damage would paper over the same complaint with the
 *       exact opposite property: unreadable, un-earnable, and it would make the
 *       whole telegraph/startup investment pointless (why read a 1.19 s warning
 *       if the outcome is a coin flip?). So this lane deliberately does NOT
 *       extend evasion to abilities. Ability agency stays §4.5(a)'s job.
 *
 *   Consequence, stated plainly so nobody has to rediscover it: an evasion
 *   champion is tanky against autos and exactly as fragile as anyone else
 *   against spells. That is the WC3 behaviour and it is a real, legible
 *   counter-play axis rather than a flat damage sponge.
 *
 * DECISION 2 — ROLLED WHEN THE HIT WOULD LAND, BY THE DEFENDER'S STAT.
 *   · MELEE: at the damage point (`BasicAttackSystem.resolveAttack`).
 *   · RANGED: at PROJECTILE IMPACT (`ProjectileSystem`), not at launch — the
 *     arrow is dodged when it arrives, which is also the only moment the victim
 *     is known (the missile can hit a body that walked into it).
 *   Reading the stat at landing time (not at swing start) means an evasion buff
 *   applied mid-flight protects you, which is the intuitive reading and matches
 *   how every other defensive stat in this sim is sampled (armor is read in
 *   `mitigate`, at resolve).
 *
 * DECISION 3 — A DODGE IS A TOTAL MISS, NOT MITIGATION. No damage packet is
 *   queued at all, so — for free, by construction — there is no lifesteal, no
 *   `onBasicAttack` hook, no on-hit item proc, no hitstop/knockback, no
 *   scoreboard `basicAttackHits`, and no `damage` event. That is the WC3
 *   semantic ("miss"), and it is why the roll lives at the two attack-landing
 *   sites rather than inside `combatResolveSystem`: by the time a packet
 *   reaches the damage queue the on-hit hooks have already fired.
 *
 * DECISION 4 — THE SWING IS STILL SPENT. The attacker's cooldown was committed
 *   at swing start and is not refunded, and a dodged ranged missile is consumed.
 *   A dodge costs the attacker a full attack cycle — that IS the stat's value.
 *   No melee whiff-lunge is triggered: the swing connected with a body, the body
 *   just slipped it; the lunge is specifically the over-commit of hitting air.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM (non-negotiable)
 *
 * The roll is `world.rng.chance(p)` on the seeded world RNG — the same stream
 * and the same call the crit roll has always used. No `Math.random`, no
 * `Date.now`, no iteration-order dependence: both call sites are inside systems
 * that already iterate deterministic component maps, and the roll happens at a
 * fixed point in each. Same seed ⇒ identical draw sequence ⇒ identical digest.
 * (`world.rng.state` is folded into `SimWorld.digest()`, so even a spurious
 * EXTRA draw on one replica surfaces immediately as a mismatch — which is what
 * the zero guarantee below is really protecting.)
 *
 * THE ZERO GUARANTEE: `p <= 0` returns false BEFORE touching the rng. Evasion is
 * 0 for every champion in the catalogue today, so this mechanism consumes zero
 * random draws and perturbs nothing until content opts in — existing replays,
 * digests and balance are bit-identical.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";

/**
 * The defender's effective dodge chance, 0..1. Reads the RESOLVED stat, so it
 * already went through `STAT_CLAMPS[Stat.Evasion]` ([0, 0.8]) in the pipeline;
 * the clamp is repeated here only because a caller may hand us a StatsComp that
 * has not been recomputed since a source attached this tick.
 *
 * A target with no `StatsComp` (guardians/structures, flowers, projectiles)
 * has no evasion by construction — they cannot dodge.
 */
export function evasionOf(world: SimWorld, target: EntityId): number {
  const sc = world.stats.get(target);
  if (!sc) return 0;
  const v = sc.final[Stat.Evasion];
  if (!(v > 0)) return 0; // also rejects NaN
  return v > 1 ? 1 : v;
}

/**
 * Roll the defender's evasion for ONE landing basic attack.
 *
 * Returns true when the attack MISSES — the caller must then queue no damage,
 * fire no on-hit hooks and emit no hit event (see DECISION 3).
 *
 * Emits `evade { source, target, x, z }` on a successful dodge so the client can
 * draw the 「MISS」 floating text / play the slip cue. Events are presentation
 * only and are not part of `SimWorld.digest()`.
 *
 * BASIC ATTACKS ONLY — do not call this from an ability/DoT/proc path
 * (DECISION 1). Consumes exactly one rng draw when `evasion > 0`, and none at 0.
 */
export function rollEvade(world: SimWorld, source: EntityId, target: EntityId): boolean {
  const p = evasionOf(world, target);
  if (p <= 0) return false; // THE ZERO GUARANTEE: no rng draw, no state change
  if (!world.rng.chance(p)) return false;
  const tt = world.transform.get(target);
  world.emit("evade", {
    source,
    target,
    x: tt?.pos.x ?? 0,
    z: tt?.pos.z ?? 0,
  });
  return true;
}
