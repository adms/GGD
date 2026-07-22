/**
 * audio/audioSelect — the PURE decision layer of the audio system. Every
 * choice the AudioSystem makes that is worth testing lives here and touches
 * neither WebAudio nor the DOM:
 *
 *   • which clip a triggered event plays (random pick over `files`, rng injected)
 *   • whether a trigger is allowed through at all (cooldown + maxConcurrent)
 *   • the crossfade gain curves used when the BGM scene changes
 *   • the volume math (bus product + mute)
 *
 * The AudioSystem is then a thin imperative shell over these functions.
 */
import type { AudioBus, AudioMap, BgmTrack, SfxEntry } from "./types";

/** Injectable RNG (0..1). Tests pass a deterministic sequence. */
export type Rng = () => number;

/** Default crossfade between two BGM beds. */
export const CROSSFADE_MS = 600;
/** Steps in a generated fade curve (WebAudio setValueCurveAtTime). */
export const FADE_CURVE_STEPS = 32;
/** Per-event defaults when the doc omits them. */
export const DEFAULT_COOLDOWN_MS = 0;
export const DEFAULT_MAX_CONCURRENT = 4;

// ---------------------------------------------------------------------------
// lookup + selection
// ---------------------------------------------------------------------------

/**
 * The BGM track authored for a scene, or null when the scene is unmapped /
 * malformed. Null means "the authored intent is silence" — the caller fades
 * the current bed out rather than leaving it playing.
 */
export function bgmTrackFor(map: AudioMap, scene: string): BgmTrack | null {
  const t = map.bgm[scene];
  if (!t || typeof t.file !== "string" || !t.file) return null;
  return t;
}

/** The SFX entry authored for an event, or null when unmapped / empty. */
export function sfxEntryFor(map: AudioMap, event: string): SfxEntry | null {
  const e = map.sfx[event];
  if (!e || !Array.isArray(e.files) || e.files.length === 0) return null;
  return e;
}

/**
 * Pick one clip out of an entry's pool. Deterministic for a given rng value:
 * index = floor(rng() * files.length), clamped so an rng returning exactly 1
 * (or anything out of range) can never index past the end.
 */
export function pickSfxFile(entry: SfxEntry | null, rng: Rng): string | null {
  if (!entry || entry.files.length === 0) return null;
  const raw = rng();
  const r = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0;
  const idx = Math.min(entry.files.length - 1, Math.floor(r * entry.files.length));
  return entry.files[idx] ?? null;
}

/** Convenience: map + event + rng → clip path (null = silent, never throws). */
export function selectSfxFile(map: AudioMap, event: string, rng: Rng): string | null {
  return pickSfxFile(sfxEntryFor(map, event), rng);
}

// ---------------------------------------------------------------------------
// throttling: cooldown + concurrency
// ---------------------------------------------------------------------------

/**
 * SfxGate — per-event rate limiting so a burst of `damage` events can never
 * machine-gun the mixer. Pure bookkeeping: the clock is passed in, nothing is
 * scheduled here. `tryAcquire` returns false when the event is still within
 * its cooldown OR already at its voice cap; a successful acquire MUST be
 * paired with `release(event)` when that voice ends.
 */
export class SfxGate {
  private readonly lastPlayMs = new Map<string, number>();
  private readonly active = new Map<string, number>();

  tryAcquire(event: string, entry: SfxEntry | null, nowMs: number): boolean {
    if (!entry) return false;
    const cooldown = entry.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    const last = this.lastPlayMs.get(event);
    if (last !== undefined && nowMs - last < cooldown) return false;

    const cap = entry.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    if (this.activeCount(event) >= cap) return false;

    this.lastPlayMs.set(event, nowMs);
    this.active.set(event, this.activeCount(event) + 1);
    return true;
  }

  release(event: string): void {
    const n = this.activeCount(event);
    if (n <= 1) this.active.delete(event);
    else this.active.set(event, n - 1);
  }

  activeCount(event: string): number {
    return this.active.get(event) ?? 0;
  }

  /** Total voices in flight across every event (mixer-wide diagnostics). */
  totalActive(): number {
    let n = 0;
    for (const v of this.active.values()) n += v;
    return n;
  }

  reset(): void {
    this.lastPlayMs.clear();
    this.active.clear();
  }
}

// ---------------------------------------------------------------------------
// volume math
// ---------------------------------------------------------------------------

