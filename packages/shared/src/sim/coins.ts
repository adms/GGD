/**
 * 陣亡投幣 (task #191) — a DEAD player throws their unspent gold onto the arena
 * floor, 100 at a time, and ANY living champion who walks over a coin picks it
 * up. The owner's answer to 「陣亡的玩家可以做什麼」.
 *
 * The mechanic, in one line: while you are dead and combat is live you may spend
 * 100 unspent gold to spawn a coin on the ground beside your corpse, up to TEN
 * per round; the first living champion to step on it — 「經過的玩家」, friend or
 * foe, deliberately unqualified — banks the 100.
 *
 * This is the revive circle's skeleton (zone-scoped, radius-based proximity,
 * deterministic, server-authoritative, armed on combat entry and torn down
 * beside `endCombatRevives`) with an economy payload, and it differs in exactly
 * three deliberate ways:
 *
 *   1. A coin is TRANSFORM + MARKER ONLY. No `TeamComp` (one would corrupt
 *      `teamAliveInZone` and duel resolution), no `Health` (one would make the
 *      coin attackable and inject hp/mana into `SimWorld.digest`).
 *   2. It is spawned by a COMMAND, not by a system's schedule — the one player
 *      action in the game that only a corpse may take.
 *   3. Unclaimed gold BURNS at round end. A throw is a real sacrifice, which is
 *      the drama the owner asked for; refunding it would make throwing riskless
 *      and therefore automatic.
 *
 * WHERE THE COIN LANDS — a fixed 10-slot ring, no rng. The alternatives were
 * rejected on determinism grounds: an aim-point payload is a client float, so a
 * dead player could post coins onto a distant teammate's feet and two clients
 * could disagree about where they went; and an rng scatter would draw from the
 * ONE shared `world.rng` stream that evasion, crits and the legendary orb pull
 * from, shifting every subsequent roll and invalidating every existing
 * recording. The ring is a pure function of (corpse position, throw index).
 *
 * PURITY: no rng, no wall clock, no trig. The ring table is authored constants —
 * `sim/purity.test.ts` bans `Math.cos` in SOURCE, and a lookup table is exactly
 * how that ban is meant to be satisfied.
 */
import type { EntityId, SeatId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";

/** EntityState.key / model doc id used for a dropped coin on the wire. */
export const GOLD_COIN_MODEL_KEY = "prop.gold-coin";

/** Coin rules. Unlike the flowers/revives there is no seconds→ticks axis. */
export interface CoinRules {
  /** gold per coin — deducted from the thrower, banked whole by the finder */
  coinValue: number;
  /** hard cap of throws per player per ROUND */
  coinsPerRound: number;
  /** distance from the corpse the ring of drop slots sits on */
  dropRadius: number;
  /** a living champion within this planar distance collects the coin */
  pickupRadius: number;
  /** the coin's own collision radius (it collides with nothing; see below) */
  coinRadius: number;
}

/** Config-doc mirror of `goldDrop` in config.arena-rules@1. */
export interface CoinConfigLike {
  coinValue: number;
  coinsPerRound: number;
  dropRadius: number;
  pickupRadius: number;
  coinRadius: number;
}

/** Convert the config block into sim rules (a copy, so the doc stays frozen). */
export function coinRulesFromConfig(cfg: CoinConfigLike): CoinRules {
  return {
    coinValue: cfg.coinValue,
    coinsPerRound: cfg.coinsPerRound,
    dropRadius: cfg.dropRadius,
    pickupRadius: cfg.pickupRadius,
    coinRadius: cfg.coinRadius,
  };
}

/**
 * The ten drop slots, as unit offsets from the corpse. Authored constants
 * rather than a `Math.cos` loop — see the module doc on the purity gate.
 */
const RING: readonly Vec2[] = [
  { x: 1, z: 0 },
  { x: 0.80902, z: 0.58779 },
  { x: 0.30902, z: 0.95106 },
  { x: -0.30902, z: 0.95106 },
  { x: -0.80902, z: 0.58779 },
  { x: -1, z: 0 },
  { x: -0.80902, z: -0.58779 },
  { x: -0.30902, z: -0.95106 },
  { x: 0.30902, z: -0.95106 },
  { x: 0.80902, z: -0.58779 },
];

/**
 * Why every throw skips THREE slots: 3 and 10 are coprime, so ten consecutive
 * throws visit all ten slots exactly once and consecutive coins land 108° apart
 * instead of adjacent — a player emptying their purse never sees two coins
 * overlap. At `dropRadius` 1.9 the neighbouring-slot arc is 1.19u, comfortably
 * wider than a coin's 0.62u diameter.
 */
const SLOT_STRIDE = 3;

/**
 * Where the `index`-th coin of this round lands. Pure function of (corpse
 * position, index): two independently constructed worlds agree without ever
 * touching `world.rng`. The point is then pushed out of obstacles and clamped
 * into the zone (the same two helpers `pickFlowerSpawnPos` falls back to), so a
 * corpse against a wall still yields legal ground rather than a coin inside it.
 */
export function coinDropPos(world: SimWorld, zone: number, corpse: Vec2, index: number, rules: CoinRules): Vec2 {
  const slot = RING[(index * SLOT_STRIDE) % RING.length]!;
  const body = {
    pos: { x: corpse.x + slot.x * rules.dropRadius, z: corpse.z + slot.z * rules.dropRadius },
    radius: rules.coinRadius,
  };
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  return body.pos;
}

/** Coins this player may still throw this round (0 when unarmed/not in round). */
export function coinBudgetFor(world: SimWorld, entity: EntityId): number {
  return world.coinBudget.get(entity) ?? 0;
}

/**
 * Spawn one coin: transform + the marker, nothing else. See CoinComp for why
 * the missing Health/TeamComp are load-bearing rather than an omission.
 */
export function spawnCoin(
  world: SimWorld,
  args: { zone: number; pos: Vec2; value: number; ownerSeatId: SeatId; radius: number },
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: args.radius,
    zone: args.zone,
  });
  world.coin.set(id, { value: args.value, zone: args.zone, ownerSeatId: args.ownerSeatId });
  return id;
}

