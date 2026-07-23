import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { loadRoster, runMatchDuels, pickChampions, CONTENT_DIR } from "./harness";
import { mean } from "./stats";

let roster: string[];

beforeAll(async () => {
  roster = await loadRoster(CONTENT_DIR);
}, 60_000);

describe("ttk harness", () => {
  it("loads a real, model-backed champion roster", () => {
    expect(roster.length).toBeGreaterThan(40);
    expect(roster.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
  });

  it("champion selection is deterministic and independent of maxHealth", () => {
    const a = pickChampions(roster, 123);
    const b = pickChampions(roster, 123);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    // 12 distinct champions -> a real matchup, not mirror clones
    expect(new Set(a).size).toBe(12);
  });

  it("runs a real bot match to combat and measures per-duel elimination", () => {
    cover("ttk-harness-measures");
    const samples = runMatchDuels({ maxHealth: 8, matchSeed: 0x9153, fireRing: false, capSec: 240, roster });
    expect(samples.length).toBeGreaterThanOrEqual(1);
    for (const s of samples) {
      expect(s.ttkSec).toBeGreaterThan(0);
      expect(s.ttkSec).toBeLessThanOrEqual(240);
      expect(s.champsA).toHaveLength(3);
      expect(s.champsB).toHaveLength(3);
    }
    // at least one duel should decide by elimination within the cap
    expect(samples.some((s) => s.decisive)).toBe(true);
  });

  it("is deterministic: identical inputs -> identical TTK", () => {
    cover("ttk-deterministic");
    const opts = { maxHealth: 10, matchSeed: 777, fireRing: false, capSec: 240, roster } as const;
    const a = runMatchDuels({ ...opts });
    const b = runMatchDuels({ ...opts });
    expect(a.map((s) => s.ttkSec)).toEqual(b.map((s) => s.ttkSec));
  });

  it("TTK scales up with maxHealth (fixed damage -> more HP = longer fight)", () => {
    cover("ttk-scales-with-hp");
    const seeds = [0x9153, 0x9154, 0x9155, 0x9156];
    const decisiveMean = (hp: number): number => {
      const dec: number[] = [];
      for (const seed of seeds) {
        for (const s of runMatchDuels({ maxHealth: hp, matchSeed: seed, fireRing: false, capSec: 600, roster })) {
          if (s.decisive) dec.push(s.ttkSec);
        }
      }
      return mean(dec);
    };
    const low = decisiveMean(4);
    const high = decisiveMean(16);
    expect(high).toBeGreaterThan(low * 1.8); // ~linear: 4x the HP window -> markedly longer
  }, 60_000);
});
