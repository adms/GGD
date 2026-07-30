/**
 * targeting.ts — THE ONE auto-attack target rule (task #221).
 *
 * Owner directive (2026-07-26):
 *   「玩家操控的 近戰跟遠戰英雄 應該都要會自動攻擊附近英雄
 *     優先打攻擊自己的敵人 再來是血量低的 再來是距離最近的」
 *
 * A player-controlled champion — melee AND ranged — must engage nearby enemies
 * without the player ever right-clicking one. Before this module the sim had NO
 * auto-attack concept at all: `Navigation.attackTarget` was only ever written by
 * an explicit seat order (OrderSystem), by MobSystem for mobs, and by the BOT's
 * private nearest-enemy loop in `apps/game-server/src/ai/Tier0Brain.ts`. A human
 * who never right-clicked therefore had `attackTarget === null` forever and
 * `BasicAttackSystem`'s `if (!nav?.attackTarget) continue` bailed every tick.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES IN packages/shared/src/sim AND NOT IN THE BOT BRAIN
 * ---------------------------------------------------------------------------
 * 1. REPLAY. A rule that lives in a seat DRIVER does not replay: playback
 *    reconstructs drivers, so driver-side decisions are re-derived rather than
 *    re-played. An in-sim rule rides the recorded intent frames for free.
 * 2. FAIRNESS. Two targeting brains drift. `Tier0Brain` now calls
 *    {@link acquireTarget} too, so a bot and a human resolve "which enemy" with
 *    literally the same comparator on the same candidate set.
 * 3. DETERMINISM. Every client and every replay must pick the SAME enemy, so
 *    the order must be TOTAL and STABLE — see the comparator contract below.
 *
 * ---------------------------------------------------------------------------
 * THE COMPARATOR (total order — every tie falls through to the next key)
 * ---------------------------------------------------------------------------
 *   1. kind    — enemy CHAMPION (0) before SUMMON (1) before MOB (2)
 *   2. threat  — is it hitting me right now? (0 = yes, 1 = no)
 *   3. hp      — lowest current HP first
 *   4. d2      — nearest first (squared distance; never a sqrt)
 *   5. id      — lowest entity id (the FINAL tiebreak; always decides)
 *
 * Key 1 is the owner's 「附近英雄」 read: a hero anywhere inside the acquisition
 * radius outranks every mob. MOBS ARE STILL VALID TARGETS — they are simply the
 * fallback. Excluding them entirely would mean a player standing in a 30-zombie
 * pile from round 3 auto-attacks nothing at all, which reads as the feature
 * being broken; making them peers would let a 1-HP zombie out-rank the enemy
 * hero on key 3. Champion-before-mob is the only ordering that satisfies both.
 * 召喚物 sit BETWEEN the two and can be moved to either end per ability — the
 * tiers, the reasoning and the defaults are in sim/summonRules.ts.
 *
 * Keys 2-4 are the directive verbatim: 威脅 → 低血 → 最近.
 *
 * Key 5 exists because keys 1-4 are all tie-able (two full-HP mirror champions
 * placed symmetrically is the ordinary case at round start). Candidates arrive
 * from {@link queryOverlap}, which is documented and guaranteed to return
 * ASCENDING entity ids, and the scan below keeps the incumbent on an exact tie —
 * so the lowest id wins without a separate compare. NOTHING here iterates a Map
 * in insertion order: not `world.team`, not `world.nav`, and explicitly not the
 * inner `recentDamagers` map (whose iteration order is first-hit order, not id
 * order) — it is only ever used as a per-candidate LOOKUP.
 *
 * PURITY: no Math.random / Date.now / trig / `**` (see sim/purity.test.ts).
 * Distances stay squared and reaches are squared by multiplication.
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { StatsComp } from "./stats/statsComp";
import { distSq } from "./math/vec2";
import { queryOverlap } from "./collision/queries";
import { reachTo } from "./systems/BasicAttackSystem";
import { canSee } from "./stealth";
import {
  TARGET_CLASS,
  summonAutoTargetable,
  summonManualTargetable,
  summonMobTargetable,
  summonTargetClass,
} from "./summonRules";

/**
 * How recently an enemy must have damaged me to count as "attacking me"
 * (key 2). 75 ticks = 2.5 s at 30 Hz — long enough that a ranged trade or a
 * slow-cadence melee swing keeps the aggressor flagged between blows, short
 * enough that a hit taken across the round does not permanently pin the target.
 *
 * The source of truth is `world.recentDamagers` (victim -> attacker -> tick),
 * which the assist bookkeeping in stats/matchStats.ts already maintains. NO
 * SECOND THREAT STORE IS ADDED: a parallel memory would be one more thing to
 * desync. Note its documented limit — it only records CHAMPION -> CHAMPION enemy
 * damage — which is harmless here precisely because key 1 already puts every
 * champion above every mob.
 */
