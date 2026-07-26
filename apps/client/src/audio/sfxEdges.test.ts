import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { MULTIKILL_WINDOW_TICKS } from "@ggd/shared/sim/stats/matchStats";
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

describe("the multikill window is the SIM's, not a second opinion (#234)", () => {
  it("derives MULTIKILL_WINDOW_MS from matchStats.MULTIKILL_WINDOW_TICKS", () => {
    cover("audio-tally-edges");
    // The sim's `recordChampionDeath` chains a killer's streak on this window —
    // the same streak that credits `stats.multikills` on the settlement board.
    // The voice ladder (一殺/二殺…) and the crowd cheer read the CLIENT streak,
    // so if these two numbers part company the hero says 「一殺」 for a kill the
    // scoreboard just counted as a multikill. Pinned, not assumed: this fails if
    // either side is retuned without the other.
    expect(MULTIKILL_WINDOW_MS).toBe((MULTIKILL_WINDOW_TICKS / TICK_HZ) * 1_000);
    expect(MULTIKILL_WINDOW_MS).toBe(10_000);
  });

  it("chains a kill that lands in the 8–10 s band the old 8 s constant dropped", () => {
    cover("audio-tally-edges");
    // 9 s after the previous kill: the sim counts a multikill here. Before the
    // derivation the client restarted the ladder at 一殺 and the crowd
    // de-escalated with it. Now both say 二殺.
    const r = diffTally(
      { ...base, kills: 1 },
      { ...base, kills: 2 },
      { nowMs: 9_000, lastKillMs: 0, killStreak: 1, everKilled: true },
    );
    expect(r.events).toEqual(["multiKill"]);
    expect(r.killStreak).toBe(2);
    expect(r.killVoice).toBe("kill-2");
  });
});

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

/**
 * The CONTEXTUAL-VOICE half of a kill (#234): the same diff also names WHICH of
 * the local champion's own lines to speak — 首殺 / 一殺..五殺 / 無人能敵 — and
 * AudioDirector hands that category straight to `playContextualVoice`. Untested
 * until this task, so the escalation is pinned here rather than assumed.
 */
describe("diffTally.killVoice — the escalating kill line", () => {
  /** Carry the streak/latch forward exactly the way AudioDirector's refs do. */
  function spree(kills: Array<{ atMs: number }>): Array<string | null> {
    let prev = { ...base };
    let lastKillMs: number | null = null;
    let killStreak = 0;
    let everKilled = false;
    const out: Array<string | null> = [];
    for (const [i, k] of kills.entries()) {
      const next = { ...base, kills: i + 1 };
      const r = diffTally(prev, next, { nowMs: k.atMs, lastKillMs, killStreak, everKilled });
      prev = next;
      lastKillMs = r.lastKillMs;
      killStreak = r.killStreak;
      everKilled = r.everKilled;
      out.push(r.killVoice);
    }
    return out;
  }

  it("says first-blood once, then escalates 二殺/三殺… inside the window", () => {
    cover("audio-tally-kill-voice");
    expect(
      spree([{ atMs: 0 }, { atMs: 1_000 }, { atMs: 2_000 }, { atMs: 3_000 }, { atMs: 4_000 }]),
    ).toEqual(["first-blood", "kill-2", "kill-3", "kill-4", "kill-5"]);
  });

  it("goes unstoppable past five consecutive kills", () => {
    cover("audio-tally-kill-voice");
    const kills = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ atMs: i * 1_000 }));
    const voices = spree(kills);
    expect(voices[5]).toBe("unstoppable"); // the sixth kill of the spree
    expect(voices[6]).toBe("unstoppable"); // and it stays there
  });

  it("restarts the count at 一殺 when the spree goes stale", () => {
    cover("audio-tally-kill-voice");
    // first blood, then a kill well OUTSIDE the multi-kill window
    expect(spree([{ atMs: 0 }, { atMs: MULTIKILL_WINDOW_MS + 1 }])).toEqual([
      "first-blood",
      "kill-1",
    ]);
  });

  it("says nothing when no kill landed, and nothing on a seat change", () => {
    cover("audio-tally-kill-voice");
    expect(diffTally(base, { ...base, deaths: 1 }, { nowMs: 0, lastKillMs: null }).killVoice).toBeNull();
    const rebaselined = diffTally(
      { ...base, seatId: 1, kills: 5 },
      { ...base, seatId: 2, kills: 0 },
      { nowMs: 100, lastKillMs: 50, killStreak: 4, everKilled: true },
    );
    expect(rebaselined.killVoice).toBeNull();
    // a new match re-arms first blood rather than leaking the old latch
    expect(rebaselined.everKilled).toBe(false);
    expect(rebaselined.killStreak).toBe(0);
  });

  it("only ever names categories the generated voice packs actually carry", () => {
    cover("audio-tally-kill-voice");
    // A category the pack has no folder for would fall through silently, which
    // is safe but mute — so keep the emitted names pinned to the real roster
    // (content/assets/audio/voices/lines/CATEGORIES.json orders 35-41).
    const REAL = new Set([
      "first-blood",
      "kill-1",
      "kill-2",
      "kill-3",
      "kill-4",
      "kill-5",
      "unstoppable",
    ]);
    const kills = Array.from({ length: 9 }, (_, i) => ({ atMs: i * 1_000 }));
    for (const v of spree(kills)) expect(REAL.has(v!)).toBe(true);
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
