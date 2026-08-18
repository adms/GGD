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
import { BgmRotationStore, ACTIVE_BGM_VARIANTS, type BgmVariantMap } from "./bgmVariants";
import { loopResumeOffsetSec } from "./scene";
import { SFX_CORE, SFX_LOOPABLE, isLoopableSfx, sfxEventsForScene } from "./sfxManifest";
import {
  DEFAULT_SFX_PRELOAD_POLICY,
  SFX_PRELOAD_POLICY_PATH,
  clampSfxPreloadPolicy,
  scenesToWarm,
  sfxPreloadPolicyFromDoc,
  type SfxPreloadPolicy,
} from "./sfxPreloadPolicy";
import { EMPTY_AUDIO_MAP, audioMapFromDoc, type AudioMap, type AudioScene } from "./types";
import { withContentVersion } from "../content/assetVersion";

/**
 * Slider→bus-gain smoothing. A drag emits an edit per `input` event (dozens a
 * second) and a raw `gain.value` write on each would zipper; ramping over
 * 25 ms removes that while staying far below the ~50 ms threshold at which a
 * level change stops being perceived as instantaneous.
 */
export const VOLUME_RAMP_MS = 25;

/**
 * How many spare panners / low-pass filters the spatial insert pool keeps.
 *
 * Σ maxConcurrent over the combat keys in `content/config/audio-map.json` is
 * 115, but a real frame never approaches that (the per-key cooldowns bound it
 * long before the caps do), and every voice that IS in flight is holding its
 * nodes rather than sitting in the pool. 24 is comfortably above the steady
 * state of a twelve-body fight and is a floor on memory, not a limit on
 * playback: past the cap a returned node is simply dropped for the GC.
 */
export const SPATIAL_POOL_MAX = 24;

/** Default content mount (same one ContentDb fetches docs from). */
export const AUDIO_CONTENT_BASE = "/content/";
/** Path of the authored map, fetched directly so it works pre-reindex. */
export const AUDIO_MAP_PATH = "config/audio-map.json";

/**
 * TEST-MODE SILENCE GATE (task #62). Background agents, CI runs and headless
 * screenshot captures must never make sound on the user's machine. This is read
 * ONCE at construction — by both the AudioSystem (which then hands back a null
 * AudioContext, so the whole WebAudio graph is never built and every `play*`
 * short-circuits) and the out-of-graph name-VO layer (whose `new Audio()`
 * element is never created) — from, in precedence order:
 *
 *   1. `import.meta.env.VITE_GGD_SILENT` — a build/.env flag (Vite)
 *   2. `window.__GGD_SILENT__`           — a runtime global set before boot
 *   3. a `?silent=` URL query            — an opt-in on the page URL
 *
 * Any truthy source forces silence; absent / `0` / `false` / `off` / `no` leave
 * audio fully enabled. `window` IS `globalThis` in the browser, so a node/vitest
 * process flips the same switch with `globalThis.__GGD_SILENT__ = true`.
 */
export function shouldSilenceAudio(): boolean {
  // 1) Vite env flag. `import.meta.env` can be absent in a bare node process, so
  //    guard the access — a throw here must never take the mixer down.
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    if (env && isSilentFlag(env.VITE_GGD_SILENT)) return true;
  } catch {
    /* import.meta.env unavailable */
  }
  const g = globalThis as unknown as {
    __GGD_SILENT__?: unknown;
    location?: { search?: unknown };
  };
  // 2) runtime global (window === globalThis in the browser)
  if (isSilentFlag(g.__GGD_SILENT__)) return true;
  // 3) ?silent= query opt-in (a bare `?silent` counts; `?silent=0` does not)
  const search = typeof g.location?.search === "string" ? g.location.search : "";
  if (search) {
    try {
      const params = new URLSearchParams(search);
      if (params.has("silent")) {
        const raw = params.get("silent");
        if (raw === null || raw === "" || isSilentFlag(raw)) return true;
      }
    } catch {
      /* malformed search string */
    }
  }
  return false;
}

/** Read a silence flag from any source: truthy AND not an explicit "off". */
function isSilentFlag(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) && v !== 0;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "off" && s !== "no";
}

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
  /**
   * Force test-mode silence (task #62). When omitted the gate is read from the
   * environment via `shouldSilenceAudio()`; pass `true`/`false` to override
   * (tests, or an explicit host decision). Silent ⇒ the AudioContext factory
   * returns null, so the graph is never built and every play() no-ops.
   */
  silent?: boolean;
  /**
   * Samantha-James rotating-BGM variants (task #137): scene → variant content
   * path. On each scene ENTRY the bed alternates original → variant → …. Omitted
   * (or `{}`) ⇒ no rotation: every scene always plays its authored `file`, which
   * is the behaviour every existing caller and test relies on. The process-wide
   * `audioSystem` singleton wires `ACTIVE_BGM_VARIANTS` — currently `{}` (owner
   * 2026-07-25 disabled the Samantha variants; flip it back to `SAMANTHA_VARIANTS`
   * in bgmVariants.ts to re-enable).
   */
  bgmVariants?: BgmVariantMap;
}

