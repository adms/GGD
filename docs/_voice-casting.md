# Voice casting — separation baseline, axes, and threshold

> 「如果大家聲音都相似，戰鬥的時候就會很吵而且不知道是誰放了哪招」
> 「所以一定要有個性特色接近原本角色的聲音檔參考」

Voice is a **combat-legibility channel**, like the ability icons and the VFX colour/shape language.
The success metric is **not** "does it sound like the anime character". It is:

> **can a player tell, by ear alone, WHICH champion just acted — without looking?**

Sounding like the source character is the best *known method* (a familiar voice is placed instantly),
but the property being optimised is **separation**. This document establishes that property
numerically, so casting decisions stop being taste and start being a measurement.

Machine-readable companions:

- `content/assets/audio/voices/_separation-baseline.json` — per-champion metrics, the 192-d campplus
  embedding of every shipped clip, and the thresholds below. **§1–§7 measure the problem.**
- `content/assets/audio/voices/_voice-casting-plan.json` — the target voice identity for each of the 48
  open-roster champions: register band, timbre family, delivery instruction, reference brief, and the
  specific pairs each casting decision pulls apart. **§8 is the plan.**
- `content/assets/audio/voices/_separation-qc-gate.json` — the QC gate the voice pipeline runs alongside
  its fidelity check: thresholds as a function of clips-per-champion, the pass rule, the blame rule, and
  the escalation ladder on failure. **§9 is the gate.** It supersedes §7, which is the n=1 special case.

---

## 1. The instrument

| | |
|---|---|
| Speaker embedding | `campplus.onnx` (192-d), from `Fun-CosyVoice3-0.5B` |
| Features | torchaudio kaldi fbank, 80 mel bins, `dither=0`, 16 kHz, per-utterance mean-normalised |
| Metric | cosine similarity of L2-normalised embeddings |
| Prosody | librosa pyin F0 (55–800 Hz), spectral centroid / rolloff / flatness / tilt, onset rate, RMS dynamics |
| Audio prep | everything transcoded to 16 kHz mono via ffmpeg first |

The fbank pipeline is copied verbatim from `CosyVoiceFrontEnd._extract_spk_embedding`, so a number
here means the same thing it means to the TTS engine that will consume the reference clips.

**657 clips embedded**: 113 shipped quote clips, 511 WC3 hero-soundset clips, 33 macOS system-voice renders.

### Two corrections applied before any statistic

1. **Duplicate clips.** 113 champion ids ship only **94 distinct audio files** — 19 ids are
   byte-identical copies of another id's clip (the same character duplicated across hero numbers,
   cf. task #113). Left in, they produce cosine 1.0000 pairs that would have flattered nothing and
   inflated the collision count with fake entries. Collapsed to one representative throughout.
   *None* of these duplicate groups has two members in the open roster, so they are a content-hygiene
   issue, not a legibility one.
2. **Duration.** campplus needs material; 15–17 % of clips in both corpora are under 1 s, which
   inflates *within*-speaker variance and makes the instrument look worse than it is. The WC3
   calibration is restricted to clips ≥ 1.2 s from soundsets with ≥ 4 such clips (28 actors, 375 clips).

---

## 2. Calibration — what "two different voices" actually measures

A threshold picked as a round number is worthless. `data/blizzard-overlay/sounds` supplies a better
one: **31 Blizzard WC3 hero soundsets — real, professionally cast voice actors, deliberately made
tellable-apart in an RTS**, recorded as short, dry, shouted game VO. That is the same *kind* of
material as our clips and it is a shipped product that demonstrably works. It gives both
distributions on the same ruler.

*(Blizzard-owned audio, local-only overlay, used here purely as a measuring reference — nothing from
it is shipped or redistributed by this analysis.)*

| distribution | n | mean | sd | p50 | p95 |
|---|---|---|---|---|---|
| **same** actor, different lines | 2 664 | 0.578 | 0.137 | 0.593 | 0.782 |
| **different** actors | 67 461 | 0.359 | 0.144 | 0.359 | 0.594 |

- EER threshold **0.478**, EER **21.8 %**, d′ **1.56**
- Likelihood-ratio crossover **cos ≈ 0.49**

The overlap is large, and that is itself a finding: on 1–4 s of shouted game VO, campplus is a
**coarse** instrument. Every claim below is therefore framed as a *comparison against this control*,
never as an absolute score. The calibration also includes screams, death cries and taunts, which
depress the same-actor similarity and thus *lower* the bar — so where the shipped pack loses to
this control, it loses a fortiori.

---

## 3. The threshold, and why it is that number

### `confusable = cosine ≥ 0.50`

At **cos ≈ 0.49** the measured likelihood ratio `p(s | same speaker) / p(s | different speaker)`
crosses **1.0**. Above it, the evidence favours "these two clips came from the same person".
That is the principled definition of confusable: *the point where the instrument can no longer
assert the two champions are different people.* Rounded up to **0.50** for a defensible edge.

| cos | LR (same/diff) | % of genuinely-different WC3 actor pairs at or above |
|---|---|---|
| 0.40 | 0.44 | 39.5 % |
| 0.45 | 0.66 | 27.8 % |
| **0.50** | **1.13** | **17.6 %** |
| 0.55 | 1.97 | 9.8 % |
| 0.60 | 3.62 | 4.6 % |
| 0.70 | 15.1 | 0.4 % |

### `target = cosine ≤ 0.40` for a newly cast pair

0.40 sits at LR ≈ 0.44 — about 2:1 in favour of "different speaker" — and is the WC3 different-actor
p60. Casting *to* the fail line leaves no room for the fact that a single short clip is a noisy
measurement, so the design goal is set one band tighter than the defect line.

### `pair budget ≤ 18 % of pairs over 0.50`

**0 % is not achievable and demanding it would be pseudo-rigour.** 17.6 % of genuinely-different
WC3 actor pairs exceed 0.50 — two gruff orcs really do sound alike, and that roster shipped and works.
The roster passes when its over-threshold fraction is **at or below the WC3 control**.

