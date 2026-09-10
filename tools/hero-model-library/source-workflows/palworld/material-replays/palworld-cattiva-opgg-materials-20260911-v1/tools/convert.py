#!/usr/bin/env python3
"""Bind the frozen PinkCat source material manifest; never alter the intake.

Requires Pillow for lossless decoded WebP -> PNG transcoding. No downloads.
Usage: python convert.py --source <frozen-opgg-root> --viewer <saved-viewer.js>
                         --out <new-empty-result-directory>
"""
import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct

from PIL import Image, __version__ as pillow_version

SOURCE_SHA = "c28f35cf095450f5aa0ecd00a60037197ca6af22694650b3afdeb7ca361d4635"
VIEWER_SHA = "b5af5cb6636397d9a9dd01d3c60c5cbf4f53af6b955848e5bda09471ae82b4dc"
MANIFEST_SHA = "203f743abbae454cfb3693beacd9e7eb67b221e1d3a393f5164f2ea4d422f1b3"
EXPECTED = ["MI_PinkCat_Mouth", "MI_PinkCat_Eye", "MI_PinkCat_Body"]
COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
DIMS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def write_json(path, value):
    with path.open("x") as out:
        out.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def glb_read(data):
    assert struct.unpack_from("<III", data) == (0x46546C67, 2, len(data))
    n, tag = struct.unpack_from("<II", data, 12)
    assert tag == 0x4E4F534A
    doc = json.loads(data[20:20+n])
    m, tag = struct.unpack_from("<II", data, 20+n)
    assert tag == 0x004E4942 and 28+n+m == len(data)
    return doc, data[28+n:28+n+m][:doc["buffers"][0]["byteLength"]]


def glb_write(doc, binary):
    doc["buffers"] = [{"byteLength": len(binary)}]
    j = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    b = bytes(binary) + b"\0" * (-len(binary) % 4)
    return struct.pack("<IIIII", 0x46546C67, 2, 28+len(j)+len(b), len(j), 0x4E4F534A) + j + struct.pack("<II", len(b), 0x004E4942) + b