interface Bed {
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** the bed's own peak gain (authored track gain) */
  peak: number;
  scene: string;
  file: string;
  /** whether this bed loops — only looping beds accrue per-scene resume time */
  loop: boolean;
}

/**
 * A NON-LOOPING bed that reached its own NATURAL end: the file played all the
 * way through while it was still the live bed. Deliberately NOT emitted when the
 * bed was crossfaded away, replaced by another scene, stopped early, or torn
 * down by `dispose()` — in every one of those cases `onended` still fires on the
 * source node, but the bed is no longer ours, so "the track finished" would be a
 * lie. The guard is identity: the node that ended must still BE `this.bed.src`.
 *
 * WHY THIS EXISTS. The victory/defeat stings are one-shots, and a caller that
 * wants to do something when one of them is over (task #134/#93: hand the bed to
 * the serene `menuNocturne` once the win sting has played itself out) would
 * otherwise have to hardcode the clip's length. It is not a constant: `victory`
 * is 18.34 s but the task-#137 rotation alternates it with a 14.52 s Samantha
 * variant, and `tools/bgm-gen` can re-render either at any time. The system is
 * the only thing that knows which file actually played and how long it was, so
 * it is the thing that says when it ended.
 */
export interface BedEndedEvent {
  /** the scene whose bed just finished (e.g. "victory") */
  scene: string;
  /** the file that ACTUALLY played — original or Samantha variant (task #137) */
  file: string;
  /** that buffer's decoded length in seconds (informational; never hardcode it) */
  durationSec: number;
}

/** Per-call options for a one-off SFX (positioned / attenuated). */
export interface SfxPlayOptions {
  /** multiply the authored per-clip gain (default 1; clamped ≥ 0) */
  volume?: number;
  /** stereo pan -1 (left) … 0 (centre) … +1 (right); omitted = centred, no panner */
  pan?: number;
  /**
   * Low-pass cutoff in Hz for the 前後 (screen depth) cue — omitted or ≥ Nyquist
   * means NO filter node at all. See `audio/spatial.depthTilt` for why depth is
   * a timbre axis here rather than an HRTF elevation angle: the combat camera is
   * pinned at 68° with yaw ≡ 0, so nothing in the arena is ever behind the
   * listener and HRTF's distinguishing cue never engages.
   */
  lowpassHz?: number;
  /**
   * Which SfxGate budget this voice competes in. Defaults to the event name, so
   * every pre-existing caller is byte-identical. The CLIP still comes from the
   * event's own map entry — only the rate limiting is re-keyed.
   *
   * It exists because the gate's cooldown is CROSS-FRAME and keyed on the event
   * string alone, so a newly-added source of a key silently starves the old one:
   * eleven remote footstep feeders cut the local player's own steps to 21 %
   * (measured; see `audio/spatial.gateKeyFor`). A caller that adds a new
   * population to an existing key gives that population its own band instead of
   * taking the incumbent's slots.
   */
  gateKey?: string;
  /**
   * Fired exactly once when this clip's playback is DONE — the natural end
   * (`src.onended`), a load/decode failure (404, undecodable buffer), or a
   * throw while wiring the graph. It NEVER fires for a call `playClip` refused
   * synchronously (locked/muted/disposed → returns false without scheduling),
   * so the caller can pair `if (playClip(...)) …` with an onEnded that only
   * runs for calls that were actually taken.
   *
   * WHY: the contextual-voice de-dup (`activeClips`) needs a caller-visible
   * "this clip is no longer sounding" signal to clear its in-flight entry —
   * without one, a clip self-mutes permanently after its first play. Every
   * terminal path calls it so an entry can never leak on a 404/decode-fail.
   */
  onEnded?: () => void;
}

/**
 * The per-voice spatial insert: `voiceGain → [panner] → [lowpass] → sfxBus`.
 *
 * `head` is what the voice gain connects TO and `tail` is what connects to the
 * BUS — never around it, so the SFX slider and both mutes keep applying exactly
 * as before. Returns null when the call asked for nothing spatial (the plain,
 * centred, full-gain path every pre-existing caller relies on) or when the
 * context predates the node types (old Safari), in which case the voice wires
 * straight to the bus — degraded to centred, NEVER to silence.
 */
interface SpatialChain {
  head: AudioNode;
  tail: AudioNode;
  /** disconnect every node in the chain; idempotent, never throws. */
  dispose(): void;
}

/**
 * A LIVE sustained-SFX voice (task #216) — one entry per playing clip whose
 * event is flagged in `sfxManifest.SFX_LOOPABLE` (the ambience/bed keys, e.g.
 * `fireRingLoop`, `arenaAmbience`). Held only so combat teardown can fade it
 * out; transients are never tracked. `stopping` makes a second stop request a
 * no-op rather than a second gain ramp on the same node (overlapping automation
 * throws in some browsers).
 */
interface SustainedVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  stopping: boolean;
}

