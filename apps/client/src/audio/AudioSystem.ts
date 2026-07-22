/**
 * AudioSystem — the client mixer. Plain WebAudio (NOT Babylon's Sound, and
 * NOT under render/): the graph is
 *
 *     ctx.destination ← master ← { bgmBus, sfxBus } ← per-voice gain ← source
 *
 * master carries master-volume + mute, the buses carry the BGM/SFX sliders,
 * and each voice carries its authored per-clip gain (which is also what the
 * crossfade curves ride on).
 *
 * Contracts:
 *   • ONE bed at a time — `playBgm(scene)` equal-power crossfades (~600 ms);
 *     asking for the scene already playing is a no-op (the loop never restarts).
 *   • `loop:true` beds use `AudioBufferSourceNode.loop` (sample-accurate; the
 *     files are loop-joined), `loop:false` beds are one-shot stings.
 *   • SFX are pooled through SfxGate — per-event cooldownMs + maxConcurrent, so
 *     a burst of `damage` events can never machine-gun the mixer.
 *   • Autoplay: buffers are fetched/decoded eagerly, but the context is only
 *     `resume()`d on the first pointer/key gesture; whatever scene is current
 *     at that moment starts then.
 *   • Nothing here throws outward. A 404, a decode failure, a missing map
 *     entry or a browser without WebAudio all degrade to silence — this class
 *     is called from event handlers that sit next to the frame loop.
 *
 * All non-trivial decisions live in ./audioSelect (pure, unit-tested); this
 * file is the imperative shell.
 */
import {
  CROSSFADE_MS,
  SfxGate,
  bgmTrackFor,
  clampPan,
  clampVolume,
  crossfadeCurves,
  needsSceneChange,
  pickSfxFile,
  sfxEntryFor,
  sfxVoiceMultiplier,
  type Rng,
} from "./audioSelect";
import { audioSettings, type AudioSettingsStore } from "./audioSettings";
import { EMPTY_AUDIO_MAP, audioMapFromDoc, type AudioMap, type AudioScene } from "./types";

/**
 * Slider→bus-gain smoothing. A drag emits an edit per `input` event (dozens a
 * second) and a raw `gain.value` write on each would zipper; ramping over
 * 25 ms removes that while staying far below the ~50 ms threshold at which a
 * level change stops being perceived as instantaneous.
 */
export const VOLUME_RAMP_MS = 25;

/** Default content mount (same one ContentDb fetches docs from). */
export const AUDIO_CONTENT_BASE = "/content/";
/** Path of the authored map, fetched directly so it works pre-reindex. */
export const AUDIO_MAP_PATH = "config/audio-map.json";

export interface AudioSystemOptions {
  /** content mount base, default "/content/" */
  baseUrl?: string;
  fetchFn?: (url: string) => Promise<Response>;
  /** injected for tests; returns null when WebAudio is unavailable */
  ctxFactory?: () => AudioContext | null;
  settings?: AudioSettingsStore;
  rng?: Rng;
  /** ms clock used for SFX cooldowns */
  now?: () => number;
  crossfadeMs?: number;
  /** decoded BGM buffers kept in memory (they are large: ~14 MB per 40 s) */
  maxBgmBuffers?: number;
  warn?: (msg: string, err?: unknown) => void;
}

interface Bed {
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** the bed's own peak gain (authored track gain) */
  peak: number;
  scene: string;
  file: string;
}

/** Per-call options for a one-off SFX (positioned / attenuated). */
export interface SfxPlayOptions {
  /** multiply the authored per-clip gain (default 1; clamped ≥ 0) */
  volume?: number;
  /** stereo pan -1 (left) … 0 (centre) … +1 (right); omitted = centred, no panner */
  pan?: number;
}

