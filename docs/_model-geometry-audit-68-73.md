# Tasks #68 / #73 — model ORIENTATION + GEOMETRY cleanup (roster sweep)

_Fresh sweep over every champion-referenced .glb. Job A (geometry) = strip the
same class of always-on effect artifact 索隆 had; Job B (orientation) = audit
each model's native forward axis vs the roster norm. Reads shipped .glb bytes +
raw MDX (GEOA/KGAO) directly — no Babylon. Regenerate the census with
`tools/w3x-import/geoset_alpha_report.py` and the scratch sweep it wraps._

## Scope & method

- **51 imported champion models** (`imported.*`) + **4 KayKit voxel stand-ins**
  (`champ.sela/thorne/skin.*`) — every model a `content/champions/*.json`
  `modelKey` points at (113 champions). `imported.collision` is the geometry-less
  WC3 dummy (procedural fallback) and is exempt.
- Job A signal: for every shipped primitive, map it back onto its raw-MDX geoset,
  read the real **texture path** + the **KGAO alpha across every sequence**, and
  classify: `on`/`noKGAO` = intended always-on in WC3 (KEEP), `cond` = shown only
  in some sequences, `ALWAYS-OFF` = WC3 hid it in EVERY sequence yet it ships
  permanently-on because the importer drops GEOA (the 索隆 artifact class).
- Job B signal: each model's **lateral axis** from the Foot-Left/Right (fallback
  Hand-L/R) attach-point split in its doc; the forward axis is the other planar
  axis. Cross-checked against `apps/client/src/render/views/glbFacing.ts`, the
  single authoritative facing convention.

## Headline

| Class | Found | Action |
| --- | --- | --- |
| **always-on whirlwind (Tornado2b)** | **1** (`herohehi`) | **STRIPPED** — user-reported 飛影 whirlwind |
| **always-on decay-gore splat** | **1** (`linkstik`) | **STRIPPED** — gutz.blp, never-played Decay clips |
| effect geosets tied to a PLAYED clip / real silhouette | 8 | **candidate, NOT stripped** (documented below) |
| intended always-on geometry (WC3 also always-on) | 3 (`picacugy` firering, `gumdam` glow, `lubu` halberd) | kept — not artifacts |
| stray `TeamGlow*` ground billboards | 36 | already stripped by #73 `strip_teamglow.py` (guarded) — 0 remain |
| **un-merged object-data sphere (`Asph`) attachments** | **20 rows / 16 bodies** | ⚠️ **THIS AUDIT NEVER LOOKED FOR THEM — see #267.** Its two censuses cannot see this class by construction: `DUMMY_ORB_MAP.json` is `generated_from war3map.j` (JASS only) and 孫悟空's head is declared in `war3map.w3a` object data, while `geoset_alpha_report.py` reads GEOA inside a SINGLE glb and the head is a SEPARATE FILE (`Gokuhead.mdx`). The line below that files 孫悟空 under "40 other imported.* … clean" is **wrong**: he had no skull at all — 0 of body256's 817 vertices weighted to `Head`. Fixed 2026-07-26 by `w3xlib/models.py::load_sphere_attachments` + `merge_sphere_attachments.py`; 3 first-tier candidates remain (Goku3head → #119/#249, HeroFateZemberForm, 1hswd_01) |
| orientation outliers vs roster norm | **0** | none — apply nothing (evidence below) |

## Job B — orientation audit (no defect found)

**The roster faces consistently; no correction was applied.**

- **Roster norm.** All **43** imported champions that carry Foot-L/R attach data
  split laterally on **Z** → forward axis = **X**; the 8 without foot data
  (`bulbasaur`, `collision`, `heroxelloss`, `linainvers` have no L/R attach pair;
  `herogirl`, `herokunoichi`, `herorider`, `kikyou` split on Hand-L/R, also **Z**).
  **Zero** models split laterally on X. The 4 KayKit stand-ins are the native
  family (forward **+Z**).
- **Matches the existing convention.** `glbFacing.ts` already establishes,
  end-to-end through the Babylon load path, that the w3x-imported family bakes
  forward **-X** (given the imported `+90°` yaw offset) and the native/KayKit
  family bakes forward **+Z**. This audit's axis measurement corroborates that
  from the bind-pose attach geometry, independently.
