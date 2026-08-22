# tools/w3x-import — Warcraft III map importer

Imports a (protected) Warcraft III `.w3x` map into GGD content: extracts the
MPQ archive, recovers imported assets by name-mining (no `(listfile)` /
`war3map.imp` needed), converts MDX models to glTF `.glb`, and generates
schema-valid content drafts (champions, abilities, items, models, skins,
projectiles, arena).

## Usage

```bash
# full import into content/ (then rebuild indexes + validate)
python3 tools/w3x-import/import_w3x.py GoDieEX22s.w3x
pnpm content:build && pnpm content:validate

# dry-run: write everything under tools/w3x-import/out/<map>/ only
python3 tools/w3x-import/import_w3x.py map.w3x --no-content

# override the auto-extracted random-hero roster (rawcodes, whitespace/comma
# separated, '#' comments) — controls which ORIGINAL-table heroes are emitted
python3 tools/w3x-import/import_w3x.py map.w3x --roster my-roster.txt

# validate all produced .glb through Babylon NullEngine (headless)
cd tools/w3x-import && pnpm i && pnpm validate:glb

# gate suite (registered as `w3x-import-unit` in tools/testrunner/suites.yaml)
cd tools/w3x-import && pnpm test

# read-only archaeology over the ALREADY-EXTRACTED source map (out/GoDieEX22s-src/):
python3 tools/w3x-import/extract_emitters.py            # MDX PRE2/RIBB emitters -> out/emitters/
python3 tools/w3x-import/extract_invocation_params.py   # JASS art params -> out/invocation-params/
python3 tools/w3x-import/build_vfx_bindings.py          # merge both + stock/buff/summon -> out/vfx-bindings/
python3 tools/w3x-import/extract_jass_spells.py         # per-spell JASS slices -> out/GoDieEX22s/jass-spells/
python3 tools/w3x-import/extract_jass_spells.py --check # byte-exact staleness gate (read-only)
python3 tools/w3x-import/extract_jass_spells.py --stats # coverage JSON, writes nothing
```