function defaultCtxFactory(): AudioContext | null {
  try {
    const g = globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

function defaultFetch(url: string): Promise<Response> {
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  return fetch(url);
}

export class AudioSystem {
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string) => Promise<Response>;
  private readonly ctxFactory: () => AudioContext | null;
  private readonly settings: AudioSettingsStore;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly crossfadeMs: number;
  private readonly maxBgmBuffers: number;
  private readonly warn: (msg: string, err?: unknown) => void;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ctxFailed = false;

  private map: AudioMap = EMPTY_AUDIO_MAP;
  /** path -> decoded buffer (null = known-bad: 404 / decode failure) */
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** load order of BGM files, for the small LRU that bounds memory */
  private readonly bgmLoadOrder: string[] = [];

  private readonly gate = new SfxGate();
  private bed: Bed | null = null;
  /** `now()` at which the current bed was started; null when nothing is playing */
  private bedStartMs: number | null = null;
  private currentScene: AudioScene | null = null;
  private pendingSting: AudioScene | null = null;
  private unlocked = false;
  private disposed = false;
  private detachGestures: (() => void) | null = null;
  private unsubSettings: (() => void) | null = null;
  private bootPromise: Promise<boolean> | null = null;

  constructor(opts: AudioSystemOptions = {}) {
    this.baseUrl = opts.baseUrl ?? AUDIO_CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    this.ctxFactory = opts.ctxFactory ?? defaultCtxFactory;
    this.settings = opts.settings ?? audioSettings;
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.crossfadeMs = opts.crossfadeMs ?? CROSSFADE_MS;
    this.maxBgmBuffers = Math.max(1, opts.maxBgmBuffers ?? 4);
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[audio] ${msg}`, err ?? ""));
    this.unsubSettings = this.settings.subscribe(() => this.applyVolumes());
  }

  // -------------------------------------------------------------------------
  // boot
  // -------------------------------------------------------------------------

  /**
   * Fetch the authored map, attach the first-gesture unlock listeners and warm
   * the SFX buffers. Single-flight + idempotent: safe from any/every boot path
   * (React StrictMode double-effects, HMR, a second screen mounting).
   */
  init(target?: EventTarget | null): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.attachUnlockGestures(target);
    if (!this.bootPromise) {
      this.bootPromise = this.loadMap().then((ok) => {
        if (ok) this.prefetchSfx();
        return ok;
      });
    }
    return this.bootPromise;
  }

  /** Fetch + install `config/audio-map.json`. Never throws; false = silence. */
  async loadMap(path: string = AUDIO_MAP_PATH): Promise<boolean> {
    try {
      const res = await this.fetchFn(this.urlFor(path));
      if (!res.ok) {
        this.warn(`audio map ${path} → HTTP ${res.status}; running silent`);
        return false;
      }
      const map = audioMapFromDoc(await res.json());
      if (!map) {
        this.warn(`audio map ${path} is not a config.audio-map@1 doc; running silent`);
        return false;
      }
      this.setMap(map);
      return true;
    } catch (err) {
      this.warn(`audio map ${path} failed to load; running silent`, err);
      return false;
    }
  }

  /** Install a map directly (tests / editor live-reload). */
  setMap(map: AudioMap): void {
    this.map = { bgm: map.bgm ?? {}, sfx: map.sfx ?? {} };
    // a map swap can change the current scene's file — restart the bed
    if (this.unlocked && this.currentScene) {
      const track = bgmTrackFor(this.map, this.currentScene);
      if (!track || track.file !== this.bed?.file) this.startScene(this.currentScene);
    }
  }

  /** Warm every SFX clip (they are short; BGM stays lazy — beds are huge). */
  prefetchSfx(): void {
    for (const entry of Object.values(this.map.sfx)) {
      for (const file of entry.files) void this.loadBuffer(file);
    }
  }

  // -------------------------------------------------------------------------
  // autoplay unlock
  // -------------------------------------------------------------------------

  /**
   * Browsers refuse to start audio before a user gesture. We listen once for
   * the first pointer/touch/key event, resume the context there, and start
   * whatever scene is current at that moment.
   */
  attachUnlockGestures(target?: EventTarget | null): void {
    if (this.detachGestures || this.disposed) return;
    const t = target ?? (typeof window !== "undefined" ? window : null);
    if (!t || typeof t.addEventListener !== "function") return;
    const events = ["pointerdown", "touchstart", "mousedown", "keydown"] as const;
    const onGesture = (): void => {
      this.unlock();
      detach();
    };
    const detach = (): void => {
      for (const e of events) {
        try {
          t.removeEventListener(e, onGesture, true);
        } catch {
          /* detached target */
        }
      }
      this.detachGestures = null;
    };
    for (const e of events) {
      try {
        t.addEventListener(e, onGesture, { capture: true, passive: true } as AddEventListenerOptions);
      } catch {
        /* unsupported target */
      }
    }
    this.detachGestures = detach;
  }

  /** Resume the context and start the current scene. Idempotent. */
  unlock(): void {
    if (this.disposed) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.unlocked = true;
    try {
      const p = ctx.resume?.();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    } catch {
      /* already running / not supported */
    }
    if (this.currentScene) this.startScene(this.currentScene);
    if (this.pendingSting) {
      const s = this.pendingSting;
      this.pendingSting = null;
      this.playSting(s);
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  get scene(): AudioScene | null {
    return this.currentScene;
  }

  /** Currently-playing bed file (diagnostics / tests). */
  get bedFile(): string | null {
    return this.bed?.file ?? null;
  }

  /**
   * `now()` at which the current bed started, or null when no bed is playing.
   * READ-ONLY seam for callers that must line an action up with the bed's own
   * timeline rather than with when a React effect happened to run — the login
   * theme rotation (audio/loginRotation) times its swap off this so the
   * crossfade lands on a whole loop of the file that is actually playing, which
   * is not knowable from the scene value or from mount time (the bed does not
   * start until the autoplay unlock gesture, which may be many seconds later).
   * Same clock as the SFX cooldowns, so it is injectable in tests.
   */
  get bedStartedAtMs(): number | null {
    return this.bed ? this.bedStartMs : null;
  }

  /** AudioContext lifecycle state ("suspended"/"running"/"closed") or null. */
  get contextState(): string | null {
    return this.ctx?.state ?? null;
  }

  // -------------------------------------------------------------------------
  // BGM
  // -------------------------------------------------------------------------

  /**
   * Switch the background bed. Re-asking for the current scene is a no-op;
   * `null` fades the bed out. Before the autoplay unlock this only records the
   * scene — `unlock()` starts it.
   */
  playBgm(scene: AudioScene | null): void {
    if (this.disposed) return;
    if (!needsSceneChange(this.currentScene, scene)) return;
    this.currentScene = scene;
    if (!this.unlocked) return;
    this.startScene(scene);
  }

  /** Alias that reads better at call sites reacting to app screens. */
  setScene(scene: AudioScene | null): void {
    this.playBgm(scene);
  }

  /**
   * Fire a one-shot sting (battleStart) on the BGM bus WITHOUT disturbing the
   * bed, so the caller can crossfade to `combat` underneath it.
   */
  playSting(scene: AudioScene = "battleStart"): void {
    if (this.disposed) return;
    const track = bgmTrackFor(this.map, scene);
    if (!track) return;
    if (!this.unlocked) {
      this.pendingSting = scene;
      return;
    }
    const ctx = this.ensureCtx();
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    void this.loadBuffer(track.file).then((buffer) => {
      if (!buffer || this.disposed) return;
      try {
        const gain = ctx.createGain();
        gain.gain.value = track.gain ?? 1;
        gain.connect(bus);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = false;
        src.connect(gain);
        src.onended = (): void => {
          this.safeDisconnect(src, gain);
        };
        src.start();
      } catch (err) {
        this.warn(`sting ${scene} failed`, err);
      }
    });
  }

  private startScene(scene: AudioScene | null): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bgmBus) return;
    const track = scene ? bgmTrackFor(this.map, scene) : null;
    if (!track) {
      // unmapped scene = authored silence
      this.stopBed();
      return;
    }
    if (this.bed && this.bed.file === track.file) return; // same file, keep playing
    void this.loadBuffer(track.file).then((buffer) => {
      if (this.disposed || this.currentScene !== scene) return; // scene raced ahead
      if (!buffer) return; // 404/decode failure: keep whatever is playing
      this.swapBed(buffer, track.gain ?? 1, track.loop, scene ?? "", track.file);
    });
  }

  private swapBed(
    buffer: AudioBuffer,
    peak: number,
    loop: boolean,
    scene: string,
    file: string,
  ): void {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const prev = this.bed;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(bus);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = loop;
      src.connect(gain);

      const curves = crossfadeCurves(prev?.peak ?? 0, peak);
      const durSec = this.crossfadeMs / 1000;
      this.rampCurve(gain.gain, curves.in, durSec);
      src.start();
      this.bed = { src, gain, peak, scene, file };
      this.bedStartMs = this.now();
      if (!loop) {
        src.onended = (): void => {
          if (this.bed?.src === src) {
            this.safeDisconnect(src, gain);
            this.bed = null;
            this.bedStartMs = null;
          }
        };
      }
      if (prev) this.fadeOutAndStop(prev, curves.out, durSec);
    } catch (err) {
      this.warn(`bgm ${scene} failed to start`, err);
    }
  }

  private stopBed(): void {
    const prev = this.bed;
    if (!prev) return;
    this.bed = null;
    this.bedStartMs = null;
    const curves = crossfadeCurves(prev.peak, 0);
    this.fadeOutAndStop(prev, curves.out, this.crossfadeMs / 1000);
  }

  private fadeOutAndStop(bed: Bed, curve: number[], durSec: number): void {
    this.rampCurve(bed.gain.gain, curve, durSec);
    const stop = (): void => {
      try {
        bed.src.stop();
      } catch {
        /* already stopped */
      }
      this.safeDisconnect(bed.src, bed.gain);
    };
    if (typeof setTimeout === "function") setTimeout(stop, this.crossfadeMs + 120);
    else stop();
  }

  /**
   * Apply a generated gain curve, falling back to a linear ramp (and finally a
   * hard set) if the browser rejects the automation (overlapping curves throw).
   */
  private rampCurve(param: AudioParam, curve: number[], durSec: number): void {
    const ctx = this.ctx;
    const last = curve[curve.length - 1] ?? 0;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    try {
      param.cancelScheduledValues(t0);
      param.setValueCurveAtTime(Float32Array.from(curve), t0, Math.max(0.01, durSec));
      return;
    } catch {
      /* fall through */
    }
    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(curve[0] ?? 0, t0);
      param.linearRampToValueAtTime(last, t0 + Math.max(0.01, durSec));
    } catch {
      try {
        param.value = last;
      } catch {
        /* nothing else to try */
      }
    }
  }

  // -------------------------------------------------------------------------
  // SFX
  // -------------------------------------------------------------------------

  /**
   * Trigger an event's SFX. Returns whether a voice was actually started
   * (false = unmapped event, cooldown/concurrency gated, still locked, or the
   * clip is unavailable). The gate is taken SYNCHRONOUSLY so a burst inside
   * one frame is throttled even though decoding is async.
   *
   * `opts.volume` multiplies the authored per-clip gain (a one-off attenuation,
   * e.g. a far dragon roar); `opts.pan` (-1..1) inserts a StereoPanner between
   * the voice and the SFX bus for a positioned one-shot. Both ride the same
   * sfxBus, so the SFX bus mute/volume still applies. Omitting `opts` keeps the
   * plain full-gain, centred behaviour every existing caller relies on.
   */
  playSfx(event: string, opts?: SfxPlayOptions): boolean {
    if (this.disposed || !this.unlocked) return false;
    const entry = sfxEntryFor(this.map, event);
    if (!entry) return false;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus;
    if (!ctx || !bus) return false;
    if (!this.gate.tryAcquire(event, entry, this.now())) return false;
    const file = pickSfxFile(entry, this.rng);
    if (!file) {
      this.gate.release(event);
      return false;
    }
    const volMul = sfxVoiceMultiplier(opts?.volume);
    const pan = opts?.pan;
    void this.loadBuffer(file).then((buffer) => {
      if (!buffer || this.disposed) {
        this.gate.release(event);
        return;
      }
      try {
        const gain = ctx.createGain();
        gain.gain.value = (entry.gain ?? 1) * volMul;
        const panner = this.makePanner(ctx, pan);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (panner) {
          gain.connect(panner);
          panner.connect(bus);
        } else {
          gain.connect(bus);
        }
        src.onended = (): void => {
          this.gate.release(event);
          this.safeDisconnect(src, gain);
          if (panner) {
            try {
              panner.disconnect();
            } catch {
              /* already gone */
            }
          }
        };
        src.start();
      } catch (err) {
        this.gate.release(event);
        this.warn(`sfx ${event} failed`, err);
      }
    });
    return true;
  }

  /**
   * Play ONE clip by content-relative path on the SFX bus — the seam for voice
   * layers (champion select quips) whose clip lists live OUTSIDE the audio map
   * (config/champion-voices.json, blizzard-local soundsets). Additive next to
   * `playSfx`: no SfxGate (the caller owns its own cooldowns), but the same
   * unlock gating, buffer cache/dedupe, per-call volume/pan, and SFX bus — so
   * the SFX slider and mute apply to these voices exactly like mapped SFX.
   * Returns whether a voice was started; degrades to silence, never throws.
   */
  playClip(path: string, opts?: SfxPlayOptions): boolean {
    if (this.disposed || !this.unlocked || !path) return false;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus;
    if (!ctx || !bus) return false;
    const volMul = sfxVoiceMultiplier(opts?.volume);
    const pan = opts?.pan;
    void this.loadBuffer(path).then((buffer) => {
      if (!buffer || this.disposed) return;
      try {
        const gain = ctx.createGain();
        gain.gain.value = volMul;
        const panner = this.makePanner(ctx, pan);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (panner) {
          gain.connect(panner);
          panner.connect(bus);
        } else {
          gain.connect(bus);
        }
        src.onended = (): void => {
          this.safeDisconnect(src, gain);
          if (panner) {
            try {
              panner.disconnect();
            } catch {
              /* already gone */
            }
          }
        };
        src.start();
      } catch (err) {
        this.warn(`clip ${path} failed`, err);
      }
    });
    return true;
  }

  /**
   * A StereoPanner for a positioned one-shot, or null when no pan was requested
   * or the context predates StereoPannerNode (old Safari) — the voice then
   * connects straight to the bus (centred), never breaking playback.
   */
  private makePanner(ctx: AudioContext, pan?: number): StereoPannerNode | null {
    if (pan === undefined) return null;
    const maker = (ctx as unknown as { createStereoPanner?: () => StereoPannerNode }).createStereoPanner;
    if (typeof maker !== "function") return null;
    try {
      const node = maker.call(ctx);
      node.pan.value = clampPan(pan);
      return node;
    } catch {
      return null;
    }
  }

  /** Voices in flight for an event (tests / diagnostics). */
  activeVoices(event: string): number {
    return this.gate.activeCount(event);
  }

  // -------------------------------------------------------------------------
  // volumes
  // -------------------------------------------------------------------------

  setVolume(bus: "master" | "bgm" | "sfx", v: number): void {
    this.settings.setVolume(bus, v); // → subscription → applyVolumes()
  }

  setMuted(muted: boolean): void {
    this.settings.setMuted(muted);
  }

  toggleMuted(): boolean {
    return this.settings.toggleMuted();
  }

  setBusMuted(bus: "bgm" | "sfx", muted: boolean): void {
    this.settings.setBusMuted(bus, muted);
  }

  toggleBusMuted(bus: "bgm" | "sfx"): boolean {
    return this.settings.toggleBusMuted(bus);
  }

  volumes(): ReturnType<AudioSettingsStore["get"]> {
    return this.settings.get();
  }

  /**
   * THE REAL-TIME SEAM. The gain a bus is applying RIGHT NOW — i.e. what the
   * currently-playing bed / in-flight voices are actually multiplied by. Null
   * before the graph exists (pre-unlock). Read by diagnostics and by the
   * live-slider tests, which sample it while a bed is playing to prove a
   * volume edit lands on the running track instead of only on the next one.
   */
  liveGain(bus: "master" | "bgm" | "sfx"): number | null {
    const node = bus === "master" ? this.master : bus === "bgm" ? this.bgmBus : this.sfxBus;
    if (!node) return null;
    try {
      return node.gain.value;
    } catch {
      return null;
    }
  }

  /**
   * Push the persisted mixer state onto the live gain nodes. Called from the
   * audioSettings subscription, so EVERY edit — including each `input` event of
   * a slider drag — reaches the running bed within one ramp. Nothing here
   * touches the bed's own source node: the level changes while the loop keeps
   * playing (a restart would be audible and would drop the loop phase).
   */
  private applyVolumes(): void {
    if (!this.master || !this.bgmBus || !this.sfxBus) return;
    const v = this.settings.get();
    // The three nodes multiply out to effectiveGain(v, bus, clipGain) — the
    // split just keeps per-clip gains independent of the user's sliders.
    this.rampBus(this.master.gain, v.muted ? 0 : clampVolume(v.master));
    // per-bus mute zeroes only its own bus, without touching the slider level
    this.rampBus(this.bgmBus.gain, v.bgmMuted ? 0 : clampVolume(v.bgm));
    this.rampBus(this.sfxBus.gain, v.sfxMuted ? 0 : clampVolume(v.sfx));
  }

  /**
   * Move a BUS gain to `target` over VOLUME_RAMP_MS. The ramp exists only to
   * kill the zipper/click a raw `.value` write produces when a drag pushes
   * dozens of edits per second — 25 ms is well under the ~50 ms at which a
   * level change stops reading as instant, so this stays a real-time apply.
   * Degrades to a hard set when the browser rejects the automation.
   */
  private rampBus(param: AudioParam, target: number): void {
    const ctx = this.ctx;
    if (ctx) {
      try {
        const t0 = ctx.currentTime;
        const from = param.value;
        param.cancelScheduledValues(t0);
        param.setValueAtTime(from, t0);
        param.linearRampToValueAtTime(target, t0 + VOLUME_RAMP_MS / 1000);
        return;
      } catch {
        /* fall through to the hard set */
      }
    }
    try {
      param.value = target;
    } catch (err) {
      this.warn("volume apply failed", err);
    }
  }

  // -------------------------------------------------------------------------
  // buffers
  // -------------------------------------------------------------------------

  /**
   * Fetch + decode a clip, with in-flight dedupe: two triggers of the same
   * file in the same frame share one request. A failure caches `null` so we
   * never re-request a 404 every time the event fires.
   */
  loadBuffer(path: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(path);
    if (cached) return cached;
    const p = this.fetchDecode(path);
    this.buffers.set(path, p);
    if (path.includes("/bgm/")) this.noteBgmLoad(path);
    return p;
  }

  private async fetchDecode(path: string): Promise<AudioBuffer | null> {
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    try {
      const res = await this.fetchFn(this.urlFor(path));
      if (!res.ok) {
        this.warn(`clip ${path} → HTTP ${res.status} (silent)`);
        return null;
      }
      const bytes = await res.arrayBuffer();
      return await this.decode(ctx, bytes);
    } catch (err) {
      this.warn(`clip ${path} failed to load (silent)`, err);
      return null;
    }
  }

  /** decodeAudioData in both its promise and legacy callback forms. */
  private decode(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    return new Promise<AudioBuffer | null>((resolve) => {
      let settled = false;
      const done = (b: AudioBuffer | null): void => {
        if (settled) return;
        settled = true;
        resolve(b);
      };
      try {
        const maybe = ctx.decodeAudioData(
          bytes,
          (b) => done(b),
          () => done(null),
        ) as unknown as Promise<AudioBuffer> | undefined;
        if (maybe && typeof maybe.then === "function") {
          maybe.then(done, () => done(null));
        }
      } catch {
        done(null);
      }
    });
  }

  /** Bound the decoded-BGM memory: beds are ~14 MB per 40 s of stereo. */
  private noteBgmLoad(path: string): void {
    const at = this.bgmLoadOrder.indexOf(path);
    if (at >= 0) this.bgmLoadOrder.splice(at, 1);
    this.bgmLoadOrder.push(path);
    while (this.bgmLoadOrder.length > this.maxBgmBuffers) {
      const oldest = this.bgmLoadOrder.shift();
      if (!oldest || oldest === this.bed?.file) continue;
      this.buffers.delete(oldest);
    }
  }

  private urlFor(path: string): string {
    return this.baseUrl.endsWith("/") ? this.baseUrl + path : `${this.baseUrl}/${path}`;
  }

  // -------------------------------------------------------------------------
  // graph / teardown
  // -------------------------------------------------------------------------

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.ctxFailed || this.disposed) return null;
    let ctx: AudioContext | null = null;
    try {
      ctx = this.ctxFactory();
    } catch (err) {
      this.warn("AudioContext unavailable; running silent", err);
      ctx = null;
    }
    if (!ctx) {
      this.ctxFailed = true;
      return null;
    }
    try {
      const master = ctx.createGain();
      const bgm = ctx.createGain();
      const sfx = ctx.createGain();
      master.connect(ctx.destination);
      bgm.connect(master);
      sfx.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.bgmBus = bgm;
      this.sfxBus = sfx;
      this.applyVolumes();
      return ctx;
    } catch (err) {
      this.warn("audio graph failed; running silent", err);
      this.ctxFailed = true;
      this.ctx = null;
      return null;
    }
  }

  private safeDisconnect(src: AudioNode, gain: AudioNode): void {
    try {
      src.disconnect();
    } catch {
      /* already gone */
    }
    try {
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  /** Stop everything, drop the graph and the caches. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachGestures?.();
    this.detachGestures = null;
    this.unsubSettings?.();
    this.unsubSettings = null;
    const bed = this.bed;
    this.bed = null;
    this.bedStartMs = null;
    if (bed) {
      try {
        bed.src.stop();
      } catch {
        /* already stopped */
      }
      this.safeDisconnect(bed.src, bed.gain);
    }
    this.gate.reset();
    this.buffers.clear();
    this.bgmLoadOrder.length = 0;
    this.currentScene = null;
    this.unlocked = false;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.bgmBus = null;
    this.sfxBus = null;
    try {
      const p = ctx?.close?.();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    } catch {
      /* context already closed */
    }
  }
}

/**
 * Process-wide mixer. Constructing it is side-effect free (no AudioContext is
 * created until the first sound or the unlock gesture), so importing this
 * module from anywhere — including tests — is safe.
 */
export const audioSystem = new AudioSystem();
