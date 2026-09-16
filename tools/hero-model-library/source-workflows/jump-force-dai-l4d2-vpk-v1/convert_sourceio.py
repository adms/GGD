#!/usr/bin/env python3
"""Emit an auditable SourceIO/Blender GLB intermediate from one verified L4D2 MDL.

This converter only reads a public Workshop extraction that is already covered by
its source receipt.  It never installs SourceIO, changes Blender preferences,
or writes into the source intake.  The emitted GLB is an intermediate: it is
not a GGD-standardized, visually accepted, registered, selectable, or deployed
model.  In particular, unsupported Source VMT patch chains are recorded instead
of silently claimed as material parity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
DEFAULT_BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
SOURCEIO_COMMIT = "25b3978e366aeed1b4bdcf078394751b2d376c7a"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_source(root: Path, stem: str) -> tuple[Path, dict]:
    extraction = json.loads((root / "extraction.json").read_text(encoding="utf-8"))
    relative = Path("extracted") / (stem + ".mdl")
    row = next((item for item in extraction.get("files", []) if item.get("path") == relative.as_posix()), None)
    if not row:
        raise ValueError(f"source manifest omits {relative}")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
        raise ValueError(f"source changed since extraction: {relative}")
    for suffix in (".vvd", ".dx90.vtx"):
        sidecar = path.with_suffix(suffix)
        if not sidecar.is_file():
            raise FileNotFoundError(sidecar)
    return path, row


def driver_source(sourceio: Path, model: Path, output: Path, result: Path) -> str:
    return f'''import bpy
import hashlib
import json
import sys
import traceback
from pathlib import Path

SOURCEIO = Path({str(sourceio)!r})
MODEL = Path({str(model)!r})
OUTPUT = Path({str(output)!r})
RESULT = Path({str(result)!r})

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()

payload = {{"schema": "ggd.jump-force-dai-sourceio-blender-emission@1", "source": str(MODEL), "stage": "started"}}
try:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    sys.path.insert(0, str(SOURCEIO.parent))
    from SourceIO.blender_bindings.bindings import register
    register()
    returned = bpy.ops.sourceio.mdl(
        filepath=str(MODEL), directory=str(MODEL.parent) + "/", files=[{{"name": MODEL.name}}],
        discover_resources=True, import_textures=True, import_animations=True,
        import_include_animations=True, import_physics=False, load_refpose=False,
        create_flex_drivers=False, bodygroup_grouping=True, use_bvlg=False)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type in {{"MESH", "ARMATURE"}})
    if mesh_objects:
        bpy.context.view_layer.objects.active = mesh_objects[0]
    material_rows = []
    for material in bpy.data.materials:
        output_nodes = []
        if material.use_nodes and material.node_tree:
            output_nodes = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
        material_rows.append({{
            "name": material.name,
            "usesNodes": bool(material.use_nodes),
            "hasLinkedSurface": any(node.inputs.get("Surface") and node.inputs["Surface"].is_linked for node in output_nodes),
        }})
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_animations=True,
                              export_materials="EXPORT", export_keep_originals=True,
                              export_cameras=False, export_lights=False)
    if not OUTPUT.is_file() or OUTPUT.stat().st_size == 0:
        raise RuntimeError("Blender GLB export did not create output")
    payload.update({{
        "stage": "emitted",
        "operatorReturn": sorted(returned),
        "meshObjects": [{{"name": obj.name, "vertices": len(obj.data.vertices), "polygons": len(obj.data.polygons), "materialSlots": len(obj.material_slots)}} for obj in mesh_objects],
        "armatures": [{{"name": obj.name, "bones": len(obj.data.bones)}} for obj in armatures],
        "actions": [{{"name": action.name, "slots": len(getattr(action, "slots", [])), "layers": len(getattr(action, "layers", []))}} for action in bpy.data.actions],
        "materials": material_rows,
        "output": {{"absolutePath": str(OUTPUT), "bytes": OUTPUT.stat().st_size, "sha256": digest(OUTPUT)}},
    }})
except Exception as exc:
    payload.update({{"stage": "error", "error": repr(exc), "traceback": traceback.format_exc()}})
finally:
    RESULT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))
if payload["stage"] != "emitted":
    raise SystemExit(31)
'''


def emit(workspace: Path, source_folder: str, stem: str, output_root: Path, blender: Path, sourceio: Path, check: bool) -> dict:
    intake = workspace / "GGD-Asset-Library/intake/public-sources" / source_folder
    model, source_record = read_source(intake.resolve(), stem)
    if not blender.is_file() or not sourceio.is_dir():
        raise FileNotFoundError("Blender or SourceIO path missing")
    commit = subprocess.check_output(["git", "-C", str(sourceio), "rev-parse", "HEAD"], text=True).strip()
    clean = subprocess.check_output(["git", "-C", str(sourceio), "status", "--porcelain"], text=True).strip()
    if commit != SOURCEIO_COMMIT or clean:
        raise ValueError("unexpected or modified SourceIO checkout")
    root = output_root.resolve() / source_folder / stem.replace("/", "_")
    output = root / "sourceio-raw.glb"
    result = root / "blender-emission.json"
    receipt_path = root / "conversion-receipt.json"
    if check:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt["source"]["sha256"] != source_record["sha256"] or receipt["source"]["bytes"] != source_record["bytes"]:
            raise ValueError("source receipt drift")
        for path, row in ((output, receipt["output"]), (result, receipt["blenderEmission"])):
            if not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
                raise ValueError(f"output receipt drift: {path}")
        return {"output": str(output), "check": True, "status": receipt["status"]}
    if root.exists():
        raise FileExistsError(f"preserve existing conversion output: {root}")
    root.mkdir(parents=True)
    driver = root / "blender-driver.py"
    driver.write_text(driver_source(sourceio.resolve(), model, output, result), encoding="utf-8")
    proc = subprocess.run([str(blender), "--background", "--factory-startup", "--python", str(driver), "--python-exit-code", "31"], text=True, capture_output=True, check=False, timeout=300)
    (root / "blender.log").write_text(proc.stdout + proc.stderr, encoding="utf-8")
    if proc.returncode != 0 or not result.is_file():
        raise RuntimeError(f"Blender SourceIO emission failed (exit {proc.returncode}); see {root / 'blender.log'}")
    emission = json.loads(result.read_text(encoding="utf-8"))
    if emission.get("stage") != "emitted":
        raise RuntimeError("Blender did not emit a GLB")
    missing = [row["name"] for row in emission["materials"] if not row["hasLinkedSurface"]]
    receipt = {
        "schema": "ggd.jump-force-dai-sourceio-conversion-receipt@1",
        "source": {"absolutePath": str(model), "relativePath": model.relative_to(intake).as_posix(), **source_record},
        "toolchain": {"blender": str(blender.resolve()), "sourceio": str(sourceio.resolve()), "sourceioCommit": commit},
        "output": {"absolutePath": str(output), "bytes": output.stat().st_size, "sha256": sha256(output)},
        "blenderEmission": {"absolutePath": str(result), "bytes": result.stat().st_size, "sha256": sha256(result)},
        "blenderLog": {"absolutePath": str(root / 'blender.log'), "bytes": (root / 'blender.log').stat().st_size, "sha256": sha256(root / 'blender.log')},
        "metrics": {"meshObjectCount": len(emission["meshObjects"]), "triangleCount": sum(row["polygons"] for row in emission["meshObjects"]), "boneCounts": [row["bones"] for row in emission["armatures"]], "actionCount": len(emission["actions"]), "materialCount": len(emission["materials"]), "unsupportedMaterialCount": len(missing), "unsupportedMaterials": missing},
        "status": "sourceio-raw-intermediate-pending-material-rebuild-decimation-and-visual-review",
        "limitations": ["SourceIO VMT patch chains without their shared base material are not rendered as equivalent PBR materials.", "This output retains Source 1 mesh/armature geometry only; it exceeds the GGD triangle budget and is not a candidate for registration.", "Source sequence metadata and any generated Blender action are not accepted GGD action semantics without separate review."],
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"output": str(output), "receipt": str(receipt_path), "check": False, "status": receipt["status"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--source-folder", default="lead-dai-jumpforce-l4d2-2298782931-2298782931")
    parser.add_argument("--stem", default="models/survivors/survivor_coach")
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--blender", type=Path, default=DEFAULT_BLENDER)
    parser.add_argument("--sourceio", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sourceio = args.sourceio or args.workspace.resolve() / "GGD-Asset-Library/source-tools/SourceIO-5.5.4"
    output_root = args.output_root or args.workspace.resolve() / "GGD-Asset-Library/conversions/jump-force-dai-l4d2-sourceio-v1"
    print(json.dumps(emit(args.workspace.resolve(), args.source_folder, args.stem, output_root, args.blender.resolve(), sourceio.resolve(), args.check), ensure_ascii=False))


if __name__ == "__main__":
    main()
