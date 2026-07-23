# Task #162 — "站立時飛上天" idle root-motion float (roster sweep + fix)

_黑崎一護 (`imported.heroichigo`) shot up into the sky while standing. Root cause
was a corrupt root-bone keyframe in its idle clip; this is a sweep of every
roster model for the SAME defect class and the surgical re-bake that fixed it.
Reads shipped `.glb` bytes + the model docs directly — no Babylon. Regenerate the
census with `tools/w3x-import/float_sweep_162.py`._

## The defect class

`ChampionView.tryUpgradeToGlb` grounds every imported rig **once, in bind/rest
pose**: it height-normalises the model (`TARGET_HEIGHT / nativeH`), measures the
skinned bounding box, and shifts `glbRoot.y = -min.y` so the lowest vertex sits
on the arena floor (`y=0`). It **then** plays the idle clip (looping). Grounding
therefore assumes _idle pose ≈ bind pose_. If the idle/stand clip carries a
**skeleton-root TRANSLATION** whose Y climbs above the bind value, the whole
skinned figure lifts off the floor the instant the clip starts — the model flies
up. This is the animation-data sibling of the #61/#77 static grounding
(`mdl-63`): grounding fixes the bind pose, but a rising idle-clip root track
defeats it per-frame.

**Signal.** For each glb: find the skeleton **root joint** (the joint whose
subtree contains the most other joints — the one that rigidly carries the body),
resolve the idle clip from the model doc's `clipMap.idle`, read that joint's
translation-Y track, and measure `driftNative = max(Y) − min(bindY, Y₀)`. World
drift ≈ `driftNative × TARGET_HEIGHT / nativeH`.

## Headline

| | |
| --- | --- |
| Roster champions swept (`imported.*`) | **51** |
| Champions that float at rest | **1** — `heroichigo` (+4.85 world units up) |
| Champions fixed | **1** — `heroichigo` (re-bake) |
| Next-worst roster champion | `horse` +0.056u (a natural idle shift, < 0.15u) |
| Render-side change needed | **none** — data-only fix |

## 黑崎一護 `heroichigo` — the fix

- **Root joint** `bone_waist` (node 39, directly under `Armature`; parent of the
  legs, chest, arms and head — it rigidly carries the entire body). Bind
  translation `(-0.0763, +1.1460, -0.0026)`.
- **Defect.** The four stand-pose clips pin `bone_waist` to a single corrupt
  keyframe `(+1.3553, +6.3865, -0.0026)`:
  - `stand` — the clip `clipMap.idle` (and `hurt`) resolves to
  - `stand 2`, `stand alternate`, `stand alternate 2` — same corruption
  - `+6.3865` vs bind `+1.1460` = **+5.2404 native** lift; at the model's
    normalise scale (`1.8 / 1.946 ≈ 0.925`) ≈ **+4.85 WORLD units** into the sky.
    The keyframe's X is _also_ garbage (`+1.3553` vs bind `−0.0763`, a +1.43-unit
    lateral shove); only Z already matched bind.
  - The healthy idle `stand ready` (unused by the clipMap) sits at `bone_waist.y
    ≈ 1.02–1.09`, confirming the ≈1.1 band is correct and 6.39 is garbage.
- **Fix** (`tools/w3x-import/flatten_root_float.py`). Each corrupt track is a
  **single constant keyframe** in its own dedicated 12-byte bufferView
  (unshared) — there is no horizontal MOTION to preserve, only a corrupt constant
  offset — so the faithful grounded value is the node's **bind translation**. The
  three floats are overwritten in place with the bind translation, zeroing BOTH
  the +5.24 vertical float and the +1.43 lateral shove. **32 bytes changed**
  (4 clips × X,Y floats; Z already bind), file size and every other byte
  identical; node/mesh/skin/animation counts unchanged (62 / 1 / 1 / 19). GLB
  re-validated; idempotent (re-run is a byte-level no-op). The `dissipate`
  death-poof (which also rises to 6.39 but is never played as idle) is left
  untouched.

## Roster sweep — idle root drift (world units)

Every champion except `heroichigo` was already grounded. Post-fix `heroichigo`
joins them at 0.000.

| model | idle clip | root joint | driftNative | driftWorld | verdict |
| --- | --- | --- | --- | --- | --- |
| heroichigo (pre-fix) | stand | bone_waist | +5.240 | **+4.847** | FLOATED → **fixed** |
| heroichigo (post-fix) | stand | bone_waist | +0.000 | +0.000 | grounded |
| horse | Stand -1 | Bone HorseBONE_ABDOMEN | +0.053 | +0.056 | grounded (idle shift) |
| zy3 | Stand | Bone_Root | +0.034 | +0.036 | grounded |
| hzyn | Stand | Bone_Root | +0.033 | +0.035 | grounded |
| rabbit | Stand | Bone_Root | +0.001 | +0.001 | grounded |
| _(other 46 roster champions)_ | Stand* | Bone_Root/Pelvis | +0.000 | +0.000 | grounded |

## Non-roster models with a rising idle root (out of scope — NOT touched)

These are effect / projectile / summon models, not standing champion figures
grounded on the arena floor. Their upward root motion is either intended
(flying) or irrelevant (attached VFX). Listed for completeness; none is a
`content/champions` `modelKey`.

| model | idle root Δ (world) | why it's not a defect |
| --- | --- | --- |
| `enchant` | +4.59 | enchant spell effect (Dummy01 rises) |
| `firefly` | +1.98 | firefly particle model |
| `darkraor` | +0.68 | root is `Bone_Rocket` — a projectile |
| `bahamut` | +0.61 | flying summon — floating idle is intended |
| `heronarutos4effect` | +0.56 | naruto effect orb |
| `heroryuk` | +0.12 | not roster-referenced (documented `+X` flip, `mdl-68-01`) |

## Guard

`packages/shared/src/content/modelIdleGrounding.test.ts` (glb-bytes style, like
the `modelGeosetAlpha` guard):
- pins `heroichigo`'s four stand-pose clips grounded at bind Y (no upward drift
  beyond ε=0.15u), that `clipMap.idle` still resolves to `stand`, and that the
  motion clips (`Walk`/`death`/`dissipate`) and the node/skin/animation counts
  are untouched;
- a **roster-wide backstop**: every `imported.*` champion's idle-clip root drift
  stays under 0.4 native units, so a future re-import that reintroduces a
  floating idle on ANY champion fails loudly.

Verified the guard FAILS on the pre-fix (corrupt) glb and PASSES on the fixed
one. `pnpm --filter @ggd/shared test` model guards (`modelIdleGrounding` /
`modelGeosetAlpha` / `modelBbox` / `modelScale`) all green.