def accessor_bytes(doc, binary, index):
    a = doc["accessors"][index]
    assert "sparse" not in a, "This bounded converter expects dense source accessors"
    fmt, size = COMP[a["componentType"]]
    width = DIMS[a["type"]] * size
    v = doc["bufferViews"][a["bufferView"]]
    offset = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", width)
    return b"".join(binary[offset+i*stride:offset+i*stride+width] for i in range(a["count"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--viewer", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    source, viewer, out = args.source.resolve(), args.viewer.resolve(), args.out.resolve()
    assert not out.exists(), "Refusing to overwrite an existing conversion"
    data = (source / "decoded/cattiva-quantization-declared.glb").read_bytes()
    assert sha(data) == SOURCE_SHA
    viewer_bytes = viewer.read_bytes()
    assert sha(viewer_bytes) == VIEWER_SHA
    manifest_bytes = (source / "original/materials.json").read_bytes()
    assert sha(manifest_bytes) == MANIFEST_SHA
    manifest = json.loads(manifest_bytes)
    frozen = json.loads((source / "files-sha256.json").read_bytes())
    for entry in frozen["files"]:
        file = (source / entry["path"]).resolve()
        assert file.is_relative_to(source)
        raw = file.read_bytes()
        assert len(raw) == entry["bytes"] and sha(raw) == entry["sha256"], entry["path"]
    original, original_bin = glb_read(data)
    doc = copy.deepcopy(original)
    assert manifest["palId"] == "PinkCat"
    assert [m["name"] for m in doc["materials"]] == EXPECTED
    assert [p["material"] for p in doc["meshes"][0]["primitives"]] == [0, 1, 2]
    assert [a["name"] for a in doc["animations"]] == manifest["animations"]
    assert len(doc["animations"]) == 33 and len(doc["skins"][0]["joints"]) == 43
    assert not doc.get("images") and not doc.get("textures")
    out.mkdir(parents=True)
    (out / "textures").mkdir()
    (out / "evidence").mkdir()
    (out / "evidence/materials.source.json").write_bytes(manifest_bytes)
    (out / "evidence/opgg-viewer.source.js").write_bytes(viewer_bytes)
    binary = bytearray(original_bin)

    def append_view(raw, target=None):
        binary.extend(b"\0" * (-len(binary) % 4))
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw)}
        if target:
            view["target"] = target
        index = len(doc["bufferViews"])
        doc["bufferViews"].append(view)
        binary.extend(raw)
        return index

    normal_changes = []
    # Retain every old accessor and every original byte; append only float normals.
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            index = primitive["attributes"]["NORMAL"]
            a = doc["accessors"][index]
            assert a["componentType"] == 5122 and a["normalized"] and a["type"] == "VEC3"
            raw = accessor_bytes(original, original_bin, index)
            integers = struct.unpack("<" + "h" * (len(raw)//2), raw)
            normalized = [max(v / 32767.0, -1.0) for v in integers]
            floats = struct.pack("<" + "f" * len(normalized), *normalized)
            decoded = struct.unpack("<" + "f" * len(normalized), floats)
            max_error = max(abs(a-b) for a, b in zip(normalized, decoded))
            assert max_error < 3e-8
            new_index = len(doc["accessors"])
            doc["accessors"].append({"bufferView": append_view(floats, 34962), "componentType": 5126, "count": a["count"], "type": "VEC3"})
            primitive["attributes"]["NORMAL"] = new_index
            normal_changes.append({"oldAccessor": index, "newAccessor": new_index, "count": a["count"], "sourceInt16Sha256": sha(raw), "float32Sha256": sha(floats), "maxAbsoluteFloat32RoundingError": max_error})
    assert doc.pop("extensionsRequired") == ["KHR_mesh_quantization"]
    assert doc.pop("extensionsUsed") == ["KHR_mesh_quantization"]

    doc["images"], doc["textures"] = [], []
    # Three.js TextureLoader defaults to linear filtering with mipmaps; viewer repeats UV.
    doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    image_map, image_rows = {}, []
    for material_name in EXPECTED:
        m = manifest["materials"][material_name]
        for key in ("baseColorTexture", "normalTexture", "metallicRoughnessTexture", "specularTexture"):
            path = m.get(key)
            if not path or path in image_map:
                continue
            file = (source / "original" / path).resolve()
            assert file.is_relative_to(source / "original")
            raw = file.read_bytes()
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
            stream = io.BytesIO()
            image.save(stream, "PNG", optimize=False, compress_level=9)
            png = stream.getvalue()
            back = Image.open(io.BytesIO(png)).convert("RGBA")
            assert back.size == image.size and back.tobytes() == image.tobytes()
            name = file.stem + ".png"
            (out / "textures" / name).write_bytes(png)
            index = len(doc["images"])
            doc["images"].append({"name": file.stem, "mimeType": "image/png", "bufferView": append_view(png)})
            doc["textures"].append({"name": file.stem, "source": index, "sampler": 0})
            image_map[path] = index
            histogram = image.getchannel("A").histogram()
            image_rows.append({"sourcePath": str(file), "sourceSha256": sha(raw), "sourceBytes": len(raw), "pngPath": "textures/"+name, "pngSha256": sha(png), "pngBytes": len(png), "width": image.width, "height": image.height, "decodedRgbaSha256": sha(image.tobytes()), "pixelExactRoundTrip": True, "alphaZeroPixels": histogram[0], "alphaOnePixels": histogram[255], "fractionalAlphaPixels": sum(histogram[1:255])})
    assert len(image_rows) == 5

    material_rows = []
    for index, name in enumerate(EXPECTED):
        source_mat = manifest["materials"][name]
        face = name.endswith(("_Eye", "_Mouth"))
        pbr = {"baseColorFactor": [1, 1, 1, 1], "baseColorTexture": {"index": image_map[source_mat["baseColorTexture"]]}, "metallicFactor": source_mat["metalness"], "roughnessFactor": source_mat["roughness"]}
        mat = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": face, "alphaMode": "BLEND" if face else "MASK", "emissiveFactor": source_mat.get("emissiveColor", [0, 0, 0])}
        if not face:
            mat["alphaCutoff"] = 0.3333
        if source_mat.get("normalTexture"):
            mat["normalTexture"] = {"index": image_map[source_mat["normalTexture"]], "scale": 1}
        if source_mat.get("metallicRoughnessTexture"):
            pbr["metallicRoughnessTexture"] = {"index": image_map[source_mat["metallicRoughnessTexture"]]}
        if source_mat.get("renderProfile") == "pal-lit":
            # Proven viewer: F0 = 0.08 * scalar * MROS.alpha.
            # KHR specularColorFactor scales F0, retaining grazing F90=1.
            # specularFactor would incorrectly scale F90 too. The frozen PinkCat
            # MROS alpha is constant 255: retain its original RGBA and reduce the
            # constant specular mask to 1, without making a sixth image.
            factor = source_mat["specular"] * 2
            assert 0 <= factor <= 1
            mask = next(r for r in image_rows if Path(r["sourcePath"]).name == Path(source_mat["specularTexture"]).name)
            assert mask["alphaOnePixels"] == mask["width"] * mask["height"]
            mat["extensions"] = {"KHR_materials_specular": {"specularFactor": 1, "specularColorFactor": [factor] * 3}}
        doc["materials"][index] = mat
        material_rows.append({"mesh": "SK_PinkCat", "primitive": index, "materialIndex": index, "materialName": name, "sourceMaterial": source_mat, "translatedMaterial": mat, "sourceViewerFaceAlphaTest": 0.01 if face else None, "unrepresentedFaceEffects": ["alphaTest 0.01 in addition to alpha blending", "polygonOffset factor/units -4"] if face else []})
    doc["extensionsUsed"] = ["KHR_materials_specular"]
    doc["extensionsRequired"] = ["KHR_materials_specular"]

    # Prove no rig, skin, pose, geometry indices, UV, animation tracks or values changed.
    for key in ("nodes", "skins", "scenes", "scene", "animations"):
        assert doc.get(key) == original.get(key), key
    assert doc["accessors"][:len(original["accessors"])] == original["accessors"]
    assert doc["bufferViews"][:len(original["bufferViews"])] == original["bufferViews"]
    assert bytes(binary[:len(original_bin)]) == original_bin
    track_rows = []
    for a in original["animations"]:
        duration = 0
        tracks = []
        for s in a["samplers"]:
            inputs = accessor_bytes(original, original_bin, s["input"])
            outputs = accessor_bytes(original, original_bin, s["output"])
            assert inputs == accessor_bytes(doc, binary, s["input"])
            assert outputs == accessor_bytes(doc, binary, s["output"])
            duration = max(duration, max(struct.unpack("<"+"f"*(len(inputs)//4), inputs)))
            tracks.append({"inputAccessor": s["input"], "outputAccessor": s["output"], "timeSha256": sha(inputs), "valuesSha256": sha(outputs), "interpolation": s.get("interpolation", "LINEAR")})
        track_rows.append({"name": a["name"], "durationSeconds": duration, "channels": len(a["channels"]), "samplers": tracks})
    result = glb_write(doc, binary)
    (out / "body.glb").write_bytes(result)
    report = {"schema": "ggd.cattiva.material-conversion@1", "sourceRoot": str(source), "sourcePage": "https://op.gg/palworld/pals/cattiva", "sourceDecodedGlbSha256": SOURCE_SHA, "sourceViewerSha256": VIEWER_SHA, "sourceManifestSha256": sha(manifest_bytes), "outputPath": str(out / "body.glb"), "outputSha256": sha(result), "outputBytes": len(result), "pillowVersion": pillow_version, "sourceBinaryPrefixUnchanged": True, "nodesSkinsScenesAnimationsJsonUnchanged": True, "normalChanges": normal_changes, "images": image_rows, "materialBindings": material_rows, "animations": track_rows, "animationCount": len(track_rows), "sourceProvidedMotionCount": len(track_rows), "proceduralMotionCount": 0, "originalUnrealAnimationAssetsAcquired": False, "jointCount": 43, "primitiveCount": 3, "vertexCount": 3567, "triangleCount": 5798, "unrepresentedSourceFeatures": ["Eye/mouth: source viewer combines alpha blend with alphaTest 0.01 and polygon offset -4. Portable GLB preserves BLEND and double-sided rendering; that extra cutoff and depth bias have no core glTF material representation.", "Source Unreal clear-coat and Burley profile metadata are retained in evidence; the OP.GG viewer uses MeshStandardMaterial, and PinkCat has no subsurfaceTexture and a zero subsurfaceColor, so its custom SSS branch is inactive.", "OP.GG colorCorrection metadata is not applied by the verified viewer. Decoded base-color pixels are preserved unchanged.", "Interactive viewer eye-expression texture offsets are not baked into the skeletal animation clips.", "33 source-supplied skeletal clips preserved. No Death clip or GGD state mapping has been invented."], "ggdBackendRegistration": "not-performed", "ggdGameplayAcceptance": "pending"}
    write_json(out / "conversion.json", report)
    print(json.dumps({k: report[k] for k in ("outputPath", "outputSha256", "outputBytes", "animationCount", "jointCount")}, indent=2))


if __name__ == "__main__":
    main()
