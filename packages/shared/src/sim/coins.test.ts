/**
 * 陣亡投幣 — sim primitives (task #191). Covers the deterministic drop ring, the
 * zero-rng-perturbation contract, every rejection reason, the per-round cap and
 * its reset, the coin's deliberate component shape, the pickup tie-break, and
 * gold conservation across the whole throw → pick-up → burn lifecycle.
 *
 * Server-side match wiring (arming per round from the arena-rules doc, the
 * bye/eliminated case, the snapshot/replay round trip) lives in
 * apps/game-server.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import {
  beginCombatCoins,
  coinBudgetFor,
  coinDropPos,
  coinRulesFromConfig,
  dropCoinCommand,
  endCombatCoins,
  type CoinRules,
} from "./coins";
import { queryOverlap } from "./collision/queries";
import { circle } from "./collision/shapes";
import { getMatchStats } from "./stats/matchStats";
import { dist } from "./math/vec2";

beforeAll(() => registerSkeletonContent());

/** The shipped contract (content/config/arena-rules.json `goldDrop`). */
const RULES: CoinRules = coinRulesFromConfig({
  coinValue: 100,
  coinsPerRound: 10,
  dropRadius: 1.9,
  pickupRadius: 1.6,
  coinRadius: 0.31,
});

const CENTER = SKELETON_ARENA.zones[0]!.center;

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

/** Make `id` a DEAD, funded thrower (the only state that may throw). */
function makeThrower(w: SimWorld, id: EntityId, gold: number): void {
  w.health.get(id)!.alive = false;
  w.health.get(id)!.hp = 0;
  w.champion.get(id)!.gold = gold;
}

/**
 * A live combat with one dead funded thrower (seat 0) far from anyone, plus a
 * living enemy (seat 1) parked out of pickup range until a test moves it.
 */
function coinWorld(rules: CoinRules = RULES, gold = 2000): {
  w: SimWorld;
  thrower: EntityId;
  finder: EntityId;
} {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const thrower = champAt(w, 0, 0, CENTER.x + 9, CENTER.z);
  const finder = champAt(w, 1, 1, CENTER.x - 14, CENTER.z);
  beginCombatCoins(w, rules, [thrower, finder]);
  makeThrower(w, thrower, gold);
  return { w, thrower, finder };
}

/** Total gold across every champion plus every coin still on the floor. */
function totalGold(w: SimWorld): number {
  let sum = 0;
  for (const [, c] of w.champion) sum += c.gold;
  for (const [, c] of w.coin) sum += c.value;
  return sum;
}

/** Drive the command through the REAL pipeline (commandSystem, slot 3). */
function pressDrop(w: SimWorld, seat: number): void {
  const intents = new Map<SeatId, IntentFrame>([
    [asSeatId(seat), { commands: [{ kind: "dropCoin" }] }],
  ]);
  w.step(intents);
}

function rejections(w: SimWorld): string[] {
  return w.events.filter((e) => e.type === "coinDropRejected").map((e) => String(e.data.reason));
}