export interface VolumeState {
  master: number;
  bgm: number;
  sfx: number;
  /** master mute — silences everything. */
  muted: boolean;
  /**
   * Per-bus mutes, independent of the master `muted` and of the bus volume
   * sliders (so a quick toggle never clobbers the user's level). OPTIONAL and
   * treated as `false` when absent, which keeps older persisted blobs and any
   * pre-existing `VolumeState` literal valid — the localStorage schema stays
   * backward-compatible (a blob written before per-bus mute reads as unmuted).
   */
  bgmMuted?: boolean;
  sfxMuted?: boolean;
}

/** Clamp any incoming volume (NaN/undefined/out-of-range) into 0..1. */
export function clampVolume(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Clamp a stereo pan into [-1, 1] (StereoPannerNode's range). Non-finite input
 * (a bad projection) → 0 (centred), so a NaN can never reach the pan AudioParam.
 */
export function clampPan(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

/**
 * A non-negative per-voice multiplier on top of the authored entry gain, for a
 * one-off SFX played with a caller volume (e.g. a near/far dragon roar). Bad
 * input (undefined/NaN/negative) collapses to 1 / 0 so the mixer never NaNs.
 */
export function sfxVoiceMultiplier(volume: unknown): number {
  if (volume === undefined) return 1;
  const n = typeof volume === "number" ? volume : Number(volume);
  if (!Number.isFinite(n)) return 1;
  return n < 0 ? 0 : n;
}

/**
 * Final linear gain for one sound: master × bus × clip, zero when muted.
 * (The AudioSystem splits this across real gain nodes — master node, bus node
 * and a per-voice node — but the product is identical, which is what the
 * tests assert.)
 */
export function effectiveGain(vol: VolumeState, bus: AudioBus, clipGain = 1): number {
  if (vol.muted) return 0;
  // per-bus mute zeroes only its own bus (the other keeps playing)
  if (bus === "bgm" ? vol.bgmMuted : vol.sfxMuted) return 0;
  const busGain = bus === "bgm" ? clampVolume(vol.bgm) : clampVolume(vol.sfx);
  const clip = Number.isFinite(clipGain) ? Math.max(0, clipGain) : 1;
  return clampVolume(vol.master) * busGain * clip;
}

// ---------------------------------------------------------------------------
// crossfade curves
// ---------------------------------------------------------------------------

export interface CrossfadeCurves {
  /** gain curve for the OUTGOING bed: starts at its current gain, ends at 0 */
  out: number[];
  /** gain curve for the INCOMING bed: starts at 0, ends at its target gain */
  in: number[];
}

/**
 * Equal-power crossfade curves (cos/sin), so the two beds sum to a constant
 * perceived loudness through the transition instead of dipping in the middle
 * the way a linear pair does. `steps` samples are handed to WebAudio's
 * setValueCurveAtTime; both curves are monotonic and hit their endpoints
 * exactly.
 */
export function crossfadeCurves(
  fromGain: number,
  toGain: number,
  steps: number = FADE_CURVE_STEPS,
): CrossfadeCurves {
  const n = Math.max(2, Math.floor(steps));
  const out: number[] = [];
  const inc: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(fromGain * Math.cos((t * Math.PI) / 2));
    inc.push(toGain * Math.sin((t * Math.PI) / 2));
  }
  // kill float drift at the endpoints (WebAudio holds the final value)
  out[0] = fromGain;
  out[n - 1] = 0;
  inc[0] = 0;
  inc[n - 1] = toGain;
  return { out, in: inc };
}

/** The fade-out half alone (used when a scene has no authored track). */
export function fadeOutCurve(fromGain: number, steps: number = FADE_CURVE_STEPS): number[] {
  return crossfadeCurves(fromGain, 0, steps).out;
}

/** The fade-in half alone (used for the very first bed / after unlock). */
export function fadeInCurve(toGain: number, steps: number = FADE_CURVE_STEPS): number[] {
  return crossfadeCurves(0, toGain, steps).in;
}

/**
 * Whether a scene change actually needs work. Re-asking for the scene already
 * playing is a no-op (the loop must NOT restart), which is what lets callers
 * fire `playBgm(scene)` from any render/effect without tracking edges.
 */
export function needsSceneChange(current: string | null, next: string | null): boolean {
  return current !== next;
}