`extract_jass_spells.py` is **trigger-family driven** (GH#542). It enumerates every
`InitTrig_<base>` in the map script and takes the whole `Trig_<base>_*` family as one unit,
rather than looking up a list of rawcodes harvested from `content/`. That distinction is the
whole point: the artifact it replaces was content-driven, so it only ever *considered* 128
rawcodes out of the 317 the script actually dispatches, and it shipped 67 slices — missing
79% while looking completely normal. The script that produced it was never committed, so
nothing could re-run or audit it. Family grouping picks up, for free, the three shapes a
rawcode lookup drops: forwarded condition chains (`Trig_X_Func001C` never names the rawcode),
damage/attack/death-event passives that only gate on `GetUnitAbilityLevel`, and families
bound to their caster through a `udg_*` global.

Slices are keyed on two axes. `<RAWCODE>.j` covers all 317 dispatched ability rawcodes.
`unit-<RAWCODE>.j` covers **hero-activation clusters** — a hero's signature triggers often
carry no ability rawcode at all and are armed from outside by a trigger gating on the hero's
*unit* rawcode (Saber's 理想鄉 `Trig_ExcaliburMAX_*` binds through `udg_saber` and is enabled
by `Trig_Open_Skill_of_Saber_Actions`, which tests `GetUnitTypeId(...) == 'E002'`). Source is
`out/GoDieEX22s-src/raw/war3map.j` — the unprotected map, whose rawcode set is a strict
superset of the obfuscated `GoDieEX22s/raw/scripts__war3map.j` the old artifact read.
Guard: `packages/shared/src/ops/jassExtractionCoverage.test.ts`.

`extract_invocation_params.py` recovers what the object data cannot express: the per-cast
scale / tint / alpha / fly height / facing / animation clip / playback rate / spawn offset /
lifetime that the map's GUI-compiled JASS applies to each spawned effect, attributed to the
ability that spawns it. Every value is tagged CONFIRMED / INFERRED / UNRESOLVED, and the run
asserts that every art-creating call in `war3map.j` landed in the dataset.

`build_vfx_bindings.py` is the one the renderer consumes. It joins the two datasets above
into `out/vfx-bindings/VFX_BINDINGS.json` — ability rawcode → art per slot → emitter params
per model → per-cast overrides → attach points — and adds three art channels neither source
had: **inherited stock art** (`war3map.w3a` stores only overrides; the rest falls through to
`Units\*AbilityFunc.txt` inside the retail MPQs), the **buff channel** (`war3map.w3h`, the
only visual most passives have), and **summoned-unit art** (a summon's whole visual is the
unit it creates, reskinned in `war3map.w3u`). It also bridges w3a rawcodes to
`content/abilities/*.json` doc ids by three independent methods and prints a per-doc
coverage scoreboard. Schema and provenance: `out/vfx-bindings/VFX_BINDINGS.md`.

Python deps: `python3` ≥3.10 with `mpyq` and `Pillow`
(`pip3 install --user mpyq Pillow`). Node side only needs the workspace
install (`pnpm i`).

## Outputs (`out/<map>/`)

| path | content |
| --- | --- |
| `raw/` | every recovered file from the archive (`\` → `__` in names) |
| `inventory.{json,md}` | full extraction inventory + how each name was recovered |
| `parsed/{heroes,units,abilities,items}.json` | object data with TRIGSTR-resolved Chinese text |
| `parsed/{heroes,units}_original.json` | ORIGINAL-table w3u entries (standard Blizzard rawcodes modified in place) |
| `parsed/random_pool.json` | the map's random-hero rawcode pool auto-extracted from the JASS script (the content `config` schema set is frozen, so the pool is not written into `content/config/`) |
| `glb/`, `textures/` | converted models (glTF 2.0) + decoded PNG textures |
| `models_report.json` | per-model: kind, scale factor, clips, missing textures |
| `drafts/` | docs that could NOT go into `content/` (e.g. hero without model) |
| `import_report.json` | champions/skins/items written + per-ability mapping notes |
| `REPORT.md` | human-readable import report (Chinese) |

## Pipeline internals (`w3xlib/`)

1. **`mpq.py` + `explode.py`** — MPQ reader on top of `mpyq`, adding file
   decryption (incl. `FIX_KEY`), a pure-python PKWARE DCL *explode* port
   (zlib contrib `blast.c`), and StormLib-order multi-compression masks
   (bz2 → pkware → zlib). Also slices the `HM3W` w3x wrapper at `0x200`.
2. **`extract.py`** — name recovery for protected maps: known `war3map.*`
   names + every asset path found in object-data string mods and the JASS
   script, then a fixpoint over MDX `TEXS` texture references. Unmatched
   block-table entries are counted (MPQ stores only hashes — not reversible).
3. **`objdata.py` / `wts.py` / `stats.py`** — w3u/w3t/w3b/w3h (flat) and
   w3a/w3d/w3q (leveled) object files; TRIGSTR resolution.
4. **`mdx.py` / `blp.py` / `gltf.py` / `models.py`** — MDX v800 parser,
   BLP1 decoder (JPEG variant stores inverted BGRA; paletted variant),
   glTF writer (skins from matrix groups, one animation per WC3 sequence,
   Hermite/Bezier resampled at 30 fps to LINEAR). Axis/scale conversion is
   baked into vertex/animation data: `(x,y,z) → s·(x,z,−y)`.
5. **`drafts.py`** — WC3 hero/ability/item numbers → GGD docs. Scale factors:
   distance ×11/600 (WC3 600 range = GGD 11), move speed 270–522 → 5.5–8,
   HP `(uhpm+25·STR)×0.8`, AD `dice-average + primary attribute`,
   attack speed `1/ua1c`. Ability base-rawcodes map through an archetype
   table (~60 entries: storm bolt → targeted nuke+stun, shockwave →
   piercing skillshot, thunder clap → self-centered ground AoE, wind walk →
   move-speed buff, blink → dash, …). Summon/illusion/'channel' abilities
   can't be represented — they become placeholder nukes and are listed in
   `import_report.json` notes.
   Champions come from the w3u CUSTOM table **plus** ORIGINAL-table entries
   (standard hero rawcodes modified in place, e.g. a renamed `Hpal`) that
   appear in the map's random-hero roster. The roster is auto-extracted from
   the JASS script (`w3xlib/pool.py`: largest `set arr[i]='Xxxx'` rawcode
   array, indices decimal or `$hex`) and can be overridden with `--roster`.
   Fields the map never modified keep WC3 standard values, filled from the
   approximate per-hero level-1 defaults table `STANDARD_HERO_DEFAULTS`
   (universal WC3 hero constants: HP 100, mana 0, damage 1+2d5). Original
   heroes on Blizzard stock models (`units\...` — not extractable) get a
   deterministic best-fit stand-in from the already-imported models
   (`STANDIN_MODELS`, falls back to `champ.thorne`/`champ.sela`), flagged
   with the `standin-model` tag (原模型為暴雪內建,以現有模型代替).
6. **`maps.py`** — `war3map.wpm` pathing grid → the two largest open discs
   become the two duel zones (obstacle circles from unwalkable clusters);
   `war3map.doo` doodads inside those discs become decor entries.

## Team color & other approximations

- Team-color/glow layers (replaceableId 1/2) get a neutral gray texture and
  the material is named `TeamColor*` + listed in the model doc's
  `teamTintMaterials`.
- Model-attached particle emitters / ribbons (`PREM/PRE2/RIBB`) are skipped.
- Geoset animations (`GEOA` per-sequence visibility) are not applied.
- Global-sequence tracks are left static.