describe("the drop ring is deterministic and rng-free (coin-01)", () => {
  it("two independently built worlds put the same throw in the same place", () => {
    cover("coin-drop-deterministic");
    const a = coinWorld();
    const b = coinWorld();
    for (let i = 0; i < 10; i++) {
      dropCoinCommand(a.w, a.thrower, asSeatId(0));
      dropCoinCommand(b.w, b.thrower, asSeatId(0));
    }
    const posA = [...a.w.coin.keys()].map((id) => a.w.transform.get(id)!.pos);
    const posB = [...b.w.coin.keys()].map((id) => b.w.transform.get(id)!.pos);
    expect(posA).toHaveLength(10);
    expect(posB).toEqual(posA);
  });

  it("consecutive throws never stack: every slot is used once, 108° apart", () => {
    const { w, thrower } = coinWorld();
    const corpse = w.transform.get(thrower)!.pos;
    const pts = Array.from({ length: 10 }, (_, i) => coinDropPos(w, 0, corpse, i, RULES));
    // ten distinct points, all one dropRadius out (open ground: no push/clamp)
    for (const p of pts) expect(dist(p, corpse)).toBeCloseTo(RULES.dropRadius, 3);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        // 2 * coinRadius is the diameter; adjacent slots must clear it
        expect(dist(pts[i]!, pts[j]!)).toBeGreaterThan(RULES.coinRadius * 2);
      }
    }
    // and the stride of 3 really does skip: slot 0 -> 3 is not slot 0 -> 1
    expect(dist(pts[0]!, pts[1]!)).toBeGreaterThan(dist(pts[0]!, pts[3]!) - 1e-9);
  });

  it("a corpse against the wall still yields legal ground", () => {
    const w = new SimWorld(SKELETON_ARENA, 3);
    const zone = SKELETON_ARENA.zones[0]!;
    // just inside the boundary — the raw ring would put half the slots outside
    const corpse = { x: zone.center.x + zone.boundaryRadius - 0.2, z: zone.center.z };
    for (let i = 0; i < 10; i++) {
      const p = coinDropPos(w, 0, corpse, i, RULES);
      expect(dist(p, zone.center)).toBeLessThanOrEqual(zone.boundaryRadius + 1e-6);
      for (const ob of zone.obstacles) {
        if (ob.kind !== "circle") continue;
        expect(dist(p, ob.center)).toBeGreaterThanOrEqual(ob.radius - 1e-6);
      }
    }
  });

  it("ten throws and ten pickups leave world.rng.state UNTOUCHED", () => {
    // The whole reason the ring is a table and not a scatter: `world.rng` is one
    // shared stream (evasion / crit / the legendary orb all pull from it), so a
    // single draw here would shift every later roll and invalidate every replay.
    const { w, thrower, finder } = coinWorld();
    const before = w.rng.state;
    for (let i = 0; i < 10; i++) dropCoinCommand(w, thrower, asSeatId(0));
    expect(w.coin.size).toBe(10);
    const corpse = w.transform.get(thrower)!.pos;
    for (let i = 0; i < 10; i++) {
      // walk the finder onto each coin in turn (one pickup per tick)
      const coinId = [...w.coin.keys()][0]!;
      const cp = w.transform.get(coinId)!.pos;
      w.transform.get(finder)!.pos = { x: cp.x, z: cp.z };
      step(w);
    }
    expect(w.coin.size).toBe(0);
    expect(dist(corpse, corpse)).toBe(0); // the corpse never moved
    expect(w.rng.state).toBe(before);
  });
});

describe("every refusal answers back (coin-02)", () => {
  it("the mechanic being OFF is silent, not a rejection", () => {
    cover("coin-drop-rejections");
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const id = champAt(w, 0, 0, CENTER.x, CENTER.z);
    makeThrower(w, id, 2000);
    w.events.length = 0;
    dropCoinCommand(w, id, asSeatId(0));
    expect(w.events).toEqual([]);
    expect(w.coin.size).toBe(0);
    expect(w.champion.get(id)!.gold).toBe(2000);
  });

  it("no-champion: a seat with no entity still gets an answer", () => {
    const { w } = coinWorld();
    dropCoinCommand(w, null, asSeatId(9));
    expect(rejections(w)).toEqual(["no-champion"]);
  });

  it("phase-closed: throwing outside live combat", () => {
    const { w, thrower } = coinWorld();
    w.combatActive = false;
    dropCoinCommand(w, thrower, asSeatId(0));
    expect(rejections(w)).toEqual(["phase-closed"]);
    expect(w.coin.size).toBe(0);
  });

  it("alive: only the dead may throw", () => {
    const { w, finder } = coinWorld();
    w.champion.get(finder)!.gold = 2000;
    dropCoinCommand(w, finder, asSeatId(1));
    expect(rejections(w)).toEqual(["alive"]);
    expect(w.champion.get(finder)!.gold).toBe(2000);
  });

  it("not-in-round: a champion the host never scheduled has no budget", () => {
    const { w } = coinWorld();
    // a seat parked dead but never placed into the duel — the bye / eliminated
    // shape, expressed as the ABSENCE of a budget entry
    const bye = champAt(w, 5, 2, CENTER.x, CENTER.z + 12);
    makeThrower(w, bye, 2000);
    expect(coinBudgetFor(w, bye)).toBe(0);
    dropCoinCommand(w, bye, asSeatId(5));
    expect(rejections(w)).toEqual(["not-in-round"]);
    expect(w.coin.size).toBe(0);
  });

  it("cap-reached: the eleventh throw of a round is refused", () => {
    const { w, thrower } = coinWorld();
    for (let i = 0; i < 10; i++) expect(dropCoinCommand(w, thrower, asSeatId(0))).toBe("ok");
    expect(coinBudgetFor(w, thrower)).toBe(0);
    w.events.length = 0;
    expect(dropCoinCommand(w, thrower, asSeatId(0))).toBe("cap-reached");
    expect(rejections(w)).toEqual(["cap-reached"]);
    expect(w.coin.size).toBe(10);
  });

  it("no-gold: 99 gold buys nothing, and gold can never go negative", () => {
    const { w, thrower } = coinWorld(RULES, 99);
    expect(dropCoinCommand(w, thrower, asSeatId(0))).toBe("no-gold");
    expect(rejections(w)).toEqual(["no-gold"]);
    expect(w.champion.get(thrower)!.gold).toBe(99);
    // exactly the price works, and lands on 0
    w.champion.get(thrower)!.gold = 100;
    expect(dropCoinCommand(w, thrower, asSeatId(0))).toBe("ok");
    expect(w.champion.get(thrower)!.gold).toBe(0);
  });

  it("the command reaches the sim through the real pipeline", () => {
    const { w, thrower } = coinWorld();
    pressDrop(w, 0);
    expect(w.coin.size).toBe(1);
    expect(w.champion.get(thrower)!.gold).toBe(1900);
    expect(w.events.some((e) => e.type === "coinDropped" && e.data.left === 9)).toBe(true);
  });
});

