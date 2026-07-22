/**
 * Damage queue + resolution. Effects QUEUE damage; this system drains the queue
 * in one ordered pass per tick (mitigation → shields → hp → hooks), so results
 * never depend on effect iteration order.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType } from "../effects/effect";
import { Stat } from "../stats/statTypes";
import { fireHooks } from "../effects/hooks";
import { recordDamage } from "../stats/matchStats";
import { healTarget } from "./restore";
import { normalize, sub, lenSq } from "../math/vec2";

export interface DamagePacket {
  source: EntityId;
  target: EntityId;
  amount: number;
  type: DamageType;
  crit: boolean;
  /** provenance: "ability:sela.q" | "basic" | "item:..." | "aug:..." */
  origin: string;
}

// ---------------------------------------------------------------- COMBAT JUICE
// All impact reactions (hitstop / knockback / knockdown) are DETERMINISTIC pure
// functions of the resolved damage — no rng, no trig — so the client's
// prediction shadow world replays them identically. "impact" = the mitigated
// (post-armor/MR, PRE-shield) damage, i.e. how hard the blow landed regardless
// of whether a shield ate it, so a fully-blocked heavy hit still block-freezes.
//
// None of this changes any damage NUMBER or cooldown — balance is untouched.
// Chip damage (small autos, DoT ticks) stays below the thresholds so it never
// freezes/shoves (which would both wreck feel AND desync MOBA cadence).

/** Below this mitigated impact a hit is "chip": no hitstop, no knockback. */
const HITSTOP_MIN_IMPACT = 12;
const HITSTOP_MIN_TICKS = 2;
const HITSTOP_MAX_TICKS = 6; // contract cap (~6 ticks)
/** +1 hitstop tick per this much impact (heavier hit = longer freeze). */
const HITSTOP_PER_IMPACT = 55;

/** Knockback only for meaningful blows (autos/DoTs stay put; abilities shove). */
const KB_MIN_IMPACT = 70;
/** units of push at 100 impact, physical, unblocked (scaled linearly). */
const KB_UNIT_AT_100 = 1.6;
const KB_MAX_DIST = 4;
/** how physical > magic (contract): physical shoves hardest, true a bit less. */
const KB_TYPE_MULT: Record<DamageType, number> = { physical: 1.0, magic: 0.6, true: 0.85 };
/** a blocked (shielded / DR-buffed) hit shoves much less. */
const KB_BLOCK_MULT = 0.35;
/** slide speed of the knockback impulse (units/sec). */
const KB_SPEED = 16;

/** Heavy UNBLOCKED physical/true hit at/above this impact knocks the victim down. */
const KD_MIN_IMPACT = 170;
/** prone + getup window (ticks ~= 0.47s @30Hz). */
const KNOCKDOWN_TICKS = 14;

/** Raise a freeze counter to `ticks` (never shortens an in-progress freeze). */
function bumpFreeze(map: Map<EntityId, number>, id: EntityId, ticks: number): void {
  const cur = map.get(id) ?? 0;
  if (ticks > cur) map.set(id, ticks);
}

/**
 * Apply the on-impact reactions for one landed hit. Emits `hitImpact` (always,
 * for client shake/particle timing), plus knockback / knockdown / guardBreak as
 * the impact + block state warrant.
 */
