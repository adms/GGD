/**
 * audio/contextualVoice — event → category → the champion's OWN cloned line, at
 * its moment in combat (owner directive 2026-07-25 「充分利用生成的語音們」).
 *
 * This is the CLIENT-ONLY contextual half of the voice-lines integration. It
 * reads the SAME generated pack the rung-2 click reads
 * (`champions/MANIFEST.json`, warmed via `championVoice.loadPack()`), and
 * dispatches a category clip — skill-name.<slot> on a cast, kill-N / first-blood
 * on a kill, crit on a crit, hurt / hurt-heavy on damage taken, defeat on your
 * own death, victory on a round/match win, stun / slow / bind on a CC edge — at
 * the call-sites in GameApp / AudioDirector / the settlement panels.
 *
 * NON-NEGOTIABLES.
 *  • CLIENT-ONLY. The clip PICK uses a client rng (Math.random by default),
 *    NEVER world.rng — a voice line must never touch determinism/replay. Nothing
 *    here imports packages/shared/src/sim.
 *  • ALL GATES INHERITED. Every line rides `audioSystem.playClip`, so the #14
 *    unlock gate + SFX slider/mute and the #62 test-mode silence apply exactly as
 *    they do for the click; a muted or headless session burns no cooldown and
 *    plays nothing (checked before the async pack resolve).
 *  • NO SPAM. Three throttle layers keep a 12-body teamfight legible:
 *      1. a GLOBAL one-voice-per-beat lock (`GLOBAL_MIN_GAP_MS`), which the rare
 *         celebratory lines (kill-N / first-blood / unstoppable) may PREEMPT so a
 *         pentakill is never swallowed by chatter;
 *      2. a PER-champion cooldown so one champion never machine-guns lines;
 *      3. a PER-(champion,category) cooldown + a per-category probability, so
 *         casting every rotation does not shout every cast and an auto every
 *         0.7 s does not fire a hurt line every hit.
 *  • FALL THROUGH, NEVER THROW. A champion with no pack entry, a category with no
 *    clip, and a pack that 404s all resolve to a silent no-op (false).
 */
import { audioSystem } from "./AudioSystem";
import type { Rng } from "./audioSelect";
import { championVoice } from "./championVoice";
import type { VoiceAudioPort } from "./championVoice";
import { packClips, pickSelectClip, type ChampionVoicePack } from "./selectVoiceLadder";

/** One-voice-per-beat, arena-wide (matches the abilityCast SfxGate budget). */
export const GLOBAL_MIN_GAP_MS = 1_200;
/** A single champion never fires two contextual lines closer than this. */
export const CHAMP_MIN_GAP_MS = 1_500;
/**
 * Belt-and-suspenders release for the in-flight de-dup: if `playClip`'s onEnded
 * never fires (a missing audio backend, a leaked BufferSource), the clip's
 * `activeClips` entry is force-cleared after this long so the same line can
 * never self-mute permanently. Longer than any shipped voice line (max ~18 s
 * stings are BGM, not contextual lines — those are ≤ a few seconds).
 */
export const CLIP_SAFETY_MS = 8_000;

/** Per-category dispatch policy. */
export interface CategoryPolicy {
  /** probability the line fires when un-throttled (client rng, 0..1). */
  prob: number;
  /** per-(champId, policyKey) cooldown in ms (0 = none). */
  cooldownMs: number;
  /**
   * celebratory/rare lines bypass the global one-voice-per-beat lock AND the
   * per-champion cooldown, so a multi-kill is always heard.
   */
  preempt: boolean;
  /**
   * cooldown bucket key, appended to the champId. Defaults to the category, but
   * hurt + hurt-heavy SHARE "hurt" so a heavy grunt preempts a light one instead
   * of stacking, and every skill slot keeps its own bucket (its full category).
   */
  bucket?: string;
}

