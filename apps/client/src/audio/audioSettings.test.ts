/**
 * audio: mixer settings persistence — save/load round-trip through a fake
 * Storage, clamp of partial/garbage blobs, and the mute toggle.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  AUDIO_STORAGE_KEY,
  AudioSettingsStore,
  DEFAULT_AUDIO_VOLUMES,
  clampAudioVolumes,
} from "./audioSettings";

function fakeStorage(seed: Record<string, string> = {}): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("audio settings persistence (audio-volume-persistence)", () => {
  it("defaults are master .8 / bgm .4 / sfx .9, unmuted", () => {
    cover("audio-volume-persistence");
    expect(DEFAULT_AUDIO_VOLUMES).toEqual({
      master: 0.8,
      bgm: 0.4,
      sfx: 0.9,
      muted: false,
      bgmMuted: false,
      sfxMuted: false,
    });
    const store = new AudioSettingsStore(fakeStorage());
    expect(store.get()).toEqual(DEFAULT_AUDIO_VOLUMES);
  });

  it("persists edits and reloads them into a fresh store", () => {
    cover("audio-volume-persistence");
    const storage = fakeStorage();
    const a = new AudioSettingsStore(storage);
    a.setVolume("master", 0.6);
    a.setVolume("bgm", 0.2);
    a.setVolume("sfx", 0.75);
    a.setMuted(true);

    const b = new AudioSettingsStore(storage);
    expect(b.get()).toEqual({
      master: 0.6,
      bgm: 0.2,
      sfx: 0.75,
      muted: true,
      bgmMuted: false,
      sfxMuted: false,
    });
  });

  it("notifies subscribers on change; unsubscribe stops delivery", () => {
    cover("audio-volume-persistence");
    const store = new AudioSettingsStore(fakeStorage());
    let seen = 0;
    const off = store.subscribe(() => seen++);
    store.setVolume("sfx", 0.4);
    store.setMuted(true);
    expect(seen).toBe(2);
    off();
    store.setVolume("sfx", 0.1);
    expect(seen).toBe(2);
  });

  it("toggleMuted flips and returns the new state", () => {
    cover("audio-volume-persistence");
    const store = new AudioSettingsStore(fakeStorage());
    expect(store.toggleMuted()).toBe(true);
    expect(store.get().muted).toBe(true);
    expect(store.toggleMuted()).toBe(false);
  });

  it("clamps a partial / out-of-range / garbage persisted blob", () => {
    cover("audio-volume-persistence");
    expect(clampAudioVolumes({ master: 9, bgm: -3 })).toEqual({
      master: 1, // clamped
      bgm: 0, // clamped
      sfx: 0.9, // filled from default
      muted: false,
      bgmMuted: false, // absent → false (backward-compatible)
      sfxMuted: false,
    });
    // a corrupt JSON string in storage falls back to defaults, never throws
    const store = new AudioSettingsStore(fakeStorage({ [AUDIO_STORAGE_KEY]: "{not json" }));
    expect(store.get()).toEqual(DEFAULT_AUDIO_VOLUMES);
  });

  it("survives a Storage that throws (private mode) by staying in memory", () => {
    cover("audio-volume-persistence");
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const store = new AudioSettingsStore(throwing);
    expect(store.get()).toEqual(DEFAULT_AUDIO_VOLUMES);
    // a mutation must not throw even though persistence fails
    expect(() => store.setVolume("master", 0.3)).not.toThrow();
    expect(store.get().master).toBeCloseTo(0.3, 6);
  });
});
