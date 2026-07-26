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

## Model audit + targeted fixes (tasks #61 / #68 / #73 / #77)

`#61` audited every champion-referenced model headless (`tools/w3x-import/model_audit_61.mjs`
→ `docs/_model-audit-61.data.json`; report `docs/_model-audit-61.md`). Findings: 0 wrong-scale,
0 missing-texture, 4 flying/sinking, 19 tilted (per-clip), 36 stray team-glow. The targeted
fixes below were applied; guard suite `tools/w3x-import/test/champion-model-guard.test.ts`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-61 | #73 SWEEP: no champion model ships a stray `TeamGlow*` ground-billboard mesh — the WC3 team-colour quad baked into 36 champion glbs (redundant with ChampionView's own team ring) is stripped by `strip_teamglow.py`; the low+wide quads never define full-bbox top/bottom so the frozen bbox/scale fixtures stay valid; remaining flagged meshes are opaque equipment (Buster Sword/Excalibur/hats) correctly kept | model-teamglow-stripped | regression | done |
| mdl-62 | #68 per-CLIP orientation: every clip `fix_clip_orientation.py` re-grounded (idle/run/hurt ≥45° off upright + attack/cast ≥90° inverted, 19 models / 26 clips incl. heropikachu Stand 99.7°→0° = #111) now starts ≤15° from upright — root-bone frame-0 rotation ≈ identity; death left to fall, borderline 47–74° leans left; only animation samplers rewritten so bind-pose bbox/scale fixtures unchanged | model-clip-orientation-upright | regression | done |
| mdl-63 | #61 flying/sinking: `ChampionView.tryUpgradeToGlb` grounds every loaded glb (lowest vertex → arena floor `y=0`), the same shift StorePreview #129 / intermission #111 apply — fixes ma (+0.72 float), picacugy/gumdam (~−0.6 sink), herofate (+0.17); feet-at-0 models shift 0 | client-model-grounded | unit | done |
| mdl-64 | #77 fallback preserves the declared model + scale: `ChampionView.declaredScale` never silently defaults; `EntityViewRegistry.modelOverrideFor`/`applyModelOverride` apply a per-champion `{scale,glbPath?,clipMap?}` over the shared stand-in doc so 小叮噹 (godie-n00b) can render at its map size 0.6, not the shared mage 0.77; override data in `content/models/_standin-overrides.json`. Wiring the championId→override in `GameApp.modelOverrideFor` is the remaining composition-root step (outside this wave's owned set) | client-declared-scale | unit | done |
| mdl-65 | #77 override plumbing: `applyModelOverride` is a pure pass-through when the override is null, applies a positive `scale`/`glbPath`/`clipMap` without mutating the base doc, and ignores a non-positive scale; the registry renders a stand-in champion at its override scale end-to-end | client-standin-override | unit | done |

## Consistent render SIZE — height-normalization (task #150)

