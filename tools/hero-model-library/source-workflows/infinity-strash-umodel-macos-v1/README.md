# Infinity Strash macOS native UModel workflow

This workflow builds and runs a pinned macOS extractor for the cooked Unreal
Engine 4.26 assets from *Infinity Strash: Dragon Quest The Adventure of Dai*.
It removes the Windows-only extraction dependency. Blender remains useful after
extraction for multipart assembly, material repair and final GLB authoring, but
Blender does not directly decode the game's `.pak`, `.uasset`, `.uexp` and
`.ubulk` serialization.

The game adds an eight-byte cumulative base-vertex value to each skeletal mesh
section. Stock UEViewer reads the following bone map eight bytes too early and
fails with `Serializing behind stopper`. The checked-in patch adds an explicit
`strash` game tag and consumes that field before the bone map.
The patch also restores the missing `UTexture2D` command-line exporter
registration so selected cooked textures can be archived as lossless images.

The upstream source is pinned to UEViewer commit
`a0bfb468d42be831b126632fd8a0ae6b3614f981`. `build.py` exports that exact tree
from a local Git checkout, applies `ueviewer-infinity-strash.patch`, builds an
x86_64 macOS binary and writes a SHA-256 manifest. Source, binary, build log and
manifest are local/S3 `legacy/` materials; this directory keeps the reproducible
program and patch in Git.

Example:

```bash
python3 build.py \
  --source /path/to/UEViewer \
  --output /path/to/GGD-Asset-Library/tools/UEViewer/specific-infinity-strash-macos-v1

python3 export.py mesh \
  --umodel /path/to/output/umodel \
  --asset-root /path/to/infinity-strash-priority-raw-v2/raw \
  --output /path/to/export \
  --asset strash/Content/Strash/Chara/Player/PN010/02/SK_PN010_02_Body.uasset
```

`mesh` produces glTF plus its binary buffer. `mesh-psk` preserves UModel's PSK
skeletal-mesh coordinate system for matching PSA animation import. `animation`
preserves UModel's PSA export. `texture` exports selected texture packages to
lossless PNG files.
Every run writes command logs and a per-file SHA-256 manifest. These are
conversion-stage outputs only; multipart merge, textures, visual review, GGD
contract validation, registration, backend switching and deployment remain
separate gates.

## Resumable modular pipeline

The accepted path is PSK mesh plus PSA animation imported through the same
Blender add-on coordinate system. Mixing UModel glTF skeletons with PSA caused
valid-looking files whose posed meshes exploded at runtime, so the pipeline
does not combine those two representations.

`pipeline.py` composes the independent assembly, texture-backdrop repair, normalization, runtime mapping,
Babylon review, catalog, registration, asset/content manifest generation and
central-index modules. Existing output is skipped only after its receipt and
SHA-256 still match. Before retrying an incomplete stage, the pipeline moves its
partial directory into a numbered sibling `failed-attempts/` path, preserving
the evidence without overwriting earlier stages. The index stage uses the repository generators;
it does not hand-edit generated `_index.json`, bundle or inventory files.

The `backdrop` stage applies a candidate-specific, image-only repair before
normalization. Dai's planar face decal receives a transparent carrier. EN801's
opaque body material remains `OPAQUE`; only unused base-texture alpha is
flattened to 255, which avoids the dark robe introduced by changing blend mode.
The stage rejects any geometry, rig, animation or material JSON change and
writes a content hash receipt. The unsafe originals remain preserved in the
local asset library, the verified S3 legacy archive and Git history; they are
removed from the current `content/` tree after integration so they cannot ship
as unreferenced runtime assets. `integrate_repaired_predecessor_options.py` redirects
the three retained high-poly source/frozen option documents to new repaired
hashes, updates their catalog and version checksums, and refuses to change the
already-selected decimated active versions.

The formally adoptable derivatives are rebuilt separately so the repaired
high-resolution source remains available. `generate_decimated_backdrop_candidates.mts`
writes content-addressed base/frozen/local copies at no more than 8,000
triangles. Dai uses the shared border-lock simplifier. EN801 uses explicit
material allocation and includes normals, UVs, skin weights and joint indices
in the simplification error; the earlier position-only candidate tore holes in
the animated robe and remains local rejected evidence. Run
`render_compare_decimated_backdrops.py`, inspect all six states at 0/50/100%,
then record that inspection with `--accept-after-inspection`.

