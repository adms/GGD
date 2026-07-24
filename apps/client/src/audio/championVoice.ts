/**
 * audio/championVoice — click-your-own-hero → the champion speaks (task #27).
 *
 * Data contract (`content/config/champion-voices.json`, built by the content
 * pipeline — may not exist yet; everything here degrades to silence):
 *
 *   { champions: { [champId]: { select: [paths], source: "map-quip"|"none",
 *                               soundset: string|null } } }
 *
 * `select` paths are content-relative (same base the audio map uses). When a
 * champion has NO authored select clips (source "none"), dev builds probe the
 * local-only Blizzard soundset overlay `assets/blizzard-local/MANIFEST.json`
 * ({ units: { [unitId]: { champId, clips: { what: [paths] } } } }) and play a
 * random "what" clip — the classic click-acknowledge line. The manifest is
 * copyright-gated (never shipped), so the probe is dev-only and 404-tolerant.
 *
 * THAT IS NO LONGER THE WHOLE ANSWER. Those two sources cover 16 of 113
 * champions on the public tier and 46 of 113 on a gated build, so the click was
 * SILENT for ~86% of the roster on https://ggd.adms.ai/. This module now
 * resolves through the five-rung ladder in `selectVoiceLadder.ts`, whose bottom
 * rung is present for all 113 champions in the shipped content tree — read that
 * module's header for the rung order, the 名言-vs-名乗り judgement, and the
 * drop-in contract for the generated voice pack. Silence is now reachable only
 * through the mixer gates (locked / muted), never through missing content.
 *
 * Playback rides `audioSystem.playClip` (SFX bus): unlock-gated and subject to
 * the SFX slider/mute. The module adds its own ~2.5 s per-champion cooldown so
 * click spam can't machine-gun the quips, plus a no-immediate-repeat pick so a
 * multi-clip pool never says the same line twice running. Every fetch is cached
 * single-flight (a 404 caches null — never re-requested per click).
 */
import { AUDIO_CONTENT_BASE, audioSystem, type SfxPlayOptions } from "./AudioSystem";
import type { Rng } from "./audioSelect";
import { fullAssetsEnabled } from "../config/fullAssets";
import {
  loadChampionNames,
  loadChampionQuotes,
  type ChampionNamesManifest,
  type ChampionQuotesManifest,
} from "./nameVoice";
import {
  VOICE_PACK_MANIFEST_PATH,
  pickSelectClip,
  resolveSelectVoice,
  selectVoiceGain,
  selectVoiceLadder,
  voicePackFromDoc,
  type ChampionVoicePack,
  type SelectVoiceInputs,
  type SelectVoiceRung,
} from "./selectVoiceLadder";

/** Path of the authored voice config, relative to the content mount. */
export const CHAMPION_VOICES_PATH = "config/champion-voices.json";
/** Path of the local-only Blizzard soundset manifest (dev fallback). */
export const BLIZZARD_MANIFEST_PATH = "assets/blizzard-local/MANIFEST.json";
/** Per-champion select-quip cooldown — click spam stays one voice per beat. */
export const SELECT_VOICE_COOLDOWN_MS = 2500;

export interface ChampionVoiceEntry {
  /** content-relative select-quip clip paths (may be empty) */
  select: string[];
  /** where the clips came from: authored map quips, or nothing */
  source: "map-quip" | "none";
  /** bound WC3 soundset name (diagnostics; null when none) */
  soundset: string | null;
}

export interface ChampionVoicesConfig {
  champions: Record<string, ChampionVoiceEntry>;
}

export interface BlizzardUnitClips {
  champId: string | null;
  clips: Record<string, string[]>;
}

export interface BlizzardManifest {
  units: Record<string, BlizzardUnitClips>;
}

