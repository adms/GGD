# bgm-gen — the GGD soundtrack generator

A deterministic **score → audio** pipeline that writes the twelve BGM tracks in
`content/assets/audio/bgm/`. Everything is synthesised from numpy arrays: there
is no sampled audio anywhere in this tool, no soundfont, no download, and no
model-generated audio. The only external binary is **ffmpeg** (encode +
loudness measurement). Same score + same seed ⇒ byte-identical mp3, verified.

```sh
python3 tools/bgm-gen/src/render.py menu           # one track
python3 tools/bgm-gen/src/render.py --all          # every score in scores/
python3 tools/bgm-gen/src/render.py menu --analyze --keep-wav
python3 tools/bgm-gen/src/manifest.py              # refresh bgm/MANIFEST.json
python3 tools/bgm-gen/probe/choir_check.py         # choir gates (must PASS)
python3 tools/bgm-gen/probe/track_check.py         # per-track gates
python3 tools/bgm-gen/probe/tts_route.py           # the route-(b) evidence
```

Layout:

```
src/render.py        CLI: score -> wav -> loudnorm -> mp3 -> build/<id>.meta.json
src/manifest.py      merges build/*.meta.json into bgm/MANIFEST.json
src/ggd/music.py     KEY, BPM, LOOP LENGTH, THE HOOK, SATB voicing   <- read first
src/ggd/score.py     the arrangement API (Score) + the renderer
src/ggd/choir.py     THE CHOIR ENGINE
src/ggd/voices.py    the rest of the kit (synth, bass, drums, FX)
src/ggd/dsp.py       oscillators, filters, reverb, sidechain, limiter, looping
src/ggd/analyze.py   measurement primitives used by the gates
src/ggd/audio.py     wav I/O + ffmpeg glue
scores/<id>.py       one file per track, exposing build() -> Score
probe/               the measurement scripts; these are the evidence
```

---

## 1. The release: one key, one tempo family, one hook

All twelve tracks share these so the pack reads as a single record. They live in
`ggd/music.py`; do not redefine them in a score.

| | |
|---|---|
| **Key** | **D natural minor** (D E F G A Bb C), relative F major. A track may sit in D minor, F major or D dorian, but the tonic pitch class never moves. |
| **Cadence** | `PROG_HOME` = **Dm – Bb – F – C** (i–VI–III–VII). Variants: `PROG_DRIVE` (i–VII–VI–VII), `PROG_RISE` (VI–VII–i), `PROG_DARK`, `PROG_RESOLVE`. |
| **BPM family** | **67.5 / 90 / 135 / 180** — 90 × {0.75, 1, 1.5, 2}. Chosen so a 4/4 bar is a whole number of samples at 44.1 kHz (117 600 @90), which is what makes the loops sample-exact instead of drifting. |
| **Loop grid** | **1 881 600 samples = 42.667 s** — 16 bars @90 = 24 @135 = 12 @67.5 = 48 @180. Every looping track is this length **or an integer multiple of it**, so all of them stay a whole number of bars in every tempo of the family. `menu`, `menuNocturne`, `combat` and `intermission` run at **2×** (3 763 200 samples = 85.333 s); the rest run at 1×. `menu` and `menuNocturne` must stay *equal* as well as on-grid — they alternate on the login screen and the swap is timed to one whole loop of either. Nothing in the code reads a loop length — it is a compositional convention held up by this table and by each score's `bars=`. |
| **Hook** | `music.HOOK_A` / `HOOK_B`, and the three-note cell `HOOK_CELL`. See below. |

### The hook

Four bars over Dm–Bb–F–C, written to sit in D5–A5 so a soprano section can sing
it and a supersaw can double it an octave down:

```
bar 1 (Dm)   A4   D5   F5——     the i triad, rising: the call
bar 2 (Bb)   E5   D5   C5——     step down
bar 3 (F)    D5   F5   A5——     the same shape a fourth higher: the lift
bar 4 (C)    G5   F5   E5——     descent, left open on the 9th so it cycles
```

`HOOK_B` answers it: same two opening bars, then Bb–D–F and a landing on D.
`HOOK_CELL` is the identity fragment **A–D–F** — the stings quote that.

Reprise plan: `menu` states it in full (choir + supersaw); `victory` and
`settlement` quote it; `battleStart` uses the cell; everything else may allude
to it (the ostinato shape, the rising-fourth gesture) without stating it.

---

## 2. Writing a score

A score is `scores/<id>.py` with a `build() -> Score`. It only *describes* the
track. Read `scores/menu.py` — it is the reference implementation.

