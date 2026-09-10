# Zero Lancer P1 / P2 component validation

Source `gamebanana-zero-lancer-493444` is the author-labelled **Fate/unlimited codes Zero Lancer / Diarmuid** model port for **PC Bomb Rush Cyberfunk**, GameBanana mod 493444, file 1132069. Authors: 7Negative_Creep and MEKMKII; full credits remain in the preserved source response. No published source version or original PSP/PS2 platform has been established. Keep `sourcePlatform: unknown` and `selectionClass: community-mod`; the folder name containing `psp` is not platform evidence. No GGD hero ID is assigned.

The complete manifest-listed local intake is preserved: 358 files / 4,772,223 bytes plus its manifest. Original 7z SHA-256: `140b5934cb06f32d360c20c659c99484ce3c726ba32597d1c10ae7ddffea0e1a`; Unity bundle: `760f786301c8d554cdfc117df9a427ef73850a986a1b1b23d62f3494300a3573`.

Both existing candidates pass the unchanged current GGD importer and hero budget with zero errors or warnings: 3,838 vertices, 4,984 triangles, one draw/material, one embedded 256×256 PNG, 59 glTF joints and zero animation clips. The complete component bytes are retained unchanged:

| Variant | Bytes | SHA-256 |
|---|---:|---|
| P1 | 336,732 | `01ff056d74c9457865b04a88dc69bc1a2325750ad418f7900fd831c5ed778308` |
| P2 | 337,856 | `112f245d85a51f772afd6339ee56783292b6cfdd04fad2a3aa9e803c623125a6` |

Independent Unity JSON / glTF matrix calculations verify every source position, UV, joint order, inverse-bind matrix and 83 node transforms. World-space skinning is **Y-up, 1.8 metres high**; local POSITION Z bounds are not world orientation. World position error versus independently evaluated native Unity hierarchy is at most 4.98e-8 m. There are 32 weighted joints, at most four influences per vertex, and no invalid joints, negative weights, zero-sum weights, zero normals or degenerate triangles. Ten source triangles have opposing geometric/averaged vertex normals; the exact same ten IDs exist in the original Unity mesh, so this is documented without changing the source artwork.

Actual Babylon 7.54.3 WebGL renders use GPU skinning and include front, back and isometric views for each palette. All six images were inspected: complete head/body/hands/feet, upright rest pose, distinct green versus silver palette, no visibly detached body parts. Babylon's world-skinned bounds agree with the independent calculation. This establishes the visible static skinned component, not original-engine shader parity or animation behavior.

Full source rebuild through pinned existing GGD Unity conversion and outfit/material logic produces **byte-identical P1/P2 GLBs**. Only the old script's hard-coded output root is parameterized in the preserved adapted copy. There are no geometry, material, scale, orientation, skeleton or rig repairs in this batch. The original processor also reproduces 13 existing audio files; those are duplicate reconstruction evidence, not newly acquired audio.

Reproduce in a new directory, preserving every earlier stage:

1. `python3 preserve.py --source-root /absolute/source/intake --output /absolute/new/delivery`
2. `node --import /absolute/GGD/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs validate.mts /absolute/GGD /absolute/new/delivery`
3. `python3 audit_skin.py --source-root /absolute/new/delivery/raw/source --output /absolute/new/delivery/evidence/independent-skin`
4. `python3 render.py /absolute/new/delivery/outputs/p1/component.glb /absolute/new/delivery/evidence/webgl-p1 --repo /absolute/GGD`; repeat for P2 into a new directory.
5. `python3 rebuild.py --repo /absolute/GGD --delivery /absolute/new/delivery`

`audit_skin.py` uses Python 3.10.4 + NumPy 2.2.6 in this run. Source rebuild uses the existing `/private/tmp/ggd-public-model-venv/bin/python` (Python 3.12.13, UnityPy 1.25.3, NumPy 2.5.3). Node is 25.9.0. Project contract source SHA and repository commit are in each validation receipt. Renderer uses existing Chrome and a short-lived localhost server with an isolated profile. The tsx CLI socket is not required: use Node's import hook above.

Missing: original native animations, facial morphs, particles/VFX, original-game skeleton provenance, exact Unity toon/outline behavior, runtime integration and backend switching. No artificial six-state clips were created. Both outputs may be handled as independently validated static skinned model components with these documented gaps; they are not complete playable heroes. No default, hero definition, backend registration, deployment, central index, AWS or remote push is changed by this workflow.
