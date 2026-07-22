# w3x VERTEX COLOUR (tint) + alpha port — TODO

Task #49, content half. The GoDieEX22s importer parsed `war3map.w3u` but never read the
unit **art colour** fields (`uclr` / `uclg` / `uclb`), so every champion the map recoloured
shipped in the raw Blizzard / stand-in palette. 海克力斯 **Berserker** was the visible
symptom — 「黑紅」 in the map, a plain paladin in GGD.

**Where the fields live, and why.** `tint` (`[r,g,b]` 0..1) and `alpha` (0..1) go on
**`champion@1`** (and, as an override, on `skin@1`) — *not* on `model@1`:

- `modelKey` is **many-to-one**: `champ.sela` is shared by 18 champion docs and
  `champ.thorne` by 10, while the WC3 tint is a per-UNIT art field. A model-level tint
  would repaint every champion sharing the mesh. `model@1.teamTintMaterials` stays the
  model's business ("which materials accept a tint"); this is the champion's ("what colour").
- The blizzard-overlay champions — Berserker among them — have **no ModelDoc on disk**:
  `render/views/blizzardOverlay.ts` synthesizes one at runtime from
  `data/blizzard-overlay/MANIFEST.json`. A model-doc tint would be unreachable for exactly
  the champion this task is about.
- Precedent: `icon` (#33) is likewise per-champion, and mirrored onto the sim's
  `ChampionDef` so registry reads stay typed. `tint`/`alpha` follow that shape.

**Conventions** (documented on `zTintRgb` / `zAlpha` in `schema/common.ts`):
`tint` is a per-material **MULTIPLY** on the diffuse texture (`out.rgb = texture.rgb * tint`),
never an overlay or emissive; `[1,1,1]` is the identity and an **absent** field means the
same, so untinted docs stay untouched (93 of 113 champions). `alpha` is opacity —
`1`/absent = opaque, `<1` = translucent. Both are pre-normalised: static w3u values are
`0..255 / 255` (Berserker's `80` → `0.3137`) and runtime `SetUnitVertexColorBJ` values are
`0..100 / 100` with its 4th argument **inverted** (`alpha = (100 - transparency) / 100`).

**Normalisation gotcha:** a missing `uclr/uclg/uclb` is NOT implicitly 255 — it inherits the
base unit's stock `Units\UnitUI.slk` row, which is non-neutral for 193 of 836 rows. 43 units
in this map (incl. champions `godie-ecen`, `godie-e00s`, `godie-ubal`, `godie-u00j`) get a
non-neutral colour purely by inheritance; the ledger marks them `source: "slk-inherited"`.

**`content/config/unit-tints.json` (`config.unit-tints@1`)** is the porting ledger: all 52
extracted units (the 20 that became champions carry `championId` and must agree with the
champion doc; the other 32 are creeps/summons GGD has no collection for yet) plus the 24
runtime `SetUnitVertexColorBJ` states a champion takes on mid-match, each with its
`war3map.j` line. Two of those restores are flagged `erasesStaticTint` — **original-map
bugs** at `war3map.j:39537` (godie-nman) and `:47390` (godie-ogld) that reset the hero to
white and destroy its identity tint for the rest of the match. The port must restore to
`champion.tint`, never to white; Berserker's own restores (`:51694`, `:52027`) already do.

**Renderer half** (`apps/client/src/render/views/modelTint.ts`, wired through
`EntityViewRegistry`): `ChampionView`/`GameApp` are owned by #43, so the tint is applied
from the OUTSIDE via the two public seams the view already exposes (`view.root`,
`view.hasGlb`) — nothing in either file changed. Three things the implementation must not
get wrong:

- **Clone before you paint.** `AssetManager` caches one AssetContainer per .glb and every
  champion instantiates it with `cloneMaterials: false`, so N champions on one mesh SHARE
  one material object — writing the tint onto it would repaint all of them (the same
  many-to-one trap that kept `tint` off `model@1`). Every tinted material is cloned, tagged
  with its source, and restored by `releaseModelTint` before the view disposes, so material
  lifetime is byte-for-byte what it was pre-#49.
- **Colour space.** WC3 multiplies the DISPLAYED (gamma) texel. `StandardMaterial` (the
  procedural voxel fallback) is a gamma pipeline and takes the value verbatim, but
  `PBRMaterial` — what the glTF loader builds for every .glb — multiplies in LINEAR light,
  so a raw `t` renders at `t^(1/2.2)`. Measured live on Berserker's `Hapm.glb`: `0.3137`
  came out at **0.59** of stock. The PBR path therefore carries `t^2.2`, measured back at
  **0.39** (the residue is ambient + specular, which no albedo multiply can reach).
- **Never tint the team ring or blob shadow** — they are team/UI reads, not champion art.

The hit flash (#3) composes for free: it is a per-mesh render OVERLAY, a different channel
from the material colour, so a near-black Berserker still flashes.

Dummy-effect and missile unit tints are **not** here: those are per-invocation VFX art
params (task #50).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| vtint-01 | `champion@1` accepts `tint` (0..1 rgb **triple**) + `alpha` (0..1 opacity) and stays valid without either (the whole pre-#49 roster); rejects 0..255 channels, out-of-range values, 2- and 4-element tints, string colours, and a 0..100 WC3 transparency in `alpha` | tint-schema-champion | unit | done |
| vtint-02 | `skin@1` carries the same optional pair as an override, so an equipped skin can restate the colour or clear a tinted champion back to neutral with an explicit `[1,1,1]` | tint-schema-skin | unit | done |
| vtint-03 | 海克力斯 Berserker 黑紅: `godie-hapm.tint` is the extracted `[0.3137,0.3137,0.3137]` — non-neutral, non-white and genuinely dark (max channel < 0.4) — and the ledger carries its RED Q-buff state `[1,0.3,0.3]` (opaque) from `war3map.j:51668` plus both restore-to-grey states, which are what prove the dark rest colour | tint-berserker | unit | done |
| vtint-04 | all 20 extracted champion tints are present and value-exact; untinted champions keep the field ABSENT (never `[1,1,1]`), no champion carries `alpha` (every static w3u entry is opaque), every tinted champion still resolves its `modelKey`, and at least one modelKey is shared by a tinted AND an untinted champion — the case a `model@1` tint would have broken | tint-roster-values | unit | done |
| vtint-05 | `config.unit-tints@1` parses through the config union + loader, holds all 52 units with 4-char rawcodes and real evidence, every `championId` resolves and its tint EQUALS the champion doc's, `slk-inherited` entries exist, at least one runtime state has `alpha < 1` (`godie-ogld` 0.9, `godie-hart` 0.5), and exactly the two white-restore map bugs (`39537`, `47390`) are flagged against champions that actually own a static tint | tint-ledger | regression | done |
| vtint-06 | RENDERER HALF: `tint` applies as a per-material diffuse/albedo MULTIPLY (gamma-corrected `t^2.2` on linear PBR slots, verbatim on gamma-space Standard slots) and `alpha < 1` as alpha blending + `separateCullingPass`, on the procedural figure AND the late-arriving .glb; shared cached .glb materials are CLONED so one champion cannot repaint another, and released back before dispose; the team ring / blob shadow are never tinted; the #3 hit-flash overlay composes instead of fighting; a neutral/absent tint leaves every material untouched; skin `tint` overrides champion `tint` | tint-render-apply | integration | done |
| vtint-07 | BUFF HALF: the sim drives the `transient` states (Berserker's Q rage) and every expiry restores to `champion.tint`, never to white — the two `erasesStaticTint` map bugs must not be reproduced | tint-buff-restore | integration | pending |
