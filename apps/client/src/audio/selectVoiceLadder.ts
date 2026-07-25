/**
 * audio/selectVoiceLadder — WHAT THE CLICK SAYS WHEN THE CHAMPION HAS NO CLIP.
 *
 * Task #27 shipped a two-rung answer: the map quip, else the Blizzard soundset.
 * Measured on the roster that is 16 of 113 champions on the public tier and 46
 * of 113 on a dev/LAN/family build — so a player clicking their own hero
 * mid-fight heard NOTHING about six times out of seven, and the deployed
 * https://ggd.adms.ai/ build was the worse of the two numbers, because the
 * second rung is copyright-gated by design (`fullAssetsEnabled()`, #176/#177)
 * and can never be the shipping answer.
 *
 * This module is the pure decision half of the fix: a five-rung LADDER whose
 * bottom rung is present for all 113 champions in the shipped content tree, so
 * "the click is silent" stops being a possible outcome.
 *
 *   1 authored   champion-voices.json `select[]` — the w3x map quips (16).
 *   2 generated  the per-champion cloned voice pack (0 today → 48, see below).
 *   3 soundset   blizzard-local `clips.what` — gated, dev/LAN/family only (~30).
 *   4 name       the 全名 half of the champ-select call-out (112).
 *   5 quote      the 名言 clip (113) — the guaranteed floor.
 *
 * FIRST NON-EMPTY RUNG WINS. Rungs are not merged: a champion with a real
 * recorded line must never randomly answer with a TTS name instead.
 *
 * ── why rung 4 is the name and not the 名言 ────────────────────────────────
 * Both are already on disk, so the choice is a judgement, and it went this way:
 * a click asks "who are you", and 名乗り — announcing your own name — is the
 * genre-correct answer and is exactly what a WC3 `what` clip is. The 名言 is
 * the champ-SELECT payoff: it is spoken on confirm (#120/#139) AND printed in
 * the profile panel, so the player has just heard it and read it. Spending it
 * again as a spammable acknowledge makes the champion sound like it knows one
 * line, and it cheapens the confirm moment for a cue nobody asked to be
 * dramatic. So the 名言 stays the FLOOR: it fires only for the champions with
 * no name clip (2 of 113 today), which keeps the champ-select moment intact for
 * 111 and still makes silence impossible.
 *
 * ── the distinctiveness constraint ────────────────────────────────────────
 * 「如果大家聲音都相似，戰鬥的時候就會很吵而且不知道是誰放了哪招」
 * Rungs 4–5 are rendered by two macOS voices (Kyoko / Otoya), which is the
 * monoculture task #184 exists to break — so the ladder must not lean on TIMBRE
 * for identity. It doesn't: the name clip's whole content is the champion's
 * own name, which is the most lexically separated cue available, and the ladder
 * guarantees the stronger structural property that the integration test pins —
 * two DIFFERENT characters never resolve to the same audio file. (The 20
 * byte-identical clip groups in the content tree are all the same character
 * duplicated across hero numbers, cf. task #113; none has two members in the
 * curated roster.) Rung 2 is where real per-champion timbre arrives.
 *
 * ── rung 2: the drop-in contract ──────────────────────────────────────────
 * `assets/audio/voices/champions/MANIFEST.json`, schema
 * `audio.champion-voice-pack@1`. It lives under `content/assets/` — NOT
 * `content/config/` — for the same reason the names and quotes packs do (see
 * docs/todo/name-voice.md): it is an opaque generated asset pack validated by
 * this tolerant parser plus its tests, not a hand-authored binding for the
 * content schema. Consequence: `tools/voice-gen` can land clips WITHOUT a
 * packages/shared schema change, a content:validate change, or any client
 * change. Writing the file is the whole integration.
 *
 *   { "schema": "audio.champion-voice-pack@1",
 *     "champions": {
 *       "godie-e001": {
 *         "engine": "cosyvoice3", "variant": "base",
 *         "lines": {
 *           "select": [ { "clip": "assets/audio/voices/champions/godie-e001/select-1.mp3",
 *                         "text": "…", "lang": "ja", "durationSec": 1.2,
 *                         "speakerSim": 0.81 } ],
 *           "battlecry": [ … ] } } } }
 *
 * Only `lines.select[].clip` is load-bearing for the click; every other field is
 * carried for the QA/report surfaces and ignored here. `lines` is deliberately
 * category-keyed rather than a flat select list so the same manifest can index
 * the whole ~42-line corpus and later cues (hurt / battlecry / death) need a
 * reader, not a second file. A missing file, a missing champion and a 404 all
 * degrade to "this rung is empty" — never to a throw and never to silence,
 * because rung 5 is below it.
 */