`#150` SCAN: `tools/w3x-import/model_size_audit_150.mjs` (read-only, Babylon NullEngine
via ChampionView's exact `instantiateModelsToScene` + `getHierarchyBoundingVectors` path)
measured every champion's native + rendered on-screen height → `docs/_model-size-audit-150.md`
(+ `.data.json`; report gen `gen_model_size_audit_150.py`). Before #150 the rendered
full-silhouette height spread **1.70u..2.32u** (the four shared CC0 stand-ins were the
oversized group — champ.sela 2.32u, 小叮噹/godie-n00b — while imported.heroshana/夏娜 at
1.70u read small). ROOT CAUSE: `ChampionView` applied `doc.scale` as an ABSOLUTE, so
rendered size = doc.scale × the glb's wildly-varying native height, never normalized.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-150a | `ChampionView.tryUpgradeToGlb` HEIGHT-NORMALIZES every loaded glb to `TARGET_HEIGHT` (≈1.8u) — measures native full-silhouette height then scales to target, REPLACING raw-doc.scale-as-absolute — so two champions with very different native mesh heights render within tolerance of the same on-screen height; #77 grounding (feet→y=0) still holds and `declaredScale` reports the applied normalized factor | client-model-normalized | unit | done |
| mdl-150b | a per-champion `relativeScale` multiplier (default 1.0) from `content/models/_standin-overrides.json` (schema@2, keyed by championId) threads `EntityViewRegistry.modelOverrideFor` → `relativeScaleOf` → `ChampionView.tryUpgradeToGlb` and renders a champion DELIBERATELY smaller (<1: 小叮噹 0.65, 皮卡丘/妙蛙種子/熊貓/草泥馬) or bigger (>1: 初號機 1.55, 大魔王 1.3) than the normalized target — the only size-exception knob; `relativeScaleOf` defaults to 1.0 and never reads a legacy absolute `scale` as relative | client-model-normalized / client-standin-override | unit | done |
| mdl-150c | a degenerate/geometry-less glb (native height below `MIN_NATIVE_HEIGHT`, unmeasurable) falls back to the doc's declared `scale` instead of exploding the model with a divide-by-≈0 normalization factor; empty-glb `godie-u011` stays the procedural voxel fallback (exempt) | client-model-degenerate-fallback | unit | done |
| mdl-150d | GameApp `modelOverrideFor` reads `_standin-overrides.json` (championId→`{relativeScale}`) so the intentional size exceptions take effect in-game — the remaining composition-root wiring (owned by the GameApp wave, same seam as mdl-64). Height-normalization itself needs no wiring and is live for every champion | client-model-override-wired | integration | deferred |

## Model geometry + orientation re-sweep (tasks #68 / #73)

Fresh roster sweep for the SAME always-on effect-geoset artifact class as 索隆's
Tornado2b (GEOA/KGAO dropped on import ⇒ ships permanently-on). Census:
`tools/w3x-import/geoset_alpha_report.py` + a per-prim raw-MDX texture/KGAO sweep.
Full report: `docs/_model-geometry-audit-68-73.md`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-73-01 | 邪眼師 飛影 (`imported.herohehi`, godie-u010/godie-uvng) shipped the SAME `Textures\Tornado2b.blp` whirlwind as 索隆 (same katana rig, shares `whirlWindDummy`): a 20v cross billboard, hw 2.57u, KGAO alpha 0 in every sequence yet always-on because GEOA is dropped — the user-reported stationary whirlwind. Stripped via `strip_geoset_prims.py` (prim 4→3 `[604,186,89]`, mat 4→3, img 3→2; nodes/anims/`whirlWindDummy` intact, full-bbox 1.70u unchanged). Re-addable as a cast-gated VFX at `whirlWindDummy` (邪王炎殺黑龍波) like `WhirlwindFx.ts` did for 索隆 | model-herohehi-whirlwind-stripped | regression | done |
| mdl-73-02 | 時空勇者 林克 (`imported.linkstik`) shipped a 41v `Textures\gutz.blp` ground-gore splat WC3 showed ONLY in the never-played "Decay Flesh"/"Decay Bone" sequences (clipMap death→"Death"); GEOA dropped ⇒ stuck under Link's feet always. Stripped (prim 7→6 `[196,105,12,25,154,24]`, mat 5→4, img 4→3; the Decay animation clips + all nodes kept, full-bbox 1.70u unchanged). Held sword kept (opaque silhouette, not effect) | model-linkstik-gore-stripped | regression | done |
| mdl-73-03 | Candidates flagged, NOT stripped (conservative — tied to a PLAYED clip or real silhouette): `heroichigo` always-off transform-body geosets (needs merge/gating study, not effect), `negi` attack sparkles (白色之翼 wing kept), `pika` attack lightning, `heromiku`/`gumdam`/`picacugy`/`kikyou`/`herotoshiiemaeda` (details in the audit doc). `picacugy` firering + `gumdam` glow + `lubu` halberd are `noKGAO`/`on` = intended always-on in WC3, kept | model-geoset-strip-candidates | regression | deferred |
| mdl-68-01 | Orientation audit: NO defect found — apply nothing. All 43 imported champions with attach data split laterally on Z ⇒ forward axis -X (the roster norm, matching `glbFacing.ts`); 0 lateral-X outliers. The sole documented +X flip (`imported.heroryuk`) is not roster-referenced. `ChampionView`/`EntityViewRegistry` untouched (task #150 preserved); no `facingOffsetDeg` needed — it would only duplicate `glbFacing.ts` | model-orientation-noop | regression | done |

## Idle root-motion float — "站立時飛上天" (task #162)

黑崎一護 (`imported.heroichigo`) flew up into the sky while standing. `ChampionView`
grounds every rig ONCE in bind pose (`mdl-63`), then plays the idle clip; a
rising idle-clip **root-bone translation** defeats that per-frame. heroichigo's
idle `stand` clip pinned its skeleton root `bone_waist` to a corrupt keyframe
`+6.3865` (vs bind `+1.1460`) = **+4.85 world units** up (X was also garbage,
+1.43 lateral). A roster-wide sweep (`tools/w3x-import/float_sweep_162.py`; full
report `docs/_idle-float-audit-162.md`) found heroichigo is the ONLY champion
with this defect — every other rig's idle root drift is ≤ 0.056u.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-162 | `imported.heroichigo` idle no longer floats: `flatten_root_float.py` restored the corrupt single-keyframe root translation in all four stand-pose clips (`stand`, `stand 2`, `stand alternate`, `stand alternate 2`) to `bone_waist`'s grounded bind value — a 32-byte in-place surgical edit (no re-import), zeroing the +5.24-native vertical float AND a co-corrupt +1.43 lateral shove. Every other byte/clip/node identical (62 nodes / 1 mesh / 1 skin / 19 anims); `dissipate` death-poof left untouched. GLB re-validated, idempotent | model-idle-grounded | regression | done |
| mdl-162-sweep | Roster sweep: 51 `imported.*` champions checked for an idle/stand clip whose skeleton-root translation-Y rises off the grounded start. Only `heroichigo` floated; next-worst `horse` +0.056u (natural idle shift). Non-roster floaters (`enchant`/`firefly`/`darkraor`/`bahamut`(flying summon)/`heronarutos4effect`/`heroryuk`) are effect/projectile/summon models, out of scope. Guarded by `modelIdleGrounding.test.ts` — heroichigo pins + a roster-wide backstop (every champion idle root drift < 0.4 native) | model-idle-grounded-sweep | regression | done |

## The four retired KayKit characters must not come back (#226 / #240)

Owner directive, 2026-07-26: 「我不想再看到這些模組了」. #226 deleted the four CC0
**KayKit Character Pack: Adventurers** meshes (`mage` / `knight` / `barbarian` /
`rogue`, plus their `-mid` / `-small` LOD tiers — twelve files, 9,725,524 B,
46,687 triangles) and replaced every champion that wore one with a generated
box-man from `tools/voxel-gen` (168 tris, 1 draw call, 15 joints, 8 anim
channels each). The deploy verified the four URLs 404 — and then nothing
prevented a re-add.

**Scope is narrow on purpose.** "KayKit" is not the banned thing: Kay Lousberg
authored four more packs this project still ships and credits —
**Dungeon Remastered** (`props/*.glb`), **Character Pack: Skeletons**
(`props/guardian_skeleton.glb`, which is both the `arena.skeleton` guardian and
聖杯黑泥醬-喪標麥可), **Medieval Hexagon Pack** (`hex/*.glb`) and
**Halloween Bits** (`guardian_treant_trunk.glb`). The guard matches asset PATHS
and the retired pack's own name, never the vendor, and the "still shipped" set is
pinned by its own assertion so a future widening fails loudly.

Residual references cleaned at the same time: the shipped credits ledger
(`creditsData.ts` credited a pack we no longer distribute), the asset-budget
page's playbook (it looked up the deleted `knight.glb`, found nothing, and
printed its hard-coded fallback numbers as if they were measurements), the
`emit_report.ts` recorded-measurement labels that still said 「現況」, two test
fixtures and two doc examples.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-240 | Permanent guard against re-adding the four retired KayKit Adventurers characters: none of the twelve `.glb` exists on disk, the five `blocky-*` replacements ARE present, no shipped source / content doc / manifest / LOD table / built bundle references a `models/champions/<mage/knight/barbarian/rogue>(-mid or -small).glb` path, the shipped credit ledger no longer names the pack, the four KayKit packs still in the tree are explicitly NOT swept up, and the matcher self-tests both directions so a broken regex cannot pass silently. Failure message states the owner directive and the poly/rig budget so a future contributor understands rather than deleting the guard | model-retired-kaykit-guard | regression | done |

## #226 完成盤點 + #231 推導可稽核（task #258）

「每個缺模組的角色都要有模組」的字面解法是 43 個新 `.glb`。那個解法違反這件事自己的前提：
四個 KayKit 角色是因為**重**才退場的，一角一檔以同樣的單檔成本計價是 43 × ~52 KB ≈ 2.18 MB，
對上實際出貨的 5 × ~52 KB ≈ 255 KB —— 在 owner 唯一在意的那個數字上退步 8.5 倍，換來的還是
執行期本來就免費在做的區別。所以出貨的是「5 個烤好的網格 + 每位角色一份 #231 的
`VoxelSkinRecipe`（view 時上色，0 額外 bytes）」，而普查本身被寫成測試釘住，將來有人拿到真模組
或新增沒有美術的角色，會是一條紅測試點名是誰，而不是一個沒人重算的數字默默漂掉。

`_standin-overrides.json` 的 `relativeScale` **沒有被重算**：那是 #77/#150 由 owner 定的設定值，
普查只檢查「有 override 的角色還在名單上」，不評斷數字。

#231 原本只做了一半：推導鏈（L1 手動 → L2 關鍵字 → L3 技能元素 → L4 雜湊）真的在跑，但
`generateVoxelSkin` 的 `trace` 是內部選項、`SkinRow` 沒帶、沒有任何頁面顯示。對照表因此只能說
「他是這個顏色」，不能回答「為什麼」——對一個要 owner **核可**的產生器來說，那是「檢視」與
「聳肩」的差別。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mdl-258a | 借用共用模組的角色普查：四支 stand-in 各自的角色名單逐一釘住（champ.sela 18 / champ.thorne 10 / champ.skin.barbarian 9 / champ.skin.rogue 6，合計 43 且不重複）、每支 stand-in 的 model doc 真的指向 `blocky-*.glb` 且 `scale` 是誠實的 1.0、每位借用者都有自己的 recipe 且 `preferVoxelBody` 為真、43 人的調色盤兩兩不同、實測磁碟上只有 5 個檔案且總量 < 300 KB 而一角一檔的替代方案 > 8 倍、`_standin-overrides.json` 不得留下已不存在的角色、四個退場的 KayKit 檔案不得回來 | model-standin-census | regression | done |
| mdl-258b | 體素外觀推導可稽核：`explainVoxelSkin` 對全部 114 位角色逐軸（17 軸）回報決定它的層級與證據，且**每一個被解釋的值都等於產生器實際產出的值**；L1 override 報 L1 並指向 `_voxel-skins.json`、L2 規則附上真的出現在比對字串裡的那個詞、L3 附上讀到的 `vfxKey`（或明說沒有技能特效可判讀）、L4 純雜湊時 `evidence` 必須是 `null` 而不是編一個理由；salt > 1 的重抽要講出來；解釋本身是純函式且不會擾動產生器的輸出；`matchRules` 以 `exec` 取代 `test` 後仍然無狀態（同一字串連呼兩次結果相同） | voxel-skin-explain | unit | done |
