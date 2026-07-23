# BGM "Samantha James" rotating variants — 12+12 (task #137)

A second, alternative arrangement of every one of the 12 BGM scenes, in a
nu-jazz / soulful **deep-house ("Samantha James, fast")** style, so each scene
now ships TWO beds that **rotate on scene entry** (original ↔ variant), and the
audition page offers all **12 + 12 = 24**.

## Deliverables (all landed)

- **Style helper** `tools/bgm-gen/src/ggd/samantha.py` — ~120 bpm (88 200
  samples/bar, sample-exact at 44.1 kHz), four-on-the-floor deep-house building
  blocks: brushed kit + shaker/offbeat hats, round sub+reese house bass, jazzy
  Rhodes 7th/9th comp, warm pad, and a breathy female-vocal pad/hook (the pack's
  formant choir, soprano-led).
- **12 variant scores** `tools/bgm-gen/scores/<scene>.samantha.py` → rendered to
  `content/assets/audio/bgm/<scene>.samantha.mp3` (distinct id per the renderer's
  `<id>.mp3` rule, so the 12 originals are NEVER overwritten). Each reharmonises
  its own scene (same key, jazzy 7ths) so it is recognisably the same cue.
- **Manifest** `content/assets/audio/bgm/MANIFEST.json` — variants added under a
  NEW `samanthaVariants` key (`python3 tools/bgm-gen/src/manifest.py --variants`);
  `tracks` (the 12 originals) untouched.
- **Rotation** `apps/client/src/audio/bgmVariants.ts` + `AudioSystem` wiring —
  on each scene ENTRY the bed alternates original → variant → …. `menu` is
  locked to the single epic theme (task #134); `menuNocturne` (ladder) + every
  in-scene cue rotate. Empty variant map ⇒ no rotation (tests unchanged).
- **Audition** `tools/bgm-gen/src/audition.py` → `apps/client/public/bgm-audition.html`
  now renders **原曲 (12) + Samantha 變體 (12) + 名言 (113) + SFX (63)** = 200
  players (名言 section added per the #137 addendum: head icon + 全名/稱號 +
  JP quote/romaji/中文 gloss + player, sorted by id).

## Why variants are NOT a field in `audio-map.json`

`config.audio-map@1` is a `.strict()` Zod doc in `packages/shared` (which this
task must not edit), and `packages/shared/…/audioAssets.test.ts` parses the real
file strictly AND asserts `bgm` has exactly the 12 scene keys AND that every
`MANIFEST.tracks` entry maps to a bgm key. So a `variants` field, an extra bgm
key, or a variant inside `tracks` would break that gate. The variant path is
derivable (`<scene>.mp3` → `<scene>.samantha.mp3`), so rotation lives in a
client registry (`bgmVariants.ts`) that reuses the audio-map's base `file`, and
manifest variants live under their own key — zero schema risk.

## Verification

- **Originals intact:** md5 of all 12 `content/assets/audio/bgm/{scene}.mp3`
  byte-identical before == after.
- **Variants:** all 12 pass `probe/track_check.py` (whole bars @120, −16 LUFS,
  TP ≤ −1, seamless loop / silent sting end, choir 12–85 %).
- **Client:** `pnpm --filter @ggd/client typecheck` clean; `bgmVariants.test.ts`
  (9) + `AudioSystem.test.ts` (26) green.
- **Shared gate:** `audioAssets.test.ts` (11) + `audioMap.test.ts` (3) green.
- **Audition page** renders all four sections (browser-verified).

Regenerate: `python3 tools/bgm-gen/src/render.py <scene>-…` per score, then
`manifest.py --variants` and `audition.py`.

(Pre-existing, NOT part of this task: `audioSettings.test.ts` fails because a
concurrent session set `DEFAULT_AUDIO_VOLUMES.bgm` 0.5→0.4 in `audioSettings.ts`
without updating its own test — a file outside this task's scope.)
