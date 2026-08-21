/**
 * audio/victoryTaunt — task #93, the VOICE half of the victory presentation.
 *
 * The copy and all 351 clips already exist (`content/config/victory-taunts.json`
 * + `content/assets/audio/voice-taunt/`, schema `config.victory-taunts@1`); this
 * module is what finally SELECTS and PLAYS one:
 *
 *   ROUND WIN → the winning champion's own pool (`roundWin[championId].lines`),
 *               falling back to `roundWinFallback` for a champion with no entry.
 *   MATCH WIN → the champion-agnostic 吃雞 pool (`matchWin`) — the savage line.
 *
 * SELECTION IS DETERMINISTIC, NOT RANDOM. Every client must hear the SAME joke
 * about the same loser, so the line is a pure hash of REPLICATED state — the
 * champion id + round number for a round win, the match id + winning team for a
 * match win — never `Math.random()` and never a local tally. Same inputs on two
 * machines ⇒ same clip, with nothing broadcast. (This is client presentation, so
 * it is not sim state; it just has to AGREE, and hashing replicated identifiers
 * is the cheapest way to agree.)
 *
 * PLAYBACK mirrors audio/nameVoice: its OWN reused `HTMLAudioElement` off the
 * WebAudio graph, so this module only READS the mixer's public surface
 * (`isUnlocked` / `volumes()` + the pure `effectiveGain`) and never touches the
 * AudioSystem buses. Gates, in order: test-mode silence (task #62 — the element
 * is never even created), mixer autoplay-lock, master/SFX mute. The SELECTED
 * LINE IS STILL RETURNED when playback is gated: the subtitle (`text`) is the
 * joke in writing and must render for a muted or not-yet-unlocked player.
 *
 * The taunt is deliberately DELAYED (see render/victoryPresentation): the round
 * beat already plays the MVP's 名言 and the match beat plays the local player's,
 * so the taunt is scheduled after them rather than on top of them. `cancel()`
 * drops a pending taunt when the beat ends early.
 */
import { AUDIO_CONTENT_BASE, audioSystem, shouldSilenceAudio } from "./AudioSystem";
import { effectiveGain, type VolumeState } from "./audioSelect";

/** Path of the authored taunt script, relative to the content mount. */
export const VICTORY_TAUNTS_PATH = "config/victory-taunts.json";
/** Clip gain, multiplied onto the master × SFX mixer level. */
export const TAUNT_GAIN = 1.0;

/** One pre-rendered taunt clip: its manifest id, staged mp3 and subtitle copy. */
export interface VictoryTauntLine {
  id: string;
  /** content-relative mp3 path */
  file: string;
  /** the spoken script — doubles as the on-screen subtitle */
  text: string;
}

/** One champion's tier-1 pool plus the context the jokes were written from. */
export interface VictoryTauntChampionEntry {
  name: string;
  source: string | null;
  lines: VictoryTauntLine[];
}

export interface VictoryTauntsConfig {
  /** championId → that champion's round-win pool */
  roundWin: Record<string, VictoryTauntChampionEntry>;
  /** used when a champion has no pool of its own */
  roundWinFallback: VictoryTauntLine[];
  /** champion-agnostic match-win (吃雞) pool */
  matchWin: VictoryTauntLine[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Normalize an authored clip path onto the content mount ("assets/…") — same
 * normalization the other voice layers apply, so both content-relative and
 * absolute-mount spellings resolve to one URL.
 */
export function normalizeTauntPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  let s = path.trim();
  if (s.startsWith("/content/")) s = s.slice("/content/".length);
  else if (s.startsWith("content/")) s = s.slice("content/".length);
  else if (s.startsWith("/")) s = s.slice(1);
  return s.length > 0 ? s : null;
}

/** A line with no clip AND no text says nothing and is dropped. */
function lineFromRaw(raw: unknown): VictoryTauntLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const file = normalizeTauntPath(str(o["file"]));
  const text = str(o["text"]);
  if (!file && !text) return null;
  return { id: str(o["id"]), file: file ?? "", text };
}

function linesFromRaw(raw: unknown): VictoryTauntLine[] {
  if (!Array.isArray(raw)) return [];
  const out: VictoryTauntLine[] = [];
  for (const item of raw) {
    const line = lineFromRaw(item);
    if (line) out.push(line);
  }
  return out;
}

