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
  gated on `import.meta.env.DEV` and is 404-tolerant, so a production build
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

## Notes / follow-ups

- The 97 `source: "none"` champions are silent in a shipped build **by design** —
  the map has no quip for them and the Blizzard soundsets cannot be
  redistributed. Filling those pools needs authored VO, not a code change.
- `soundset` is a diagnostic hint carried for the dev overlay and for whoever
  eventually records real lines; nothing in the shipped client reads it (the
  fallback matches on the manifest's own `champId`).
- `onSelectSelf` resolves the champion of `hudStore.localSeatId`, so in couch
  play only the primary local seat's hero speaks — players 2–4 share the canvas
  but have no self-click seam of their own.
