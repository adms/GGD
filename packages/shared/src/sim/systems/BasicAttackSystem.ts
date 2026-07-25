/**
 * BasicAttackSystem — champion-driven autos honoring per-champion attack data.
 *
 * Each auto is a two-phase swing:
 *   1. wind-up: on-cooldown & in-range → enter a wind-up for `attackDamagePoint`
 *      ticks; the whole-interval cooldown is committed at swing start so cadence
 *      is baseAttackTime / attackSpeed regardless of the wind-up length.
 *   2. damage point (wind-up elapsed):
 *        - MELEE  → apply AD damage instantly if the target is still in range;
 *        - RANGED → launch an auto projectile at the champion's missileSpeed;
 *          damage + on-hit hooks + lifesteal resolve ON IMPACT (ProjectileSystem).
 *
 * Interrupt (before the damage point): stun, death, target loss, or the target
 * leaving range (moving out cancels, LoL-style). Crit is rolled at the damage
 * point via the seeded RNG (deterministic). On-hit item passives (onBasicAttack)
 * and lifesteal always fire when the hit LANDS, never at the swing start.
 */
import type { EntityId, ChampionId, ProjectileId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { StatsComp } from "../stats/statsComp";
import type { ChampionDef } from "../content/defs";
import { Stat } from "../stats/statTypes";
import { Champions } from "../content/registry";
import { distSq, normalize, sub, lenSq } from "../math/vec2";
import { fireHooks } from "../effects/hooks";
import { rollEvade } from "../combat/evasion";

/** Fallback wind-up (seconds) when a champion doc omits attackDamagePoint. */
const DEFAULT_DAMAGE_POINT_MELEE = 0.25;
const DEFAULT_DAMAGE_POINT_RANGED = 0.3;
/** Fallback ranged projectile speed (GGD units/sec). */
const DEFAULT_MISSILE_SPEED = 20;
/** Auto-attack projectile hit radius + range buffer past the attack range. */
const AUTO_HIT_RADIUS = 0.4;
const AUTO_RANGE_BUFFER = 4;
/** Whiffed-melee over-commit lunge (combat-juice): a small forward stumble. */
const WHIFF_LUNGE_DIST = 0.8;
const WHIFF_LUNGE_SPEED = 10;

/**
 * Effective attack range against a specific target (never below body contact).
 *
 * EXPORTED on purpose: `OrderSystem` stops the chase at a fraction of this same
 * value, so the approach and the swing gate can never drift apart. Any change
 * here moves both ends together.
 */
export function reachTo(sc: StatsComp, selfR: number, tgtR: number): number {
  return Math.max(sc.final[Stat.AttackRange], selfR + tgtR + 0.1);
}

/**
 * Weapon-class priority for the per-weapon attack SFX (audio COMBAT-AUDIO). The
 * `basicAttack` event carries this so the pure client mapper (audio/combatSfx)
 * can play the right attack voice without loading any champion data of its own.
 * Purely descriptive — the sim never reads it back.
 *
 * ---------------------------------------------------------------------------
 * WHY `magic` AND `thrown` EXIST (2026-07-24) — and why they are not cosmetic
 * ---------------------------------------------------------------------------
 * This list used to be melee-shaped only: greatsword|katana|gun|bow|sword. There
 * is no such thing as an untagged champion, because {@link weaponClassOf} always
 * answers, so every champion the list could not describe fell through the
 * `ranged → bow` default. That silently gave a BOW DRAW to every caster in the
 * game: 皮卡丘 electrocuting you, 莉娜因巴斯 casting, 涅吉 with a staff — all
 * creaking a bowstring. No error, no crash; the class was simply missing from the
 * vocabulary, so the wrong member of it won. Adding tags could not have fixed it:
 * there was nothing to tag them AS.
 *
 * The five new-ish members are not invented flavour. Each ranged champion in this
 * roster descends from a real WC3 hero unit, and Blizzard's own
 * `Units/*UnitFunc.txt` `Missileart=` says what that hero throws. That table —
 * not vibes, not the champion's Chinese name — is the authority:
 *
 *   Arrow / MoonPriestessMissile              → `bow`     (a real arrow; 5 heroes)
 *   WardenMissile / BrewmasterMissile         → `thrown`  (a hurled object; 5)
 *   FireBall / KeeperGrove / Farseer /
 *   ShadowHunter / SerpentWard / DemonHunter /
 *   BloodElf / Lich …                         → `magic`   (a conjured bolt; 22)
 *
 * That census (22 magic / 5 bow / 5 thrown / 1 sword across the 33 ranged
 * champions — the last being a WC3 hero with no missile art at all) is
 * also why the ranged DEFAULT below is now `magic` rather than `bow`. It is still
 * a guess and still the wrong shape of answer — which is why
 * `sim/weaponClassCoverage.test.ts` forbids any shipped ranged champion from
 * relying on it. The default only decides how wrong a champion nobody tagged is,
 * and "unnamed ranged hero" is far more often a caster than an archer here.
 *
 * TWO-FILE CONTRACT. Every member here must have a decided outcome in
 * `apps/client/src/audio/combatSfx.ts` WEAPON_SFX — a dedicated clip, or the
 * generic swing NAMED explicitly (that is what `thrown` does). A member with no
 * row there falls back by accident instead of by decision, which is the same
 * silent-default failure this comment exists to describe.
 * `content/fieldAdoption.ts` censuses these strings as a TAG VOCABULARY, so a
 * member no champion carries fails the S8 guard rather than quietly meaning
 * nothing.
 */
export const WEAPON_TAGS = [
  "greatsword",
  "katana",
  "gun",
  "bow",
  "magic",
  "thrown",
  "sword",
] as const;

/**
 * The champion's weapon class, derived from existing metadata (deterministic, no
 * rng): an explicit weapon tag on the champion doc wins (checked in the priority
 * order above so `greatsword` never collapses to `sword`); otherwise the coarse
 * default from attackType — ranged → magic, melee → sword. Always returns a
 * class, so every basic attack gets an attack voice.
 *
 * The defaults are a LAST RESORT, not the design. See WEAPON_TAGS above: shipped
 * ranged champions are tagged from the WC3 missile-art table and a guard test
 * keeps them that way, so reaching the `ranged` branch here means a champion doc
 * was authored without one.
 */
export function weaponClassOf(
  cdef: ChampionDef | undefined,
  attackType: "melee" | "ranged",
): string {
  const tags = cdef?.tags;
  if (tags && tags.length > 0) {
    const set = new Set(tags.map((t) => t.toLowerCase()));
    for (const w of WEAPON_TAGS) if (set.has(w)) return w;
  }
  return attackType === "ranged" ? "magic" : "sword";
}

export function basicAttackSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const sc = world.stats.get(id);
    if (!t || !hp?.alive || !sc) {
      ab.windup = null;
      continue;
    }

    // Casting an ability animation-locks basic attacks.
    if (ab.cast) {
      ab.windup = null;
      continue;
    }

    // RECOVERY (後搖) also locks OUTPUT: an ability that WHIFFED commits the
    // caster out of autos as well as casts, which is the whole punish window
    // (a landed hit would already have cancelled it). Movement is NOT blocked
    // here — see abilities/abilityRecovery.ts DECISION 2.
    if ((ab.recovery?.ticksLeft ?? 0) > 0) {
      ab.windup = null;
      continue;
    }

    // Stun cancels any wind-up and blocks starting a new swing.
    const st = world.status.get(id);
    if (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick)) {
      ab.windup = null;
      continue;
    }

    // Combat-juice freeze. Knockdown (prone) cancels the swing entirely.
    // Hitstop PAUSES it: leave the wind-up intact so it resumes after the freeze
    // (a hit read as impact). Cooldowns keep ticking (see HitstopSystem), so
    // this never changes attack cadence/DPS.
    if ((world.knockdown.get(id) ?? 0) > 0) {
      ab.windup = null;
      continue;
    }
    if ((world.hitstop.get(id) ?? 0) > 0) continue;
    // Combat-juice HITSTUN: a victim-only action-lock that outlasts the shared
    // hitstop (frame advantage — the attacker is already free while the
    // defender still cannot swing). PAUSES the wind-up like hitstop (resumes
    // after), so cadence/DPS is unchanged; it only denies the on-the-back-foot
    // defender a free counter-swing mid-shove. See combat/damage.ts.
    if ((world.hitstun.get(id) ?? 0) > 0) continue;

    const champ = world.champion.get(id);
    const cdef = champ ? Champions.tryGet(champ.championId as ChampionId) : undefined;
    const attackType = cdef?.attackType ?? "melee";

    // ---- advance an in-progress wind-up ----
    if (ab.windup) {
      const w = ab.windup;
      const tgtT = world.transform.get(w.target);
      const tgtHp = world.health.get(w.target);
      // `reach * reach`, NOT `reach ** 2`: `**` is specified as Math.pow, which
      // is implementation-approximated and may differ by an ulp between hosts —
      // enough to flip this `<=` and desync a replica. (The purity gate now
      // bans `**` in sim source for exactly this reason; see purity.test.ts.)
      const reach = tgtT ? reachTo(sc, t.radius, tgtT.radius) : 0;
      const inRange = !!tgtT && tgtT.zone === t.zone && distSq(t.pos, tgtT.pos) <= reach * reach;
      if (!tgtT || !tgtHp?.alive || !inRange) {
        ab.windup = null;
        // WHIFF (combat-juice): if the swing had already COMMITTED (this was the
        // damage-point tick) and the target escaped/died, it connects with
        // nothing → a melee over-commit forward lunge. An EARLY interrupt
        // (target left well before the damage point) stays a silent cancel,
        // LoL-style, so cadence is unchanged.
        if (w.ticksLeft <= 1) whiff(world, id, t, attackType);
        continue;
      }
      w.ticksLeft--;
      if (w.ticksLeft <= 0) {
        ab.windup = null;
        resolveAttack(world, id, w.target, attackType, sc, cdef);
      }
      continue; // one swing at a time
    }

    // ---- start a new swing ----
    if (ab.basicAttackCdTicks > 0) continue;
    const nav = world.nav.get(id);
    if (!nav?.attackTarget) continue;

    const tgtT = world.transform.get(nav.attackTarget);
    const tgtHp = world.health.get(nav.attackTarget);
    if (!tgtT || !tgtHp?.alive || tgtT.zone !== t.zone) {
      nav.attackTarget = null;
      continue;
    }
    const reach = reachTo(sc, t.radius, tgtT.radius);
    if (distSq(t.pos, tgtT.pos) > reach * reach) continue; // still chasing

    // commit the whole-interval cooldown now; the wind-up is part of it.
    const baseAttackTime = cdef?.baseAttackTime ?? 1.0;
    const attacksPerSec = Math.max(0.01, sc.final[Stat.AttackSpeed]);
    ab.basicAttackCdTicks = Math.max(1, Math.round(baseAttackTime / attacksPerSec / world.dt));

    const dpSec =
      cdef?.attackDamagePoint ??
      (attackType === "ranged" ? DEFAULT_DAMAGE_POINT_RANGED : DEFAULT_DAMAGE_POINT_MELEE);
    const dpTicks = Math.max(0, Math.round(dpSec / world.dt));
    if (dpTicks <= 0) {
      resolveAttack(world, id, nav.attackTarget, attackType, sc, cdef);
    } else {
      ab.windup = { target: nav.attackTarget, ticksLeft: dpTicks };
      world.emit("attackWindup", {
        source: id,
        target: nav.attackTarget,
        ticks: dpTicks,
        ranged: attackType === "ranged",
      });
    }
  }
}

