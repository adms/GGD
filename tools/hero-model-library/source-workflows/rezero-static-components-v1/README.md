# Re:Zero static skinned components

This workflow converts the acquired Thunderstore `ReZero_Playermodels` 0.1.1
Unity bundle without loading its DLL. Ram and Beatrice are explicitly exported
from `ramPrefab` and `beatricePrefab` with their native Z-up orientation mapped
to glTF Y-up. The source 2048px textures remain in the local conversion archive;
GGD's unchanged normalizer and ffmpeg-backed resizer produce 256px candidate
textures.

The outputs are independent static skinned model components. The bundle contains
no `AnimationClip` objects, so these files are not complete six-state heroes and
are not eligible for automatic default selection, runtime dropdown registration,
or deployment.

Use `rebuild.py --help` for the deterministic two-component replay. It requires
Python with UnityPy 1.25.3 and NumPy, Node with the repository dependencies, and
ffmpeg. `normalize_validate.mts` records the current GGD contract pins, checks
every logical accessor byte across the texture-only normalization, and rejects
oversized output textures or GGD budget errors.
