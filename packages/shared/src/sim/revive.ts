/**
 * Revive circles (復活小火圈) — spawn/despawn helpers + the world-level rules
 * and bookkeeping the ReviveSystem runs on. Task #84.
 *
 * THE MECHANIC, in one line: when a champion dies in combat their team drops a
 * team-tinted fire ring on the corpse; a LIVING TEAMMATE who stands in it and
 * channels for `channelSec` brings them back — ONCE per team per round.
 *
 * This is the healing flower's skeleton (zone-scoped, tick-scheduled,
 * radius-based proximity, deterministic, server-authoritative, armed on combat
 * entry and torn down beside `endCombatFlowers`) with a different payload, and
 * it differs in exactly two deliberate ways:
 *
 *   1. A circle has **no health component and no TeamComp seat**. It is ground
 *      area, not a unit: never attackable, never a target, and structurally
 *      invisible to `teamAliveCount` / duel resolution / the scoreboard. Team
 *      ownership lives in `ReviveCircleComp.teamId` instead.
 *   2. It is TEAM-OWNED rather than neutral, so it renders in the team palette
 *      and only that team can drive it.
 *
 * TIMING SOURCE. Everything schedules off the ABSOLUTE `world.tick`, not
 * `world.combatTicks`. `combatTicks` is incremented inside `flowerSystem`,
 * which returns early when `flowerRules` is null — so a match with flowers
 * disabled would freeze the revive clock. `world.tick` is monotonic and
 * unconditional, equally deterministic, and decouples the two mechanics.
 * Combat gating comes from `world.reviveRules` being armed (the match host
 * arms it in `enterCombat` and clears it in `concludeCombat`), so a circle can
 * never exist outside combat and the client's prediction shadow world — which
 * never arms the rules — is a strict no-op.
 *
 * PURITY: no rng, no wall clock, no trig. A circle spawns AT THE CORPSE, so
 * unlike a flower it needs no position sampling at all.
 */
