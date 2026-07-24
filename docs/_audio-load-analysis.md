# Audio & voice optimization — ANALYSIS (item 6)

**Status: analysis only. No audio file, config doc, or client source was modified by this pass.**
Every re-encode quoted below was written to a scratch directory, measured, and deleted.

Measured 2026-07-23 against the working tree at `campaign/complete-tasks`.
Tooling: `ffprobe`/`ffmpeg` 8.1.2 (libmp3lame, libopus), `stat -f %z`, `gzip`, `md5`.
995 media files probed, 0 probe failures.

**Every number in this document is measured.** Where a figure could not be measured
(iOS codec support), it is labelled as an open question rather than estimated.

---

## 0. Executive summary

| Claim | Verdict |
|---|---|
| Voice/SFX are needlessly stereo | **False.** 964 of 995 files are already mono. Full mono pass saves 181,429 B (0.55%). |
| #158 applied a 128 kbps / 44.1 kHz ceiling everywhere | **Materially false.** It moved 341,581 B (1.04%) and excludes all 50 WAVs by design. |
| Voice is the big win because it is 12 MB | **False and inverted.** Re-encoding voice as 48k mp3 makes it *bigger* by 639,879 B. |
| The WAVs are the problem | **True, and it is the best-value change.** 2,560,838 → 511,251 B (−80.0%). |
| BGM should be compressed harder | **Leave it alone.** It is the product; see §5. |
| The round-end taunt fetches too late | **Confirmed, with a named dead warm function.** See §8. |

The single most valuable finding is not a byte count: **the round-win taunt performs two
serial cold fetches at the instant it is supposed to be audible**, and the function written
to prevent exactly that (`loadVictoryTaunts()`) has zero production callers.

---

## 1. Measured inventory

`content/assets/audio` = **32,866,275 B across 1,886 files**.
Of those, 995 are media (945 mp3 = 29,715,839 B, 50 wav = 2,560,838 B → 32,276,677 B);
the remaining 589,598 B is 874 `.hash` sidecars, manifests, and pipeline scripts.

Bitrates are the ffprobe stream bitrate in bps. Durations in seconds.

