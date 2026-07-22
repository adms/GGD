# GGD audio assets

Eight sources live under `content/assets/audio/`, bound to scenes/events by
`content/config/audio-map.json` (`config.audio-map@1`) and played by the client
`apps/client/src/audio/**` engine. Nothing here is required: an unmapped
scene/event is silent and a file that 404s is a no-op.

```
bgm/                       11 OWN-WORK music beds + stings (bgm/MANIFEST.json = provenance)
sfx/*.mp3                  21 voice quips from GoDieEX22s.w3x (this doc)
sfx/{dragon-roar,ui-}*.mp3  6 CC0 login-screen SFX (3 roars + 3 UI ticks; CREDITS.md)
sfx/fx/*.wav               11 synthesised combat/UI SFX (sfx/fx/MANIFEST.json + GENERATE.sh)
sfx/lab/                   32 REAL recorded SFX, 効果音ラボ (sfx/lab/MANIFEST.json + CREDITS.md)
voice-jp/                   8 REAL ja-JP female voice clips, 効果音ラボ (voice-jp/MANIFEST.json)
announcer/                 13 trilingual zh/ja/en announcer VO lines (machine TTS; this doc + CREDITS.md)
announcer/retired-*/       3 superseded announcer packs (provenance only, unbound — each has a NOTE.md)
voices/names/             112 champion call-outs, 稱號+全名 (machine TTS; own MANIFEST.json)
```

`voices/names/` is the one source NOT bound through `audio-map.json`: it is a
per-champion pack keyed by champion id, so it carries its own mapping doc and is
played by its own client layer (see the section at the end).

> **The two machine-TTS packs (`announcer/`, `voices/names/`) sound flat and
> over-formal ON PURPOSE.** The direction is 惡搞 parody where *the line* is the
> joke and the voice delivers it 字正腔圓 — perfectly enunciated and completely
> emotionless. Read the ⚠ box in the `announcer/` section before "fixing" a voice
> that sounds wrong.