export const THREAT_WINDOW_TICKS = 75;

/**
 * Minimum auto-acquisition radius (units), regardless of how short the weapon
 * is. Melee reach is ~1.6, so without a floor a melee hero would only ever
 * auto-attack somebody ALREADY touching it — it would never step forward, and
 * the feature would look dead for half the roster. 6 u is a modest step: it is
 * a quarter of the 24 u zone radius and well under every ranged band (6-12), so
 * a ranged champion still uses its own longer reach.
 */
export const MELEE_ACQUIRE_FLOOR = 6;

/**
 * Extra slack (units) before an ALREADY auto-acquired target is dropped. Pure
 * hysteresis: without it a target hovering exactly on the radius would be
 * acquired and dropped on alternating ticks, cancelling the wind-up each time
 * (BasicAttackSystem cancels a swing on target loss) — visible as a hero that
 * twitches and never lands a blow. It is also what stops the hero chasing
 * across the map: an auto target is leashed at `radius + 2`, never followed.
 *
 * EXPLICIT targets are NEVER leashed — the player's own order outranks this.
 */
export const ACQUIRE_LEASH = 2;

/** Radius assumed for a prospective target when sizing our own reach. */
const NOMINAL_TARGET_RADIUS = 0.6;

/** A resolved candidate: the winner plus the sort keys that won it. */
export interface AcquiredTarget {
  id: EntityId;
  /** {@link TARGET_CLASS}: 0 = enemy champion, 1 = summon, 2 = mob */
  kind: number;
  /** 0 = damaged me within THREAT_WINDOW_TICKS, 1 = has not */
  threat: number;
  hp: number;
  /** squared centre-to-centre distance from the acquirer */
  d2: number;
}

/**
 * How far a champion auto-acquires: its own effective attack reach, floored so
 * melee is not limited to targets already in contact. Derived from the SAME
 * `reachTo` the swing gate and the chase both use, so a ranged champion opens
 * fire from range and a melee champion closes in — with no second range number
 * to keep in sync.
 */
export function acquireRadius(sc: StatsComp | undefined, selfRadius: number): number {
  if (!sc) return MELEE_ACQUIRE_FLOOR;
  const reach = reachTo(sc, selfRadius, NOMINAL_TARGET_RADIUS);
  return reach > MELEE_ACQUIRE_FLOOR ? reach : MELEE_ACQUIRE_FLOOR;
}

/**
 * WHICH TIER of combat body `cand` is, or `null` when nothing may auto-attack
 * it. THE one answer to 「這東西打不打得到」 — every automatic target picker in
 * the sim goes through this function, so a new body kind is wired in ONE place
 * instead of being remembered at each call site.
 *
 * That single-seam property is the whole point, and it is not theoretical: the
 * previous shape was the literal predicate
 *   `if (!world.champion.has(c) && !world.mob.has(c)) return false;`
 * duplicated in spirit by MobSystem's `if (!world.champion.has(cid)) continue;`
 * — and when 召喚物 landed as a THIRD kind of body (deliberately neither store),
 * both allow-lists silently excluded it. Nothing in the game could acquire a
 * summon; it hit people and nothing hit back.
 *
 * WHY NOT A 「可被索敵」 COMPONENT ON EVERY BODY. It was the other candidate and
 * it is the wrong trade here. Four of the transform-carrying non-bodies —
 * revive circles, dropped coins, aura carriers, projectiles — are already kept
 * OUT OF THE BROAD-PHASE GRID entirely (`SimWorld.rebuildGrid`), which is a
 * STRUCTURAL guarantee: every targeting query walks that grid, so they cannot be
 * targeted even by code that forgets about them. Re-expressing those four as
 * trait-carriers would replace a guarantee with a filter somebody can forget.
 * Flowers and guardian structures are excluded a second way (no TeamComp), which
 * the team test below still enforces. So: ONE predicate that every picker calls,
 * over the three stores that really are combat bodies — not a component every
 * body must remember to carry.
 */
export function targetClassOf(world: SimWorld, cand: EntityId): number | null {
  if (world.champion.has(cand)) return TARGET_CLASS.champion;
  const sm = world.summon.get(cand);
  if (sm !== undefined) {
    // 召喚物該不該被自動索敵 is a DECISION POINT, not a constant: 分身/複製鏡
    // exist to soak attacks, 災難之牆's wall units are scenery. See
    // sim/summonRules.ts. `false` here means 「自動索敵看不見」 ONLY — the body
    // is still in the grid, so ability AoE and skillshots still hit it. It is
    // not invulnerability, and it must not be read as such.
    if (!summonAutoTargetable(sm)) return null;
    return summonTargetClass(sm);
  }
  if (world.mob.has(cand)) return TARGET_CLASS.mob;
  return null;
}

