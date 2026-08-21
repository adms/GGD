"""sampler — REAL instrument samples, replacing the synthesised kit.

owner 2026-08-22 (GH#531):

    「樂器聲音 最好上網抓音色庫 不要用合成的品質太差」

So the pitched instruments and the drum kit no longer come from oscillators.
They come from **MuseScore_General.sf3** (MIT licence, S. Christian Collins,
after FluidR3Mono/FluidR3 by Michael Cowgill and Frank Wen) — a General MIDI
SoundFont of real recorded instruments — played by **fluidsynth**.

⚠️ THIS CHANGES A DOCUMENTED INVARIANT. `README.md` used to open with "there is
no sampled audio anywhere in this tool, no soundfont, no download". That is now
false, and the README says so instead of quietly keeping the old sentence
(第一·五守則: a claim that stopped being true is a lie, not a stale comment).
What SURVIVES is the property that actually mattered:

    same score + same seed + same soundfont ⇒ byte-identical mp3

because the soundfont is committed, fluidsynth is deterministic (no dither, no
randomness, reverb and chorus explicitly OFF), and the bank is content-hashed.

------------------------------------------------------------------ THE DESIGN

⛔ NOT "call fluidsynth per note" — the scores schedule thousands of notes and a
subprocess each would take hours. ⛔ NOT "parse the SF2 in Python" — that is
re-implementing a sampler (velocity layers, loop points, filters, modulators)
badly.

Instead: **a pre-rendered note bank.** For each voice, ONE fluidsynth pass lays
every pitch it can play, at two velocities, end to end in a single MIDI file;
the result is sliced into per-note arrays and cached to
`tools/bgm-gen/sf/bank/<voice>.npz`. After that, playing a note is a slice, a
resample-free lookup, and an envelope — which is what a sampler is.

⭐ THE SEAM IS ONE FUNCTION. `voices.make()` is documented as "the single entry
point", so routing it here gives every existing layer method (`ostinato`,
`chords`, `melody`, `lead`, `bass`, `drum`, `drumkit`, `arp`) real samples with
no edit to `score.py` and no edit to any score.

⚠️ LEVEL DISCIPLINE. `voices.TRIM` exists so that `gain=1.0` means the same
loudness for every synth voice, and the whole pack's balance is calibrated
against it. Sampled notes are therefore normalised to the SAME −12 dBFS RMS
reference — otherwise every `gain=` in every score silently changes meaning.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys

import numpy as np

from . import midiwrite as M
from .audio import SR

HERE = os.path.dirname(os.path.abspath(__file__))
SF_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "sf"))
SF2 = os.path.join(SF_DIR, "MuseScore_General.sf3")
BANK_DIR = os.path.join(SF_DIR, "bank")

#: The bank's reference level. Identical to `voices.TRIM`'s target so that a
#: score's `gain=` keeps its meaning across the synth→sample switch.
REF_RMS = 10 ** (-12.0 / 20.0)

NOTE_SEC = 4.2          # how long each banked note is held
TAIL_SEC = 1.3          # release captured after note-off
SLOT_SEC = NOTE_SEC + TAIL_SEC
VELS = (72, 112)        # two real velocity layers, not one scaled by amplitude

# --------------------------------------------------------------- the mapping
#
# GGD voice name -> the General MIDI preset that replaces it, plus the pitch
# range that voice is ever asked for. Ranges are deliberately tight: the bank
# build time and size are linear in (hi - lo), and a cello sample transposed
# three octaves up is not a violin.

PITCHED: dict[str, dict] = {
    # the originals, now real
    "piano":    dict(prog=0,   lo=21, hi=100, name="Acoustic Grand Piano"),
    "strings":  dict(prog=48,  lo=28, hi=96,  name="String Ensemble 1"),
    "pluck":    dict(prog=45,  lo=28, hi=96,  name="Pizzicato Strings"),
    "guitar":   dict(prog=30,  lo=28, hi=88,  name="Distortion Guitar"),
    "supersaw": dict(prog=81,  lo=33, hi=100, name="Lead 2 (sawtooth)"),
    "pad":      dict(prog=89,  lo=24, hi=96,  name="Pad 2 (warm)"),
    "sub":      dict(prog=38,  lo=16, hi=64,  name="Synth Bass 1"),
    "reese":    dict(prog=39,  lo=16, hi=64,  name="Synth Bass 2"),
    "timpani":  dict(prog=47,  lo=28, hi=64,  name="Timpani"),
    # NEW — the 進擊の巨人 register the synth kit could not reach at all
    "horn":     dict(prog=60,  lo=34, hi=77,  name="French Horn"),
    "brass":    dict(prog=61,  lo=36, hi=84,  name="Brass Section"),
    "trombone": dict(prog=57,  lo=34, hi=77,  name="Trombone"),
    "trumpet":  dict(prog=56,  lo=52, hi=88,  name="Trumpet"),
    "harp":     dict(prog=46,  lo=24, hi=96,  name="Orchestral Harp"),
    "cello":    dict(prog=42,  lo=26, hi=72,  name="Cello"),
    "tremolo":  dict(prog=44,  lo=28, hi=92,  name="Tremolo Strings"),
    # NEW — the per-map colours the arenas actually asked for
    "koto":     dict(prog=107, lo=40, hi=88,  name="Koto"),
    "shamisen": dict(prog=106, lo=40, hi=88,  name="Shamisen"),
    "taiko":    dict(prog=116, lo=28, hi=60,  name="Taiko Drum"),
    "organ":    dict(prog=19,  lo=24, hi=96,  name="Church Organ"),
    # NEW — the 梶浦由記 / Fate register (2026-08-22, owner:「拆解 FATE 系列的元素…
    # 目前聽起來有點太現代了」). ⭐ These are not decoration: a solo violin, a
    # harpsichord and tubular bells are the three sounds that place a cue in
    # that world, and none of them existed in the oscillator kit OR in the bank
    # until now — which is most of why every track reached for a supersaw.
    "violin":   dict(prog=40,  lo=55, hi=100, name="Violin"),
    "viola":    dict(prog=41,  lo=48, hi=88,  name="Viola"),
    "harpsi":   dict(prog=6,   lo=29, hi=89,  name="Harpsichord"),
    "glock":    dict(prog=9,   lo=72, hi=108, name="Glockenspiel"),
    "celesta":  dict(prog=8,   lo=60, hi=108, name="Celesta"),
    "bells":    dict(prog=14,  lo=48, hi=84,  name="Tubular Bells"),
    "flute":    dict(prog=73,  lo=59, hi=96,  name="Flute"),
    "oboe":     dict(prog=68,  lo=58, hi=91,  name="Oboe"),
    "contrabass": dict(prog=43, lo=28, hi=60, name="Contrabass"),
    # owner 2026-08-22 逐張點名的時代樂器
    "bagpipe":  dict(prog=109, lo=55, hi=84,  name="Bagpipe"),      # 魔獸人類主題的凱爾特風
    "xylo":     dict(prog=13,  lo=65, hi=96,  name="Xylophone"),    # 骷髏／死亡之舞
    "synthdrum":dict(prog=118, lo=36, hi=72,  name="Synth Drum"),   # 808／工業打擊
    "choir":    dict(prog=52,  lo=36, hi=84,  name="Choir Aahs"),
    "voiceoo":  dict(prog=53,  lo=36, hi=84,  name="Voice Oohs"),
}

#: Percussion: GM channel 10 key map. One "pitch" each, two velocities.
PERCUSSION: dict[str, dict] = {
    "kick":    dict(key=36, name="Bass Drum 1"),
    "snare":   dict(key=38, name="Acoustic Snare"),
    "hat":     dict(key=42, name="Closed Hi-Hat"),
    "openhat": dict(key=46, name="Open Hi-Hat"),
    "clap":    dict(key=39, name="Hand Clap"),
    "cymbal":  dict(key=49, name="Crash Cymbal 1"),
}

#: Voices that hold indefinitely and may need to loop past the banked length.
SUSTAINING = {"strings", "pad", "supersaw", "horn", "brass", "trombone",
              "trumpet", "organ", "choir", "voiceoo", "tremolo", "sub", "reese",
              "violin", "viola", "flute", "oboe", "contrabass"}


#: The master switch. ON whenever the soundfont + a built bank are present;
#: `GGD_BGM_SYNTH=1` forces the old oscillator kit back (for A/B, and so a
#: machine with no fluidsynth can still render the pack). ⛔ Not a silent
#: fallback: `render.py` prints which kit produced the track, because "the
#: samples quietly did not load" and "the samples loaded" must never look the
#: same (第二守則: fail-open 沒錯,靜默才是缺陷).
def enabled() -> bool:
    if os.environ.get("GGD_BGM_SYNTH"):
        return False
    return os.path.exists(SF2) and os.path.isdir(BANK_DIR)


def kit_name() -> str:
    return "samples(MuseScore_General)" if enabled() else "synth(oscillators)"


def available() -> bool:
    return os.path.exists(SF2) and shutil.which("fluidsynth") is not None


def sf2_hash() -> str:
    h = hashlib.sha256()
    with open(SF2, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


# ------------------------------------------------------------- bank building

def _render_midi(mid: str, wav: str) -> None:
    """One fluidsynth pass. Reverb and chorus OFF — the pack applies its own
    cathedral, and a soundfont's own reverb baked into a sample cannot be
    removed later."""
    r = subprocess.run(
        ["fluidsynth", "-ni", "-F", wav, "-r", str(SR), "-g", "1.0",
         "-R", "0", "-C", "0", "-o", "synth.sample-rate=%d" % SR,
         SF2, mid],
        capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(wav):
        raise RuntimeError(f"fluidsynth failed on {mid}:\n{r.stderr[-800:]}")


def _slice(wav: str, count: int) -> list[np.ndarray]:
    from .audio import read_wav
    x, _ = read_wav(wav)
    m = x.mean(axis=0) if x.ndim > 1 else x        # bank is mono; width is ours
    slot = int(SLOT_SEC * SR)
    out = []
    for i in range(count):
        seg = m[i * slot:(i + 1) * slot]
        if len(seg) < slot:
            seg = np.pad(seg, (0, slot - len(seg)))
        out.append(np.ascontiguousarray(seg, dtype=np.float32))
    return out


def _build_voice(voice: str, tmp: str) -> dict[str, np.ndarray]:
    """Render every (pitch, velocity) of one voice in a single pass."""
    perc = voice in PERCUSSION
    spec = PERCUSSION[voice] if perc else PITCHED[voice]
    pitches = [spec["key"]] if perc else list(range(spec["lo"], spec["hi"] + 1))
    ch = 9 if perc else 0

    ev: list[tuple[int, bytes]] = []
    if not perc:
        ev.append((0, M.program(ch, spec["prog"])))
    # 1 quarter = 0.5 s at 120 bpm, so a slot of SLOT_SEC seconds is:
    slot_ticks = int(round(SLOT_SEC * 2 * M.TPQ))
    hold_ticks = int(round(NOTE_SEC * 2 * M.TPQ))
    i = 0
    for vel in VELS:
        for p in pitches:
            t = i * slot_ticks
            ev.append((t + 1, M.note_on(ch, p, vel)))
            ev.append((t + hold_ticks, M.note_off(ch, p)))
            i += 1
    mid = os.path.join(tmp, f"{voice}.mid")
    wav = os.path.join(tmp, f"{voice}.wav")
    M.write(mid, ev, bpm=120.0)
    _render_midi(mid, wav)
    segs = _slice(wav, i)

    # One TRIM for the whole voice — computed from the loudest velocity layer's
    # median RMS, so the relative dynamics BETWEEN pitches and velocities (which
    # are the point of using real samples) survive intact.
    loud = segs[len(pitches):] or segs
    rms = np.array([float(np.sqrt(np.mean(s[:int(1.0 * SR)] ** 2))) for s in loud])
    ref = float(np.median(rms[rms > 1e-6])) if np.any(rms > 1e-6) else 1.0
    k = REF_RMS / (ref or 1.0)
    data = {"pitches": np.array(pitches, dtype=np.int16),
            "vels": np.array(VELS, dtype=np.int16)}
    for j, s in enumerate(segs):
        data[f"s{j}"] = (s * k).astype(np.float32)
    return data


def build_bank(voices_: list[str] | None = None, force: bool = False) -> list[str]:
    """Build (or refresh) the note bank. Returns the voices actually rendered."""
    if not available():
        raise RuntimeError(
            "sampler: need fluidsynth on PATH and the soundfont at\n  " + SF2 +
            "\nInstall: brew install fluid-synth; then tools/bgm-gen/sf/FETCH.sh")
    os.makedirs(BANK_DIR, exist_ok=True)
    want = voices_ or (list(PITCHED) + list(PERCUSSION))
    tag = sf2_hash()
    done = []
    tmp = os.path.join(BANK_DIR, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    for v in want:
        out = os.path.join(BANK_DIR, f"{v}.{tag}.npz")
        if os.path.exists(out) and not force:
            continue
        print(f"  bank {v:10s} …", end="", flush=True)
        data = _build_voice(v, tmp)
        np.savez_compressed(out, **data)
        n = len([k for k in data if k.startswith("s")])
        print(f" {n} notes  {os.path.getsize(out)/1e6:.1f} MB")
        done.append(v)
    shutil.rmtree(tmp, ignore_errors=True)
    return done


# ---------------------------------------------------------------- playback

_CACHE: dict[str, dict] = {}


def _bank(voice: str) -> dict | None:
    if voice in _CACHE:
        return _CACHE[voice]
    if not os.path.exists(SF2):
        return None
    path = os.path.join(BANK_DIR, f"{voice}.{sf2_hash()}.npz")
    if not os.path.exists(path):
        return None
    z = np.load(path)
    b = {"pitches": z["pitches"], "vels": z["vels"],
         "notes": [z[f"s{i}"] for i in range(len(z.files) - 2)]}
    _CACHE[voice] = b
    return b


def has(voice: str) -> bool:
    return _bank(voice) is not None


def _loop_to(x: np.ndarray, n: int) -> np.ndarray:
    """Extend a banked note to `n` samples by crossfade-looping its sustain.

    ⛔ Not `np.tile` — a hard wrap in the middle of a bowed string is an audible
    click, and it would land on every long chord in the pack."""
    if n <= len(x):
        return x[:n].copy()
    a, b = int(0.9 * SR), int(len(x) - 1.4 * SR)          # the sustain window
    if b - a < int(0.25 * SR):
        return np.pad(x, (0, n - len(x)))
    seg = x[a:b]
    xf = int(min(0.12 * SR, len(seg) * 0.4))
    fade_in = np.linspace(0.0, 1.0, xf)
    y = np.zeros(n, dtype=np.float32)
    y[:len(x)] = x
    pos = len(x) - xf
    while pos < n:
        m = min(len(seg), n - pos)
        if m <= xf:
            break
        chunk = seg[:m].copy()
        chunk[:xf] *= fade_in
        y[pos:pos + xf] *= np.linspace(1.0, 0.0, xf) if pos + xf <= n else 1.0
        y[pos:pos + m] += chunk
        pos += m - xf
    return y


def note(voice: str, n: int, f0: float | None, vel: float = 0.8) -> np.ndarray | None:
    """One sampled note: nearest banked pitch, nearest velocity layer, fitted to
    `n` samples with a short release so it never ends on a step."""
    b = _bank(voice)
    if b is None:
        return None
    pitches, vels, notes = b["pitches"], b["vels"], b["notes"]
    if len(pitches) == 1:
        idx_p, cents = 0, 0.0
    else:
        midi = 69.0 + 12.0 * np.log2(max(1e-6, float(f0 or 440.0)) / 440.0)
        idx_p = int(np.argmin(np.abs(pitches - midi)))
        cents = float(midi - pitches[idx_p])          # residual, ≤ half a semitone
    v = float(np.clip(vel, 0.0, 1.0)) * 127.0
    idx_v = int(np.argmin(np.abs(vels - v)))
    x = notes[idx_v * len(pitches) + idx_p]

    # Residual detune: the bank is per-semitone, so this is only ever ≤ 50 cents
    # — small enough that plain linear resampling costs no audible quality and
    # keeps the note exactly in tune with the rest of the mix.
    if abs(cents) > 1e-3:
        ratio = 2.0 ** (cents / 12.0)
        need = int(np.ceil(n * ratio)) + 4
        src = _loop_to(x, max(need, len(x)))
        idx = np.arange(n) * ratio
        i0 = np.floor(idx).astype(np.int64)
        i0 = np.clip(i0, 0, len(src) - 2)
        fr = (idx - i0).astype(np.float32)
        y = src[i0] * (1.0 - fr) + src[i0 + 1] * fr
    else:
        y = _loop_to(x, n)[:n]

    y = np.asarray(y, dtype=np.float64).copy()
    if len(y) < n:
        y = np.pad(y, (0, n - len(y)))
    rel = min(len(y), max(64, int(0.035 * SR)))
    y[-rel:] *= np.linspace(1.0, 0.0, rel) ** 0.7
    return y


def main(argv: list[str]) -> int:
    force = "--force" in argv
    names = [a for a in argv if not a.startswith("-")]
    if not available():
        print("sampler: fluidsynth or the soundfont is missing — see FETCH.sh",
              file=sys.stderr)
        return 2
    print(f"soundfont {os.path.basename(SF2)}  sha256:{sf2_hash()}")
    built = build_bank(names or None, force=force)
    print(f"bank ready ({len(built)} rebuilt) -> {BANK_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