function applyImpact(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  impact: number,
  type: DamageType,
  blocked: boolean,
  guardBreak: boolean,
  crit: boolean,
  killingBlow: boolean,
): void {
  const tt = world.transform.get(target);
  const x = tt?.pos.x ?? 0;
  const z = tt?.pos.z ?? 0;

  // Client uses hitImpact purely for shake/particle timing (fires for EVERY
  // connected hit, blocked or not — blockstun still reads as impact).
  world.emit("hitImpact", { x, z, source, target, dmgType: type, amount: impact, blocked, crit, killingBlow });

  // A shield that broke this frame = a bigger "guard shatter" reaction.
  if (guardBreak) world.emit("guardBreak", { target, source, x, z });

  if (impact < HITSTOP_MIN_IMPACT) return; // chip: no freeze / no shove

  // HITSTOP — freeze BOTH the attacker and the victim (SF-style), longer the
  // heavier the hit, capped. Cooldowns keep ticking (see HitstopSystem docs).
  const ticks = Math.min(
    HITSTOP_MAX_TICKS,
    Math.max(HITSTOP_MIN_TICKS, HITSTOP_MIN_TICKS + Math.floor(impact / HITSTOP_PER_IMPACT)),
  );
  bumpFreeze(world.hitstop, source, ticks);
  bumpFreeze(world.hitstop, target, ticks);

  if (impact < KB_MIN_IMPACT) return; // notable enough to freeze, too light to shove

  // KNOCKBACK — a forced impulse away from the source. Integrated by
  // MovementSystem via moveWithCollision, so it slides along / stops at walls
  // and clamps inside the zone boundary (never clips through). Needs a nav
  // component (neutrals/flowers have none -> no knockback, by construction).
  const nav = world.nav.get(target);
  const st = world.transform.get(source);
  if (!nav || !tt || !st) return;

  let dir = normalize(sub(tt.pos, st.pos));
  if (lenSq(dir) < 1e-12) {
    // same position (rare): shove opposite the victim's facing, else a fixed axis
    dir = lenSq(tt.facing) > 1e-12 ? { x: -tt.facing.x, z: -tt.facing.z } : { x: 1, z: 0 };
  }
  let distance = (impact / 100) * KB_UNIT_AT_100 * KB_TYPE_MULT[type];
  if (blocked) distance *= KB_BLOCK_MULT;
  distance = Math.min(KB_MAX_DIST, distance);
  nav.override = { kind: "knockback", dir, speed: KB_SPEED, remaining: distance };

  // KNOCKDOWN — heavy UNBLOCKED physical/true blow floors the victim (brief
  // root + getup). Blocked or magic hits shove but don't knock down.
  if (!blocked && impact >= KD_MIN_IMPACT && type !== "magic") {
    bumpFreeze(world.knockdown, target, KNOCKDOWN_TICKS);
    world.emit("knockdown", { target, source, x, z, ticks: KNOCKDOWN_TICKS });
  }
}

/** Sum of a health's currently-active (unexpired, positive) shield amounts. */
function activeShieldTotal(shields: import("../components").Health["shields"], tick: number): number {
  let sum = 0;
  for (const sh of shields) if (sh.expiresAtTick > tick && sh.amount > 0) sum += sh.amount;
  return sum;
}

/** Whether an active damage-reduction/guard BUFF is on the target (see modifiers). */
function hasDamageReductionBuff(world: SimWorld, target: EntityId): boolean {
  const sc = world.stats.get(target);
  if (!sc) return false;
  for (const src of sc.sources) {
    if (!src.damageReduction) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    return true;
  }
  return false;
}

function mitigate(world: SimWorld, pkt: DamagePacket): number {
  if (pkt.type === "true") return pkt.amount;
  const targetStats = world.stats.get(pkt.target);
  const resist = targetStats
    ? pkt.type === "physical"
      ? targetStats.final[Stat.Armor]
      : targetStats.final[Stat.MagicResist]
    : 0;
  // classic LoL mitigation: 100/(100+resist)
  return pkt.amount * (100 / (100 + Math.max(0, resist)));
}

