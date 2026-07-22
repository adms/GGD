/**
 * audio: the GLOBAL music/SFX quick-control.
 *
 * Covers the per-bus mute the cluster drives, its icon state, and — since the
 * cluster gained an expandable slider tray — that the sliders are REAL TIME:
 *   • per-bus mute round-trips through audioSettings + localStorage, without
 *     disturbing the bus volume slider;
 *   • the two buses toggle INDEPENDENTLY — music never touches SFX, nor vice
 *     versa (store state + effectiveGain math + the live AudioSystem bus gain);
 *   • the default is fully unmuted, including an OLD persisted blob written
 *     before per-bus mute existed (backward-compatible schema);
 *   • AudioToggleView renders the correct on/off icon state for its props;
 *   • a slider drag reaches the PLAYING bed's bus gain on every `input` event,
 *     without restarting the bed — not on release, not on the next track;
 *   • slider levels persist and reload, and stay independent of both mutes;
 *   • the cursor-size cell is driven entirely by the shared `cursor/` module.
 *
 * Env note: the client vitest runs in a `node` environment (no DOM), so the UI
 * is exercised through react-dom/server.renderToStaticMarkup on the pure
 * AudioToggleView (the container's <body> portal falls back to inline there),
 * and the mixer through a fake WebAudio graph.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  AUDIO_STORAGE_KEY,
  AudioSettingsStore,
  DEFAULT_AUDIO_VOLUMES,
  clampAudioVolumes,
} from "../audio/audioSettings";
import { AudioSystem } from "../audio/AudioSystem";
import { effectiveGain } from "../audio/audioSelect";
import type { AudioMap } from "../audio/types";
import {
  CURSOR_SIZE_OPTIONS,
  CursorSettingsStore,
  DEFAULT_CURSOR_SIZE,
  cursorSettings,
  getCursorSize,
  setCursorSize,
  type CursorSize,
} from "../cursor";
import { AudioToggleView, buildAudioTrayCells } from "./AudioToggle";

interface FakeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  data: Record<string, string>;
}

function fakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const noop = (): void => {};

// ---------------------------------------------------------------------------
// fake WebAudio + content, enough to get a bed actually PLAYING so a volume
// edit can be observed landing on it mid-playback
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {}
  setValueCurveAtTime(curve: Float32Array): void {
    this.value = curve[curve.length - 1] ?? this.value;
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
  constructor(private ctx: FakeCtx) {}
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.ctx.started.push(this);
  }
  stop(): void {
    this.ctx.stopped.push(this);
  }
}
class FakeCtx {
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  started: FakeSource[] = [];
  stopped: FakeSource[] = [];
  gains: FakeGain[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }
  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 40 } as unknown as AudioBuffer);
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

const LIVE_MAP: AudioMap = {
  bgm: { menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 1 } },
  sfx: {},
};

function liveFetch(url: string): Promise<Response> {
  if (url.endsWith("config/audio-map.json")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...LIVE_MAP }),
    } as Response);
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as Response);
}

/** drain the fetch→arrayBuffer→decode→then microtask chain */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** An AudioSystem with a fake graph + the given settings store. */
function liveSystem(settings: AudioSettingsStore): {
  sys: AudioSystem;
  ctx: () => FakeCtx | null;
} {
  let ctx: FakeCtx | null = null;
  const sys = new AudioSystem({
    settings,
    fetchFn: liveFetch,
    crossfadeMs: 10,
    warn: () => {},
    ctxFactory: () => {
      ctx = new FakeCtx();
      return ctx as unknown as AudioContext;
    },
  });
  return { sys, ctx: () => ctx };
}

/** Boot a system with the `menu` bed actually playing. */
async function playingSystem(settings: AudioSettingsStore): Promise<{
  sys: AudioSystem;
  ctx: () => FakeCtx | null;
}> {
  const built = liveSystem(settings);
  await built.sys.loadMap();
  built.sys.playBgm("menu");
  built.sys.unlock();
  await flush();
  return built;
}