import type { EntityId, SeatId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { clearForFreshBody } from "./clearPools";
import type { Vec2 } from "./math/vec2";
import { distSq } from "./math/vec2";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";
import { fireRingRadius } from "./fireRing";

/** EntityState.key / model doc id used for revive circles on the wire. */
export const REVIVE_CIRCLE_MODEL_KEY = "prop.revive-circle";

/**
 * The revive-channel threshold in SECONDS (task #206: 復活圈需累積 5 秒).
 *
 * A living teammate must ACCUMULATE this long standing inside a dead ally's
 * circle before the revive completes — 5.0s at 30Hz is exactly 150 ticks
 * ({@link reviveRulesFromConfig} rounds `channelSec / dt`), and the rim of the
 * ring fills toward 100% as those ticks bank (the world-space progress read the
 * ReviveCircleView paints; over the wire it is `progressTicks / channelTicks`).
 *
 * This is the NAMED default the shipped `config.arena-rules@1 reviveCircles`
 * doc carries (`channelSec: 5.0`); the doc stays the runtime authority so an
 * operator can retune it in 戰鬥系統, but the constant pins the intended 5s so a
 * doc-less path and the tests describe the same number rather than a magic 5.
 */
export const REVIVE_CHANNEL_SEC = 5.0;

/**
 * Revive rules in TICKS (converted from the config doc's seconds).
 *
 * The tuned contract (see docs/todo/revive-circles.md for the measured
 * derivation of every number):
 *   channelSec 5.0  — the {@link REVIVE_CHANNEL_SEC} threshold (task #206):
 *                     a living teammate must bank a full 5s (150 ticks @30Hz)
 *                     standing in the ring before the revive fires. Comfortably
 *                     above the measured p25 death cadence (2.00s) so a revive
 *                     never outpaces a kill, yet the duel still exists when you
 *                     finish. The rim fills toward 100% across those 150 ticks.
 *   radius          — comes off the config (reviveCircles.radius), never a
 *                     constant here. History: 2.0 at birth (1.7x a champion's
 *                     own diameter, 1/3 of the flower's burstRadius so the two
 *                     ground effects never read as the same thing) → 4
 *                     (owner 2026-08-24「可以再大一倍」) → 2.4 (owner
 *                     2026-08-27 GH#778「復活火圈太大 減少 40%」). It is BOTH
 *                     the channel/contest judgement range and the drawn ring
 *                     (reviveRadiusHonest.test.ts keeps the two equal).
 *
 * THERE IS NO LIFETIME. The ring used to burn for exactly 2x the channel and
 * then vanish; task #196 removed that clock on the owner's call
 * 「復活隊友的圈圈 沒有消失期限直到回合結束」 — which is also what LoL Arena
 * does: the wiki documents the downed-state zone and the one-revive-per-round
 * cap but no timeout on the zone itself. A circle now ends only for a REASON —
 * the owner came back, the owner's entity went away, the owner's team was
 * wiped out of the zone, or the round ended (`endCombatRevives`). None of this
 * makes revives unlimited: `revivesPerTeamPerRound` still gates that, and the
 * charge is still spent on completion only.
 */
export interface ReviveRules {
  channelTicks: number;
  radius: number;
  /** progress drain per tick while nobody is channelling (in progress-ticks) */
  decayMult: number;
  revivesPerTeamPerRound: number;
  reviveHpPctMax: number;
  reviveManaPctMax: number;
  /** an enemy inside the ring HOLDS progress (never resets it) */
  contestPauses: boolean;
  /** false: taking damage never interrupts (the measured melee-blob call) */
  damageInterrupts: boolean;
  /** true: stun/root/knockdown cancels the channel */
  ccInterrupts: boolean;
}

/** Seconds-based revive config (mirror of config.arena-rules@1 `reviveCircles`). */
export interface ReviveConfigLike {
  channelSec: number;
  radius: number;
  decayMult: number;
  revivesPerTeamPerRound: number;
  reviveHpPctMax: number;
  reviveManaPctMax: number;
  contestPauses: boolean;
  damageInterrupts: boolean;
  ccInterrupts: boolean;
}

/** Convert the seconds-based config block into tick-based sim rules. */
export function reviveRulesFromConfig(cfg: ReviveConfigLike, dt: number): ReviveRules {
  return {
    channelTicks: Math.max(1, Math.round(cfg.channelSec / dt)),
    radius: cfg.radius,
    decayMult: cfg.decayMult,
    revivesPerTeamPerRound: cfg.revivesPerTeamPerRound,
    reviveHpPctMax: cfg.reviveHpPctMax,
    reviveManaPctMax: cfg.reviveManaPctMax,
    contestPauses: cfg.contestPauses,
    damageInterrupts: cfg.damageInterrupts,
    ccInterrupts: cfg.ccInterrupts,
  };
}

/** Revive charges left for a team this round (0 when unarmed/spent). */
export function reviveChargesFor(world: SimWorld, teamId: TeamId): number {
  return world.reviveCharges.get(teamId) ?? 0;
}

/**
 * The team's live circle in `zone`, if any. At most ONE circle per team is
 * ever alive: a second death while the first ring still burns drops nothing —
 * the existing ring is the team's only chance, and it still revives only its
 * own original owner.
 */
export function reviveCircleOfTeam(world: SimWorld, teamId: TeamId, zone: number): EntityId | null {
  for (const [id, rc] of world.reviveCircle) {
    if (rc.teamId === teamId && rc.zone === zone) return id;
  }
  return null;
}

/** Living champions of `teamId` currently in `zone` (the sim-side alive count). */
export function teamAliveInZone(world: SimWorld, teamId: TeamId, zone: number): number {
  let n = 0;
  for (const [id] of world.champion) {
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const team = world.team.get(id);
    if (t?.zone === zone && hp?.alive && team?.teamId === teamId) n++;
  }
  return n;
}

export interface SpawnReviveCircleArgs {
  ownerId: EntityId;
  ownerSeatId: SeatId;
  teamId: TeamId;
  zone: number;
  pos: Vec2;
  radius: number;
}

/**
 * Spawn a team-owned revive circle: transform ONLY (+ the marker). No health,
 * no TeamComp, no nav, no stats — see the module doc for why that shape is
 * load-bearing rather than an omission.
 *
 * Emits `reviveCircleSpawn` {id, ownerId, seatId, teamId, zone, x, z}. There is
 * no `ticks` on the payload any more: the ring has no lifetime to announce.
 */
export function spawnReviveCircle(world: SimWorld, args: SpawnReviveCircleArgs): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: args.radius,
    zone: args.zone,
  });
  world.reviveCircle.set(id, {
    ownerId: args.ownerId,
    ownerSeatId: args.ownerSeatId,
    teamId: args.teamId,
    zone: args.zone,
    spawnedAtTick: world.tick,
    progressTicks: 0,
    channellerId: null,
    contested: false,
  });
  world.emit("reviveCircleSpawn", {
    id,
    ownerId: args.ownerId,
    seatId: args.ownerSeatId,
    teamId: args.teamId,
    zone: args.zone,
    x: args.pos.x,
    z: args.pos.z,
  });
  return id;
}

