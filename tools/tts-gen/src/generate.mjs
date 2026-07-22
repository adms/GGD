#!/usr/bin/env node
// tts-gen — deterministic macOS TTS clip generator.
//
// Reads a lines manifest (JSON array of {id, lang, text, out, rate?, voice?})
// and produces MP3s via the macOS `say` command (aiff) piped through ffmpeg.
//
//   lang → voice:  see VOICES below. `zh-TW` is DELIBERATELY UNMAPPED — read
//                  the "phantom voices" note. Cast anything else with `voice`.
//   segments:      [{voice|lang, text, rate?}] INSTEAD of `text` — a multi-voice
//                  line. See "segments" below.
//   rate:          optional words-per-minute for `say -r` (announcer lines
//                  want ~190-210 for punch; omit for names → say's default)
//   targetLufs:    PREFERRED loudness target — EBU R128 GATED integrated
//                  loudness (e.g. -16). See "loudness" below.
//   truePeakDb:    true-peak ceiling for targetLufs (default -1.5 dBTP).
//   maxLimitDb:    how much true-peak LIMITING the targetLufs path may use when
//                  a plain gain cannot reach the target (default 6, 0 disables).
//   targetMeanDb:  LEGACY ungated `volumedetect` mean target. Kept only so
//                  packs generated before targetLufs keep their sidecar hashes
//                  and do not spuriously re-render. Do not use for new packs.
//   peakCeilingDb: peak ceiling for the legacy targetMeanDb path (default -2).
//
// ── phantom voices (why this tool probe-renders before it trusts a voice) ────
// `say` accepts an unknown `-v` name, silently renders with the SYSTEM DEFAULT
// voice, and still exits 0. Worse, `say -v '?'` lists voices that are only
// METADATA — advertised but not downloaded. On this machine "Meijia" (zh_TW) is
// exactly that: it is present in the listing, yet `say -v Meijia` renders
// BYTE-IDENTICAL to `say -v ZZ_BOGUS`. A whole zh-TW pack was generated as an
// American man reading Chinese before anyone noticed.
//
// So enumerating `say -v '?'` is NOT sufficient. Every distinct voice a
// manifest asks for is probe-rendered once per run and compared against a
// deliberately bogus voice name; identical bytes ⇒ the voice is a phantom and
// the run aborts. Set `"allowFallbackVoice": true` on a line to opt out (only
// legitimate when you really are casting the system default voice).
//
// Voice names are also LOCALE-DEPENDENT: this machine spells the Japanese
// novelty voice "Grandpa (日文（日本）)", an en_US machine spells the same voice
// "Grandpa (Japanese (Japan))". The wrong spelling does not error — it falls
// back. Names are matched case-insensitively against the live `say -v '?'`
// listing and canonicalised, so a manifest fails loudly on the wrong machine
// instead of shipping silent garbage.
//
// ── segments (multi-voice lines) ────────────────────────────────────────────
// A line normally has ONE voice, so a bilingual line forces one voice to stumble
// through a language it cannot speak. Kyoko does not speak English — it
// transliterates Latin script to katakana (`say -v Kyoko "Fight"` is
// BYTE-IDENTICAL to `say -v Kyoko "ファイト"`) — and a Chinese voice fed pure kana
// renders 0.01 s of digital silence. So a line that legitimately contains two
// languages needs two voices.
//
// `segments: [{voice|lang, text, rate?}]` replaces `text`: each fragment renders
// with its OWN voice and the parts are concatenated. Every macOS voice here
// writes the same container (pcm_s16be, 22050 Hz, mono), so the join is
// `-c copy` — sample-accurate, no resample, no seam artefact (verified:
// 0.9219 + 0.5542 + 0.8259 = 2.3019 s exactly). The signature is re-checked per
// run and a mismatch is a hard failure rather than a silent resample.
//
// Each fragment is duration-checked on its own, because a silent fragment would
// otherwise hide inside a healthy total. Normalisation runs once on the JOINED
// audio, so the fragments stay level-matched relative to each other exactly as
// the voices rendered them.
//
// ── loudness ────────────────────────────────────────────────────────────────
// Apple's voices are NOT level-matched to each other, so a pack that switches
// voice silently changes volume unless it normalises. Prefer `targetLufs`:
// `volumedetect`'s mean_volume is UNGATED — it averages the pauses in — so
// pause-heavy, short, or high-crest-factor (novelty/singing) clips measure
// artificially quiet and get under-gained. EBU R128 gated integrated loudness
// is the metric that matches perceived level.
//
// R128's gate needs a full 400 ms block, so clips shorter than that measure as
// -70 LUFS (the absolute gate floor) — real champion-name clips are 0.35 s and
// hit this. Measurement therefore runs on the audio padded with trailing
// silence; gating discards the padding, and the reading is stable for any pad
// ≥0.4 s (verified identical at 0.4/0.5/1.0/1.5/3.0 s).
//
// Both paths measure the raw aiff and apply the correction in the same pass
// that encodes. Deterministic: the same aiff always measures the same, so a
// re-run reproduces the same mp3.
//
// A plain gain CANNOT always reach the target. Peaky, high-crest-factor voices
// (the bleating one, the creaky one, the wheezy one) hit the true-peak ceiling
// while still 3-5 dB under target — verified not to be an implementation bug:
// ffmpeg's own two-pass `loudnorm` lands on exactly the same numbers (-20.7 /
// -20.6 LUFS) as the static gain for those clips. Closing that last gap needs
// LIMITING, so the targetLufs path adds up to `maxLimitDb` of true-peak
// limiting (4x-oversampled `alimiter`, auto-level OFF — its default makeup gain
// silently re-normalises back to 0 dBFS) and then measures the encoded result
// and corrects once, so clips land on target instead of near it. Limiting is
// BOUNDED and reported per clip: it can never quietly crush a performance.
//
// NOTE this is not the "compression" that an earlier pass correctly rejected.
// That pass was comparing a MEASUREMENT artefact of the ungated metric, where
// static gain / loudnorm / heavy compression all landed within 0.6 dB. Once the
// metric is gated, the residual gap on peaky clips is a real crest-factor
// problem, and limiting is the tool for it.
//
// ── output sanity ───────────────────────────────────────────────────────────
// A near-silent render (e.g. pure kana fed to a Chinese voice produces 0.02 s
// of digital silence) still reports a number to volumedetect, so a "did we
// measure anything" check does not catch it. Renders are rejected when the
// encoded clip is shorter than `minDurationSec` (default 0.15) or when
// normalisation wants more than `maxGainDb` (default +30) of make-up gain.
//
// IDEMPOTENT: each output gets a `<out>.hash` sidecar holding the sha256 of
// voice|rate|text (+ the normalisation target when one is set). When the mp3
// exists and the sidecar matches, the line is skipped. `--force` regenerates
// everything.
//
// These clips are Apple-TTS MACHINE VO. For this project that is a DELIBERATE
// AESTHETIC, not a placeholder — see content/assets/audio/README.md before
// "fixing" a voice that sounds wrong on purpose.
//
// Usage:
//   node tools/tts-gen/src/generate.mjs <manifest.json> [--force] [--rate N] [--quiet]

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/**
 * lang → default voice. ONLY voices verified to actually render on this
 * machine belong here.
 *
 * `zh-TW` is deliberately ABSENT. Its only system voice, Meijia, is a phantom
 * (see the header) — mapping it would silently ship the fallback voice. Cast
 * zh-TW lines with an explicit `voice`, e.g. "Shelley (中文（台灣）)".
 */
