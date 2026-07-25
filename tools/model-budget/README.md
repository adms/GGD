# tools/model-budget — the model budget, its import guard, and the offline optimiser

The budget page (`apps/client/public/model-budget.html`) and its generator
(`emit_report.ts`) answer *"is the game over budget, and where?"*. This directory
also carries the two tools that act on that answer at the moment it matters:

| tool | question | file |
| --- | --- | --- |
| **guard** | does THIS model fit its role's budget, right now, as it enters? | `guard.ts` |
| **optimiser** | make the models that are over threshold fit — safely, reversibly | `optimize.ts` |

Both read the **same budget** as the page: the per-import `GATES` in `limits.ts`
(every number carries its arithmetic), and the traced role of each model from the
generated `content/assets/model-budget/report.json`. There is one budget, and
three tools that consult it.

---

## 1. The guard — catch it at import, not in a profiler

```sh
# gate a freshly-converted model (the importer knows the role it is assigning)
pnpm --filter @ggd/model-budget budget:guard tools/w3x-import/out/<map>/glb --role champion

# survey existing content (roles auto-resolve from report.json)
pnpm --filter @ggd/model-budget budget:guard content/assets/models/champions

# machine-readable
pnpm --filter @ggd/model-budget budget:guard <path> --role champion --json
```

For each `.glb` the guard measures the four gated axes — per-instance triangles,
mesh/draw-call count, largest texture edge, per-frame animation channels — scores
them against the role's gate, and prints the exact remedy for each breach:

```
guardian_skeleton.glb  role=champion (--role)  → OVER
    ok  每實例三角面        6952  warn 16000 / limit 28000
  OVER! 每模型 mesh/draw call  15  warn 3 / limit 5    → manual: 合併同材質 primitive (playbook 步驟 1)
  WARN  貼圖最長邊 (px)      1024  warn 512 / limit 1024 → optimise 貼圖 1024→512px (VRAM ↓75%)
  OVER! 每幀動畫通道           123  warn 35 / limit 55   → manual: 擺設應無骨架 / 烘焙精簡動畫
```

Exit code: **1** on any breach, **0** clean (or `--warn-only`), **2** if a role
cannot be resolved and no `--role` was given — it will not guess. The texture and
triangle breaches route to the optimiser below; draw-call and channel breaches are
flagged for the manual playbook, because a batch job cannot fix them without
changing what the model *is* (merging primitives, dropping a skeleton), and
pretending otherwise would be the worst kind of green check.

### guard vs `budget:check`

They are different moments, not duplicates. **guard** is point-of-import and
file-level: "does this one fit?". **`emit_report --check`** is the CI ratchet:
"did the whole tree regress past an accepted baseline?" — it stays quiet on
today's known stand-in debt (#81) and fires only on a *new* regression. Run guard
against existing content and it will of course also show that known debt; that is
why `--warn-only` exists.

### wiring into the import pipeline

`tools/w3x-import/import_w3x.py` converts MDX → `.glb` and writes content drafts.
The guard is designed to run on its staging output:

```sh
python3 tools/w3x-import/import_w3x.py map.w3x
pnpm --filter @ggd/model-budget budget:guard tools/w3x-import/out/<map>/glb --role champion   # ← gate
pnpm content:build && pnpm content:validate
```

It is a standalone step rather than an edit to the importer on purpose: several
sessions are in `tools/w3x-import` right now, and a gate that lives in its own
package cannot be broken by their churn.

---

## 2. The offline optimiser — resize textures, decimate geometry, never destructively

```sh
# DRY RUN (default): list exactly what would be processed + the predicted saving
pnpm --filter @ggd/model-budget budget:optimize content/assets/models/champions --role champion

# WRITE the results to a separate review tree (originals untouched)
pnpm --filter @ggd/model-budget budget:optimize content/assets/models/champions --role champion --apply

# also decimate geometry over the triangle gate (needs the one extra dep, below)
pnpm --filter @ggd/model-budget budget:optimize <path> --role arena-decor --geometry --apply

# confirm the output loads through the real Babylon loader
pnpm --filter @ggd/model-budget budget:optimize <path> --role champion --apply --babylon-verify
```

### The one rule that is not negotiable

This repo has **no version control** (#65) and a destructive pipeline has already
eaten irreplaceable files once (the BGM render overwrote the 魔王魂 originals). So:

- **Never in place.** Output goes under `--out` (default
  `tools/model-budget/optimized-out/`), mirroring the content path. The original
  bytes are never opened for writing — the test suite asserts the source hash is
  unchanged after `--apply`.
- **Idempotent & resumable.** Each output carries a `<out>.opt.json` hash sidecar
  (sha256 of the source bytes + the exact plan), exactly as `tools/tts-gen` does.
  A rerun skips anything already produced from the same source with the same plan;
  `--force` regenerates.
- **Reviewable before adoption.** `--apply` writes an `optimize-manifest.json` in
  the out tree listing every model, its before/after VRAM, and its verification
  result. **Adoption is a separate human act:** review the tree, then copy what you
  accept over the originals yourself. The optimiser does not, and will not, do that
  copy.

### What each stage does, and what it costs in dependencies

**Texture stage — ZERO new dependencies.** It resizes oversized textures with
**ffmpeg** (already required by `tools/tts-gen` and `tools/bgm-gen`, and
arm64-native here), targeting the role's warn edge (e.g. a champion's 1024²
palette → 512², a 4× VRAM cut). The glb is rebuilt in pure TS (`glb.ts`) with
every geometry, skin and animation byte copied verbatim; `geometryDiff` then
*proves* only image bytes moved, and the sidecar records
`textureStageGeometryIdentical: true`. This is the high-value path: the budget's
binding axis is texture VRAM, not triangles (see `limits.ts`).

