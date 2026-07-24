/**
 * intermissionAudio — the recess bell fires ONCE on entry, and the market
 * ambience loops through a lifecycle-owned re-arm timer that stops clean on
 * dispose (tasks #124, #38). Pure module: a fake SfxPort + injected timers, so
 * no WebGL scene and no real AudioContext.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  playRecessBell,
  startMarketAmbience,
  RECESS_BELL,
  MARKET_AMBIENCE,
  type AmbienceTimers,
} from "./intermissionAudio";

/** Records every playSfx event; `available` decides what the mixer returns. */
function fakeAudio(available = true): { events: string[]; playSfx: (e: string) => boolean } {
  const events: string[] = [];
  return {
    events,
    playSfx(event: string): boolean {
      events.push(event);
      return available;
    },
  };
}

/** A hand-pumped interval seam so the test drives re-arm ticks deterministically. */
function fakeTimers(): AmbienceTimers & { tick(): void; active: boolean } {
  let fn: (() => void) | null = null;
  return {
    active: false,
    setInterval(cb: () => void): unknown {
      fn = cb;
      this.active = true;
      return 1;
    },
    clearInterval(): void {
      fn = null;
      this.active = false;
    },
    tick(): void {
      fn?.();
    },
  };
}

describe("intermissionAudio", () => {
  it("rings the recess bell exactly once on entry", () => {
    cover("intermission-recess-bell");
    const audio = fakeAudio();
    const ok = playRecessBell(audio);
    expect(ok).toBe(true);
    expect(audio.events).toEqual([RECESS_BELL]);
  });

  it("the bell emit is a silent no-op (never throws) when the clip is unmapped", () => {
    cover("intermission-recess-bell");
    const audio = fakeAudio(false); // map has no recessBell yet
    expect(() => playRecessBell(audio)).not.toThrow();
    expect(playRecessBell(audio)).toBe(false);
    expect(audio.events).toEqual([RECESS_BELL, RECESS_BELL]);
  });

  it("starts the market ambience immediately and re-arms it on the loop timer", () => {
    cover("intermission-market-ambience");
    const audio = fakeAudio();
    const timers = fakeTimers();
    const amb = startMarketAmbience(audio, { timers });
    // fired once up front, and the re-arm timer is running
    expect(audio.events).toEqual([MARKET_AMBIENCE]);
    expect(timers.active).toBe(true);
    // each timer tick re-arms the bed (the concurrency gate makes it a no-op
    // while sounding; here the fake mixer just records the attempt)
    timers.tick();
    timers.tick();
    expect(audio.events).toEqual([MARKET_AMBIENCE, MARKET_AMBIENCE, MARKET_AMBIENCE]);
    amb.stop();
  });

  it("stop() clears the timer so nothing re-arms after dispose (no leak)", () => {
    cover("intermission-market-ambience");
    const audio = fakeAudio();
    const timers = fakeTimers();
    const amb = startMarketAmbience(audio, { timers });
    amb.stop();
    expect(timers.active).toBe(false);
    timers.tick(); // a stray tick after stop must do nothing
    expect(audio.events).toEqual([MARKET_AMBIENCE]); // only the initial kick
    // idempotent: a second stop is safe
    expect(() => amb.stop()).not.toThrow();
  });

  it("uses the real global timers by default (smoke: starts and stops without throwing)", () => {
    cover("intermission-market-ambience");
    vi.useFakeTimers();
    try {
      const audio = fakeAudio();
      const amb = startMarketAmbience(audio, { rearmMs: 10 });
      vi.advanceTimersByTime(25); // two re-arms
      expect(audio.events.length).toBe(3);
      amb.stop();
      vi.advanceTimersByTime(50); // nothing more after stop
      expect(audio.events.length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