- **`bgm/`** — **our own work**, synthesised in this repo by `tools/bgm-gen`
  (task #52). NOT third-party, NOT sampled, NOT AI-generated audio → **no
  attribution required**. This replaced the 魔王魂 (Maoudamashii) pack, whose
  credit line *was* mandatory. Full provenance + loudnorm/loop-join notes in
  `bgm/MANIFEST.json`; ledger in `content/assets/CREDITS.md`. loop=true tracks
  are seamless self-joined loops; battleStart/victory/defeat are loop=false
  one-shot stings. **Pending user approval — see the `bgm/` section below.**
- **`sfx/*.mp3`** — the map's own Chinese voice quips (below). The user's own
  work, NOT third-party — deliberately *not* in CREDITS.md.
- **`sfx/dragon-roar*.mp3` + `sfx/ui-*.mp3`** — 6 **CC0** login-screen SFX
  (task #20). `ui-click.mp3`, `ui-hover.mp3`, `ui-type.mp3` are straight Kenney
  clips (UI Audio / Interface Sounds), bound as `uiClick` / `uiHover` / `uiType`.
  The three roars are **multi-layer composites built with ffmpeg**, bound as
  `dragonRoar` (2-clip ambient pool: `dragon-roar.mp3` 5.9 s long cry 長吟 +
  `dragon-roar2.mp3` 4.3 s variant) and `dragonRoarBig` (`dragon-roar-angry.mp3`
  4.4 s action bellow for the click/enter swoop). Full provenance + per-clip
  recipes in `content/assets/CREDITS.md`.
  - **ANCHOR AND VARIATIONS — the rule that governs these three files.**
    `dragon-roar-angry.mp3` is the **anchor**: the voicing the user accepted. Do
    not change it. The two ambients are **the same voice, calm** — same organic
    sources, same formant chain, organic layer dominant, natural rasp left in.
    Calm-versus-enraged is expressed through **energy, length, attack and level
    only**, never by swapping in a different instrument. If you re-voice the
    ambients, re-run the voiceprint check (below) or the pool stops sounding like
    one creature (user: 「還是要跟龍吼聽的出來是同一個生物的聲音聲紋吧」).
  - **Voicing history — four rejected passes, keep them rejected.** Pass 1:
    low-frequency sources only → sub-bass rumble (「低音放屁聲」). Pass 2:
    overcorrected into a bright raptor screech → 「太吵了 / 高亢尖銳」. Pass 3: the
    Godzilla bellow (composed, weighty, midrange — a resin-coated glove dragged
    down a double-bass string, slowed) — **accepted, and it is the anchor**.
    Pass 4: rebuilt the ambients as whale song with a *synthesised* `aevalsrc`
    glide tone as the dominant layer and the organic voice pushed to 0.30–0.42
    behind a 1.8 kHz lowpass → 「太像鬼叫了 / 嚇死人了」. **Two lessons from pass 4:**
    a smooth synthetic tone with vibrato and a pitch glide is a **theremin**, and a
    theremin reads as supernatural — the noise, breath and roughness of a recording
    are what make a sound *animal*; and once the ambients were mostly synth while
    the anchor stayed organic, they measurably stopped sharing a timbre
    (15.9 / 14.2 dB per-band away from the anchor).
  - **How the shared voice is built** (all three). The organic voice is pitched
    down ~2 octaves (`asetrate` ×0.26–0.30) so its energy lands at 300–900 Hz as a
    brassy wail with no cry left; the **same** resonant formant peaks at
    **250 / 450 / 800 Hz** imitate a huge throat; everything above ~3 kHz is
    shelved away since that shimmer is what read as 尖銳. A real low body (the same
    `monster_roar.wav` source in all three) sits underneath for mass, kept below
    the midrange. **No synthesised voice in any shipped file.**
  - **What makes the ambients calm** — and note none of it is a different
    instrument: the voice slice starts ~0.3 s into the burst so the aggressive
    onset is gone and the creature's **own natural descending portamento** supplies
    a gentle 7–11 % glide (no synth required); a stretched exponential swell means
    90 % of peak arrives only after ~0.9–1.1 s, so nothing reads as a transient;
    `vibrato` is shallow and slow (3–3.2 Hz, depth 0.10–0.12); the tail is long
    (`aecho` plus a modest `afir` convolution-reverb send fed a synthesised 1.8 s
    decaying dark pink-noise IR); and both sit ~8 dB below the anchor in peak
    (≈ −4 dBFS) since they are atmosphere, not events.
  - **Objective gate they must keep passing** (they cannot be judged by ear in
    CI): per file, split the mix into **<150 Hz / 150–1200 Hz / >2500 Hz** and
    `volumedetect` each band. Require **(1)** the 150–1200 Hz midrange to be the
    **loudest** band (the voice lives there); **(2)** the >2500 Hz band
    **≥12 dB below the full-mix mean** (anti-shrillness); **(3)** <150 Hz present
    but **below** the midrange band (anti-rumble); **(4)** true peak ≤ −0.3 dBFS.
    Current — roar1: full −16.6, low −25.5, **mid −17.3**, high −47.4;
    roar2: full −16.3, low −25.3, **mid −17.0**, high −45.9;
    angry: full −8.7, low −17.8, **mid −9.3**, high −39.1. Midrange is the
    loudest band on all three and >2500 Hz sits 30–37 dB down. True peaks
    −4.09 / −4.05 / −0.82 dBFS.
  - **Three extra conditions for the ambient pair** (the anchor is exempt from the
    first two — it is meant to hit): **(5) attack ≥ 400 ms**, the time until the
    10 ms envelope first reaches 90 % of peak — currently **1.09 s** and **0.87 s**;
    **(6) glide ≈ 5–12 %** of per-window dominant-frequency movement — currently
    **7.0 %** (262→281→262 Hz) and **11.1 %** (267→296→267 Hz). Six is a *band*,
    not a floor: pass 4 ran 17–20 % and that eerie sweep was a big part of the 鬼叫
    impression, while a dead-flat pitch reads mechanical.
    **(7) voiceprint match** — `ltas.py` builds a long-term average spectrum in 21
    third-octave bands (63 Hz–6.3 kHz), normalises each file to its own energy so
    only the spectral *envelope* is compared, and scores each ambient against the
    anchor: **require r ≥ 0.97 and mean|Δ| ≤ 5.0 dB**. Currently **+0.985 / 3.5 dB**
    and **+0.985 / 2.7 dB**; the rejected pass-4 versions scored +0.950 / 15.9 dB
    and +0.938 / 14.2 dB. The correlation barely moved between the two (both shapes
    have a midrange hump) — **mean|Δ| is the discriminating number**. Without this
    condition a re-render can pass every other gate and still be a different animal.
    Tools live beside the builds: `analyze2.sh`, `glide.py`, `ltas.py`.
  - `dragon-roar-angry.mp3` is the loud one (RMS −8.7 dB, stereo) — angry means
    a **bigger, longer, more low-mid forceful bellow**, *not* shriller and *not*
    lower. Its loudness comes from level and low-mid density: only a gentle
    `acompressor ratio=5` + `alimiter=0.9`, with the earlier `asoftclip=atan`
    saturation deliberately removed (that fizz was part of the 吵 complaint).
- **`sfx/fx/*.wav`** — procedurally generated (ffmpeg lavfi, no sampled audio);
  own work / effectively CC0. These exist because *none* of the 21 voice quips
  is a mechanical swing/hit/tick/cast sound, so the high-frequency combat
  events had no legible quip to bind to. Regenerate deterministically with
  `bash sfx/fx/GENERATE.sh`. Format + per-clip recipe in `sfx/fx/MANIFEST.json`.
- **`announcer/`** — 13 arena-announcer broadcast lines (task #34, switched to
  Japanese by task #40, **recast multilingual by task #57**), **Apple-TTS
  machine VO** (macOS `say`, 185 wpm across every line) generated by
  `tools/tts-gen` from the manifest `content/audio-manifests/announcer.json`
  (the `.mp3.hash` sidecars are the generator's idempotence markers — keep
  them). The cast is four full-band voices — **Kyoko** (ja-JP), **Tingting**
  (zh-TW), **Karen** (en-AU), **Sinji** (zh-HK) — and two lines are *segmented*,
  cast per fragment rather than whole-line. Local/dev placeholder flavor only;
  for production the same manifest is regenerated through a real cloud TTS
  provider via the platform proxy `POST /api/v1/ai/tts` (admin supplies the key
  at runtime, server-side only — no key in the repo). See the announcer section
  below for lines + bindings.
- **`announcer/retired-zh/`** — the 12 superseded **Meijia zh-TW** renders,
  kept for provenance and A/B reference. **Bound to nothing**, referenced by no
  event. `announcer.zh-TW.json` still holds the canonical zh display text and
  now writes *here*, so a rerun of that manifest can never overwrite the live
  clips (see "Why the voice is Japanese" below).
- **`announcer/retired-ja-kyoko/`** — the superseded all-**Kyoko** ja-JP pack
  (#40), retired by the #57 recast. **Bound to nothing.** Its manifest was
  renamed to `announcer.ja-JP-kyoko-retired.json` and retargeted *here*, so the
  live pack now owns the bare `announcer.json` name.

---

## `bgm/` — the 11 self-generated music tracks (task #52)

**Own work. No attribution required.** Written and synthesised in this repo by
`tools/bgm-gen`, a deterministic score→audio pipeline: every waveform is
computed from numpy arrays (formant-synthesised SATB choir, supersaw,
Karplus–Strong pluck, additive struck piano, membrane-mode taiko, noise kit and
FX), then mixed, looped and encoded with ffmpeg. **No audio file is read as
input** — nothing sampled, nothing downloaded, no model-generated audio.

> **⏸ PENDING USER APPROVAL.** Audition the pack at
> **`http://localhost:39527/bgm-audition.html`** (client dev server).
> The page is generated — every duration, loudness figure and loop-seam verdict
> on it is measured at build time, not typed:
> `python3 tools/bgm-gen/src/audition.py`.
>
> **`content/config/audio-map.json` was not edited and needs no edit** — its 11
> `bgm` keys already point at `assets/audio/bgm/<scene>.mp3`, which is where
> `render.py` writes. That also means **the 魔王魂 files were overwritten in
> place** by the render and are not recoverable from this repo. See
> `content/assets/CREDITS.md` for the full swap record and follow-ons.

### The pack

One shared identity, so any cue can follow any other with no key or pulse clash:

| | |
|---|---|
| Key family | **D minor / F major** — the tonic pitch class never moves |
| BPM family | **67.5 / 90 / 135 / 180** — all rational multiples of 90, all sample-aligned at 44.1 kHz |
| Loop grid | **1 881 600 samples = 42.667 s** — every loop track is this length or an integer multiple of it, so all of them stay a whole number of bars in every tempo of the family. `menu`, `combat` and `intermission` run at 2× (85.333 s); the rest at 1×. |
| Home cadence | `PROG_HOME` = Dm–Bb–F–C (i–VI–III–VII), plus DRIVE / RISE / DARK / RESOLVE variants |
| Hook | one lead hook that every track states, quotes or alludes to |
| Format | MP3 128 kbps / 44.1 kHz / stereo, ≈ −16 LUFS (two-pass linear `loudnorm`) |

| scene | title | len | kind | bpm | bars |
|---|---|---|---|---|---|
| `menu` | 戰旗 / Banner of the Fallen | 85.333 s | loop | 90 | 32 |
| `lobby` | 灯火 / Hearthlight | 42.667 s | loop | 90 | 16 |
| `room` | 控室 / The Antechamber | 42.667 s | loop | 90 | 16 |
| `champSelect` | 選抜 / The Choosing | 42.667 s | loop | 135 | 24 |
| `intermission` | 合間 / Between the Bells | 85.333 s | loop | 90 | 32 |
| `combat` | 戦域 II / Contested Ground — The Turn | 85.333 s | loop | 135 | 48 |
| `fireRing` | 火環 / Ring of Fire | 42.667 s | loop | 135 | 24 |
| `settlement` | 餘燼 / What the Battle Left | 42.667 s | loop | 67.5 | 12 |
| `battleStart` | 開陣 / The Gate Opens | 7.493 s | sting | 135 | 3 |
| `victory` | 凱歌 / Raise the Banner | 15.673 s | sting | 90 | 5 |
| `defeat` | 灰燼 / Ash | 13.007 s | sting | 67.5 | 3 |

Each score documents its own shape and its reprise rule — read
`tools/bgm-gen/scores/<scene>.py` before changing a cue.

### Regeneration (deterministic — `seed` is the only randomness)

```sh
python3 tools/bgm-gen/src/render.py menu     # one scene -> bgm/menu.mp3
python3 tools/bgm-gen/src/render.py --all    # the whole pack
python3 tools/bgm-gen/src/manifest.py        # refresh bgm/MANIFEST.json
python3 tools/bgm-gen/src/audition.py        # refresh the audition page
python3 tools/bgm-gen/probe/choir_check.py   # gate: choir quality
python3 tools/bgm-gen/probe/track_check.py   # gate: length/loudness/seam
```

### Looping — play these gapless

Loop tracks are **seamless self-joins**: the 0.3 s of audio immediately
following the cut-end is crossfaded onto the segment's head, so the file end
flows continuously into the file start. That only pays off with **gapless
looping** (Web Audio `AudioBufferSourceNode.loop`, which is what the client
uses). A plain `<audio loop>` element may insert a small gap the material does
not contain — the audition page's **⟳ 試接縫** button therefore previews the
join through Web Audio, not through `<audio>`.

Verified: for all 8 loop tracks the wrap-point transient, measured on the
doubled signal after a 4 kHz high-pass, ranks **below the 99.5th percentile** of
the track's own 5 ms energy rises — i.e. the join is not an outlier, so there is
no click.

### Choir provenance — formant synthesis, NOT TTS

The SATB choir (`tools/bgm-gen/src/ggd/choir.py`) builds vowels from filtered
glottal pulses. A TTS-sampling route (macOS `say`, the Kyoko/Meijia voices used
elsewhere in this tree) was built and measured as a calibration reference and
then **rejected** — 22.05 kHz mono source, longest steady vowel 1.8 s against
the 4–8 s a choral pad must hold. **Nothing derived from `say` is in any shipped
file**, so the pack has no TTS dependency at render time and no licence
question. `tools/bgm-gen/probe/tts_route.py` reproduces those measurements.

---

## `sfx/*.mp3` — the 21 imported voice quips

Provenance: extracted from the user's own custom map GoDieEX22s.w3x
(去死團的逆襲 EX 2.2s). The map's JASS references 23 custom clips; `gy2.Mp3` and
`sawch.mp3` are referenced by `CreateSound` but were **never actually imported
into the archive** (verified by direct MPQ hash lookup) — in WC3 those triggers
play silence, so skipping them is faithful. `Sound\Music\mp3Music\{Credits,PH1}.mp3`
are Blizzard stock (not in the map, not ours) — not shipped.

### JASS-derived meaning + final GGD event binding

Evidence: `tools/w3x-import/out/GoDieEX22s/raw/scripts__war3map.j`. Most clips are
**per-hero kill/death announce quips** — the map's central on-kill function
(minified name `xov`) prints a colored chat line + plays the killer's (or
victim's) signature sound. "Event" is the `audio-map.json` `sfx` key each clip
is now bound to.

| clip | JASS handle | JASS trigger (meaning) | → `audio-map` event |
| --- | --- | --- | --- |
| `pikakill` | `uD` | kill quip 皮卡丘「皮～卡丘～」 | `kill` (pool) |
| `dorakill` | `Kd` | kill quip (哆啦A夢-style) | `kill` (pool) |
| `even` | `qd` | kill quip 依文潔琳「這才是我真正的力量」 | `kill` (pool) |
| `bads` | `cd` | announcer kill quip (adjacent line) | `kill` (pool) |
| `dogdie` | `kd` | kill quip 飛鼠/阿笨 | `kill` (pool) |
| `ringnai` | `Sf` | kill quip 龍宮禮奈「好可愛~我要帶回家」(longest, 6.2 s) | `kill` (pool) |
| `4die` | `Ed` | kill-**streak** branch of the announcer | `mapFlavorAnnounce` ⚑ |
| `pick` | `TD` | kill quip 班剎「死白目…(踩」— played 3× @1 s in-map | `champSelectConfirm` |
| `die` | `Jd` | on-**death** branch (gold loss applied) | `mapFlavorAnnounce` ⚑ |
| `mandie` | `fD` | DEATH quip 初音「哎喲!(跌倒)」 | champion-voices `godie-h001` ★ |
| `pcdie` | `qD` | team-kill shaming line「請確認你的隊友是不是白目!!」 | `mapFlavorAnnounce` ⚑ |
| `up` | `mf` | hero level-up (random stat-gain fn) | `mapFlavorAnnounce` ⚑ |
| `87joke` | `Xd` | 飛影「不要小看邪眼的力量！」(don't underestimate this power) | champion-voices `godie-efur` ★ |
| `letsgo` | `DD` | 命運轉輪 quest announce「刺激的命運轉輪時間到了…」 | `mapFlavorIntro` ⚑ |
| `heycharlie` | `OD` | mode/round enable trigger | `mapFlavorIntro` ⚑ |
| `moongo` | `GD` | ability `'A09P'` cast (played on unit) | `abilityCast` (pool) |
| `moonjump` | `hD` | jump-skill cast (floating text) | `abilityCast` (pool) |
| `nocute` | `lD` | ability `'A0BX'` cast (3 call sites) | `abilityCast` (pool) |
| `yooooooooooooo` | `sf` | player taunt "Yooooooooooooo!!" | `taunt` (pool) |
| `kickme` | `dD` | taunt/kill quip 鬼王達「怎樣，打我阿笨蛋！」 | `taunt` (pool) |
| `nog` | `LD` | player taunt「孽畜！休得傷人！」 | `taunt` (pool) |

⚑ = moved out of a system event by **task #40** (the system pools now speak
Japanese only) into an **opt-in map-flavour pool** — preserved and reachable,
but not fired until the 地圖原聲 toggle lands. ★ = reclassified as a CHARACTER
voice and rehomed in `content/config/champion-voices.json`. See
"Why the voice is Japanese" below for the rule behind both.

Notes on choices that diverge from the raw JASS role:
- `pick` was an in-map kill quip but literally says "死白目…(踩" while stepping —
  its short, punchy character maps better to the **champ-select confirm** click,
  and it frees the `kill` pool from a clip that fired 3× in-map.
- `87joke` ("don't underestimate the power of the evil eye") announced
  `exUnlock` until #40. It is a **named champion speaking** (飛影), not a
  broadcast, and at 7.06 s it was far too long for an event pool — so it is now
  飛影's champion-voice `select` line, and `exUnlock` got its own Kyoko VO.
- `kickme` sits in `taunt` rather than `kill`: its text is a taunt ("come hit
  me, idiot"), and it keeps the `kill` pool to six clean signature quips.
- All 21 clips are used; none dropped.

### Loudness handling (per-event `gain` was set from measurement)

Integrated loudness varies ~12 LU across the set (`87joke` -8.1 LUFS vs `4die`
-20.4 LUFS) and several clips have positive true-peak
(`87joke` +5.2, `nocute` +3.1, `dogdie` +1.8, `letsgo` +1.9 dBTP). Per-event
`gain` in `audio-map.json` both balances perceived loudness and caps the loud
clippers so a single voice stays under the destination at the default mixer
(master 0.8 × sfx 0.9 ≈ 0.72 headroom): loud lines carry low gains
(`exUnlock`/`87joke` 0.5), quiet celebratory lines carry high gains
(`kill` 1.15). No source file was re-encoded — balance is entirely in the map.

Since task #40 the **seven** system events (`matchStart` / `roundStart` /
`levelUp` / `death` / `multiKill` / `allySlain` / `exUnlock`) contain **nothing
but** announcer VO — no w3x quip can roll in a system pool any more — so their
gains are calibrated purely to the VO band (-15..-18 dB mean): `levelUp` 0.85,
`death`/`multiKill` 0.9, `roundStart` 0.8, `matchStart`/`allySlain` 0.7.

**`exUnlock` was recalibrated, and this is the easy thing to get wrong.** Its
old gain of **0.5** existed solely to tame `87joke`, which is the loudest clip
in the whole set (-8.1 LUFS, +5.2 dBTP). The replacement Kyoko clip sits in the
announcer band ~7 dB quieter, so leaving 0.5 would have made the new EX call
effectively inaudible. It is now **0.85**, matching `levelUp`.

The displaced quips did **not** inherit the announcer band — they went back to
roughly their own pre-#34 calibration in the new flavour pools, because that is
what they were measured for: `mapFlavorAnnounce` **1.3** (`4die` was 1.9 and is
genuinely quiet at -20.4 LUFS; `die` was 1.35) and `mapFlavorIntro` **0.6**
(`heycharlie`/`letsgo` are long and `letsgo` true-peaks at +1.9 dBTP).

---

## `sfx/fx/*.wav` — synthesised combat/UI SFX

Eleven short, non-verbal, band-limited clips for the high-frequency events, all
peak-normalised to -3.0 dBFS (relative loudness set by `gain` in the map, not by
re-rendering). 16-bit PCM **mono** 44.1 kHz — mono so WebAudio can spatialise
them, PCM/WAV rather than MP3 so a 40 ms transient isn't smeared by MP3
encoder-delay padding through `decodeAudioData`. See `sfx/fx/MANIFEST.json` for
each clip's synthesis recipe.

| clip | → `audio-map` event | character |
| --- | --- | --- |
| `windup.wav` | `attackWindup` | soft low "tk" tell |
| `swing.wav` | `basicAttack` | pink-noise air whoosh |
| `thud.wav` | `basicAttackHit` | 150→60 Hz body + bright snap (meatiest) |
| `tick.wav` | `damage` | hair-thin high confirm tick (fires per packet) |
| `launch.wav` | `projectileSpawn` | descending "pew" chirp |
| `impact.wav` | `projectileHit` | brighter/shorter splat (≠ auto-hit) |
| `cast_begin.wav` | `castBegin` | rising 300→900 Hz chirp + octave |
| `cast_end.wav` | `castEnd` | A5+E6 release ping |
| `cast_break.wav` | `castInterrupt` | 700→150 Hz down-sweep + thump (≠ cast) |
| `chime_soft.wav` | `flowerSpawn` | quiet E5+B5 ambient chime |
| `chime_burst.wav` | `flowerBurst` | brighter A5+E6+A6 bloom + sparkle (reward) |

`attackWindup` / `basicAttack` / `basicAttackHit` are three deliberately
different sounds (tell → swing → thud) so a hit reads distinctly from a miss;
`flowerBurst` is the same chime family as `flowerSpawn` but brighter and a fifth
higher so the payoff is recognisable. All fx events carry short `cooldownMs` +
small `maxConcurrent` in the map so `damage`/`basicAttack` bursts can't
machine-gun the mixer.

---

## `announcer/` — the trilingual announcer VO pack (task #34 → #40 → #57)

Thirteen short arena-announcer broadcast lines, **Apple-TTS MACHINE VO**:
rendered by `tools/tts-gen` (macOS `say` → ffmpeg/libmp3lame) from
`content/audio-manifests/announcer.json`. Regenerate (idempotent — `.mp3.hash`
sidecars skip up-to-date lines):

```sh
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.json
```

`content/audio-manifests/announcer.cast.json` is the **canonical pairing table**:
the Chinese display text, the spoken text, the voice, and the reasoning for every
line. A test asserts the two files stay in lockstep.

### ⚠ READ THIS BEFORE "FIXING" A VOICE THAT SOUNDS WRONG

This pack is **惡搞 (parody), and the joke is THE LINE, not THE VOICE.** The user
set the direction in these words, and they are the spec:

> 惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話清楚但不帶感情所以嘲諷

*("The 惡搞 voice should not be a robot voice — it should be like Google's voice:
perfectly enunciated, clearly spoken, but emotionless, and THAT is what makes it
mocking.")*

So every line is a **real, standard, full-band system voice reading correct text
in a language it actually speaks.** The comedy is entirely in the writing:
Taipei MRT platform announcements, Japanese customer-service 丁寧語, and
bureaucratic sign-offs, applied deadpan to a deathmatch. Being killed and then
told 「しばらくお待ちください」 (please hold) is funny every time. A sheep saying
"Rampage!" is funny once, and it is funny *about the sheep*.

**The flat, affectless delivery is the performance, not a defect.** Do not add
exclamation marks, do not "liven it up", and do not recast it to character
voices — that was tried in this same task, measured, and retired to
`announcer/retired-jank-novelty/` (its `NOTE.md` has the full post-mortem).

### The casting, and why the novelty voices are objectively disqualified

59 voices were auditioned: one fixed announcer-register test line per language
rendered through each, then measured (median f0 by autocorrelation, f0 SD and
5–95 range in **semitones** so voices of different register compare fairly,
voiced fraction, spectral centroid, 85% rolloff, spectral flatness, and
inter-onset-interval CV for pacing regularity).

**The rejection criterion is INTELLIGIBILITY (bandwidth), not flatness** — and
this matters, because naive flatness ranking picks the *wrong* voices. The
novelty family measures **flatter** than the real voices (Shelley-ja 2.56 st,
Flo-ja 2.58, Sandy-ja 2.68 vs Kyoko 3.49). That is an artefact: they are old
MacinTalk **formant synthesisers** that barely modulate pitch because they barely
model prosody at all. Bandwidth is the giveaway, and across all 59 clips the two
families **do not overlap on a single sample**:

| family | n | 85% spectral rolloff | spectral flatness |
| --- | --- | --- | --- |
| real full-band voices | 26 | 2174 – 4921 Hz | 0.096 – 0.269 |
| novelty formant synths | 33 | 956 – 2474 Hz | 0.0104 – 0.0756 |

Consonant articulation — Mandarin /s ts tsʰ ɕ tɕ/, Japanese /s ɕ tɕ ts/, English
sibilants — lives at **2–8 kHz**. A voice with no energy there *physically cannot
articulate it*. That is the exact opposite of 字正腔圓, so all of Eddy / Flo /
Grandma / Grandpa / Reed / Rocko / Sandy / Shelley are rejected in every locale,
plus Zarvox (6.94 st SD — a robot character), Bahh, Boing, Bells, Organ, Jester,
Bubbles, Wobble, Superstar, Trinoids, Whisper (voiced fraction 0.29), Albert, and
the singing voices Good News / Bad News / Cellos.

**The cast (4 voices, all standard system voices):**

| voice | locale | evidence |
| --- | --- | --- |
| **Kyoko** | ja_JP | f0 237 Hz, SD 3.49 st, centroid 2453, **rolloff 4054 Hz — the brightest and cleanest-articulating of all 59**. The only real Japanese voice installed. |
| **Tingting** | zh_CN | f0 242 Hz, SD 4.99 st, rolloff 3946, flatness 0.1749. The Meijia replacement. |
| **Karen** | en_AU | f0 187 Hz, **SD 1.98 st — the flattest contour of any intelligible voice measured** (next best 2.41). Perfectly enunciated and audibly bored. |
| **Sinji** | zh_HK | f0 199 Hz, SD 3.33 st, rolloff 3289. Apple's *standard* Cantonese voice, **not** a novelty one. |

Runners-up if a fifth is ever wanted: Moira (en_IE) 2.41 st with the most
metronomic pacing in the set (ioi_cv 0.353); Tessa (en_ZA) 2.58. Samantha
(en_US) is the cultural reference for "the assistant voice" but measures the
**most** expressive of the English voices at 3.49 st, so it loses on the criterion.

### ⚠ Meijia (zh_TW) IS A PHANTOM — it is not installed and never was

All 184 voices `say -v '?'` advertises were swept, each rendered and compared
against a deliberately bogus voice name. **Exactly one is a phantom: Meijia.**
`say -v Meijia` is byte-identical (sha256 `7b4dca04…`) to `say -v ZZ_BOGUS_XYZ`
and to `say -v Alex` — it silently falls back to the system default (an American
man) and **exits 0**. Every other listed voice renders distinctly.

There is therefore **no usable zh-TW voice on this machine at all**. zh-TW copy
is cast to **Tingting** (zh_CN), which reads Traditional Chinese correctly:
「請確認你的隊友是不是白目。」 and its Simplified form render **byte-identically**
(sha256 `3d28ad0a…`), as do 美白大法師/美白大法师. It normalises 繁→簡 internally
and speaks it — no character is skipped or spelled out. The only loss is a
Mainland-standard accent.

`tools/tts-gen` now probe-renders every voice a manifest asks for against a bogus
name and **hard-fails on a match**, so this can never ship silently again.

### Voice/text rules that are load-bearing (all measured)

- **NEVER put English in a Kyoko line.** `say -v Kyoko "Fight"` is
  **byte-identical** to `say -v Kyoko "ファイト"` (sha256 `36ff5f99…`). Kyoko does
  not speak English — it transliterates Latin to katakana. Hence `ex-unlock`
  says イーエックス, not "EX": the katakana is the only *deterministic* spelling.
- **Pure kana in a Chinese voice is a hard fail.** Tingting fed 「レディ、ファイト。」
  renders **0.01 s of digital silence**; Karen fed 「第一回合開始」 likewise.
  tts-gen's `minDurationSec` rejects both.
- **Avoid TW/CN divergent readings in spoken Chinese.** Tingting is zh_CN, so 擊
  (TW *jí* / CN *jī*) is kept out of all spoken copy — hence 出局 and 無人能擋 —
  while the on-screen Chinese keeps 陣亡 and 擊倒.
- **Cross-voice switching inside one line** is `segments` (below).

### Multi-voice lines — `segments`

Two lines hand off between voices mid-clip, which is how a bilingual
announcement gets each language spoken by a voice that actually speaks it
instead of one voice stumbling through both. `tools/tts-gen` renders each
fragment with its own voice and concatenates. Every macOS voice here writes the
identical container (pcm_s16be, 22050 Hz, mono), so the join is `-c copy` —
sample-accurate, no resample, no seam artefact (verified: 3.688 + 1.190 = 4.878 s
exactly). The signature is re-checked every run; a mismatch is a hard failure,
never a silent resample.

### The 13 lines (zh display text ↔ what is actually spoken)

`‖` marks a fragment boundary where the voice changes.

| clip | zh (canonical display) | spoken | voice | → event |
| --- | --- | --- | --- | --- |
| `match-start` | 歡迎來到去死團競技場 | 去死団アリーナ、第一試合を開始いたします。 ‖ 請站穩踏階。 | Kyoko ‖ Tingting | `matchStart` |
| `round-start-1` | 第一回合開始 | 第一回合，即將開始。 | Tingting | `roundStart` |
| `round-start-2` | 準備，開戰！ | ご準備ください。開始いたします。 | Kyoko | `roundStart` |
| `level-up-1` | 升級！ | Level up. Congratulations. | Karen | `levelUp` |
| `level-up-2` | 等級提升 | レベルが上がりました。おめでとうございます。 | Kyoko | `levelUp` |
| `death-1` | 你被擊倒了 | 戦闘不能です。しばらくお待ちください。 | Kyoko | `death` |
| `death-2` | K.O. | 打完收工。 | Sinji | `death` |
| `death-3` | 陣亡 | 您已出局。感謝您的參與。 | Tingting | `death` |
| `multi-kill-1` | 連續擊破 | 連続撃破を確認いたしました。 | Kyoko | `multiKill` |
| `multi-kill-2` | 大暴走！ | Rampage. Please maintain order. | Karen | `multiKill` |
| `multi-kill-3` | 沒人擋得住 | 目前無人能擋。以上，報告完畢。 | Tingting | `multiKill` |
| `ally-slain` | 請確認你的隊友是不是白目！ | 請確認，您的隊友，是不是白目。 ‖ Thank you for your cooperation. | Tingting ‖ Karen | `allySlain` |
| `ex-unlock` | EX 解放！ | イーエックス、使用可能になりました。 | Kyoko | `exUnlock` |

**The zh column is the canonical meaning, NOT a translation of the spoken text.**
On most lines the two deliberately diverge — that gap is the joke. Never
"normalise" the pack to one language: which line is in which language is a
per-line decision recorded with its reasoning in `announcer.cast.json`. In
brief:

- **`match-start`** is the thesis. Taiwan's MRT and HSR announce everything twice
  in two languages, and 「請站穩踏階」 (mind your footing on the escalator) is a
  phrase every Taipei commuter has heard ten thousand times. Bolting a real
  transit-safety notice onto the opening of a deathmatch, two composed announcers
  handing off exactly as a station PA does, only works because both halves are
  flawless. Kyoko reads 去死団 with correct Japanese on'yomi (*kyoshidan*) — a
  legitimate Japanese reading of the team's Japanese name, **not** a
  mispronunciation.
- **Japanese** carries the politeness gags, because 丁寧語 has a courtesy ceiling
  no other language here reaches: 「ご準備ください」 for "FIGHT!", 戦闘不能 (the exact
  JRPG menu term for a downed party member) followed by a hold-queue phrase,
  and 使用可能になりました — the register of a vending machine coming back online.
- **Chinese** carries departure-board Mandarin (即將開始), consolation-prize
  customer service (感謝您的參與 with the honorific 您), and broadcast sign-off
  formula (以上，報告完畢) — someone is unstoppable and the announcer is filing
  paperwork about it.
- **English** carries the two lines where the term of art is already English for
  every Taiwanese and Japanese player ("Level up", "Rampage"), each collided with
  gate-agent register at 1.98 semitones of pitch movement.
- **Cantonese** carries exactly one line: 打完收工 is HK film-crew slang ("that's
  a wrap, clocking off") that every Taiwanese player knows from HK action cinema.
  The phrase *is* Cantonese; routing it through Mandarin would strip the register.

**`ally-slain` does not collide with the human `sfx/pcdie.mp3`.** An earlier pass
fled to English "baka" through a robot voice to avoid that. Unnecessary: the
human clip **shouts** 「請確認你的隊友是不是白目!!」, and this one reads the identical
Chinese words as a flat three-clause verification procedure with comma pauses and
a full stop. Same text, unmistakably different object. The human quip is
untouched.

### Pacing — one rate for the whole pack

**185 wpm on every line, every voice.** Kyoko's and Tingting's `say` default is
exactly 180 (durations are identical at `-r 180` and unset), so 185 is marginally
brisker than native and *identical for everyone*. Evenness is itself the
announcer signal: a PA system does not change tempo because the news got
exciting. A rate outlier reads as a character doing a bit — the retired pack had
one line at 150 wpm for a scripted stammer, which is precisely the register this
pack rejects. A test pins the single rate.

### Loudness — Apple's voices are NOT level-matched

Raw integrated loudness across this cast spans **9.5 dB**: Kyoko -25.2 LUFS (peak
-9.7), Tingting -19.6 (-4.8), Karen -16.4, Sinji -15.7. Normalisation is
mandatory, not cosmetic.

The pack asks for **`targetLufs: -16`, `truePeakDb: -1.5`** — **EBU R128 gated
integrated loudness**, not the legacy `volumedetect` mean. That matters: mean
volume is **ungated**, so it averages the pauses into the level and pause-heavy,
short or high-crest clips measure artificially quiet and get under-gained, after
which the peak ceiling binds before the target is reached. That measurement
artefact — not a dynamics problem — is what left earlier packs at -18.2 dB on
`ex-unlock`. All 13 clips now land at **-16.2..-16.0 LUFS (0.20 dB spread)**.
Kyoko needs +9.2 dB against 8.2 dB of headroom, i.e. ~1 dB of limiting, well
inside tts-gen's 6 dB bound. Clip lengths 0.99–4.88 s.

### The retire chain — nothing here has ever been deleted

`retired-zh` (#34) → `retired-ja-kyoko` (#40) → `retired-jank-novelty` (#57 first
pass) → the live pack (#57, corrected). Each archive keeps its clips, its
`.mp3.hash` sidecars and a `NOTE.md` explaining what it was and why it was
superseded; each has a retargeted manifest
(`announcer.zh-TW.json`, `announcer.ja-JP-kyoko-retired.json`,
`announcer.jank-novelty-retired.json`) whose `out` paths point **into the
archive**, so an innocent rerun can never overwrite the live pack. A test asserts
that retargeting. Re-running one is a no-op when the archive is intact, which is
the integrity check.

`retired-zh` is worth keeping for a second reason: it is the *evidence* for the
phantom-voice bug — an entire Chinese announcer pack that was secretly Alex, an
American man, spelling his way through Chinese.

### Production TTS

These are **local/dev placeholder flavor**. For production the same manifest is
re-rendered through a real cloud TTS provider via the platform proxy
`POST /api/v1/ai/tts` (task #23 stub-mode: `501 {"stub":true}` when no provider
is configured, so these local clips stay). The admin supplies the key at runtime,
server-side only — **no API key ever lives in the repo**. Machine-VO provenance
is also recorded in `content/assets/CREDITS.md`.

### SYSTEM vs CHARACTER (still the rule)

- **SYSTEM** = a broadcast *about* whoever died / levelled / started the round.
  It has no speaker in the fiction. All seven events —`matchStart`, `roundStart`,
  `levelUp`, `death`, `multiKill`, `allySlain`, `exUnlock` — are announcer VO
  only, zero map quips.
- **CHARACTER** = a named champion speaking. These **stay Chinese**: the `kill`
  pool, `taunt`, `abilityCast`, `champSelectConfirm`/`pick`, and every `select`
  pool in `content/config/champion-voices.json`.
- **On-screen text stays Chinese everywhere.** Only the announcer *voice* is
  multilingual.

`exUnlock` joined the SYSTEM set in #40: an EX rank 0→1 flip is a system state
change, but it had no announcer clip at all — only `87joke`, a 7.06 s 飛影 quip,
which went to 飛影's champion-voice pool.

Nothing was deleted. The six map-announcer quips displaced from system pools live
in two **opt-in** flavour pools, split by length because randomising an 8.8 s set
piece against a 1.4 s stab at `maxConcurrent: 1` is exactly the bug this task
fixed (`heycharlie` won both observed real match starts and drowned the VO):

| pool | clips | why |
| --- | --- | --- |
| `mapFlavorIntro` | `heycharlie` 8.82 s, `letsgo` 8.37 s | long-form set pieces |
| `mapFlavorAnnounce` | `pcdie` 1.93 s ★, `4die` 1.67 s, `up` 1.55 s, `die` 1.41 s | short stabs |

★ `pcdie` is the headline clip: the **original human recording** of
請確認你的隊友是不是白目!!, the line this whole announcer feature is named after.
It is unambiguously a system broadcast so it cannot sit in `allySlain` any more,
but it must stay exactly one toggle away.

> **Both flavour pools are authored, staged and test-covered but NOT YET FIRED.**
> They need an opt-in 地圖原聲 / "map flavour VO" setting, and the settings UI
> lives under `apps/client/src/ui/**` (owned by task #42). Until that lands the
> clips are preserved and reachable, not playing. Do not wire them into
> `AudioDirector`'s system path.

---

## `voices/names/` — champion call-out pack, 稱號 + 全名 (task #35 → #57)

One clip per champion, spoken when the player **confirms** a pick in champ
select. Every call-out is **稱號 (title), a beat, then 全名 (full name)** — the
anime-intro cadence, read flat:

> 「外掛開很大的死神，」 → 「クロサキイチゴ。」
> 「ハンヨウヒトガタケッセンヘイキ・ショゴウキ。」
> 「至尊學長，」 → 「ムササビセンセイ。」

**Apple-TTS MACHINE VO** via `tools/tts-gen`. Two commands — the casting table is
the source of truth, and it writes both manifests so display text and spoken text
cannot drift:

```sh
node tools/tts-gen/src/build-champ-names.mjs                                    # table → both manifests
node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json  # → 112 mp3s
```

`MANIFEST.json` is **generated — do not hand-edit it.** Edit the `CASTING` table
in `tools/tts-gen/src/build-champ-names.mjs` and re-run.

### ⚠ THE 稱號 IS NEVER DROPPED. It is the joke, not a label.

The user asked for title+name **three separate times** and it shipped name-only
twice, so this is now pinned by a test
(`packages/shared/src/content/championNamesJa.test.ts`). Two reasons it matters:

1. **The titles are the best 惡搞 material in the game.** 「美白大法師 - 黑人牙膏」
   is a Taiwanese toothpaste gag (Darlie). 「至尊學長」, 「鬼畜紅王」,
   「外掛開很大的死神」, 「被剝削的勞工階級」, 「國寶級的畜生」 — these are jokes.
   A name-only pack threw all of it away and left a bare character name.
2. **Without the title, champions are indistinguishable.** Six pairs differ
   *only* by 稱號, so name-only rendered them to **identical audio** — violating
   task #55's champion-identity rule (a hero number is a distinct character):

   | pair | shared 全名 | distinguishing 稱號 |
   | --- | --- | --- |
   | `h01n` / `h01o` | 黑崎一護 | 開外掛的死神 / 外掛開很大的死神 |
   | `o00x` / `ogrh` | 悟空 | 超級賽亞人 / 賽亞人 |
   | `o02l` / `ofar` | 皮卡丘 | 神騎寶貝 / 神奇寶貝兒 |
   | `u00b` / `udea` | 飛鼠先生 | 最M的魔法Jizz / 至尊學長 |
   | `o01z` / `o02v` | 高町奈葉 | 魔砲少女 / 白色惡魔 |
   | `u00l` / `umal` | 拳四郎 | 北斗之鼠 / 北斗神拳掌門人 |

**If a line runs long, the RATE goes up — the title is never trimmed to fit.**
Two clips use that escape hatch (`godie-u012` 205 wpm, `godie-u00b` 200 wpm);
everything else is the pack-wide 185.

### The data — split on `" - "`, recorded both ways

Champion names follow the WC3 convention `稱號 - 全名` for **109 of 113**
champions. The build splits on `" - "` and records both halves alongside exactly
what is spoken, so the display string and the audio can never diverge:

```json
{ "champions": { "godie-h01o": {
    "zhName": "外掛開很大的死神 - 黑崎一護",
    "zhTitle": "外掛開很大的死神", "zhFullName": "黑崎一護",
    "spokenTitle": "外掛開很大的死神", "spokenName": "クロサキイチゴ",
    "spokenLine": "外掛開很大的死神， ‖ クロサキイチゴ。",
    "lang": "zh-TW ‖ ja-JP", "voice": "Tingting ‖ Kyoko",
    "segments": [ {"lang":"zh-TW","voice":"Tingting","text":"外掛開很大的死神，"},
                  {"lang":"ja-JP","voice":"Kyoko","text":"クロサキイチゴ。"} ],
    "jaTitle": null, "jaName": "クロサキイチゴ", "reading": "Kurosaki Ichigo",
    "clip": "assets/audio/voices/names/godie-h01o.mp3" } } }
```

`‖` marks a fragment boundary where the voice changes. The **four** champions
authored without a 稱號 (`godie-h02s` 死亡騎士, `godie-h02z` 不良少年, `sela`,
`thorne`) speak the name alone — handled, not special-cased away.

**`MANIFEST.json` is the canonical mapping, not `content/config/`.** `config/*`
is a schema-validated, `_index.json`-indexed collection, so a new doc id there
would have to land in the shared zod union and every rebuilt index at once;
assets are served verbatim from the same `/content/` mount, so the client fetches
this file directly and a 404 degrades to silence.

### Casting rules

Same direction as the announcer pack — **字正腔圓, not 機械音**; the joke is that
a composed broadcast voice treats 「外掛開很大的死神」 as a job title. 89 clips are
Kyoko alone, 19 are Tingting→Kyoko, 2 are Tingting→Karen, 2 are Karen alone.

1. **A Japanese ORIGINAL exists → restore it, do not translate.** This is the
   *straight* reading, and straight is the register: 超級賽亞人 → スーパーサイヤジン,
   最終幻想 → ファイナルファンタジー, 最終泛用人型決戰兵器 → ハンヨウヒトガタケッセンヘイキ,
   火霧戰士 → フレイムヘイズ, 七夜怪談 → リング, 黑暗福音 → ダークエヴァンジェル,
   種子神奇寶貝 → タネポケモン, 完全而瀟灑的女僕 → カンゼンデショウシャナジュウシャ,
   白色之翼 → シロキツバサ. Kyoko's 4054 Hz rolloff is why a 14-mora compound like
   ハンヨウヒトガタケッセンヘイキ stays crisply segmented instead of turning to mush —
   that is what makes the long ones funny rather than unintelligible.
2. **Untranslatable Taiwanese 稱號 → Tingting reads it in Mandarin, then hands to
   Kyoko for the name.** A crisp Mainland-standard newsreader delivering PTT
   slang, then a crisp Tokyo announcer delivering the character name, with a
   clean seam. 外掛 ("cheat/hack") has no Japanese equivalent that keeps the
   sneer; 學長/學姊 is Taiwanese campus hierarchy that ja 先輩 flattens;
   剝削/階級 is Chinese class-satire vocabulary. Applies to 19 entries, including
   小叮噹 → ドラエモン, where the Taiwanese childhood name hands off to the
   canonical Japanese one.
3. **Genuinely English/Western referent → Karen, that fragment only.** 姜窩肯 +
   "Johnnie Walker" (the Taiwanese phonetic pun only exists because the English
   is a real brand, so both halves must be pronounced correctly), and X戰警 +
   "Wolverine". Used **sparingly — 4 entries total** — enough to make the third
   language present without turning the pack into a language demo. Fate's
   バーサーカー / ライダー / セイバー are canonical katakana, so they stay Kyoko.
4. **Chinese classical/historical names → Kyoko throughout, on'yomi.** 曹操孟德 →
   ソウソウモウトク, 趙子龍 → チョウウンシリュウ, 呂布奉先 → リョフホウセン, 令狐沖 →
   レイコチュウ, 黑化張飛 → チョウヒエキトク. **This is NOT a mangling gag** —
   Sino-Japanese on'yomi of a Chinese historical name is the correct and standard
   Japanese reading. It stays because it is *right*, not because it is wrong.
5. **The two English-named non-w3x champions go wholly to Karen**, in English:
   "Sela, the Ember Sage" / "Thorne, the Bramble Knight". They are not from the
   map's Taiwanese/anime world, and forcing them into katakana (セラ / ソーン) threw
   away the only two entries where English is the native language.

**Katakana for every Japanese fragment**, and **never Latin script in a Kyoko
fragment** — Kyoko transliterates Latin to katakana internally, so Latin text
there is a non-deterministic guess rather than a reading. A test pins this.

### No novelty voices — four were reverted

A superseded pass added per-entry `voice` overrides casting formant synthesisers
as the punchline: `godie-h021` 破銅爛鐵-阿強一號 (Eddy), `godie-h02k`
國寶級的畜生-熊貓 (Grandpa), `godie-nman` 地獄歌神-憤怒的胖虎 (Rocko),
`godie-obla` 被剝削的勞工階級-牧太郎 (Reed). **All four were reverted.** Every one
is a formant synth with 85% rolloff ≤ 2304 Hz and spectral flatness ≤ 0.0147 —
they cannot articulate a 12-mora 稱號 intelligibly. See the announcer section for
the full measurement. A test bans the whole family from this pack.

### Loudness — brought into the announcer band

The pack previously shipped with **no normalisation at all** and sat at
**-21..-27.5 dB**, 6–12 dB under the announcer, so a champ-select call-out was
audibly quieter than the broadcast that followed it. All 112 clips are now
rendered at the **same `targetLufs: -16` / `truePeakDb: -1.5`** as the announcer,
landing at **-16.2..-15.8 LUFS (0.40 dB spread)**.

Short name clips are exactly the case the ungated `volumedetect` mean gets wrong,
so the **gated EBU R128** metric is used. R128's gate needs a full 400 ms block
and the shortest clips here are under that, so `tools/tts-gen` measures on
silence-padded audio (gating discards the pad; verified stable for any pad
0.4–3.0 s).

Clip lengths **0.75–3.04 s, mean 1.82 s** — up from a 0.86 s mean under
name-only, which is the title being spoken.

### Confidence + coverage

Per-entry `evidence` records which casting rule applied and why. **Coverage: 112
of the 113 authored champions.** `godie-u01q`「測試英雄 - 索隆」is a declared
placeholder skip (recorded in the manifest's `skipped` array; a test duplicate of
`godie-u01u`) and gets no clip.

### Playback

`apps/client/src/audio/nameVoice.ts`, fired from `ui/actions.ts`
(`hudActions.selectChampion` — the single seam where a pick becomes an action,
shared by the online and offline flows). It plays on its **own reused
`HTMLAudioElement`**, deliberately off the WebAudio graph, and only READS the
mixer's public state (`audioSystem.isUnlocked` / `volumes()` +
`effectiveGain(v, "sfx", 0.95)`) — so master mute, SFX mute and the SFX slider
all apply, but `AudioSystem.ts` is untouched. A ~1 s per-champion guard makes a
double confirm play exactly one clip, and a new call-out replaces the previous
one rather than overlapping. The existing `champSelectConfirm` click SFX is
unchanged; the name VO layers over it.

The client gates on **`spokenLine`** (falling back to `jaName` for pre-#57
manifests). Do **not** reintroduce a "must be Japanese / must be Kyoko"
assumption there: four call-outs are wholly English and carry no `jaName` at all.


## `sfx/lab/` + `voice-jp/` — the 効果音ラボ pack (task #51)

**40 real recordings** (32 SFX + 8 Japanese voice clips) from **効果音ラボ /
Sound Effect Lab** (https://soundeffect-lab.info/), downloaded 2026-07-22. This
is the first *recorded* material in the tree that is not the map's own quips:
`sfx/fx/` is 21 synthesised lavfi clips with correct physics but **no material**
(every weapon is the same band-passed noise whoosh, whatever it is swinging),
and a whole class of moments — shop denial, purchase, gold, panel open, low
health, gongs, explosion, heal, buff, elemental casts, settlement reveal — had
**no sound bound at all**.

```
sfx/lab/     32 SFX  + MANIFEST.json + ACQUIRE.py + VERIFY.py
voice-jp/     6 voice + MANIFEST.json,  voice-jp/candidates/ 2 more (quarantined)
```

**Licence — read `content/assets/CREDITS.md` before touching these.** Free for
commercial use, credit **optional** (so this is a COURTESY credit, filed with the
CC0 art, *not* with the mandatory 魔王魂/CC-BY rows) — but copyright is **not**
waived, and three prohibitions bite in GGD: no soundboard/sound-test screen for
this directory, **no AI training / voice cloning**, and the voice actress's lines
must be **played whole**, never re-cut into a sentence she did not record.
Byte-identical copies of many clips exist on ニコニ・コモンズ under a
commercially **restricted** licence — only ever re-download from the `sourcePage`
recorded in the manifest.

**Why `voice-jp/` and not `voices/`:** `audio/voices/**` and `audio/announcer/**`
are task #40's tree (machine TTS). This is a *third* sibling — real human ja-JP
system VO — and lives beside them so a future pass does not silently merge a
recorded voice into a machine-TTS pool. Both manifests say so.

### Pipeline (identical conventions to the rest of the tree)

mono, 44.1 kHz. Decode → resample → downmix → trim edge silence
(`silenceremove` at −55 dB peak, 20 ms pad both ends, applied through `areverse`
for the tail) → gain → encode. **WAV** (16-bit PCM) for transient-led clips
≤ ~2 s, where MP3 encoder delay would shift a 40 ms attack; **MP3** (libmp3lame
192 kbps CBR mono) for longer tonal beds and all voice. Four clips that still had
signal above −35 dB at their last 25 ms get a 20 ms fade-out so the buffer does
not end on a non-zero sample and click — `bow-draw.wav` is the important one, the
source itself cuts off mid-creak.

SFX are **peak-normalised to −3.0 dBFS**, exactly like `sfx/fx/*.wav`. Voice is
normalised to **mean −15.0 dB with a −1.5 dB peak ceiling** — the same targets
`tools/tts-gen` applies — so the recorded clips land inside the announcer band
(−15.0..−18.2 dB) and could sit in an announcer pool without a level seam. Voice
stays at 44.1 kHz even though `announcer/` and `voices/names/` are 22.05 kHz:
that 22.05 is an artefact of Apple `say`, and downsampling a real recording to
match a placeholder is a pure loss.

### Re-download / regeneration story

`sfx/lab/ACQUIRE.py` is the whole pipeline — it fetches each clip from the URL
recorded in `MANIFEST.json` (`sourceUrl`, always a soundeffect-lab.info path),
runs the conversion above, and rewrites the `pre`/`post` measurement blocks.
`sfx/lab/VERIFY.py` is an **independent gate over the staged tree** (it reads the
files, not the records): 1 audio stream, 44.1 kHz, mono, non-zero duration, mean
above the −35 dB silence floor, peak ≤ −0.1 dB, WAV must be `pcm_s16le`. It
warns — does not fail — when a clip drifts off the −3.0 dB SFX peak target or out
of the voice band. Run `python3 content/assets/audio/sfx/lab/VERIFY.py`; it
covers `voice-jp/` too and exits non-zero on any failure.

Measured levels are recorded per clip; note `magic-fire.wav`, whose source peaks
at 0.0 dBFS and whose mono downmix overshoots full scale — the builder
re-measures after the stage write and corrects (final −5.6 dB, not the −3.0 a
single pass produces). Every peak in the manifest is measured, not assumed.

### What is bound (and the three bindings that are forbidden)

Live in `content/config/audio-map.json` today:

- **`block`** → `lab/block-clash.wav` + `lab/block-shield.wav` @ gain 0.63,
  replacing `fx/guard.wav`. 防禦 is weapon-agnostic, and the two members sit
  ±1.6 dB around the old pool level so the event's perceived loudness is
  unchanged.
- **`whiff`** → `lab/whiff-sword.wav` @ gain 0.43, replacing `fx/whiff.wav`
  (−21.7 dB mean vs −21.0 — a true drop-in).

Sixteen more events are **authored with tuned gain/cooldown/voice-cap but emit
from nowhere yet** — `uiDenied`, `uiCancel`, `panelOpen`, `shopPurchase`,
`goldGain`, `lowHealth`, `abilityRankUp`, `settlementReveal`, `vsReveal`,
`matchStartGong`, `matchEndGong`, `levelUpJingle`, `exUnlockSting`, `heal`,
`buffApply`, `explosion`. An unknown event is silent, so this costs nothing and
hands #38/#39/#44 a binding that is already level-matched.

> **Do not fold `matchStartGong` / `levelUpJingle` / `exUnlockSting` back into
> `matchStart` / `levelUp` / `exUnlock`.** Those three pools are
> **announcer-VO-only** by task #40, and `announcerVo.test.ts` asserts they
> contain nothing outside `assets/audio/announcer/`. The gong and the jingle are
> meant to be **layered alongside** the Japanese VO, not mixed into its pool.

**Every weapon clip is deliberately unbound.** `basicAttack`,
`projectileSpawn`, `projectileHit`, `attackWindup` and `abilityCast` are single
**global** events — GGD has no per-weapon or per-ability audio routing — so a
katana slash bound there lands on a mage's staff and a fletched arrow lands on a
fireball. The sword/katana/greatsword/bow/arrow/gunshot/punch clips and the three
elemental casts (`magic-fire`, `magic-ice`, `magic-lightning`) are the raw
material for that routing, which is client-audio work.

### Voice: the real-actress vs Kyoko-TTS hybrid (guidance for #40 / #41)

The six `voice-jp/` clips are one actress — 「落ち着いた女性」 (`info-lady1`) —
covering 「レベルアップ」「準備はいいですか？」「3、2、1、0」「しばらくお待ちくだ
さい」「おめでとうございます」「残念でした」, plus 「ようこそ」「スタート」 held
back in `candidates/`. Every one is strictly better *as audio* than the Kyoko
render of the same idea: real prosody, real breath, and no TTS artefacts.

**They are nonetheless all unbound, on purpose.** Three reasons, in order of
weight:

1. **A mixed pool is worse than either voice alone.** `roundStart` has two
   clips, `levelUp` two, `death` three. Dropping one recorded clip into a pool
   whose other members are Kyoko means the announcer's *identity changes at
   random between rounds*. A listener forgives a robotic announcer; nobody
   forgives an announcer who is two different people. **Rule: swap a pool
   whole, or leave it alone.** This is why the two partial matches are
   quarantined in `candidates/` rather than staged as ready.
2. **Stock coverage is partial, and the gap is exactly the lines that matter
   most.** GGD's announcer set is 13 lines, several of them bespoke — above all
   the user's own 「請確認你的隊友是不是白目!!」 team-kill quip, which has no
   stock equivalent in any library. So a full swap is impossible: the honest
   ceiling is a hybrid, which lands us back in problem 1.
3. **The obvious escape is licence-barred.** Cloning the actress to synthesise
   the bespoke lines in her voice would solve both — and 効果音ラボ **explicitly
   forbids AI training** on this material. That path is closed, not merely
   unattractive.

**Recommendation — split by SURFACE, not by line.** Give the recorded actress
whole *surfaces* the machine voice does not already own, so the two voices never
alternate inside one moment:

- **Take:** the pre-match / out-of-combat flow, which today has **no VO at
  all** — `prepPhaseStart` 「準備はいいですか？」 (needs #38),
  `matchmakingWait` 「しばらくお待ちください」, and the settlement screen
  (「おめでとうございます」/「残念でした」). New events, no existing pool, zero
  mixing risk, and the pack's clearest win.
- **Leave:** the seven in-match system events (`matchStart`, `roundStart`,
  `levelUp`, `death`, `multiKill`, `allySlain`, `exUnlock`) entirely with Kyoko
  until a *complete* recorded set exists for all 13 lines. Half-swapping them is
  the failure mode above.
- **Fiction that makes the split legible:** the recorded voice is the *lobby /
  arena hostess* (she greets, she counts you in, she congratulates you); the
  synthesised voice is the *in-match broadcast system*. Two speakers by design
  reads as production value; two speakers by accident reads as a bug.
- **`countdown.mp3` cannot drive `countTick`** regardless: it is one 3.37 s
  「3、2、1、0」 utterance, and the champ-select countdown fires a separate cue
  per second with rising volume. It would need splitting into four — which is
  precisely the re-cutting the licence's voice-actor clause tells us not to do
  casually. Use it whole as a single pre-match count-in, or not at all.
- **If a full swap is ever wanted,** the level work is already done: these clips
  are normalised to the announcer's own targets, so they can replace a pool
  without re-tuning `gain`. What is missing is 7 more recorded lines, not
  loudness.
