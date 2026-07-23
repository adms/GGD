/**
 * The login rotation STATE MACHINE. SINGLE-THEME since task #134: the serene
 * nocturne left the login screen for the ranked ladder, so the machine now only
 * ever hands back `menu`. It is kept (not deleted) because its two hard-won
 * guards are exactly what a re-added second login theme would need, and because
 * a degenerate single-theme rotation must still behave — never runaway, never
 * blank the bed. So the tests assert the SHAPE that survives:
 *
 *   1. it holds `menu` across whole segments and never invents a second track;
 *   2. it never flips off a stale anchor (no runaway asking the mixer to swap);
 *   3. end-to-end over the real mixer it drives EXACTLY ONE bed, `menu`, and
 *      never the nocturne (which login no longer asks for at all).
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
  it("holds `menu` across whole segments — there is no second track to reach", () => {
    cover("login-rotation-single-theme");
    // a bed that starts at t=0 and loops forever (the mixer re-anchors on each
    // segment, which is what bedStartedAtMs reports)
    let bedStart = 0;
    const r = drive(LOGIN_SEGMENT_MS * 4 + 1000, (now) => {
      if (now >= bedStart + LOGIN_SEGMENT_MS) bedStart = now;
      return bedStart;
    });
    // the theme never changes — only `menu`, ever
    expect(r.themes).toEqual(["menu"]);
    // ...but the machine is genuinely cycling segments (armed + advanced), not
    // frozen: the free-running index has walked several whole segments forward.
    expect(r.state.index).toBeGreaterThanOrEqual(4);
  });

  it("a bed that never starts holds `menu` and keeps polling", () => {
    // autoplay never unlocked: bedStartedAtMs stays null forever
    const r = drive(LOGIN_SEGMENT_MS * 3, () => null);
    expect(r.themes).toEqual(["menu"]);
    // ...but it also never gives up: it is still polling at the poll interval
    const { step } = stepLoginRotation(r.state, { bedStartedAtMs: null, nowMs: 1e6 });
    expect(step.armed).toBe(false);
    expect(step.waitMs).toBe(LOGIN_ROTATION_POLL_MS);
    // and the moment a bed DOES appear it arms a full segment
    const armed = stepLoginRotation(r.state, { bedStartedAtMs: 1e6, nowMs: 1e6 });
    expect(armed.step.armed).toBe(true);
    expect(armed.step.waitMs).toBe(LOGIN_SEGMENT_MS);
    expect(armed.step.theme).toBe("menu");
  });

  it("a stale anchor must not flip / re-swap the bed every tick", () => {
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
    // still only `menu`, and while stuck it polled rather than re-armed every
    // tick: bounded step count (NOT one arm per poll)
    expect(r.themes).toEqual(["menu"]);
    expect(r.steps).toBeLessThan(3 + (3 * STUCK_MS) / LOGIN_ROTATION_POLL_MS + 10);
  });

  it("re-arming needs a DIFFERENT anchor, never the same one", () => {
    const armed = stepLoginRotation(LOGIN_ROTATION_INITIAL, {
      bedStartedAtMs: 1000,
      nowMs: 1000,
    });
    expect(armed.step.armed).toBe(true);
    // the hold expires but the bed is unchanged → advance the segment ONCE, then
    // poll (waitMs is a poll, not a zero-length segment) — theme stays `menu`
    const after = stepLoginRotation(armed.next, { bedStartedAtMs: 1000, nowMs: 1000 + LOGIN_SEGMENT_MS });
    expect(after.step.theme).toBe("menu");
    expect(after.step.armed).toBe(false);
    expect(after.step.waitMs).toBe(LOGIN_ROTATION_POLL_MS);
    // polling again on the same anchor does NOT re-arm
    const again = stepLoginRotation(after.next, { bedStartedAtMs: 1000, nowMs: 2e6 });
    expect(again.step.theme).toBe("menu");
    expect(again.step.armed).toBe(false);
  });

  it("a late unlock still gives the theme a WHOLE loop, not a remainder", () => {
    // the player clicks 40 s after the screen appeared: the bed starts then, and
    // the first segment must run a full LOGIN_SEGMENT_MS from THAT point
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
    // still authored (it is the ranked-ladder bed now); login just never asks.
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
  it("plays ONLY `menu`, never the nocturne, and never two beds at once", async () => {
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

    // the ONLY bed ever reached is `menu`; the nocturne is never requested
    expect(bedFiles).toContain("assets/audio/bgm/menu.mp3");
    expect(bedFiles.every((f) => f.includes("menu.mp3"))).toBe(true);
    expect(bedFiles.some((f) => f.includes("menuNocturne"))).toBe(false);
    // and a same-scene playBgm is a no-op, so the bed is swapped exactly once
    expect(bedFiles).toEqual(["assets/audio/bgm/menu.mp3"]);

    // there is EXACTLY ONE bed sounding — never a second track layered under it
    expect(Math.max(...concurrency)).toBe(1);

    sys.dispose();
    vi.useRealTimers();
  });

  it("holds NO bed while autoplay stays locked, and only ever asks for `menu`", async () => {
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
    expect([...themes]).toEqual(["menu"]); // parked on the single identity theme
    expect(sys.bedFile).toBeNull(); // and nothing is playing at all
    sys.dispose();
    vi.useRealTimers();
  });
});