/** Why a `dropCoin` press was refused — every one of these rides an event. */
export type CoinDropRejection =
  | "no-champion"
  | "phase-closed"
  | "alive"
  | "not-in-round"
  | "cap-reached"
  | "no-gold";

/**
 * Resolve one `dropCoin` command. Returns "ok" or the reason it was refused;
 * either way the caller has already been answered by an event, because a press
 * that produces silence is the defect P7 exists to delete.
 *
 * `entity` is null when the seat owns no champion — the CommandSystem's own
 * lookup failed — which is the `no-champion` case.
 */
export function dropCoinCommand(world: SimWorld, entity: EntityId | null, seatId: SeatId): "ok" | CoinDropRejection {
  const rules = world.coinRules;
  if (!rules) return "phase-closed"; // mechanic off: the caller emits nothing
  const reject = (reason: CoinDropRejection): CoinDropRejection => {
    world.emit("coinDropRejected", { seatId, reason });
    return reason;
  };
  if (entity === null) return reject("no-champion");
  const champ = world.champion.get(entity);
  if (!champ) return reject("no-champion");
  if (!world.combatActive) return reject("phase-closed");
  const hp = world.health.get(entity);
  // ONLY THE DEAD MAY THROW. This is the whole point of the mechanic, so it is
  // checked before the budget: a living player is never told "cap reached".
  if (hp?.alive !== false) return reject("alive");
  // No budget entry = this seat was not scheduled into the round (a bye seat or
  // an eliminated team, both parked dead by enterCombat). That single absence is
  // the entire elimination/bye answer — no team-lives plumbing reaches the sim.
  const budget = world.coinBudget.get(entity);
  if (budget === undefined) return reject("not-in-round");
  if (budget <= 0) return reject("cap-reached");
  if (champ.gold < rules.coinValue) return reject("no-gold");

  const t = world.transform.get(entity);
  if (!t) return reject("no-champion");
  const index = rules.coinsPerRound - budget;
  const pos = coinDropPos(world, t.zone, t.pos, index, rules);
  // Inline, like the three existing spend sites — there is no spendGold helper,
  // and routing this through grantGold would double-count the gold as earned.
  champ.gold -= rules.coinValue;
  world.coinBudget.set(entity, budget - 1);
  const id = spawnCoin(world, {
    zone: t.zone,
    pos,
    value: rules.coinValue,
    ownerSeatId: seatId,
    radius: rules.coinRadius,
  });
  world.emit("coinDropped", {
    id,
    seatId,
    x: pos.x,
    z: pos.z,
    value: rules.coinValue,
    gold: champ.gold,
    left: budget - 1,
  });
  return "ok";
}

/**
 * Combat entry: arm the rules and hand a throw budget to exactly the champions
 * the host SCHEDULED into this round. The same entity list feeds
 * `beginCombatRevives`' team list, so a bye seat and an eliminated seat — both
 * parked dead but never placed into a duel — get no entry and are refused with
 * `not-in-round`. Clears any stale coins first. Idempotent.
 */
export function beginCombatCoins(world: SimWorld, rules: CoinRules, entityIds: readonly EntityId[]): void {
  endCombatCoins(world);
  world.coinRules = rules;
  for (const id of entityIds) world.coinBudget.set(id, rules.coinsPerRound);
}

/**
 * Combat exit (round end / phase leave): every coin still on the floor is
 * DESTROYED and its gold is burned, and every budget resets. Runs before
 * `settleRound`, so nothing survives into resolution, intermission or the next
 * round — there is no free carry and no riskless throw. Idempotent.
 */
export function endCombatCoins(world: SimWorld): void {
  for (const id of [...world.coin.keys()]) world.destroy(id);
  world.coinBudget.clear();
  world.coinRules = null;
}