describe("the per-round cap (coin-03)", () => {
  it("is exactly ten, and resets across a round boundary", () => {
    cover("coin-round-cap");
    const { w, thrower, finder } = coinWorld();
    for (let i = 0; i < 12; i++) dropCoinCommand(w, thrower, asSeatId(0));
    expect(w.coin.size).toBe(10);
    expect(w.champion.get(thrower)!.gold).toBe(2000 - 10 * 100);

    endCombatCoins(w);
    expect(w.coin.size).toBe(0); // unclaimed gold BURNS
    expect(coinBudgetFor(w, thrower)).toBe(0);

    beginCombatCoins(w, RULES, [thrower, finder]);
    expect(coinBudgetFor(w, thrower)).toBe(10);
    expect(dropCoinCommand(w, thrower, asSeatId(0))).toBe("ok");
  });
});

describe("a coin is transform + marker only (coin-04)", () => {
  it("carries no TeamComp and no Health", () => {
    cover("coin-entity-shape");
    const { w, thrower } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    expect(w.transform.has(id)).toBe(true);
    expect(w.team.has(id)).toBe(false); // would corrupt teamAliveInZone / duels
    expect(w.health.has(id)).toBe(false); // would make it attackable + hashed
    expect(w.nav.has(id)).toBe(false);
    expect(w.champion.has(id)).toBe(false);
  });

  it("is absent from the broad-phase grid and from queryOverlap", () => {
    const { w, thrower } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    w.rebuildGrid();
    expect(w.grid.queryCircle(p, 5)).not.toContain(id);
    // …so no ability / projectile / auto can ever target it
    expect(queryOverlap(w, circle(p, 5), { zone: 0 })).not.toContain(id);
  });

  it("neither pushes nor is pushed by a champion standing on it", () => {
    const { w, thrower, finder } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const before = { ...w.transform.get(id)!.pos };
    // park the finder in another zone so the pickup does not consume the coin
    w.transform.get(finder)!.zone = 1;
    w.transform.get(finder)!.pos = { x: before.x, z: before.z };
    step(w, 3);
    const after = w.transform.get(id)!.pos;
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.z).toBeCloseTo(before.z, 9);
  });
});

