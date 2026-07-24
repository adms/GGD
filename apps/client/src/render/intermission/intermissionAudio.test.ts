/**
 * intermissionAudio — the recess bell fires ONCE on entry, and the market
 * ambience loops through a lifecycle-owned re-arm timer that stops clean on
 * dispose (tasks #124, #38). Pure module: a fake SfxPort + injected timers, so
 * no WebGL scene and no real AudioContext.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// ---------------------------------------------------------------------------
// THE WIRE. Everything above proves the MODULE's contract against a fake port,
// which stays green even if nobody ever calls it. These two blocks guard the
// two joints that actually decide whether the owner hears a bell:
//
//   1. IntermissionStage's MOUNT effect calls playRecessBell(audioSystem)
//      — the emit is on the scene-entry edge, with the real mixer singleton;
//   2. `recessBell` is MAPPED in content/config/audio-map.json
//      — an unmapped key makes playSfx a silent no-op, which no unit test that
//        stubs the port can ever notice.
//
// The client vitest runs in a `node` environment with no DOM and no RTL, and
// `renderToStaticMarkup` never runs effects, so the mount effect cannot be
// executed here — the wire is asserted against the SOURCE, the same technique
// ui/chromeReserve.test.ts and architecture.test.ts use.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, "..", "..", "..", "..", "..");

/** Read a source file with comments stripped, so prose can never satisfy a scan. */
function readSource(abs: string): string {
  return readFileSync(abs, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("the recess bell is WIRED to intermission entry (intermission-recess-bell)", () => {
  const stage = readSource(join(__dirname, "..", "..", "ui", "IntermissionStage.tsx"));

  it("IntermissionStage imports the bell emit from this module", () => {
    cover("intermission-recess-bell");
    expect(stage).toMatch(/import\s*\{[^}]*\bplayRecessBell\b[^}]*\}\s*from\s*"[^"]*intermissionAudio"/);
  });

  it("rings it with the REAL mixer singleton, not a local stub", () => {
    cover("intermission-recess-bell");
    expect(stage).toContain("playRecessBell(audioSystem)");
  });

  it("the ring sits in the MOUNT effect (once per intermission, not per re-render)", () => {
    cover("intermission-recess-bell");
    // the scene-lifecycle effect is the one that closes on an EMPTY dep array;
    // slice it out and require the bell to be inside it.
    const start = stage.indexOf("useEffect(() => {");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = stage.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const mountEffect = stage.slice(start, end);
    expect(mountEffect).toContain("playRecessBell(audioSystem)");
  });
});

describe("the recess bell clip is actually MAPPED (intermission-recess-bell)", () => {
  const map = JSON.parse(readFileSync(join(REPO, "content", "config", "audio-map.json"), "utf8")) as {
    sfx?: Record<string, { files?: string[]; gain?: number; cooldownMs?: number; maxConcurrent?: number }>;
  };
  const entry = map.sfx?.[RECESS_BELL];

  it("audio-map.json has an sfx entry for the key this module emits", () => {
    cover("intermission-recess-bell");
    expect(entry, `audio-map.json has no sfx."${RECESS_BELL}" — the emit would be a silent no-op`).toBeTruthy();
    expect(entry?.files?.length).toBeGreaterThan(0);
  });

  it("every mapped file for it exists on disk", () => {
    cover("intermission-recess-bell");
    for (const rel of entry?.files ?? []) {
      expect(() => readFileSync(join(REPO, "content", rel)), `missing clip: ${rel}`).not.toThrow();
    }
  });

  it("is gated so a remount cannot double-ring it", () => {
    cover("intermission-recess-bell");
    // A fresh scene is built per intermission, and React StrictMode mounts twice
    // in dev. maxConcurrent 1 + a cooldown longer than a remount gap mean the
    // second ring is refused rather than layered on top of the first.
    expect(entry?.maxConcurrent).toBe(1);
    expect(entry?.cooldownMs ?? 0).toBeGreaterThanOrEqual(1000);
  });
});
