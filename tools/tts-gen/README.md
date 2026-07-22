# tts-gen — local TTS clip generator (macOS `say` → mp3)

Deterministic, idempotent generator for the game's voice-over clips
(announcer broadcast lines, champion name call-outs, …). It reads a lines
manifest and renders each line to MP3 via the macOS built-in TTS:

```
say (aiff) ──► ffmpeg (libmp3lame, -q:a 4) ──► <out>.mp3  +  <out>.mp3.hash
```

> **These clips are Apple-TTS MACHINE VO** — placeholder flavor for local/dev
> builds only. For production, the same manifests are regenerated through a
> cloud TTS provider via the platform proxy `POST /api/v1/ai/tts`
> (`{text, lang, voice?}` → `{mp3Base64, ...}`). When no provider is
> configured the endpoint answers `501 {"stub":true, ...}` and tooling keeps
> these local clips. No API key ever lives in the repo — the admin configures
> the provider at runtime, server-side only.

## Requirements

- macOS (`say` is built in) with **Kyoko** (ja_JP) installed
  (System Settings → Accessibility → Spoken Content).
- **Do NOT rely on Meijia for zh-TW.** `say -v '?'` lists it, but on this
  machine it is not actually installed and silently renders as the system
  fallback voice — plausible-length audio in the wrong voice, which is worse
  than a hard failure. The tool detects this (`isPhantomVoice()`) and refuses.
  Cast zh-TW with an explicit `voice`, e.g. `"Shelley (中文（台灣）)"`.
- `ffmpeg` on PATH (`brew install ffmpeg`).

## Usage

```sh
node tools/tts-gen/src/generate.mjs <manifest.json> [--force] [--rate N] [--quiet]
```

| Flag       | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `--force`  | Regenerate every line even when up to date.                          |
| `--rate N` | Default words-per-minute for lines that don't set their own `rate`.  |
| `--quiet`  | Only print the final summary (and errors).                           |

Exit code is `0` when every line generated or skipped cleanly, `1` otherwise
(bad manifest lines are reported individually and do not abort the rest).

## Manifest format

A JSON array; one object per clip:

```json
[
  {
    "id": "announcer-teammate-check",
    "lang": "zh-TW",
    "text": "請確認你的隊友是不是白目!!",
    "out": "../../apps/client/public/audio/vo/announcer/teammate-check.mp3",
    "rate": 200
  },
  {
    "id": "name-nanoha",
    "lang": "ja-JP",
    "text": "高町なのは",
    "out": "../../apps/client/public/audio/vo/names/nanoha.mp3"
  }
]
```

| Field   | Required | Notes                                                                  |
| ------- | -------- | ---------------------------------------------------------------------- |
| `id`    | yes      | Stable identifier, used in logs/errors.                                |
| `lang`  | yes\*    | `ja-JP` → **Kyoko**, `zh-CN` → **Tingting**, `zh-HK` → **Sinji**. `zh-TW` is deliberately UNMAPPED (see Requirements) — give it an explicit `voice`. |
| `text`  | yes      | The utterance.                                                         |
| `out`   | yes      | `.mp3` path; relative paths resolve **against the manifest's folder**. |
| `rate`  | no       | `say -r` words/min (90–360). **~190–210 gives announcer lines punch; omit for names** so they stay natural. |
| `voice` | no       | Explicit `say` voice override; skips the `lang` mapping. (\*`lang` may then be anything/omitted-equivalent.) |

## Idempotence

Every clip gets a sidecar `<out>.mp3.hash` — the sha256 of
`voice|rate|text`. A rerun **skips** any line whose mp3 + matching sidecar
already exist, so manifests can be re-run wholesale after edits and only the
changed lines re-render. `--force` regenerates everything. Deleting a sidecar
(or the mp3) also triggers regeneration of that line.

## Typical flows

```sh
# announcer pack (punchy)
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.zh-TW.json

# champion name call-outs (Kyoko, natural rate)
node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json

# re-render everything after a voice-direction change
node tools/tts-gen/src/generate.mjs content/audio-manifests/announcer.zh-TW.json --force
```