/**
 * Combat entry: arm the revive rules and hand every listed team its round
 * charge. Clears any stale circles first. Charges are keyed by TeamId (not by
 * zone) so they cannot leak across the two independent duels even when the
 * pairings change between rounds.
 */
export function beginCombatRevives(
  world: SimWorld,
  rules: ReviveRules,
  teams: readonly TeamId[],
): void {
  endCombatRevives(world);
  world.reviveRules = rules;
  for (const teamId of teams) {
    world.reviveCharges.set(teamId, rules.revivesPerTeamPerRound);
  }
}

/**
 * Combat exit (round end / phase leave): every circle despawns SILENTLY, every
 * in-flight channel dies with it, and all team charges reset. No revive ever
 * resolves across a phase boundary and no circle survives into resolution,
 * intermission or the settlement scene. Idempotent.
 *
 * Since task #196 removed the per-circle lifetime this is the ONLY
 * unconditional despawn left, so it is the sole thing standing between a ring
 * and the next round. The match host calls it on every combat EXIT and again on
 * combat ENTRY (through `beginCombatRevives`), so even a path that skipped the
 * exit starts the next round clean.
 */
export function endCombatRevives(world: SimWorld): void {
  for (const id of [...world.reviveCircle.keys()]) world.destroy(id);
  world.reviveCharges.clear();
  world.reviveRules = null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE REVIVE PRIMITIVE —— 「站起來」 itself, with no circle attached
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything below was EXTRACTED VERBATIM from `systems/ReviveSystem.ts`
 * (`fireRingInnerRadius` + the body of `completeRevive`) so that a SECOND way
 * to come back from the dead cannot exist. 天生牙 godie-i031 「[復活] 殺死任一個
 * 敵方英雄單位，將復活我方所有英雄」 needs the same state contract the circle has
 * and must not re-derive it: two revive paths that disagree about, say, whether
 * shields carry through the grave is exactly the kind of divergence nobody ever
 * notices until a player reports it as 「有時候復活會帶著護盾」.
 *
 * ReviveSystem now calls {@link reviveChampionAt} for the circle's completion,
 * and `effects/revive.ts` calls it for the item. The circle keeps everything
 * that is ABOUT THE CIRCLE (the channel, the charge, the entity, its events);
 * this function is only 「這個人現在活過來，在這個座標」.
 */

/**
 * The fire ring's INNER safe radius in `zone` right now, for a body of
 * `bodyRadius` — or null when no ring is armed / it has not ignited yet.
 *
 * `<= 0` is the fully-closed ring (#195): there is no survivable space at all,
 * so reviving anyone is a griefing loop — they stand up and burn at 20 %/s with
 * nowhere to go, dropping a fresh circle, forever. Live circles expire and no
 * new one may drop from that moment.
 */
export function fireRingInnerRadius(
  world: SimWorld,
  zone: number,
  bodyRadius: number,
): number | null {
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0) return null;
  if (world.fireRingTicks < rules.startTicks) return null;
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  if (!zoneDef) return null;
  const r = fireRingRadius(rules, world.fireRingTicks - rules.startTicks, zoneDef.boundaryRadius);
  return r - bodyRadius;
}

/** Where and how much a revive puts back. See {@link reviveChampionAt}. */
export interface ReviveAtArgs {
  /** REQUESTED spawn point; obstacles / boundary / fire ring may pull it in. */
  pos: Vec2;
  zone: number;
  /** fraction of maxHp, clamped to at least 1 HP so 0 still yields a live body */
  hpPct: number;
  /** fraction of maxMana */
  manaPct: number;
}

/**
 * Bring `id` back to life at (a legal point near) `args.pos`. Returns the final
 * position, or NULL when the revive was REFUSED — and every refusal is a
 * REASON, never a silent nothing:
 *
 *   · no health/transform component (not a body that can live);
 *   · already alive (nothing to undo);
 *   · the fire ring has closed to nothing in that zone (#195): standing someone
 *     up inside a total burn is a griefing loop, so both revive paths refuse.
 *
 * STATE CONTRACT (docs/todo/revive-circles.md, unchanged by the extraction):
 * partial HP/mana, keeps items / gold / level / ability cooldowns, clears
 * status + shields + **DoT** exactly like `enterCombat`（三者都走
 * `clearPools.ts` 的 `clearForFreshBody`）, drops orders and any mid-leap
 * airborne entry, and does NOT rewrite history — the death stays a death and
 * the kill stays a kill (#25's counters and the S+..C- rating must never be
 * corrupted).
 *
 * It does NOT: spend a team charge, record a scoreboard rescue, or emit an
 * event. Those are the CALLER's, because the circle and the item disagree about
 * all three — see `ReviveSystem.completeRevive` and `effects/revive.ts`.
 *
 * PURITY: `Math.sqrt` only (allowed — it IS correctly rounded in IEEE-754,
 * unlike the transcendentals sim/purity.test.ts bans), no rng, no clock.
 */