describe("audio quick-toggle: per-bus mute persistence (audio-toggle-bus-mute-persist)", () => {
  it("round-trips a bus mute through localStorage without touching its slider", () => {
    cover("audio-toggle-bus-mute-persist");
    const storage = fakeStorage();
    const a = new AudioSettingsStore(storage);
    a.setVolume("bgm", 0.5); // a real slider level, to prove mute != volume=0
    expect(a.toggleBusMuted("bgm")).toBe(true);

    // the persisted blob carries the new flag (and only the toggled bus)
    const persisted = JSON.parse(storage.data[AUDIO_STORAGE_KEY]!) as Record<string, unknown>;
    expect(persisted.bgmMuted).toBe(true);
    expect(persisted.sfxMuted).toBe(false);
    expect(persisted.bgm).toBe(0.5); // slider untouched by the mute

    // a fresh store reloads it verbatim
    const b = new AudioSettingsStore(storage);
    expect(b.get().bgmMuted).toBe(true);
    expect(b.get().sfxMuted).toBe(false);
    expect(b.get().bgm).toBe(0.5);

    // unmuting round-trips too
    b.setBusMuted("bgm", false);
    expect(new AudioSettingsStore(storage).get().bgmMuted).toBe(false);
  });
});

describe("audio quick-toggle: buses toggle independently (audio-toggle-bus-independence)", () => {
  it("muting music leaves SFX alone and vice versa (store state)", () => {
    cover("audio-toggle-bus-independence");
    const store = new AudioSettingsStore(fakeStorage());

    store.setBusMuted("bgm", true);
    expect(store.get().bgmMuted).toBe(true);
    expect(store.get().sfxMuted).toBe(false); // SFX untouched

    store.setBusMuted("sfx", true);
    expect(store.get().bgmMuted).toBe(true); // BGM still muted
    expect(store.get().sfxMuted).toBe(true);

    store.toggleBusMuted("bgm"); // unmute music only
    expect(store.get().bgmMuted).toBe(false);
    expect(store.get().sfxMuted).toBe(true); // SFX stays muted
  });

  it("per-bus mute zeroes only its own bus in the gain math", () => {
    cover("audio-toggle-bus-independence");
    const bgmOff = { ...DEFAULT_AUDIO_VOLUMES, bgmMuted: true, sfxMuted: false };
    expect(effectiveGain(bgmOff, "bgm")).toBe(0);
    expect(effectiveGain(bgmOff, "sfx")).toBeGreaterThan(0);

    const sfxOff = { ...DEFAULT_AUDIO_VOLUMES, bgmMuted: false, sfxMuted: true };
    expect(effectiveGain(sfxOff, "sfx")).toBe(0);
    expect(effectiveGain(sfxOff, "bgm")).toBeGreaterThan(0);
  });

  it("drives the LIVE AudioSystem bus gain per bus, master untouched", () => {
    cover("audio-toggle-bus-independence");
    // minimal fake WebAudio graph: read back the three bus gains
    class Param {
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
    class Gain {
      gain = new Param();
      connect(): void {}
      disconnect(): void {}
    }
    class Src {
      buffer: unknown = null;
      loop = false;
      onended: (() => void) | null = null;
      connect(): void {}
      disconnect(): void {}
      start(): void {}
      stop(): void {}
    }
    class Ctx {
      currentTime = 0;
      destination = {};
      state = "suspended";
      gains: Gain[] = [];
      createGain(): Gain {
        const g = new Gain();
        this.gains.push(g);
        return g;
      }
      createBufferSource(): Src {
        return new Src();
      }
      decodeAudioData(): Promise<AudioBuffer> {
        return Promise.resolve({} as AudioBuffer);
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

    const settings = new AudioSettingsStore(fakeStorage());
    let ctx: Ctx | null = null;
    const sys = new AudioSystem({
      settings,
      warn: () => {},
      ctxFactory: () => {
        ctx = new Ctx();
        return ctx as unknown as AudioContext;
      },
    });
    sys.unlock(); // builds master→{bgm,sfx} graph and applies current volumes
    const gains = ctx!.gains;
    const [master, bgm, sfx] = gains; // ensureCtx creates master, bgm, sfx in order
    expect(bgm!.gain.value).toBeCloseTo(0.5, 6); // default BGM slider
    expect(sfx!.gain.value).toBeCloseTo(0.9, 6); // default SFX slider

    sys.setBusMuted("bgm", true);
    expect(bgm!.gain.value).toBe(0); // music silenced
    expect(sfx!.gain.value).toBeCloseTo(0.9, 6); // effects untouched
    expect(master!.gain.value).toBeCloseTo(0.8, 6); // NOT master-muted

    sys.setBusMuted("sfx", true);
    expect(sfx!.gain.value).toBe(0);

    sys.setBusMuted("bgm", false);
    expect(bgm!.gain.value).toBeCloseTo(0.5, 6); // unmute restores the slider level
    sys.dispose();
  });
});

describe("audio quick-toggle: default unmuted + backward-compat (audio-toggle-default-unmuted)", () => {
  it("defaults both buses unmuted; an old blob without the keys reads unmuted", () => {
    cover("audio-toggle-default-unmuted");
    expect(DEFAULT_AUDIO_VOLUMES.bgmMuted).toBe(false);
    expect(DEFAULT_AUDIO_VOLUMES.sfxMuted).toBe(false);

    const fresh = new AudioSettingsStore(fakeStorage());
    expect(fresh.get().bgmMuted).toBe(false);
    expect(fresh.get().sfxMuted).toBe(false);

    // a blob written before per-bus mute existed (no bgmMuted/sfxMuted keys)
    const legacy = new AudioSettingsStore(
      fakeStorage({
        [AUDIO_STORAGE_KEY]: JSON.stringify({
          version: 1,
          master: 0.7,
          bgm: 0.4,
          sfx: 0.6,
          muted: false,
        }),
      }),
    );
    expect(legacy.get().bgmMuted).toBe(false);
    expect(legacy.get().sfxMuted).toBe(false);
    expect(legacy.get().master).toBe(0.7); // rest still loads

    // clamp backfills the absent flags as false, never undefined
    expect(clampAudioVolumes({ master: 0.5 }).bgmMuted).toBe(false);
    expect(clampAudioVolumes({ master: 0.5 }).sfxMuted).toBe(false);
  });
});

describe("audio quick-toggle: view reflects store state (audio-toggle-render-state)", () => {
  it("renders on/off icon state for each bus from its props", () => {
    cover("audio-toggle-render-state");
    const bothOn = renderToStaticMarkup(
      createElement(AudioToggleView, { bgmMuted: false, sfxMuted: false, onToggle: noop }),
    );
    expect(bothOn).toContain('data-bus="bgm"');
    expect(bothOn).toContain('data-bus="sfx"');
    expect(bothOn).toContain('aria-label="Music on"');
    expect(bothOn).toContain('aria-label="Sound effects on"');

    const musicOff = renderToStaticMarkup(
      createElement(AudioToggleView, { bgmMuted: true, sfxMuted: false, onToggle: noop }),
    );
    expect(musicOff).toContain('aria-label="Music off"');
    expect(musicOff).toContain('aria-label="Sound effects on"'); // sfx unaffected

    const sfxOff = renderToStaticMarkup(
      createElement(AudioToggleView, { bgmMuted: false, sfxMuted: true, onToggle: noop }),
    );
    expect(sfxOff).toContain('aria-label="Music on"');
    expect(sfxOff).toContain('aria-label="Sound effects off"');
  });

  it("takes its icon state from a live audioSettings store", () => {
    cover("audio-toggle-render-state");
    const store = new AudioSettingsStore(fakeStorage());
    store.setBusMuted("bgm", true); // mute music through the real store API
    const v = store.get();
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, {
        bgmMuted: !!v.bgmMuted,
        sfxMuted: !!v.sfxMuted,
        onToggle: noop,
      }),
    );
    expect(html).toContain('aria-label="Music off"');
    expect(html).toContain('aria-label="Sound effects on"');
  });
});

describe("audio quick-toggle: sliders apply to the LIVE mix (audio-toggle-volume-live)", () => {
  it("THE REQUIREMENT: a music-slider drag changes the PLAYING bed on every input", async () => {
    cover("audio-toggle-volume-live");
    const settings = new AudioSettingsStore(fakeStorage());
    const { sys, ctx } = await playingSystem(settings);

    // a bed really is playing before we touch anything
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    const sourcesBefore = ctx()!.started.length;
    expect(sourcesBefore).toBe(1);
    expect(sys.liveGain("bgm")).toBeCloseTo(DEFAULT_AUDIO_VOLUMES.bgm, 6);

    // one edit per pointer move, exactly what <input type="range"> emits …
    const drag = [0.45, 0.35, 0.2, 0.05, 0];
    const sampledDuringDrag: number[] = [];
    for (const v of drag) {
      sys.setVolume("bgm", v);
      // sampled BETWEEN moves — i.e. before any "commit"/release ever happens
      sampledDuringDrag.push(sys.liveGain("bgm")!);
    }
    expect(sampledDuringDrag).toEqual(drag);

    // … and it landed on the SAME bed: no source was started or stopped, so the
    // loop never restarted (a restart is the failure mode of a "read the volume
    // at track start" engine).
    expect(ctx()!.started.length).toBe(sourcesBefore);
    expect(ctx()!.stopped.length).toBe(0);
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");

    // pulling music down left the other buses exactly where they were
    expect(sys.liveGain("sfx")).toBeCloseTo(DEFAULT_AUDIO_VOLUMES.sfx, 6);
    expect(sys.liveGain("master")).toBeCloseTo(DEFAULT_AUDIO_VOLUMES.master, 6);
    sys.dispose();
  });

  it("the master slider is live too, and drags back up as well as down", async () => {
    cover("audio-toggle-volume-live");
    const settings = new AudioSettingsStore(fakeStorage());
    const { sys } = await playingSystem(settings);
    for (const v of [0.2, 0.6, 1, 0]) {
      sys.setVolume("master", v);
      expect(sys.liveGain("master")).toBeCloseTo(v, 6);
    }
    // and the store agrees with the graph at every step
    expect(settings.get().master).toBe(0);
    sys.dispose();
  });

  it("slider and per-bus mute stay independent on the LIVE graph", async () => {
    cover("audio-toggle-volume-live");
    const settings = new AudioSettingsStore(fakeStorage());
    const { sys } = await playingSystem(settings);

    sys.setVolume("bgm", 0.3);
    expect(sys.liveGain("bgm")).toBeCloseTo(0.3, 6);

    sys.setBusMuted("bgm", true); // 🎵 tap
    expect(sys.liveGain("bgm")).toBe(0);
    expect(settings.get().bgm).toBe(0.3); // the level is REMEMBERED, not zeroed

    // dragging while muted keeps the bus silent but records the new level
    sys.setVolume("bgm", 0.8);
    expect(sys.liveGain("bgm")).toBe(0);
    expect(settings.get().bgm).toBe(0.8);

    sys.setBusMuted("bgm", false); // untap → the dragged level comes back live
    expect(sys.liveGain("bgm")).toBeCloseTo(0.8, 6);
    // master mute is a separate axis and was never touched
    expect(settings.get().muted).toBe(false);
    sys.dispose();
  });
});

describe("audio quick-toggle: slider levels persist (audio-toggle-volume-persist)", () => {
  it("round-trips master/music/SFX through localStorage and reloads them live", async () => {
    cover("audio-toggle-volume-persist");
    const storage = fakeStorage();
    const first = new AudioSettingsStore(storage);
    first.setVolume("master", 0.35);
    first.setVolume("bgm", 0.15);
    first.setVolume("sfx", 0.7);
    first.setBusMuted("sfx", true); // a mute alongside the levels

    const persisted = JSON.parse(storage.data[AUDIO_STORAGE_KEY]!) as Record<string, unknown>;
    expect(persisted).toMatchObject({
      master: 0.35,
      bgm: 0.15,
      sfx: 0.7,
      sfxMuted: true,
      bgmMuted: false,
    });

    // "reload": a brand-new store over the same storage …
    const reloaded = new AudioSettingsStore(storage);
    expect(reloaded.get()).toMatchObject({ master: 0.35, bgm: 0.15, sfx: 0.7, sfxMuted: true });

    // … and a brand-new mixer boots straight onto those levels
    const { sys } = await playingSystem(reloaded);
    expect(sys.liveGain("master")).toBeCloseTo(0.35, 6);
    expect(sys.liveGain("bgm")).toBeCloseTo(0.15, 6);
    expect(sys.liveGain("sfx")).toBe(0); // muted, level preserved underneath
    sys.setBusMuted("sfx", false);
    expect(sys.liveGain("sfx")).toBeCloseTo(0.7, 6);
    sys.dispose();
  });

  it("clamps a garbage or out-of-range persisted level instead of NaN-ing the mix", () => {
    cover("audio-toggle-volume-persist");
    const blob = clampAudioVolumes({ master: 5, bgm: -2, sfx: "loud" });
    expect(blob.master).toBe(1);
    expect(blob.bgm).toBe(0);
    expect(blob.sfx).toBe(0);
  });
});

describe("audio quick-toggle: the slider tray renders (audio-toggle-tray-render)", () => {
  const cells = buildAudioTrayCells({
    master: 0.8,
    bgm: 0.5,
    sfx: 0.9,
    cursorIndex: 1,
    showCursor: true,
    onVolume: noop,
    onCursorIndex: noop,
  });

  it("is COLLAPSED by default — the one-tap mutes are the resting state", () => {
    cover("audio-toggle-tray-render");
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, { bgmMuted: false, sfxMuted: false, onToggle: noop, cells }),
    );
    expect(html).not.toContain("data-ggd-audio-tray");
    expect(html).toContain('aria-expanded="false"');
    // …and the buttons that were always there still are (no regression)
    expect(html).toContain('data-bus="bgm"');
    expect(html).toContain('data-bus="sfx"');
    expect(html).toContain('aria-label="Music on"');
  });

  it("expanded, it renders one labelled slider per control", () => {
    cover("audio-toggle-tray-render");
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, {
        bgmMuted: false,
        sfxMuted: true,
        onToggle: noop,
        cells,
        expanded: true,
      }),
    );
    expect(html).toContain("data-ggd-audio-tray");
    expect(html).toContain('aria-expanded="true"');
    for (const id of ["master", "bgm", "sfx", "cursor"]) {
      expect(html, id).toContain(`data-ctl="${id}"`);
    }
    expect(html).toContain('type="range"');
    // the value is announced, not just drawn
    expect(html).toContain('aria-label="Master volume 80%"');
    expect(html).toContain('aria-label="Music volume 50%"');
    expect(html).toContain('aria-label="Sound effects volume 90%"');
    // muting a bus does NOT collapse or disable its slider
    expect(html).toContain('aria-label="Sound effects off"');
    expect(html).toContain("90%");
  });

  it("expanded with nothing to show renders no tray (never an empty box)", () => {
    cover("audio-toggle-tray-render");
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, {
        bgmMuted: false,
        sfxMuted: false,
        onToggle: noop,
        cells: [],
        expanded: true,
      }),
    );
    expect(html).not.toContain("data-ggd-audio-tray");
  });

  it("each slider reports its own value on input (music never moves SFX)", () => {
    cover("audio-toggle-tray-render");
    const seen: [string, number][] = [];
    const wired = buildAudioTrayCells({
      master: 0.8,
      bgm: 0.5,
      sfx: 0.9,
      cursorIndex: 0,
      showCursor: false,
      onVolume: (bus, v) => seen.push([bus, v]),
      onCursorIndex: noop,
    });
    expect(wired.map((c) => c.id)).toEqual(["master", "bgm", "sfx"]); // no cursor cell
    for (const c of wired) c.onInput(0.25);
    expect(seen).toEqual([
      ["master", 0.25],
      ["bgm", 0.25],
      ["sfx", 0.25],
    ]);
  });
});

