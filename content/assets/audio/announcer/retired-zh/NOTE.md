# Retired: the zh-TW announcer pack (task #34) — and it was never Chinese

**Do not delete.** This is a genuine relic and the evidence for a real bug.

## What this is

The original 12 announcer clips from **task #34**, authored as Taiwanese
Mandarin and generated with what everyone believed was the Apple `Meijia`
(`zh_TW`) voice. Retired by **task #40** when the announcer moved to Japanese.

## The bug: these clips are Alex, an American man, reading Chinese

`Meijia` **is not installed on this machine.** It is listed by `say -v '?'`, but
that listing includes voices that are only metadata — advertised, never
downloaded. `say` accepts the unknown voice name, silently renders with the
system fallback voice (`Alex`, `en_US`), and still **exits 0**.

Measured, task #57:

- `say -v Meijia`, `say -v 美佳`, `say -v "Meijia (中文（台灣）)"` and
  `say -v ZZZ_BOGUS_VOICE_NAME` all produce **byte-identical** output.
- A fresh `say -v Alex -r 200 "歡迎來到競技場！"` encoded through the same ffmpeg
  settings is **byte-identical to `match-start.mp3` in this directory**
  (sha256 `e403da8e6556f197b6e45a1aa4625ee1…`, 1.424218 s both).

So the entire zh-TW announcer pack was an American English voice spelling its
way through Chinese text, start to finish. Nobody noticed because the generator
reported success.

## Why it is kept

Two reasons:

1. **It is the evidence.** These files are the reason `tools/tts-gen` now
   probe-renders every voice against a deliberately bogus name and hard-fails on
   a match, instead of trusting `say -v '?'`.
2. **Under the 惡搞 direction of task #57 it is arguably the most on-brand
   artefact in the repo** — a Taiwanese shitpost map whose Chinese announcer
   turned out to be a confused American robot. It stays retired, but it is not
   a mistake worth erasing.

## Regenerating is intentionally impossible

`content/audio-manifests/announcer.zh-TW.json` is kept as the canonical zh
display text, but re-running it now **hard-fails on every line**:

```
tts-gen: line 0 (id=announcer-match-start): zh-TW has no working default voice on
macOS: "Meijia" is listed by `say -v '?'` but is not installed and renders as the
fallback voice. Set an explicit "voice" (e.g. "Shelley (中文（台灣）)").
```

That failure is the point.

**How the live pack speaks Chinese instead** (this section was corrected — an
earlier revision claimed zh-TW was reachable only via the novelty voice family,
which is false): zh-TW copy is cast to **`Tingting`** (zh_CN), a real full-band
voice. Tingting **reads Traditional Chinese correctly** — 「請確認你的隊友是不是
白目。」 and its Simplified form render **byte-identically** (sha256 `3d28ad0a…`),
as do 美白大法師/美白大法师 and 被剝削的勞工階級/被剥削的劳工阶级. It normalises
繁→簡 internally and speaks it; no character is skipped or spelled out. The only
loss is a Mainland-standard accent.

The novelty zh_TW voices (`Shelley (中文（台灣）)` and friends) are **not** used:
they are formant synthesisers with no energy above ~2.5 kHz, so they cannot
articulate Mandarin sibilants and affricates at all.

The canonical zh display text for every cue now lives in
`content/audio-manifests/announcer.cast.json`, paired with what each voice
actually says.