/**
 * Is `cand` a hostile unit `self` may auto-attack?
 *
 * Deliberately narrow: enemy CHAMPIONS, 召喚物 and roguelite MOBS. Everything
 * else that carries a transform is excluded by construction —
 *   - projectiles / revive circles / coins: dropped by `queryOverlap` itself;
 *   - healing FLOWERS: allied harvestables (auto-attacking one would be a bug);
 *   - neutral GUARDIANS: `world.structure`, no TeamComp;
 * the last two also carry no TeamComp, so they could never pass the team test.
 *
 * THE TEAM TEST IS WHAT KEEPS YOUR OWN PETS SAFE. A summon spawned with
 * `team: "owner"` carries its summoner's `teamId`, so this returns false for the
 * owner and for every ally — 己方永遠不會自動打自己的召喚物 — while a
 * `team: "neutral"` summon lands on the MONSTER sentinel and is hostile to
 * everyone including its own caster, which is the WC3 「敵對召喚」 form.
 */
export function isAutoTargetable(world: SimWorld, self: EntityId, cand: EntityId): boolean {
  if (cand === self) return false;
  // 隱形 (sim/stealth.ts). Wired HERE — the one predicate every automatic
  // picker already goes through — rather than at each picker, for the exact
  // reason this file's header gives for `targetClassOf`: three copies of "what
  // may be targeted" is how 召喚物 became untargetable by half the game.
  //
  // `canSee` answers "not hidden / mine / ally / I have true sight in range",
  // and the WHETHER is a field: `blocksAutoAcquire` defaults true (WC3), and
  // with it false a hidden body is auto-acquired exactly as before, so the flag
  // becomes render-only. That is a legitimate config, not a broken one.
  if (world.stealthRules.blocksAutoAcquire && !canSee(world, self, cand)) return false;
  if (targetClassOf(world, cand) === null) return false;
  const myTeam = world.team.get(self);
  const theirTeam = world.team.get(cand);
  if (!myTeam || !theirTeam) return false;
  if (myTeam.teamId === theirTeam.teamId) return false;
  const hp = world.health.get(cand);
  return !!hp?.alive;
}

/**
 * May a #215 MOB pick `cand` as its aggro target?
 *
 * A SEPARATE question from {@link isAutoTargetable} and therefore a separate
 * field: zombies swarming a hero's ghouls instead of the hero is a real
 * tactical outcome (it is what summoning is FOR), and the owner may want it off
 * for a given ability without also making the body invisible to enemy heroes.
 * The team test stays where it already is, in MobSystem — mobs are hostile to
 * everything that is not on the MONSTER sentinel, which correctly also spares a
 * `team: "neutral"` summon.
 */
export function isMobTargetable(world: SimWorld, cand: EntityId, seeker?: EntityId): boolean {
  // 隱形. `seeker` is OPTIONAL and defaults to "nobody in particular" (-1), so
  // an existing caller that does not pass it still gets the right answer for
  // everything except true sight — a mob cannot have true sight today, and if
  // one ever does, its aggro scan is the one call site that must pass its own
  // id. Kept optional rather than required so this stays a strictly additive
  // change to a predicate three other lanes are editing this week.
  if (world.stealthRules.blocksMobAggro && !canSee(world, seeker ?? (-1 as EntityId), cand))
    return false;
  if (world.champion.has(cand)) return true;
  const sm = world.summon.get(cand);
  if (sm !== undefined) return summonMobTargetable(sm);
  return false;
}

/**
 * May a SEAT hand-pick `cand` with an explicit attack order?
 *
 * ⚠️ SCOPE. This is NOT a general legality check on `order.attackTarget` — the
 * sim has never had one (a seat may name a teammate, and `BasicAttackSystem`
 * runs no team test either), and inventing one here would silently change five
 * unrelated paths in a change about summons. It answers exactly one question:
 * 「這個召喚物允不允許被玩家點名」. Everything that is not a summon is left to
 * whatever the sim already did.
 */
export function isManuallyTargetable(
  world: SimWorld,
  cand: EntityId,
  clicker?: EntityId,
): boolean {
  // 隱形: 「擋不擋手動點選」 is its own field (`blocksManualTarget`, default
  // true = WC3: you cannot right-click what you cannot see). `clicker` is the
  // seat's own champion — it MUST be passed, because the ally/self exemptions
  // are the whole reason a stealthed player can still be clicked by his own
  // team. Without it the answer degrades to "nobody can click a hidden body",
  // which is wrong for allies, so the OrderSystem call site passes it.
  if (
    clicker !== undefined &&
    world.stealthRules.blocksManualTarget &&
    !canSee(world, clicker, cand)
  )
    return false;
  const sm = world.summon.get(cand);
  if (sm === undefined) return true;
  return summonManualTargetable(sm);
}