describe("audio quick-toggle: cursor size comes from cursor/ (audio-toggle-cursor-size)", () => {
  it("walks the SHARED ladder — no size, label or px is redeclared here", () => {
    cover("audio-toggle-cursor-size");
    const cells = buildAudioTrayCells({
      master: 1,
      bgm: 1,
      sfx: 1,
      cursorIndex: 2,
      showCursor: true,
      onVolume: noop,
      onCursorIndex: noop,
    });
    const cursor = cells.find((c) => c.id === "cursor")!;
    expect(cursor).toBeDefined();
    // the range spans exactly the module's option list …
    expect(cursor.min).toBe(0);
    expect(cursor.max).toBe(CURSOR_SIZE_OPTIONS.length - 1);
    expect(cursor.step).toBe(1);
    // … and shows that module's own label for the current step
    expect(cursor.display).toBe(CURSOR_SIZE_OPTIONS[2]!.label);
    expect(cursor.ariaLabel).toBe("Cursor size");
  });

  it("clamps an out-of-range index instead of rendering a blank step", () => {
    cover("audio-toggle-cursor-size");
    const build = (i: number): { value: number; display: string } => {
      const c = buildAudioTrayCells({
        master: 1,
        bgm: 1,
        sfx: 1,
        cursorIndex: i,
        showCursor: true,
        onVolume: noop,
        onCursorIndex: noop,
      }).find((x) => x.id === "cursor")!;
      return { value: c.value, display: c.display };
    };
    const last = CURSOR_SIZE_OPTIONS.length - 1;
    expect(build(-3)).toEqual({ value: 0, display: CURSOR_SIZE_OPTIONS[0]!.label });
    expect(build(99)).toEqual({ value: last, display: CURSOR_SIZE_OPTIONS[last]!.label });
  });

  it("a drag reports snapped, in-range indices to the shared setter", () => {
    cover("audio-toggle-cursor-size");
    const picked: number[] = [];
    const cursor = buildAudioTrayCells({
      master: 1,
      bgm: 1,
      sfx: 1,
      cursorIndex: 0,
      showCursor: true,
      onVolume: noop,
      onCursorIndex: (i) => picked.push(i),
    }).find((c) => c.id === "cursor")!;
    const last = CURSOR_SIZE_OPTIONS.length - 1;
    for (const raw of [0, 1.4, 2.6, -5, 999]) cursor.onInput(raw);
    expect(picked).toEqual([0, 1, 3, 0, last]);
    expect(picked.every((i) => Number.isInteger(i) && i >= 0 && i <= last)).toBe(true);
  });

  it("selecting a step persists through the shared store and reloads", () => {
    cover("audio-toggle-cursor-size");
    const storage = fakeStorage();
    const store = new CursorSettingsStore(storage);
    const other = CURSOR_SIZE_OPTIONS.map((o) => o.value).find((v) => v !== DEFAULT_CURSOR_SIZE)!;
    store.setSize(other);
    expect(new CursorSettingsStore(storage).getSize()).toBe(other);

    // …and the barrel the cluster actually calls drives that same store
    const before = getCursorSize();
    const target: CursorSize = CURSOR_SIZE_OPTIONS.map((o) => o.value).find((v) => v !== before)!;
    let notified: CursorSize | null = null;
    const off = cursorSettings.subscribe((p) => {
      notified = p.size;
    });
    setCursorSize(target);
    expect(getCursorSize()).toBe(target);
    expect(notified).toBe(target); // the live subscriber (applyCursor) is told
    off();
    setCursorSize(before); // leave the process-wide singleton as we found it
  });
});
