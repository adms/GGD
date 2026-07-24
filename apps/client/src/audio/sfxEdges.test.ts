import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  crossedIntoLowHealth,
  diffTally,
  LOW_HEALTH_FRACTION,
  MULTIKILL_WINDOW_MS,
  type HealthSnapshot,
  type TallySnapshot,
} from "./sfxEdges";

const base: TallySnapshot = {
  seatId: 1,
  kills: 0,
  deaths: 0,
  level: 1,
  exRank: 0,
  allyDeaths: 0,
};

describe("diffTally", () => {
  it("fires kill on a first kill and records the timestamp", () => {
    cover("audio-tally-edges");
    const r = diffTally(base, { ...base, kills: 1 }, { nowMs: 1000, lastKillMs: null });
    expect(r.events).toEqual(["kill"]);
    expect(r.lastKillMs).toBe(1000);
    expect(r.rebaselined).toBe(false);
  });

  it("upgrades to multiKill when a second kill lands inside the window", () => {
    cover("audio-tally-multikill");
    const r = diffTally(
      { ...base, kills: 1 },
      { ...base, kills: 2 },
      { nowMs: 1000 + MULTIKILL_WINDOW_MS, lastKillMs: 1000 },
    );
    expect(r.events).toEqual(["multiKill"]);
    expect(r.lastKillMs).toBe(1000 + MULTIKILL_WINDOW_MS);
  });

  it("stays a plain kill when the second kill falls outside the window", () => {
    cover("audio-tally-multikill");
    const r = diffTally(
      { ...base, kills: 1 },
      { ...base, kills: 2 },
      { nowMs: 1000 + MULTIKILL_WINDOW_MS + 1, lastKillMs: 1000 },
    );
    expect(r.events).toEqual(["kill"]);
  });

  it("fires death on a local death", () => {
    cover("audio-tally-edges");
    expect(diffTally(base, { ...base, deaths: 1 }, { nowMs: 0, lastKillMs: null }).events).toEqual([
      "death",
    ]);
  });

  it("fires allySlain on a teammate death, distinct from a local death", () => {
    cover("audio-tally-edges");
    expect(
      diffTally(base, { ...base, allyDeaths: 1 }, { nowMs: 0, lastKillMs: null }).events,
    ).toEqual(["allySlain"]);
    expect(
      diffTally(base, { ...base, deaths: 1, allyDeaths: 1 }, { nowMs: 0, lastKillMs: null }).events,
    ).toEqual(["death", "allySlain"]);
  });

  it("fires levelUp on a real level gain but not on the 0→1 assignment bump", () => {
    cover("audio-tally-edges");
    expect(diffTally(base, { ...base, level: 2 }, { nowMs: 0, lastKillMs: null }).events).toEqual([
      "levelUp",
    ]);
    expect(
      diffTally({ ...base, level: 0 }, { ...base, level: 1 }, { nowMs: 0, lastKillMs: null }).events,
    ).toEqual([]);
  });

  it("fires exUnlock only on the 0→1 rank flip", () => {
    cover("audio-tally-edges");
    expect(diffTally(base, { ...base, exRank: 1 }, { nowMs: 0, lastKillMs: null }).events).toEqual([
      "exUnlock",
    ]);
    // already unlocked → no repeat
    expect(
      diffTally({ ...base, exRank: 1 }, { ...base, exRank: 2 }, { nowMs: 0, lastKillMs: null })
        .events,
    ).toEqual([]);
  });

  it("re-baselines silently when the seat changes (new match), firing nothing", () => {
    cover("audio-tally-rebaseline");
    const r = diffTally(
      { ...base, seatId: 1, kills: 5, deaths: 3, level: 9, exRank: 1, allyDeaths: 4 },
      { ...base, seatId: 2, kills: 0, deaths: 0, level: 1, exRank: 0, allyDeaths: 0 },
      { nowMs: 5000, lastKillMs: 4000 },
    );
    expect(r.events).toEqual([]);
    expect(r.rebaselined).toBe(true);
    expect(r.lastKillMs).toBeNull();
  });

  it("emits multiple events in one transition in a stable order", () => {
    cover("audio-tally-edges");
    const r = diffTally(
      base,
      { ...base, kills: 1, deaths: 1, level: 2, exRank: 1, allyDeaths: 1 },
      { nowMs: 100, lastKillMs: null },
    );
    expect(r.events).toEqual(["kill", "death", "allySlain", "levelUp", "exUnlock"]);
  });
});

describe("crossedIntoLowHealth", () => {
  const hp = (h: number, alive = true, maxHp = 100): HealthSnapshot => ({ hp: h, maxHp, alive });

  it("fires once on the downward crossing, then holds while below", () => {
    cover("audio-low-health-edge");
    // above → below the 30% line: fires
    expect(crossedIntoLowHealth(hp(50), hp(25))).toBe(true);
    // already below, dropping further: holds (cooldown/edge, not per-tick)
    expect(crossedIntoLowHealth(hp(25), hp(10))).toBe(false);
  });

  it("does not fire while HP stays above the danger line", () => {
    cover("audio-low-health-edge");
    expect(crossedIntoLowHealth(hp(90), hp(60))).toBe(false);
    // exactly at the threshold counts as in-danger
    expect(crossedIntoLowHealth(hp(90), hp(LOW_HEALTH_FRACTION * 100))).toBe(true);
  });

  it("re-arms after a respawn (dead / no champion → back alive and low)", () => {
    cover("audio-low-health-edge");
    expect(crossedIntoLowHealth(hp(0, false), hp(20))).toBe(true);
    expect(crossedIntoLowHealth({ hp: 0, maxHp: 0, alive: true }, hp(20))).toBe(true);
  });

  it("never fires on a dead, empty, or zero-HP next snapshot", () => {
    cover("audio-low-health-edge");
    expect(crossedIntoLowHealth(hp(50), hp(10, false))).toBe(false); // dead
    expect(crossedIntoLowHealth(hp(50), { hp: 0, maxHp: 0, alive: true })).toBe(false); // no champ
    expect(crossedIntoLowHealth(hp(50), hp(0))).toBe(false); // 0 HP (death handles it)
  });
});
