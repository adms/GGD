/**
 * audio: Samantha-James rotating BGM (task #137). Covers the pure
 * BgmRotationStore (alternation, the `menu` lock, no-variant no-op, the path
 * derivation) and the AudioSystem integration over the fake WebAudio graph —
 * that a scene ENTRY alternates original ↔ variant, that re-asking the current
 * scene never restarts, that `menu` never rotates, and that a system built
 * WITHOUT a variant map behaves exactly as before (no rotation).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import {
  BgmRotationStore,
  SAMANTHA_VARIANTS,
  ROTATION_LOCKED_SCENES,
  samanthaVariantPath,
} from "./bgmVariants";
import type { AudioMap } from "./types";

// ---------------------------------------------------------------------------
// fake WebAudio (minimal — mirrors AudioSystem.test.ts)
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
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}
class FakeCtx {
  currentTime = 0;
  destination = {};
  state: "suspended" | "running" | "closed" = "suspended";
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBufferSource(): FakeSource {
    return new FakeSource();
  }
  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 1 } as unknown as AudioBuffer);
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
    menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 1 },
    combat: { file: "assets/audio/bgm/combat.mp3", loop: true, gain: 0.8 },
    lobby: { file: "assets/audio/bgm/lobby.mp3", loop: true },
  },
  sfx: {},
};

function okFetch(): (url: string) => Promise<Response> {
  return (url: string) => {
    if (url.endsWith("config/audio-map.json")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "audio-map", schema: "config.audio-map@1", ...MAP }),
      } as Response);
    }
    if (url.includes("assets/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function build(bgmVariants?: Record<string, string>): AudioSystem {
  return new AudioSystem({
    fetchFn: okFetch(),
    now: () => 0,
    crossfadeMs: 10,
    warn: () => {},
    settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    ctxFactory: () => new FakeCtx() as unknown as AudioContext,
    bgmVariants,
  });
}

const VARIANTS = {
  combat: "assets/audio/bgm/combat.samantha.mp3",
  lobby: "assets/audio/bgm/lobby.samantha.mp3",
  menu: "assets/audio/bgm/menu.samantha.mp3", // must be IGNORED (locked)
};

// ---------------------------------------------------------------------------
// pure store
// ---------------------------------------------------------------------------
describe("BgmRotationStore (bgm-variant-rotate)", () => {
  it("alternates original → variant → original on successive scene entries", () => {
    cover("bgm-variant-rotate");
    const r = new BgmRotationStore(VARIANTS);
    const base = "assets/audio/bgm/combat.mp3";
    expect(r.next("combat", base)).toBe(base);
    expect(r.next("combat", base)).toBe("assets/audio/bgm/combat.samantha.mp3");
    expect(r.next("combat", base)).toBe(base);
    expect(r.next("combat", base)).toBe("assets/audio/bgm/combat.samantha.mp3");
    // `current` reports the last choice without advancing
    expect(r.current("combat", base)).toBe("assets/audio/bgm/combat.samantha.mp3");
    expect(r.next("combat", base)).toBe(base);
  });

  it("never rotates a locked scene (menu stays the single epic theme, #134)", () => {
    cover("bgm-variant-menu-locked");
    expect(ROTATION_LOCKED_SCENES.has("menu")).toBe(true);
    const r = new BgmRotationStore(VARIANTS);
    const base = "assets/audio/bgm/menu.mp3";
    for (let i = 0; i < 4; i++) expect(r.next("menu", base)).toBe(base);
  });

  it("is a no-op without a configured variant (single-file scene)", () => {
    cover("bgm-variant-none");
    const r = new BgmRotationStore(VARIANTS);
    const base = "assets/audio/bgm/room.mp3";
    expect(r.next("room", base)).toBe(base);
    expect(r.next("room", base)).toBe(base);
    // an empty store never rotates anything
    const empty = new BgmRotationStore();
    expect(empty.next("combat", "assets/audio/bgm/combat.mp3")).toBe("assets/audio/bgm/combat.mp3");
    expect(empty.next("combat", "assets/audio/bgm/combat.mp3")).toBe("assets/audio/bgm/combat.mp3");
  });

  it("derives the variant path from a base mp3 path", () => {
    cover("bgm-variant-path");
    expect(samanthaVariantPath("assets/audio/bgm/combat.mp3")).toBe(
      "assets/audio/bgm/combat.samantha.mp3",
    );
    expect(samanthaVariantPath("x.wav")).toBeNull();
  });

  it("ships a variant for every rotating scene and excludes menu", () => {
    cover("bgm-variant-registry");
    expect(SAMANTHA_VARIANTS.menu).toBeUndefined();
    const rotating = [
      "menuNocturne", "lobby", "room", "champSelect", "intermission",
      "battleStart", "combat", "fireRing", "settlement", "victory", "defeat",
    ] as const;
    for (const s of rotating) {
      expect(SAMANTHA_VARIANTS[s]).toBe(`assets/audio/bgm/${s}.samantha.mp3`);
    }
  });
});

// ---------------------------------------------------------------------------
// AudioSystem integration
// ---------------------------------------------------------------------------
describe("AudioSystem BGM rotation (bgm-variant-swap)", () => {
  it("alternates the bed file each time a scene is (re-)entered", async () => {
    cover("bgm-variant-swap");
    const sys = build(VARIANTS);
    await sys.init(null);
    sys.unlock();

    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3"); // entry 1: original

    sys.playBgm("lobby"); // leave and come back so it is a genuine re-entry
    await flush();
    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.samantha.mp3"); // entry 2: variant

    sys.playBgm("lobby");
    await flush();
    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3"); // entry 3: original again
  });

  it("re-asking for the current scene never restarts (no rotation mid-bed)", async () => {
    cover("bgm-variant-noop");
    const sys = build(VARIANTS);
    await sys.init(null);
    sys.unlock();

    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
    sys.playBgm("combat"); // same scene — must be a no-op, file unchanged
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3");
  });

  it("menu never rotates even when re-entered (login stays epic, #134)", async () => {
    cover("bgm-variant-menu-noop");
    const sys = build(VARIANTS);
    await sys.init(null);
    sys.unlock();

    sys.playBgm("menu");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
    sys.playBgm("combat");
    await flush();
    sys.playBgm("menu"); // re-entry — still the epic theme, never a variant
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/menu.mp3");
  });

  it("without a variant map, a scene re-entry keeps the original (unchanged behaviour)", async () => {
    cover("bgm-variant-default-off");
    const sys = build(); // no bgmVariants
    await sys.init(null);
    sys.unlock();

    sys.playBgm("combat");
    await flush();
    sys.playBgm("lobby");
    await flush();
    sys.playBgm("combat");
    await flush();
    expect(sys.bedFile).toBe("assets/audio/bgm/combat.mp3"); // never a variant
  });
});