const VOICES = Object.freeze({
  "ja-JP": "Kyoko",
  "zh-CN": "Tingting",
  "zh-HK": "Sinji",
});

/** Langs we refuse to default-map, with the reason shown to the author. */
const LANG_NOTES = Object.freeze({
  "zh-TW":
    'zh-TW has no working default voice on macOS: "Meijia" is listed by `say -v \'?\'` but is not installed and renders as the fallback voice. Set an explicit "voice" (e.g. "Shelley (中文（台灣）)").',
});

const MIN_RATE = 90;
const MAX_RATE = 360;

/** Sane bounds for the optional loudness normalisation (see header). */
const MIN_TARGET_DB = -40;
const MAX_TARGET_DB = -3;
const DEFAULT_PEAK_CEILING_DB = -2;
const DEFAULT_TRUE_PEAK_DB = -1.5;

/** Output sanity guards (see header). */
const DEFAULT_MIN_DURATION_SEC = 0.15;
const DEFAULT_MAX_GAIN_DB = 30;

/** Max true-peak limiting the targetLufs path may apply to reach the target. */
const DEFAULT_MAX_LIMIT_DB = 6;
/** Land within this many dB of targetLufs before the corrective pass stops. */
const LUFS_TOLERANCE_DB = 0.3;
/** Corrective re-encodes allowed after limiting (measurement is deterministic). */
const MAX_REFINE_PASSES = 2;