### `F0 register spacing ≥ 2 semitones` — a *separate* gate

Correlation of campplus distance with each prosodic gap, over WC3 actor pairs:

| gap | r |
|---|---|
| speaking rate | +0.259 |
| spectral centroid | +0.263 |
| pitch span | +0.165 |
| **F0 register (semitones)** | **+0.091** |
| dynamics | −0.034 |

campplus is **nearly blind to pitch register** — yet register is one of the strongest cues a
listener uses mid-fight. An embedding-only gate would happily pass two champions sitting on the
same note. Gate F0 separately. Justification for 2 semitones: WC3 actors span **46.3 semitones**
with only **5.2 %** of pairs inside 1 semitone; the shipped GGD roster spans **16.1 semitones**
with **20.3 %** of pairs inside 1 semitone.

### All-pairs, not "who meets whom"

Champions who never share an arena matter less — but the open roster is 48 and *any* 12 can meet.
There is no seeding to exploit, so this is treated as an all-pairs problem throughout.

---

## 4. Baseline — the shipped 2-voice pack, measured

`quotes.json` casts all 113 champions to exactly two macOS voices: `Otoya (Enhanced)` ×72,
`Kyoko` ×41. Measured on the ruler above:

| population | n pairs | mean | p50 | p95 | ≥ 0.50 |
|---|---|---|---|---|---|
| all distinct champions (94) | 4 371 | 0.379 | 0.340 | 0.811 | **40.4 %** |
| **open roster (48)** | 1 128 | 0.329 | 0.269 | 0.749 | **30.9 %** |
| *— WC3 control —* | 67 461 | 0.359 | 0.359 | 0.594 | *17.6 %* |
| pairs sharing a macOS voice | 2 358 | 0.600 | 0.617 | 0.856 | — |
| pairs on opposite macOS voices | 2 013 | 0.121 | 0.118 | 0.256 | — |

That last split is the whole story in two rows. The roster's overall mean of 0.329 looks
*respectable* only because it averages a bimodal distribution: the male/female split is enormous
(0.121) and everything inside each half is collapsed (0.600). There is no middle. **Two timbres.**

### The finding that settles it

| within-voice population | champions | mean | % scoring above the median similarity of two clips of the **same WC3 actor** (0.593) |
|---|---|---|---|
| within `Otoya (Enhanced)` | 61 | 0.554 | **46 %** |
| within `Kyoko` | 33 | 0.759 | **92 %** |

**92 % of female champion pairs are more similar to each other than one WC3 voice actor is to
himself on a different line.** By the measuring instrument, they are not similar voices — they are
*the same speaker*. The male half is only better because Otoya has more text variety to work with;
nearly half of it fails the same test.

### By gender, open roster

| | champions | mean | p95 | ≥ 0.50 |
|---|---|---|---|---|
| male | 30 | 0.468 | 0.678 | 46.9 % |
| female | 13 | 0.713 | 0.868 | **97.4 %** |
| neutral | 5 | 0.667 | 0.828 | **100 %** |

Every neutral pair and all but one female pair is a legibility defect. Note that the 13 female and
5 neutral champions are *not* a niche: they are 37.5 % of the open roster, so a typical 12-champion
fight contains 4–5 of them.

### In an actual fight

Monte-Carlo, 20 000 draws of 12 combatants, counting confusable pairs among the 66 pairs formed:

| | expected confusable pairs / 66 | p10–p90 |
|---|---|---|
| **GGD open roster (48)** | **21.9** | 15 – 29 |
| WC3 actors (28), one random clip each | 12.3 | 6 – 20 |

**1.78× worse than the control.** Per champion, at cos ≥ 0.50:

| | median confusable partners |
|---|---|
| **GGD open roster** | **17 of 47** (36 %) |
| WC3 control | 4 of 27 (15 %) |

Worst offenders (open roster, distinct characters, distinct audio):

```
0.898  熊貓 / 草泥馬        [Kyoko]  f0 235/239 Hz
0.897  Saber / 草泥馬       [Kyoko]  f0 233/239 Hz
0.892  草泥馬 / Rider       [Kyoko]  f0 239/221 Hz
0.887  木乃香 / 初音        [Kyoko]  f0 236/237 Hz
0.884  Saber / 安云         [Kyoko]  f0 233/232 Hz
0.878  皮卡娘 / 皮卡丘      [Kyoko]  f0 209/219 Hz
```

Champions with the most confusable partners: 飛鼠先生 23, 索隆 23, 巴恩大魔王 22, 南野秀一 22,
賽菲洛斯 21, 拳四郎 21, 黑人牙膏 21.

### Register occupancy

48 open-roster champions span **16.1 semitones** (95–239 Hz) and cluster into two lumps with a dead
zone where a listener's discrimination is best:

```
  0–130 Hz  ##########################  26
130–160 Hz  ####                         4
160–200 Hz                               0     <-- nothing here
200–230 Hz  ###########                 11
230–260 Hz  #######                      7
```

WC3's 28 actors span **46.3 semitones** (55–798 Hz).

---

## 5. Negative result — "just use more system voices" does not work

Worth ruling out before spending effort on cloning. All **11** macOS `ja_JP` system voices
(Eddy, Flo, Grandma, Grandpa, Kyoko, Kyoko Enhanced, Otoya Enhanced, Reed, Rocko, Sandy, Shelley),
rendered on three identical lines each:

- different-voice pairs: mean **0.359**, and **31 %** already exceed the confusable threshold
- worst collisions: Eddy/Reed **0.78**, Grandma/Shelley **0.66**, Flo/Shelley **0.66**
- **largest mutually-distinguishable subset: 4 of 11**

They are siblings from one synthesis family. Even conscripting every Japanese voice on the machine
buys 4 identities for a 48-champion roster. **Reference-cloned voices are required**, which is what
the owner asked for and what CosyVoice 3 is installed to do.

For scale, the same measure on the other corpora at the EER threshold: GGD open roster **14 of 48**
mutually distinguishable, WC3 **12 of 28**. GGD's absolute count is not lower — its *density* is
(29 % vs 43 %), and it is spending 48 champions to buy what 28 actors buy with 28.

