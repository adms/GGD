# Re:Zero remaining static components

This workflow converts the four remaining character prefabs from the acquired
Thunderstore `ReZero_Playermodels` 0.1.1 Unity bundle without loading its DLL.
Rem, Emilia, and Felix are native Z-up prefabs. Subaru is visibly Y-up and has a
second `SkinnedMeshRenderer` named `face` with zero source bones, bind poses,
joint indices, and weights below the native head hierarchy. The versioned mixed
converter preserves that renderer as a one-joint rigid skin on its own face
transform and rejects any partial or contradictory skin payload.

Every accepted output remains an independent static model component. The bundle
contains zero `AnimationClip` objects. No output is a complete six-state hero,
runtime dropdown option, automatic default, or deployed asset. Emilia's source
page reports rig problems; the static bind pose can be accepted only with motion
and retargeting still explicitly unverified.

Run `rebuild.py --help` for the deterministic four-component replay. It requires
the pinned UnityPy 1.25.3 Python environment, repository Node dependencies, and
ffmpeg. Both source-conversion and normalized GLB bytes are compared with the
reviewed first build.