import type { BlizzardManifest, ChampionVoicesConfig } from "./championVoice";
import type { ChampionNamesManifest, ChampionQuotesManifest } from "./nameVoice";
import type { Rng } from "./audioSelect";

/** Path of the generated per-champion voice pack, relative to the content mount. */
export const VOICE_PACK_MANIFEST_PATH = "assets/audio/voices/champions/MANIFEST.json";
/** The line category the click reads out of the pack. */
export const VOICE_PACK_SELECT_CATEGORY = "select";

/**
 * Name-manifest entries whose clip file is NOT on disk. The client cannot stat
 * the content mount, so a rung that resolves to a 404 would be silent — exactly
 * the defect being fixed. This set removes those clips from rung 4 so the
 * champion drops to rung 5 and still speaks.
 *
 * It is PINNED, not guessed: `selectVoiceCoverage.test.ts` asserts it equals the
 * set of name-manifest clips actually missing from `content/`, so regenerating
 * the clip (or losing another one) fails the test instead of quietly changing
 * what a champion says.
 *
 * Today: godie-e00j (皇者 - 騜) — manifest entry present, `.name.mp3` never
 * rendered. Owned by the tts-gen lane, not this one; it drops to its 名言
 * 「ひざまずけ、皇者の御成りだ！」 meanwhile, which is a perfectly good ack.
 */
export const EXCLUDED_NAME_CLIPS: ReadonlySet<string> = new Set([
  "assets/audio/voices/names/godie-e00j.name.mp3",
]);

/** Which rung of the ladder a champion's click is answered from. */
export type SelectVoiceTier = "authored" | "generated" | "soundset" | "name" | "quote";

/** One rung: its name and the clip pool it contributes (possibly empty). */
export interface SelectVoiceRung {
  tier: SelectVoiceTier;
  clips: string[];
}

/** Everything the ladder reads. Every field may be null (→ that rung is empty). */
export interface SelectVoiceInputs {
  voices: ChampionVoicesConfig | null;
  pack: ChampionVoicePack | null;
  /** already gate-resolved: pass null when `fullAssetsEnabled()` is false */
  blizzard: BlizzardManifest | null;
  names: ChampionNamesManifest | null;
  quotes: ChampionQuotesManifest | null;
}

// ── the generated voice pack ────────────────────────────────────────────────

/** One generated clip. `clip` is load-bearing; the rest is provenance/QA. */
export interface VoicePackClip {
  clip: string;
  text: string;
  lang: string;
  durationSec: number;
  /** CAM++ speaker similarity vs the reference, or null when unmeasured */
  speakerSim: number | null;
}

export interface VoicePackEntry {
  engine: string;
  variant: string;
  /** category → clips, in play order. Only "select" is read by the click. */
  lines: Record<string, VoicePackClip[]>;
}

export interface ChampionVoicePack {
  champions: Record<string, VoicePackEntry>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Normalize a manifest clip path onto the content mount ("assets/…"): strips a
 * leading "/content/", "content/" or bare "/" so every spelling the generators
 * emit resolves to the same URL. (Same rule as championVoice/nameVoice.)
 */
export function normalizeVoiceClipPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  let s = path.trim();
  if (s.startsWith("/content/")) s = s.slice("/content/".length);
  else if (s.startsWith("content/")) s = s.slice("content/".length);
  else if (s.startsWith("/")) s = s.slice(1);
  return s.length > 0 ? s : null;
}

