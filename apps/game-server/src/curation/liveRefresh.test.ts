/**
 * MID-MATCH SAFETY for the live content bus (config/contentBus.ts).
 *
 * THE SEMANTICS UNDER TEST, stated once:
 *
 *   A content change applies to matches created AFTER it lands. It never
 *   applies to a match that already exists — not to its combat, not to its
 *   shop, and not to its champ-select. The boundary is MATCH CREATION.
 *
 * Why that is the safe answer rather than the convenient one: a shrink landing
 * mid-select would let a champion vanish under a hovering cursor, or let the
 * server reject a SELECT_CHAMPION for a champion it offered the player five
 * seconds earlier. A shrink landing mid-combat would mean retroactively
 * disallowing a champion somebody is currently playing. Neither has a good UI,
 * and neither is what "I turned that champion off" means to an operator: he
 * means new games.
 *
 * These tests pin the boundary from BOTH sides — the running match must not
 * move, and the next one must.
 */
import { describe, it, expect } from "vitest";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { asSeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { Whitelist, WhitelistCache, type WhitelistDoc } from "./whitelist";

const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };

const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: i !== 0 }));

const doc = (champions: string[]): WhitelistDoc => ({
  version: 1,
  champions,
  items: ["ember-rod", "ironhide-vest"],
  abilities: [],
});

/** A stub `fetch` whose served whitelist the test flips between calls. */
function stubFetch(initial: WhitelistDoc) {
  const state = { body: initial, calls: 0 };
  const impl = (async () => {
    state.calls += 1;
    return { ok: true, status: 200, json: async () => state.body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { state, impl };
}

/** Build a match the way MatchRoom.onCreate does: snapshot the cache value. */
async function newMatchFrom(cache: WhitelistCache, id: string): Promise<MatchController> {
  registerSkeletonContent();
  const wl = await cache.get();
  return new MatchController(id, 1234, seats(), FAST, 3, DEFAULT_ARENA_RULES, undefined, wl);
}

describe("a live whitelist change must not corrupt a match in progress", () => {
  it("a SHRUNK whitelist does not retroactively yank a champion from a RUNNING match", async () => {
    const { state, impl } = stubFetch(doc(["sela", "thorne"]));
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });

    const running = await newMatchFrom(cache, "m-running");
    expect(running.whitelist.allowsChampion("thorne")).toBe(true);
    const seat = asSeatId(0);
    expect(running.selectChampion(seat, "thorne")).toEqual({ ok: true });

    // The operator disables 'thorne' in the 後台 console; the bus delivers the
    // invalidation and the shard re-fetches. This is the exact moment the
    // running match must not notice.
    state.body = doc(["sela"]);
    const refreshed = await cache.refresh();
    expect(refreshed.ok).toBe(true);
    expect(refreshed.whitelist.allowsChampion("thorne")).toBe(false);

    // The running match holds its own immutable snapshot.
    expect(running.whitelist.allowsChampion("thorne")).toBe(true);
    expect(running.whitelist.snapshotChampions().sort()).toEqual(["sela", "thorne"]);
    // ...and the player who already locked it keeps playing it.
    expect(running.seats.get(seat)?.championId).toBe("thorne");
  });

  it("an IN-FLIGHT champ-select still accepts the champion it was offering", async () => {
    // The nastiest variant: the shrink lands while a human is mid-pick. The
    // room resolved its whitelist at onCreate, so champ-select — which happens
    // inside the room — uses that same frozen snapshot and stays coherent.
    const { state, impl } = stubFetch(doc(["sela", "thorne"]));
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });
    const running = await newMatchFrom(cache, "m-selecting");
    expect(running.phase.phase).toBe("champSelect");

    state.body = doc(["sela"]);
    await cache.refresh();

    // Still in champ-select, and the offer the client is looking at is honoured.
    expect(running.phase.phase).toBe("champSelect");
    expect(running.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: true });
  });

  it("the sim's item-eligibility predicate is frozen for the running match too", async () => {
    // The whitelist is a first-class SIM input (world.itemEligible is consulted
    // before an rng roll), so a mid-match change would shift the random stream
    // and desync replay. Freezing it is a determinism requirement, not only a
    // UX one.
    const { state, impl } = stubFetch(doc(["sela", "thorne"]));
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });
    const running = await newMatchFrom(cache, "m-items");
    expect(running.whitelist.allowsItem("ember-rod")).toBe(true);

    state.body = { ...doc(["sela"]), items: [] };
    await cache.refresh();

    expect(running.whitelist.allowsItem("ember-rod")).toBe(true);
    expect(running.world.itemEligible?.("ember-rod" as never)).toBe(true);
  });

  it("the NEXT match created DOES get the new whitelist — that is the whole point", async () => {
    const { state, impl } = stubFetch(doc(["sela", "thorne"]));
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });

    const first = await newMatchFrom(cache, "m-before");
    expect(first.whitelist.allowsChampion("thorne")).toBe(true);

    state.body = doc(["sela"]);
    await cache.refresh();

    // No restart, no TTL wait: the very next creation sees the change.
    const next = await newMatchFrom(cache, "m-after");
    expect(next.whitelist.allowsChampion("thorne")).toBe(false);
    expect(next.selectChampion(asSeatId(0), "thorne")).toEqual({
      ok: false,
      reason: "not-whitelisted",
    });
    // And it did not need another network round-trip: refresh() populated the
    // cache, so onCreate is not paying for the operator's edit.
    expect(state.calls).toBe(2);
  });

  it("a Whitelist snapshot is IMMUTABLE, so nothing can mutate one in place", async () => {
    // The structural guarantee the tests above depend on. If Whitelist ever
    // grew a mutator, every "running match is unaffected" claim would silently
    // become false — so assert the shape, not just the behaviour.
    const wl = new Whitelist(doc(["sela"]), false);
    const before = wl.snapshotChampions();
    // The snapshot is a COPY: mutating it must not touch the whitelist.
    before.push("thorne");
    expect(wl.allowsChampion("thorne")).toBe(false);
    expect(wl.snapshotChampions()).toEqual(["sela"]);
    // No public mutator exists.
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(wl))) {
      expect(key).not.toMatch(/^(set|add|remove|enable|disable|update)/);
    }
  });
});