/** Fade applied when a sustained SFX bed is stopped (ms). */
const SFX_FADE_OUT_MS = 320;

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
  /** test-mode silence gate (task #62): read once at construction, never sound */
  private readonly silent: boolean;

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
  /**
   * Live sustained SFX voices per event (task #216) — see {@link SustainedVoice}.
   * Only `SFX_LOOPABLE` events land here, so a teamfight's hundreds of
   * transients still allocate nothing.
   */
  private readonly sustainedVoices = new Map<string, Set<SustainedVoice>>();
  /**
   * Per-event stop epoch. Bumped by `stopSfx`, captured by `playSfx` before its
   * async decode: a bed whose clip was still decoding when combat ended is
   * cancelled instead of starting into the shop.
   */
  private readonly sustainedEpoch = new Map<string, number>();
  /** Per-scene original↔Samantha rotation (task #137). Empty ⇒ never rotates. */
  private readonly rotation: BgmRotationStore;
  /** The rotation-chosen file for the CURRENT scene (resolved once on entry). */
  private currentBgmFile: string | null = null;
  private bed: Bed | null = null;
  /** `now()` at which the current bed was started; null when nothing is playing */
  private bedStartMs: number | null = null;
  /**
   * Per-scene ACCUMULATED looping-bed playback (ms), for the phase-continuous
   * resume (task #109). Each time a looping bed is swapped out its just-played
   * span is folded in here, so re-entering that scene restarts the source at
   * `(elapsed mod duration)` instead of snapping back to bar 0 every round.
   */
  private readonly sceneElapsedMs = new Map<string, number>();
  private currentScene: AudioScene | null = null;
  /** subscribers to "a non-looping bed played itself out" — see BedEndedEvent */
  private readonly bedEndListeners = new Set<(ev: BedEndedEvent) => void>();
  private pendingSting: AudioScene | null = null;
  private unlocked = false;
  private disposed = false;
  private detachGestures: (() => void) | null = null;
  private unsubSettings: (() => void) | null = null;
  private bootPromise: Promise<boolean> | null = null;
  /**
   * SFX preload policy (task #63) — whether to warm ahead at all and how many
   * scenes deep. Starts on the shipped defaults so the very first warm is
   * correct even if the live doc is slow, missing or malformed, and is replaced
   * once `loadPreloadPolicy` resolves.
   */
  private preloadPolicy: SfxPreloadPolicy = DEFAULT_SFX_PRELOAD_POLICY;
  private preloadPolicyPromise: Promise<SfxPreloadPolicy> | null = null;

  constructor(opts: AudioSystemOptions = {}) {
    this.baseUrl = opts.baseUrl ?? AUDIO_CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    // task #62: force-silence wins over any injected factory — a silent mixer
    // hands back a null context, so the graph is never built and nothing sounds.
    this.silent = opts.silent ?? shouldSilenceAudio();
    this.ctxFactory = this.silent ? () => null : (opts.ctxFactory ?? defaultCtxFactory);
    this.settings = opts.settings ?? audioSettings;
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.crossfadeMs = opts.crossfadeMs ?? CROSSFADE_MS;
    this.maxBgmBuffers = Math.max(1, opts.maxBgmBuffers ?? 4);
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[audio] ${msg}`, err ?? ""));
    this.rotation = new BgmRotationStore(opts.bgmVariants ?? {});
    this.unsubSettings = this.settings.subscribe(() => this.applyVolumes());
  }

  // -------------------------------------------------------------------------
  // boot
  // -------------------------------------------------------------------------

  /**
   * Fetch the authored map and attach the first-gesture unlock listeners.
   * Single-flight + idempotent: safe from any/every boot path (React StrictMode
   * double-effects, HMR, a second screen mounting).
   *
   * NOTE (task #63): boot no longer fetches ANY SFX. The always-on UI core is
   * warmed on the autoplay unlock and every other cue loads per scene (see
   * `preloadSceneSfx`), so a player on the login screen never pays for the combat
   * / shop / settlement SFX set. Nothing needs a buffer before the unlock anyway
   * — `playSfx` no-ops while locked — so deferring the fetch to the unlock gesture
   * (which also creates the AudioContext) costs nothing and keeps boot lean.
   */
  init(target?: EventTarget | null): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.attachUnlockGestures(target);
    if (!this.bootPromise) {
      // The preload POLICY is fetched alongside the map (a ~1 KB JSON) rather
      // than awaited with it: the shipped defaults are already correct, so the
      // first warm never has to wait on it, and a 404 simply keeps them.
      void this.loadPreloadPolicy();
      this.bootPromise = this.loadMap();
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

  /**
   * 唯讀:載入的那一份 SFX 表。
   *
   * ⭐ 存在的理由只有一個 —— GH#390 的特效音要問「**這個 build 供不供應這個
   * clip 的檔案**」(overlay 專用的 `wc3.*` 在正式站上是 404)。那是一個關於
   * **路徑**的問題,只有這份表答得出來;抄一份 key 名單就是第二個住處,而它一定
   * 會過期。⛔ 它不是播放路徑:播放一律走 `playSfx`,才吃得到玩家的音量設定。
   */
  get sfxMap(): AudioMap {
    return this.map;
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

  /**
   * Warm EVERY SFX clip. This is the old eager path (task #63 unwired it from
   * boot); kept as an explicit escape hatch for a caller that truly wants the
   * whole set warm up front. The normal path is `prefetchCoreSfx` +
   * `preloadSceneSfx`. Creates the AudioContext if none exists yet.
   */
  prefetchSfx(): void {
    for (const entry of Object.values(this.map.sfx)) {
      for (const file of entry.files) void this.loadBuffer(file);
    }
  }

  /**
   * Warm ONLY the always-on UI core (click/hover/type — the cues every screen
   * shares). Called on the unlock gesture; the rest of the SFX load per scene.
   * Honours the `enabled` switch: preloading OFF means nothing is fetched up
   * front at all, not "everything except the core".
   */
  prefetchCoreSfx(): void {
    if (!this.preloadPolicy.enabled) return;
    this.warmSfxEvents(SFX_CORE);
  }

  /**
   * Warm the SFX a scene uses AND — `lookahead` hops deep — the SFX of the
   * scenes that can follow it (task #63). Deduped by the buffer cache, so
   * re-entering a scene, or a lookahead that already warmed the set, re-fetches
   * nothing.
   *
   * The lookahead is the half that makes the manifest actually audible in time:
   * warming combat's 56 files / 2.7 MB AT the combat edge starts the fetch on
   * the same beat as `roundStart`, so the first swing of the round can still
   * hit a cold buffer. With the shipped `lookahead: 1` that bucket is warmed on
   * the INTERMISSION edge instead — the shop window — while the login screen
   * still reaches nothing heavier than `lobby` (combat is three hops away).
   *
   * `scenesToWarm` returns the CURRENT scene first, and the fetches are issued
   * in that order, so on a slow link the scene the player is in is never queued
   * behind one they might enter next.
   *
   * A NO-OP until the AudioContext exists (pre-unlock): the unlock gesture warms
   * whatever scene is current, and every later scene change warms itself here.
   * Never a gate — anything the manifest omits still lazy-loads via `playSfx`.
   */
  preloadSceneSfx(scene: AudioScene | null): void {
    if (!scene) return;
    for (const s of scenesToWarm(scene, this.preloadPolicy)) {
      this.warmSfxEvents(sfxEventsForScene(s));
    }
  }

  /** The live SFX preload policy (diagnostics / tests / settings UI). */
  get sfxPreloadPolicy(): SfxPreloadPolicy {
    return this.preloadPolicy;
  }

  /**
   * Install a preload policy directly (settings UI / editor live-reload /
   * tests). Clamped, so an out-of-range `lookahead` can never turn the login
   * screen back into the whole-catalogue fetch this task removed.
   */
  setPreloadPolicy(policy: unknown): SfxPreloadPolicy {
    this.preloadPolicy = clampSfxPreloadPolicy(policy);
    return this.preloadPolicy;
  }

  /**
   * Fetch the live-editable policy doc (`content/audio-manifests/sfx-preload.json`).
   * Single-flight and never throws: a missing / malformed / 404 doc keeps the
   * shipped defaults, because a broken preload policy must degrade to "loads
   * like before", never to silence.
   */
  loadPreloadPolicy(path: string = SFX_PRELOAD_POLICY_PATH): Promise<SfxPreloadPolicy> {
    if (!this.preloadPolicyPromise) {
      this.preloadPolicyPromise = (async () => {
        try {
          const res = await this.fetchFn(this.urlFor(path));
          if (!res.ok) return this.preloadPolicy;
          const parsed = sfxPreloadPolicyFromDoc(await res.json());
          if (parsed) this.preloadPolicy = parsed;
          return this.preloadPolicy;
        } catch (err) {
          this.warn(`sfx preload policy ${path} failed to load; using defaults`, err);
          return this.preloadPolicy;
        }
      })();
    }
    return this.preloadPolicyPromise;
  }

  /**
   * Fetch+decode the clips of a set of events into the buffer cache. Deliberately
   * will NOT create the AudioContext: preloading must never bring the graph up
   * before the autoplay unlock (the "no context before a gesture" contract).
   */
  private warmSfxEvents(events: Iterable<string>): void {
    if (!this.ctx) return; // no graph yet — unlock will warm the current scene
    for (const event of events) {
      const entry = sfxEntryFor(this.map, event);
      if (!entry) continue;
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
    // task #63: warm the always-on UI core + whatever scene we're already on,
    // now that a graph exists. Everything else loads on future scene changes.
    this.prefetchCoreSfx();
    this.preloadSceneSfx(this.currentScene);
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

  /** True when the test-mode silence gate is active (task #62): no ctx, no sound. */
  get isSilenced(): boolean {
    return this.silent;
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
    // task #137: choose this scene's bed (original ↔ Samantha variant) ONCE, on
    // entry, so unlock() and any live map reload reuse the same choice and the
    // rotation advances exactly once per scene entry.
    this.currentBgmFile = this.chooseBgmFile(scene);
    // task #63: warm this scene's SFX subset on entry. A no-op until unlock (no
    // graph yet); the unlock gesture then warms whatever scene is current.
    this.preloadSceneSfx(scene);
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

  /**
   * Resolve which file a scene entry plays (original ↔ Samantha variant, task
   * #137) and ADVANCE the rotation. Null when the scene is unmapped. Called once
   * per scene entry from `playBgm`; `startScene` reuses the stored choice.
   */
  private chooseBgmFile(scene: AudioScene | null): string | null {
    if (!scene) return null;
    const track = bgmTrackFor(this.map, scene);
    return track ? this.rotation.next(scene, track.file) : null;
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
    // The rotation choice is normally made in playBgm; resolve it here if the map
    // was not loaded then (the first bed can be installed by setMap after the
    // unlock) — choosing now still advances the rotation exactly once per entry.
    let file = this.currentBgmFile;
    if (!file) {
      file = this.chooseBgmFile(scene);
      this.currentBgmFile = file;
    }
    if (!file) {
      this.stopBed();
      return;
    }
    const chosen: string = file;
    if (this.bed && this.bed.file === chosen) return; // same file, keep playing
    void this.loadBuffer(chosen).then((buffer) => {
      if (this.disposed || this.currentScene !== scene) return; // scene raced ahead
      if (!buffer) return; // 404/decode failure: keep whatever is playing
      this.swapBed(buffer, track.gain ?? 1, track.loop, scene ?? "", chosen);
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
    // Fold the outgoing looping bed's just-played span into its per-scene total
    // BEFORE the anchor moves, so a later return to that scene resumes in phase.
    this.accumulateBedElapsed(prev);
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
      // task #109: a looping bed re-entering a scene it has already played starts
      // at (elapsed mod duration) so its extended B-section keeps advancing across
      // rounds; a first visit or a one-shot sting resolves to 0 (play from bar 0).
      const offsetSec = loop
        ? loopResumeOffsetSec(this.sceneElapsedMs.get(scene) ?? 0, buffer.duration)
        : 0;
      src.start(ctx.currentTime, offsetSec);
      this.bed = { src, gain, peak, scene, file, loop };
      this.bedStartMs = this.now();
      if (!loop) {
        src.onended = (): void => {
          // IDENTITY GUARD. `onended` also fires for a bed that was crossfaded
          // away, replaced, stopped early or disposed — every one of those paths
          // reassigns/clears `this.bed` FIRST, so a node that is no longer the
          // live bed is not a natural end and must neither clean up here nor
          // notify. Only the clip finishing on its own reaches this branch.
          if (this.bed?.src !== src) return;
          this.safeDisconnect(src, gain);
          this.bed = null;
          this.bedStartMs = null;
          // Emitted AFTER the bed state is cleared, so a listener that reacts by
          // asking for another bed (the whole point) sees a settled system.
          this.emitBedEnded({ scene, file, durationSec: buffer.duration });
        };
      }
      if (prev) this.fadeOutAndStop(prev, curves.out, durSec);
    } catch (err) {
      this.warn(`bgm ${scene} failed to start`, err);
    }
  }

  /**
   * Subscribe to "a NON-LOOPING bed just played itself all the way out"; returns
   * an unsubscriber. See {@link BedEndedEvent} for the exact (deliberately
   * narrow) meaning — a crossfade, a replacement, an early stop and `dispose()`
   * all stay silent. Framework-free, same pub/sub shape as `audioSettings` and
   * `bgmOverride`; `ui/useAudio`'s `useBedEnded` is the React adapter.
   */
  onBedEnded(cb: (ev: BedEndedEvent) => void): () => void {
    this.bedEndListeners.add(cb);
    return () => {
      this.bedEndListeners.delete(cb);
    };
  }

  /** Fan out a natural end; one throwing listener never stops the others. */
  private emitBedEnded(ev: BedEndedEvent): void {
    for (const cb of [...this.bedEndListeners]) {
      try {
        cb(ev);
      } catch (err) {
        this.warn(`bed-end listener threw for ${ev.scene}`, err);
      }
    }
  }

  private stopBed(): void {
    const prev = this.bed;
    if (!prev) return;
    // authored silence still advances the scene's clock, so re-entering it later
    // resumes in phase rather than at bar 0 (task #109).
    this.accumulateBedElapsed(prev);
    this.bed = null;
    this.bedStartMs = null;
    const curves = crossfadeCurves(prev.peak, 0);
    this.fadeOutAndStop(prev, curves.out, this.crossfadeMs / 1000);
  }

  /**
   * Add a just-ended LOOPING bed's played span to its per-scene total (task
   * #109). No-op for a one-shot bed or when nothing is playing. Reads the CURRENT
   * `bedStartMs` anchor, so it MUST run before that anchor is reassigned/cleared.
   */
  private accumulateBedElapsed(bed: Bed | null): void {
    if (!bed || !bed.loop || this.bedStartMs === null) return;
    const played = this.now() - this.bedStartMs;
    if (played <= 0) return;
    const prior = this.sceneElapsedMs.get(bed.scene) ?? 0;
    this.sceneElapsedMs.set(bed.scene, prior + played);
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
   *
   * SUSTAINED KEYS (task #216). An event in `SFX_LOOPABLE` is an AMBIENCE BED,
   * not a transient: `fireRingLoop` is ~60 s of burning fire fired once at
   * ignition, `arenaAmbience` ~38 s of room fired once at round start. Those
   * voices are remembered here so `stopSfx` / `stopSustainedSfx` can fade them
   * out when combat ends — before this, `playSfx` was strictly fire-and-forget
   * and the client had NO way to stop a started SFX at all, which is why the
   * fire ring kept roaring over the shop. Transients are untracked (a one-frame
   * Map write per bed, none per hit).
   */
  playSfx(event: string, opts?: SfxPlayOptions): boolean {
    if (this.disposed || !this.unlocked) return false;
    const entry = sfxEntryFor(this.map, event);
    if (!entry) return false;
    const ctx = this.ensureCtx();
    const bus = this.sfxBus;
    if (!ctx || !bus) return false;
    // The gate is keyed by BAND, not by event: see SfxPlayOptions.gateKey. The
    // clip, its gain and its cooldown/cap numbers all still come from `entry`
    // (the event's own map row) — only WHICH tally they are counted against
    // moves, and only for a caller that asks.
    const gateKey = opts?.gateKey ?? event;
    if (!this.gate.tryAcquire(gateKey, entry, this.now())) return false;
    const file = pickSfxFile(entry, this.rng);
    if (!file) {
      this.gate.release(gateKey);
      return false;
    }
    const volMul = sfxVoiceMultiplier(opts?.volume);
    const pan = opts?.pan;
    const lowpassHz = opts?.lowpassHz;
    // Sustained bed bookkeeping (#216). The epoch is captured BEFORE the async
    // decode: a stop requested while this clip is still decoding must cancel the
    // start rather than let a bed begin after combat ended.
    const sustained = isLoopableSfx(event);
    const epoch = sustained ? (this.sustainedEpoch.get(event) ?? 0) : 0;
    void this.loadBuffer(file).then((buffer) => {
      if (!buffer || this.disposed) {
        this.gate.release(gateKey);
        return;
      }
      if (sustained && epoch !== (this.sustainedEpoch.get(event) ?? 0)) {
        this.gate.release(gateKey); // stopped mid-decode — never start it
        return;
      }
      let gain: GainNode | null = null;
      let chain: SpatialChain | null = null;
      let voice: SustainedVoice | null = null;
      try {
        gain = ctx.createGain();
        gain.gain.value = (entry.gain ?? 1) * volMul;
        chain = this.makeSpatialChain(ctx, pan, lowpassHz);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (chain) {
          gain.connect(chain.head);
          chain.tail.connect(bus);
        } else {
          gain.connect(bus);
        }
        const g = gain;
        const c = chain;
        voice = sustained ? { src, gain: g, stopping: false } : null;
        if (voice) {
          let live = this.sustainedVoices.get(event);
          if (!live) {
            live = new Set<SustainedVoice>();
            this.sustainedVoices.set(event, live);
          }
          live.add(voice);
        }
        const v = voice;
        src.onended = (): void => {
          this.gate.release(gateKey);
          this.safeDisconnect(src, g);
          c?.dispose();
          if (v) this.sustainedVoices.get(event)?.delete(v);
        };
        src.start();
      } catch (err) {
        this.gate.release(gateKey);
        // a tracked voice that never started must not linger in the registry
        if (voice) this.sustainedVoices.get(event)?.delete(voice);
        // TEARDOWN ON THE THROW PATH. If the wiring above succeeded and only
        // `src.start()` threw, the gain and the spatial nodes are already
        // edge-connected to the SFX bus and `onended` will never fire. Leaving
        // them attached was survivable when a voice was one GainNode; it is not
        // something to keep doing now that every positioned one-shot can carry a
        // panner and a filter too.
        if (gain) {
          try {
            gain.disconnect();
          } catch {
            /* already gone */
          }
        }
        chain?.dispose();
        this.warn(`sfx ${event} failed`, err);
      }
    });
    return true;
  }

  /**
   * STOP a sustained SFX bed (task #216). Fades the live voices of `event` out
   * over {@link SFX_FADE_OUT_MS} and stops them; also cancels a voice of the
   * same event that is still decoding, so a bed cannot start after the moment
   * it was told to stop. Returns how many playing voices it stopped.
   *
   * Only `SFX_LOOPABLE` events are tracked, so this is a no-op for transients —
   * an unmapped or already-finished key costs one Map lookup and returns 0.
   * Deliberately narrow: BGM has `stopBed`/scene changes, and one-shots are
   * meant to be fire-and-forget. The ONE thing missing before this was a way to
   * end an ambience bed on a phase edge, which is why the ~60 s fire-ring loop
   * kept burning audibly through 結算 and the shop.
   */
  stopSfx(event: string): number {
    // Bump the epoch even when nothing is live: it is what cancels an in-flight
    // decode of this same event.
    this.sustainedEpoch.set(event, (this.sustainedEpoch.get(event) ?? 0) + 1);
    const live = this.sustainedVoices.get(event);
    if (!live || live.size === 0) return 0;
    let stopped = 0;
    for (const voice of [...live]) {
      if (voice.stopping) continue;
      voice.stopping = true;
      stopped++;
      const fadeSec = SFX_FADE_OUT_MS / 1000;
      try {
        const ctx = this.ctx;
        const t0 = ctx ? ctx.currentTime : 0;
        voice.gain.gain.cancelScheduledValues(t0);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t0);
        voice.gain.gain.linearRampToValueAtTime(0, t0 + fadeSec);
      } catch {
        /* automation unsupported/rejected — the hard stop below still lands */
      }
      const hardStop = (): void => {
        try {
          voice.src.stop();
        } catch {
          /* already stopped — `onended` does the disconnect + bookkeeping */
        }
      };
      if (typeof setTimeout === "function") setTimeout(hardStop, SFX_FADE_OUT_MS + 40);
      else hardStop();
    }
    return stopped;
  }

  /**
   * Stop EVERY sustained SFX bed (task #216) — the combat-exit teardown. Called
   * on the combat→resolution/intermission phase edge so no fight ambience
   * (fire ring, arena room tone) survives into the shop. Returns the number of
   * voices stopped.
   */
  stopSustainedSfx(): number {
    let stopped = 0;
    // EVERY loopable key, not just the ones with a live voice: a bed whose clip
    // is still decoding has no voice yet, and bumping its epoch is exactly what
    // stops it from starting a moment later, over the shop.
    const keys = new Set<string>([...SFX_LOOPABLE, ...this.sustainedVoices.keys()]);
    for (const event of keys) stopped += this.stopSfx(event);
    return stopped;
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
    const lowpassHz = opts?.lowpassHz;
    // Fire the caller's onEnded EXACTLY once across every terminal path (natural
    // end, load/decode fail, wiring throw). `playClip` already returned true, so
    // the caller has committed its in-flight state and needs the release signal
    // even when the buffer never decodes (else e.g. activeClips leaks on a 404).
    const onEnded = opts?.onEnded;
    let ended = false;
    const fireEnded = (): void => {
      if (ended || !onEnded) return;
      ended = true;
      onEnded();
    };
    void this.loadBuffer(path).then((buffer) => {
      if (!buffer || this.disposed) {
        fireEnded();
        return;
      }
      let gain: GainNode | null = null;
      let chain: SpatialChain | null = null;
      try {
        gain = ctx.createGain();
        gain.gain.value = volMul;
        chain = this.makeSpatialChain(ctx, pan, lowpassHz);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (chain) {
          gain.connect(chain.head);
          chain.tail.connect(bus);
        } else {
          gain.connect(bus);
        }
        const g = gain;
        const c = chain;
        src.onended = (): void => {
          this.safeDisconnect(src, g);
          c?.dispose();
          fireEnded();
        };
        src.start();
      } catch (err) {
        if (gain) {
          try {
            gain.disconnect();
          } catch {
            /* already gone */
          }
        }
        chain?.dispose();
        this.warn(`clip ${path} failed`, err);
        fireEnded();
      }
    });
    return true;
  }

  /**
   * Build the per-voice spatial insert, or null when the call is plain/centred.
   *
   * WHY PER-SHOT AND NOT POOLED. The allocation-per-sound pattern already exists
   * and always has — a fresh `GainNode` per one-shot, plus a fresh
   * `StereoPannerNode` for every positioned one since the login dragon. This
   * adds at most one `BiquadFilterNode`, a multiplier on an existing pattern
   * rather than a new class of problem. Against the measured ceilings (Σ
   * `maxConcurrent` over the combat-reachable keys = 115 voices; a busy
   * teamfight is ~8–25 concurrent, 20–50 starts/s) a StereoPanner is ~2
   * multiplies/sample and a Biquad ~5, i.e. well under 1 % of a core at 25
   * voices. Pooling would be optimising a rounding error — and would be actively
   * WORSE: the `catch` paths above would have to return nodes to a free list, so
   * a throw would leak a pooled node permanently instead of leaving collectable
   * graph litter. Pooling converts a benign bug into a live one.
   *
   * Degradation is one-way: a context without `createStereoPanner` /
   * `createBiquadFilter`, or a throw while building, yields a less-spatial
   * voice — never a silent one.
   */
  private makeSpatialChain(ctx: AudioContext, pan?: number, lowpassHz?: number): SpatialChain | null {
    const nodes: AudioNode[] = [];
    let panner: StereoPannerNode | null = null;
    let filter: BiquadFilterNode | null = null;

    if (pan !== undefined) {
      panner = this.takePanner(ctx);
      if (panner) {
        panner.pan.value = clampPan(pan);
        nodes.push(panner);
      }
    }

    // A cutoff at or above the audible ceiling is a no-op filter; skip the node
    // rather than pay for it (this is the common case in your own melee, where
    // the depth offset is ~0). Non-finite input can never reach the AudioParam.
    if (typeof lowpassHz === "number" && Number.isFinite(lowpassHz) && lowpassHz > 0 && lowpassHz < 20000) {
      filter = this.takeFilter(ctx);
      if (filter) {
        filter.type = "lowpass";
        filter.frequency.value = Math.max(80, lowpassHz);
        nodes.push(filter);
      }
    }

    if (nodes.length === 0) return null;
    for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
    let released = false;
    return {
      head: nodes[0]!,
      tail: nodes[nodes.length - 1]!,
      dispose: (): void => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* already gone */
          }
        }
        // Idempotent: `dispose` is reachable from BOTH `onended` and the
        // start-threw teardown, and returning the same node to the pool twice
        // would hand one panner to two live voices at once.
        if (released) return;
        released = true;
        if (panner) this.givePanner(panner);
        if (filter) this.giveFilter(filter);
      },
    };
  }

  // ------------------------------------------------------------------------
  // SPATIAL INSERT POOL
  //
  // A pre-spatial voice was ONE node (a GainNode) and lived for the length of a
  // clip. A positioned one adds a panner and sometimes a low-pass, and combat
  // fires them at the rate the SfxGate allows across a dozen keys — so the
  // number that matters is not how many nodes are alive (that is bounded by the
  // gate) but how many are CONSTRUCTED per second, because that is what feeds
  // the GC on the frame thread.
  //
  // MEASURED on a 240-sound duel-zone mix: 1.00 node/voice centred, 2.09
  // positioned. Pooling does not change what is connected at any instant; it
  // changes the churn, so a fight that has reached steady state constructs
  // nothing at all. Both numbers are asserted in spatialDelivery.test.ts.
  //
  // A pooled node is only ever handed out while it is DISCONNECTED (dispose
  // disconnects first, and is idempotent), so a returned node can never still be
  // carrying audio. The caps exist so a pathological burst cannot grow the pool
  // without bound — past the cap a node is simply dropped for the GC, which is
  // exactly the old behaviour.
  // ------------------------------------------------------------------------

  private readonly pannerPool: StereoPannerNode[] = [];
  private readonly filterPool: BiquadFilterNode[] = [];

  private takePanner(ctx: AudioContext): StereoPannerNode | null {
    const pooled = this.pannerPool.pop();
    if (pooled) return pooled;
    const maker = (ctx as unknown as { createStereoPanner?: () => StereoPannerNode }).createStereoPanner;
    if (typeof maker !== "function") return null; // old/limited context — stay centred, never fail the voice
    try {
      return maker.call(ctx);
    } catch {
      return null;
    }
  }

  private givePanner(node: StereoPannerNode): void {
    if (this.disposed || this.pannerPool.length >= SPATIAL_POOL_MAX) return;
    this.pannerPool.push(node);
  }

  private takeFilter(ctx: AudioContext): BiquadFilterNode | null {
    const pooled = this.filterPool.pop();
    if (pooled) return pooled;
    const maker = (ctx as unknown as { createBiquadFilter?: () => BiquadFilterNode }).createBiquadFilter;
    if (typeof maker !== "function") return null; // unfiltered rather than unplayed
    try {
      return maker.call(ctx);
    } catch {
      return null;
    }
  }

  private giveFilter(node: BiquadFilterNode): void {
    if (this.disposed || this.filterPool.length >= SPATIAL_POOL_MAX) return;
    this.filterPool.push(node);
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

  /**
   * Clip URL, stamped with the content cache key. `?h=<contentVersion>` is the
   * only thing that flips nginx from `no-cache` to `public, max-age=31536000,
   * immutable` (nginx.conf `map $arg_h $content_cache`); without it all 995
   * shipped clips (mp3 + wav, 32,276,677 B) revalidated on every visit.
   * `withContentVersion` is a no-op until the content manifest lands, so an
   * injected test baseUrl and any pre-boot clip are unchanged.
   */
  private urlFor(path: string): string {
    const url = this.baseUrl.endsWith("/") ? this.baseUrl + path : `${this.baseUrl}/${path}`;
    return withContentVersion(url);
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
    // `this.bed` was cleared above, so the stop() below cannot look like a
    // natural end; dropping the subscribers as well makes that structural.
    this.bedEndListeners.clear();
    // Sustained SFX beds (#216) die with the system: the epoch bump also stops
    // any still-decoding bed from starting into a torn-down context.
    this.stopSustainedSfx();
    this.sustainedVoices.clear();
    this.gate.reset();
    // The spatial insert pool holds nodes belonging to the context we are about
    // to close. Dropping them here (rather than letting them ride) means a
    // rebuilt AudioSystem never hands a node from a CLOSED context to a voice
    // in a live one — `givePanner`/`giveFilter` also refuse once disposed, so a
    // clip that ends after teardown cannot refill it either.
    this.pannerPool.length = 0;
    this.filterPool.length = 0;
    this.rotation.reset();
    this.buffers.clear();
    this.bgmLoadOrder.length = 0;
    this.currentScene = null;
    this.currentBgmFile = null;
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
 * module from anywhere — including tests — is safe. It wires the real
 * Samantha-James variant map (task #137) so every non-`menu` scene alternates
 * original ↔ deep-house variant on entry; a bare `new AudioSystem()` (tests)
 * gets no variants and never rotates.
 */
export const audioSystem = new AudioSystem({ bgmVariants: ACTIVE_BGM_VARIANTS });