| Group | N | Bytes | Rate (Hz) | Ch | Bitrate min–max (mean) | Mean dur | Max dur | When fetched |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| `bgm` | 24 | 16,945,108 | 44100 | **stereo ×24** | 128000 (128000) | 44.06 | 85.33 | On scene entry — `playBgm()`; menu bed on first unlock |
| `voice-taunt/round` | 351 | 5,278,716 | 22050 | mono | 28713–48313 (37052) | 3.16 | 5.15 | **On round win — cold, see §8** |
| `voices/names` | 331 | 3,417,886 | 22050 | mono | 53988–69832 (61943) | 1.26 | 3.08 | Champ-select hover/confirm (manifest warmed early) |
| `sfx/lab` | 32 | 2,026,684 | 44100 | mono | 128000–705600 (507050) | 1.43 | 3.72 | Mostly **never** — 15 of 32 unbound |
| `voices/quotes` | 113 | 1,889,510 | 22050 | mono | 47211–73262 (57495) | 2.31 | 10.04 | Champ-select profile open |
| `sfx/fx` | 28 | 849,344 | 44100 | mono ×27, **stereo ×1** | 705600–1411200 (730800) | 0.33 | 1.20 | Scene warm sets (core / combat / intermission) |
| `voice-taunt/chicken` | 28 | 432,792 | 22050 | mono | 33283–50940 (40008) | 3.03 | 4.67 | On match win |
| `sfx` | 27 | 423,199 | **11025–44100 mixed** | mono ×22, **stereo ×5** | 16000–133015 (51540) | 2.79 | 8.82 | `SFX_CORE` on unlock + per scene |
| `announcer` | 13 | 275,272 | 22050 | mono | 56317–62582 (60038) | 2.75 | 4.88 | Combat events (AudioDirector tally) |
| `sfx/retired` | 2 | 215,359 | 44100 | mono ×1, **stereo ×1** | 128000–705600 (416800) | 3.02 | 4.40 | **Never** |
| `voice-jp` | 6 | 151,145 | 44100 | mono | 128000 (128000) | 1.51 | 3.37 | **Never** — superseded by the Kyoko pack (#40) |
| `announcer/retired-jank-novelty` | 13 | 132,686 | 22050 | mono | 34979–61266 (48538) | 1.61 | 3.36 | **Never** — provenance |
| `announcer/retired-ja-kyoko` | 13 | 108,011 | 22050 | mono | 51858–64057 (58510) | 1.06 | 2.70 | **Never** — provenance |
| `announcer/retired-zh` | 12 | 105,801 | 22050 | mono | 56734–75116 (67939) | 0.98 | 2.10 | **Never** — provenance |
| `voice-jp/candidates` | 2 | 25,164 | 44100 | mono | 128000 (128000) | 0.72 | 0.74 | **Never** — audition leftovers |
| **Total media** | **995** | **32,276,677** | | **31 stereo / 964 mono** | | | | |

Two shapes fall out immediately:

* **`bgm` is 51.6% of the entire audio tree** (16,945,108 / 32,866,275) in 24 files.
* **The 50 WAVs are 7.8% of the tree in 2.7% of the files** (50/1,886; 5.0% of the 995
  media files) — they are 706–1,411 kbps PCM
  and, critically, they dominate the *warm* sets (§8), not just the disk.

### Boot cost of audio metadata

Production loads content as **one `GET /content/bundle.json`**, not the 1,454 per-doc
requests (`bootContent.ts:87-90`; the per-doc path is the fallback only). The three audio
config docs ride inside that bundle. Measured by rebuilding the bundle with each dropped:

| Doc | Raw delta | gzip-5 delta |
|---|--:|--:|
| `config/victory-taunts.json` | 71,132 | 15,400 |
| `config/audio-map.json` | 8,486 | 1,470 |
| `config/champion-voices.json` | 7,881 | 1,051 |
| **All three** | **87,497** | **18,358** |

Full bundle: 1,288,567 B raw / 241,654 B gzip-5. Audio metadata is **7.6% of the gzipped
bundle, and `victory-taunts.json` alone is 6.4%** — a doc not needed until a round is won.

**No audio media is fetched at boot.** `warmSfxEvents()` returns early while `this.ctx` is
null (`AudioSystem.ts:343`), and the eager `prefetchSfx()` has no production caller. On the
auth screen: 0 B of SFX, BGM, and voice. #63's premise holds.

---

## 2. Is the #158 "128 kbps / 44.1 kHz ceiling" actually applied? — No.

`tools/audio-optimize/optimize.sh` exists and was run, but it is close to a no-op.

**Measured from its own backup directory** (`.backups/20260723-035320`, 22 files):

```
backup 1,075,744 B → current 734,163 B = 341,581 B saved
= 31.75% of the files it touched, but 1.04% of the 32,866,275 B corpus
```

22 of 995 files were ever touched; 973 were skipped as already compliant.

**Outliers that remain, named:**

1. **All 50 `.wav` files — 2,560,838 B, 7.8% of the corpus — are excluded by design.**
   The script's own header says so under `WHAT IT DOES NOT TOUCH`: a WAV "cannot be
   expressed at 128 kbps", and renaming them would mean editing `audio-map.json`, which it
   calls "out of this tool's remit". They sit at 706–1,411 kbps. This is the ceiling's
   single largest exemption and it is invisible in any "ceiling applied ✓" summary.

2. **`sfx/ui-type.mp3` — 1,348 B at 133,015 bps — still exceeds `THRESH_BR=130000` today.**
   It is the only mp3 in the tree over the threshold (0 files exceed 44,100 Hz). Each run
   re-encodes it, the NEVER-GROW guard discards the result, and it is reported over-cap
   again next run. Harmless, but the run is **not idempotent** despite claiming to be.

3. **`sfx/` is not a uniform 44.1 kHz group at all** — it mixes 11025 / 16000 / 22050 /
   32000 / 44100 Hz and 16,000–133,015 bps. The ceiling never had to normalise it because a
   ceiling only clips the top.

**Verdict:** the ceiling is real but nearly everything was already under it. The headline
"audio 128k/44k ceiling applied" is true as stated and misleading as understood — it
delivered 1.04% while the format question it explicitly declined to answer is worth 6.2%.

---

## 3. Mono vs stereo — the premise is wrong, and that is the useful answer

**964 of 995 files (96.9%) are already mono.** All 874 announcer/voices/voice-taunt clips
are 22.05 kHz mono. There is no stereo voice problem to fix.

Only **31 files are stereo**, and **24 of them are BGM**, where stereo is correct. That
leaves **7 non-BGM stereo files, 360,245 B total**.

I tested whether those 7 are *genuinely* stereo by measuring the RMS of the L−R difference
signal against the RMS of the mono mix (`ffmpeg -af "pan=mono|c0=c0-c1,astats"`):

| File | Bytes | L−R RMS (dB) | Mix RMS (dB) | Separation | Reading |
|---|--:|--:|--:|--:|---|
| `sfx/fx/ui-hover-cyber.mp3` | 79,458 | **−inf** | −16.99 | ∞ | **Bit-exact dual-mono** |
| `sfx/up.mp3` | 7,313 | **−inf** | −14.74 | ∞ | **Bit-exact dual-mono** |
| `sfx/yooooooooooooo.mp3` | 35,943 | −76.56 | −15.59 | 61.0 dB | Inaudibly stereo |
| `sfx/heycharlie.mp3` | 36,361 | −44.02 | −15.71 | 28.3 dB | Near-mono |
| `sfx/ringnai.mp3` | 103,698 | −28.07 | −20.20 | 7.9 dB | Mildly stereo |
| `sfx/dragon-roar-angry.mp3` | 25,957 | −6.64 | −12.99 | **−6.3 dB** | **Genuinely wide** |
| `sfx/retired/dragon-roar-angry-4.4s.mp3` | 71,515 | −5.90 | −12.41 | **−6.5 dB** | **Genuinely wide** |

The two dragon roars have a difference channel *louder* than their mono mix — strongly
decorrelated, real stereo width. They are the login ambience, where that width is the point.
**Do not mono the LIVE one (`sfx/dragon-roar-angry.mp3`) — it is the login ambience.** The
retired 4.4 s copy in the table above is prune-list material (§5), not something to preserve.

**What a full mono pass would save: 181,429 B (0.55% of the corpus).** Measured by
re-encoding each at half its current bitrate (mono `pcm_s16le` for the WAV):

| File | Orig | Mono | Saved |
|---|--:|--:|--:|
| `sfx/ringnai.mp3` | 103,698 | 50,267 | 53,431 |
| `sfx/fx/ui-hover-cyber.mp3` | 79,458 | 39,768 | 39,690 |
| `sfx/retired/dragon-roar-angry-4.4s.mp3` | 71,515 | 35,779 | 35,736 |
| `sfx/heycharlie.mp3` | 36,361 | 18,121 | 18,240 |
| `sfx/yooooooooooooo.mp3` | 35,943 | 18,284 | 17,659 |
| `sfx/dragon-roar-angry.mp3` | 25,957 | 13,000 | 12,957 |
| `sfx/up.mp3` | 7,313 | 3,597 | 3,716 |
| **Total** | **360,245** | **178,816** | **181,429** |

**Recommendation: do not run a mono pass as its own task.** It is 0.55% and two of the seven
files would be a quality regression. The one case that matters, `ui-hover-cyber.mp3`, is
better solved by format (§5) than by channel count — and note that because it is bit-exact
dual-mono, **lame produces the identical 8,403 B whether you ask for stereo or mono**, so
the mono step buys literally nothing once it is an mp3.

---

## 4. Codec — measured Opus sample (10 clips, re-encoded and deleted)

Encoded with `libopus` into both Ogg and WebM, plus an mp3 at 2× the Opus bitrate as a
rough perceptual-parity reference.

| File | Opus kbps | Ch | Dur | Orig | **Opus .ogg** | Opus .webm | mp3 ref |
|---|--:|--:|--:|--:|--:|--:|--:|
| `bgm/combat.mp3` | 96 | 2 | 85.33 | 1,366,352 | 1,003,353 | 1,027,047 | 2,049,506 |
| `bgm/battleStart.mp3` | 96 | 2 | 9.27 | 149,255 | 111,298 | 114,165 | 223,861 |
| `announcer/death-1.mp3` | 32 | 1 | 2.97 | 23,111 | 12,361 | 13,430 | 24,494 |
| `voices/names/godie-e001.mp3` | 32 | 1 | 2.10 | 16,964 | 8,955 | 9,810 | 17,598 |
| `voices/quotes/godie-e001.mp3` | 32 | 1 | 0.43 | 4,213 | 2,053 | 2,541 | 4,223 |
| `voice-taunt/round/_fallback-1.mp3` | 24 | 1 | 4.00 | 18,669 | 9,825 | 11,101 | 24,677 |
| `voice-taunt/chicken/chx-defrost.mp3` | 24 | 1 | 3.02 | 13,879 | 7,556 | 8,614 | 18,721 |
| `sfx/fx/ui-hover-cyber.mp3` | 48 | 2 | 0.45 | 79,458 | 2,365 | 2,864 | 6,314 |
| `sfx/fx/block-hit.mp3` | 48 | 1 | 0.10 | 8,898 | 759 | 1,168 | 1,925 |
| `sfx/lab/attack-katana.mp3` | 48 | 1 | 0.80 | 70,304 | 4,949 | 5,542 | 10,389 |
| **Total** | | | | **1,751,103** | **1,163,474** | **1,196,282** | |

**Opus in Ogg is −33.6%; Opus in WebM is −31.7%.**

**Container matters more than expected for short clips.** WebM costs 32,808 B more than Ogg
across the ten (+2.8% overall) but the overhead is per-file, so it is brutal on one-shots:

* `block-hit` 759 → 1,168 B = **+53.9%**
* `voices/quotes` 2,053 → 2,541 B = **+23.8%**
* `ui-hover-cyber` 2,365 → 2,864 B = **+21.1%**
* `bgm/combat` 1,003,353 → 1,027,047 B = **+2.4%**

**If Opus is ever adopted, use `.ogg`, not `.webm`.** The clips here average 1.9 s; WebM's
container tax lands squarely on the population that dominates the file count.

Full-corpus Opus, measured over all 874 voice clips (§5) and all 24 beds (§5):

| Set | Current | Opus | Delta |
|---|--:|--:|--:|
| Voice (874 clips) | 11,640,674 | 7,454,335 @32k | **−36.0%** |
| Voice (874 clips) | 11,640,674 | 5,519,296 @24k | **−52.6%** |
| BGM (24 beds) | 16,945,108 | 12,911,151 @96k | −23.8% |
| BGM (24 beds) | 16,945,108 | 8,670,886 @64k | −48.8% |

### The Safari/iOS caveat — and why it is a blocker, not a footnote

**The owner plays on iPhone, so this is decisive.** Two things make it more dangerous here
than the usual "check caniuse" note:

1. **This app has two independent playback paths with two different codec surfaces.**
   * SFX and BGM go through **Web Audio `decodeAudioData`** (`AudioSystem.ts:950`,
     `createBufferSource` at :500/:573/:713/:764).
   * Voice, name call-outs, and the victory taunt go through **`HTMLAudioElement`**
     (`nameVoice.ts:301-304`, `victoryTaunt.ts:225-228`, `el.src` at :403).

   Safari has historically supported these two paths *differently* for the same file.
   An Opus migration must be verified on **both**, on a real iPhone, before any content moves.

2. **Failure mode is silence, not an error.** `victoryTaunt.play()` swallows a rejected
   `play()` promise into a `console.warn` (:405-409), and `fetchJson` returns null on
   failure "→ silence, no subtitle" (:434). A codec the device cannot decode would ship as
   *audio that silently stops working on the owner's own phone* — with no test failure.

Apple's Opus support has expanded across recent Safari/iOS releases, but I could not verify
the behaviour of the specific container/path combinations this app uses on the owner's
actual device from here, and I will not assert it from memory.

**Decision rule: treat Opus as blocked until someone loads a two-clip `.ogg` probe page on
the owner's iPhone and confirms BOTH `decodeAudioData` and `new Audio().play()` succeed.**
That is a 20-minute test. Until it passes, everything in §5 stays mp3-only — which is fine,
because the mp3-only plan already captures the largest win.

---

## 5. Per-group recommendations

Ordered by measured bytes per unit of risk.

### WAV → mp3 128k: −2,049,587 B on disk (−80.0%) — but SPLIT IT IN TWO

Measured across all 50 files: **2,560,838 → 511,251 B.** That headline is real, but the
fifty files are **not one uniformly safe population**, and treating them as one is the
mistake this section originally made. Broken down by directory:

| dir | files | WAV | → mp3 128k | saving | verdict |
|---|--:|--:|--:|--:|---|
| `sfx/lab` | 21 | 1,567,650 | 306,861 | **−1,260,789** | ✅ **DO** — 効果音ラボ, conversion licensed, longer clips, no transient objection |
| `sfx/fx` | 28 | 849,344 | 177,179 | −672,165 | ⚠️ **CONSIDER** — this directory has a written anti-MP3 rule, see below |
| `sfx/retired` | 1 | 143,844 | 27,211 | −116,633 | ✅ DO (or just prune it — same file, see the prune list) |

**`sfx/fx` carries a documented, reasoned decision AGAINST mp3, and it is 32.8% of the
headline saving.** `content/assets/audio/sfx/fx/MANIFEST.json:2`, verbatim:

> "WAV rather than MP3 on purpose: MP3 encoder delay/padding is applied inconsistently by
> browser `decodeAudioData` and would smear a 40 ms transient; these clips are tiny so raw
> PCM is free."

That is the same decode path this document identifies in §4 (`AudioSystem.ts:950`
`decodeAudioData`), and these are the #133 hit-feel clips — `basicAttack` / `hit` / `crit` /
`block` / `footstep`. The "shortest clips are 100 ms" hedge below is **wrong by 2.5×**:
measured, `tick.mp3` is 0.040 s, `footstep.mp3` 0.070 s, `windup.mp3` 0.090 s — i.e. exactly
the 40 ms transient the rule names.

So: ship `sfx/lab` on the numbers. For `sfx/fx`, the mitigation is not "an A/B listen" — it
is **encoder-delay-safe framing** (an encoder that writes LAME/Xing gapless metadata AND a
decode path that honours it) or keeping PCM. `sfx/retired/ui-hover-cyber.mp3` (0.45 s, not a
transient) is a defensible carve-out from the rule rather than a reason to pretend the rule
is not there.

The licence position is clean either way:
`content/assets/CREDITS.md:953-955` records the verified 効果音ラボ grant —
「WAVやOGGなどどのような形式に変換していただいても構いません」 — format conversion is
explicitly permitted, not merely tolerated. `sfx/fx/*.wav` is synthesised in-repo (own work).

**Start with one file.** `sfx/fx/ui-hover-cyber.mp3` is 92.2% of the four clips warmed at
the first click:

| Variant | Bytes | vs orig |
|---|--:|--:|
| Original (stereo PCM) | 79,458 | — |
| Mono WAV | 39,768 | −50.0% |
| **mp3 128k** (mono or stereo — identical, it is dual-mono) | **8,403** | **−89.4%** |
| mp3 96k mono | 6,314 | −92.1% |
| Opus 48k mono `.ogg` | 2,572 | −96.8% |

Converting that one file takes `SFX_CORE` from **86,186 → 15,131 B (−82.4%)**.

Why not just let nginx gzip them: **gzip -9 over the 50 WAVs gives 1,877,542 B (−26.7%)**
versus 511,251 B for mp3. Transcoding is worth **1,366,291 B more on the wire** than the
compression already configured — and it works on the LAN dev server, which does no
compression at all.

*Effort: moderate, not trivial.* Renaming 50 paths touches **at least nine files**, not the
three originally listed here. Grepped for the `.wav` basenames:

| file | what it holds |
|---|---|
| `content/config/audio-map.json` | the event → clip bindings |
| `content/config/_index.json` | hash index over the above |
| `content/bundle.json` | the baked one-request transport |
| `content/assets/audio/sfx/lab/MANIFEST.json` | 33 basenames |
| `content/assets/audio/sfx/fx/MANIFEST.json` | 28 basenames |
| `content/assets/CREDITS.md` | 30 basenames — the licence **usage ledger** (e.g. `whiff-sword.mp3 … 0.48 s / 41 KB`) |
| `content/assets/audio/README.md` | 20 basenames |
| `content/assets/audio/sfx/lab/ACQUIRE.py` | 2 basenames |
| `content/assets/audio/sfx/lab/VERIFY.py` | the `.wav` glob |

The first three must go through `content:build`, never a hand edit.

> ⚠️ **`VERIFY.py` must be updated in the SAME commit — it degrades SILENTLY, it does not
> fail.** `VERIFY.py:5-7` globs `sfx/lab/*.wav` + `sfx/lab/*.mp3` + `voice-jp/*.mp3`. After
> conversion the `.wav` glob matches nothing, so the `pcm_s16le` assertion at `VERIFY.py:36-37`
> never fires and the gate simply **stops checking those 21 files** instead of erroring. A
> size win that quietly disables the repo's own audio QA gate is not a win.

*Risk to check first:* see the `sfx/fx` transient rule above — that is the real gate, and it
is a codec-behaviour question, not a taste question.

### ✅ DO — stop shipping the `.hash` sidecars and `content/audio-manifests/`: −225,294 B

See §6.

### ⚠️ CONSIDER — prune only the clearly-dead groups: −234,841 B

`sfx/retired` (215,359) + `sfx/fx/whiff.mp3` (19,482, the whiff event binds
`lab/whiff-sword.mp3` instead). Explicit list only — see the LEAVE ALONE list for why a
"prune unreferenced audio" sweep is wrong.

> Of that, **−131,474 B is already counted in the WAV→mp3 row** (both entries are WAVs).
> Net new against that row: **−103,367 B** if the WAV conversion also lands.

> **`voice-jp` was on this list and has been REMOVED from it.** It is never fetched, but
> "never fetched" is not the test this document uses — nine lines down, the LEAVE ALONE list
> says an automated "delete unreferenced audio" pass would be a regression precisely because
> licensed packs with a paper trail are not orphans. `voice-jp` is one of those:
> `LICENSE:41` names `audio/voice-jp/` as a licensed tree; `content/assets/CREDITS.md:1022`
> carries its usage ledger; `voice-jp/MANIFEST.json:3` records why the pack exists; and
> `sfx/lab/VERIFY.py:7` + `ACQUIRE.py:121` enumerate and rebuild it. Deleting it orphans a
> licence ledger entry and breaks the acquire/verify pair, for 0.54% of the tree. It belongs
> in **LEAVE ALONE**, with the same "exclude from the deploy tree, keep in the repo"
> treatment this document already prescribes for the retired packs.

### ⛔ DO NOT — re-encode the voice corpus as mp3. It makes the game **bigger**.

Measured over all 874 announcer + voices + voice-taunt clips:

```
current       11,640,674 B   (22.05 kHz mono, 29–83 kbps, mean ~50 kbps)
mp3 @ 48k     12,280,553 B   → +639,879 B  ← GROWS
opus @ 32k     7,454,335 B   → −36.0%
opus @ 24k     5,519,296 B   → −52.6%
```

The clips are *already* below the bitrate anyone would "optimise" them to. Only Opus wins,
and Opus is blocked on §4's iPhone test.

**And even if Opus passes, the bandwidth ROI here is near zero.** None of this is ever
bulk-fetched: a match plays a confirm call-out of 2–3 segments per locked seat and one taunt
per round win. **The 11.6 MB of voice is a disk/image cost, not a download cost.** Revisit
only if image size becomes the binding constraint.

### ⛔ LEAVE ALONE — BGM. It is the product.

BGM is the largest group (51.6%) and therefore the most tempting. It is also the one the
owner will hear, and they have pushed back on audio quality and volume more than once.

For the record, here is what is on the table and why I am still saying no:

| Option | Result | Delta |
|---|--:|--:|
| Current | 16,945,108 | — |
| mp3 @ 112k | 14,827,113 | −12.5% |
| mp3 @ 96k | 12,709,112 | −25.0% |
| Opus @ 96k | 12,911,151 | −23.8% |
| Opus @ 64k | 8,670,886 | −48.8% |

128 → 96 kbps stereo on melodic, sustained material is **the one change in this entire
document a listener could plausibly notice**, and BGM is 44 s average / 85 s max of exposed,
foregrounded music. Trading 4.2 MB of disk for a risk to the thing the player listens to for
three minutes a round is a bad trade in a project where the music was custom-generated
across #52/#87/#88/#124/#135.

If it is ever revisited, two hard constraints:

1. **Re-render, do not transcode.** `tools/bgm-gen/src/ggd/audio.py:110` hard-codes
   `-c:a libmp3lame -b:a 128k` and the pipeline is deterministic from a seed. Change that
   line and re-run the score → audio step. Transcoding the existing 128k mp3s stacks a
   second generation of lossy loss for the same byte count and should be refused even though
   it is one ffmpeg flag.
2. **User sign-off on the audition page first.** Not a byte diff — an ear check.

There is no duplicate-content shortcut hiding here either: `md5` over the 24 beds returns 24
distinct hashes (the repeated file sizes are just CBR × equal duration).

### ⛔ LEAVE ALONE — the "retired" packs, `bgm/menu.samantha.mp3`, and `voice-jp`

`announcer/retired-*` (346,498 B across 3 packs) is deliberately-kept provenance with
`NOTE.md` files. `bgm/menu.samantha.mp3` (1,024,879 B) is unreachable **by design** — #134
locked the login bed (`bgmVariants.ts:54 ROTATION_LOCKED_SCENES`) and it survives only for
the audition page's 12+12 grid. `sfx/lab`'s 15 unbound clips (1,071,630 B) are a deliberate
bank awaiting VFX/SFX binding (#79/#123).

**`voice-jp` (176,309 B) belongs here too, not on the prune list.** It is never fetched, but
it is a *licensed pack with a paper trail*, which is the category this list protects:
`LICENSE:41` names `audio/voice-jp/` as a licensed tree, `content/assets/CREDITS.md:1022`
carries its usage ledger, `voice-jp/MANIFEST.json:3` records why it exists as a sibling of
`voices/`, and `sfx/lab/VERIFY.py:7` + `ACQUIRE.py:121` enumerate and rebuild it. Deleting it
orphans a licence ledger entry and breaks the acquire/verify pair, for 0.54% of the tree.

**An automated "delete unreferenced audio" pass would remove all four and read as a
regression.** Prune by explicit list only. The right move for these is *exclusion from the
deploy tree while staying in the repo* — a packaging change, not a delete.

### ⚠️ DEFER — the 68 duplicate voice clips (−718,976 B)

Verified: 67 md5 groups, 68 redundant files — 49 in `voices/names` (485,568 B) and 19 in
`voices/quotes` (233,408 B). e.g. `godie-e001.mp3` == `godie-e00n.mp3`.

This is the audio-layer symptom of **task #113** (14 byte-identical champion doc pairs): the
TTS pipeline rendered the same text twice under two champion ids. **Deduping the audio first
would bake the wrong answer into the asset layer.** Resolve the identity question in #113;
the audio dedupe then falls out for free.

Also found: **1 dangling reference** — `voices/names/MANIFEST.json` points at
`godie-e00j.name.mp3`, which does not exist on disk (degrades to silence).

---

## 6. Can the `.hash` sidecars stop shipping? — Yes, unambiguously.

**874 `.hash` files, 56,810 B.** Each holds one sha256 line of the TTS render job
(voice + rate + text) so `tools/tts-gen/src/generate.mjs` (:705-708, :801) can skip an
unchanged re-render. It is pure build bookkeeping.

* **No client code reads them.** The only `.hash` readers/writers in the repo are
  `tools/tts-gen` and `tools/icon-gen`. (`grep` hits for `.hash` inside `apps/client/src`
  are all property accesses on `_index.json` entries, not the sidecar files.)
* **But they are served.** They live under `content/assets/`, and `nginx.conf` serves
  `location /content/` with no extension filter — so they are 874 fetchable URLs and
  56,810 B of image weight for zero client value.

Same class: **`content/audio-manifests/` — 7 files, 168,484 B** — referenced only by
`packages/shared` tests and the audition page, never by the game client.

**Combined: 225,294 B shipped, 0 B ever requested by the client.**

**Recommendation: move them out of `content/`, do not filter them in nginx.** An
`nginx location ~ \.hash$ { return 404; }` would fix production only — the vite dev server
the owner actually plays through (`apps/client/vite.config.ts:45-59`) has no such filter and
would keep serving them on the LAN. Relocating to a build-only directory fixes both paths
and is the smaller long-term maintenance burden.

---

## 7. What changed underneath this analysis (nginx)

The task brief stated `grep -c brotli nginx.conf = 0` and that no `.glb`/audio is gzipped.
**That is no longer true** — another agent has reworked `nginx/nginx.conf` during this
session. Current measured state:

* `audio/wav` is now both a declared MIME type (`:59`) and in `gzip_types` (`:123`).
* `gzip_static on` (`:133`) and a brotli module include (`:139`) are present.
* `audio/mpeg`, `image/png`, `image/webp` are **deliberately excluded** with measured
  justification in-file (mp3 gzips −1.005%).

This does not change the recommendation, but it changes the *argument*: WAV gzip now
recovers 683,296 B in production on its own. **WAV → mp3 is still worth 1,366,291 B beyond
that on the wire, 2,049,587 B on disk, and — unlike anything nginx does — it also helps the
LAN dev server, which sets only `Content-Type` and `Content-Length`.**

I did not edit `nginx/nginx.conf`; it is outside this task's ownership.

---

## 8. Loading strategy — this matters more than format

### The taunt is fetched too late. Confirmed.

`victoryTaunt.ts` warms nothing. On the first round win, `playRound()` does:

```
playRound()
  └─ await this.load()          → GET /content/config/victory-taunts.json   (108,780 B)   ← cold
       └─ selectRoundTaunt(...)
            └─ el.src = url(file)  → GET the taunt mp3 (mean 15,039 B)                    ← cold
```

**Two serial cold round trips, started at the moment the clip should already be sounding.**
The config fetch must complete before the clip URL is even known, so they cannot overlap.

The fix already exists and is unwired:

```ts
// victoryTaunt.ts:452
/** Warm the taunt script (cached; safe to call from any boot path). */
export function loadVictoryTaunts(): Promise<VictoryTauntsConfig | null> {
```

**`loadVictoryTaunts()` has zero callers outside its own definition and tests.** Someone
wrote the warm function, documented it as safe to call from any boot path, and never called it.

This is not a general pattern failure — it is a single gap. The equivalent warms *are*
wired everywhere else:

* `loadChampionNames()` ← `ui/actions.ts:52`
* `loadChampionQuotes()` ← `ui/panels/champselect/ProfileBlock.tsx:211`
* `prefetchCoreSfx()` + `preloadSceneSfx()` ← `AudioSystem.ts:403-404`, `:469`

**Recommendation (cheap, no bytes moved):** call `loadVictoryTaunts()` on the
shell → match edge, and warm the *specific* round-taunt clip for the local player's champion
on entry to combat. The champion is known at lock-in; the taunt pool for that champion is a
handful of clips. This converts a 2-RTT stall at the emotional peak of the round into a
prefetch during 3 minutes of combat.

Note also the double-fetch: `victory-taunts.json` already rides inside `bundle.json`
(71,132 B raw of it), and `victoryTaunt.ts` fetches the standalone
`config/victory-taunts.json` (108,780 B) again over the network, bypassing the registry
entirely. **Reading it from the already-loaded content store would remove the first RTT
outright** and make the warm call unnecessary.

### What should be lazy / warmed — and where the WAVs hurt

Measured warm sets, resolved from `audio-map.json` × `sfxManifest.ts`, with the WAV→mp3
figures applied:

| Scene | Files | Now | After WAV→mp3 | Saved | |
|---|--:|--:|--:|--:|--:|
| `SFX_CORE` (first click) | 4 | 86,186 | 15,131 | 71,055 | **−82.4%** |
| `champSelect` | 4 | 238,250 | 77,766 | 160,484 | −67.4% |
| `combat` / `fireRing` | 40 | 859,578 | 504,256 | 355,322 | −41.3% |
| `intermission` | 8 | 531,462 | 104,839 | 426,623 | **−80.3%** |
| `menu` | 3 | 81,641 | 81,641 | 0 | 0% |
| **Union** | **57** | **1,598,511** | **745,511** | **853,000** | **−53.4%** |

Two observations:

* **`intermission` warms 8 files and all 8 are WAV.** It is the purest case: 531,462 B of
  PCM to play shop blips.
* **66.9% of every byte the game warms is WAV** (1,069,886 / 1,598,511), from 2.7% of the
  files. The WAV question is
  not really a disk question — it is *the* loading question.

The current lazy/warm split is otherwise sound and should be kept:

* **Correctly lazy:** all voice (on-demand via `HTMLAudioElement`), all BGM (bed starts
  inside `unlock()`/`startScene()`), non-current-scene SFX.
* **Correctly warmed:** `SFX_CORE` on unlock, per-scene sets on scene entry, both VO
  manifests at champ-select.
* **The one gap:** the round-end taunt, above.

### Caching (flagged, not owned here)

Nothing in `apps/client/src` ever appends the `?h=` content hash — `AUDIO_CONTENT_BASE` is
the bare `"/content/"` (`AudioSystem.ts:56`), and `grep '?h='` across the client returns
nothing. `nginx.conf:143-146` maps empty `$arg_h` → `no-cache`, so **the entire `/content/`
mount revalidates on every load in production**. On the LAN dev server it is worse: the vite
static handler sets only `Content-Type` and `Content-Length` — no `ETag`, no `Last-Modified`,
no `Cache-Control` — so the browser has no validator at all and re-downloads rather than 304s.

**Consequence for this item:** every saving above is paid back on *every reload* of a
playtest session, not just the first — the LAN benefit is larger than the production benefit.

This is a real defect that costs more per session than several items above, but it spans
models as well as audio and belongs to whoever owns the content-URL layer. **Flagged, not
fixed here.**

---

## 9. Consolidated: what the mp3-only plan is worth

Only the changes that need no codec bet and no user ear-check:

> **These rows OVERLAP — do not just add them up.** The prune list contains two
> of the same fifty WAVs, so their conversion saving is counted in the WAV row
> already: `sfx/retired/ui-hover-cyber-bubbly-rising-chirp.mp3` (143,844 → 27,211,
> saving 116,633) and `sfx/fx/whiff.mp3` (19,482 → 4,641, saving 14,841).
> Overlap = **131,474 B**. The union is what the table reports.

| Change | Disk | Warm-set |
|---|--:|--:|
| 50 WAV → mp3 128k | −2,049,587 | −853,000 |
| `.hash` + `audio-manifests` out of the served tree | −225,294 | — |
| Prune `sfx/retired` + `whiff.mp3` (voice-jp removed — see §5) | −279,676 net new<br>(−411,150 gross, −131,474 already counted above) | — |
| **Total (union)** | **−2,554,557** | **−853,000** |

**−7.8% of the audio tree and −53.4% of everything the game warms, without touching BGM,
without an Opus bet, and without a single change a listener can hear.**

> Note the WAV row is itself **split by risk** in §5: `sfx/lab` (21 files,
> −1,260,789) is an unconditional DO; `sfx/fx` (28 files, −672,165 — 32.8% of
> this row) is a CONSIDER, because that directory has a written anti-MP3 rule.
> Do not quote the −2,049,587 as if it were all uncontested.

Deferred behind gates: voice Opus (−4.2 MB, needs the iPhone test), BGM re-render
(−4.2 MB, needs user sign-off), duplicate voice clips (−718,976 B, needs #113).

---

## 10. Verification performed

* `ffprobe` over 995 media files, 0 failures → per-group census.
* Full re-encode sweeps, byte-summed then **deleted**: 50 WAV → mp3 128k; 24 BGM → mp3
  96k/112k + Opus 96k/64k; 874 voice clips → mp3 48k + Opus 32k/24k; 10-clip Opus
  Ogg/WebM/mp3 sample; 7 stereo files → mono.
* L−R difference RMS on all 7 non-BGM stereo files.
* `md5` over all 945 mp3 → duplicate groups; `MANIFEST.json` refs differenced against disk.
* Bundle rebuilt with each audio config doc removed → true marginal boot cost.
* Warm sets resolved from `audio-map.json` × `sfxManifest.ts` to on-disk bytes.
* #158 savings recomputed from its own backup directory.
* Repo test + typecheck run — see the task report.

**Nothing under `content/assets/audio/`, `content/config/`, `apps/client/src/`,
`tools/`, or `nginx/` was modified.**
