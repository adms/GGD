# Copyright-gated asset debt

Every asset listed here is **Blizzard-owned**, extracted from the user's own
locally-installed Warcraft III MPQs so that local development can see the map as
it originally looked. **None of it may ship.** The gate is real and was verified
by execution, not by inspection — see [Why the gate holds](#why-the-gate-holds).

That makes this list *technical debt*: the game currently looks right in dev and
would look **broken in a real build**, because every gated asset silently
degrades to a stand-in (a shared CC0 mesh, a missing icon, a placeholder effect).

This document is the register. Each row has to end in one of:

| Resolution | Meaning |
| --- | --- |
| **REPLACE** | Generate or source a non-Blizzard equivalent that ships |
| **DROP** | The game does not actually need it; delete the reference |
| **OURS** | Re-examined and it turns out to be the map author's own work, so it ships as-is |

---

## 1. Models — 40 units, 26 genuinely Blizzard

`data/blizzard-overlay/models/*.glb` · 84 MB total overlay

| | count |
| --- | --- |
| units extracted | 40 (all 40 bound to a real champion) |
| `textureSource: blizzard` — **mesh AND texture are Blizzard's** | **26 → REPLACE** |
| `textureSource: user-reskin` — Blizzard mesh, **the map author's own texture** | 14 → REPLACE (mesh only; the texture is ours and can carry over) |

The 14 reskins are the cheaper half of the job: the look the player remembers is
largely the *texture*, which is the user's. A new mesh wearing the existing
repaint should read as the same character.

**Related, not yet in the overlay:** ~44 champions currently wear one of four
shared CC0 stand-ins (`champ.sela` alone is worn by 18 unrelated heroes). Those
are not a licence problem — they are a *fidelity* problem, tracked in the model
audit — but they draw from the same budget of "characters that need real art".

## 2. Sound — 511 clips across 31 soundsets

`data/blizzard-overlay/sounds/<soundset>/*.wav`

Unit voice lines (What / Yes / Attack / Warcry / Death / Pissed) pulled from the
MPQs, bound as the champion-voice fallback for heroes with no map quip of their
own. **30 of the 40 overlay units map to a champion whose voice entry is
`source: "none"`**, i.e. the fallback is genuinely reachable and genuinely load-bearing today.

Resolution is **REPLACE**, and the route is already proven: the announcer and the
112 champion-name call-outs are machine-TTS we generate ourselves, deterministically,
from a manifest (`tools/tts-gen`). Champion voice lines can follow the same path.

Note the contrast: the map's **own 21 Chinese voice quips are the user's work and
ship**. Only the Blizzard fallback is debt.

## 3. Icons — 584 stock references, 168 orphans

The importer resolved an icon for **865** entries; **113 PNGs exist on disk**.

**CORRECTED 2026-07-22 (task #72).** This section used to read "695 stock / 2
map-custom", and both numbers were wrong. `695` is the count of entries whose
art path sits under `ReplaceableTextures\`, but **111 of those 695 are the map
author's own art hiding at stock-looking paths**. Archive MEMBERSHIP is the
test, never the path prefix — `extract_icons.py` has always known this, the
register did not.

| source | count | resolution |
| --- | --- | --- |
| `stock` — Blizzard, absent from the map archive | **584** | **REPLACE** |
| `archive` — map-custom art | **113** | **OURS** — extracted, wired, done |
| `no-art-field` — the w3x object never overrode its base icon | 152 | **REPLACE** |
| `no-wc3-source` | 16 | **REPLACE** |

**The extraction half is finished and was re-verified, not assumed.** All 584
stock rows were re-tested against `GoDieEX22s.w3x` with a wider candidate set
than the importer uses (`.blp/.tga/.dds/.png/.jpg/.bmp` plus a
`war3mapImported\` re-path): **0 new hits**. There is no more free art.

This is still the largest single count in the register and the only one with a
real money cost attached. The classification now lives in
`content/config/icon-plan.json`, regenerated from the live tree by
`tools/icon-gen/src/plan.py`, and is rendered in the codex's broken-data table:
**86 dropped** (never generate), **22 blocked** (third-party IP, awaiting a
human decision), **660 to generate** — of which **166 are tier 1**, reachable on
a live surface today. See `tools/icon-gen/README.md`.

## 4. Effect art — scale not yet measured

Ability effect art (`Abilities\Weapons\...`, `Objects\Spawnmodels\...`) is stock
Blizzard on the same footing as the icons. The count is not yet established
because the ability→effect binding itself is broken: **508 of 554 abilities (92%)
currently point at one generic fire placeholder**, so the real demand for effect
art is unknown until those bindings are reconstructed from the object data and
the JASS. Expect this section to grow.

---

## Why the gate holds

Worth writing down, because the whole register depends on it and it was proven
rather than assumed:

- A real production build (`vite build`) emits **zero** `.glb`, `.wav`, `.mpq` or
  `MANIFEST.json`. The dev-only gate compiles to a dead-folded `function(){return!1}` —
  no fetch to the overlay is even reachable from a prod bundle.
- Real nginx in Docker, in the production mount shape, returns **404** for every
  overlay path; only the dev shape serves them, with `no-store` and `noindex`.
- `.gitignore` covers `/data/**`; no Dockerfile `COPY` references it; the Helm
  chart ships only the two nginx configs.
- The `../data:/data` mount on the platform service was checked separately —
  the Go service has no static-file handler at all, so it cannot leak the overlay.

## The replacement route

The infrastructure exists and has been used end to end for three asset classes
already (icons, text, speech), all following the same shape: **the operator
supplies their own API key in the admin console, the key is stored server-side,
never returned and never logged, and stub mode is the default** so nothing breaks
without one. Music generation is queued behind the same seam.

The assistant never enters a key. Any batch large enough to cost real money
reports its exact item count and estimated cost for approval *before* it runs.

Two things that matter more than raw generation quality:

1. **Style consistency across a set.** Hundreds of icons generated one at a time
   with a drifting prompt look worse than the placeholders they replace. Pin one
   prompt template, one style prefix, one size, and review a contact sheet before
   committing a large run.
2. **Shrink the set before generating it.** Every entry that gets DROPped is
   cheaper and better than an entry that gets generated. Do the classification
   pass first.