```python
from ggd import music
from ggd.score import Score

def build() -> Score:
    s = Score(id="example", bpm=music.BPM_DRIVE, bars=24, key="Dm", seed=5299,
              loop=True, pump_depth=0.6)
    s.progression(music.PROG_DRIVE)
    s.gain(choir=1.1, drums=1.15)          # MULTIPLIES the pack defaults
    s.choir_chant((8, 24), "x...x...x.x.x...", vowel="ah", parts=("tenor", "bass"))
    s.drumkit((8, 24), style="drive")
    s.bass((8, 24), "X...X...X...X...", style="both")
    return s
```

### The rhythm DSL

Percussion and rhythmic parts are 16th-note **grid strings**, one character per
16th, any length (16 chars = one bar, 32 = two, 8 = repeats twice a bar):

```
"X..x..x.X...x..."     X = accent    x = normal    o = ghost    . = rest
```

### Score methods

| method | what it does |
|---|---|
| `progression([...])` | one chord symbol per bar, wrapping |
| `gain(bus=k)` / `verb(bus=w)` | multiply the default bus gain / set reverb send |
| **`choir_pad(bars, vowel, dyn, …)`** | sustained SATB chords — the sacred bed |
| **`choir_hook(bars, phrase, …)`** | sopranos sing the hook, A/T/B voiced under it |
| **`choir_chant(bars, pattern, …)`** | rhythmic low male stabs on a grid string |
| `lead(bars, phrase, octave, voice)` | the hook on a synth (defaults to supersaw) |
| `melody(bars_offset, [(beat, beats, midi)…], voice, bus)` | any melody |
| `chords(bars, voice, rhythm=None)` | pad / strings / supersaw / guitar / piano bed |
| `ostinato(bars, voice, shape, subdiv)` | the Sawano figure; `shape` indexes chord tones |
| `arp(bars, pattern, subdiv)` | ostinato with pluck defaults |
| `bass(bars, pattern, style)` | `sub` / `reese` / `both` |
| `drum(inst, pattern, bars, …)` | kick clap snare hat openhat taiko timpani cymbal |
| `drumkit(bars, style)` | presets: halftime four rock drive march epic |
| `fx(kind, at_bar, length_bars)` | riser impact downlifter reverse sweepdown |
| `custom(bus, fn)` | escape hatch: `fn(ctx)` writes straight into a bus |

Buses: `choir lead pad keys strings gtr bass sub drums perc fx`.
`DEFAULT_BUS_GAIN` already balances them, so a layer's own `gain=` reads as
musical intent. Everything in `sidechain=` ducks on every kick.

### House rules for a new track

1. **Length.** Looping tracks sit on the loop **grid** — 1× (16 bars @90,
   24 @135, 12 @67.5) or an integer multiple of it. Default to 1×; go to 2×
   (32 @90, 48 @135, 24 @67.5) only for a cue the player is exposed to for
   minutes at a time, and only if you have a second harmonic idea to put in
   the extra bars. `track_check.py` fails a non-integer bar count.
2. **The choir must be audible, and must not be the only thing.** The gate
   wants at least one 2 s window where the choir carries ≥ 12 % of the
   300–3500 Hz energy, *and* a whole-track share ≤ 85 %. The floor is the
   pack's identity — a decorative pad nobody hears fails. The ceiling stops a
   track from being a choir with a click track. (`menu`: 92.9 % in its best
   window — bar 18, where the choir walks back into the empty floor — and
   63.2 % across the whole track.)
3. **Do not restate the whole hook everywhere.** Quote it where the plan says
   to; elsewhere use the harmony and the palette.
4. **The loop point is a musical event.** Bar 0 is heard immediately after the
   last bar on every pass, so keep one element (usually the ostinato) running
   through the whole loop and put a fill in the last bar.
5. **Seeds.** `menu` uses 5201; keep new tracks on distinct seeds (5202…5211).

---

## 3. The choir engine

`ggd/choir.py`. This is the part that makes the pack sound sacred rather than
merely loud, and it is worth reading the module docstring before changing it.

### Why formant synthesis and not pitch-shifted TTS

Both routes in the brief were built and measured. `probe/tts_route.py`
reproduces the numbers (macOS `say`, the same Kyoko/Meijia voices
`tools/tts-gen` already uses):

