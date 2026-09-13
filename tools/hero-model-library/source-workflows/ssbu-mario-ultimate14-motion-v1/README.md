# SSBU Mario + Ultimate14 motions

This workflow combines the pinned `fighter/mario/body/c00` Blender source from
`gitlab-ssbu-models` with the five distinct Mario body-motion payloads in the
acquired Ultimate14 community MOD. The motions are native to that MOD package;
they are not claimed as Nintendo-original, procedural, retargeted, or a complete
gameplay action set.

The stages are:

1. `import_nuanmb_actions.py` imports only NUANMB Transform tracks through Smash
   Ultimate Blender 3.0.4 with embedded scripts and online access disabled.
2. The existing `ssbu-models-v1/convert_blend_component.py` exports the visible
   skinned body under the current GGD geometry and texture limits.
3. `normalize_materials.py` changes only the two transparent eye materials to
   `BLEND`; it verifies the binary chunk, animations, and all other glTF JSON are
   preserved.
4. `validate_motion_component.mts` runs Khronos validation, GGD budget checks,
   finite-float checks, and proves each clip targets all 98 joints with one TRS
   channel per joint.
5. `render_motion_glb.py` loads the actual GLB with Babylon WebGL and records
   start/middle/end images for every clip. The fixed front-axis camera keeps root
   motion on the depth axis so all 15 review frames stay visible.
6. `integrate.py` requires two byte-identical GLB rebuilds and creates the Git
   component/evidence records without inventing a GGD hero ID.

The accepted output remains an independent five-motion component. It has no
semantic skill mapping, backend dropdown registration, runtime switch proof, or
deployment proof.
