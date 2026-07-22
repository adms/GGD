# Champion & prop model facing + scale

The rendered .glb models had two defects vs the sim:

1. **Facing off by 90° (人物面向差90度)** for every w3x-imported champion. The
   client applied a single 180° yaw offset that is correct only for the native
   KayKit models; w3x-imported .glbs bake their forward on a different axis
   (local -X vs KayKit's +Z), so they rendered 90° rotated. Fixed by making the
   yaw offset source-dependent in ONE authoritative place:
   `apps/client/src/render/views/glbFacing.ts` (`glbYawOffset`), consumed by
   both `ChampionView` and `StorePreview`. Native = `Math.PI`, imported =
   `Math.PI + Math.PI/2`. The true root-cause fix (bake +90° into the exporter
   `tools/w3x-import/w3xlib/gltf.py` and re-export) is deferred to the re-import
   job so the shipped binaries are not churned here.

2. **Inconsistent scale (皮卡丘過大)** — some champions rendered up to 3.0u tall
   (pikachu/bulbasaur/picacugy clamped by the importer's usca), others as short
   as 1.19u, and the four KayKit models split 1.20–2.72u. Normalized every
   champion doc so its head/crown renders ≈**1.70** world units (the importer's
   `HERO_TARGET_HEIGHT` convention): imported by `bodyH`, KayKit by head-top
   (headgear protrudes naturally). collisionRadius is UNCHANGED for every model
   (planar sim authority). See `tools/w3x-import/out/GoDieEX22s/SCALES.md`.

Measured mesh heights are precomputed into
`packages/shared/src/content/modelScale.fixture.json` (via a Babylon NullEngine
script — the same load path as the client); the vitest asserts against that
fixture rather than loading .glb geometry in-process.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-01 | GLB yaw offset lives in exactly one place (`glbFacing`): native=`Math.PI`, imported=`Math.PI*1.5` (exactly +90° past native), flipped-imported=`Math.PI/2`; `glbYawOffset` routes champions/hex/props → native, imported/* → imported; `imported.heropika` (swapped hand labels, body faces -X) takes the normal imported offset, only `imported.heroryuk` is flipped | model-facing-convention | unit | done |
| mdl-02 | every champion model doc renders its normalized height (bodyH·scale for imported, head-top·scale for KayKit) inside a plausible band ≈1.5–1.9u; empty-glb `imported.collision` is exempt (procedural fallback) | model-scale-champion-band | unit | done |
| mdl-03 | no champion's rendered full-silhouette height exceeds 3× the roster median or an absolute 2.5u ceiling (kills the 3.0u pikachu/bulbasaur outliers) | model-scale-no-giant | unit | done |
| mdl-04 | the measured-height fixture stays in sync with the live docs: every champion's `content/models/*.json` `scale` equals the fixture's recorded `newScale` (regenerate the fixture if a scale changes) | model-scale-fixture-sync | regression | done |
| mdl-05 | `prop.flower` stays a footprint-sized objective, not a champion: scale in the [6,12] contract, collisionRadius `0.7` (== sim `FLOWER_RADIUS`), rendered width ≈ the 1.4u collision footprint, rendered height < 0.5u (flat lily) | model-prop-flower-band | unit | done |
| mdl-06 | ROOT-CAUSE: bake the +90° basis rotation into `tools/w3x-import/w3xlib/gltf.py` and re-export the imported .glbs so a single global `Math.PI` covers all families; retire the imported branch in `glbFacing` | model-facing-root-cause | unit | deferred |
| mdl-08 | no champion ships untextured: no ACTIVE champion/skin glb embeds the exporter's 8x8 grey "unresolved .blp" placeholder in ANY material — body or secondary (flames/glows/clouds). The importer resolves stock Blizzard BLPs from the retail MPQs itself (`w3xlib/models.py` `STOCK_MPQS` + `_stock_texture_png`, cached archives, no-op when the MPQs are absent), so this holds for a plain `import_w3x.py` run; shipped glbs were refreshed by `rebake_textures.py` (#33). 妙蛙種子 (`imported.bulbasaur`) stays pinned fully textured (3/3 materials) AND champion-sized — its pre-#32 glb normalized only the 387-vert trunk geoset, leaving the real silhouette at 3.13u (1.84× the roster) | model-body-texture | regression | done |
| mdl-07 | drop stray effect/beam geosets baked into champion glbs so full-mesh bbox ≈ body height: importer guard `classify_geosets` (root cause) + shipped-glb strip of niya (re-baked, beam 8.5×→1.0×), heromiku/ma/picacugy/renaryugu2/cloud/herosaber (surgical); #33 re-baked the last five pre-guard heroes (gumdam, linkstik, negi, pika, hero-turtle) onto the union basis, all now a true 1.70u silhouette; only heropika's ears stay allowlisted (bulbasaur left in #32, linkstik in #33). Buster Sword/Excalibur kept. Guarded by the full-bbox test (see model-scale-guard.md) | model-effect-mesh-cleanup | regression | done |
