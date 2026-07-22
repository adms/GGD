# Retired: the novelty-voice "jank" announcer pack (task #57, first pass)

**Do not delete. Do not re-point audio-map at these.** Superseded by a
CORRECTION FROM THE USER, mid-task, about what 惡搞 actually means here.

## What this is

The 13 announcer clips produced by the FIRST pass of **task #57**, which read
the brief's word "jank" as *character voices*: Apple's novelty synthesisers
(`Bahh` the sheep, `Rocko`, `Grandpa`, `Grandma`, `Sandy`, `Reed`, `Shelley`),
the singing voices (`Good News`, `Bad News`, `Cellos`), and the robot `Zarvox`
— plus deliberate cross-script mispronunciation (a Japanese voice fed pure
Chinese) and a scripted stammer.

The manifest that produced them is preserved and retargeted here:

```sh
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.jank-novelty-retired.json
```

That is a no-op today (the `.mp3.hash` sidecars match), which is the check that
this archive is intact and unmodified.

## Why it was superseded

The user corrected the direction, verbatim:

> 惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話清楚但不帶感情所以嘲諷

*The 惡搞 voice should not be a "robot voice" — it should be like Google's
voice: perfectly enunciated, clearly spoken, but emotionless, and THAT is what
makes it mocking.*

This pack does the opposite on every line. It makes **the voice** the joke; the
corrected direction makes **the line** the joke and requires the voice to
deliver it flawlessly. A bleating sheep saying "Rampage!" is funny once and is
funny *about the sheep*. A composed announcer saying "Rampage. Please maintain
order." with 1.98 semitones of pitch movement is funny every time, and is funny
about the situation.

Two things in this pack were also measurably wrong, not just off-register — see
`content/audio-manifests/announcer.cast.json` for the full audition data:

- **The novelty voices are unintelligible, objectively.** They are old MacinTalk
  FORMANT SYNTHESISERS with essentially no energy above ~2.5 kHz (85% spectral
  rolloff 956–2474 Hz, spectral flatness 0.0104–0.0756, n=33) where the real
  voices span 2174–4921 Hz / 0.096–0.269 (n=26). The two families do not overlap
  on a single sample. Consonant articulation — Mandarin /s ts tsʰ ɕ tɕ/, Japanese
  /s ɕ tɕ ts/, English sibilants — lives at 2–8 kHz, so these voices *physically
  cannot* articulate it. That is the exact opposite of 字正腔圓.
- **Flatness ranking would have picked them anyway, and that is a trap.** The
  novelty voices measure FLATTER than the real ones (Shelley-ja 2.56 st,
  Flo-ja 2.58, Sandy-ja 2.68 vs Kyoko 3.49) — not because they are deadpan but
  because they barely model prosody at all. Bandwidth, not flatness, is the
  criterion that separates "deadpan" from "broken".

## What replaced each line

The replacement is not a translation of this pack — the lines were rewritten so
the *writing* carries the joke. Full reasoning per line is in
`content/audio-manifests/announcer.cast.json`.

| clip | this pack (retired) | replacement |
| --- | --- | --- |
| `match-start` | Kyoko 「ようこそ、去死團のアリーナへ！」 | Kyoko + Tingting, MRT-style bilingual PA |
| `round-start-1` | Shelley-tw 「第一回合，Fight！」 | Tingting 「第一回合，即將開始。」 |
| `round-start-2` | Rocko-ja 「レディ…ファイッ！」 | Kyoko 「ご準備ください。開始いたします。」 |
| `level-up-1` | Good News (sung) "Level up!" | Karen "Level up. Congratulations." |
| `level-up-2` | Sandy-ja 「つよくなっちゃった〜」 | Kyoko 「レベルが上がりました。おめでとうございます。」 |
| `death-1` | Bad News (sung) "You died." | Kyoko 「戦闘不能です。しばらくお待ちください。」 |
| `death-2` | Sinji 「打完收工！」 | Sinji 「打完收工。」 — **kept**, recast flat |
| `death-3` | Grandma-ja 「ゆだんしたね〜」 | Tingting 「您已出局。感謝您的參與。」 |
| `multi-kill-1` | Grandpa-ja 「れ、れんぞく、げきは……」 @150 wpm | Kyoko 「連続撃破を確認いたしました。」 |
| `multi-kill-2` | Bahh (sheep) "Rampage!" | Karen "Rampage. Please maintain order." |
| `multi-kill-3` | Reed-ja fed Chinese 「無人能擋」 | Tingting 「目前無人能擋。以上，報告完畢。」 |
| `ally-slain` | Zarvox "Please confirm. Your teammate. Is a baka." | Tingting + Karen, in the original Chinese |
| `ex-unlock` | Cellos (sings Grieg) "E X! Ready!" | Kyoko 「イーエックス、使用可能になりました。」 |

`death-2` is the only line that survived: 打完收工 is Cantonese film-crew slang
and `Sinji` is Apple's *standard* zh_HK voice, not a novelty one — it passes the
full-band gate cleanly (rolloff 3289 Hz, flatness 0.1763). Only the exclamation
mark was removed.

## The one real bug this pack shipped

`multi-kill-3` fed Chinese text to a Japanese voice ON PURPOSE, and
`ally-slain` fled to English "baka" through a robot to avoid colliding with the
human original in `../sfx/pcdie.mp3`. Both are now cast to the language they are
written in. The collision fear was unfounded: the human clip SHOUTS
「請確認你的隊友是不是白目!!」, and the replacement reads the identical Chinese
words as a flat three-clause verification procedure — same text, unmistakably
different object.

## The retire chain

`retired-zh` (task #34, and it was secretly Alex) → `retired-ja-kyoko`
(task #40) → **`retired-jank-novelty`** (task #57 first pass) → the live pack
(task #57, corrected). Nothing in this chain has ever been deleted.