---

## 6. The axes — what a reference clip can and cannot buy

### Controllable through a TTS reference clip *and* measurable here

| axis | measure in the JSON | note |
|---|---|---|
| timbre / vocal-tract identity | `campplus` cosine | the primary thing a zero-shot reference transfers; this is what the threshold gates |
| pitch register | `f0MedianHz` | transfers with the reference speaker, near-orthogonal to campplus → **gate separately** |
| pitch mobility | `f0SpanSemitones` | monotone vs swoopy; part reference, part line |
| speaking rate | `onsetRatePerSec` | strongest prosodic correlate of embedding distance measured (r = +0.26) |
| brightness / tilt | `spectralCentroidHz`, `spectralTiltDbPerKhz` | reference-driven, but polluted by codec and loudness normalisation — measure post-normalisation |
| roughness / breathiness | `spectralFlatness`, `voicedFraction` | growl vs clean vs breathy; transfers weakly and inconsistently |

### Real separation levers this analysis **cannot** measure or control

- **Delivery / emotional attack.** A shout vs a mutter is set by the line and the engine's instruct
  channel, not the speaker embedding. Two champions on one reference voice *can* be pushed apart by
  delivery — but not measurably, from one neutral clip. The `tone` labels already authored in
  `content/config/_purchase-lines.json` (瘋癲 / 霸氣 / 熱血 / 傲嬌 / 冷靜 / 中二…) are the handle for this,
  and they are a *second* axis to spread on, not a substitute for timbre.
- **Loudness and dynamics.** The pack is EBU R128 normalised to −16 LUFS by design, which
  deliberately destroys this axis. A mixing decision, not a casting one — do not try to cast around it.
- **Spatialisation, reverb, per-champion EQ.** A genuine separation lever, entirely outside the TTS
  reference clip. Out of scope for casting, but worth naming as headroom the audio layer still has.
- **Lexical identity — the catchphrase itself.** The strongest real-world cue, and the actual reason
  the owner asks for source-character references: a familiar voice *plus* a familiar line is placed
  instantly, before any acoustic analysis finishes. No acoustic distance can score it. It lives in
  `quotes.json` `character` / `source`, and it is why 「聲音檔參考」 beats 「隨便找不同的聲音」.

### Honest limits of the measurement

- campplus on 1–4 s of shouted VO has **EER 21.8 %** against a professionally cast control. It
  ranks pairs well; it does not adjudicate any single pair. Use it to *screen*, then listen.
- Cosine is measured on the *shipped rendered clip*, not on the reference. Whether a CosyVoice
  zero-shot render actually lands where its reference sits is an assumption this baseline does not
  yet test — measure the rendered output, and re-measure after any loudness or codec change.
- One clip per champion means per-champion variance is unmodelled; the WC3 same-actor spread
  (sd 0.137) is the best available estimate of how much a second line would move a champion.

---

## 7. Pass/fail, as a gate

> **Superseded by §9.** What follows is correct, but only for `n = 1` clip per champion — the case that
> shipped. §9 generalises every number here to the number of lines a champion actually has, and adds the
> remedy-on-failure and human-audition steps this section leaves undefined. Implement §9.

A candidate voice cast for champion *X* passes when, against **every** other open-roster champion:

1. `cos(campplus) ≤ 0.40` — target; `≥ 0.50` is a defect that must be recast
2. `|ΔF0| ≥ 2 semitones`, unless cosine is already ≤ 0.40
3. roster-wide: **≤ 18 %** of all pairs at or above 0.50 (the WC3 control is 17.6 %)
4. the per-gender sub-rosters must each clear (3) on their own — the current pack passes nothing here
   (female 97.4 %, neutral 100 %), and a roster mean that hides a collapsed sub-population is the
   exact failure mode that shipped today

Current state against that gate: **open roster 30.9 %** vs a budget of 18 %. The gap is not marginal,
and it is concentrated entirely in the female and neutral casts.

---

*Measured 2026-07-24. Reproduce from `content/assets/audio/voices/_separation-baseline.json`;
the embeddings for all 94 distinct shipped clips are stored there so a candidate can be screened
against the roster without re-running the corpus.*

---

## 8. The casting plan — 48 open-roster champions

Machine-readable companion: `content/assets/audio/voices/_voice-casting-plan.json`.
Every number below is generated from that file; the two cannot drift.

### 8.1 Why a grid, and not a list of 48 voices

Section 3 sets `|ΔF0| ≥ 2 semitones` as a gate. Applied to all 1 128 pairs it is **arithmetically
unsatisfiable**: 48 champions two semitones apart need ~94 semitones of register, and human speech in
this kind of material spans about 34. Register alone therefore caps out near **17** mutually-separated
identities — about a third of the roster.

So the plan is a **grid**, not a ladder: a 16-band whole-tone register ladder (62.0 → 350.7 Hz, exactly
2 semitones apart, `62.0 × 2^(k/6)`) crossed with **8 timbre families**. Every pair must clear
**register ≥ 2 semitones OR a different timbre family** — the same OR the §7 gate already uses
(`|ΔF0| ≥ 2 st, unless cosine ≤ 0.40`); a family boundary is the design-time stand-in for "cosine will
come out low". Nothing in §7 is relaxed.

| check | result |
|---|---|
| pairs validated | 1,128 |
| pairs violating register-OR-family | **0** |
| distinct grid cells occupied | 48 of 48 champions |
| max champions sharing a cell | 1 |
| register span | **30.0 semitones** (shipped: 16.0, WC3 control: 46.3) |

The 160–200 Hz hole §4 found — where the shipped pack has **nothing at all** — now holds **8 champions**,
because that is where two character-true facts happen to land: 悟空 is canonically voiced by a woman playing a
man, and Rider is canonically a deep female alto. Filling the gap and respecting the source are the same move.