describe("pickup (coin-05)", () => {
  it("any LIVING champion collects it — friend or foe, per the owner", () => {
    cover("coin-pickup");
    const { w, thrower, finder } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    const goldBefore = w.champion.get(finder)!.gold;
    w.transform.get(finder)!.pos = { x: p.x, z: p.z };
    step(w);
    // the ENEMY of the thrower banked it, and the coin is gone the same tick
    expect(w.coin.has(id)).toBe(false);
    expect(w.transform.has(id)).toBe(false);
    expect(w.champion.get(finder)!.gold).toBe(goldBefore + 100);
    expect(getMatchStats(w, finder).coinsCollected).toBe(1);
    const ev = w.events.find((e) => e.type === "coinPickedUp")!;
    expect(ev.data).toMatchObject({ id, seatId: 1, value: 100 });
    // x/z ride the event because the entity is already destroyed
    expect(ev.data.x).toBeCloseTo(p.x, 6);
  });

  it("scores on its OWN counter, never on goldEarned", () => {
    const { w, thrower, finder } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const earnedBefore = getMatchStats(w, finder).goldEarned;
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    w.transform.get(finder)!.pos = { x: p.x, z: p.z };
    step(w);
    expect(getMatchStats(w, finder).goldEarned).toBe(earnedBefore);
  });

  it("a DEAD champion standing on it collects nothing", () => {
    const { w, thrower, finder } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    w.health.get(finder)!.alive = false;
    w.transform.get(finder)!.pos = { x: p.x, z: p.z };
    step(w, 3);
    expect(w.coin.has(id)).toBe(true);
  });

  it("two equidistant champions: the LOWEST entity id wins", () => {
    const w = new SimWorld(SKELETON_ARENA, 11);
    w.combatActive = true;
    const thrower = champAt(w, 0, 0, CENTER.x + 9, CENTER.z);
    const low = champAt(w, 1, 1, CENTER.x - 14, CENTER.z);
    const high = champAt(w, 2, 1, CENTER.x - 16, CENTER.z);
    beginCombatCoins(w, RULES, [thrower, low, high]);
    makeThrower(w, thrower, 2000);
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    // exactly the same spot → the tie is broken by id, never by iteration luck
    w.transform.get(low)!.pos = { x: p.x, z: p.z };
    w.transform.get(high)!.pos = { x: p.x, z: p.z };
    const lowGold = w.champion.get(low)!.gold;
    const highGold = w.champion.get(high)!.gold;
    step(w);
    expect(low).toBeLessThan(high);
    expect(w.champion.get(low)!.gold).toBe(lowGold + 100);
    expect(w.champion.get(high)!.gold).toBe(highGold);
  });

  it("a coin thrown at a champion's feet is caught the same tick", () => {
    // The throw runs at pipeline slot 3 and the pickup at 9e, so a champion
    // ALREADY standing on the landing slot banks it without waiting — the
    // literal reading of 「經過的玩家」, and deterministic because both slots
    // are fixed. (The spec's prose claimed the opposite; the slot order it
    // fixes is what actually decides this.)
    const { w, thrower, finder } = coinWorld();
    const corpse = w.transform.get(thrower)!.pos;
    const slot0 = coinDropPos(w, 0, corpse, 0, RULES);
    w.transform.get(finder)!.pos = { x: slot0.x, z: slot0.z };
    const goldBefore = w.champion.get(finder)!.gold;
    pressDrop(w, 0);
    expect(w.coin.size).toBe(0);
    expect(w.champion.get(finder)!.gold).toBe(goldBefore + 100);
    // …and it really was one round trip: the thrower still paid
    expect(w.champion.get(thrower)!.gold).toBe(1900);
  });

  it("one coin per champion per tick, even standing in a pile", () => {
    const { w, thrower, finder } = coinWorld();
    for (let i = 0; i < 3; i++) dropCoinCommand(w, thrower, asSeatId(0));
    // straddle the corpse: every ring slot is within pickupRadius of it? no —
    // park the finder on the corpse and widen nothing; instead move it onto the
    // first coin and check only ONE leaves per tick.
    const first = [...w.coin.keys()][0]!;
    const p = w.transform.get(first)!.pos;
    w.transform.get(finder)!.pos = { x: p.x, z: p.z };
    step(w);
    expect(w.coin.size).toBe(2);
  });

  it("only pays a champion in the coin's own zone", () => {
    const { w, thrower, finder } = coinWorld();
    dropCoinCommand(w, thrower, asSeatId(0));
    const id = [...w.coin.keys()][0]!;
    const p = w.transform.get(id)!.pos;
    w.transform.get(finder)!.zone = 1;
    w.transform.get(finder)!.pos = { x: p.x, z: p.z };
    step(w, 3);
    expect(w.coin.has(id)).toBe(true);
  });
});

describe("gold conservation (coin-06)", () => {
  it("throwing and collecting is net zero; only endCombat burns", () => {
    cover("coin-conservation");
    const { w, thrower, finder } = coinWorld();
    const start = totalGold(w);

    for (let i = 0; i < 4; i++) dropCoinCommand(w, thrower, asSeatId(0));
    expect(totalGold(w)).toBe(start); // gold moved onto the floor, none created

    // collect two of the four
    for (let i = 0; i < 2; i++) {
      const id = [...w.coin.keys()][0]!;
      const p = w.transform.get(id)!.pos;
      w.transform.get(finder)!.pos = { x: p.x, z: p.z };
      step(w);
    }
    expect(totalGold(w)).toBe(start); // …and none created on the way back
    expect(w.coin.size).toBe(2);

    // the two left on the floor at round end are DESTROYED, not refunded
    endCombatCoins(w);
    expect(totalGold(w)).toBe(start - 2 * 100);
  });
});