/** Trailing silence added FOR MEASUREMENT ONLY so R128's gate has a full block. */
const MEASURE_PAD_SEC = 1.0;

/** A voice name `say` cannot possibly know — renders as the fallback voice. */
const BOGUS_VOICE = "ZZ_tts_gen_no_such_voice_ZZ";

function fail(msg) {
  console.error(`tts-gen: ${msg}`);
  process.exit(1);
}

// ---- args -------------------------------------------------------------------

const args = process.argv.slice(2);
let manifestPath = null;
let force = false;
let quiet = false;
let defaultRate = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--force") force = true;
  else if (a === "--quiet") quiet = true;
  else if (a === "--rate") {
    defaultRate = Number(args[++i]);
    if (!Number.isFinite(defaultRate)) fail("--rate needs a number");
  } else if (a === "--help" || a === "-h") {
    console.log(
      "usage: node tools/tts-gen/src/generate.mjs <manifest.json> [--force] [--rate N] [--quiet]",
    );
    process.exit(0);
  } else if (a.startsWith("-")) fail(`unknown flag ${a}`);
  else if (manifestPath === null) manifestPath = a;
  else fail(`unexpected argument ${a}`);
}

if (!manifestPath) fail("manifest path required (JSON array of {id, lang, text, out})");

// ---- preflight --------------------------------------------------------------

