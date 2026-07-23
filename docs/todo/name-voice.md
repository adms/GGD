# Champ-select champion call-out VO (稱號 + 全名) — TODO

Confirming a champion in champ-select speaks that champion's **call-out**: the
稱號 (title), a beat, then the 全名 — read flat, in anime-intro cadence, over the
existing `champSelectConfirm` click SFX. 火霧戰士 - 夏娜 →
「フレイムヘイズ・シャナ。」, 神奇寶貝兒 - 皮卡丘 → 「神奇寶貝兒，ピカチュウ。」.
On-screen text stays Chinese.

Task #35 shipped this name-only twice; **task #41** added the 稱號, which is the
whole point — the 稱號 ARE the best 惡搞 material in the game (「美白大法師」,
「至尊學長」, 「外掛開很大的死神」 are jokes, not labels), and without them 6 pairs
of champions collapse to identical audio. The 稱號 is NEVER dropped to save
time; if a line overruns, the RATE goes up instead.

## The pack (content)

`content/assets/audio/voices/names/` — one MP3 per champion + the canonical
mapping `MANIFEST.json` (`audio.champion-names-ja@2`), rendered by
**`tools/tts-gen`** from a three-voice cast at a uniform **185 wpm**. 112 of the
113 authored champions are mapped — `godie-u01q` (測試英雄) is a declared
placeholder skip.

The direction is 惡搞, **and the joke is the LINE, not the VOICE** — the user's
correction, verbatim: 「惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話
清楚但不帶感情所以嘲諷」. Every voice is a real, full-band system voice reading
correct text in a language it actually speaks; the comedy is that a composed
broadcast voice treats 「外掛開很大的死神」 as a job title. No novelty/formant
synthesisers — they have no energy above ~2.5 kHz and physically cannot
articulate a 12-mora 稱號.

| voice | lang | role | entries |
| --- | --- | --- | --- |
| **Kyoko** | ja_JP | the pack's primary voice — brightest, cleanest-articulating of 59 auditioned | 89 solo + 19 shared |
| **Tingting** | zh_CN | reads untranslatable Taiwanese 稱號 in Mandarin (verified to read Traditional correctly) | 21 shared |
| **Karen** | en_AU | flattest pitch contour measured (1.98 st SD); genuinely English referents only | 2 solo + 2 shared |

Pacing is pack-wide because evenness IS the announcer signal. The only
sanctioned fix for a long line is a per-line rate bump — `godie-u012` 205,
`godie-u00b` 200 — never trimming the 稱號. Loudness is EBU R128 gated
integrated, **-16 LUFS / -1.5 dBTP**, the same target as the announcer pack, so
a call-out and the broadcast that follows it sit at one level.

**Why the mapping lives under `content/assets/`, not `content/config/`.**
`config/*` is a schema-validated, `_index.json`-indexed collection: a new doc id
there must land in `packages/shared/src/content/schema/config.ts`'s zod union
AND in every rebuilt collection index at the same time — a guaranteed collision
with the parallel content builds. Assets are served verbatim from the same
`/content/` mount, so the client just fetches
`assets/audio/voices/names/MANIFEST.json` directly and a 404 degrades to silence.

**Casting** — one row per champion in the `CASTING` table, in one of four modes.
The applied rule is recorded per entry in `evidence`:

| mode | who speaks | when | n |
| --- | --- | --- | --- |
| `ja` | Kyoko reads 「稱號・全名。」 | a Japanese ORIGINAL exists, or Sino-Japanese on'yomi is the correct reading | 89 |
| `zh+ja` | Tingting reads the 稱號, hands to Kyoko for the name | the 稱號 is untranslatable Taiwanese — PTT slang, campus hierarchy, class satire — where a Japanese rendering would lose the sneer | 19 |
| `zh+en` | Tingting reads the 稱號, Karen the name | the referent is genuinely English | 2 |
| `en` | Karen reads the whole line | the two non-w3x champions (`sela`, `thorne`) | 2 |

