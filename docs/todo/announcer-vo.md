# Announcer system-broadcast VO pack (trilingual 惡搞) — TODO

The **seven system/announcer broadcast events** — `matchStart`, `roundStart`,
`levelUp`, `death`, `multiKill`, `allySlain`, `exUnlock` — are spoken by a
machine announcer, not by champions. 13 clips staged under
`content/assets/audio/announcer/`, bound in `content/config/audio-map.json`.

**SYSTEM vs CHARACTER is the rule this pack exists to hold.** A broadcast
*about* whoever died/levelled is SYSTEM and speaks in the announcer voice; a
named champion speaking is CHARACTER, stays Chinese, and lives in
`kill`/`taunt`/`abilityCast`/`champSelectConfirm` or a `select` pool in
`champion-voices.json`. Task #34 first bound these events to the imported w3x
Chinese map quips; those quips were displaced, not deleted, and must stay
reachable in the map-flavour pools. Do not "fix" this back.

History: **#34** authored it as zh-TW, **#40** retargeted it to a uniform ja-JP
Kyoko pack, **#57** recast it as the current trilingual parody. Nothing in that
chain was deleted — see *Retired packs* below.

## The pack (content)

`content/audio-manifests/announcer.json` is the live tts-gen input; the
canonical pairing table is `announcer.cast.json` (`audio.announcer-cast@2`),
which carries per-line `zhText` (the Chinese display/caption text and canonical
meaning) beside `spoken` (what the voice actually says). **On most lines those
two are deliberately NOT translations of each other — that gap IS the joke**,
and there is no generator deriving one from the other, so `avo-08` is the only
thing preventing them drifting apart. Render with:

```sh
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.json
```

The direction is 惡搞, **and the joke is the LINE, not the VOICE** — the user's
correction, verbatim: 「惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話
清楚但不帶感情所以嘲諷」. Every line is a real, standard, full-band system voice
reading correct text in a language it actually speaks; the comedy is transit-PA,
customer-service 丁寧語 and bureaucratic sign-offs applied deadpan to a
deathmatch. **The flat delivery is the performance, not a defect.**

| voice | lang | role |
| --- | --- | --- |
| **Kyoko** | ja-JP | brightest, cleanest-articulating of 59 auditioned; carries the 去死団アリーナ framing line |
| **Tingting** | zh-TW copy | a zh_CN voice, but reads Traditional correctly (繁/簡 render byte-identically); the only usable Chinese voice — `Meijia` is a phantom |
| **Sinji** | zh-HK | Apple's standard Cantonese voice; one line, so the 打完收工 register joke survives with correct pronunciation |
| **Karen** | en-AU | flattest pitch contour of any intelligible voice measured (1.98 st SD); reads as international-terminal PA |

Pacing is **185 wpm across every line**, uniform on purpose: evenness IS the
announcer signal — a PA system does not change tempo because the news got
exciting. Loudness is EBU R128 gated integrated, **-16 LUFS / -1.5 dBTP**, the
same target as the champion-name pack ([name-voice.md](name-voice.md)) so a
call-out and the broadcast that follows it sit at one level. Gating matters:
ungated `volumedetect` averages the pauses into the level, which is what left
earlier packs under-gained.

Two lines (`match-start`, `ally-slain`) are **segmented** — cast per fragment via
tts-gen's `segments`, concatenated sample-exactly, so a line can hand off
between voices the way a station PA does.

## Retired packs (never re-point at these)

Three superseded manifests are still present and still runnable, each retargeted
to its own archive directory so a rerun cannot overwrite the live pack:

| manifest | archive dir | why retired |
| --- | --- | --- |
| `announcer.zh-TW.json` | `retired-zh/` | it was never Chinese — `Meijia` is advertised but not installed, so `say` fell back to `Alex` (en_US) and exited 0. The clips are an American man spelling through Chinese. |
| `announcer.ja-JP-kyoko-retired.json` | `retired-ja-kyoko/` | superseded, not wrong — #57 recast the WRITING; a single voice reading straight Japanese carries none of it |
| `announcer.jank-novelty-retired.json` | `retired-jank-novelty/` | #57's first pass read "jank" as novelty voices (sheep/robot/singing synths); retired by the user's correction above |

