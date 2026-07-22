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
```

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
