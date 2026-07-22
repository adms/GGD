/**
 * The login rotation STATE MACHINE (task #88). The two ways this feature fails
 * are both silent in a browser and both deterministic headlessly, so they get
 * named tests:
 *
 *   1. "THE SECOND TRACK NEVER PLAYS" — the rotation is armed off a bed that
 *      never starts (autoplay lock), or off mount instead of the bed, so the
 *      player sits on the epic theme forever and the nocturne is dead content.
 *   2. "BOTH TRACKS PLAY AT ONCE" — the machine re-arms against a stale anchor,
 *      computes ~0 ms remaining and flips every tick, asking the mixer for a new
 *      bed faster than it can crossfade.
 *
 * The first block drives the pure machine directly. The second drives a REAL
 * AudioSystem over a fake WebAudio graph through several whole segments and
 * asserts on the actual sources: the nocturne really becomes the bed, and there
 * is never more than one bed playing.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  LOGIN_ROTATION_INITIAL,
  LOGIN_ROTATION_POLL_MS,
  LOGIN_SEGMENT_MS,
  stepLoginRotation,
  type LoginRotationState,
} from "./loginRotation";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import type { AudioMap } from "./types";

// ---------------------------------------------------------------------------
// the pure machine
// ---------------------------------------------------------------------------

/** Run the machine like the hook does: step, wait `waitMs`, step again. */
function drive(
  ms: number,
  bedAt: (nowMs: number) => number | null,
  start: LoginRotationState = LOGIN_ROTATION_INITIAL,
): { themes: string[]; steps: number; state: LoginRotationState } {
  let state = start;
  let now = 0;
  const themes: string[] = [];
  let steps = 0;
  while (now <= ms && steps < 100_000) {
    const { step, next } = stepLoginRotation(state, { bedStartedAtMs: bedAt(now), nowMs: now });
    state = next;
    steps++;
    if (themes[themes.length - 1] !== step.theme) themes.push(step.theme);
    now += step.waitMs;
  }
  return { themes, steps, state };
}

