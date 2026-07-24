# Champion select voice (click your own hero) — TODO

Clicking your OWN hero in battle plays that champion's voice (task #27). This is
the **CHARACTER** half of the VO story: a named champion speaking, in Chinese,
from the imported GoDieEX22s.w3x map quips — never the machine announcer, whose
SYSTEM broadcasts live in [announcer-vo.md](announcer-vo.md). The two quips
displaced out of the system pools by the announcer pack (`mandie`→初音,
`87joke`→飛影) landed **here**, in their champion's `select` pool, which is why
`av-05` guards them.

Not to be confused with [name-voice.md](name-voice.md): that is the champ-SELECT
confirm call-out (稱號 + 全名, machine-rendered TTS, its own
`HTMLAudioElement` outside the mixer). This one is the in-BATTLE click, uses the
authored map audio, and rides the mixer's SFX bus like any other clip.

## The binding (content)

`content/config/champion-voices.json` — `config.champion-voices@1`, a member of
the `config` discriminated union in
`packages/shared/src/content/schema/config.ts` and indexed in
`content/config/_index.json`. **Unlike the name-VO manifest** (which sits under
`content/assets/` precisely to stay out of the schema-validated collection),
this one IS a config doc: it is a per-champion binding the pipeline should
validate, not an opaque asset pack.

One entry per champion doc, exactly — all 113, no orphans:

| field | meaning |
| --- | --- |
| `select` | content-relative clip pool (`assets/…`), picked from at random |
| `source` | `"map-quip"` (16 champions, 13 distinct w3x clips) or `"none"` (97) |
| `soundset` | WC3 unit soundset name, the fallback hint (76 entries; else `null`) |

`source: "none"` MUST carry an empty pool — the emptiness is the signal that
sends the client to the fallback below, so a non-empty `none` entry would be a
lie about where the audio came from. Both invariants are gated (cv-02).

## The client

`apps/client/src/audio/championVoice.ts` — a layer over the mixer's public
`playClip` seam (SFX bus), so the master/SFX sliders, mute and the autoplay
unlock all apply for free:

- **~2.5 s per-champion cooldown** (`SELECT_VOICE_COOLDOWN_MS`), reserved
  SYNCHRONOUSLY before the async config resolve — a same-frame double-click is
  one voice, not two. The unlock and mute gates deliberately return BEFORE the
  reservation, so a muted click doesn't silently eat the next real one.