/**
 * The damage point: roll crit + AD, then either apply melee damage instantly or
 * launch a ranged auto projectile whose on-hit resolves at impact.
 */
function resolveAttack(
  world: SimWorld,
  id: EntityId,
  targetId: EntityId,
  attackType: "melee" | "ranged",
  sc: StatsComp,
  cdef: ChampionDef | undefined,
): void {
  const t = world.transform.get(id);
  const tgtT = world.transform.get(targetId);
  const tgtHp = world.health.get(targetId);
  if (!t || !tgtT || !tgtHp?.alive || tgtT.zone !== t.zone) return; // defensive (whiff handled at commit)

  // EVASION (迴避), MELEE half — rolled below, immediately before the melee
  // damage point. NOT here: this function is shared with the ranged path, whose
  // hit lands at projectile IMPACT (ProjectileSystem), and rolling in both
  // places would dodge a ranged auto twice. See combat/evasion.ts DECISION 2.

  let amount = sc.final[Stat.AttackDamage];
  let crit = false;
  const cc = sc.final[Stat.CritChance];
  if (cc > 0 && world.rng.chance(cc)) {
    crit = true;
    amount *= sc.final[Stat.CritDamage] || 1.75;
  }

  const weaponClass = weaponClassOf(cdef, attackType);
  const dir = normalize(sub(tgtT.pos, t.pos));

  if (attackType === "ranged" && (dir.x !== 0 || dir.z !== 0)) {
    // launch an auto projectile; on-hit pipeline resolves on impact
    const speed = cdef?.missileSpeed ?? DEFAULT_MISSILE_SPEED;
    const range = Math.max(sc.final[Stat.AttackRange], 4) + AUTO_RANGE_BUFFER;
    const pid = world.spawn();
    world.transform.set(pid, {
      pos: { x: t.pos.x, z: t.pos.z },
      vel: { x: dir.x * speed, z: dir.z * speed },
      facing: dir,
      radius: AUTO_HIT_RADIUS,
      zone: t.zone,
    });
    world.projectile.set(pid, {
      projectileId: "basic-attack" as ProjectileId,
      ownerId: id,
      dir,
      speed,
      remainingRange: range,
      hitRadius: AUTO_HIT_RADIUS,
      pierce: false,
      hitSet: new Set(),
      onHit: [],
      rank: 1,
      origin: "basic",
      basic: true,
      basicDamage: amount,
      crit,
    });
    // the swing itself happens now; the hit lands at impact.
    // `projectileSpawn` is what the client hangs the MUZZLE FLASH on (see the
    // VfxSystem case): ability projectiles emitted it and ranged autos did not,
    // so every ranged basic attack materialised out of thin air. The projectile
    // doc `basic-attack` supplies its trail/mesh identity client-side; the sim
    // still owns speed (champion missileSpeed) and range, so the doc's numbers
    // are descriptive only for this one projectile id.
    // ORDER MATTERS: `basicAttack` is what commits the attacker's aim on the
    // client, and the muzzle flash on `projectileSpawn` reads that aim back.
    world.emit("basicAttack", { source: id, target: targetId, crit, ranged: true, weaponClass });
    world.emit("projectileSpawn", { id: pid, owner: id, projectileId: "basic-attack" });
    return;
  }

  // melee: hit lands at the damage point.
  //
  // The SWING happens whether or not it connects, so `basicAttack` (the client's
  // aim commit + weapon slash SFX) is emitted FIRST, before the evasion gate
  // below — otherwise a dodged blow would be a silent, invisible non-event and
  // the defender would look like they were never attacked. Moving the emit above
  // the queue push does not reorder any event: `damageQueue` is a queue drained
  // later by combatResolveSystem, not an emit.
  world.emit("basicAttack", { source: id, target: targetId, crit, ranged: false, weaponClass });

  // EVASION (迴避) — the defender's pre-damage miss roll. A dodge is a TOTAL
  // miss, so it short-circuits everything that follows: no damage packet, no
  // lifesteal (it hangs off the packet), no `onBasicAttack` item proc, no
  // hitstop/knockback, no scoreboard hit. The swing's cooldown was committed at
  // swing start and is NOT refunded — a dodge costing the attacker a full attack
  // cycle is the stat's whole value. `whiff` is deliberately NOT emitted: the
  // blow reached a body and was slipped; the whiff-lunge is specifically the
  // over-commit of hitting empty air.
  // No-op — and zero rng draws — while evasion is 0 (every champion today).
  if (rollEvade(world, id, targetId)) return;

  world.damageQueue.push({
    source: id,
    target: targetId,
    amount,
    type: "physical",
    crit,
    origin: "basic",
  });
  fireHooks(world, id, "onBasicAttack", targetId);
}

/**
 * A committed swing that connected with nothing. Emits `whiff` (source) and —
 * for melee — a small forward over-commit lunge (a plain dash override in the
 * attacker's facing, so it slides + respects walls like any dash).
 */
function whiff(
  world: SimWorld,
  id: EntityId,
  t: { pos: { x: number; z: number }; facing: { x: number; z: number } },
  attackType: "melee" | "ranged",
): void {
  world.emit("whiff", { source: id, x: t.pos.x, z: t.pos.z });
  if (attackType !== "melee") return;
  const nav = world.nav.get(id);
  if (!nav || lenSq(t.facing) < 1e-12) return;
  nav.override = {
    kind: "dash",
    dir: normalize(t.facing),
    speed: WHIFF_LUNGE_SPEED,
    remaining: WHIFF_LUNGE_DIST,
  };
}
