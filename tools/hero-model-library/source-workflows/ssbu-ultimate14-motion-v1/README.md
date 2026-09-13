# SSBU Ultimate14 matching-rig motion import

## Source boundaries

`import_nuanmb_actions.py` accepts only a pinned fighter's `body-motion`
entries from `ultimate14-native-motions.json`. It rejects duplicate payloads,
disables embedded Blender scripts and online access, and checks every source
hash before and after import. The motions come from the Ultimate14 community
MOD. They are not described as original Nintendo motion files.

The related full local source inventory is rebuilt with:

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-local-roster-v1/build_inventory.py
```

That inventory explains the earlier count of 16: it is the number of fighter
IDs with NUANMB paths in the partial Ultimate14 MOD. The pinned Worldblender
snapshot is larger: 94 top-level fighter directories, 92 fighter/form IDs after
excluding `common` and `element`, 89 with conventional body or Trainer-avatar
candidates, and 698 primary body/avatar costume candidates. The 92 includes
forms such as `koopag`; it is not an official selectable-roster total.

## Reproducible conversion

The generic batch runs two independent Blender imports and exports for Chrom
or Lucina:

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/run_matching_motion_batch.py \
  --fighter chrom --fighter lucina
```

Blender 4.5.13 LTS was used for the accepted batch. A successful import proves
that every selected NUANMB Transform node exists on the selected Worldblender
c00 armature. It does not prove semantic action mapping or acceptable root
orientation in gameplay.

The optimizer uses the repository's established decimation, attribute
coalescing/harmonization, primitive merge, 256px atlas, and alpha-finalization
tools. Its npm runtime is fixed by the committed `decimate-runtime/package.json`
and `decimate-runtime/package-lock.json`. Install the exact dependency graph in
the local asset-library dependency area with:

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/bootstrap_decimate_runtime.py --install
```

The optimizer refuses to run when the installed package files or copied
`tools/model-budget/optimize/decimate.mjs` worker differ from the committed
pins. New output directories are required; existing conversion stages are not
overwritten.

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/optimize_matching_motion_component.py \
  --fighter chrom --fighter lucina
```

`validate_matching_motion_component.mts` runs Khronos validation, the live GGD
budget policy, finite-accessor checks, expected joint checks, and per-clip node
checks. `render_motion_glb.py` samples every clip at start, middle and end using
Babylon WebGL. `make_contact_sheet.py` builds the review sheet.

## Accepted independent components

| fighter | triangles | draws | joints | textures | clips | channels/clip | WebGL samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chrom c00 | 7,890 | 6 | 123 | 7 | 9 | 369 | 27 |
| Lucina c00 | 7,927 | 6 | 156 | 5 | 13 | 468 | 39 |
| Sonic c00 | 8,980 | 5 | 115 | 5 | 10 | 345 | 30 |

Chrom and Lucina each produced byte-identical final GLBs across two builds,
Khronos 0/0, zero GGD hard-policy errors, and complete WebGL samples. Their
draw counts and channel counts exceed the 3-draw and 300-channel review
thresholds. The contact sheets show connected textured geometry, but native
root orientation varies across clips. Semantic GGD six-state mapping and user
action approval remain pending.

`integrate_matching_motion_batch.py` copies only the final GLB and compact
evidence into Git and registers the rows as accepted independent components.
They have no invented hero ID, backend dropdown entry, runtime switch, or
deployment. Their full conversion-stage S3 backup remains
`pending-upload-and-full-readback-verification` until an upload manifest and
complete read-back receipt exist.