**Naming policy** (recorded in the manifest's `policy` field):

1. Where a Japanese ORIGINAL exists, **RESTORE** it rather than translating:
   超級賽亞人 → スーパーサイヤジン, 最終幻想 → ファイナルファンタジー, 火霧戰士 →
   フレイムヘイズ, 七夜怪談 → リング, 最終泛用人型決戰兵器 →
   ハンヨウヒトガタケッセンヘイキ.
2. Kanji name with no Japanese original → Sino-Japanese **on'yomi**. This is the
   correct, standard Japanese reading of a Chinese historical name (曹操孟德 →
   ソウソウモウトク, 趙子龍 → チョウウンシリュウ) — not a mangling gag. It stays
   because it is right.
3. Untranslatable Taiwanese 稱號 → spoken in Mandarin by Tingting.
4. Genuinely English referent → Karen, that fragment only, used sparingly
   (4 entries).
5. Katakana for every Japanese fragment — Kyoko mis-reads bare Chinese kanji.
   **NEVER put Latin text in a Kyoko line**: she transliterates it to katakana
   internally, so the render is a non-deterministic guess, not a reading.

Multi-voice call-outs use tts-gen's `segments`, which renders each fragment with
its native voice and concatenates sample-exactly.

Regenerate. The `CASTING` table in `build-champ-names.mjs` is the **single source
of truth** — it writes the tts-gen manifest *and* `MANIFEST.json` from one table,
which is what stops display text and spoken text drifting apart (the failure this
pack has had twice). **Do not hand-edit either output.**

```sh
node tools/tts-gen/src/build-champ-names.mjs
node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json
```

The render step is idempotent — `.mp3.hash` sidecars skip up-to-date lines.

Same production story as the announcer pack: these are **Apple-TTS machine VO**
placeholders; the identical manifest re-renders through a real cloud provider
via `POST /api/v1/ai/tts` (task #23 stub-mode — `501 {"stub":true}` with no
provider; the admin's key is supplied at runtime, server-side only, never in the
repo).

## The client

`apps/client/src/audio/nameVoice.ts` (NEW, additive) — a self-contained layer
that never touches the WebAudio graph:

- Plays through its **own single, reused `HTMLAudioElement`**, so a new call-out
  replaces the previous one and two names can never overlap.
- READS the mixer's public surface only — `audioSystem.isUnlocked`,
  `audioSystem.volumes()` and the pure `effectiveGain(v, "sfx", 0.95)` — for the
  autoplay-unlock gate, the master/SFX mute gate and the level. `AudioSystem.ts`
  and `audioSettings.ts` are untouched.
- Cached single-flight, 404-tolerant manifest fetch; unmapped champion, missing
  pack or absent DOM `Audio` ⇒ silent `false`.
- ~1 s per-champion double-fire guard, reserved SYNCHRONOUSLY before the async
  manifest resolve, so a same-tick double confirm can never start two clips. The
  mute gate deliberately does NOT burn the guard.

Wired at `apps/client/src/ui/actions.ts` — `hudActions.selectChampion`, the one
place a pick becomes an action. Every UI entry point (roster row, 隨機英雄) funnels
through it, and the online and offline flows both continue into the same
`RoomConnection.sendSelectChampion`, so one call site covers both. The room
message is sent FIRST and unconditionally; the fire-and-forget VO can never
delay or fail a pick. `registerHudActions` warms the manifest at boot (browser
only) so the first confirm doesn't pay the fetch.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| nv-01 | The mapping covers every authored champion except the declared 測試/範例 skips, and maps no unknown ids | name-vo-covers-roster | unit | done |
| nv-02 | Every entry carries the live zhName / non-empty spokenLine / reading / evidence / clip / voice; Japanese fragments are katakana-only; a multi-voice line declares segments that reconstruct the line | name-vo-entry-shape | unit | done |
| nv-03 | The 6 champion pairs that differ ONLY by 稱號 — including both 皮卡丘 heroes (godie-o02l 神騎寶貝 / godie-ofar 神奇寶貝兒) — get genuinely distinct call-outs instead of identical audio | name-vo-title-disambiguates | regression | done |
| nv-04 | Every mapped champion has a real, non-empty MP3 staged on disk | name-vo-clips-exist | unit | done |
| nv-05 | The tts-gen manifest stays in lockstep with the mapping (ids, spokenLine/segments, voices, langs, output paths) so regeneration cannot drift | name-vo-generator-in-sync | regression | done |
| nv-06 | Tolerant manifest parse: junk docs rejected, entries with no reading skipped, unknown confidence downgraded | name-vo-manifest-tolerant | exception | done |
| nv-07 | Manifest parse derives a clip path when the doc omits one | name-vo-manifest-shape | unit | done |
| nv-08 | Clip paths normalize onto the content mount; an unmapped champion resolves to null | name-vo-clip-path | unit | done |
| nv-09 | One confirm plays exactly one call-out sequence, honouring the ~1 s guard; the manifest fetch is cached across confirms | name-vo-confirm-plays-once | unit | done |
| nv-10 | The double-fire guard is reserved synchronously — concurrent confirms cannot start two clips | name-vo-guard-sync | exception | done |
| nv-11 | Switching pick replaces the previous call-out on the shared element instead of overlapping | name-vo-single-voice | unit | done |
| nv-12 | Master mute and SFX mute both suppress the VO, fetch nothing, and do not burn the guard | name-vo-mute-suppresses | unit | done |
| nv-13 | Silent degradation: autoplay-locked mixer, empty/unmapped champion id, missing (404) pack | name-vo-silent-degrade | exception | done |
| nv-14 | No DOM `Audio` (node/SSR) is a silent no-op, never a throw | name-vo-no-dom | exception | done |
| nv-15 | `hudActions.selectChampion` sends the pick and speaks the name exactly once per confirm | name-vo-wired-to-confirm | integration | done |
| nv-16 | An unregistered seam or a rejected play never breaks the pick (room message still sent) | name-vo-never-blocks-pick | exception | done |
| nv-17 | The boot warm-up only runs where a DOM can resolve the relative content URL | name-vo-boot-warm | unit | done |
| nv-18 | Every champion authored `稱號 - 全名` (108 of them) actually SPEAKS both halves, 稱號 first, and the spoken 稱號 is either the Chinese one verbatim or its katakana reading — never a third unrelated string | name-vo-speaks-title-and-name | regression | done |
| nv-19 | The 4 champions authored WITHOUT a 稱號 (godie-h02s, godie-h02z, sela, thorne) record a null title and still speak their name | name-vo-titleless-champions | unit | done |
| nv-20 | No Latin script in any Kyoko fragment — she transliterates it internally, so the render would be a guess rather than a reading | name-vo-no-latin-in-kyoko | regression | done |
| nv-21 | Only the approved Kyoko/Tingting/Karen cast is used; no novelty/formant voice is cast anywhere in the pack | name-vo-no-novelty-voices | unit | done |
| nv-22 | The pack normalises into the announcer's loudness band (-16 LUFS / -1.5 dBTP) and no line renders below the 185 wpm floor | name-vo-loudness-band | unit | done |
| nv-23 | By-value spot check: 7 unmistakable entries (both 皮卡丘 → ピカチュウ, 夏娜 → フレイムヘイズ・シャナ。, both 悟空 → スーパーサイヤジン/サイヤジン・ソンゴクウ, both 黑崎一護 → クロサキイチゴ) keep their exact jaTitle/jaName/spokenLine — the structural tests would not notice a mangled or swapped reading | name-vo-known-readings | regression | done |
| nv-24 | Task #120: CONFIRM speaks the 稱號 (Chinese voice) then the 全名 (Kyoko) in order — 稱號 first — on the single reused element; a titleless champion speaks the 全名 alone | name-vo-mixlang-sequence | integration | done |
| nv-25 | A mixed-language half whose clip will not play (404 / autoplay-blocked) is skipped and the sequence still speaks the half that exists — never a throw | name-vo-mixlang-degrade | exception | done |
| nv-26 | The generated MANIFEST carries, per champion, `voSegments` = a Chinese-voiced 稱號 clip (`<id>.title.mp3`) then a Kyoko 全名 clip (`<id>.name.mp3`) speaking the original Traditional-Chinese text; titleless champions carry the 全名 clip only | name-vo-mixlang-manifest | integration | done |

## The mixed-language CONFIRM call-out (task #120)

The user asked for a deliberately BILINGUAL confirm gag — 「[火霧戰士|中文語音] +
[夏娜|日文語音]」: the **稱號** read by a **Chinese** voice, then the **全名** read by
a **Japanese** voice (Kyoko), back-to-back. Both halves speak the ORIGINAL
Traditional-Chinese display text (split with the same `splitChampionName`
convention the codex uses); the joke is Kyoko reading the Chinese 全名 back with
Japanese kana readings straight after a Mandarin voice announced the 稱號.

This is **additive**: the canonical single-clip pack (`<id>.mp3`, `spokenLine`,
`jaName`, …) and its gate (`championNamesJa.test.ts`) are untouched. `build-champ-names.mjs`
ALSO emits, per champion, two extra clips — `<id>.title.mp3` (稱號, a Chinese
voice) and `<id>.name.mp3` (全名, Kyoko) — recorded on each entry's `voSegments`,
from the new tts-gen manifest `content/assets/audio/voices/names/_tts-mixlang.json`:

```sh
node tools/tts-gen/src/build-champ-names.mjs
node tools/tts-gen/src/generate.mjs content/assets/audio/voices/names/_tts-mixlang.json
```

**Chinese voice: Tingting (zh_CN Mandarin).** Meijia (zh_TW, the Traditional/Taiwan
Mandarin voice) is a **phantom** on this macOS — `say -v Meijia` renders
byte-identical to an unknown voice name (the silent fallback), i.e. it is not
installed — so the 稱號 falls back to Tingting, which is verified to read
Traditional characters correctly. A half a voice cannot pronounce (e.g. Kyoko on
the rare kanji 騜, `godie-e00j`) simply does not render, and the client degrades
to the half that exists.

`nameVoice.ts` plays `voSegments` in order on its single reused element (chaining
each half to the next on `onended`); a new confirm bumps a sequence id so the 稱號
of one champion can never be followed by the 全名 of another. When a manifest
predates #120 (no `voSegments`) it falls back to the single `clip`.

## Notes / follow-ups

- The couch-play hotkey that cycles champions for local players 2–4
  (`GameApp.cycleChampion`, `MultiSession.sendSelectChampion`) bypasses
  `hudActions` and therefore stays silent — deliberate: it is a per-keypress
  browse, not a confirm.
- The existing `champSelectConfirm` SFX (`AudioDirector`, fired off the server's
  seat echo) is untouched; the name VO layers over it.
- **Task #41 (稱號 in the announcement) is delivered** — but not as the "second
  line per champion" originally sketched here. It is ONE call-out per champion
  (稱號, a beat, 全名) rendered as a single clip, multi-voice where the 稱號 stays
  Mandarin. One clip per champion means the client layer below is unchanged.
- The `confidence` field (`high`/`medium`/`low`) was **removed** in
  `audio.champion-names-ja@2` — casting rationale now lives in the per-entry
  `evidence` string plus the mode's rule. Any consumer still reading
  `confidence` will get `undefined`.

## Task #139 — the famous-quote (名言) THIRD segment

On CONFIRM the champion's signature line now plays **after** the 稱號→全名 call-out
as a third segment on the same reused element: 蒙其·D·魯夫 →「海賊王に、俺はなる！」,
拳四郎 →「お前はもう死んでいる」, 夜神月 →「計画通り」. The champ-select **profile
panel** (`ProfileBlock.tsx`) also displays the Japanese line + a Chinese gloss as a
pull-quote, flagging `原創台詞` for the coined/惡搞 lines.

**Pack (content).** `content/assets/audio/voices/quotes/` — `quotes.json`
(`audio.champion-quotes-ja@1`, keyed by champion **id**) + one MP3 per id, plus
`_tts-quotes.json` (the tts-gen input). Built by
**`tools/tts-gen/src/build-champ-quotes.mjs`** (`pnpm --filter @ggd/tts-gen
build-champ-quotes`), whose `QUOTES` (research, keyed by display name) + `ROSTER`
(the open roster's name→candidate-id map, task #138) tables are the source of
truth. The quote is applied to **every** candidate id for a name, so it survives
whichever duplicate the roster seats. Lives under `content/assets/` for the same
reason the names pack does — served verbatim, **not** part of `content:validate`;
the client's tolerant parser + `nameVoice.test.ts` validate it.

**Coverage.** 48 named champions → **67 champion ids** (55 real franchise quotes,
12 coined `original` lines by id; 39 real / 9 original by name).

**Voice (gender-appropriate).** female/neutral → **Kyoko**; male → a **clean**
Japanese male voice (`Otoya`/`Hattori`) *when installed*. On this macOS those are
**phantoms** (`say -v Otoya` renders byte-identical to the silent fallback), and
the only real ja male voices are the novelty formant synths the pack direction
forbids — so male quotes **fall back to Kyoko**. The resolver in the build script
re-picks a real male voice automatically on a machine that has one; each id's
resolved `voice` is recorded in `quotes.json`. Loudness matches the names pack
(EBU R128, -16 LUFS / -1.5 dBTP), so call-out and quote sit level.

**Client.** `nameVoice.ts` loads the quote pack single-flight alongside the name
manifest (both fetched in one `Promise.all` on CONFIRM; the profile warms the
quote pack on hover), then **appends the quote clip to `voSegments`** as the final
segment — reusing the existing sequence + degrade machinery (missing quote ⇒
unchanged call-out; a quote-only champion still speaks). All existing gates hold:
the #62 silence gate, master/SFX mute, the ~1 s double-fire guard, and the
new-call-out-supersedes-previous-chain rule.

## Notes / follow-ups (quotes)

- **Otoya on this Mac is a phantom** — install a clean ja male voice (System
  Settings → Accessibility → Spoken Content → Voices) and re-run
  `build-champ-quotes` + `generate` to upgrade the 30-odd male clips from Kyoko.
- `content:validate` is currently red from an **unrelated** stale-index drift in
  the `champions`/`items`/`config` collections (a concurrent icon batch); the
  quote pack is under `content/assets/` and adds **zero** index drift.
