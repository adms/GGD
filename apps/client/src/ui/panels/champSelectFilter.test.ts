/**
 * client-champ-filter / client-champ-random: champ-select roster logic —
 * substring filtering (Chinese names included) and uniform-random pick that
 * routes through the normal SELECT_CHAMPION action seam.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { filterChampions, pickRandomId, type RosterChampion } from "./champSelectFilter";
import { hudActions, registerHudActions } from "../actions";

const ROSTER: RosterChampion[] = [
  { id: "sela", name: "Sela, the Ember Sage", role: "mage", tags: ["burst", "ranged"] },
  { id: "thorne", name: "Thorne, the Bramble Knight", role: "bruiser", tags: ["engage"] },
  { id: "godie-e002", name: "亞瑟王", role: "fighter", tags: ["melee"] },
  { id: "godie-e003", name: "亞瑟王的騎士", role: "fighter", tags: ["melee"] },
];

describe("champ-select filter (client-champ-filter)", () => {
  it("empty/whitespace query returns the whole roster", () => {
    cover("client-champ-filter");
    expect(filterChampions(ROSTER, "")).toHaveLength(4);
    expect(filterChampions(ROSTER, "   ")).toHaveLength(4);
  });

  it("matches ASCII names case-insensitively", () => {
    cover("client-champ-filter");
    const hits = filterChampions(ROSTER, "EMBER");
    expect(hits.map((c) => c.id)).toEqual(["sela"]);
  });

  it("matches CJK substrings (Chinese names)", () => {
    cover("client-champ-filter");
    // "亞瑟" is a substring of both 亞瑟王 and 亞瑟王的騎士
    expect(filterChampions(ROSTER, "亞瑟").map((c) => c.id)).toEqual(["godie-e002", "godie-e003"]);
    // the longer query narrows to the knight
    expect(filterChampions(ROSTER, "騎士").map((c) => c.id)).toEqual(["godie-e003"]);
  });

  it("also matches id / role / tags, and returns empty on no match", () => {
    cover("client-champ-filter");
    expect(filterChampions(ROSTER, "bruiser").map((c) => c.id)).toEqual(["thorne"]);
    expect(filterChampions(ROSTER, "engage").map((c) => c.id)).toEqual(["thorne"]);
    expect(filterChampions(ROSTER, "e002").map((c) => c.id)).toEqual(["godie-e002"]);
    expect(filterChampions(ROSTER, "zzz-nope")).toEqual([]);
  });
});

describe("champ-select random pick (client-champ-random)", () => {
  const ids = ROSTER.map((c) => c.id);

  it("picks a deterministic id for an injected rng", () => {
    cover("client-champ-random");
    expect(pickRandomId(ids, () => 0)).toBe("sela");
    expect(pickRandomId(ids, () => 0.5)).toBe("godie-e002"); // floor(0.5*4)=2
    expect(pickRandomId(ids, () => 0.999999)).toBe("godie-e003");
    expect(pickRandomId(ids, () => 1)).toBe("godie-e003"); // rng()===1 edge stays in range
    expect(pickRandomId([], () => 0)).toBeNull();
  });

  it("is uniform across the full id set over many draws", () => {
    cover("client-champ-random");
    const counts = new Map<string, number>(ids.map((id) => [id, 0]));
    let seed = 12345;
    const rng = (): number => {
      // deterministic LCG so the distribution assertion is stable
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const id = pickRandomId(ids, rng)!;
      counts.set(id, counts.get(id)! + 1);
    }
    const expected = N / ids.length;
    for (const id of ids) {
      expect(counts.get(id)!).toBeGreaterThan(expected * 0.9); // every id drawn ~uniformly
      expect(counts.get(id)!).toBeLessThan(expected * 1.1);
    }
  });

  it("routes the pick through the normal SELECT_CHAMPION action", () => {
    cover("client-champ-random");
    const sent: string[] = [];
    registerHudActions({ sendCommand: () => {}, selectChampion: (id) => sent.push(id), sendCheat: () => {}, focusWorld: () => {}, sendOrder: () => {}, setArenaRenderSuppressed: () => {}, localChampionModel: () => null });
    // exactly what the panel's 🎲 button does
    const id = pickRandomId(ids, () => 0.5);
    if (id) hudActions.selectChampion(id);
    registerHudActions(null);
    expect(sent).toEqual(["godie-e002"]);
    expect(ids).toContain(sent[0]);
  });
});