> Two honest notes. (a) This ffmpeg build has no webp *encoder*, so a webp source
> is re-encoded to png — VRAM, the budget axis, is unaffected by the container;
> the size change is recorded. (b) ffmpeg emits truecolor PNG, so a re-encoded
> 512² file can be a few KB *larger on disk* than a heavily-indexed 1024² source.
> Disk bytes are explicitly "a useless proxy" in `limits.ts` (a 384 KB atlas is
> 133 MB of VRAM); the tool optimises the axis that binds. For a disk-only follow
> up, `pngquant` on the out tree preserves the palette — but it is not the point.

**Geometry stage — needs one extra dependency, installed in isolation.**
Skin-preserving decimation needs `@gltf-transform/core`,
`@gltf-transform/functions` and `meshoptimizer`, which are **not** in the
workspace. Adding them to a `package.json` would rewrite `pnpm-lock.yaml` (shared
by several sessions) and break `pnpm install --frozen-lockfile` in CI. So they go
into `.optvendor/` via plain npm, which pnpm neither sees nor manages:

```sh
pnpm --filter @ggd/model-budget budget:optimize:setup-geometry   # ~5s, pure JS/wasm
```

meshoptimizer's simplifier is **skin-aware** — it carries `JOINTS_0`/`WEIGHTS_0`
through the collapse and leaves the skeleton and animation channels alone. Every
decimated candidate is then checked for **rig survival** (`rig.ts`: skins, joints,
clips, channels, weight attributes, and that triangles actually dropped) and
**rejected, not written**, if anything changed. If the dep is absent the stage
prints the bootstrap command and skips. **It never falls back to Babylon's
simplifier**, which cannot preserve skin weights — a decimator that destroys a rig
is worse than the oversized model it replaced.

> Verified end to end (on the since-retired `knight.glb`): 6952 → 4033 tris with 41 joints / 76 clips /
> 8712 channels unchanged, loading cleanly through the repo's own
> `tools/w3x-import/validate_glb.mts` Babylon loader.
>
> Those clip/channel figures are PRE-TRIM. `trimClips.ts` has since cut
> `knight.glb` to 16 clips / 1,873 channels. NOTE: owner directive #226 deleted
> those four stand-ins outright — generated ~168-triangle box-men replaced them,
> see `tools/voxel-gen` — so this paragraph is a worked example, not current
> state; the decimation result above is
> unaffected (it is a triangle-count claim), but do not quote 76/8712 as the
> file's current shape.

### What the current tree looks like through this tool

The budget already told us triangles are not the bottleneck, and the optimiser
confirms it: on today's assets the **texture** stage has 24 real candidates
(the four KayKit stand-ins at 1024², 19 arena-decor models, one intermission prop
over the hard limit) — the four champions alone are a **16 MB** VRAM saving. The
**geometry** stage has only 2 candidates over any triangle gate. This is the
finding, made actionable: spend the effort on textures.

---

## Seams with adjacent work

- **#102 (後台管理).** The optimiser writes `optimize-manifest.json` in the out
  tree in the same shape as `report.json`, so the admin page can show a
  before/after review surface without re-measuring. This tool never writes into
  `content/assets/models`, so it cannot collide with the page's reads.
- **#115 (LOD tiers) / #116 (model replacement).** Those own the *runtime* quality
  swap and the `xxx-mid`/`xxx-small` naming + per-model licence proof. This
  optimiser deliberately stays out of that lane: it produces a **single**
  budget-fitting replacement into a review tree, not a set of named LOD variants,
  and it does not touch the quality setting or the loader. Its skin-aware
  decimation core (`optimize/decimate.mjs`, `rig.ts`) is the natural thing for
  #115 to call when it needs to *generate* those tiers — define that as the seam
  rather than duplicating meshopt wiring.

## Files

```
limits.ts            the budget + arithmetic (shared source of truth)
glb.ts               dependency-free GLB measure + rebuild-with-swapped-images
roles.ts             resolve a model's role (from report.json) + score vs its gate
rig.ts               the rig-survival check the decimator must pass
guard.ts             the import-time gate            → budget:guard
optimize.ts          the offline batch optimiser     → budget:optimize
optimize/decimate.mjs        isolated gltf-transform + meshopt geometry worker
optimize/bootstrap-geometry.sh   installs the geometry dep into .optvendor
*.test.ts            27 (existing) + 11 (new) passing tests
```