describe("login rotation state machine", () => {
  it("FAILURE 1 — the second track must actually play", () => {
    cover("login-rotation-second-track");
    // a bed that starts at t=0 and loops forever (the mixer re-anchors on each
    // swap, which is what bedStartedAtMs reports)
    let bedStart = 0;
    const r = drive(LOGIN_SEGMENT_MS * 4 + 1000, (now) => {
      // the mixer swaps the bed ~immediately after the machine asks for it
      if (now >= bedStart + LOGIN_SEGMENT_MS) bedStart = now;
      return bedStart;
    });
    expect(r.themes).toEqual(["menu", "menuNocturne", "menu", "menuNocturne", "menu"]);
  });

  it("FAILURE 1 — a bed that never starts holds theme 0 and keeps polling", () => {
    // autoplay never unlocked: bedStartedAtMs stays null forever
    const r = drive(LOGIN_SEGMENT_MS * 3, () => null);
    expect(r.themes).toEqual(["menu"]); // never advances past the first theme
    // ...but it also never gives up: it is still polling at the poll interval
    const { step } = stepLoginRotation(r.state, { bedStartedAtMs: null, nowMs: 1e6 });
    expect(step.armed).toBe(false);
    expect(step.waitMs).toBe(LOGIN_ROTATION_POLL_MS);
    // and the moment a bed DOES appear it arms a full segment
    const armed = stepLoginRotation(r.state, { bedStartedAtMs: 1e6, nowMs: 1e6 });
    expect(armed.step.armed).toBe(true);
    expect(armed.step.waitMs).toBe(LOGIN_SEGMENT_MS);
  });

  it("FAILURE 2 — a stale anchor must not flip the theme every tick", () => {
    cover("login-rotation-no-runaway");
    // The pathological case: the segment expires but the bed has NOT been
    // replaced (React has not re-rendered / the buffer is still decoding), so
    // bedStartedAtMs still reports the OLD anchor for a while.
    const STUCK_MS = 5_000;
    let bedStart = 0;
    let swapAt: number | null = null;
    const r = drive(LOGIN_SEGMENT_MS * 3, (now) => {
      if (swapAt === null && now >= bedStart + LOGIN_SEGMENT_MS) swapAt = now + STUCK_MS;
      if (swapAt !== null && now >= swapAt) {
        bedStart = now;
        swapAt = null;
      }
      return bedStart;
    });
    // exactly one advance per segment — NOT one per poll
    expect(r.themes).toEqual(["menu", "menuNocturne", "menu"]);
    // and while stuck it polled rather than re-armed: bounded step count
    expect(r.steps).toBeLessThan(3 + (3 * STUCK_MS) / LOGIN_ROTATION_POLL_MS + 10);
  });

  it("FAILURE 2 — re-arming needs a DIFFERENT anchor, never the same one", () => {
    const armed = stepLoginRotation(LOGIN_ROTATION_INITIAL, {
      bedStartedAtMs: 1000,
      nowMs: 1000,
    });
    expect(armed.step.armed).toBe(true);
    // the hold expires but the bed is unchanged → advance the theme ONCE, then
    // poll (waitMs is a poll, not a zero-length segment)
    const after = stepLoginRotation(armed.next, { bedStartedAtMs: 1000, nowMs: 1000 + LOGIN_SEGMENT_MS });
    expect(after.step.theme).toBe("menuNocturne");
    expect(after.step.armed).toBe(false);
    expect(after.step.waitMs).toBe(LOGIN_ROTATION_POLL_MS);
    // polling again on the same anchor does NOT advance any further
    const again = stepLoginRotation(after.next, { bedStartedAtMs: 1000, nowMs: 2e6 });
    expect(again.step.theme).toBe("menuNocturne");
    expect(again.step.armed).toBe(false);
  });

  it("a late unlock still gives the nocturne a WHOLE loop, not a remainder", () => {
    // the player clicks 40 s after the screen appeared: the bed starts then,
    // and the first segment must run a full LOGIN_SEGMENT_MS from THAT point
    const UNLOCK = 40_000;
    let s = LOGIN_ROTATION_INITIAL;
    let r = stepLoginRotation(s, { bedStartedAtMs: null, nowMs: 0 });
    expect(r.step.armed).toBe(false);
    s = r.next;
    r = stepLoginRotation(s, { bedStartedAtMs: UNLOCK, nowMs: UNLOCK });
    expect(r.step.armed).toBe(true);
    expect(r.step.waitMs).toBe(LOGIN_SEGMENT_MS); // a whole loop, not 45 s
    expect(r.step.theme).toBe("menu");
  });

  it("a suspended tab fires immediately instead of scheduling in the past", () => {
    const armed = stepLoginRotation(LOGIN_ROTATION_INITIAL, { bedStartedAtMs: 0, nowMs: 0 });
    // tab slept for 10 minutes, then the bed was replaced
    const woke = stepLoginRotation(armed.next, { bedStartedAtMs: 600_000, nowMs: 900_000 });
    expect(woke.step.waitMs).toBe(0); // clamped, never negative
    expect(woke.step.armed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// end-to-end against the real mixer (fake WebAudio)
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {}
  setValueCurveAtTime(c: Float32Array): void {
    this.value = c[c.length - 1] ?? this.value;
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
}
class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}
class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  playing = false;
  constructor(readonly ctx: FakeCtx) {}
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.playing = true;
    this.ctx.sources.push(this);
  }
  stop(): void {
    this.playing = false;
  }
}
class FakeCtx {
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  sources: FakeSource[] = [];
  createGain(): FakeGain {
    return new FakeGain();
  }
  createStereoPanner(): { pan: FakeParam; connect(): void; disconnect(): void } {
    return { pan: new FakeParam(), connect: () => {}, disconnect: () => {} };
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({ duration: 85.333 });
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

const MAP: AudioMap = {
  bgm: {
    menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 0.9 },
    menuNocturne: { file: "assets/audio/bgm/menuNocturne.mp3", loop: true, gain: 0.55 },
  },
  sfx: {},
};

function okFetch(url: string): Promise<Response> {
  if (url.endsWith("config/audio-map.json")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...MAP }),
    } as Response);
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as Response);
}