The 8 families: **CLEAR** clean modal phonation, no added texture, **RASP** gravel/creak/distortion in the fold, **BREATH** audible air in the tone, soft attack, **NASAL** forward mask placement, honky ring, **HOLLOW** dark, wide chest resonance, long tail, **BRIGHT** thin, piercing, high-formant edge, **PROCESSED** non-human treatment (layering/vocoder/formant shift), **CREATURE** non-linguistic animal production.

### 8.2 The in-repo anchor bank — measured, not asserted

`data/blizzard-overlay/sounds` is the same corpus §2 calibrated on, so its soundsets can serve as
**acoustic targets**: a later lane can measure a candidate against them before recording anything.
All 29 were embedded with the same campplus pipeline.

Averaging clips is not on the per-clip scale, so the threshold was re-derived by split-half:

| centroid scale | value |
|---|---|
| same actor (split-half) | 0.871 |
| different actors | 0.548 |
| EER threshold / EER | 0.756 / **12.0 %** |
| likelihood-ratio crossover | **0.792** |

> **Result worth carrying back to the dropbox rules:** EER falls **21.8 % → 12.0 %** when the identity is
> an average of several clips instead of one. `references/_dropbox/README.md` currently asks for one
> 5–15 s clip; **several short clips of the same person is a measurably better anchor**, and now there is a
> number for it.

At the calibrated 0.792 crossover the 29 soundsets collapse to **20 mutually distinct**
anchors — 9 are redundant duplicates of another (worst: `Wendigo`≈`ObsidianStatue` **0.919**,
`Thrall`≈`Peon` 0.851, `Banshee`≈`DarkRanger` 0.843, and `PandarenBrewmaster`≈`HeroPaladin` 0.799,
which is why the otherwise-perfect panda-for-熊貓 pick was dropped in favour of `GrizzlyBear`).

> This is the same shape of negative result as §5. Even a professionally cast 28-actor RTS roster only
> yields ~20 separable identities. **20 of 48 champions can be anchored in-repo; the other 28 need
> references from outside.** No bank on this machine solves a 48-champion roster.

