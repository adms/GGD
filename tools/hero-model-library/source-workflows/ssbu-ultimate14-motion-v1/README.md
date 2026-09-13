# SSBU Ultimate14 matching-rig motion import

`import_nuanmb_actions.py` is the character-parameterized form of the verified
Mario importer. It accepts only a pinned fighter's `body-motion` entries from
`ultimate14-native-motions.json`, rejects duplicate payloads, disables embedded
Blender scripts and online access, and verifies every source hash before and
after import.

The result is an intermediate Blender file plus a complete import receipt. A
successful import proves that each NUANMB transform node exists on the selected
source armature. It does not prove visual playback, semantic GGD six-state
mapping, backend selection, or deployment. Motions retain their Ultimate14
community MOD provenance and are not described as Nintendo-original motions.

The Sonic c00 delivery runs this importer twice, exports both intermediates
through `ssbu-models-v1/convert_blend_component.py`, and requires byte-identical
GLBs. `validate_motion_component.mts` checks Khronos, the live GGD budget,
finite accessors, the 98 pinned NUANMB Transform nodes, all 115 exported skin
joints, and all ten clips. `render_motion_glb.py` samples every clip at start,
middle, and end through Babylon WebGL; `make_contact_sheet.py` creates the
30-frame review sheet. `integrate_sonic.py` freezes the accepted independent
component and its fully read-back S3 conversion-stage receipt.

The current Sonic component has 8,980 triangles, 5 draw primitives, five
256-pixel textures, 115 joints, ten clips, and 345 channels per clip. It passes
the hard policy. The 5 draws and 345 channels remain explicit warnings above
the 3/300 review thresholds. It is an incomplete independent component without
a GGD hero ID, semantic state mapping, backend dropdown, runtime switch, or
deployment.