/** True when `attacker` damaged `victim` inside the threat window. */
export function isThreat(world: SimWorld, victim: EntityId, attacker: EntityId): boolean {
  // LOOKUP ONLY — never iterate this inner map: its order is first-hit order.
  const tick = world.recentDamagers.get(victim)?.get(attacker);
  if (tick === undefined) return false;
  return world.tick - tick <= THREAT_WINDOW_TICKS;
}

/** The sort keys for one candidate, or null when it is not a legal target. */
export function rankOf(
  world: SimWorld,
  self: EntityId,
  cand: EntityId,
): AcquiredTarget | null {
  if (!isAutoTargetable(world, self, cand)) return null;
  const selfT = world.transform.get(self);
  const candT = world.transform.get(cand);
  if (!selfT || !candT || candT.zone !== selfT.zone) return null;
  const hp = world.health.get(cand);
  if (!hp) return null;
  // `isAutoTargetable` already proved this is non-null; re-reading it (rather
  // than re-deriving the tier from `world.champion.has`) is what keeps a
  // summon's authored `targetPriority` from being silently overwritten with the
  // 「not a champion, so it must be a mob」 fallback the old line encoded.
  const kind = targetClassOf(world, cand);
  if (kind === null) return null;
  return {
    id: cand,
    kind,
    threat: isThreat(world, self, cand) ? 0 : 1,
    hp: hp.hp,
    d2: distSq(selfT.pos, candT.pos),
  };
}

/**
 * STRICTLY better on the full 4-key prefix (id is handled by iteration order:
 * candidates arrive ascending and an exact tie keeps the incumbent, so the
 * lowest id wins every remaining tie).
 */
function beats(a: AcquiredTarget, b: AcquiredTarget): boolean {
  if (a.kind !== b.kind) return a.kind < b.kind;
  if (a.threat !== b.threat) return a.threat < b.threat;
  if (a.hp !== b.hp) return a.hp < b.hp;
  return a.d2 < b.d2;
}

/**
 * STRICTLY better on the STABILITY PREFIX (kind, threat) only.
 *
 * Used to decide whether an ALREADY-held auto target should be swapped. HP and
 * distance move every tick, so re-running the full comparator each tick would
 * swap targets mid-approach and cancel the wind-up over and over (visible as a
 * hero flip-flopping between two enemies and dealing no damage). A held target
 * is therefore only abandoned for a categorically better one: an enemy champion
 * over a mob, or the enemy that just started hitting me. Everything else waits
 * until the held target dies, dies out of zone, or leaves the leash.
 */
function beatsForSwap(a: AcquiredTarget, b: AcquiredTarget): boolean {
  if (a.kind !== b.kind) return a.kind < b.kind;
  return a.threat < b.threat;
}

/**
 * THE rule. Returns the best auto-attack target for `self` within `radius`, or
 * null when there is none.
 *
 * Candidates come from the broad-phase via `queryOverlap`, which returns
 * ASCENDING ids and already honours the zone (PairedDuels never cross zones).
 *
 * `radius` is CENTRE-TO-CENTRE. The grid query is a body-overlap test, i.e. a
 * superset (it also returns a fat body whose EDGE reaches in), so the exact
 * `d2 <= radius²` filter below is what defines the radius. Centre-to-centre is
 * the same measure `reachTo` / the chase / `BasicAttackSystem` all use, so a
 * caller that passes a hold-band radius is guaranteed no target it acquires can
 * make the chase step forward.
 */
export function acquireTarget(
  world: SimWorld,
  self: EntityId,
  radius: number,
): AcquiredTarget | null {
  const t = world.transform.get(self);
  if (!t) return null;
  const ids = queryOverlap(
    world,
    { kind: "circle", center: t.pos, radius },
    { zone: t.zone, aliveOnly: true },
  );
  const maxD2 = radius * radius;
  let best: AcquiredTarget | null = null;
  for (const cand of ids) {
    const r = rankOf(world, self, cand);
    if (!r || r.d2 > maxD2) continue;
    if (best === null || beats(r, best)) best = r;
  }
  return best;
}

/**
 * Should a currently-held AUTO target be replaced by `candidate`?
 * Exported for the OrderSystem pass; see {@link beatsForSwap}.
 */
export function shouldSwapAutoTarget(
  held: AcquiredTarget,
  candidate: AcquiredTarget,
): boolean {
  return beatsForSwap(candidate, held);
}