| what | measured |
|---|---|
| source format | **22.05 kHz mono** — half the bandwidth gone before we start, stereo gone permanently |
| longest steady vowel | Kyoko あーーー @r90 **1.80 s**; お/え **1.08 s**; Meijia 啊 **0.39 s** — against the 4–8 s a choral pad holds |
| source f0 | **233–277 Hz** (≈ Bb3–C#4) |
| shift to **bass A2** (×0.47) | naive resample drags F1/F2 from 853/1085 Hz down to **461/1534**; that is a slowed-down woman, and it is exactly how this repo's dragon roar was built *on purpose* |
| shift to **soprano A5** (×3.77) | leaves **0.48 s** of audio; a numpy phase vocoder fixes the length but lands on **450 Hz instead of 880** with periodicity falling to 0.72 |

And the decisive one: **a sample gives you one voice.** The choral effect *is*
the ensemble — 40 independently detuned, independently vibrating, independently
timed singers — and 40 copies of one clip is one clip.

**Chosen: route (a), formant synthesis**, with route (b) kept as a calibration
reference (`probe/tts_route.py` prints the measured human formants next to the
synth targets) and as documented evidence. Nothing from `say` is in any shipped
file, so the pack has no TTS dependency at render time.

### What the engine actually does

1. **Ensemble** — 8–12 voices per part (S 12 / A 10 / T 8 / B 8 = 38), each with
   its own detune (±11 ¢), vibrato rate/depth/phase with a delayed onset, entry
   offset (±32 ms), slow intonation drift, and pan inside the section's spread.
2. **Glottal source** — a band-limited pulse wavetable rebuilt per note:
   harmonic *k* at `k^-1.15 · exp(-(k·f0/Fc)^1.6)`, where Fc is **vocal effort**
   (1.9 kHz soft → 6.5 kHz full voice), with randomised harmonic phases per
   voice so the ensemble does not comb.
3. **Formants** — five parallel analog resonators, evaluated exactly in the
   frequency domain. F4/F5 form the **singer's formant** cluster at 2.8–3.4 kHz;
   that cluster is what lets a trained voice cut through an orchestra.
4. **Vocal-tract scaling** — bass ×0.90, tenor ×0.96, alto ×1.05, soprano ×1.13,
   so the four parts are four instruments, not one at four pitches.
5. **F1 tracking** — F1 is never allowed below 0.92·f0, because a singer opens
   the jaw on high notes; without it the top of the soprano range goes thin.
6. **Breath** — aspiration mixed into the source *before* the formant filter (so
   the tract shapes it, as it does in a real voice) plus a brighter noise
   transient on each entry.
7. **Real SATB** — `music.voice_satb` keeps proper spacing (no gap over an
   octave between adjacent upper voices) and moves inner parts by the smallest
   available interval. Parallel octaves are what make a "choir patch" read as a
   synth pad.
8. **The cathedral** — `dsp.make_ir`: 55 ms pre-delay, sparse early reflections,
   a dense noise tail whose top decays faster than its bottom, RT60 3.65 s.

### The gates — `probe/choir_check.py`

```
1. FORMANTS   each part sings a glissando across its range; the long-term
              average spectrum is matched against the tract-scaled vowel
              targets. A glissando, not a single note, because a soprano's
              harmonics are 500-900 Hz apart and cannot resolve F1 from F2 on
              one pitch. GATE F1 and F2 within 15 %.
              RESULT: 16/16 part x vowel combinations pass; median error ~3 %
              (e.g. bass "ah" want 630/1098 got 624/1109; soprano "eh" want
              645/2147 got 624/2110).
2. ENSEMBLE   harmonic-skirt energy (+-40 c) against harmonic-core (+-3 c).
              RESULT full choir +9.3 dB, the same score with one undetuned
              voice per part -19.8 dB, a 7x3 supersaw pad +3.5 dB. The choir
              spreads 29.1 dB more than a soloist and 5.8 dB more than a
              supersaw. GATE >= 6 dB over the soloist.
3. HALL       cathedral RT60 3.65 s, plate 1.06 s. GATE >= 2.5 s.
```

An independent check (not a gate) confirms the sopranos sing the written hook:
pitch-tracking the soprano stem across `HOOK_A` returns every note within
**±8 cents** of target.

---

## 4. The rest of the kit

`ggd/voices.py`. All mono, all seeded, all trimmed to a common −12 dBFS RMS
reference so `gain=1.0` means the same thing everywhere (`TRIM`).

| voice | how it is made |
|---|---|
| `supersaw` | 7 detuned band-limited saws, per-voice drift, optional moving resonant LP |
| `pluck` | Karplus-Strong, recursed one delay-line at a time |
| `pad` | slow multi-saw through a resonant lowpass |
| `piano` | additive struck string with real inharmonicity (`k·f0·√(1+Bk²)`), faster decay on high partials, filtered-noise hammer |
| `strings` | bowed saw ensemble, per-player vibrato, slow attack |
| `guitar` | saw + 5th → asymmetric waveshaper → 4×12 cabinet EQ |
| `sub` | sine with a pitch drop into the note |
| `reese` | two detuned saws through a resonant LP + soft clip |
| `kick` | 150→50 Hz pitch envelope + HP click + saturation |
| `clap` | 4 offset noise bursts (the offsets *are* the clap) + body |
| `snare` / `hat` | tuned body + noise wires / band-limited noise |
| **`taiko`** | circular-membrane modes 1 : 1.593 : 2.135 : 2.295 : 2.917 over a pitch-dropping body, plus skin transient. One sine is a synth tom; the modes are what make it a drum. |
| `timpani` | the same, tuned and longer |
| `riser` / `impact` / `downlifter` / `reverse` / `sweepdown` | the drop furniture |

### Signature processing (`ggd/dsp.py`, applied in `score.render`)

* **Sidechain pump** — built from the kick times the scheduler recorded, not
  from a detector, so it is locked to the grid and identical every run.
  Measured on `menu`: the choir ducks a mean **3.3 dB** on every kick.
* **Reverb** — one cathedral for the sacred buses, one short plate for the kit,
  as an **energy-matched** send (the wet is RMS-matched to the dry before the
  wet amount applies; peak-matching a 3.6 s tail over-sends by 10–15 dB).
* **Width** — mid/side, with the side channel high-passed at 180 Hz so the bass
  stays mono.
* **Master** — HP 26 Hz → gentle bus compression → air shelf → scale so the
  99.9th-percentile sample sits at 0.80 → lookahead limiter → two-pass
  **linear** loudnorm to −16 LUFS. Scaling below the ceiling before the limiter
  is what keeps the peak-to-loudness ratio near 12–13 dB instead of ~9.

### Why FFT filtering

There is no scipy here and a per-sample Python IIR over 42 s is minutes per
pass. So static filters are one full-length rFFT × the exact complex analog
response (this is the LTI filter, not an approximation), time-varying filters
are overlap-add with a per-frame response, and feedback delays recurse one
delay-length block at a time. A full track renders in about 20 s.

---

## 5. Output and the manifest

`render.py` writes `content/assets/audio/bgm/<id>.mp3` (128 kbps, 44.1 kHz,
stereo, −16 LUFS) and `build/<id>.meta.json`. `manifest.py` merges those metas
into `bgm/MANIFEST.json`, **replacing only the tracks that have been
regenerated** and leaving the rest untouched — the pack is being replaced in
parallel and a half-finished manifest must never misattribute a track. Entries
we generated carry `"source": "bgm-gen"`; `generator.stillThirdParty` lists what
is left. The 魔王魂 credit line stays mandatory until that list is empty
(see `content/assets/CREDITS.md`).

---

## 6. The twelve slots

Shared plan, so the tracks written in parallel still form one release. Tempo is
from the family; every looping track sits on the 42.667 s loop grid — at 1× or,
for the four cues a player is exposed to longest, at 2× (85.333 s).

Eleven of these are scenes. `menuNocturne` is the twelfth and is **not** a
screen: it is the login screen's second theme, and the auth screen alternates it
with `menu` every whole loop (`apps/client/src/audio/loginRotation.ts`). That is
why both run at 2× and why their lengths must stay equal — the rotation swaps on
a loop boundary of whichever one is playing.

| slot | bpm | bars | loop | progression | mood | choir | hook |
|---|---|---|---|---|---|---|---|
| `menu` | 90 | **32** (2×) | ✓ | `PROG_HOME` | title statement, sacred → drop | full SATB, "oo" then "ah" | **states A + B** |
| `menuNocturne` | 67.5 | **24** (2×) | ✓ | bespoke F major (states `PROG_HOME` once, bars 4–7) | login theme #2: still, slow, 12/8; harp + far strings, no percussion at all | **one soprano** — a 3-voice unison via `Score.custom`, F5–C6 | **no** — argued in the score docstring |
| `lobby` | 90 | 16 | ✓ | `PROG_HOME` | warm, unhurried, welcoming | soft "oo"/"oh" pad, small ensemble | alludes only |
| `room` | 90 | 16 | ✓ | `PROG_RESOLVE` | waiting, quietly hopeful | sparse pad | alludes only |
| `intermission` | 90 | **32** (2×) | ✓ | 32-entry bespoke (DRIVE ×3 → BREATH → DRIVE → clearing → tail) | regroup, purposeful; written against the 60 s phase clock | mid pad → full "ah", one cell statement each half | fragment (`HOOK_CELL`, bars 8 and 16) |
| `champSelect` | 135 | 24 | ✓ | `PROG_DRIVE` | anticipation, ticking clock | low chant + high "ah" | fragment |
| `combat` | 135 | **48** (2×) | ✓ | `PROG_DRIVE` | relentless drive, drops | **chant** (T/B) + soprano stabs | fragment |
| `fireRing` | 135 | 24 | ✓ | `PROG_RING` (12-bar, local: `PROG_DARK`×2 + `Gm Gm A A`) | a 30 s countdown, not a loop — written against the clock; war drum goes tresillo at 15 s left, V→i lands at 8.7 s | chant, darker vowels | no |
| `battleStart` | 90 | 3–4 | ✗ | `PROG_RISE` | heroic fanfare, ~6–8 s | full stab | **`HOOK_CELL`** |
| `victory` | 90 | 3–4 | ✗ | `PROG_RESOLVE` | triumph, ~6 s | full SATB | **quotes A (bar 3 lift)** |
| `defeat` | 67.5 | 3–4 | ✗ | `PROG_DARK` | loss, ~10 s, no drums | low "oh"/"oo" only | inverted / minor-mode fragment |
| `settlement` | 67.5 | 12 | ✓ | `PROG_RESOLVE` | aftermath, ceremonial, reflective | warm SATB, low effort | **quotes B** |

Suggested seeds: menu 5201 (taken), lobby 5202, room 5203, champSelect 5204,
intermission 5205, combat 5206, battleStart 5207, victory 5208, defeat 5209,
settlement 5210, fireRing 5211, menuNocturne 5212.

### The solo voice (`menuNocturne`)

`choir_pad` / `choir_hook` expose only `voices_scale` / `effort` / `attack`,
which is not enough to make ONE singer: everything that separates a voice from a
theremin lives on `ChoirConfig` knobs they do not forward. `menuNocturne`
therefore drives `choir.render_choir` through `Score.custom` — **no engine edit,
and none is needed**. The measured essentials, in order of how much they matter:

* **`aspiration`** (default 0.030). With it near zero the f0 is a product of
  smooth deterministic terms and the render is a numerically pure tone — HNR
  173 dB, spectral flatness 1.4e-17. It is summed into the glottal source
  *before* the formant bank, so it is shaped like breath, not laid over the top
  as hiss. Sweep on that score's melody: 0.30 → 33.7 dB HNR, 0.55 → 28.4,
  0.80 → 25.2, **0.95 → 23.9 (shipped)**, 1.50 → 19.8. A sung human vowel is
  10–25 dB. Level is unaffected — the part self-normalises by `1/√nvoices`.
* **`voices_scale = 0.25` → exactly 3 voices**, above the engine's `max(2, …)`
  floor. Three at ±6 cents produce 1–12 Hz beating a single voice physically
  cannot (AM depth 2.84 % at 1 voice → 3.92 % at 3), and the effect **saturates
  there**: 6 and 12 voices measure 3.92 % and 3.98 %. So three buys the whole
  anti-theremin benefit of a section and still reads as one singer.
* **`vib_onset`** — vibrato blooms over ~0.6 s instead of being at full depth
  from sample zero, which is what a theremin does.
* **Centring.** `PART_PAN['soprano']` is −0.42; a 1–3 voice render lands 6–15 dB
  LEFT and no seed fixes it. Render with `width=0.0` and sum `L+R` (both `pan`
  and `widen` are linear, so that recovers 2·mid), then re-pan. +0.09 dB.
* Do **not** gate a solo on `analyze.ensemble_spread` — vibrato alone smears one
  voice to 24.4 dB, *higher* than a 12-voice section at 9.5 dB. It is a valid
  choir gate and an invalid solo gate.
* Measurement trap: the instantaneous-phase f0 tracker is destroyed by
  aspiration noise and by multi-voice beating. Pitch must be measured on a
  1-voice render with `aspiration=0`; that is legitimate because aspiration is
  added *after* the phase is integrated and so cannot alter the contour.

---

`probe/track_check.py` gates each rendered file: loudness within 1 LU of −16,
true peak ≤ −1, no clipping, whole number of bars **at the score's own tempo**
(the gate is `dur × bpm / 240` rounding to an integer — it says nothing about
sample count, which is why a 2× track passes it unchanged), a seamless loop
join (the largest sample step at the join must not exceed 3× the track's own
99.9th percentile step), and the two choir-share numbers.

`intermission` currently reports: `85.333 s · 32.0 bars @90 · −16.5 LUFS ·
TP −4.53 · join ×0.5 · choir 100.0 % / 70.3 % · OK` — the join is *quieter*
than ordinary programme material — and re-rendering it twice produces the same
bytes (verified by md5 against a copy rendered to a different output dir).