/** Tolerant parse of the generated voice pack; null = not usable (rung empty). */
export function voicePackFromDoc(doc: unknown): ChampionVoicePack | null {
  if (!doc || typeof doc !== "object") return null;
  const champs = (doc as { champions?: unknown }).champions;
  if (!champs || typeof champs !== "object") return null;
  const out: Record<string, VoicePackEntry> = {};
  for (const [id, raw] of Object.entries(champs as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { engine?: unknown; variant?: unknown; lines?: unknown };
    const lines: Record<string, VoicePackClip[]> = {};
    if (o.lines && typeof o.lines === "object") {
      for (const [cat, v] of Object.entries(o.lines as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const clips: VoicePackClip[] = [];
        for (const item of v) {
          if (!item || typeof item !== "object") continue;
          const c = item as Record<string, unknown>;
          const clip = normalizeVoiceClipPath(str(c["clip"]));
          if (!clip) continue;
          const sim = c["speakerSim"];
          clips.push({
            clip,
            text: str(c["text"]),
            lang: str(c["lang"]) || "ja",
            durationSec: num(c["durationSec"]),
            speakerSim: typeof sim === "number" && Number.isFinite(sim) ? sim : null,
          });
        }
        if (clips.length > 0) lines[cat] = clips;
      }
    }
    out[id] = { engine: str(o.engine), variant: str(o.variant), lines };
  }
  return { champions: out };
}

/**
 * The generated clip pool for a champion's category (empty when absent). The
 * click reads "select"; the contextual combat-voice layer (contextualVoice.ts)
 * reads the same pack for skill-name.<slot>, crit, hurt, kill-N, defeat, victory,
 * stun/slow/bind and the rest — one manifest, one reader, no second file.
 */
export function packClips(
  pack: ChampionVoicePack | null,
  champId: string,
  category: string,
): VoicePackClip[] {
  const clips = pack?.champions[champId]?.lines?.[category];
  return clips ?? [];
}

/** The generated `select` pool for a champion (empty when the pack has none). */
export function packSelectClips(pack: ChampionVoicePack | null, champId: string): string[] {
  return packClips(pack, champId, VOICE_PACK_SELECT_CATEGORY).map((c) => c.clip);
}

// ── the ladder ──────────────────────────────────────────────────────────────

function normalizedPool(paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const n = normalizeVoiceClipPath(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The 全名 clip of the champ-select call-out, minus the pinned missing files. */
function nameClips(names: ChampionNamesManifest | null, champId: string): string[] {
  const entry = names?.champions[champId];
  if (!entry) return [];
  // The 稱號 (title) half is deliberately NOT pooled in: two DIFFERENT characters
  // can share a 稱號 (妙蛙種子 / 妙蛙花 are both 種子神奇寶貝, byte-identical
  // clip), and a click cue that cannot tell two champions apart is the defect
  // this task is about. The 全名 half collides only between duplicate docs of
  // the SAME character (#113), which is not a legibility failure.
  const pool = entry.voSegments.filter((s) => s.part === "name").map((s) => s.clip);
  const fallback = pool.length > 0 ? pool : [entry.clip];
  return normalizedPool(fallback).filter((c) => !EXCLUDED_NAME_CLIPS.has(c));
}

/**
 * The ordered ladder for one champion — every rung, including the empty ones,
 * so a diagnostics surface can show WHY a champion answers the way it does.
 * `blizzard` must already be gate-resolved by the caller.
 */
export function selectVoiceLadder(champId: string, inputs: SelectVoiceInputs): SelectVoiceRung[] {
  const authored = inputs.voices?.champions[champId]?.select ?? [];
  const soundset: string[] = [];
  if (inputs.blizzard) {
    for (const unit of Object.values(inputs.blizzard.units)) {
      if (unit.champId === champId) {
        const what = unit.clips["what"];
        if (what && what.length > 0) {
          soundset.push(...what);
          break;
        }
      }
    }
  }
  const quote = inputs.quotes?.quotes[champId]?.clip;
  return [
    { tier: "authored", clips: normalizedPool(authored) },
    { tier: "generated", clips: normalizedPool(packSelectClips(inputs.pack, champId)) },
    { tier: "soundset", clips: normalizedPool(soundset) },
    { tier: "name", clips: nameClips(inputs.names, champId) },
    { tier: "quote", clips: quote ? normalizedPool([quote]) : [] },
  ];
}

/** The rung that actually answers the click, or null when every rung is empty. */
export function resolveSelectVoice(
  champId: string,
  inputs: SelectVoiceInputs,
): SelectVoiceRung | null {
  for (const rung of selectVoiceLadder(champId, inputs)) {
    if (rung.clips.length > 0) return rung;
  }
  return null;
}

/**
 * Pick a clip from a pool, avoiding an immediate repeat when the pool allows it.
 * A one-clip pool repeats (that is the pool's fault, not the picker's); a larger
 * pool picks uniformly among the clips that are NOT `last`, so two clicks in a
 * row on the same hero never say the same thing twice.
 */
export function pickSelectClip(
  clips: readonly string[],
  rng: Rng,
  last?: string | null,
): string | null {
  if (clips.length === 0) return null;
  const pool = clips.length > 1 && last ? clips.filter((c) => c !== last) : clips;
  const usable = pool.length > 0 ? pool : clips;
  const i = Math.min(usable.length - 1, Math.max(0, Math.floor(rng() * usable.length)));
  return usable[i] ?? null;
}

/**
 * Playback gain per rung. The name/quote packs are mastered to −16 LUFS for the
 * champ-select call-out's own element (NAME_VO_GAIN 0.95); the map quips and the
 * soundset clips are raw source audio. Matching 0.95 keeps a fallback ack from
 * jumping out louder than the recorded line it stands in for.
 */
export function selectVoiceGain(tier: SelectVoiceTier): number {
  return tier === "name" || tier === "quote" ? 0.95 : 1;
}