- **Dev-only Blizzard fallback**: a `source: "none"` champion probes the
  local-only `assets/blizzard-local/MANIFEST.json` overlay and plays a random
  `clips.what` (the classic click-acknowledge line) for the unit bound to that
  champion. The overlay is copyright-gated and **never shipped** — the probe is
  gated on `fullAssetsEnabled()` (#176) and is 404-tolerant, so a public build
  simply stays quiet and never issues the request.
- Both fetches are cached single-flight; a 404 caches `null` and is never
  re-requested per click. Missing config, missing champion, missing clip, locked
  mixer, muted SFX ⇒ silent `false`. Audio never throws into the caller.

Wired in `GameApp` at `InputCapture.onSelectSelf` (the self-pick seam, not the
order path) with `loadChampionVoices()` warmed at boot so the first click
doesn't pay the fetch.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cv-01 | `config.champion-voices@1` round-trips through the config union and the loader's collection validator; non-`assets/` clip paths, unknown `source` values and unknown keys are rejected with field paths | champion-voices-schema | unit | done |
| cv-02 | The authored `content/config/champion-voices.json` schema-parses and binds EVERY champion doc exactly once (no missing entry, no orphan pointing at a deleted champion); 皮卡丘 (godie-ofar + variant godie-o02l) keeps the pikakill map quip, a no-quip champion is `source:"none"` + empty pool + soundset hint, and every referenced clip exists on disk | champion-voices-authored | integration | done |
| cv-03 | A click plays a random authored clip through `playClip`, the rng drives the pick, absolute-mount spellings normalize onto the content-relative path, and the config fetch is cached across clicks (one request) | voice-select-config | unit | done |
| cv-04 | The ~2.5 s cooldown is per champion (another hero speaks immediately), releases exactly at the boundary, and its slot is reserved synchronously — a same-frame double-click is one voice | voice-select-cooldown | unit | done |
| cv-05 | Autoplay-locked mixer, SFX mute and master mute each suppress the quip WITHOUT burning the cooldown — the click right after the gate opens still speaks | voice-select-gates | unit | done |
| cv-06 | `source:"none"` falls back to a random blizzard-local `clips.what` in dev only (single cached probe, never fetched in prod builds); missing config, 404 manifest and garbage docs all degrade to a silent no-op instead of throwing | voice-blizzard-fallback | exception | done |

## The ladder — REOPENED: 16 of 113 is not "clicking your hero works"

The two rungs above cover **16 of 113** champions on the public tier and 46 of
113 on a gated build. The tier the family plays is the first number: a player
clicked their own hero mid-fight and heard nothing about six times out of seven.
That is not a content gap to be filled later — the client's *shape* was wrong,
because the only non-copyright answer it knew was "the map had a quip".

`apps/client/src/audio/selectVoiceLadder.ts` replaces the two rungs with five,
first NON-EMPTY rung wins, rungs never merged:

| # | rung | source | champions |
| --- | --- | --- | --- |
| 1 | `authored` | `champion-voices.json` `select[]` — the w3x map quips | 16 |
| 2 | `generated` | the cloned per-champion voice pack (below) | 0 → 48 |
| 3 | `soundset` | blizzard-local `clips.what`, gated build only | ~30 |
| 4 | `name` | the 全名 half of the champ-select call-out | 95 answered |
| 5 | `quote` | the 名言 clip — the floor, present for all 113 | 2 answered |

**Public tier is now 113/113** (16 authored + 95 name + 2 quote), proved against
the files on disk by cv-10 — not asserted from a manifest.

**Why the name and not the 名言.** Both were already on disk, so this is a
judgement. A click asks *who are you*, and 名乗り is the genre-correct answer —
it is what a WC3 `what` clip is. The 名言 is the champ-select payoff: spoken on
confirm (#120/#139) **and** printed in the profile panel, so replaying it as a
spammable ack makes the champion sound like it knows one line and cheapens the
confirm moment. So the 名言 is the floor, not the default: it fires for the 2
champions with no usable name clip, and 111 keep their moment intact.

**Distinctiveness (「如果大家聲音都相似…不知道是誰放了哪招」).** Rungs 4–5 are
the two-voice Kyoko/Otoya monoculture #184 exists to break, so the ladder does
not lean on timbre: the name clip's whole content is the champion's own name,
and cv-10 pins the structural property — two DIFFERENT characters never resolve
to the same audio file. The 20 byte-identical clip groups in the tree are all
one character duplicated across hero numbers (#113). The two genuine exceptions
are **inherited**, in rung 1: the w3x binds `kickme.mp3` and `dogdie.mp3` to two
heroes each, which predates this ladder and needs re-cut map audio, not a code
change. Neither pair is in the curated roster.

The 稱號 half is deliberately **not** pooled with the 全名: 妙蛙種子 and 妙蛙花
are both 種子神奇寶貝 and ship a byte-identical title clip.

### Rung 2 — the drop-in contract for generated audio

`content/assets/audio/voices/champions/MANIFEST.json`,
`audio.champion-voice-pack@1`. Committed **empty**, on purpose: it is the
contract, written ahead of the audio. It lives under `content/assets/` (not
`content/config/`) for the same reason the names/quotes packs do — a generated
asset pack validated by the client's tolerant parser and its tests, not a
hand-authored binding for the content schema.

```json
{ "champions": { "godie-e001": { "engine": "cosyvoice3", "variant": "base",
  "lines": { "select": [ { "clip": "assets/audio/voices/champions/godie-e001/select-1.mp3",
                           "text": "なに？", "lang": "ja",
                           "durationSec": 0.9, "speakerSim": 0.81 } ] } } } }
```

Only `lines.select[].clip` is load-bearing; the rest is provenance the QA
surfaces read. `lines` is category-keyed so the same file can index the whole
~42-line corpus and the later cues (hurt / battlecry / death) need a reader, not
a second manifest. **Writing this file is the whole integration** — no
`packages/shared` schema change, no `content:validate` change, no client change.
2–4 `select` lines per champion is the ask; the client picks one and never
repeats the previous one back-to-back.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cv-07 | First non-empty rung wins and rungs never merge: an authored quip outranks a full pack, `generated` outranks the copyright-gated `soundset`, the same champion answers `soundset` on a gated build and `name` on the public tier, a champion in no manifest but the quote pack still speaks, and silence needs EVERY rung empty | voice-select-ladder | unit | done |
| cv-08 | The name rung pools the 全名 half ONLY (a shared 稱號 must not answer for two characters), honours the pinned missing-clip exclusion by falling through to the 名言, and accepts a pre-#120 single-clip manifest | voice-select-name-rung | unit | done |
| cv-09 | `audio.champion-voice-pack@1` parses `lines.select`, normalizes mount spellings, keeps other categories, carries `speakerSim: null` when unmeasured, and degrades to an empty rung on junk / empty / 404; the shipped template parses to zero champions so nothing yet depends on it | voice-select-pack | unit | done |
| cv-10 | Run against the real `content/` tree: all 113 champions answer on the PUBLIC tier with files that exist (composition pinned at 16 authored + 95 name + 2 quote); no two DIFFERENT characters share an audio file outside the two the w3x already shared; `EXCLUDED_NAME_CLIPS` equals the name-manifest clips actually missing from disk, both directions | voice-select-coverage | integration | done |
| cv-11 | Through the player: a no-quip champion speaks its 全名 on a public build at the call-out's 0.95 gain, falls to its 名言 with no name entry, still prefers the gated soundset on a full-assets build, probes the pack once (404 → rung skipped), never repeats the previous clip, exposes the whole ladder for diagnostics, and survives a borrowed loader that REJECTS | voice-select-fallback | unit | done |

## Notes / follow-ups

- **What is still blocked on generated audio**: rung 2 is empty, so 95 champions
  answer in the Kyoko/Otoya TTS voice of their own name. That is legible but it
  is not *their* voice. Nothing more is needed from the client — the pack lands
  by writing the manifest above.
- `godie-e00j` (皇者 - 騜) has a name-manifest entry whose `.name.mp3` was never
  rendered; it answers from its 名言 meanwhile. Owned by the tts-gen lane, and
  pinned in `EXCLUDED_NAME_CLIPS` so regenerating it fails cv-10 until the pin
  is removed. `godie-u01q` (索隆) has no name entry at all — same rung, no fix
  needed unless a name clip is wanted.
- The name/quote manifests are loaded through **nameVoice's own cached
  loaders**, so a click costs no extra request on any screen that already warmed
  the champ-select call-out, and the two layers cannot disagree about what a
  champion's name clip is.
- `soundset` is a diagnostic hint carried for the dev overlay and for whoever
  eventually records real lines; nothing in the shipped client reads it (the
  fallback matches on the manifest's own `champId`).
- `onSelectSelf` resolves the champion of `hudStore.localSeatId`, so in couch
  play only the primary local seat's hero speaks — players 2–4 share the canvas
  but have no self-click seam of their own.