if (process.platform !== "darwin") fail("requires macOS (`say`)");
for (const bin of ["say", "ffmpeg", "ffprobe"]) {
  const probe = spawnSync("which", [bin], { encoding: "utf8" });
  if (probe.status !== 0) fail(`\`${bin}\` not found on PATH`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-gen-"));
process.on("exit", () => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/**
 * Every voice `say` advertises, lowercased name → canonical name.
 *
 * Lines look like `Name<spaces>locale  # sample`. The name may itself contain
 * spaces and parentheses ("Grandpa (日文（日本）)"), and a long name can leave
 * only ONE space before the locale, so the locale is peeled off the RIGHT
 * rather than split on runs of whitespace.
 */
function listVoices() {
  const r = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  if (r.status !== 0) fail("`say -v '?'` failed — cannot enumerate voices");
  const map = new Map();
  for (const raw of String(r.stdout ?? "").split("\n")) {
    const head = raw.split("#")[0].trimEnd();
    if (!head.trim()) continue;
    const m = /^(.*\S)\s+([A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,4})?)$/.exec(head);
    if (!m) continue;
    map.set(m[1].toLowerCase(), m[1]);
  }
  if (map.size === 0) fail("`say -v '?'` returned no parsable voices");
  return map;
}

const installedVoices = listVoices();

/** sha256 of a tiny render — identical bytes ⇒ `say` used the same voice. */
function probeVoiceHash(voice) {
  const out = path.join(tmpDir, "probe.aiff");
  try {
    execFileSync("say", ["-v", voice, "-o", out, "a"], { stdio: ["ignore", "ignore", "pipe"] });
    const h = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
    fs.rmSync(out, { force: true });
    return h;
  } catch {
    return null;
  }
}

/** Hash of the fallback voice `say` uses when the name is unknown. */
let fallbackHashCache;
function fallbackHash() {
  if (fallbackHashCache === undefined) fallbackHashCache = probeVoiceHash(BOGUS_VOICE);
  return fallbackHashCache;
}

/** voice → true when it is a phantom (renders as the fallback voice). */
const phantomCache = new Map();
function isPhantomVoice(voice) {
  if (!phantomCache.has(voice)) {
    const fb = fallbackHash();
    const h = probeVoiceHash(voice);
    phantomCache.set(voice, fb !== null && h !== null && h === fb);
  }
  return phantomCache.get(voice);
}

// ---- manifest ---------------------------------------------------------------

manifestPath = path.resolve(manifestPath);
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  fail(`cannot read manifest ${manifestPath}: ${e.message}`);
}
if (!Array.isArray(manifest)) fail("manifest must be a JSON array");

const manifestDir = path.dirname(manifestPath);

/**
 * Resolve `voice` (or fall back to the lang→voice map) to a CANONICAL installed
 * voice name, or throw. Shared by whole-line and per-segment casting so a
 * segment can never dodge the phantom check or the locale-spelling trap.
 */
function resolveVoice(rawVoice, lang, where, allowFallbackVoice) {
  let voice = rawVoice;
  if (voice !== undefined && (typeof voice !== "string" || voice === "")) {
    throw new Error(`${where}: "voice" must be a non-empty string when present`);
  }
  if (!voice) {
    voice = VOICES[lang];
    if (!voice) {
      const note = LANG_NOTES[lang];
      throw new Error(
        note
          ? `${where}: ${note}`
          : `${where}: unsupported lang "${lang}" (supported: ${Object.keys(VOICES).join(", ")}) and no explicit "voice"`,
      );
    }
  }

  // Canonicalise against the live listing: catches typos AND the locale-spelling
  // trap ("Grandpa (Japanese (Japan))" on a zh_TW machine), which `say` would
  // otherwise answer with the fallback voice and exit 0.
  const canonical = installedVoices.get(voice.toLowerCase());
  if (!canonical) {
    throw new Error(
      `${where}: voice "${voice}" is not installed. \`say -v '?'\` does not list it — ` +
        `note voice names are LOCALE-DEPENDENT (this machine spells them e.g. "${
          installedVoices.get("grandpa (日文（日本）)") ?? "Grandpa (…)"
        }").`,
    );
  }
  voice = canonical;

  if (!allowFallbackVoice && isPhantomVoice(voice)) {
    throw new Error(
      `${where}: voice "${voice}" is a PHANTOM — it is listed by \`say -v '?'\` but not ` +
        `installed, and renders BYTE-IDENTICAL to an unknown voice name (i.e. \`say\` silently ` +
        `fell back to the system default). Install it in System Settings → Accessibility → ` +
        `Spoken Content → Voices, or cast a different voice. If you really mean the system ` +
        `default voice, set "allowFallbackVoice": true on this line.`,
    );
  }
  return voice;
}

/** Validate an optional wpm rate, returning a rounded number or null. */
function normalizeRate(raw, where) {
  if (raw === null || raw === undefined) return null;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    throw new Error(`${where}: "rate" must be ${MIN_RATE}-${MAX_RATE} wpm`);
  }
  return Math.round(rate);
}

