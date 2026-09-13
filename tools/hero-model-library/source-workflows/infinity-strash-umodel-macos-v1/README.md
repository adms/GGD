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

`pipeline.py` composes the independent assembly, normalization, runtime mapping,
Babylon review, catalog, registration, asset/content manifest generation and
central-index modules. Existing output is skipped only after its receipt and
SHA-256 still match. A failed run resumes at the failed module without deleting
or overwriting earlier stages. The index stage uses the repository generators;
it does not hand-edit generated `_index.json`, bundle or inventory files.

```bash
python3 pipeline.py \
  --config pipeline-config.json \
  --workspace "/path/to/ABxVFX_EDIT" \
  --plan

# Run only validation through index regeneration for one character.
python3 pipeline.py \
  --config pipeline-config.json \
  --workspace "/path/to/ABxVFX_EDIT" \
  --from-stage normalize --through indexes \
  --candidate dai-pn010-02
```

Blender 5.2.1 LTS and the pinned `io_scene_psk_psa` checkout are recorded by
the assembly receipt. The Babylon module can read `uploaded-model.json` and
renders three frames for each of the six GGD state mappings, including explicit
state reuse. Its fixed front camera uses +Z and Y-up; the earlier ArcRotate
camera sampled the wrong viewing axis and is retained only in local failed-run
evidence.

`prepare_component.py` validates one exported glTF with Assimp, converts it to
an intermediate GLB, and makes deterministic untextured front/back/isometric
review views. It records that game-shader parity and multipart assembly are
still incomplete. This fast geometry review does not require Blender.