/** Clamp a call-site probability multiplier into 0..1 (non-finite → 0). */
function clamp01(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const CELEBRATORY: CategoryPolicy = { prob: 1, cooldownMs: 0, preempt: true };
const DEFAULT_POLICY: CategoryPolicy = { prob: 0.5, cooldownMs: 2_500, preempt: false };

/**
 * Resolve the policy for a category. skill-name.<slot> is matched by prefix so
 * every ability slot shares the tuning but keeps its own cooldown bucket.
 */
export function policyFor(category: string): CategoryPolicy {
  if (category.startsWith("skill-name.")) {
    return { prob: 0.5, cooldownMs: 3_000, preempt: false };
  }
  if (
    category === "first-blood" ||
    category === "unstoppable" ||
    /^kill-[1-5]$/.test(category)
  ) {
    return CELEBRATORY;
  }
  switch (category) {
    case "crit":
      return { prob: 0.25, cooldownMs: 3_000, preempt: false };
    case "hurt":
      return { prob: 0.35, cooldownMs: 1_500, preempt: false, bucket: "hurt" };
    case "hurt-heavy":
      return { prob: 0.7, cooldownMs: 2_500, preempt: false, bucket: "hurt" };
    case "defeat":
      // Once per death — the death event is the latch, so no cooldown here.
      return { prob: 1, cooldownMs: 0, preempt: false };
    case "victory":
      // Once per round/match — the phase edge is the latch.
      return { prob: 1, cooldownMs: 0, preempt: false };
    case "stun":
    case "slow":
    case "bind":
      return { prob: 0.6, cooldownMs: 2_500, preempt: false };
    // ── Tier-1 categories (voice-binding-design.md §三) ──────────────────────
    case "quote":
      // pack 名言 at the select-confirm / settlement / click-self moments; those
      // moments self-latch, so this is a gentle flavour roll, not a spam risk.
      return { prob: 0.6, cooldownMs: 2_500, preempt: false };
    case "attack-light":
      // OWNER HARD RULE: a basic auto fires WINDUP ~1.4×/s, so this MUST be low
      // prob + high cooldown or it washes the channel. Never per-swing.
      return { prob: 0.08, cooldownMs: 12_000, preempt: false };
    case "attack-heavy":
      // Rides the crit signal (二擇一 with "crit" at the call site); mirror crit
      // tuning but keep its own bucket so the two never share a cooldown.
      return { prob: 0.25, cooldownMs: 3_000, preempt: false };
    case "block":
      return { prob: 0.5, cooldownMs: 2_500, preempt: false };
    case "dodge":
      return { prob: 0.5, cooldownMs: 2_500, preempt: false };
    case "sprint":
      // Dashing is frequent — moderate prob, longer cooldown.
      return { prob: 0.3, cooldownMs: 6_000, preempt: false };
    case "healed":
      return { prob: 0.4, cooldownMs: 3_000, preempt: false };
    case "hum":
      // The client idle latch is the primary gate; keep the roll quiet so it
      // never chatters between fights.
      return { prob: 0.15, cooldownMs: 20_000, preempt: false };
    case "curse":
      // Received hard-CC 怒罵 (二擇一 with the stun/bind line at the call site).
      return { prob: 0.4, cooldownMs: 4_000, preempt: false };
    default:
      return DEFAULT_POLICY;
  }
}

/**
 * Per-CALL modulation of a category's policy (task #223). The category tuning
 * stays the single source of truth for "how often does a hurt line fire"; this
 * only lets the CALL SITE say how much the line matters to the listener, which
 * is knowledge the audio layer deliberately does not have (it has never taken a
 * localId, a relation or a distance, and must not start).
 */
export interface ContextualPlayOptions {
  /**
   * Multiplier on the category probability, clamped to 0..1 — so it can only
   * ever make a line RARER than the owner-tuned policy, never more frequent.
   * See audio/voiceAudience for the bands that produce it.
   */
  probScale?: number;
  /**
   * Force the celebratory bypass of the global + per-champion gaps for a line
   * whose category does not normally get it. Only ever passed for once-per-death
   * lines (`defeat`) that are ABOUT the local player; a repeatable line must
   * never be given this or the throttle stops being a ceiling.
   */
  preempt?: boolean;
  /**
   * ── the spatial mix (#259) ──────────────────────────────────────────────
   * Three PLAIN NUMBERS, computed by `audio/voiceSpatial` from the listener
   * frame that only `GameApp` holds, and handed straight to
   * `AudioSystem.playClip`. This is the shape the census called for and it is
   * the one the file header already committed to: the audio layer still has no
   * idea what a localId, a relation or a distance is, and it still must not
   * start. A conveyor belt for mix numbers is not knowledge of geometry.
   *
   * Absent = today's behaviour exactly (`volume: 1`, no panner, no filter), so
   * every existing caller — the champ-select quip, the settlement quote, the
   * kill lines — is byte-identical.
   */
  /** 0..1 multiplier on the clip's level. Default 1. NEVER above 1: the SFX bus
   *  has no clamp above unity (`audioSelect.sfxVoiceMultiplier`), and `hurt` /
   *  `defeat` are already among the loudest clips in the pack. */
  volume?: number;
  /** stereo pan; OMIT (do not pass 0) when inaudible — a present `pan` is what
   *  makes the mixer allocate a StereoPannerNode per voice. */
  pan?: number;
  /** 前後 low-pass cutoff in Hz; omit when the source is not up-screen. */
  lowpassHz?: number;
}

export interface ContextualVoiceOptions {
  audio?: VoiceAudioPort;
  rng?: Rng;
  now?: () => number;
  /** pack source; defaults to the shared championVoice single-flight cache. */
  packLoader?: () => Promise<ChampionVoicePack | null>;
  globalGapMs?: number;
  champGapMs?: number;
}

export class ContextualVoicePlayer {
  private readonly audio: VoiceAudioPort;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly packLoader: () => Promise<ChampionVoicePack | null>;
  private readonly globalGapMs: number;
  private readonly champGapMs: number;

  /** Resolved pack, kept for SYNCHRONOUS throttle/emptiness decisions. */
  private pack: ChampionVoicePack | null = null;

  private lastVoiceAt = -Infinity;
  private readonly lastChampAt = new Map<string, number>();
  /** `${champId}:${bucket}` → last fire timestamp. */
  private readonly lastCatAt = new Map<string, number>();
  /** `${champId}:${category}` → last clip, so a repeat picks a different one. */
  private readonly lastClip = new Map<string, string>();
  /**
   * In-flight de-dup (owner hard rule 「同一個語音不會同時播放」): the set of clip
   * srcs CURRENTLY sounding. A clip already in here is SKIPPED without overlap or
   * queue, and — crucially — without burning throttle state, so the same event's
   * next roll can still pick a different variant. Cleared per-clip on the
   * playClip onEnded, with a safety timeout backstop.
   */
  private readonly activeClips = new Set<string>();

  constructor(opts: ContextualVoiceOptions = {}) {
    this.audio = opts.audio ?? audioSystem;
    this.rng = opts.rng ?? Math.random;
    this.now =
      opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.packLoader = opts.packLoader ?? (() => championVoice.loadPack());
    this.globalGapMs = opts.globalGapMs ?? GLOBAL_MIN_GAP_MS;
    this.champGapMs = opts.champGapMs ?? CHAMP_MIN_GAP_MS;
  }

  /** Warm the pack cache (safe to repeat; call from the same boot path as the click). */
  async warm(): Promise<void> {
    this.pack = await this.packLoader();
  }

  /**
   * Dispatch the champion's `category` line, subject to gates + throttle. Returns
   * true only when a clip was actually handed to the mixer. A silent no-op when:
   * the mixer is locked/muted, the champion has no clip for the category, the
   * probability roll fails, or any throttle layer blocks it.
   */
  playContextual(champId: string, category: string, opts?: ContextualPlayOptions): boolean {
    if (!champId || !category) return false;
    if (!this.audio.isUnlocked) return false;
    const v = this.audio.volumes();
    if (v.muted || v.sfxMuted) return false; // muted: no play, no cooldown burn

    const pack = this.pack;
    if (!pack) {
      // Not warmed yet (or 404) — kick a warm for next time and no-op now.
      void this.warm();
      return false;
    }
    const clips = packClips(pack, champId, category);
    if (clips.length === 0) return false; // hero/category not in the pack — fall through

    const policy = policyFor(category);
    // The call site may only ever DE-weight (probScale is clamped to 0..1) or —
    // for a once-per-death line about the local player — request the same
    // bypass the celebratory lines get. It can never lower a preempt the
    // category already owns.
    const scale = clamp01(opts?.probScale ?? 1);
    if (scale <= 0) return false; // scored out by the call site — never entered
    const preempt = policy.preempt || opts?.preempt === true;
    const t = this.now();

    // Layer 1: global one-voice-per-beat (celebratory preempts).
    if (!preempt && t - this.lastVoiceAt < this.globalGapMs) return false;
    // Layer 2: per-champion cooldown (celebratory preempts).
    if (!preempt) {
      const lc = this.lastChampAt.get(champId);
      if (lc !== undefined && t - lc < this.champGapMs) return false;
    }
    // Layer 3: per-(champion,category-bucket) cooldown.
    const bucketKey = `${champId}:${policy.bucket ?? category}`;
    if (policy.cooldownMs > 0) {
      const lb = this.lastCatAt.get(bucketKey);
      if (lb !== undefined && t - lb < policy.cooldownMs) return false;
    }
    // Layer 4: probability (client rng — never world.rng), scaled by how much
    // this line matters to THIS listener (task #223 audience weighting).
    const prob = policy.prob * scale;
    if (prob < 1 && this.rng() >= prob) return false;

    const clipKey = `${champId}:${category}`;
    const clip = pickSelectClip(
      clips.map((c) => c.clip),
      this.rng,
      this.lastClip.get(clipKey),
    );
    if (!clip) return false;

    // IN-FLIGHT DE-DUP: the SAME clip is already sounding — skip it (no overlap,
    // no queue) WITHOUT burning throttle, so this event's next roll can still
    // pick a different variant of the same category.
    if (this.activeClips.has(clip)) return false;

    // Commit throttle state only once we are actually going to play.
    this.lastVoiceAt = t;
    this.lastChampAt.set(champId, t);
    this.lastCatAt.set(bucketKey, t);
    this.lastClip.set(clipKey, clip);

    this.activeClips.add(clip);
    const release = (): void => {
      this.activeClips.delete(clip);
    };
    // #259: the spatial mix, when the call site had a listener frame to compute
    // one from. `pan` / `lowpassHz` are OMITTED rather than passed as 0/∞ so a
    // centred line still allocates exactly one node (see voiceSpatial
    // .voicePlayOptions and AudioSystem.makeSpatialChain). No mix ⇒ the old
    // `volume: 1`, byte-identical.
    const ok = this.audio.playClip(clip, {
      volume: clamp01(opts?.volume ?? 1),
      ...(typeof opts?.pan === "number" ? { pan: opts.pan } : {}),
      ...(typeof opts?.lowpassHz === "number" ? { lowpassHz: opts.lowpassHz } : {}),
      onEnded: release,
    });
    if (!ok) {
      // play refused synchronously (disposed / a mid-flight lock) — don't leak.
      release();
      return false;
    }
    // Backstop: if onEnded never arrives (no backend, a leaked source), force the
    // entry out after the safety window so the line can never self-mute forever.
    if (typeof setTimeout === "function") setTimeout(release, CLIP_SAFETY_MS);
    return true;
  }

  /** Drop caches + cooldowns (tests / content live-reload). */
  reset(): void {
    this.pack = null;
    this.lastVoiceAt = -Infinity;
    this.lastChampAt.clear();
    this.lastCatAt.clear();
    this.lastClip.clear();
    this.activeClips.clear();
  }
}

/** Process-wide contextual voice layer riding the process-wide mixer + pack cache. */
export const contextualVoice = new ContextualVoicePlayer();

/** Warm the contextual layer (cached; safe to repeat from any boot path). */
export function warmContextualVoice(): Promise<void> {
  return contextualVoice.warm();
}

/** Fire a contextual line for a champion (see ContextualVoicePlayer.playContextual). */
export function playContextualVoice(
  champId: string | null | undefined,
  category: string,
  opts?: ContextualPlayOptions,
): boolean {
  if (!champId) return false;
  return contextualVoice.playContextual(champId, category, opts);
}