/** Validate one manifest line; returns a normalized job or throws. */
function normalize(line, idx) {
  const where = `line ${idx}${line && line.id ? ` (id=${line.id})` : ""}`;
  if (typeof line !== "object" || line === null) throw new Error(`${where}: not an object`);
  const { id, lang, text, out } = line;
  if (typeof id !== "string" || id === "") throw new Error(`${where}: "id" required`);
  if (typeof out !== "string" || !out.endsWith(".mp3")) throw new Error(`${where}: "out" must be an .mp3 path`);

  const allowFallbackVoice = line.allowFallbackVoice === true;
  const hasSegments = line.segments !== undefined;

  if (hasSegments) {
    if (text !== undefined) throw new Error(`${where}: set "text" or "segments", not both`);
    if (line.voice !== undefined) {
      throw new Error(`${where}: with "segments", cast the voice on each SEGMENT, not the line`);
    }
    if (!Array.isArray(line.segments) || line.segments.length === 0) {
      throw new Error(`${where}: "segments" must be a non-empty array of {voice|lang, text}`);
    }
  } else if (typeof text !== "string" || text.trim() === "") {
    throw new Error(`${where}: "text" required (or "segments")`);
  }

  const rate = normalizeRate(line.rate ?? defaultRate, where);

  // Whole-line casting, or per-segment casting for a multi-voice line.
  let voice = null;
  let segments = null;
  if (hasSegments) {
    segments = line.segments.map((seg, si) => {
      const sWhere = `${where} segment ${si}`;
      if (typeof seg !== "object" || seg === null) throw new Error(`${sWhere}: not an object`);
      if (typeof seg.text !== "string" || seg.text.trim() === "") {
        throw new Error(`${sWhere}: "text" required`);
      }
      return {
        voice: resolveVoice(seg.voice, seg.lang ?? lang, sWhere, seg.allowFallbackVoice === true),
        lang: seg.lang ?? lang,
        rate: normalizeRate(seg.rate ?? line.rate ?? defaultRate, sWhere),
        text: seg.text.trim(),
      };
    });
  } else {
    voice = resolveVoice(line.voice, lang, where, allowFallbackVoice);
  }

  let targetLufs = line.targetLufs ?? null;
  if (targetLufs !== null) {
    targetLufs = Number(targetLufs);
    if (!Number.isFinite(targetLufs) || targetLufs < MIN_TARGET_DB || targetLufs > MAX_TARGET_DB) {
      throw new Error(`${where}: "targetLufs" must be ${MIN_TARGET_DB}..${MAX_TARGET_DB} LUFS`);
    }
  }

  let targetMeanDb = line.targetMeanDb ?? null;
  if (targetMeanDb !== null) {
    targetMeanDb = Number(targetMeanDb);
    if (!Number.isFinite(targetMeanDb) || targetMeanDb < MIN_TARGET_DB || targetMeanDb > MAX_TARGET_DB) {
      throw new Error(`${where}: "targetMeanDb" must be ${MIN_TARGET_DB}..${MAX_TARGET_DB} dB`);
    }
  }
  if (targetLufs !== null && targetMeanDb !== null) {
    throw new Error(`${where}: set "targetLufs" (preferred) or "targetMeanDb", not both`);
  }

  let truePeakDb = line.truePeakDb ?? null;
  if (truePeakDb !== null) {
    truePeakDb = Number(truePeakDb);
    if (!Number.isFinite(truePeakDb) || truePeakDb < MIN_TARGET_DB || truePeakDb > 0) {
      throw new Error(`${where}: "truePeakDb" must be ${MIN_TARGET_DB}..0 dBTP`);
    }
  } else if (targetLufs !== null) {
    truePeakDb = DEFAULT_TRUE_PEAK_DB;
  }

  let peakCeilingDb = line.peakCeilingDb ?? null;
  if (peakCeilingDb !== null) {
    peakCeilingDb = Number(peakCeilingDb);
    if (!Number.isFinite(peakCeilingDb) || peakCeilingDb < MIN_TARGET_DB || peakCeilingDb > 0) {
      throw new Error(`${where}: "peakCeilingDb" must be ${MIN_TARGET_DB}..0 dB`);
    }
  } else if (targetMeanDb !== null) {
    peakCeilingDb = DEFAULT_PEAK_CEILING_DB;
  }

  let maxLimitDb = line.maxLimitDb ?? DEFAULT_MAX_LIMIT_DB;
  maxLimitDb = Number(maxLimitDb);
  if (!Number.isFinite(maxLimitDb) || maxLimitDb < 0) {
    throw new Error(`${where}: "maxLimitDb" must be a non-negative number`);
  }

  let minDurationSec = line.minDurationSec ?? DEFAULT_MIN_DURATION_SEC;
  minDurationSec = Number(minDurationSec);
  if (!Number.isFinite(minDurationSec) || minDurationSec < 0) {
    throw new Error(`${where}: "minDurationSec" must be a non-negative number`);
  }

  let maxGainDb = line.maxGainDb ?? DEFAULT_MAX_GAIN_DB;
  maxGainDb = Number(maxGainDb);
  if (!Number.isFinite(maxGainDb) || maxGainDb <= 0) {
    throw new Error(`${where}: "maxGainDb" must be a positive number`);
  }

  return {
    id,
    voice,
    segments,
    rate,
    targetLufs,
    truePeakDb,
    maxLimitDb,
    targetMeanDb,
    peakCeilingDb,
    minDurationSec,
    maxGainDb,
    // For a segmented line this is the joined spoken string — used for logging
    // and nothing else; each fragment is rendered from its own segment text.
    text: hasSegments ? segments.map((s) => s.text).join(" ") : text.trim(),
    out: path.isAbsolute(out) ? out : path.resolve(manifestDir, out),
  };
}

/**
 * Read `volumedetect`'s mean/max volume (dBFS) for a file. Returns null when
 * ffmpeg reports neither (e.g. a fully silent render).
 */
