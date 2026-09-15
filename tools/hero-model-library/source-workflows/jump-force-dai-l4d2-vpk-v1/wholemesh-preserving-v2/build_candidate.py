#!/usr/bin/env python3
"""Build a non-destructive, whole-object topology-preserving JUMP FORCE Dai L4D2 candidate.

This is intentionally a new stage.  It leaves material-rebuild v3 and failed
run-f/g/i untouched.  Blender processes each original skinned mesh as a whole;
material/UV/seam/sharp boundaries prevent the former per-material split from
opening seams between clothes and body.  Shape keys must be reduced to the
bind-pose Basis before topology changes, and that limitation is carried into
the receipt rather than being silently hidden.

Run from the host:
  python3 build_candidate.py [--stage DIR] [--check]

The script calls Blender in factory-startup mode and creates only a fresh
`run-a-wholemesh-preserve-boundaries` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
WORKSPACE = REPO.parent
ASSET_LIBRARY = WORKSPACE / "GGD-Asset-Library"
DEFAULT_STAGE = ASSET_LIBRARY / "conversions/jump-force-dai-l4d2-topology-preserving-v2"
INPUT = ASSET_LIBRARY / "conversions/jump-force-dai-l4d2-material-rebuild-v3/candidate-material-rebuilt-89833.glb"
INPUT_SHA256 = "963d392eeba652af1aafa448abf83eae3a8a6502f6dbaa932a6b584c3d94c4f1"
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
RUN_NAME = "run-a-wholemesh-preserve-boundaries"
# Whole objects are kept intact; the distribution preserves silhouette-critical
# hair/head/face and garment transitions while still leaving a 379 triangle
# safety margin below the <8,000 policy.  Targets are caps, not claims.
OBJECT_TARGETS = {
    "hairJ.smd": 1300,
    "3.smd": 1150,
    "arms.smd": 900,
    "pants.smd": 800,
    "2.smd": 650,
    "4.smd": 550,
    "face.smd": 850,
    "hair1.smd": 350,
    "shirtrip.smd": 270,
    "eyes.smd": 240,
    "hair2.smd": 160,
    "legs.smd": 200,
    "up.smd": 120,
    "glass1.smd": 60,
    "glass.smd": 20,
}
MAX_TRIANGLES = 8000


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def glb_json_and_bin(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError("not glTF 2 binary: " + str(path))
    json_length, json_tag = struct.unpack_from("<II", raw, 12)
    if json_tag != 0x4E4F534A:
        raise ValueError("missing JSON GLB chunk")
    doc = json.loads(raw[20:20 + json_length])
    chunk = 20 + ((json_length + 3) // 4) * 4
    bin_length, bin_tag = struct.unpack_from("<II", raw, chunk)
    if bin_tag != 0x004E4942:
        raise ValueError("missing BIN GLB chunk")
    return doc, raw[chunk + 8:chunk + 8 + bin_length]


def image_bytes(doc: dict, binary: bytes, image: dict) -> bytes:
    if "bufferView" not in image:
        raise ValueError("external/unembedded image prohibited")
    view = doc["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def triangle_count(doc: dict) -> int:
    return sum(doc["accessors"][primitive["indices"]]["count"] // 3
               for mesh in doc.get("meshes", []) for primitive in mesh.get("primitives", []))


def joint_tree(doc: dict) -> tuple[list[str], dict[str, str | None]]:
    if len(doc.get("skins", [])) != 1:
        raise ValueError("candidate must have exactly one skin")
    nodes = doc.get("nodes", [])
    names = [nodes[index].get("name") for index in doc["skins"][0].get("joints", [])]
    if any(not isinstance(name, str) for name in names) or len(names) != len(set(names)):
        raise ValueError("skin joint names are absent or ambiguous")
    parent: dict[str, str | None] = {name: None for name in names}
    for parent_index, node in enumerate(nodes):
        for child_index in node.get("children", []):
            child_name = nodes[child_index].get("name")
            if child_name in parent:
                parent[child_name] = node.get("name")
    return names, parent


def material_signatures(doc: dict) -> list[tuple]:
    names = []
    for material in doc.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        base = pbr.get("baseColorTexture")
        image_name = None
        if base:
            texture = doc["textures"][base["index"]]
            image_name = doc["images"][texture["source"]].get("name")
        names.append((material.get("name"), material.get("alphaMode", "OPAQUE"), bool(material.get("doubleSided", False)), image_name))
    return sorted(names)


def validate(source: Path, candidate: Path) -> dict:
    source_doc, source_bin = glb_json_and_bin(source)
    doc, binary = glb_json_and_bin(candidate)
    source_joints, source_parents = joint_tree(source_doc)
    joints, parents = joint_tree(doc)
    edges = []
    embedded = 0
    for image in doc.get("images", []):
        with Image.open(BytesIO(image_bytes(doc, binary, image))) as decoded:
            edges.append(max(decoded.size))
            embedded += 1
    primitives = [primitive for mesh in doc.get("meshes", []) for primitive in mesh.get("primitives", [])]
    skinned = sum("JOINTS_0" in p.get("attributes", {}) and "WEIGHTS_0" in p.get("attributes", {}) for p in primitives)
    actual_triangles = triangle_count(doc)
    result = {
        "candidate": pin(candidate),
        "triangleCount": actual_triangles,
        "drawPrimitives": len(primitives),
        "meshCount": len(doc.get("meshes", [])),
        "materialCount": len(doc.get("materials", [])),
        "embeddedImageCount": embedded,
        "maxTextureEdge": max(edges, default=0),
        "skinCount": len(doc.get("skins", [])),
        "jointCount": len(joints),
        "animationCount": len(doc.get("animations", [])),
        "skinnedPrimitives": skinned,
        "allPrimitivesSkinned": skinned == len(primitives),
        "jointNamesAndHierarchyEquivalent": source_joints == joints and source_parents == parents,
        "materialAndBaseTextureSlotsEquivalent": material_signatures(source_doc) == material_signatures(doc),
        "budget": {"decimateWhenTrianglesAbove": 10000, "requiredOutputBelow": MAX_TRIANGLES,
                   "trianglePassed": actual_triangles < MAX_TRIANGLES,
                   "texturePassed": max(edges, default=0) <= 256},
    }
    required = (result["triangleCount"] < MAX_TRIANGLES, result["maxTextureEdge"] <= 256,
                result["skinCount"] == 1, result["allPrimitivesSkinned"],
                result["jointNamesAndHierarchyEquivalent"], result["materialAndBaseTextureSlotsEquivalent"])
    if not all(required):
        raise ValueError("structural preservation/budget validation failed: " + json.dumps(result, ensure_ascii=False))
    return result


def blender_driver(source: Path, output: Path, detail: Path) -> str:
    return f'''import bpy, json, hashlib, sys
from pathlib import Path
SOURCE=Path({str(source)!r}); OUTPUT=Path({str(output)!r}); DETAIL=Path({str(detail)!r})
TARGETS={OBJECT_TARGETS!r}
def sha(path):
 h=hashlib.sha256()
 with path.open("rb") as f:
  for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
 return h.hexdigest()
def triangles(obj): return sum(max(0,len(poly.vertices)-2) for poly in obj.data.polygons)
def material_rows(obj):
 rows=[]
 for i in sorted(set(poly.material_index for poly in obj.data.polygons)):
  material=obj.data.materials[i] if i < len(obj.data.materials) else None
  rows.append({{"index":i,"name":material.name if material else "<unassigned>","triangles":sum(max(0,len(poly.vertices)-2) for poly in obj.data.polygons if poly.material_index==i)}})
 return rows
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
removed=[]; records=[]
for obj in list(bpy.context.scene.objects):
 if obj.type=="MESH" and obj.name.startswith("Icosphere"):
  removed.append({{"object":obj.name,"triangles":triangles(obj),"reason":"unskinned SourceIO helper excluded from character candidate"}})
  bpy.data.objects.remove(obj,do_unlink=True)
meshes=[obj for obj in bpy.context.scene.objects if obj.type=="MESH"]
if set(obj.name for obj in meshes)!=set(TARGETS):
 raise RuntimeError("unexpected render mesh names: "+repr(sorted(obj.name for obj in meshes)))
for obj in meshes:
 before=triangles(obj); before_materials=material_rows(obj)
 keys=[] if obj.data.shape_keys is None else [k.name for k in obj.data.shape_keys.key_blocks]
 # Topology cannot change while retaining morph-key topology.  The bind-pose
 # Basis stays in mesh data; all 28 non-Basis expression targets are removed.
 if obj.data.shape_keys is not None:
  bpy.context.view_layer.objects.active=obj
  while obj.data.shape_keys is not None:
   obj.active_shape_key_index=len(obj.data.shape_keys.key_blocks)-1
   bpy.ops.object.shape_key_remove(all=False)
 # First reduce only co-planar triangulation.  It keeps material/UV/seam/sharp
 # boundaries, hence does not detach neighbouring material parts.
 bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active=obj
 dissolve=obj.modifiers.new("GGD_planar_preserve_boundaries","DECIMATE")
 dissolve.decimate_type="DISSOLVE"; dissolve.angle_limit=0.0872664626
 dissolve.delimit={{"UV","MATERIAL","SEAM","SHARP","NORMAL"}}
 bpy.ops.object.modifier_move_to_index(modifier=dissolve.name,index=0)
 bpy.ops.object.modifier_apply(modifier=dissolve.name)
 after_dissolve=triangles(obj)
 target=TARGETS[obj.name]
 if after_dissolve>target:
  collapse=obj.modifiers.new("GGD_whole_mesh_boundary_preserving_collapse","DECIMATE")
  collapse.decimate_type="COLLAPSE"; collapse.ratio=max(0.001,target/after_dissolve)
  collapse.use_collapse_triangulate=True
  collapse.delimit={{"UV","MATERIAL","SEAM","SHARP","NORMAL"}}
  bpy.ops.object.modifier_move_to_index(modifier=collapse.name,index=0)
  bpy.ops.object.modifier_apply(modifier=collapse.name)
 after=triangles(obj)
 records.append({{"object":obj.name,"trianglesBefore":before,"trianglesAfterPlanarDissolve":after_dissolve,"target":target,"trianglesAfter":after,"materialRowsBefore":before_materials,"materialRowsAfter":material_rows(obj),"shapeKeysBefore":keys,"shapeKeysAfter":[]}})
total=sum(row["trianglesAfter"] for row in records)
if total>=8000: raise RuntimeError(f"whole-mesh target missed: {{total}}")
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format="GLB",export_animations=True,export_cameras=False,export_lights=False,export_yup=True)
if not OUTPUT.is_file() or OUTPUT.stat().st_size==0: raise RuntimeError("GLB export failed")
DETAIL.write_text(json.dumps({{"schema":"ggd.jump-force-dai-l4d2-wholemesh-topology-driver@1","blender":bpy.app.version_string,"source":{{"absolutePath":str(SOURCE),"sha256":sha(SOURCE)}},"output":{{"absolutePath":str(OUTPUT),"bytes":OUTPUT.stat().st_size,"sha256":sha(OUTPUT)}},"method":{{"objectsDecimatedAsWhole":True,"boundaryDelimits":["UV","MATERIAL","SEAM","SHARP","NORMAL"],"planarDissolveAngleRadians":0.0872664626,"collapseAppliedBeforeArmatureModifier":True}},"excludedHelpers":removed,"shapeKeyPolicy":{{"sourceExpressionTargets":29,"result":"basis-bind-pose-only","reason":"topology-changing collapse cannot preserve differing morph target topology"}},"records":records,"trianglesBefore":sum(row["trianglesBefore"] for row in records),"trianglesAfter":total}},ensure_ascii=False,indent=2)+"\\n")
print("JUMP_L4D2_WHOLEMESH "+json.dumps({{"trianglesAfter":total,"outputSha256":sha(OUTPUT)}}))
'''


def build(stage: Path, check: bool) -> dict:
    stage = stage.resolve()
    run = stage / RUN_NAME
    output = run / "candidate-under-8000.glb"
    driver = run / "blender-driver.py"
    driver_detail = run / "blender-result.json"
    receipt = run / "receipt.json"
    if not INPUT.is_file() or sha256(INPUT) != INPUT_SHA256:
        raise ValueError("material-rebuilt v3 input is absent or hash-drifted")
    if check:
        if not receipt.is_file() or not output.is_file() or not driver_detail.is_file():
            raise FileNotFoundError("candidate stage incomplete")
        saved = json.loads(receipt.read_text())
        current = validate(INPUT, output)
        if saved.get("candidate", {}).get("sha256") != current["candidate"]["sha256"]:
            raise ValueError("candidate receipt hash drift")
        return {"check": True, **current}
    if run.exists():
        raise FileExistsError("refusing to overwrite a conversion stage: " + str(run))
    run.mkdir(parents=True)
    driver.write_text(blender_driver(INPUT.resolve(), output.resolve(), driver_detail.resolve()), encoding="utf-8")
    command = [str(BLENDER), "--background", "--factory-startup", "--python-exit-code", "41", "--python", str(driver), "--"]
    process = subprocess.run(command, text=True, capture_output=True, check=False, timeout=600)
    (run / "blender.log").write_text(process.stdout + process.stderr, encoding="utf-8")
    if process.returncode != 0 or not output.is_file() or not driver_detail.is_file():
        raise RuntimeError(f"Blender candidate build failed exit={process.returncode}; see {run / 'blender.log'}")
    detail = json.loads(driver_detail.read_text())
    validated = validate(INPUT, output)
    receipt_data = {
        "schema": "ggd.jump-force-dai-l4d2-wholemesh-topology-preserving@2",
        "status": "converted-under-8000-wholemesh-preserve-boundaries-pending-khronos-budget-webgl-and-owner-visual-review",
        "source": pin(INPUT),
        "candidate": validated.pop("candidate"),
        "toolchain": {"blender": detail["blender"], "blenderExecutable": str(BLENDER)},
        "policy": {"decimateWhenTrianglesAbove": 10000, "requiredOutputBelow": 8000,
                   "textureMaxEdge": 256, "method": detail["method"]},
        "driver": pin(driver_detail),
        "blenderLog": pin(run / "blender.log"),
        "excludedHelpers": detail["excludedHelpers"],
        "shapeKeyPolicy": detail["shapeKeyPolicy"],
        "records": detail["records"],
        "trianglesBefore": detail["trianglesBefore"],
        "trianglesAfter": detail["trianglesAfter"],
        "structuralValidation": validated,
        "limitations": [
            "Source expression shape keys were reduced to bind-pose Basis because topology-changing decimation cannot retain their topology.",
            "This remains a conversion candidate: no native action/event semantics, owner visual acceptance, backend registration, dropdown option, runtime selectability, or deployment is implied.",
        ],
    }
    receipt.write_text(json.dumps(receipt_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"check": False, **validated, "candidate": receipt_data["candidate"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=Path, default=DEFAULT_STAGE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build(args.stage, args.check), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
