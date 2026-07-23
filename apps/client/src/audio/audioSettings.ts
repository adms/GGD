/**
 * audio/audioSettings — the persisted volume state (master / BGM / SFX + a
 * mute toggle). Deliberately its OWN localStorage key rather than a block on
 * the graphics/network Settings object: audio has no render coupling, and a
 * corrupt graphics blob must never take the mixer down with it.
 *
 * Same shape as settings/SettingsStore: plain pub/sub over an immutable
 * snapshot (NOT Zustand — the AudioSystem is imperative and framework-free;
 * ui/useAudio adapts it to React via useSyncExternalStore).
 */
import { clampVolume, type VolumeState } from "./audioSelect";

export type AudioVolumes = VolumeState;

/** localStorage key for the persisted mixer blob. */
export const AUDIO_STORAGE_KEY = "ggd.audio";

/** Bump when the persisted shape changes; readAudioVolumes merges forward. */
export const AUDIO_SETTINGS_VERSION = 1;

/**
 * Defaults: music sits well under the SFX so voice quips stay intelligible,
 * and the master leaves headroom for the one-shot stings.
 */
export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
  master: 0.8,
  bgm: 0.4,
  sfx: 0.9,
  muted: false,
  bgmMuted: false,
  sfxMuted: false,
};

interface PersistedAudio extends AudioVolumes {
  version: number;
}

/** Clamp/normalize any persisted (or partial, or garbage) blob. */
export function clampAudioVolumes(raw: unknown): AudioVolumes {
  const o = (raw ?? {}) as Partial<AudioVolumes>;
  return {
    master: o.master === undefined ? DEFAULT_AUDIO_VOLUMES.master : clampVolume(o.master),
    bgm: o.bgm === undefined ? DEFAULT_AUDIO_VOLUMES.bgm : clampVolume(o.bgm),
    sfx: o.sfx === undefined ? DEFAULT_AUDIO_VOLUMES.sfx : clampVolume(o.sfx),
    muted: Boolean(o.muted),
    // absent (old blob) → false; additive + backward-compatible
    bgmMuted: Boolean(o.bgmMuted),
    sfxMuted: Boolean(o.sfxMuted),
  };
}

type Persist = Pick<Storage, "getItem" | "setItem">;

function safeLocalStorage(): Persist | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // WKWebView private mode throws on access
  }
}

export class AudioSettingsStore {
  private volumes: AudioVolumes;
  private readonly listeners = new Set<(v: AudioVolumes) => void>();

  constructor(private storage: Persist | null = safeLocalStorage()) {
    this.volumes = this.read();
  }

  private read(): AudioVolumes {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(AUDIO_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    if (!raw) return { ...DEFAULT_AUDIO_VOLUMES };
    try {
      return clampAudioVolumes(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_AUDIO_VOLUMES };
    }
  }

  private commit(next: AudioVolumes): void {
    this.volumes = next;
    const blob: PersistedAudio = { version: AUDIO_SETTINGS_VERSION, ...next };
    try {
      this.storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(blob));
    } catch {
      /* quota / private mode — keep the in-memory value, never throw */
    }
    for (const fn of this.listeners) fn(next);
  }

  get(): AudioVolumes {
    return this.volumes;
  }

  /** Subscribe to any mixer change; returns an unsubscriber. */
  subscribe(fn: (v: AudioVolumes) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Merge a partial change (clamped), persist + notify. */
  patch(partial: Partial<AudioVolumes>): void {
    this.commit(clampAudioVolumes({ ...this.volumes, ...partial }));
  }

  setVolume(bus: "master" | "bgm" | "sfx", v: number): void {
    this.patch({ [bus]: v } as Partial<AudioVolumes>);
  }

  setMuted(muted: boolean): void {
    this.patch({ muted });
  }

  toggleMuted(): boolean {
    const next = !this.volumes.muted;
    this.patch({ muted: next });
    return next;
  }

  /** Mute/unmute a single bus (BGM or SFX) independently of the master mute. */
  setBusMuted(bus: "bgm" | "sfx", muted: boolean): void {
    this.patch(bus === "bgm" ? { bgmMuted: muted } : { sfxMuted: muted });
  }

  /** Flip one bus's mute and return its new state (for one-tap quick toggles). */
  toggleBusMuted(bus: "bgm" | "sfx"): boolean {
    const next = !(bus === "bgm" ? this.volumes.bgmMuted : this.volumes.sfxMuted);
    this.setBusMuted(bus, next);
    return next;
  }

  reset(): void {
    this.commit({ ...DEFAULT_AUDIO_VOLUMES });
  }
}

/** Process-wide mixer settings — read by the AudioSystem and the settings UI. */
export const audioSettings = new AudioSettingsStore();
