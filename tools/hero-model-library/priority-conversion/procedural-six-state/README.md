# GGD procedural six-state fallback

This workflow appends six explicitly generated fallback clips to a **static** GLB while preserving the source bytes. It never labels generated motion as native or retargeted motion.

`coordinateSpace: "world-rest"` converts Y-up world-space gesture rotations and translations through each bone's rest transform. This supports rigs whose local bone axes differ, but every exact bone map, base pose, role matrix and result still requires character-specific visual review.

Ryu reproduction from the repository root:

```sh
python3 tools/hero-model-library/priority-conversion/procedural-six-state/ggd-procedural-six-state.py \
  content/assets/models/community/cb216ec537d9ea1a5c5d01c3a8afe88de547c57b76282254c1b6da0e15193c5c.glb \
  tools/hero-model-library/priority-conversion/procedural-six-state/configs/ssbu-ryu-c00-v1.json \
  <new-output-directory>
```

Render five samples from both front and side for every clip, then make two contact sheets:

```sh
python3 tools/hero-model-library/priority-conversion/procedural-six-state/render_motion_glb.py \
  <new-output-directory>/body.glb <new-render-directory> --repo .
python3 tools/hero-model-library/priority-conversion/procedural-six-state/make_contact_sheet.py \
  <new-render-directory> <output-prefix>
```

The renderer uses a temporary loopback server and headless Chrome. Its receipt records the camera axes and CPU-skinned finite world bounds. Start/middle/end alone are insufficient for cyclic motion, so the renderer also samples one-quarter and three-quarter time.

Run the deterministic source-preservation test with:

```sh
python3 -m unittest tools/hero-model-library/priority-conversion/procedural-six-state/test_procedural_six_state.py
```

Six generated clips do not establish gameplay timing, foot contact, collision, VFX, SFX, voice, backend registration, selection, or deployment.
