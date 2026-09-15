# Infinity Strash VFX StaticMesh recovery

This lane recovers the 33 VFX support meshes that the previous dependency export classified as `converter-failed`. The source packages are already byte-pinned by `infinity-strash-popp-vfx-dependency-export-v1/source-manifest.json`.

The failure is one format offset shared by all 33 packages. Infinity Strash appends an eight-byte cumulative base vertex value to every `FStaticMeshSection4`. The earlier macOS patch consumed that field for skeletal sections only, so UModel entered the later distance-field or occluder records eight bytes early. The dedicated patch in `ueviewer-infinity-strash-staticmesh-section.patch` adds the corresponding static-section read.

Build the converter from the preserved patched source archive:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_staticmesh_umodel.py \
  --source-archive ../GGD-Asset-Library/tools/UEViewer/specific-infinity-strash-macos-v1-texture-export-fix/ueviewer-a0bfb468d42be831b126632fd8a0ae6b3614f981.tar.gz \
  --patch tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/ueviewer-infinity-strash-staticmesh-section.patch \
  --output ../GGD-Asset-Library/tools/UEViewer/specific-infinity-strash-macos-v2-staticmesh-export
```

Export the formerly failed packages and convert them to self-contained GLB:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/recover_staticmesh_dependencies.py \
  --source-manifest ../GGD-Asset-Library/conversions/infinity-strash-popp-vfx-dependency-export-v1/source-manifest.json \
  --raw ../GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/raw \
  --umodel ../GGD-Asset-Library/tools/UEViewer/specific-infinity-strash-macos-v2-staticmesh-export/umodel \
  --assimp /usr/local/bin/assimp \
  --output ../GGD-Asset-Library/conversions/infinity-strash-popp-vfx-staticmesh-recovery-v1
```

Both builders refuse to overwrite an output directory. `recover_staticmesh_dependencies.py --check <source-manifest.json>` re-hashes the converter, source manifest, all 33 GLBs and rechecks their GLB structure. Run Khronos validation and rebuild the joined before/after matrix with:

```bash
node --import tsx tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/validate_staticmesh_recovery.mts \
  ../GGD-Asset-Library/conversions/infinity-strash-popp-vfx-staticmesh-recovery-v1/source-manifest.json \
  materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-khronos.json

python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_staticmesh_recovery_matrix.py \
  --original ../GGD-Asset-Library/conversions/infinity-strash-popp-vfx-dependency-export-v1/source-manifest.json \
  --recovery materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-receipt.json \
  --khronos materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-khronos.json \
  --output materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-matrix.json
```

Current result: 33/33 support meshes converted, 33 GLBs, 30,459 vertices and 37,091 triangles. Khronos reports zero errors and zero warnings. Assimp retains tangents from UModel even when a material has no normal texture; the recovery script removes only those unused tangent bindings. Positions, normals, UVs and indices remain present.

The recovered GLBs are VFX construction components. They do not prove that any Niagara system was converted, that a GGD VFX recipe was reconstructed, that visual acceptance passed, or that Popp's skills use these assets at runtime.