Each archive keeps a `NOTE.md` recording the rationale. `avo-12` pins both halves:
the `out` paths stay inside the archive dirs, and the NOTEs stay on disk.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| avo-01 | All 7 system/announcer events are bound to at least one `announcer/` clip | audio-announcer-bound | unit | done |
| avo-02 | System events pool announcer VO **only** — no Chinese map quip is left in a system pool (a broadcast is the machine talking) | audio-announcer-system-vo-only | regression | done |
| avo-03 | Every `announcer/` path referenced anywhere in the audio-map exists on disk | audio-announcer-files-exist | integration | done |
| avo-04 | All 13 generated clips are bound and staged as real, non-empty MP3s (ID3/frame-sync header, >1 KB) | audio-announcer-real-mp3 | unit | done |
| avo-05 | The quips displaced from system pools are preserved, not deleted: the 6 map quips stay pooled in map-flavour, and the 2 CHARACTER quips (`mandie`→初音, `87joke`→飛影) moved to `champion-voices.json` instead — never back into map flavour | audio-announcer-quips-kept | regression | done |
| avo-06 | Map-flavour pools are split by LENGTH — both capped at 1 voice with a cooldown, and the long set-piece pool out-cools the short-stab pool, so an 8.8 s quip can never drown the match-start VO | audio-announcer-flavor-split | regression | done |
| avo-07 | `announcer.json` renders all 13 cues to the live `announcer/` paths with unique ids; a line is either whole-line cast or split into ≥2 non-empty, individually-voiced segments — never both | audio-announcer-manifest-live | unit | done |
| avo-08 | The cast table and the generator manifest stay in lockstep (same ids, clip, rate, spoken text, voice) so display text and spoken text cannot drift apart | audio-announcer-cast-in-sync | regression | done |
| avo-09 | The whole pack paces at ONE rate (185 wpm) — a rate outlier reads as a character doing a bit, which is the register this pack rejects | audio-announcer-uniform-rate | unit | done |
| avo-10 | Only the approved Kyoko/Tingting/Sinji/Karen cast is used; no novelty, character or singing synth is cast anywhere (they have no energy above ~2.5 kHz and cannot articulate these languages) | audio-announcer-no-novelty-voices | unit | done |
| avo-11 | No Latin script in any Kyoko fragment — she transliterates it to katakana internally, so Latin text renders as a non-deterministic guess rather than a reading (hence イーエックス, not "EX") | audio-announcer-no-latin-in-kyoko | regression | done |
| avo-12 | Every retired manifest stays retargeted to its own archive dir and never writes a live `announcer/` path, and each archive keeps the `NOTE.md` recording why it was superseded | audio-announcer-manifest-retired | regression | done |

## Notes / follow-ups

- The gate is `packages/shared/src/content/announcerVo.test.ts`. Like
  `audioAssets.test.ts` it reads by **direct file path**, not through
  `ContentLoader`, so it stays green both before and after `content:build`.
- `exUnlock` joined the announcer set in **#40**: an EX rank 0→1 flip is a system
  state change and previously had no announcer clip at all — only the 7 s
  character quip `87joke`, which moved to 飛影's champion-voice select pool.
- **No `build-announcer.mjs`.** Unlike the champion-name pack, which generates
  both its outputs from one `CASTING` table in
  `tools/tts-gen/src/build-champ-names.mjs`, `announcer.json` and
  `announcer.cast.json` are both hand-maintained. `avo-08` is the substitute for
  that single-source-of-truth guarantee — if the two ever grow a generator, it
  should replace the duplication rather than sit beside it.
- Same production story as the champion-name pack: these are **Apple-TTS machine
  VO** placeholders; the identical manifest re-renders through a real cloud
  provider via `POST /api/v1/ai/tts` (task #23 stub-mode).
- The renders are idempotent — `.mp3.hash` sidecars skip up-to-date lines, so
  re-running any retired manifest is a no-op that doubles as an archive-integrity
  check.
