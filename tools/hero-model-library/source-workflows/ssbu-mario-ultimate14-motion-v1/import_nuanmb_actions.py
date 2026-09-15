#!/usr/bin/env python3
"""Import the five verified Ultimate14 Mario body motions into the frozen SSBU rig.

Run only through Blender background mode with ``--factory-startup``. The script
opens the pinned source with embedded scripts disabled, imports Transform tracks
through the pinned Smash Ultimate Blender release, saves a new intermediate
``.blend``, and records every input hash. It does not edit the acquired sources.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def blender_arguments() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Pass workflow arguments after Blender's -- separator")
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--addon-root", type=Path, required=True)
    parser.add_argument("--addon-zip", type=Path, required=True)
    parser.add_argument("--addon-zip-sha256", required=True)
    parser.add_argument("--motion-index", type=Path, required=True)
    parser.add_argument("--motion-index-sha256", required=True)
    parser.add_argument("motions", nargs="+", type=Path)
    return parser.parse_args(blender_arguments())


args = parse_arguments()
source = args.source.resolve()
output = args.output.resolve()
addon_root = args.addon_root.resolve()
addon_zip = args.addon_zip.resolve()
motion_index_path = args.motion_index.resolve()

for path, expected, label in (
    (source, args.source_sha256, "source Blender"),
    (addon_zip, args.addon_zip_sha256, "Smash Ultimate Blender ZIP"),
    (motion_index_path, args.motion_index_sha256, "motion index"),
):
    if not path.is_file():
        raise SystemExit(f"Missing {label}: {path}")
    actual = digest(path)
    if actual != expected.lower():
        raise SystemExit(f"{label} hash mismatch: expected {expected}, got {actual}")
if not (addon_root / "__init__.py").is_file():
    raise SystemExit(f"Invalid add-on root: {addon_root}")
if output.exists():
    raise SystemExit(f"Output directory must not exist: {output}")

motion_index = json.loads(motion_index_path.read_text())
payloads = {row["sha256"]: row for row in motion_index["payloads"]}
allowed = {
    (row["relativePath"], row["sha256"])
    for row in motion_index["aliases"]
    if row["fighterId"] == "mario" and row["directoryClass"] == "body-motion"
}
motions = []
for path in args.motions:
    path = path.resolve()
    if not path.is_file():
        raise SystemExit(f"Missing motion: {path}")
    digest_value = digest(path)
    matches = [row for row in motion_index["aliases"] if row["sha256"] == digest_value]
    if not any((row["relativePath"], digest_value) in allowed for row in matches):
        raise SystemExit(f"Motion is not a pinned Ultimate14 Mario body motion: {path}")
    motions.append((path, digest_value, payloads[digest_value]))
if len({digest_value for _, digest_value, _ in motions}) != len(motions):
    raise SystemExit("Pass exactly one path for each distinct motion payload")

isolated_root = Path("/private/tmp/ggd-ssbu-mario-motion-blender-empty")
for key, leaf in (
    ("BLENDER_USER_CONFIG", "config"),
    ("BLENDER_USER_SCRIPTS", "scripts"),
    ("BLENDER_USER_DATAFILES", "datafiles"),
):
    os.environ[key] = str(isolated_root / leaf)
    Path(os.environ[key]).mkdir(parents=True, exist_ok=True)

import bpy  # noqa: E402


bpy.context.preferences.filepaths.use_scripts_auto_execute = False
if hasattr(bpy.context.preferences.system, "use_online_access"):
    bpy.context.preferences.system.use_online_access = False
open_properties = {
    prop.identifier for prop in bpy.ops.wm.open_mainfile.get_rna_type().properties
}
if "use_scripts" not in open_properties:
    raise RuntimeError("This Blender build cannot explicitly disable embedded scripts")
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False, load_ui=False)
bpy.context.preferences.filepaths.use_scripts_auto_execute = False

visible_meshes = [
    obj
    for obj in bpy.context.scene.objects
    if obj.type == "MESH" and not obj.hide_render and obj.visible_get()
]
armatures = {
    modifier.object
    for mesh in visible_meshes
    for modifier in mesh.modifiers
    if modifier.type == "ARMATURE" and modifier.object is not None
}
if len(armatures) != 1:
    raise RuntimeError(f"Expected exactly one visible-mesh armature, found {len(armatures)}")
armature = next(iter(armatures))
armature_bones = {bone.name for bone in armature.pose.bones}

for obj in bpy.context.scene.objects:
    obj.select_set(False)
armature.hide_set(False)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

sys.path.insert(0, str(addon_root.parent))
package_name = addon_root.name
import_module = importlib.import_module(f"{package_name}.source.anim.import_anim")

imports = []
for path, digest_value, payload in motions:
    transform_names = set(payload["transformNodeNames"])
    missing_bones = sorted(transform_names - armature_bones)
    if missing_bones:
        raise RuntimeError(f"Motion has bones absent from source armature: {missing_bones}")
    existing_actions = set(bpy.data.actions)
    import_module.import_model_anim(
        bpy.context,
        str(path),
        include_transform_track=True,
        include_material_track=False,
        include_visibility_track=False,
        first_blender_frame=1,
    )
    created = [action for action in bpy.data.actions if action not in existing_actions]
    bone_actions = [action for action in created if action.name.startswith(path.name)]
    if len(bone_actions) != 1:
        raise RuntimeError(
            f"Expected one bone action for {path.name}; created {[action.name for action in created]}"
        )
    action = bone_actions[0]
    action.name = path.stem
    action.use_fake_user = True
    imports.append(
        {
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": digest_value,
            "action": action.name,
            "frameRange": list(action.frame_range),
            "fCurveCount": len(action.fcurves),
            "transformNodeCount": len(transform_names),
            "missingArmatureBones": missing_bones,
        }
    )

output.mkdir(parents=True)
blend_path = output / "mario-c00-ultimate14-actions.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), copy=True, check_existing=False)
if not blend_path.is_file():
    raise RuntimeError("Blender did not save the animated intermediate")
if digest(source) != args.source_sha256.lower():
    raise RuntimeError("Source Blender bytes changed during import")
for path, expected, _ in motions:
    if digest(path) != expected:
        raise RuntimeError(f"Motion bytes changed during import: {path}")

receipt = {
    "schema": "ggd-ssbu-mario-ultimate14-action-import@1",
    "source": {"path": str(source), "bytes": source.stat().st_size, "sha256": digest(source)},
    "motionIndex": {
        "path": str(motion_index_path),
        "bytes": motion_index_path.stat().st_size,
        "sha256": digest(motion_index_path),
    },
    "tool": {
        "blenderVersion": bpy.app.version_string,
        "addon": "Smash Ultimate Blender",
        "addonVersion": "3.0.4",
        "addonRoot": str(addon_root),
        "addonZip": str(addon_zip),
        "addonZipSha256": digest(addon_zip),
        "embeddedScriptsExecuted": False,
        "transformTracksOnly": True,
    },
    "armature": {
        "name": armature.name,
        "boneCount": len(armature_bones),
        "boneNames": sorted(armature_bones),
    },
    "imports": imports,
    "output": {
        "path": str(blend_path),
        "bytes": blend_path.stat().st_size,
        "sha256": digest(blend_path),
    },
    "status": {
        "nativeTransformTracksImported": True,
        "visualPlaybackValidated": False,
        "convertedToGgdGlb": False,
        "runtimeSelectable": False,
    },
    "gaps": [
        "Ultimate14 contains five distinct Mario body motion payloads, not a complete gameplay action set.",
        "Visibility and material tracks are preserved in the original NUANMB files but are not imported into this body-motion intermediate.",
        "Visual playback, normalized GLB export, GGD validation, semantic action mapping, hero binding, runtime selection and deployment remain pending.",
    ],
}
(output / "import-receipt.json").write_text(
    json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(receipt, ensure_ascii=False, indent=2))