/** Tolerant parse of the taunt doc; null = not usable (→ no taunt, no subtitle). */
export function victoryTauntsFromDoc(doc: unknown): VictoryTauntsConfig | null {
  if (!doc || typeof doc !== "object") return null;
  const o = doc as Record<string, unknown>;
  const roundWin: Record<string, VictoryTauntChampionEntry> = {};
  const rw = o["roundWin"];
  if (rw && typeof rw === "object") {
    for (const [id, raw] of Object.entries(rw as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const lines = linesFromRaw(e["lines"]);
      if (lines.length === 0) continue; // an empty pool would never be picked
      roundWin[id] = {
        name: str(e["name"]),
        source: typeof e["source"] === "string" ? (e["source"] as string) : null,
        lines,
      };
    }
  }
  const cfg: VictoryTauntsConfig = {
    roundWin,
    roundWinFallback: linesFromRaw(o["roundWinFallback"]),
    matchWin: linesFromRaw(o["matchWin"]),
  };
  // Nothing to say anywhere ⇒ treat the doc as absent rather than half-loaded.
  if (
    Object.keys(cfg.roundWin).length === 0 &&
    cfg.roundWinFallback.length === 0 &&
    cfg.matchWin.length === 0
  ) {
    return null;
  }
  return cfg;
}

// ── deterministic selection ─────────────────────────────────────────────────

/**
 * FNV-1a (32-bit) over a UTF-16 code-unit stream. Stable across engines and
 * across machines — that stability is the whole point: it is what makes two
 * clients pick the same line from the same replicated identifiers.
 */
export function tauntHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= key.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick one entry of `pool` from `key`. null for an empty pool. */
export function pickTauntLine<T>(pool: readonly T[], key: string): T | null {
  if (pool.length === 0) return null;
  return pool[tauntHash(key) % pool.length] ?? null;
}

/** The agreement key for a ROUND win — replicated champion id + round number. */
export function roundTauntKey(championId: string, round: number): string {
  return `round|${championId}|${Number.isFinite(round) ? Math.trunc(round) : 0}`;
}

/** The agreement key for a MATCH win — replicated match id + winning team. */
export function matchTauntKey(matchId: string, winnerTeam: number): string {
  return `match|${matchId}|${Number.isFinite(winnerTeam) ? Math.trunc(winnerTeam) : -1}`;
}

/**
 * The champion-flavoured round-win line. Falls back to the shared pool when the
 * champion has no entry (or its pool is empty), so the presentation layer never
 * has to handle "no line".
 */
export function selectRoundTaunt(
  cfg: VictoryTauntsConfig | null,
  championId: string,
  round: number,
): VictoryTauntLine | null {
  if (!cfg) return null;
  const own = cfg.roundWin[championId]?.lines ?? [];
  const pool = own.length > 0 ? own : cfg.roundWinFallback;
  return pickTauntLine(pool, roundTauntKey(championId, round));
}

/** The savage, champion-agnostic 吃雞 line for the match win. */
export function selectMatchTaunt(
  cfg: VictoryTauntsConfig | null,
  matchId: string,
  winnerTeam: number,
): VictoryTauntLine | null {
  if (!cfg) return null;
  return pickTauntLine(cfg.matchWin, matchTauntKey(matchId, winnerTeam));
}

// ── playback ────────────────────────────────────────────────────────────────

/** The slice of the mixer this layer READS (the process AudioSystem satisfies it). */
export interface TauntAudioPort {
  readonly isUnlocked: boolean;
  volumes(): VolumeState;
}

/** The slice of HTMLAudioElement this layer uses (stubbed in tests). */
export interface TauntElement {
  src: string;
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
}

/** Deferred playback scheduler (injectable so tests never wait on a real timer). */
export type TauntSchedule = (fn: () => void, ms: number) => unknown;

function defaultFetch(url: string): Promise<Response> {
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  return fetch(url);
}

/** `new Audio()` when the DOM has it; null in node/vitest (→ silent no-op). */
function defaultCreateAudio(): TauntElement | null {
  try {
    const g = globalThis as unknown as { Audio?: new () => HTMLAudioElement };
    return g.Audio ? (new g.Audio() as unknown as TauntElement) : null;
  } catch {
    return null;
  }
}

export interface VictoryTauntOptions {
  audio?: TauntAudioPort;
  /** content mount base, default AUDIO_CONTENT_BASE ("/content/") */
  baseUrl?: string;
  fetchFn?: (url: string) => Promise<Response>;
  gain?: number;
  createAudio?: () => TauntElement | null;
  schedule?: TauntSchedule;
  cancelSchedule?: (handle: unknown) => void;
  warn?: (msg: string, err?: unknown) => void;
  /**
   * Force test-mode silence (task #62). When omitted the gate is read from the
   * environment via `shouldSilenceAudio()`. Silent ⇒ the reused `new Audio()`
   * element is never created, so playback no-ops exactly like the no-DOM path —
   * background agents can never make noise on the user's machine.
   */
  silent?: boolean;
}

export interface PlayTauntOptions {
  /** ms to wait before speaking (see render/victoryPresentation for the values). */
  delayMs?: number;
  /**
   * Called ON THE BEAT the line is spoken (i.e. after `delayMs`), NOT when the
   * promise resolves. The subtitle must be driven from here: `playRound` returns
   * the selected line synchronously so a caller can pre-measure it, so wiring
   * the subtitle to the promise puts the joke on screen `delayMs` early — right
   * on top of the round-end 名言 the delay exists to avoid.
   *
   * Fires whether or not the clip actually plays (muted / autoplay-locked /
   * test-mode silence / no clip file): the SUBTITLE is presentation, not audio.
   * Never fires for a taunt that was cancelled or superseded.
   */
  onSpeak?: (line: VictoryTauntLine) => void;
}

export class VictoryTauntPlayer {
  private readonly audio: TauntAudioPort;
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string) => Promise<Response>;
  private readonly gain: number;
  private readonly createAudio: () => TauntElement | null;
  private readonly schedule: TauntSchedule;
  private readonly cancelSchedule: (handle: unknown) => void;
  private readonly warn: (msg: string, err?: unknown) => void;
  private readonly silent: boolean;

  private configPromise: Promise<VictoryTauntsConfig | null> | null = null;
  private el: TauntElement | null = null;
  private elCreated = false;
  /** monotonic id — a newer taunt supersedes a pending older one */
  private seq = 0;
  private pending: unknown = null;
  /** clip files already prefetched (see warmClip) — one warm per file, ever */
  private readonly warmed = new Set<string>();

  constructor(opts: VictoryTauntOptions = {}) {
    this.audio = opts.audio ?? audioSystem;
    this.baseUrl = opts.baseUrl ?? AUDIO_CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    this.gain = opts.gain ?? TAUNT_GAIN;
    this.silent = opts.silent ?? shouldSilenceAudio();
    this.createAudio = this.silent ? () => null : (opts.createAudio ?? defaultCreateAudio);
    this.schedule =
      opts.schedule ??
      ((fn, ms) => (typeof setTimeout === "function" ? setTimeout(fn, ms) : (fn(), null)));
    this.cancelSchedule =
      opts.cancelSchedule ??
      ((h) => {
        if (h !== null && typeof clearTimeout === "function") clearTimeout(h as never);
      });
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[taunt] ${msg}`, err ?? ""));
  }

  /** Cached single-flight fetch of the taunt script; null = missing (silence). */
  load(): Promise<VictoryTauntsConfig | null> {
    if (!this.configPromise) {
      this.configPromise = this.fetchJson(VICTORY_TAUNTS_PATH).then(victoryTauntsFromDoc);
    }
    return this.configPromise;
  }

  /**
   * Speak the round winner's champion-flavoured taunt. Resolves with the SELECTED
   * LINE (for the subtitle) even when playback is muted / locked / silenced, and
   * with null only when there is genuinely nothing to say.
   */
  async playRound(
    championId: string,
    round: number,
    opts: PlayTauntOptions = {},
  ): Promise<VictoryTauntLine | null> {
    if (!championId) return null;
    const line = selectRoundTaunt(await this.load(), championId, round);
    return this.emit(line, opts);
  }

  /** Speak the savage match-win (吃雞) line. Same contract as `playRound`. */
  async playMatch(
    matchId: string,
    winnerTeam: number,
    opts: PlayTauntOptions = {},
  ): Promise<VictoryTauntLine | null> {
    const line = selectMatchTaunt(await this.load(), matchId, winnerTeam);
    return this.emit(line, opts);
  }

  /** Drop a pending taunt and stop a playing one (the beat ended early). */
  cancel(): void {
    this.seq += 1;
    if (this.pending !== null) {
      this.cancelSchedule(this.pending);
      this.pending = null;
    }
    try {
      this.el?.pause();
    } catch (err) {
      this.warn("stop failed (silent)", err);
    }
  }

  /**
   * Schedule `line` and hand it straight back (so a caller can pre-measure it).
   *
   * The BEAT is always scheduled, even when nothing will be audible: the
   * subtitle is presentation and must land at the same instant on a muted
   * client as on a loud one, so the audio gates are evaluated inside `fire()`
   * — at speak time — and never here. That also means a player who mutes
   * DURING the delay gets silence, which reading the gain up front did not.
   */
  private emit(
    line: VictoryTauntLine | null,
    opts: PlayTauntOptions,
  ): VictoryTauntLine | null {
    if (!line) return null;
    const delayMs = opts.delayMs ?? 0;
    const mySeq = ++this.seq;
    const fire = (): void => {
      this.pending = null;
      if (mySeq !== this.seq) return; // superseded by a newer taunt / cancelled
      this.speak(line);
      try {
        opts.onSpeak?.(line);
      } catch {
        /* a broken subtitle sink must never break the audio path */
      }
    };
    if (delayMs > 0) {
      // Warm the CLIP across the delay window (task #63). `speak()` sets
      // `el.src` at the instant the line must be heard, so without this the
      // 758-clip / 7.7 MB taunt pack is grabbed cold ON the beat — the same
      // shape as #93's firework, which fetched its own cue at the moment it
      // was needed and missed the event it decorated. Scheduling the line
      // 2,200 ms ahead (ROUND_TAUNT_DELAY_MS) buys a whole round-trip, but only
      // if something asks for the bytes; this does, without touching the shared
      // element, so it can never cut a still-playing taunt short.
      this.warmClip(line.file);
      this.pending = this.schedule(fire, delayMs);
    } else fire();
    return line;
  }

  /**
   * Prefetch one taunt clip into the HTTP cache. Deliberately a plain fetch and
   * NOT an `<audio>` element: the player reuses a single element, so a second
   * `src` assignment would interrupt whatever is playing. Silent in test mode
   * (#62) for consistency with every other path here, single-flight per file,
   * and errors are swallowed — a failed warm just restores the old behaviour.
   */
  private warmClip(file: string | undefined): void {
    if (!file || this.silent || this.warmed.has(file)) return;
    this.warmed.add(file);
    try {
      void Promise.resolve(this.fetchFn(this.url(file))).catch(() => undefined);
    } catch {
      /* no fetch in this environment — playback still works, just cold */
    }
  }

  /**
   * Actually voice `line` — IF it is audible right now. Every gate (test-mode
   * silence, autoplay lock, mute/zero gain, no clip file, no element) is
   * re-evaluated here rather than at schedule time, so the mixer state that
   * decides is the one in force when the clip would sound.
   */
  private speak(line: VictoryTauntLine): void {
    if (!line.file) return; // subtitle-only line (clip never rendered)
    if (this.silent || !this.audio.isUnlocked) return;
    const volume = effectiveGain(this.audio.volumes(), "sfx", this.gain);
    if (volume <= 0) return;
    const el = this.element();
    if (!el) return;
    this.play(el, line.file, volume);
  }

  private play(el: TauntElement, file: string, volume: number): void {
    try {
      el.pause();
      el.src = this.url(file);
      el.currentTime = 0;
      el.volume = volume;
      const p = el.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        void (p as Promise<void>).catch((err: unknown) => {
          this.warn(`playback blocked for ${file} (silent)`, err);
        });
      }
    } catch (err) {
      this.warn(`playback failed for ${file} (silent)`, err);
    }
  }

  /** Lazily create the single reused element (once — a null result is cached). */
  private element(): TauntElement | null {
    if (!this.elCreated) {
      this.elCreated = true;
      this.el = this.createAudio();
    }
    return this.el;
  }

  private url(path: string): string {
    return this.baseUrl.endsWith("/") ? this.baseUrl + path : `${this.baseUrl}/${path}`;
  }

  /** Fetch a JSON doc under the content mount; null on 404 / bad JSON / error. */
  private async fetchJson(path: string): Promise<unknown> {
    try {
      const res = await this.fetchFn(this.url(path));
      if (!res.ok) return null; // 404 = script not built — silence, no subtitle
      return (await res.json()) as unknown;
    } catch (err) {
      this.warn(`${path} failed to load (silent)`, err);
      return null;
    }
  }

  /** Drop the cached script + any pending taunt (tests / content live-reload). */
  reset(): void {
    this.cancel();
    this.configPromise = null;
    this.warmed.clear();
  }
}

/** Process-wide taunt layer, reading the process-wide mixer state. */
export const victoryTaunts = new VictoryTauntPlayer();

/** Warm the taunt script (cached; safe to call from any boot path). */
export function loadVictoryTaunts(): Promise<VictoryTauntsConfig | null> {
  return victoryTaunts.load();
}

/** Round-win taunt for a champion (see VictoryTauntPlayer.playRound). */
export function playRoundTaunt(
  championId: string,
  round: number,
  opts?: PlayTauntOptions,
): Promise<VictoryTauntLine | null> {
  return victoryTaunts.playRound(championId, round, opts);
}

/** Savage match-win taunt (see VictoryTauntPlayer.playMatch). */
export function playMatchTaunt(
  matchId: string,
  winnerTeam: number,
  opts?: PlayTauntOptions,
): Promise<VictoryTauntLine | null> {
  return victoryTaunts.playMatch(matchId, winnerTeam, opts);
}

/** Drop a pending/playing taunt (the celebration ended early). */
export function cancelVictoryTaunt(): void {
  victoryTaunts.cancel();
}