export function reviveChampionAt(
  world: SimWorld,
  id: EntityId,
  args: ReviveAtArgs,
): Vec2 | null {
  const hp = world.health.get(id);
  const t = world.transform.get(id);
  if (!hp || !t) return null;
  if (hp.alive) return null;

  const zoneDef = world.arena.zones[args.zone] ?? world.arena.zones[0];
  if (!zoneDef) return null;

  const body = { pos: { x: args.pos.x, z: args.pos.z }, radius: t.radius };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  // #195: a champion may not come back OUTSIDE the fire ring — that is an
  // instant burn they never chose. Pull the spawn point toward the zone centre
  // until the whole body sits inside, with 0.1 u of slack so the very next tick
  // of shrink does not immediately push them out again. A ring that has closed
  // COMPLETELY refuses the revive outright rather than picking a doomed point.
  const inner = fireRingInnerRadius(world, args.zone, t.radius);
  if (inner !== null && inner <= 0) return null;
  if (inner !== null && inner > 0) {
    const maxD = inner - 0.1;
    const d2 = distSq(body.pos, zoneDef.center);
    if (maxD > 0 && d2 > maxD * maxD) {
      const d = Math.sqrt(d2);
      const s = d > 0 ? maxD / d : 0;
      body.pos = {
        x: zoneDef.center.x + (body.pos.x - zoneDef.center.x) * s,
        z: zoneDef.center.z + (body.pos.z - zoneDef.center.z) * s,
      };
    }
    // ⭐ GH#364 —— 矩形分區的火圈**是矩形**（`fireRingSafeAt`）。上面那一段是
    // 徑向拉回，對矩形來說**拉得不夠**：一個在圓內但在收縮矩形外的點，正是
    // 這一段自己說要避免的「a champion may not come back OUTSIDE the fire ring
    // — that is an instant burn they never chose」。⇒ 矩形再逐軸夾一次。
    // ⚠️ 圓形分區走不到這裡（`bounds` 缺席），既有行為與錄影逐位元不變。
    if (zoneDef.bounds?.kind === "rect") {
      const ring = inner + t.radius; // 還原成「圈的半徑」，逐軸夾用的是它
      const k = Math.max(0, Math.min(1, ring / zoneDef.bounds.halfW));
      const hw = Math.max(0, zoneDef.bounds.halfW * k - t.radius - 0.1);
      const hd = Math.max(0, zoneDef.bounds.halfD * k - t.radius - 0.1);
      const dx = body.pos.x - zoneDef.center.x;
      const dz = body.pos.z - zoneDef.center.z;
      body.pos = {
        x: zoneDef.center.x + Math.min(hw, Math.max(-hw, dx)),
        z: zoneDef.center.z + Math.min(hd, Math.max(-hd, dz)),
      };
    }
  }

  t.pos = body.pos;
  t.zone = args.zone;
  t.vel = { x: 0, z: 0 };
  t.accel = 0;

  hp.alive = true;
  // at least 1 HP: a 0% config must still produce a living champion
  hp.hp = Math.max(1, hp.maxHp * args.hpPct);
  hp.mana = hp.maxMana * args.manaPct;
  // ⛔ A4(#278) —— 這三池以前是**兩行手寫**,而那兩行只清了 status 與 shields。
  // `world.dot` 沒有被碰到,所以**死前身上的燃燒會跟著復活的身體一起回來**,
  // 在血條上看起來只是「復活之後莫名其妙一直在掉血」。
  // `effects/dotTick.ts` 的檔頭自己寫著這件事(「the host's round reset …
  // knows nothing about world.dot」),而它一直沒有人修。
  //
  // 現在三個清池站點(這裡 + MatchController 的兩個 enterCombat)走同一支函式,
  // 所以「復活清什麼」與「開新回合清什麼」在結構上不可能再分岔。
  clearForFreshBody(world, id);
  const nav = world.nav.get(id);
  if (nav) {
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.attackTargetAuto = false;
    nav.override = null;
  }
  world.airborne.delete(id); // #247: a revived body is never mid-arc
  const ab = world.abilities.get(id);
  if (ab) {
    // ability COOLDOWNS are deliberately not reset — they are tick-based and
    // kept running while dead, so you return with whatever happens to be up.
    ab.cast = null;
    ab.windup = null;
  }
  world.hitstop.delete(id);
  world.knockdown.delete(id);

  return body.pos;
}
