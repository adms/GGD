/**
 * intermissionAudio — the market ambience loops through a lifecycle-owned
 * re-arm timer that stops clean on dispose (task #38), and NOTHING rings a bell
 * on scene entry any more (task #190). Pure module: a fake SfxPort + injected
 * timers, so no WebGL scene and no real AudioContext.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { startMarketAmbience, MARKET_AMBIENCE, type AmbienceTimers } from "./intermissionAudio";

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

  it("stop() CUTS the sounding clip, not just the re-arm (task #216, mirror image)", () => {
    cover("intermission-market-ambience");
    // #216 is the fire-ring bed leaking INTO the shop; this is the same class of
    // bug pointing the other way. The murmur is a ~50 s clip, so one fired two
    // seconds before the shop closes plays on under the next round's combat
    // unless the voice itself is stopped. Clearing the interval only stops the
    // NEXT re-arm.
    const stopped: string[] = [];
    const audio = {
      events: [] as string[],
      playSfx(event: string): boolean {
        this.events.push(event);
        return true;
      },
      stopSfx(event: string): number {
        stopped.push(event);
        return 1;
      },
    };
    const timers = fakeTimers();
    const amb = startMarketAmbience(audio, { timers });
    expect(stopped).toEqual([]);
    amb.stop();
    expect(stopped).toEqual([MARKET_AMBIENCE]);
    expect(timers.active).toBe(false);
  });

  it("tolerates an SfxPort with no stop path at all (optional seam)", () => {
    cover("intermission-market-ambience");
    // `stopSfx` is optional so a test double — or an older mixer — may omit it.
    const amb = startMarketAmbience(fakeAudio(), { timers: fakeTimers() });
    expect(() => amb.stop()).not.toThrow();
  });
});


// ---------------------------------------------------------------------------
// THE WIRE — now an ANTI-wire (task #190).
//
// This block used to prove the recess bell WAS rung on intermission entry. The
// owner's verdict reversed it: 「商店音樂播放 BGM 就好，不要變成鐘聲」. So the same
// three joints are asserted in the negative, because a removal that nothing
// guards is a removal that comes back:
//
//   1. IntermissionStage must not import or call any bell emit;
//   2. this module must not export one;
//   3. `recessBell` must be filed as UNREACHABLE in audio/sfxReachability, so
//      the 版權聲明 page stops claiming the clip is 使用中 while still crediting
//      it (the 効果音ラボ authorisation is per-clip and survives the removal).
//
// The client vitest runs in a `node` environment with no DOM and no RTL, and
// `renderToStaticMarkup` never runs effects, so a mount effect cannot be
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

describe("the intermission rings NO bell (intermission-no-recess-bell)", () => {
  const stage = readSource(join(__dirname, "..", "..", "ui", "IntermissionStage.tsx"));
  const self = readSource(join(__dirname, "intermissionAudio.ts"));

  it("IntermissionStage neither imports nor calls a bell emit", () => {
    cover("intermission-no-recess-bell");
    expect(stage).not.toMatch(/\bplayRecessBell\b/);
    expect(stage).not.toMatch(/\brecessBell\b/);
  });

  it("this module exports no bell emit for anyone else to call either", () => {
    cover("intermission-no-recess-bell");
    expect(self).not.toMatch(/\bplayRecessBell\b/);
    expect(self).not.toMatch(/\bRECESS_BELL\b/);
    expect(self).not.toMatch(/"recessBell"/);
  });

  it("the market ambience — the one cue that SHOULD play — is still wired", () => {
    cover("intermission-market-ambience");
    // The negative assertions above would all pass on an empty file, so the
    // positive half is stated in the same block.
    expect(stage).toMatch(/import\s*\{[^}]*\bstartMarketAmbience\b[^}]*\}\s*from\s*"[^"]*intermissionAudio"/);
    expect(stage).toContain("startMarketAmbience(audioSystem)");
  });
});

describe("the bell clip still ships and stays credited (intermission-no-recess-bell)", () => {
  const map = JSON.parse(readFileSync(join(REPO, "content", "config", "audio-map.json"), "utf8")) as {
    sfx?: Record<string, { files?: string[] }>;
  };

  it("has NO audio-map entry — a mapped key nothing plays is the alarm state", () => {
    cover("intermission-no-recess-bell");
    // sfxLabCredits' "no clip is mapped but silent" test says in so many words:
    // wire the cue or drop the map entry, never relax the rule. The emit is
    // gone, so the entry goes too — and sfxReachability, whose row set must
    // equal the map's key set, must not carry a row for it either.
    expect(map.sfx?.recessBell).toBeUndefined();
    const reach = readSource(join(__dirname, "..", "..", "audio", "sfxReachability.ts"));
    expect(reach).not.toContain('key: "recessBell"');
  });

  it("keeps the FILE on disk and the credit line, because the licence is per-clip", () => {
    cover("intermission-no-recess-bell");
    // The 効果音ラボ authorisation's one condition is that every shipped clip is
    // listed on the 版權聲明 page. Un-wiring a cue must never quietly drop that
    // listing — it flips to 備而未用, exactly like block-clash / impact-heavy.
    expect(() => readFileSync(join(REPO, "content/assets/audio/sfx/lab/recessBell.mp3"))).not.toThrow();
    const credits = readFileSync(join(__dirname, "..", "..", "ui", "platform", "sfxLabCredits.ts"), "utf8");
    const row = credits.split("\n").find((l) => l.includes("sfx/lab/recessBell.mp3"));
    expect(row, "recessBell lost its credits row").toBeTruthy();
    expect(row).toContain("mapKeys: []");
    expect(row).toContain("備而未用");
  });

  it("is no longer warmed with the intermission scene", () => {
    cover("intermission-no-recess-bell");
    const manifest = readSource(join(__dirname, "..", "..", "audio", "sfxManifest.ts"));
    expect(manifest).not.toContain('"recessBell"');
  });
});