function detectVolume(file) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const out = `${r.stderr ?? ""}`;
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(out);
  const max = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(out);
  if (!mean || !max) return null;
  return { mean: Number(mean[1]), max: Number(max[1]) };
}

/**
 * EBU R128 gated integrated loudness (LUFS) + true peak (dBTP).
 *
 * Measured on the audio padded with trailing silence: R128's gate needs a full
 * 400 ms block, and without the pad any clip shorter than that reads -70 LUFS
 * (the absolute gate floor). Gating discards the silence, so the pad does not
 * bias the result — verified stable for pads of 0.4 s … 3.0 s.
 *
 * Returns null when no gated block survived (i.e. the render really is silent).
 */
function detectLoudness(file) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-af",
      `apad=pad_dur=${MEASURE_PAD_SEC},ebur128=peak=true`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const out = `${r.stderr ?? ""}`;
  const summary = out.slice(out.lastIndexOf("Summary:"));
  const i = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(summary);
  const peak = /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(summary);
  if (!i || !peak) return null;
  const lufs = Number(i[1]);
  // -70 LUFS is the absolute-gate floor: nothing was loud enough to count.
  if (!Number.isFinite(lufs) || lufs <= -70) return null;
  return { lufs, truePeak: Number(peak[1]) };
}

/** Encoded duration in seconds, or null when ffprobe cannot read one. */
function probeDuration(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const d = Number(String(r.stdout ?? "").trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

/**
 * Container/stream signature of an audio file, as `codec|rate|channels|fmt`.
 *
 * Concatenating with `-c copy` is only sample-exact when every part shares one
 * signature. Every macOS voice on this machine writes pcm_s16be/22050/mono, so
 * segments join with no resample and no seam artefact — but that is VERIFIED per
 * run rather than assumed, because a mismatched part would otherwise be joined
 * into garbage (or silently resampled, which is how this project shipped a whole
 * pack in the wrong voice once already).
 */
function probeStreamSignature(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,channels,sample_fmt",
      "-of", "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return String(r.stdout ?? "").trim();
}

/**
 * Render one line to a single aiff at `dest`.
 *
 * Single-voice lines are one `say` call. SEGMENTED lines render each fragment
 * with its OWN voice and concatenate — the only way to switch voice inside a
 * line, and the reason a bilingual call-out can give each language to a voice
 * that actually speaks it instead of making one voice stumble through both.
 *
 * Each fragment is duration-checked INDIVIDUALLY: a silent fragment (a Chinese
 * voice fed pure kana yields ~0.01 s of digital silence) would otherwise be
 * masked by the healthy fragments in the joined total.
 *
 * Returns the temp files it created, for cleanup.
 */
function renderSpeech(job, idx, dest) {
  const say = (voice, rate, text, out) => {
    const args = ["-v", voice];
    if (rate !== null) args.push("-r", String(rate));
    args.push("-o", out, text);
    execFileSync("say", args, { stdio: ["ignore", "ignore", "pipe"] });
  };

  if (!job.segments) {
    say(job.voice, job.rate, job.text, dest);
    return [];
  }

  const parts = [];
  const sigs = new Map();
  job.segments.forEach((seg, si) => {
    const part = path.join(tmpDir, `${idx}-seg${si}.aiff`);
    parts.push(part);
    say(seg.voice, seg.rate, seg.text, part);

    const dur = probeDuration(part);
    if (dur === null) throw new Error(`segment ${si} (${seg.voice}) produced unreadable audio`);
    if (dur < job.minDurationSec) {
      throw new Error(
        `segment ${si} (${seg.voice}) rendered ${dur.toFixed(3)}s, under the ` +
          `${job.minDurationSec}s floor — that voice almost certainly cannot pronounce ` +
          `"${seg.text}". Recast this fragment's voice or rewrite it.`,
      );
    }
    sigs.set(probeStreamSignature(part), si);
  });

  if (sigs.size > 1) {
    const detail = [...sigs.entries()].map(([sig, si]) => `segment ${si}: ${sig}`).join("; ");
    throw new Error(
      `segments do not share one stream format, so they cannot be concatenated ` +
        `sample-exactly (${detail}). Re-cast the line to voices with a matching format.`,
    );
  }

  const listFile = path.join(tmpDir, `${idx}-concat.txt`);
  parts.push(listFile);
  fs.writeFileSync(listFile, parts.slice(0, job.segments.length).map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", dest],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return parts;
}

/** Sample rate of the first audio stream (`say` writes 22050 Hz), or a default. */
function probeSampleRate(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const sr = Number(String(r.stdout ?? "").trim());
  return Number.isFinite(sr) && sr > 0 ? sr : 22050;
}

/** dB → linear amplitude (alimiter's `limit` is linear). */
function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * ffmpeg -af chain for the R128 path.
 *
 * Without limiting this is a single `volume`. With limiting the signal is
 * oversampled 4x around `alimiter` so INTERSAMPLE peaks are caught (alimiter is
 * a sample-peak limiter: at 1x it lets true peak overshoot to ~0 dBFS), and
 * `level=false` disables its auto-makeup gain, which otherwise re-normalises
 * the output straight back up to full scale and defeats the ceiling.
 */
function loudnessFilter(gainDb, limiting, truePeakDb, sampleRate) {
  const parts = [];
  if (gainDb !== 0) parts.push(`volume=${gainDb}dB`);
  if (limiting) {
    parts.push(
      `aresample=${sampleRate * 4}`,
      `alimiter=limit=${dbToLinear(truePeakDb).toFixed(6)}:level=false:attack=1:release=20`,
      `aresample=${sampleRate}`,
    );
  }
  return parts.join(",");
}

/**
 * Gain (dB) that pulls `measured` to `target` without pushing the measured peak
 * past `ceiling`. Rounded to 0.1 dB so the value is stable across runs.
 */
function normalisationGainDb(measured, target, peak, ceiling) {
  const wanted = target - measured;
  const headroom = ceiling - peak;
  return Math.round(Math.min(wanted, headroom) * 10) / 10;
}

// ---- generation -------------------------------------------------------------

/**
 * Content hash for idempotence: same voice+rate+text(+normalisation) ⇒ same clip.
 * The normalisation suffix is appended ONLY when a target is set, so packs that
 * predate each feature keep their existing sidecar hashes and are not re-rendered.
 */
function contentHash(job) {
  // Segmented lines get their own key SHAPE, so adding segments support cannot
  // change the hash of any pre-existing single-voice line (no spurious re-render).
  let key = job.segments
    ? `tts-gen v1|segments|${job.segments
        .map((s) => `${s.voice}:${s.rate ?? "default"}:${s.text}`)
        .join("|")}`
    : `tts-gen v1|${job.voice}|${job.rate ?? "default"}|${job.text}`;
  if (job.targetMeanDb !== null) key += `|norm:${job.targetMeanDb}:${job.peakCeilingDb}`;
  if (job.targetLufs !== null) key += `|r128:${job.targetLufs}:${job.truePeakDb}:${job.maxLimitDb}`;
  return createHash("sha256").update(key).digest("hex");
}

let generated = 0;
let skipped = 0;
let failed = 0;

manifest.forEach((line, idx) => {
  let job;
  try {
    job = normalize(line, idx);
  } catch (e) {
    console.error(`tts-gen: ${e.message}`);
    failed++;
    return;
  }

  const hash = contentHash(job);
  const sidecar = `${job.out}.hash`;
  if (!force && fs.existsSync(job.out) && fs.existsSync(sidecar)) {
    if (fs.readFileSync(sidecar, "utf8").trim() === hash) {
      skipped++;
      if (!quiet) console.log(`  skip  ${job.id} (up to date)`);
      return;
    }
  }

  const aiff = path.join(tmpDir, `${idx}.aiff`);
  const tmpMp3 = path.join(tmpDir, `${idx}.mp3`);
  let parts = [];
  try {
    parts = renderSpeech(job, idx, aiff);

    // Reject a degenerate render (e.g. kana fed to a Chinese voice → ~0.02 s of
    // digital silence) BEFORE it can be measured, gained up and shipped.
    const rawDur = probeDuration(aiff);
    if (rawDur === null) throw new Error("`say` produced unreadable audio");
    if (rawDur < job.minDurationSec) {
      throw new Error(
        `render is ${rawDur.toFixed(3)}s, under the ${job.minDurationSec}s floor — the voice ` +
          `almost certainly cannot pronounce this text (a Chinese voice fed pure kana yields ` +
          `digital silence). Recast the voice or rewrite the line.`,
      );
    }

    // Loudness normalisation, measured on the raw aiff so the correction is
    // applied in the same pass that encodes (no mp3→mp3 hop).
    let gainDb = 0;
    let limiting = false;
    let limitDb = 0;
    let targetLabel = "";
    const sampleRate = probeSampleRate(aiff);

    if (job.targetLufs !== null) {
      const m = detectLoudness(aiff);
      if (!m) throw new Error("no gated loudness block (silent render?)");
      targetLabel = `${job.targetLufs}LUFS`;
      const wanted = job.targetLufs - m.lufs;
      const headroom = job.truePeakDb - m.truePeak;
      if (wanted <= headroom || job.maxLimitDb === 0) {
        // A plain gain reaches the target (or limiting is switched off).
        gainDb = Math.round(Math.min(wanted, headroom) * 10) / 10;
      } else {
        // Peak ceiling binds first — spend up to maxLimitDb of limiting on the gap.
        limiting = true;
        limitDb = Math.round(Math.min(wanted - headroom, job.maxLimitDb) * 10) / 10;
        gainDb = Math.round((headroom + limitDb) * 10) / 10;
      }
    } else if (job.targetMeanDb !== null) {
      const measured = detectVolume(aiff);
      if (!measured) throw new Error("volumedetect reported no level (silent render?)");
      gainDb = normalisationGainDb(measured.mean, job.targetMeanDb, measured.max, job.peakCeilingDb);
      targetLabel = `${job.targetMeanDb}dB`;
    }
    if (gainDb > job.maxGainDb) {
      throw new Error(
        `normalisation wants +${gainDb}dB (over the +${job.maxGainDb}dB cap) — the source is ` +
          `effectively silent, so this would ship amplified noise.`,
      );
    }

    const encode = (g) => {
      const args = ["-y", "-loglevel", "error", "-i", aiff];
      const af = loudnessFilter(g, limiting, job.truePeakDb, sampleRate);
      if (af) args.push("-af", af);
      args.push("-codec:a", "libmp3lame", "-q:a", "4", tmpMp3);
      execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    };
    encode(gainDb);

    // Limiting also removes loudness, so a single pass lands ~1 dB short.
    // Measure what actually came out and correct — bounded, and deterministic
    // because every measurement here is.
    if (limiting) {
      for (let pass = 0; pass < MAX_REFINE_PASSES; pass++) {
        const got = detectLoudness(tmpMp3);
        if (!got) break;
        const delta = job.targetLufs - got.lufs;
        if (Math.abs(delta) <= LUFS_TOLERANCE_DB) break;
        const next = Math.round((gainDb + delta) * 10) / 10;
        if (next > job.maxGainDb || next === gainDb) break;
        gainDb = next;
        encode(gainDb);
      }
    }

    const outDur = probeDuration(tmpMp3);
    if (outDur === null || outDur < job.minDurationSec) {
      throw new Error(`encoded clip is ${outDur ?? 0}s, under the ${job.minDurationSec}s floor`);
    }

    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    fs.copyFileSync(tmpMp3, job.out); // copy then sidecar: sidecar written last
    fs.writeFileSync(sidecar, `${hash}\n`);
    generated++;
    if (!quiet) {
      const r = job.rate !== null ? ` @${job.rate}wpm` : "";
      const g = gainDb !== 0 ? ` ${gainDb > 0 ? "+" : ""}${gainDb}dB→${targetLabel}` : "";
      const lim = limiting ? ` limit-${limitDb}dB` : "";
      const cast = job.segments ? job.segments.map((s) => s.voice).join("+") : job.voice;
      console.log(
        `  gen   ${job.id} → ${path.relative(process.cwd(), job.out)} [${cast}${r}${g}${lim}] ${outDur.toFixed(2)}s`,
      );
    }
  } catch (e) {
    const detail = e.stderr ? String(e.stderr).trim().split("\n").pop() : e.message;
    console.error(`tts-gen: ${job.id}: ${detail}`);
    failed++;
  } finally {
    for (const f of [aiff, tmpMp3, ...parts]) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

console.log(`tts-gen: ${generated} generated, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