/**
 * Drain the fetch→arrayBuffer→decode→then chain AND run the crossfade's
 * stop-the-old-source timer (crossfadeMs + 120). Both matter: without the
 * microtasks the new bed never starts, and without the timer the OLD one is
 * never stopped — which is exactly the state the concurrency assertion reads.
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(500);
};

/** Bed sources that are still playing — the "how many tracks at once" answer. */
const livingBeds = (ctx: FakeCtx): FakeSource[] => ctx.sources.filter((s) => s.playing && s.loop);

function build(clock: () => number): { sys: AudioSystem; ctxRef: () => FakeCtx } {
  let ctx!: FakeCtx;
  const sys = new AudioSystem({
    fetchFn: okFetch,
    now: clock,
    crossfadeMs: 10,
    warn: () => {},
    settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    ctxFactory: () => {
      ctx = new FakeCtx();
      return ctx as unknown as AudioContext;
    },
  });
  return { sys, ctxRef: () => ctx };
}

describe("login rotation end-to-end through the real mixer", () => {
  it("plays BOTH tracks, and never two at the same time", async () => {
    cover("login-rotation-single-bed");
    vi.useFakeTimers();
    let now = 0;
    const { sys, ctxRef } = build(() => now);
    await sys.loadMap();
    sys.unlock();

    let state = LOGIN_ROTATION_INITIAL;
    const bedFiles: string[] = [];
    const concurrency: number[] = [];

    // four whole segments, stepped exactly as useLoginTheme's timer does
    for (let guard = 0; guard < 5000 && now <= LOGIN_SEGMENT_MS * 4; guard++) {
      const { step, next } = stepLoginRotation(state, {
        bedStartedAtMs: sys.bedStartedAtMs,
        nowMs: now,
      });
      state = next;
      sys.playBgm(step.theme);
      await settle(); // decode + swap + the outgoing source's stop timer
      concurrency.push(livingBeds(ctxRef()).length);
      if (sys.bedFile && bedFiles[bedFiles.length - 1] !== sys.bedFile) bedFiles.push(sys.bedFile);
      now += Math.max(step.waitMs, 1);
    }

    // FAILURE 1: the nocturne is genuinely reached, more than once
    expect(bedFiles).toContain("assets/audio/bgm/menuNocturne.mp3");
    expect(bedFiles.filter((f) => f.includes("menuNocturne")).length).toBeGreaterThanOrEqual(2);
    expect(bedFiles.filter((f) => f.includes("menu.mp3")).length).toBeGreaterThanOrEqual(2);
    // and it alternates rather than sticking
    for (let i = 1; i < bedFiles.length; i++) expect(bedFiles[i]).not.toBe(bedFiles[i - 1]);

    // FAILURE 2: once each crossfade has settled there is EXACTLY ONE bed
    // sounding — never a second track layered under the first.
    expect(Math.max(...concurrency)).toBe(1);

    sys.dispose();
    vi.useRealTimers();
  });

  it("holds ONE bed and never advances while autoplay stays locked", async () => {
    vi.useFakeTimers();
    let now = 0;
    const { sys } = build(() => now);
    await sys.loadMap();
    // deliberately NO unlock() — the gesture never comes

    let state = LOGIN_ROTATION_INITIAL;
    const themes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { step, next } = stepLoginRotation(state, {
        bedStartedAtMs: sys.bedStartedAtMs,
        nowMs: now,
      });
      state = next;
      themes.add(step.theme);
      sys.playBgm(step.theme);
      await settle();
      now += step.waitMs;
    }
    expect([...themes]).toEqual(["menu"]); // parked on the identity theme
    expect(sys.bedFile).toBeNull(); // and nothing is playing at all
    sys.dispose();
    vi.useRealTimers();
  });
});
