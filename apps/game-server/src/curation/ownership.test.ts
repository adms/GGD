/**
 * Per-account OWNERSHIP enforcement (own-01..own-06) — the game-server is the
 * AUTHORITY that stops a player selecting a champion the account has not
 * unlocked, whether MANUAL or RANDOM. This is task #201's load-bearing surface:
 * the client roster filter is bypassable, so a forged SELECT_CHAMPION for an
 * unowned champion must be rejected here. Covered:
 *   - the Ownership value object: owns / filterOwned / allow-all / fromSeats (own-01)
 *   - SELECT_CHAMPION rejects an UNOWNED champion with reason 'not-owned',
 *     EVEN WHEN it is whitelisted (own-02)
 *   - an owned champion is accepted; a bot/dev seat we know nothing about is
 *     unenforced (fail-open) so #130's floor is never a dead seat (own-03)
 *   - the RANDOM/auto pick can never land on an unowned champion (own-04)
 *   - a seat that owns nothing playable falls back to the whitelisted pool so
 *     the match still runs — the #130 floor (own-05)
 *   - ownership is INDEPENDENT of the whitelist: a non-whitelisted-but-owned
 *     champion is still rejected by the whitelist gate (own-06)
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { Whitelist, type WhitelistDoc } from "./whitelist";
import { Ownership } from "./ownership";

const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };

const doc = (over: Partial<WhitelistDoc>): WhitelistDoc => ({
  version: 1,
  champions: [],
  items: [],
  abilities: [],
  ...over,
});

/** Seat 0 is a human with the given accountId; seats 1..11 are bots. */
function humanSeat0(accountId: string): SeatSpec[] {
  return Array.from({ length: 12 }, (_, i) =>
    i === 0
      ? { seatId: 0, teamId: 0, accountId, isBot: false }
      : { seatId: i, teamId: Math.floor(i / 3), isBot: true },
  );
}

function newController(wl: Whitelist, own: Ownership, specs: SeatSpec[]): MatchController {
  registerSkeletonContent();
  // positional: matchId, seed, specs, phaseCfg, startingTeamHealth, rules,
  // arena, whitelist, combatEnv, fireRing, arenaPool, ownership
  return new MatchController(
    "m-own",
    1234,
    specs,
    FAST,
    3,
    DEFAULT_ARENA_RULES,
    undefined,
    wl,
    undefined,
    undefined,
    undefined,
    own,
  );
}

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
}

// ---------------------------------------------------------------------------

describe("Ownership value object (own-01)", () => {
  it("enforces a known account's set and fails OPEN for an unknown one", () => {
    cover("own-value-object");
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela"] }]);

    // A known account owns exactly its set.
    expect(own.enforces("acc-1")).toBe(true);
    expect(own.owns("acc-1", "sela")).toBe(true);
    expect(own.owns("acc-1", "thorne")).toBe(false);
    expect(own.filterOwned("acc-1", ["sela", "thorne"])).toEqual(["sela"]);

    // An account we were never told about is UNENFORCED — owns everything.
    expect(own.enforces("bot-2")).toBe(false);
    expect(own.owns("bot-2", "thorne")).toBe(true);
    expect(own.filterOwned("bot-2", ["sela", "thorne"])).toEqual(["sela", "thorne"]);
    // undefined accountId (a seat with no identity) is also unenforced.
    expect(own.owns(undefined, "thorne")).toBe(true);

    // allow-all: nothing enrolled, everything owned.
    const all = Ownership.allowAll();
    expect(all.enforces("acc-1")).toBe(false);
    expect(all.owns("acc-1", "thorne")).toBe(true);
    expect(all.filterOwned("acc-1", ["a", "b"])).toEqual(["a", "b"]);

    // A seat with NO owned array is not enrolled; an EMPTY array IS enrolled.
    const mixed = Ownership.fromSeats([{ accountId: "no-list" }, { accountId: "empty", owned: [] }]);
    expect(mixed.enforces("no-list")).toBe(false);
    expect(mixed.owns("no-list", "sela")).toBe(true);
    expect(mixed.enforces("empty")).toBe(true);
    expect(mixed.owns("empty", "sela")).toBe(false);
  });
});

describe("SELECT_CHAMPION ownership rejection (own-02, own-03, own-06)", () => {
  it("rejects an UNOWNED but whitelisted champion with reason 'not-owned'", () => {
    cover("own-select-reject");
    // Both champions are AVAILABLE (whitelisted); the account owns only sela.
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    const seat = asSeatId(0);

    expect(ctl.selectChampion(seat, "sela")).toEqual({ ok: true });
    // thorne is on the whitelist but NOT owned → rejected, independently.
    expect(ctl.selectChampion(seat, "thorne")).toEqual({ ok: false, reason: "not-owned" });
  });

  it("the whitelist gate still fires first: a non-whitelisted champion is 'not-whitelisted' even if owned", () => {
    cover("own-independent-of-whitelist");
    // Only sela is available; the account 'owns' thorne but thorne is not in this build.
    const wl = new Whitelist(doc({ champions: ["sela"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela", "thorne"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    const seat = asSeatId(0);
    expect(ctl.selectChampion(seat, "thorne")).toEqual({ ok: false, reason: "not-whitelisted" });
    expect(ctl.selectChampion(seat, "sela")).toEqual({ ok: true });
  });

  it("a bot / dev seat with unknown ownership is unenforced (fail-open, protects #130)", () => {
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    // seat 3 is a bot (accountId bot-3, not enrolled) → owns everything.
    expect(ctl.selectChampion(asSeatId(3), "thorne")).toEqual({ ok: true });
  });

  it("allow-all ownership accepts any whitelisted champion (default / replay / dev)", () => {
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const ctl = newController(wl, Ownership.allowAll(), humanSeat0("acc-1"));
    expect(ctl.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: true });
  });
});

describe("random / auto pick never lands on an unowned champion (own-04, own-05)", () => {
  it("an unpicked human seat is auto-assigned only from what the account OWNS", () => {
    cover("own-auto-pick");
    // Both available; account owns only sela. Seat 0 never picks → auto-assign.
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    tickUntil(ctl, "intermission"); // triggers autoPickAndSpawn

    const seat0 = ctl.seats.get(asSeatId(0))!;
    expect(seat0.championId).toBe("sela"); // NEVER the unowned thorne
    expect(seat0.entityId).not.toBeNull();
  });

  it("a carried pick the account does not own is RE-ROLLED into an owned one at lock-in", () => {
    cover("own-reroll-carried");
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["sela"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    // Force an unowned champion directly onto the seat (simulating a stale /
    // forged pick that bypassed selectChampion). autoPick must re-roll it.
    ctl.seats.get(asSeatId(0))!.championId = "thorne";
    tickUntil(ctl, "intermission");
    const seat0 = ctl.seats.get(asSeatId(0))!;
    expect(seat0.championId).toBe("sela");
    expect(seat0.entityId).not.toBeNull();
  });

  it("#130 floor: a seat that owns nothing playable still spawns from the whitelisted pool", () => {
    cover("own-130-floor");
    // The account 'owns' only a champion that does not exist in this build, so
    // owned ∩ pool is EMPTY. The match must still run: fall back to the pool.
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);
    const own = Ownership.fromSeats([{ accountId: "acc-1", owned: ["ghost-that-is-not-loaded"] }]);
    const ctl = newController(wl, own, humanSeat0("acc-1"));
    tickUntil(ctl, "intermission");
    const seat0 = ctl.seats.get(asSeatId(0))!;
    expect(["sela", "thorne"]).toContain(seat0.championId);
    expect(seat0.entityId).not.toBeNull();
  });
});