/** Tolerant parse of the champion-voices doc; null = not usable (silence). */
export function championVoicesFromDoc(doc: unknown): ChampionVoicesConfig | null {
  if (!doc || typeof doc !== "object") return null;
  const champs = (doc as { champions?: unknown }).champions;
  if (!champs || typeof champs !== "object") return null;
  const out: Record<string, ChampionVoiceEntry> = {};
  for (const [id, raw] of Object.entries(champs as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { select?: unknown; source?: unknown; soundset?: unknown };
    out[id] = {
      select: Array.isArray(o.select)
        ? o.select.filter((s): s is string => typeof s === "string" && s.length > 0)
        : [],
      source: o.source === "map-quip" ? "map-quip" : "none",
      soundset: typeof o.soundset === "string" ? o.soundset : null,
    };
  }
  return { champions: out };
}

/** Tolerant parse of the blizzard-local manifest; null = not usable. */
export function blizzardManifestFromDoc(doc: unknown): BlizzardManifest | null {
  if (!doc || typeof doc !== "object") return null;
  const units = (doc as { units?: unknown }).units;
  if (!units || typeof units !== "object") return null;
  const out: Record<string, BlizzardUnitClips> = {};
  for (const [id, raw] of Object.entries(units as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { champId?: unknown; clips?: unknown };
    const clips: Record<string, string[]> = {};
    if (o.clips && typeof o.clips === "object") {
      for (const [what, v] of Object.entries(o.clips as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          clips[what] = v.filter((s): s is string => typeof s === "string" && s.length > 0);
        }
      }
    }
    out[id] = { champId: typeof o.champId === "string" ? o.champId : null, clips };
  }
  return { units: out };
}

/** The "what" (click-acknowledge) clips of the unit bound to a champion. */
export function blizzardWhatClips(manifest: BlizzardManifest | null, champId: string): string[] {
  if (!manifest) return [];
  for (const unit of Object.values(manifest.units)) {
    if (unit.champId === champId) {
      const what = unit.clips["what"];
      if (what && what.length > 0) return what;
    }
  }
  return [];
}

/** Uniform random pick; null for an empty list. */
export function pickVoiceClip(clips: readonly string[], rng: Rng): string | null {
  if (clips.length === 0) return null;
  const i = Math.min(clips.length - 1, Math.floor(rng() * clips.length));
  return clips[i] ?? null;
}

/**
 * Normalize an authored clip path onto the content mount ("assets/…"): strips
 * a leading "/content/", "content/" or bare "/" so both content-relative and
 * absolute-mount spellings in the built config resolve to the same URL.
 */
export function normalizeClipPath(path: string | null): string | null {
  if (typeof path !== "string") return null;
  let s = path.trim();
  if (s.startsWith("/content/")) s = s.slice("/content/".length);
  else if (s.startsWith("content/")) s = s.slice("content/".length);
  else if (s.startsWith("/")) s = s.slice(1);
  return s.length > 0 ? s : null;
}

/** The slice of the mixer the voice layer needs (audioSystem satisfies it). */
export interface VoiceAudioPort {
  readonly isUnlocked: boolean;
  /** sfxMuted mirrors VolumeState: optional, absent = false (old blobs) */
  volumes(): { muted: boolean; sfxMuted?: boolean };
  playClip(path: string, opts?: SfxPlayOptions): boolean;
}

/**
 * Is this bundle allowed to fall back to the local-only Blizzard soundsets?
 *
 * WAS `import.meta.env.DEV`. 97 of 113 champions have NO authored select quip
 * (champion-voices.json `source: "none"`) and depend entirely on this fallback,
 * so in a deployed bundle clicking your hero did nothing at all — silently, for
 * 86% of the roster. #176 replaced the flag with an explicit build switch that
 * still defaults to `import.meta.env.DEV`. See apps/client/src/config/fullAssets.ts.
 */
const isDevBuild = fullAssetsEnabled;

function defaultFetch(url: string): Promise<Response> {
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  return fetch(url);
}

export interface ChampionVoiceOptions {
  audio?: VoiceAudioPort;
  /** content mount base, default AUDIO_CONTENT_BASE ("/content/") */
  baseUrl?: string;
  fetchFn?: (url: string) => Promise<Response>;
  rng?: Rng;
  /** ms clock for the per-champion cooldown */
  now?: () => number;
  cooldownMs?: number;
  /** probe the local-only Blizzard manifest (default: dev builds only) */
  blizzardFallback?: boolean;
  warn?: (msg: string, err?: unknown) => void;
  /**
   * Rung 4/5 sources. They default to the champ-select call-out layer's OWN
   * cached loaders (`nameVoice`), so a click costs no extra request on any
   * screen that already warmed them and the two layers can never disagree about
   * what a champion's name clip is. Injected in tests.
   */
  namesLoader?: () => Promise<ChampionNamesManifest | null>;
  quotesLoader?: () => Promise<ChampionQuotesManifest | null>;
}

export class ChampionVoicePlayer {
  private readonly audio: VoiceAudioPort;
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string) => Promise<Response>;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private readonly blizzardFallback: boolean;
  private readonly warn: (msg: string, err?: unknown) => void;
  private readonly namesLoader: () => Promise<ChampionNamesManifest | null>;
  private readonly quotesLoader: () => Promise<ChampionQuotesManifest | null>;

  private configPromise: Promise<ChampionVoicesConfig | null> | null = null;
  private manifestPromise: Promise<BlizzardManifest | null> | null = null;
  private packPromise: Promise<ChampionVoicePack | null> | null = null;
  /** champId → last play timestamp (ms, `now()` clock) */
  private readonly lastPlay = new Map<string, number>();
  /** champId → the clip it last spoke, so a repeat click picks a different one */
  private readonly lastClip = new Map<string, string>();

  constructor(opts: ChampionVoiceOptions = {}) {
    this.audio = opts.audio ?? audioSystem;
    this.baseUrl = opts.baseUrl ?? AUDIO_CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    this.rng = opts.rng ?? Math.random;
    this.now =
      opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.cooldownMs = opts.cooldownMs ?? SELECT_VOICE_COOLDOWN_MS;
    this.blizzardFallback = opts.blizzardFallback ?? isDevBuild();
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[voice] ${msg}`, err ?? ""));
    this.namesLoader = opts.namesLoader ?? loadChampionNames;
    this.quotesLoader = opts.quotesLoader ?? loadChampionQuotes;
  }

  /** Cached single-flight fetch of the voice config; null = missing (silence). */
  load(): Promise<ChampionVoicesConfig | null> {
    if (!this.configPromise) {
      this.configPromise = this.fetchJson(CHAMPION_VOICES_PATH).then(championVoicesFromDoc);
    }
    return this.configPromise;
  }

  /** Cached single-flight probe of the blizzard-local manifest (404-tolerant). */
  loadManifest(): Promise<BlizzardManifest | null> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.fetchJson(BLIZZARD_MANIFEST_PATH).then(blizzardManifestFromDoc);
    }
    return this.manifestPromise;
  }

  /**
   * Cached single-flight probe of the GENERATED voice pack (rung 2). Absent
   * today — a 404 caches null and the ladder simply skips the rung — so the
   * `tools/voice-gen` lane integrates by writing the file and nothing else.
   */
  loadPack(): Promise<ChampionVoicePack | null> {
    if (!this.packPromise) {
      this.packPromise = this.fetchJson(VOICE_PACK_MANIFEST_PATH).then(voicePackFromDoc);
    }
    return this.packPromise;
  }

  /**
   * Every rung for a champion, empties included — the diagnostic seam behind
   * the coverage numbers (which tier answers, on which build). Never throws.
   */
  async ladder(champId: string): Promise<SelectVoiceRung[]> {
    return selectVoiceLadder(champId, await this.inputs());
  }

  /** The four manifests the ladder reads, fetched concurrently and cached. */
  private async inputs(): Promise<SelectVoiceInputs> {
    const [voices, pack, blizzard, names, quotes] = await Promise.all([
      this.load(),
      this.loadPack(),
      // The gate is applied HERE, not inside the ladder: a copyright-gated rung
      // that the build may not ask for is a fetch decision, not a ranking one.
      this.blizzardFallback ? this.loadManifest() : Promise.resolve(null),
      this.safe(this.namesLoader),
      this.safe(this.quotesLoader),
    ]);
    return { voices, pack, blizzard, names, quotes };
  }

  /** A borrowed loader must not be able to break the click by rejecting. */
  private async safe<T>(loader: () => Promise<T | null>): Promise<T | null> {
    try {
      return await loader();
    } catch (err) {
      this.warn("fallback manifest failed to load (silent)", err);
      return null;
    }
  }

  /**
   * Play a random select quip for `champId`. Silent no-op (false) when the
   * mixer is still autoplay-locked, the SFX layer is muted, the champion is on
   * its ~2.5 s quip cooldown, or no clip exists anywhere. The cooldown slot is
   * reserved SYNCHRONOUSLY (before the async config/clip resolution) so a
   * same-frame double-click can never start two voices.
   */
  async playSelect(champId: string): Promise<boolean> {
    if (!champId || !this.audio.isUnlocked) return false;
    const v = this.audio.volumes();
    if (v.muted || v.sfxMuted) return false; // muted: no fetch, no cooldown burn
    const t = this.now();
    const last = this.lastPlay.get(champId);
    if (last !== undefined && t - last < this.cooldownMs) return false;
    this.lastPlay.set(champId, t);
    const rung = resolveSelectVoice(champId, await this.inputs());
    if (!rung) return false;
    const clip = pickSelectClip(rung.clips, this.rng, this.lastClip.get(champId));
    if (!clip) return false;
    this.lastClip.set(champId, clip);
    return this.audio.playClip(clip, { volume: selectVoiceGain(rung.tier) });
  }

  /** Fetch a JSON doc under the content mount; null on 404 / bad JSON / error. */
  private async fetchJson(path: string): Promise<unknown> {
    try {
      const url = this.baseUrl.endsWith("/") ? this.baseUrl + path : `${this.baseUrl}/${path}`;
      const res = await this.fetchFn(url);
      if (!res.ok) return null; // 404 = not built / not extracted yet — silence
      return (await res.json()) as unknown;
    } catch (err) {
      this.warn(`${path} failed to load (silent)`, err);
      return null;
    }
  }

  /** Drop caches + cooldowns (tests / content live-reload). */
  reset(): void {
    this.configPromise = null;
    this.manifestPromise = null;
    this.packPromise = null;
    this.lastPlay.clear();
    this.lastClip.clear();
  }
}

/** Process-wide voice layer riding the process-wide mixer. */
export const championVoice = new ChampionVoicePlayer();

/**
 * Warm the voice layer (cached; call from any boot path, safe to repeat).
 *
 * Warms the generated pack alongside the authored config, so the first click of
 * a match doesn't pay for the rung-2 probe. Rungs 4/5 are the champ-select
 * layer's manifests and are warmed by whoever mounts champ select — the click
 * still resolves them on demand if they are not.
 */
export function loadChampionVoices(): Promise<ChampionVoicesConfig | null> {
  void championVoice.loadPack();
  return championVoice.load();
}

/** Fire the select quip for a champion (see ChampionVoicePlayer.playSelect). */
export function playChampionSelectVoice(champId: string): Promise<boolean> {
  return championVoice.playSelect(champId);
}