export function combatResolveSystem(world: SimWorld): void {
  // Hooks fired during resolution may queue MORE damage; drain in bounded
  // passes so chains resolve deterministically without infinite loops.
  for (let pass = 0; pass < 4 && world.damageQueue.length > 0; pass++) {
    const batch = world.damageQueue.splice(0, world.damageQueue.length);
    for (const pkt of batch) {
      const hp = world.health.get(pkt.target);
      if (!hp || !hp.alive) continue;

      // Global combat-env damage factor: applied ONCE per packet, pre-
      // mitigation. Every damage source (basics, abilities, item/augment
      // procs, DoTs) drains through this queue, so this one line is the whole
      // "attack damage output" knob. Packets are consumed exactly once (the
      // batch splice above), so mutating amount here is safe.
      pkt.amount *= world.combatEnv.damageDealt;

      // "impact" = post-mitigation, PRE-shield damage: the blow's raw force,
      // used to scale hitstop/knockback even when a shield eats the hp loss.
      const impact = mitigate(world, pkt);
      let dmg = impact;

      // shields absorb first (oldest first, deterministic). Track how much was
      // absorbed + whether the shield pool went from >0 to 0 (a guard break).
      const shieldBefore = activeShieldTotal(hp.shields, world.tick);
      for (const sh of hp.shields) {
        if (sh.expiresAtTick <= world.tick || sh.amount <= 0) continue;
        const absorbed = Math.min(sh.amount, dmg);
        sh.amount -= absorbed;
        dmg -= absorbed;
        if (dmg <= 0) break;
      }
      hp.shields = hp.shields.filter((s) => s.amount > 0 && s.expiresAtTick > world.tick);
      const shieldAbsorbed = shieldBefore - activeShieldTotal(hp.shields, world.tick);

      const hpBefore = hp.hp;
      if (dmg > 0) hp.hp -= dmg;

      // lifesteal on basic attacks
      if (pkt.origin === "basic" && dmg > 0) {
        const srcStats = world.stats.get(pkt.source);
        const srcHp = world.health.get(pkt.source);
        if (srcStats && srcHp && srcHp.alive) {
          const ls = srcStats.final[Stat.Lifesteal];
          if (ls > 0) {
            // combatEnv.healing scales the RESTORE (a heal), on top of the
            // lifesteal STAT already scaled by combatEnv.lifesteal. Same clamp
            // + same recordHealing as before; healTarget additionally emits
            // `heal` so lifesteal draws a 補血 number on your own body (#92).
            healTarget(world, {
              source: pkt.source,
              target: pkt.source,
              amount: dmg * ls * world.combatEnv.healing,
              origin: "lifesteal",
              score: true,
            });
          }
        }
      }

      // ---- match scoreboard: attribute this resolved packet ----
      // output = mitigated force pre-shield (credits attacker even if shielded);
      // hpLoss = HP actually removed; blocked = armor/MR mitigation + shield eaten.
      const mitigatedByResist = Math.max(0, pkt.amount - impact);
      recordDamage(world, pkt.source, pkt.target, impact, Math.max(0, dmg), mitigatedByResist + shieldAbsorbed, pkt.origin);

      // ---- rich damage event (the sim<->client seam, per combat-juice) ----
      // blocked := a shield absorbed part of the hit OR a damage-reduction buff
      //   is active (map to the EXISTING mitigation paths; no new guard system).
      // guardBreak := the target's shield pool broke (>0 -> 0) THIS hit.
      // killingBlow := the hit dropped the target to 0 hp (death lands next
      //   system). dmgType duplicates `type` under the contract's field name;
      //   `type`/`origin` are kept for existing consumers (DeathSystem, tests).
      const blocked = shieldAbsorbed > 1e-9 || hasDamageReductionBuff(world, pkt.target);
      const guardBreak =
        shieldBefore > 1e-9 && shieldAbsorbed > 1e-9 && activeShieldTotal(hp.shields, world.tick) <= 1e-9;
      const killingBlow = hpBefore > 0 && hp.hp <= 0; // only the packet that crosses 0
      const tt = world.transform.get(pkt.target);

      world.emit("damage", {
        x: tt?.pos.x ?? 0,
        z: tt?.pos.z ?? 0,
        source: pkt.source,
        target: pkt.target,
        amount: dmg,
        type: pkt.type,
        dmgType: pkt.type,
        blocked,
        crit: pkt.crit,
        killingBlow,
        origin: pkt.origin,
      });

      // on-impact reactions (hitstop/knockback/knockdown/guardBreak/hitImpact)
      applyImpact(world, pkt.source, pkt.target, impact, pkt.type, blocked, guardBreak, pkt.crit, killingBlow);

      fireHooks(world, pkt.source, "onDamageDealt", pkt.target);
      fireHooks(world, pkt.target, "onDamageTaken", pkt.source);
    }
  }
}

/** Queue a shield on a target. */
export function addShield(
  world: SimWorld,
  target: EntityId,
  amount: number,
  durationSecs: number,
  sourceId: string,
): void {
  const hp = world.health.get(target);
  if (!hp) return;
  hp.shields.push({
    amount,
    expiresAtTick: world.tick + Math.round(durationSecs / world.dt),
    sourceId,
  });
}
