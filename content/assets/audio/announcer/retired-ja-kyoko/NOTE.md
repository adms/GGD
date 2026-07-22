# Retired: the uniform ja-JP Kyoko announcer pack (task #40)

**Do not delete. Do not re-point audio-map at these.** Superseded, not wrong.

## What this is

The 13 announcer clips produced by **task #40**, which retargeted the whole
system-broadcast pack to a single Japanese female voice (Apple `Kyoko`,
`ja-JP`, 200 wpm) and normalised them to a `volumedetect` mean of -15 dB.

Every clip here is Kyoko reading a straight, correct Japanese line — the pack
did exactly what #40 asked for.

## Why it was superseded

**Task #57** recast the announcer as 惡搞 parody — trilingual zh/ja/en, where
each line is written as real-world boilerplate (transit-PA, customer-service
丁寧語, bureaucratic sign-offs) applied deadpan to a deathmatch. A single voice
reading straight, unfunny Japanese carries none of that writing, so the pack was
retired wholesale rather than edited.

Kyoko is still the primary voice of the live pack — 5 of its 13 lines, plus a
fragment of a 6th. What changed is the WRITING, not the casting.

> **Note for anyone reading this archive in order:** #57's FIRST pass read "jank"
> as *novelty voices* and recast this pack to sheep/robot/singing synthesisers.
> That pass was itself retired — see `../retired-jank-novelty/NOTE.md`. The live
> pack is the corrected one: real full-band voices, 字正腔圓, emotionless. Do not
> use this file as evidence that the announcer "should" be a novelty pack.

Two other things were wrong with this pack in hindsight, both fixed in #57:

- **Loudness metric.** It normalised on ffmpeg `volumedetect` mean_volume, which
  is UNGATED — it averages the pauses into the level. Short and pause-heavy
  clips therefore measured artificially quiet and were under-gained, which is
  why `ex-unlock` shipped at -18.2 dB while the rest of the pack sat at -14..-16.
  The replacement uses EBU R128 gated integrated loudness.
- **Silent voice fallback.** `say` accepts an unknown `-v` name, renders with the
  system default voice and still exits 0. This pack was not affected (Kyoko is
  genuinely installed) but its zh-TW predecessor was — see `../retired-zh/NOTE.md`.

## Provenance / regenerating

These files are still reproducible. The manifest was retargeted here rather than
deleted:

```sh
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.ja-JP-kyoko-retired.json
```

That is a no-op today (the `.mp3.hash` sidecars match), which is the check that
this archive is intact and unmodified.

The live pack is `content/audio-manifests/announcer.json`, cast by
`content/audio-manifests/announcer.cast.json`.

## Line texts (Kyoko, ja-JP, 200 wpm)

| clip | spoken |
| --- | --- |
| `match-start` | ようこそ、アリーナへ！ |
| `round-start-1` | ラウンド、スタート！ |
| `round-start-2` | レディ、ファイト！ |
| `level-up-1` | レベルアップ！ |
| `level-up-2` | パワーアップ！ |
| `death-1` | ノックダウン！ |
| `death-2` | ケーオー！ |
| `death-3` | 油断したね！ |
| `multi-kill-1` | 連続撃破！ |
| `multi-kill-2` | 大暴れ！ |
| `multi-kill-3` | 誰にも止められない！ |
| `ally-slain` | 味方のおつむ、確認したほうがいいかも！ |
| `ex-unlock` | イーエックス、解放！ |