```bash
node --import tsx generate_decimated_backdrop_candidates.mts /path/to/GGD /path/to/ABxVFX_EDIT
python3 render_compare_decimated_backdrops.py --repo /path/to/GGD --workspace /path/to/ABxVFX_EDIT
# Only after visually inspecting the generated contact sheets:
python3 render_compare_decimated_backdrops.py --repo /path/to/GGD --workspace /path/to/ABxVFX_EDIT --accept-after-inspection
node --import tsx validate_decimated_backdrop_candidates.mts /path/to/GGD generation.json visual-comparison.json validation.json
python3 integrate_decimated_backdrop_candidates.py --repo /path/to/GGD --apply
python3 integrate_repaired_predecessor_options.py --repo /path/to/GGD --apply
```

Both integration scripts default to a read-only deterministic plan. The
decimation integrator accepts either the original or repaired predecessor hash,
so the two steps remain repeatable after the high-poly option redirect. Neither
script runs central index generators or claims production deployment.

Candidate rows may override `meshRoot`, `materialContextRoot`, `textureRoot` and
`psaRoot`. This keeps later character exports immutable and separate from the
first Dai/Vearn batch. The `popp-pn020-00` recipe uses its own four manifests,
assembles body/face/hair, preserves seven native sequences and prepares five
distinct runtime clips. GGD hurt/death intentionally share PN020's native down
loop because the extracted package set contains no distinct Popp death
AnimSequence.

`dai-pn010-05-daino-tsurugi` is a separate original-game option. Source record
`CB_PN010_05` selects the PN010/05 body, Hair/01 and Dai no Tsurugi at
`Weapon1_R`. The recipe keeps the body's Dai no Tsurugi sheath, removes dormant
Papunica switch faces from this option, filters the separately exported sword's
outline/dummy/aura sections, and rigid-skins the remaining sword geometry to the
source socket. Its sword and sheath base colours share a generated horizontal
atlas and one joined skinned primitive so the result stays within GGD's six-draw
limit without relaxing the contract. The existing PN010/02 option remains available.
`collect_dai_pn010_05_delivery.py` verifies and collects the component exports,
the rejected seven-draw attempt, accepted assembly/normalization/runtime stages,
18-image WebGL review, source character configuration and pinned workflow tools
for an immutable local/S3 `legacy/` delivery.

```bash
python3 pipeline.py \
  --config pipeline-config.json \
  --workspace "/path/to/ABxVFX_EDIT" \
  --plan

# Run only validation through index regeneration for one character.
python3 pipeline.py \
  --config pipeline-config.json \
  --workspace "/path/to/ABxVFX_EDIT" \
  --from-stage backdrop --through indexes \
  --candidate dai-pn010-02

# Resume Popp after its independent UModel export manifests exist.
python3 pipeline.py \
  --config pipeline-config.json \
  --workspace "/path/to/ABxVFX_EDIT" \
  --candidate popp-pn020-00
```

Blender 5.2.1 LTS and the pinned `io_scene_psk_psa` checkout are recorded by
the assembly receipt. The Babylon module can read `uploaded-model.json` and
renders three frames for each of the six GGD state mappings, including explicit
state reuse. Its fixed front camera uses +Z and Y-up; the earlier ArcRotate
camera sampled the wrong viewing axis and is retained only in local failed-run
evidence.

`freeze_runtime_review.py --contact-sheet-only` builds a six-state, three-sample
sheet for human review. A second invocation with `--output` and `--observation`
verifies every receipt and SHA-256, copies the bounded evidence into Git and
records feature-branch registration without claiming Main merge or deployment.

`collect_popp_delivery.py` supports three append-only profiles: the original
PN020/00 body delivery, the Magikaru attachment delta, and the Mahouno plus
Kagayaki alternate-staff delta. Each profile copies its immutable conversion
stages into one bounded local delivery tree and records the original absolute
path, size and SHA-256 for every file. Freeze that tree with
`freeze_scoped_stage.py`, then publish it with `upload_scoped_tar.py`; the Popp
source integration validates and copies the full manifest and S3 readback
receipt into Git evidence.

`prepare_component.py` validates one exported glTF with Assimp, converts it to
an intermediate GLB, and makes deterministic untextured front/back/isometric
review views. It records that game-shader parity and multipart assembly are
still incomplete. This fast geometry review does not require Blender.

`prepare_en653_component.py` is the reproducible EN653/01 lane. It preserves
UModel mesh, skin, UV and accessor bytes; repairs only missing buffer-view
targets and rounded POSITION bounds; maps the confirmed face/body base-colour
textures; and embeds them into a portable GLB. `render_babylon.py --static`
then produces front, back and isometric bind-pose evidence for zero-clip
components. EN653 is always recorded as MystVearn, separate from Vearn and
Baran. `collect_en653_delivery.py` accepts only byte-identical conversion and
normalization rebuilds before collecting the full source, failed attempts,
successful evidence and pinned tools for the S3 legacy archive.