- **The one documented sign-flip is not roster-active.** `glbFacing.ts` lists
  `imported.heroryuk` as the sole model whose baked forward is **+X** (180° off
  its family) via `FLIPPED_IMPORTED_MODEL_KEYS`. `heroryuk` is **not** referenced
  by any champion (confirmed against the roster), so it never reaches an in-arena
  `ChampionView`; the note is kept for correctness only. `imported.heropika` was
  re-confirmed NOT flipped (its Hand nodes are mislabeled, body geometry is -X).
- **Per-clip orientation** (idle/run/hurt face-down, attack/cast inverted) was the
  separate #68 defect, already fixed by `fix_clip_orientation.py` (19 models / 26
  clips) and guarded in `tools/w3x-import/test/champion-model-guard.test.ts`.

**Verdict: `ok` for every model. No `facingOffsetDeg` field was added and
`ChampionView`/`EntityViewRegistry` were left untouched** (task #150's
height-normalization + grounding preserved). A data-driven yaw offset would only
duplicate `glbFacing.ts`, which already covers the whole roster correctly.

## Job A — geometry: the two strips (same class as 索隆's Tornado2b)

Both applied by adding a job to `tools/w3x-import/strip_geoset_prims.py` (mark &
sweep of the effect primitive + its now-orphaned material/texture/image, skeleton
+ animations untouched) and pinned in
`packages/shared/src/content/modelGeosetAlpha.test.ts`.

### 邪眼師 飛影 — `imported.herohehi` (godie-u010 / godie-uvng) — user-reported

The **same katana rig as 索隆** (shares the `whirlWindDummy` joint). It carried
the **identical `Textures\Tornado2b.blp`** whirlwind: a 20-vertex / 10-tri cross
billboard, half-width **2.57u** around a 1.7u hero. Its KGAO alpha is **0.0 in
every one of its 9 sequences** — WC3 never showed it via the model itself (the
邪王炎殺黑龍波 / 黑龍 whirlwind was cast-driven) — yet it shipped permanently-on
because GEOA is dropped. This is exactly the artifact the user reported twice.

| | before | after |
| --- | ---: | ---: |
| primitives | 4 `[604,186,20,89]` | **3 `[604,186,89]`** (tornado gone) |
| materials | 4 | **3** |
| images | 3 | **2** (Tornado2b image swept) |
| nodes | 30 | 30 (unchanged — `whirlWindDummy` kept) |
| animations | 9 | 9 (all kept) |
| full-bbox height | 1.700u | 1.700u (tornado sat inside the body Y) |

Re-add path: it can become a real cast-gated VFX at `whirlWindDummy`, exactly
like `apps/client/src/vfx/WhirlwindFx.ts` did for 索隆 — flagged for the VFX wave,
out of this task's owned set.

### 時空勇者 林克 — `imported.linkstik`

A 41-vertex / 24-tri `Textures\gutz.blp` ground-gore splat (wide flat quad,
half-width 1.05u at y 0.04–0.26). WC3 showed it **only in the post-death
"Decay Flesh"/"Decay Bone"** sequences, which the clipMap **never plays**
(death→"Death"); GEOA dropped ⇒ it shipped stuck under Link's feet at all times.
Pure gore effect texture, no legitimate on-screen use, no re-add needed. Link's
held sword (a ~1.05u-wide OPAQUE geoset) is not an effect and is kept.

| | before | after |
| --- | ---: | ---: |
| primitives | 7 `[196,105,41,12,25,154,24]` | **6 `[196,105,12,25,154,24]`** (gore gone) |
| materials | 5 | **4** |
| images | 4 | **3** (gutz image swept) |
| nodes | 41 | 41 (unchanged) |
| animations | 10 | 10 (all kept — incl. the never-played Decay clips) |
| full-bbox height | 1.700u | 1.700u (gore sat at the feet) |

## Job A — candidates flagged but NOT stripped (conservative)

These are GEOA-conditional geosets that are **tied to a clip the game actually
plays**, or are **real body/weapon silhouette**, so stripping would remove
something the player legitimately sees. Listed rather than risked:

| model | geoset | why NOT stripped |
| --- | --- | --- |
| `imported.heroichigo` | 3 body-texture geosets (540/739/134v), `ALWAYS-OFF` | uses Ichigo's OWN texture — an alternate transform/Bankai BODY, not effect geometry; needs a merge/gating study, never a blind strip (would delete real silhouette) |
| `imported.negi` | star3/Star9 sparkles (8/10/16/14v) | shown in the PLAYED Attack/Spell clips; the 66v `negi.blp` geoset is his 白色之翼 WING silhouette — kept |
| `imported.pika` | Star3 + LightningBall (16/4v) | the lightning is the PLAYED-attack effect; only the tiny 4v `pika.blp` quad (never-played "Dissipate") is a pure artifact, too minor to risk |
| `imported.heromiku` | 17v body-atlas geoset | shown only in never-played "Attack Slam", but uses the body atlas — ambiguous body part, low value/high risk |
| `imported.gumdam` | IronGolem 85v geoset | shown in the PLAYED Death clip (death wreckage). `Green_Glow2` cockpit glow is `on` in WC3 too — intended, kept |
| `imported.picacugy` | picacu.blp 4v poof | shown in the PLAYED Death clip. The `firering4` base ring is `noKGAO` (always-on in WC3 too) — intended flavour, kept |
| `imported.kikyou` | 14v `kikyou.blp` geoset | shown in the PLAYED attack ("attack - 1") — her drawn bow, body texture, kept |
| `imported.herotoshiiemaeda` | 75v body geoset, hw 2.12u | body-texture spear/weapon silhouette (does not inflate height) — kept |

## Per-champion table

`fwd` = native forward axis · `orient` = orientation verdict · `geom` =
geometry status (see above). All imported = forward **-X** (norm); KayKit = **+Z**.

| model | champs | fwd | orient | geom |
| --- | ---: | :-: | :-: | --- |
| `imported.herohehi` | 2 | -X | ok | **STRIPPED** Tornado2b whirlwind (4→3 prim, 4→3 mat, 3→2 img) |
| `imported.linkstik` | 1 | -X | ok | **STRIPPED** gutz decay-gore (7→6 prim, 5→4 mat, 4→3 img) |
| `imported.heroichigo` | 2 | -X | ok | candidate — always-off transform body geosets |
| `imported.negi` | 2 | -X | ok | candidate — attack sparkles (wing kept) |
| `imported.pika` | 1 | -X | ok | candidate — attack lightning / Dissipate quad |
| `imported.heromiku` | 1 | -X | ok | candidate — Attack Slam body-atlas geoset |
| `imported.gumdam` | 1 | -X | ok | candidate — Death debris (glow intended) |
| `imported.picacugy` | 1 | -X | ok | candidate — Death poof (firering intended) |
| `imported.kikyou` | 1 | -X | ok | candidate — attack bow (kept) |
| `imported.herotoshiiemaeda` | 1 | -X | ok | candidate — spear silhouette (kept) |
| `imported.heromusashimiyamoto` | 3 | -X | ok | clean (Tornado2b stripped #59, TeamGlow2 stripped #73) |
| all other `imported.*` (40) | — | -X | ok | ⚠️ "clean" here means **only** "no stray TeamGlow / effect geoset" — it is NOT a statement that the body is complete. `imported.goku` was in this bucket while shipping with **no head** (#267). A completeness claim needs a PRESENCE measurement; see `packages/shared/src/content/modelHeadGeometry.test.ts` |
| `champ.sela` | 18 | +Z | ok | clean (KayKit reference) |
| `champ.skin.barbarian` | 8 | +Z | ok | clean (KayKit reference) |
| `champ.skin.rogue` | 6 | +Z | ok | clean (KayKit reference) |
| `champ.thorne` | 10 | +Z | ok | clean (KayKit reference) |

## Non-champion note (out of scope, VFX wave)

The GEOA census also flags several models NO champion references
(`hero-turtle`, `heroeva01s2`, `heroraichus3`, `heroryuk`, `konyui`,
`darkraor`, `blackhole1`, effect/tornado models) with stuck effect geosets —
including the same `gutz.blp` decay geoset on `hero-turtle`. They belong to the
VFX wave (#98), not this champion sweep, and are left untouched.

## Tools

- `tools/w3x-import/geoset_alpha_report.py` — GEOA/KGAO stuck-effect census
- `tools/w3x-import/strip_geoset_prims.py` — the strip mechanism (now 3 jobs:
  索隆 Tornado2b, 飛影 Tornado2b, 林克 gutz gore)
- `packages/shared/src/content/modelGeosetAlpha.test.ts` — guard: each effect
  prim + its texture gone, skeleton/attach nodes + all animations survive
- `apps/client/src/render/views/glbFacing.ts` — the authoritative facing
  convention (unchanged — Job B found no defect)