**Provenance, stated once:** Blizzard-owned audio, DEV-only gated overlay (#10/#177). Used here as a
*description of a target sound*, not a shipping clone source. Anything cloned directly off it inherits the
same gating — `anchorIsShippable: false` in the JSON for all 20.

### 8.3 Champions that should NOT get sentence-level VO

Seven champions are cast `voiceClass: cry` — a signature cry/roar/grunt set instead of spoken lines.
This is not a shortcut. §6 notes that **lexical identity is the strongest cue and the one no acoustic
metric can score**; a non-linguistic signature is the purest form of it. 皮卡丘's cry is plausibly the
most recognisable sound in the entire roster.

| champion | why | what to record |
|---|---|---|
| **Berserker** (62.0 Hz) | 咆哮！(狂化不能言語) | A huge non-human roar: a demigod driven mad. |
| **初號機** (69.6 Hz) | 不能逃避(EVA名句) | A beast scream heard through steel: an animal howl layered with metallic resonance and a sub-bass floor. |
| **基廉列克** (78.1 Hz) | 敢反抗就碾碎你 | Guttural throat noise and nasal snorts from a heavy, angry body. |
| **妙蛙花** (87.7 Hz) | 妙蛙花！叫聲(非說話生物) | A big quadruped's low call -- wet, reedy, plant-like, ending on a two-syllable shape that reads as its own name. |
| **林克** (196.8 Hz) | 揮劍吶喊(角色近乎沉默) | Effort shouts ONLY -- sword swings, jumps, taking a hit. |
| **草泥馬** (248.0 Hz) | 這片草原是我的…咩！ | Speech that keeps collapsing into a GOAT BLEAT -- heavy tremolo on every sustained vowel. |
| **皮卡丘** (350.7 Hz) | 招牌叫聲，非說話生物 | The signature cry ONLY -- bright, high, two-syllable, rising at the end. |

**System note for #139/#142:** these champions still fire on champ-select confirm. Keep the 名言 *text*
on screen and play the **cry** as the audio — do not synthesise the borrowed sentence.

Two of the seven are decisions rather than readings, and want an owner ruling:

- **初號機** — the mecha does not speak; the shipped quote is Shinji's line borrowed. Berserk roar
  (unmistakable, maximal separation) **or** a strained teenage-boy read of the borrowed line. Not both.
- **基廉列克** — Usavich is a dialogue-free mime cartoon. A wordless growl is *faithful to the source's
  silence*, but it does mean this champion never speaks.

### 8.4 Pairs deliberately pushed apart

**The six 熱血 shounen boys.** Same archetype, same energy — they would collide on every axis at once.
Spread across **10 semitones** (110.5 → 196.8 Hz) and six different
timbre families. 蒼月潮 and 勇者小呆 share a band and are held apart by family alone (BRIGHT vs CLEAR) —
both are bright shouting boys, so that is the pair to listen to first when the renders exist:

| champion | band | family | the character-true reason it works |
|---|---|---|---|
| 黑崎一護 | 110.5 Hz | RASP | canonically dry and chesty — the dark end |
| 蒙其.D.魯夫 | 124.0 Hz | NASAL | voiced by a woman playing a boy: nasal, forward, cracking |
| 天地志狼 | 139.2 Hz | CLEAR | period-drama declamation, clean and theatrical |
| 蒼月潮 | 175.4 Hz | BRIGHT | the line is a shout across distance — strained and bright |
| 勇者小呆 | 175.4 Hz | CLEAR | boy-hero purity: no rasp, no nasality, pure tone |
| 悟空 | 196.8 Hz | RASP | also a woman playing a man: unusually HIGH and raspy |

**The worst pairs in the shipped pack**, and what breaks them:

| shipped pair | cos | separated by |
|---|---|---|
| 熊貓 × 草泥馬 | **0.898** | register 16 st apart (98.4 vs 248.0 Hz); timbre rasp vs creature; voice class speech vs cry |
| Saber × 草泥馬 | **0.897** | timbre clear vs creature; voice class speech vs cry |
| Rider × 草泥馬 | **0.892** | register 4 st apart (196.8 vs 248.0 Hz); timbre breath vs creature; voice class speech vs cry |
| 木乃香 × 初音 | **0.887** | register 6 st apart (220.9 vs 312.5 Hz); timbre breath vs processed |
| Saber × 安云 | **0.884** | register 2 st apart (248.0 vs 278.4 Hz); timbre clear vs breath |
| 木乃香 × 安云 | **0.882** | register 4 st apart (220.9 vs 278.4 Hz) |
| 皮卡娘 × 皮卡丘 | **0.878** | register 2 st apart (312.5 vs 350.7 Hz); timbre nasal vs creature; voice class speech vs cry |
| 桔梗 × Saber | **0.877** | register 2 st apart (220.9 vs 248.0 Hz); timbre hollow vs clear |
| 草泥馬 × 安云 | **0.868** | register 2 st apart (248.0 vs 278.4 Hz); timbre creature vs breath; voice class cry vs speech |
| 桔梗 × 安云 | **0.867** | register 4 st apart (220.9 vs 278.4 Hz); timbre hollow vs breath |

Across the whole roster the plan addresses **349 currently-confusable pairs** (30.9 % of 1 128, against §7's 18 % budget); every one of them is separated by register,
family, voice class, or a combination. The full per-champion breakdown is `separatesFrom[]` in the JSON.

**The 5 neutral champions are treated as an opportunity, not a rounding problem.** (13 is the all-113
figure; 5 of them are in the open roster.) They take the register extremes the human cast cannot
reach — 初號機 at 69.6 Hz and 妙蛙花 at 87.7 Hz at the bottom, 皮卡丘 at 350.7 Hz at the top — plus the two
production categories nothing else uses (PROCESSED, CREATURE). **3 of the six largest register moves** in
the plan are neutral champions. The exception is 草泥馬, which barely moves (+0.6 st) and is separated
entirely by production — a goat-bleat tremolo no other champion has — which is the point: the grid lets a
champion pay for separation in whichever currency suits the character.

### 8.5 The full cast

`Δst` = semitones from the shipped clip. Anchors are the 20 verified-distinct in-repo soundsets.
Full delivery instructions (Japanese, for `inference_instruct2`) and reference briefs are in the JSON.

| champion | source | class | band | family | rate | Δst | anchor | conf |
|---|---|---|---|---|---|---|---|---|
| **Berserker** | Fate/stay night | cry | 62.0 | CREATURE | 1.2 | -13.1 | PitLord |  |
| **初號機** | 新世紀福音戰士 (Evangelion) | cry | 69.6 | PROCESSED | 1.0 | -20.3 | MountainGiant | ~ |
| **死之王** | GGD原創(去死團逆襲) | speech | 78.1 | PROCESSED | 4.0 | -5.5 | ObsidianStatue | **LOW** |
| **基廉列克** | 監獄兔 (Usavich) | cry | 78.1 | RASP | 2.2 | -8.5 | Peon | ~ |
| **殺生丸** | 犬夜叉 (InuYasha) | speech | 87.7 | BREATH | 3.4 | -2.0 | HeroDeathKnight |  |
| **妙蛙花** | 寶可夢 (Pokémon) | cry | 87.7 | CREATURE | 2.0 | -16.2 | Hydralisk |  |
| **巴恩大魔王** | 達伊大冒險 (DQ: Dai) | speech | 87.7 | HOLLOW | 3.6 | -3.5 | — |  |
| **賽菲洛斯** | 最終幻想7 (FFVII) | speech | 98.4 | CLEAR | 3.8 | -4.2 | — |  |
| **呂布奉先** | 真三國無雙 (Dynasty Warriors) | speech | 98.4 | HOLLOW | 3.0 | -2.5 | Uther |  |
| **熊貓** | GGD原創(去死團) | speech | 98.4 | RASP | 3.2 | -15.1 | GrizzlyBear | **LOW** |
| **藤井八雲** | 三隻眼 (3×3 Eyes) | speech | 110.5 | BREATH | 3.6 | +0.9 | — | ~ |
| **拳四郎** | 北斗神拳 (Fist of the North Star) | speech | 110.5 | CLEAR | 4.2 | -0.5 | Arthas |  |
| **麻倉葉** | 通靈童子 (Shaman King) | speech | 110.5 | HOLLOW | 3.2 | +1.0 | HeroKeeperoftheGrove |  |
| **黑崎一護** | 死神 (BLEACH) | speech | 110.5 | RASP | 4.4 | -0.7 | — |  |
| **宇智波佐助** | 火影忍者 (Naruto) | speech | 124.0 | BREATH | 4.0 | +3.3 | — |  |
| **飛影** | 幽遊白書 (YuYu Hakusho) | speech | 124.0 | HOLLOW | 4.2 | -2.0 | — |  |
| **蒙其.D.魯夫** | 航海王 (One Piece) | speech | 124.0 | NASAL | 4.4 | +0.8 | — |  |
| **索隆** | 航海王 (One Piece) | speech | 124.0 | RASP | 4.6 | +2.2 | DruidoftheClaw |  |
| **南野秀一** | 幽遊白書 (YuYu Hakusho) | speech | 139.2 | BREATH | 4.4 | +3.4 | BloodElfSorceror |  |
| **天地志狼** | 龍狼傳 (Ryūrōden) | speech | 139.2 | CLEAR | 4.6 | +4.0 | — | **LOW** |
| **克勞德** | 太空戰士7 (FFVII) | speech | 139.2 | HOLLOW | 4.0 | -0.2 | — |  |
| **飛鼠先生** | GGD原創(去死團) | speech | 139.2 | NASAL | 4.8 | +4.2 | — | **LOW** |
| **臭作** | 臭作 (成人遊戲) | speech | 139.2 | RASP | 4.2 | +3.4 | — | ~ |
| **涅吉** | 魔法老師 (Negima) | speech | 156.2 | BREATH | 5.0 | +4.6 | — |  |
| **夜神月** | 死亡筆記本 (Death Note) | speech | 156.2 | CLEAR | 4.8 | +3.2 | — |  |
| **鬼畜狂刀KYO** | SAMURAI DEEPER KYO | speech | 156.2 | RASP | 4.0 | +5.7 | Rokhan | ~ |
| **蒼月潮** | 潮與虎/魔力小馬 (Ushio to Tora) | speech | 175.4 | BRIGHT | 5.0 | +10.7 | Rifleman |  |
| **勇者小呆** | 達伊大冒險 (DQ: Dai) | speech | 175.4 | CLEAR | 5.2 | +6.9 | — |  |
| **黑人牙膏** | 品牌迷因 | speech | 175.4 | HOLLOW | 3.4 | +8.0 | HeroPaladin | **LOW** |
| **傑洛士** | 秀逗魔導士 (Slayers) | speech | 175.4 | NASAL | 4.6 | +9.8 | HeroTinker |  |
| **Rider** | Fate/stay night | speech | 196.8 | BREATH | 4.4 | -2.0 | Maiev |  |
| **林克** | 薩爾達傳說 (Zelda) | cry | 196.8 | BRIGHT | 1.6 | +12.3 | — |  |
| **魔人普烏** | 七龍珠 (Dragon Ball) | speech | 196.8 | PROCESSED | 4.6 | +9.5 | — | ~ |
| **悟空** | 七龍珠 (Dragon Ball) | speech | 196.8 | RASP | 3.8 | +8.7 | — |  |
| **木乃香** | 魔法老師 (Negima) | speech | 220.9 | BREATH | 4.0 | -1.1 | — | ~ |
| **夏娜** | 灼眼的夏娜 (Shakugan no Shana) | speech | 220.9 | BRIGHT | 5.6 | -0.6 | — |  |
| **櫻綻剎那** | 魔法老師 (Negima) | speech | 220.9 | CLEAR | 4.8 | +0.5 | — | ~ |
| **桔梗** | 犬夜叉 (InuYasha) | speech | 220.9 | HOLLOW | 4.2 | -0.5 | DarkRanger |  |
| **莉娜因巴斯** | 秀逗魔導士 (Slayers) | speech | 248.0 | BRIGHT | 5.4 | +0.9 | — |  |
| **Saber** | Fate/stay night | speech | 248.0 | CLEAR | 4.4 | +1.1 | Jaina |  |
| **草泥馬** | 中國網路迷因 | cry | 248.0 | CREATURE | 4.0 | +0.6 | — | **LOW** |
| **龍宮禮奈** | 寒蟬鳴泣之時 (Higurashi) | speech | 248.0 | RASP | 5.8 | +3.4 | — |  |
| **安云** | あずみ | speech | 278.4 | BREATH | 4.2 | +3.2 | Dryad | ~ |
| **依文潔琳** | 魔法老師 (Negima) | speech | 278.4 | CLEAR | 5.0 | +4.2 | — |  |
| **皮卡娘** | SATO×PICA (同人) | speech | 312.5 | NASAL | 5.6 | +6.9 | — | **LOW** |
| **初音** | Vocaloid | speech | 312.5 | PROCESSED | 5.2 | +4.8 | — |  |
| **皮卡丘** | 寶可夢 (Pokémon) | cry | 350.7 | CREATURE | 3.0 | +8.2 | — |  |
| **哆拉A夢** | Doraemon | speech | 350.7 | NASAL | 5.0 | +8.5 | — |  |

### 8.6 Where I am least confident

**7 low-confidence picks of 48.** These are guesses with reasons, not readings of a known voice —
they should be the first things the owner overrides.

- **死之王** (死之王 / GGD原創(去死團逆襲)) — GGD original -- no canon voice exists. The layered treatment is invented; it is chosen because 'evil collective' justifies non-single-speaker production, which no other champion has.
- **熊貓** (熊貓 / GGD原創(去死團)) — GGD original, no canon voice. DELIBERATELY CONTRADICTS its 呆萌 tone label: the shipped clip is Kyoko at 235 Hz, which is the single worst offender in the roster (0.898 vs 草泥馬). A panda is a large animal; the low read is defensible AND buys the biggest separation win available. Owner should confirm he is willing to lose the cute reading.
- **天地志狼** (天地志狼 / 龍狼傳 (Ryūrōden)) — 龍狼傳 has only a thin OVA adaptation; there is no widely-known canonical voice to point at. The read is inferred from the 三國穿越 setting and the 熱血 label.
- **飛鼠先生** (飛鼠先生 / GGD原創(去死團)) — LOWEST-CONFIDENCE PICK IN THE ROSTER. GGD original referencing a real acquaintance. My register/family assignment is a placeholder chosen only to hold a free grid cell; it should be overwritten the moment a real clip arrives.
- **黑人牙膏** (黑人牙膏(Darlie) / 品牌迷因) — A toothpaste BRAND meme -- there is no character and no canonical voice. The announcer read is invented; it is defensible because the joke is the brand, but the owner may have a specific parody in mind.
- **草泥馬** (草泥馬 / 中國網路迷因) — A pure internet meme with no canonical voice. The bleat is invented but strongly motivated: tremolo/vibrato-rate is an axis nothing else in the roster occupies, and it separates it from 熊貓 (currently 0.898, the worst pair in the pack).
- **皮卡娘** (皮卡丘擬人 / SATO×PICA (同人)) — A doujin character with no canonical voice. The read follows the 傲嬌 label and the humanised-Pikachu premise, but the owner may have a specific dôjin drama-CD in mind.

**9 medium-confidence:** 初號機, 基廉列克, 藤井八雲, 臭作, 鬼畜狂刀KYO, 魔人普烏, 木乃香, 櫻綻剎那, 安云.
Reasons are per-champion in `confidenceNote`; they are mostly "the character is known but speaks little,
so the specific quality is inferred".

Two structural weaknesses that no amount of per-champion care fixes:

1. **The plan is unvalidated by the instrument.** Register, rate and family are *specifications*; campplus
   cosine can only be measured on a rendered clip. §6 already flags that whether a CosyVoice zero-shot
   render lands where its reference sits is untested. Until 48 clips exist, `pairViolations: 0` says the
   plan is internally consistent — **not** that the result will measure under 0.50.
2. **Register is a specification the engine may not honour.** Nothing here guarantees CosyVoice reproduces
   a 20-semitone shift (初號機, 224.5 → 69.6 Hz) from a reference clip. The large moves should be rendered
   and measured **first**, as a feasibility probe, before the other 44 are committed.

Suggested order of work (buckets are non-overlapping):

1. **7 `cry` champions** — cheapest and the highest legibility payoff per unit of work; they need
   recorded/sourced sound effects, not TTS at all, so they are unblocked by every question above.
2. **the 4 largest register moves** (初號機 −20.3, 妙蛙花 −16.2, 熊貓 −15.1, Berserker −13.1 st) as a
   feasibility probe — render, measure, and find out whether the engine honours a specification this large
   *before* committing the rest.
3. **16 champions with an in-repo anchor** — a measurable target already exists on this machine.
4. **25 champions needing an external reference** — the owner's dropbox, and the
   longest pole.

---

*Casting plan generated 2026-07-24 from `_separation-baseline.json` + a fresh campplus pass over all 29
`data/blizzard-overlay/sounds` soundsets. Grid validated at 0 violations across 1 128 pairs.*
---

## 9. The separation gate as QC — n-aware thresholds, an escalation ladder, and an ear in the loop

Machine-readable companion: `content/assets/audio/voices/_separation-qc-gate.json`.
This section **supersedes §7**: same rules, now aware of how many clips exist per champion, with a
defined remedy on failure and a defined hand-off to the owner's ear.

### 9.1 The failure mode this exists to catch

The voice pipeline already checks **fidelity**: does the render sound like the reference clip we cast?
That check is per-champion. It has no term for the rest of the roster — so a batch can come back
48 of 48 green and still ship two timbres, which is exactly what happened.

> Two champions each score well against their OWN reference, yet sit close to EACH OTHER.
> **Individually correct, collectively unusable.**

The two checks are orthogonal and both are required. Fidelity says the render *is* the voice we cast.
Separation says the cast was *worth* casting.

### 9.2 Identity is a centroid, not a clip — and the threshold moves with it

I re-embedded the WC3 control corpus (29 soundsets, 378 clips ≥ 1.2 s) and resampled it split-half:
same-speaker = two **disjoint** n-clip centroids of one actor, different-speaker = n-clip centroids of two
actors, 4 000 draws per cell, actors weighted uniformly. Threshold = the likelihood-ratio crossover.

| clips per champion | confusable | target (new cast) | hard ceiling | pair budget | EER | d′ |
|---|---|---|---|---|---|---|
| 1 | 0.50 | 0.38 | 0.66 | 18 % | **20.8 %** | 1.67 |
| 2 | 0.59 | 0.56 | 0.75 | 18 % | 12.5 % | 2.33 |
| 3 | 0.68 | 0.66 | 0.78 | 10 % | 7.2 % | 2.60 |
| 4 | 0.75 | 0.72 | 0.79 | 5 % | **4.0 %** | 2.80 |
| 5 | 0.79 | 0.78 | 0.81 | 3 % | 2.7 % | 3.18 |
| 6 | 0.82 | 0.81 | 0.82 | 2 % | 1.8 % | 3.29 |
| 8 | 0.85 | 0.84 | 0.84 | 1 % | 0.8 % | 3.39 |

Read the row for `n = min(clips(a), clips(b))`, clamped at 8. Three things fall out of this table:

- **§7's 0.50 and §8's 0.792 were the same curve seen at two points.** n=1 reproduces §7 (0.452 crossover,
  EER 20.8 % vs the published 21.8 %); n=5 lands on 0.790 against §8's 0.792. Neither was wrong; neither
  was general.
- **The trap.** Judging 4-clip centroids against 0.50 would pass *everything* — the control's
  different-actor mean is already 0.541 at n=4. A gate that ignores n silently stops working the moment
  the pack gets more lines.
- **EER 20.8 % → 4.0 % just by averaging four clips.** This is a production requirement, not a nicety:
  **render ≥ 4 distinct lines per champion before the gate is allowed to adjudicate.** Below that it may
  only advise. #142 already wants 3 playback moments, so 4+ lines costs nothing extra.

The n=1 budget stays at §7's published 18 %. The uniform-weighted control actually gives 14.0 % — §7's
figure was clip-weighted, so prolific actors dominated it. 18 % is kept for continuity and already carries
four points of slack.

### 9.3 The pass rule

All pairs of accepted open-roster champions. 48 champions, any 12 can meet, no seeding to exploit.

| | rule | on failure |
|---|---|---|
| **P1** | no pair at or above `hardCeiling(n)` | hard fail |
| **P2** | fraction at or above `confusable(n)` ≤ `pairBudget(n)` | fail |
| **P3** | P2 must also hold *within* each gender sub-roster and each `timbreFamily` | fail |
| **P4** | every pair: `\|ΔF0\| ≥ 2 st` **or** `cos ≤ target(n)` | fail |
| **P5** | a newly cast champion must reach `target(n)`, not merely clear `confusable(n)` | fail on new work |
| **P6** | every surviving grey-zone pair `[target, confusable)` is auditioned by a human | blocking, non-automatable |

P1 exists because a budget alone lets one catastrophic pair through; the ceiling is the 99th percentile of
genuinely-different control actors, so a pair above it is more extreme than 99 % of professionally-cast
different-actor pairs. P3 exists because a roster mean that hides a collapsed sub-population is the exact
failure that shipped — overall 30.9 % looked survivable while female was 97.4 %. P4 exists because campplus
is nearly blind to register (r = +0.09, against +0.26 for onset rate). P5 stops the roster ratcheting up to
the threshold one champion at a time.

**Blame rule.** A pair violation has no inherent owner, and without a rule the gate reports 283 violations
and no action. Highest degree in the confusion graph is at fault; tie-break on lower fidelity-to-own-
reference; tie-break on most recently accepted, so the incumbent keeps its slot. This makes the verdict a
single actionable champion, makes the gate idempotent, and stops approved VO churning.

### 9.4 What to do when it fails — measure `refCos` first

The distance between the two **reference** clips tells you which remedy applies. Cheapest first:

| | trigger | remedy | reading |
|---|---|---|---|
| 1 | `refCos ≤ target`, renders collide | re-render (new seed, longer/cleaner reference) | the engine collapsed two distinct references toward its own mean speaker. The casting is fine. |
| 2 | `refCos` in `[target, confusable)` | different reference **clip**, same character | the clip is unrepresentative — too short, noisy, music underneath. Character truth untouched. |
| 3 | `refCos ≥ confusable` | **re-cast**: move to another §8 grid cell | the two source characters genuinely sound alike. No render fixes this. Needs owner sign-off if it contradicts character. |
| 4 | step 1 failed over ≥ 3 seeds | switch engine (CosyVoice 3 → IndexTTS-2) | this engine cannot hold these two apart. **Risk:** outputs can cluster by *engine* rather than speaker — re-measure the whole roster after any engine split, never just the moved champion. |
| 5 | 1–4 exhausted | register shift within plausibility, distinct reverb/EQ, or demote to `voiceClass: cry` | accept that cosine will barely move; P4 and the human ear are what improve here. This fixes the **percept**, not the metric. |

Never raise `confusable(n)` to make a batch pass. It is derived from the control corpus, not chosen.

**Pre-screen the references at intake, before any TTS runs.** If two references collide, no amount of
re-rendering can separate the champions. One campplus pass at intake saves a full render cycle and a
listening session.

### 9.5 Why 48×48 is cheap

The quadratic term is not the cost. Persist one 192-d float32 vector per accepted clip, keyed by the
SHA-256 of the audio bytes — the same pattern as the existing `.mp3.hash` sidecars, and the shape
`_separation-baseline.json` already has. Then:

- **a new render** costs 1 campplus pass (~50 ms) + one 47×192 matvec — O(N), microseconds
- **a full audit** is one 48×192 @ 192×48 GEMM: 2 304 dot products, ~1.8 MB, sub-millisecond
- an embedding is recomputed only when its content hash changes; dropping a champion is a row delete

Explicit non-goal: **do not build LSH or blocking for N = 48.** That is pseudo-optimisation. The gate needs
the audio and the onnx model, so it lives in the voice-gen lane, not the general test job; what CI can
cheaply assert is that the index still covers every open-roster champion and that no grey-zone pair is
sitting unreviewed.

### 9.6 Current state against this gate

The shipped pack is n=1, so it is judged on the top row.

| clause | result |
|---|---|
| P1 ceiling ≥ 0.66 | **FAIL** — 11.0 % of pairs (124 of 1 128); should be 0 |
| P2 budget | **FAIL** — 30.9 % vs 18 % |
| P3 sub-roster | **FAIL** — female 97.4 %, neutral 100 % |
| P4 register | **FAIL** — 283 pairs are both confusable and inside 2 semitones |
| P5 new cast | n/a — nothing newly cast yet |
| P6 ear check | **PENDING** — sheet built, not yet listened to |

Worst offender by degree: **索隆** and **飛鼠先生**, each confusable with **23 of the other 47**. Only three
champions are already isolated: 林克, Berserker, 蒼月潮 — and all three are `voiceClass: cry`, which is
§8's point made by measurement.

### 9.7 The audition sheet — where the machine stops and the ear starts

`voice-separation-audition.html` (scratchpad, self-contained, audio inlined as data URIs, no build step;
mirrors `bgm-audition.html`). 36 pairs in three deliberately different groups:

- **the 20 closest pairs** — all `cos ≥ 0.50`; the metric has already given up on calling them two people
- **10 grey-zone pairs** (0.42–0.56) — where the metric is *least* reliable and the owner's judgement is
  worth the most
- **6 control pairs** (`cos < 0.10`) — so he has an anchor for what "separated" is supposed to feel like.
  A sheet of nothing but bad pairs gives no reference point, and if these sound alike too, the instrument
  is broken and must be fixed before any casting decision rests on it.

Each pair plays A, B, **A→B back to back**, and A→B→A, with the cosine and ΔF0 printed beside it, so the
number and the reality are visible at the same moment. There is also a blind **ABX** trial: A, B, then a
hidden X, and he guesses. That is the part worth insisting on — **ABX turns his ear into data.** Enough
labelled grey-zone pairs would let the threshold be re-anchored on GGD's own material instead of borrowing
WC3's, which is the honest fix for the EER limit §6 flagged and cannot fix from inside.

### 9.8 What this gate cannot judge

Stated plainly, because a green gate must not be mistaken for a good voice pack:

- **Whether the voice suits the character.** The metric knows two voices differ. It does not know which
  one is right for Saber. Two equally wrong voices score perfectly.
- **Comedic timing.** #57's direction is deliberate 惡搞 jank — pauses, clipping, over-acting, timing.
  A joke that dies half a beat late measures identically to one that lands.
- **Whether a shout reads as a shout.** Force comes from the line and the instruct channel, and the
  −16 LUFS R128 normalisation deliberately destroys loudness dynamics. That axis is not in the instrument.
- **Lexical identity.** 「ピカチュウ！」 is instantly placed because of the *words*. The strongest cue in the
  whole system, and no acoustic distance scores it.
- **Mix and space.** Reverb, EQ and spatialisation are real separation levers living outside the clip.

**Separation is necessary, not sufficient.** The gate's only job is to reduce 1 128 pairs to the dozen
worth listening to. It has no veto over the owner's ear — if it passes and he thinks it sounds wrong,
it is wrong.

---

*§9 measured 2026-07-24 from a fresh campplus pass over `data/blizzard-overlay/sounds` (29 soundsets,
378 clips) plus the stored embeddings in `_separation-baseline.json`. Reproduce from
`content/assets/audio/voices/_separation-qc-gate.json`.*
