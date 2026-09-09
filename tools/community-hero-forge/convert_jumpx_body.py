#!/usr/bin/env python3
"""Convert selected JUMPX body meshes with real weights and native animation.

Native layout reference: Gamepiaynmo/JumpXToolchain, MIT, Copyright 2023
Gamepiaynmo. Full notice: library-bodies/JumpXToolchain.LICENSE.
This implementation uses the documented binary structures; it does not invoke
the Windows converter or use the inventory's static OBJ as a rigged model.
Only float animation keys are supported. Packed rotation is rejected explicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

from prepare_mba_body import encode_glb


BIAS = 1_000_000_000


def unpack(fmt, data, offset):
    if offset < 0 or offset + struct.calcsize(fmt) > len(data):
        raise ValueError("Native data offset outside file")
    return struct.unpack_from(fmt, data, offset)


def text(data, offset):
    if not 0 <= offset < len(data):
        raise ValueError("String offset outside native header")
    end = data.find(b"\0", offset)
    raw = data[offset:end if end >= 0 else len(data)]
    for encoding in ("utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise ValueError("Native name cannot be decoded")


def native(raw):
    if len(raw) > 64 * 1024 * 1024 or not raw.startswith(b"JUMPX"):
        raise ValueError("Expected a bounded original JUMPX file")
    version, length = unpack("<2I", raw, 80)
    if length % 12 or length > 4096 or version not in (6, 7, 8):
        raise ValueError("Unsupported JUMPX header")
    fields = {}
    for at in range(88, 88 + length, 12):
        key, size, value = unpack("<4s2I", raw, at)
        if size != 4:
            raise ValueError("Unknown header field size")
        fields[key.decode("ascii")] = value
    at = 88 + length
    head_size, data_size, head_comp, data_comp = unpack("<4I", raw, at)
    if max(head_size, data_size) > 128 * 1024 * 1024 or at + 16 + head_comp + data_comp != len(raw):
        raise ValueError("Invalid native compressed sections")

    def inflate(chunk, size):
        inflater = zlib.decompressobj()
        data = inflater.decompress(chunk, size + 1)
        if len(data) != size or not inflater.eof or inflater.unconsumed_tail or inflater.unused_data:
            raise ValueError("Native inflated size mismatch")
        return data

    at += 16
    head = inflate(raw[at:at + head_comp], head_size)
    data = inflate(raw[at + head_comp:], data_size)
    if not 0 < fields["nbon"] <= 512 or not 0 < fields["ngeo"] <= 512 or not 0 < fields["nact"] <= 512:
        raise ValueError("Unexpected native model complexity")
    return version, fields, head, data


def rotation_matrix(quaternion):
    x, y, z, w = np.asarray(quaternion, dtype=float)
    norm = math.sqrt(x*x + y*y + z*z + w*w)
    if not math.isfinite(norm) or norm < 1e-8:
        raise ValueError("Invalid native quaternion")
    x, y, z, w = x / norm, y / norm, z / norm, w / norm
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def decompose(matrix):
    translation = matrix[:3, 3].copy()
    scale = np.linalg.norm(matrix[:3, :3], axis=0)
    if np.min(scale) < 1e-8:
        raise ValueError("Singular native bone transform")
    rotation = matrix[:3, :3] / scale
    if np.linalg.det(rotation) < 0:
        scale[0] *= -1
        rotation[:, 0] *= -1
    if not np.allclose(rotation.T @ rotation, np.eye(3), atol=2e-4):
        raise ValueError("Native local transform contains shear")
    # Stable matrix -> quaternion, including half-turns where trace ~= -1.
    trace = np.trace(rotation)
    if trace > 0:
        s = math.sqrt(trace + 1) * 2
        q = np.array([(rotation[2, 1]-rotation[1, 2])/s, (rotation[0, 2]-rotation[2, 0])/s, (rotation[1, 0]-rotation[0, 1])/s, s/4])
    else:
        i = int(np.argmax(np.diag(rotation))); j, k = (i+1) % 3, (i+2) % 3
        s = math.sqrt(max(0, 1 + rotation[i, i] - rotation[j, j] - rotation[k, k])) * 2
        q = np.zeros(4)
        q[i] = s/4; q[j] = (rotation[j, i]+rotation[i, j])/s; q[k] = (rotation[k, i]+rotation[i, k])/s; q[3] = (rotation[k, j]-rotation[j, k])/s
    q /= np.linalg.norm(q)
    if not np.allclose(rotation_matrix(q) @ np.diag(scale), matrix[:3, :3], atol=2e-4):
        raise ValueError("Bone TRS round trip failed")
    return translation, q, scale


# Unit-scale noise from native float global -> local matrix decomposition.
# Runtime comparison still requires every sampled weighted vertex within 0.2 mm.
STATIC_CHANNEL_TOLERANCE = 1e-6


def optimize_static_channels(all_tracks, nodes, bone_map):
    """Omit only globally static properties; preserve resets across clip switches."""
    static = set()
    for bone, node in bone_map.items():
        for column, path in enumerate(("translation", "rotation", "scale")):
            arrays = [np.asarray(tracks[bone][column]) for tracks in all_tracks.values()]
            reference = arrays[0][0]
            if path == "rotation":
                # q and -q encode exactly the same orientation.
                arrays = [a * np.where(a @ reference < 0, -1, 1)[:, None] for a in arrays]
            if all(np.allclose(array, reference, rtol=0, atol=STATIC_CHANNEL_TOLERANCE) for array in arrays):
                nodes[node][path] = reference.tolist()
                static.add((bone, path))
    return static


def normalize_palette(count, ids, weights, bone_count):
    weights = np.asarray(weights, dtype=float).copy()
    if not 0 < count <= 4 or np.any(weights < 0) or not np.all(np.isfinite(weights)):
        raise ValueError("Invalid native bone palette")
    weights[count:] = 0
    live = [j for j in range(count) if weights[j] > 0]
    if not live:
        raise ValueError("Unweighted native vertex")
    if any(not 0 <= ids[j] < bone_count for j in live):
        raise ValueError("Weighted joint outside native skeleton")
    # Some exporters leave 255 or unrelated FX joints in zero-weight slots.
    # They have no influence; never retain them as actual skin dependencies.
    return [ids[j] if weights[j] > 0 else ids[live[0]] for j in range(4)], weights/sum(weights)


def convert(raw, mesh_ids, clip_names, texture_rows, fps, flatten_hierarchy=False, repair_key_bones=()):
    version, fields, head, data = native(raw)
    if not 0 < fps <= 120 or len(set(mesh_ids)) != len(mesh_ids) or not 0 < len(mesh_ids) <= 5:
        raise ValueError("Choose 1-5 unique body meshes and an explicit frame rate")
    bones = []
    affine_error = 0.0
    for i in range(fields["nbon"]):
        at = fields["abon"] + i * 172
        _, flags, name, parent, frame_count, _ = unpack("<3I2iI", head, at)
        matrix = np.array(unpack("<16f", head, at + 24)).reshape(4, 4).T
        error = float(np.max(np.abs(matrix[3] - [0, 0, 0, 1])))
        if error > 1e-5:
            raise ValueError("Native inverse bind matrix is not affine")
        affine_error = max(affine_error, error)
        # Native rendering uses a 4x3 matrix; canonicalize the omitted affine
        # row instead of carrying its exporter rounding into strict glTF.
        matrix[3] = [0, 0, 0, 1]
        keys = unpack("<14I", head, at + 116)
        bones.append({"name": text(head, name), "parent": parent, "inverse": matrix, "keys": keys, "frames": frame_count, "flags": flags})
    clips = {}
    for i in range(fields["nact"]):
        name, start, end, *_ = unpack("<80s5h", head, fields["aact"] + 90*i)
        name = text(name, 0)
        if name in clips:
            if name in clip_names:
                raise ValueError("Selected native clip name is ambiguous")
            continue
        clips[name] = (start, end)
    if any(name not in clips for name in clip_names):
        raise ValueError("Selected clip is absent")

    # JUMPX is Max Z-up. Conjugate both bind and animated transforms, so the
    # hierarchy and weighted world pose survive conversion to glTF Y-up metres.
    basis = np.array([[0.01, 0, 0, 0], [0, 0, 0.01, 0], [0, -0.01, 0, 0], [0, 0, 0, 1]])
    inverse_basis = np.linalg.inv(basis)
    direction = basis[:3, :3] / 0.01
    meshes, needed = [], set()
    for index in mesh_ids:
        if not 0 <= index < fields["ngeo"]:
            raise ValueError("Body mesh index out of range")
        g = unpack("<24I", head, fields["ageo"] + index*124)
        if g[1] != 64 or not 0 < g[7] < 100_000 or not 0 < g[8] < 100_000:
            raise ValueError("Only float geometry with original bone palettes is supported")
        position = np.array(unpack(f"<{g[7]*3}f", data, g[9]-BIAS)).reshape(-1, 3)
        normals = np.array(unpack(f"<{g[7]*3}f", data, g[11]-BIAS)).reshape(-1, 3)
        uv = np.array(unpack(f"<{g[7]*2}f", data, g[13]-BIAS)).reshape(-1, 2)
        if not all(np.all(np.isfinite(a)) for a in (position, normals, uv)) or np.max(np.abs(normals)) > 2 or np.max(np.abs(position)) > 1_000_000:
            raise ValueError("Unsupported or corrupt native float geometry (positions, normals or UVs)")
        indices = np.array(unpack(f"<{g[8]*3}H", data, g[19]-BIAS))
        if max(indices) >= len(position):
            raise ValueError("Triangle outside vertex array")
        joints, weights = [], []
        for vertex in range(g[7]):
            at = g[23]-BIAS + vertex*24
            count, *ids = unpack("<5B", data, at)
            ids, weight = normalize_palette(count, ids, unpack("<4f", data, at + 8), len(bones))
            weights.append(weight); joints.append(ids)
            needed.update(i for i, w in zip(ids, weight) if w > 0)
        meshes.append({"index": index, "name": text(head, g[2]), "material": g[4], "ancestor": g[22], "positions": position @ basis[:3, :3].T, "normals": normals @ direction.T, "uv": uv, "indices": indices, "joints": np.array(joints), "weights": np.array(weights)})
    used_names = set()
    for mesh in meshes:
        mesh["sourceName"] = mesh["name"]
        if not mesh["name"] or mesh["name"] in used_names:
            mesh["name"] = f"native-mesh-{mesh['index']}"
        used_names.add(mesh["name"])
    for joint in ([] if flatten_hierarchy is True else list(needed)):
        seen = set()
        parent = bones[joint]["parent"]
        while parent >= 0:
            if parent >= len(bones) or parent in seen:
                raise ValueError("Invalid native bone hierarchy")
            seen.add(parent); needed.add(parent); parent = bones[parent]["parent"]
    kept = sorted(needed)
    bone_map = {old: new for new, old in enumerate(kept)}
    bind_global = {i: basis @ np.linalg.inv(bones[i]["inverse"]) @ inverse_basis for i in kept}
    detached = set(kept) if flatten_hierarchy is True else set()
    if flatten_hierarchy == "repair":
        def raw_key(bone, ci, ai, width, frame, default):
            count, address = bone["keys"][ci], bone["keys"][ai]
            if not count: return np.array(default, dtype=float)
            if not address or (count != 1 and frame >= count):
                raise ValueError("Unsupported native key layout during hierarchy repair")
            return np.array(unpack("<"+"f"*width, data, address-BIAS+(0 if count==1 else frame)*width*4))
        def mark_shear(poses):
            for i in kept:
                parent=bones[i]["parent"]
                if parent<0 or i in detached: continue
                try: decompose(np.linalg.inv(poses[parent]) @ poses[i])
                except ValueError as error:
                    if str(error) not in ("Native local transform contains shear", "Bone TRS round trip failed"): raise
                    detached.add(i)
        mark_shear(bind_global)
        frames=sorted({frame for name in clip_names for frame in range(*clips[name])})
        for frame in frames:
            poses={}
            for i in kept:
                bone=bones[i];q=raw_key(bone,9,10,4,frame,[0,0,0,1]);q[:3]*=-1
                m=np.eye(4);m[:3,:3]=rotation_matrix(q) @ np.diag(raw_key(bone,12,13,3,frame,[1,1,1]));m[:3,3]=raw_key(bone,6,7,3,frame,[0,0,0])
                poses[i]=basis @ m @ inverse_basis
            mark_shear(poses)
    nodes = []
    for i in kept:
        parent = -1 if i in detached else bones[i]["parent"]
        local = np.linalg.inv(bind_global[parent]) @ bind_global[i] if parent >= 0 else bind_global[i]
        pos, rot, scale = decompose(local)
        nodes.append({"name": bones[i]["name"], "translation": pos.tolist(), "rotation": rot.tolist(), "scale": scale.tolist(), "extras": {"jumpxBone": i, "nativeParent": bones[i]["parent"]}})
    for i in kept:
        if i not in detached and bones[i]["parent"] >= 0:
            nodes[bone_map[bones[i]["parent"]]].setdefault("children", []).append(bone_map[i])
    roots = [bone_map[i] for i in kept if i in detached or bones[i]["parent"] < 0]
    scene_roots = roots.copy()
    if len(roots) > 1:
        scene_roots = [len(nodes)]
        nodes.append({"name": "native-rig-root", "children": roots})
    doc = {"asset": {"version": "2.0", "generator": "GGD native JUMPX body conversion"}, "scene": 0, "scenes": [{"nodes": scene_roots.copy()}], "nodes": nodes, "meshes": [], "skins": [], "animations": [], "accessors": [], "bufferViews": [], "buffers": [], "materials": [], "images": [], "textures": [], "extensionsUsed": ["KHR_materials_unlit"]}
    binary = bytearray()

    def view(raw_bytes, target=None):
        binary.extend(bytes(-len(binary) % 4))
        entry = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw_bytes)}
        if target is not None:
            entry["target"] = target
        binary.extend(raw_bytes); doc["bufferViews"].append(entry)
        return len(doc["bufferViews"])-1

    def accessor(array, kind, target=None, integer=False):
        array = np.asarray(array, dtype="<u2" if integer else "<f4")
        if not np.all(np.isfinite(array)):
            raise ValueError("Nonfinite glTF accessor")
        result = {"bufferView": view(array.tobytes(), target), "componentType": 5123 if integer else 5126, "type": kind, "count": len(array)}
        if kind in ("VEC3", "SCALAR"):
            flat = array.reshape(len(array), -1)
            result.update(min=flat.min(axis=0).tolist(), max=flat.max(axis=0).tolist())
        doc["accessors"].append(result)
        return len(doc["accessors"])-1

    material_map, texture_proof = {}, []
    for mid in dict.fromkeys(mesh["material"] for mesh in meshes):
        if not 0 <= mid < fields["nmtl"]:
            raise ValueError("Unknown native material")
        tex_index = unpack("<i", head, fields["amtl"] + 48*mid + 12)[0]
        if not 0 <= tex_index < fields["ntex"]:
            raise ValueError("Material has no diffuse texture")
        declared = text(head, unpack("<2I", head, fields["atex"] + 8*tex_index)[1])
        row = texture_rows[str(mid)]
        path = Path(row["path"])
        if not row.get("exists_local") or row.get("kind") != "texture" or row.get("readiness") not in ("native", "converted") or not path.is_absolute() or not path.is_file() or Path(declared).stem.casefold() != path.stem.casefold():
            raise ValueError("Texture selection does not match the native material reference")
        raw_texture = path.read_bytes()
        with Image.open(io.BytesIO(raw_texture)) as image:
            if max(image.size) > 2048:
                raise ValueError("Diffuse texture exceeds body budget")
            image = image.convert("RGBA")
            image_bytes = io.BytesIO(); image.save(image_bytes, format="PNG")
            transparent = image.getextrema()[3][0] < 255
        texture = len(doc["images"])
        doc["images"].append({"mimeType": "image/png", "bufferView": view(image_bytes.getvalue())})
        doc["textures"].append({"source": texture})
        material_map[mid] = len(doc["materials"])
        doc["materials"].append({"name": declared, "pbrMetallicRoughness": {"baseColorTexture": {"index": texture}, "metallicFactor": 0, "roughnessFactor": 1}, "extensions": {"KHR_materials_unlit": {}}, "doubleSided": True, "alphaMode": "MASK" if transparent else "OPAQUE"})
        texture_proof.append({"asset": row["id"], "nativeReference": declared, "actualPath": str(path), "sha256": hashlib.sha256(raw_texture).hexdigest()})
    ibm = [np.asarray(basis @ bones[i]["inverse"] @ inverse_basis).T.reshape(-1) for i in kept]
    doc["skins"].append({"joints": list(range(len(kept))), "inverseBindMatrices": accessor(ibm, "MAT4")})
    if len(roots) > 1:
        doc["skins"][0]["skeleton"] = scene_roots[0]
    for mesh in meshes:
        joint_ids = np.vectorize(bone_map.__getitem__)(mesh["joints"])
        joint_ids[mesh["weights"] == 0] = 0
        norm = np.linalg.norm(mesh["normals"], axis=1)
        if np.min(norm) < 1e-8:
            raise ValueError("Zero native normal")
        attributes = {"POSITION": accessor(mesh["positions"], "VEC3", 34962), "NORMAL": accessor(mesh["normals"]/norm[:, None], "VEC3", 34962), "TEXCOORD_0": accessor(mesh["uv"], "VEC2", 34962), "JOINTS_0": accessor(joint_ids, "VEC4", 34962, True), "WEIGHTS_0": accessor(mesh["weights"], "VEC4", 34962)}
        doc["meshes"].append({"name": mesh["name"], "primitives": [{"attributes": attributes, "indices": accessor(mesh["indices"], "SCALAR", 34963, True), "material": material_map[mesh["material"]]}]})
        doc["scenes"][0]["nodes"].append(len(nodes))
        nodes.append({"name": mesh["name"], "mesh": len(doc["meshes"])-1, "skin": 0})

    def key(bone, count_index, address_index, width, frame, default):
        count, address = bone["keys"][count_index], bone["keys"][address_index]
        if not count:
            return np.array(default, dtype=float)
        if not address:
            raise ValueError("Packed animation keys require a separate verified decoder")
        if count != 1 and frame >= count:
            raise ValueError("Animation frame outside native keys")
        value = np.array(unpack("<" + "f"*width, data, address-BIAS+(0 if count == 1 else frame)*width*4))
        if not np.all(np.isfinite(value)) and bone['name'] in repair_key_bones:
            if count == 1: raise ValueError('Cannot reconstruct a non-finite constant track')
            # Explicit derivative-only reconstruction. Never alter the native bytes.
            # Interpolate only inside this selected clip; preserve every finite key.
            def sample(at):
                return np.array(unpack('<' + 'f'*width, data, address-BIAS+at*width*4))
            left = next((j for j in range(frame-1, start-1, -1) if np.all(np.isfinite(sample(j)))), None)
            right = next((j for j in range(frame+1, end) if np.all(np.isfinite(sample(j)))), None)
            if left is None and right is None:
                raise ValueError('No finite key in selected clip for '+bone['name'])
            if left is None: value = sample(right)
            elif right is None: value = sample(left)
            else:
                a, b = sample(left), sample(right)
                if width == 4 and np.dot(a, b) < 0: b = -b
                value = a + (b-a) * ((frame-left)/(right-left))
            if width == 4: value /= np.linalg.norm(value)
        return value

    # A rigid weapon's visibility can use its exclusive leaf joint. Refuse a
    # shared joint: hiding it would incorrectly collapse other body geometry.
    visibility = {}
    for mesh in meshes:
        ancestor = mesh["ancestor"]
        if ancestor not in bone_map or not bones[ancestor]["keys"][4]:
            continue
        if np.all(mesh["joints"][:, 0] == ancestor) and np.allclose(mesh["weights"][:, 0], 1):
            if any(bones[i]["parent"] == ancestor for i in kept) or any(other is not mesh and np.any(other["joints"][other["weights"] > 0] == ancestor) for other in meshes):
                raise ValueError("Animated mesh visibility uses a shared bone")
            visibility[ancestor] = bones[ancestor]["keys"]
        else:
            raise ValueError("Nonrigid animated visibility requires separate conversion")

    native_pose_samples = []
    all_tracks = {}
    for name in clip_names:
        start, end = clips[name]
        if start < 0 or end <= start or end-start > fps*300:
            raise ValueError("Invalid native clip range")
        frames = list(range(start, end))
        if len(frames) == 1:
            frames.append(frames[0])
        tracks = {i: [[], [], []] for i in kept}
        for frame_offset, frame in enumerate(frames):
            global_pose, native_pose = {}, {}
            for i in kept:
                bone = bones[i]
                position = key(bone, 6, 7, 3, frame, [0, 0, 0])
                quaternion = key(bone, 9, 10, 4, frame, [0, 0, 0, 1])
                quaternion[:3] *= -1  # Native stored quaternion is the inverse orientation.
                scale = key(bone, 12, 13, 3, frame, [1, 1, 1])
                matrix = np.eye(4); matrix[:3, :3] = rotation_matrix(quaternion) @ np.diag(scale); matrix[:3, 3] = position
                native_pose[i] = matrix
                global_pose[i] = basis @ matrix @ inverse_basis
            if frame_offset in {0, len(frames)//2, len(frames)-1}:
                for mesh in meshes:
                    ancestor = mesh["ancestor"]
                    if ancestor in visibility:
                        keys = visibility[ancestor]
                        if not unpack("<I", data, keys[5]-BIAS+4*(0 if keys[4] == 1 else frame))[0]:
                            continue
                    sample_vertices = sorted(set(np.linspace(0, len(mesh["positions"])-1, min(8, len(mesh["positions"])), dtype=int).tolist()))
                    positions = []
                    for vertex in sample_vertices:
                        native_vertex = inverse_basis @ np.append(mesh["positions"][vertex], 1)
                        deformed = np.zeros(4)
                        for joint, weight in zip(mesh["joints"][vertex], mesh["weights"][vertex]):
                            if weight > 0:
                                deformed += weight * (native_pose[joint] @ bones[joint]["inverse"] @ native_vertex)
                        positions.append((basis @ deformed)[:3].tolist())
                    native_pose_samples.append({"clip": name, "nativeFrame": frame, "seconds": frame_offset/fps, "meshName": mesh["name"], "vertices": sample_vertices, "positions": positions})
            for i in kept:
                parent = -1 if i in detached else bones[i]["parent"]
                local = np.linalg.inv(global_pose[parent]) @ global_pose[i] if parent >= 0 else global_pose[i]
                position, quaternion, scale = decompose(local)
                if tracks[i][1] and np.dot(tracks[i][1][-1], quaternion) < 0:
                    quaternion *= -1
                if i in visibility:
                    keys = visibility[i]; count = keys[4]
                    if count != 1 and frame >= count:
                        raise ValueError("Visibility frame outside native keys")
                    visible = unpack("<I", data, keys[5]-BIAS+4*(0 if count == 1 else frame))[0]
                    scale *= 1 if visible else 0
                for values, value in zip(tracks[i], (position, quaternion, scale)):
                    values.append(value)
        all_tracks[name] = tracks
    static_channels = optimize_static_channels(all_tracks, nodes, bone_map)
    channel_count = len(kept)*3 - len(static_channels)
    if not 0 < channel_count <= 160:
        raise ValueError(f"Selected body needs {channel_count} animation channels after static-channel optimization (limit 160)")
    for name, tracks in all_tracks.items():
        time = accessor(np.arange(len(tracks[kept[0]][0]))/fps, "SCALAR")
        animation = {"name": name, "channels": [], "samplers": []}
        for i in kept:
            for track, path, kind in zip(tracks[i], ("translation", "rotation", "scale"), ("VEC3", "VEC4", "VEC3")):
                if (i, path) in static_channels:
                    continue
                sampler = len(animation["samplers"])
                animation["samplers"].append({"input": time, "output": accessor(track, kind), "interpolation": "STEP" if path == "scale" and i in visibility else "LINEAR"})
                animation["channels"].append({"sampler": sampler, "target": {"node": bone_map[i], "path": path}})
        doc["animations"].append(animation)
    report = {"nativeVersion": version, "nativeInverseAffineMaxError": affine_error, "originalBoneCount": len(bones), "retainedBones": kept, "bodyMeshes": [{"index": m["index"], "name": m["name"], "sourceName": m["sourceName"]} for m in meshes], "excludedMeshIndices": [i for i in range(fields["ngeo"]) if i not in mesh_ids], "originalClipCount": fields["nact"], "nativeFrameRanges": {name: clips[name] for name in clip_names}, "fps": fps, "fpsBasis": "Explicit adaptation setting; bundled native viewer advances at 1/32 s", "coordinateConversion": "Max Z-up to glTF Y-up; 0.01 metres/native unit", "textures": texture_proof, "visibilityLeafBones": list(visibility), "adaptations": ["Selected body/weapon meshes only; native particles and other appearances excluded", "Original weighted joints and ancestors retained; global native poses converted into local glTF hierarchy", "Diffuse textures converted to embedded PNG with unlit double-sided materials"]}
    report["hierarchyMode"] = "global-pose-sibling-joints" if flatten_hierarchy is True else "selective-shear-repair" if detached else "native-parent-hierarchy"
    report["detachedNativeBones"] = sorted(detached)
    if flatten_hierarchy:
        report["adaptations"].append("Bake global joint poses under a common root to avoid local shear; preserve weighted joints, inverse binds and native parent metadata")
    report["nativePoseSamples"] = native_pose_samples
    report["staticChannelOptimization"] = {"before": len(kept)*3, "after": channel_count, "omitted": [{"bone": i, "path": path} for i, path in sorted(static_channels)], "tolerance": STATIC_CHANNEL_TOLERANCE, "policy": "Only values constant across ALL selected clips become node defaults; changing properties stay keyed in every clip to reset sequential playback"}
    return doc, bytes(binary), report


def model_identity(row, config, characters=()):
    """Use the registry's explicit base path when its numeric join is absent.

    Some official character IDs differ from the model filename (104 -> 099.x).
    Preserve that evidence separately; never manufacture an asset character link.
    """
    if row.get("library") != "300heroes" or row.get("kind") != "model" or row.get("format") != "x" or not row.get("exists_local") or row.get("readiness") != "native":
        raise ValueError("Select an available native base model from the registry")
    expected = config.get("characterId")
    official_links = [link for link in row.get("character_links", []) if link.get("confidence") == "official_base_model"]
    links = [link for link in official_links if not expected or link.get("character_id") == expected]
    if links:
        return {"basis": "official_base_model", "links": links}
    if official_links:
        raise ValueError("Selected asset has conflicting official character evidence")
    character = next((item for item in characters if expected and item.get("id") == expected), None)
    if not character or character.get("library") != "300heroes" or not character.get("base_model_present") or character.get("readiness") != "native_and_static_preview" or character.get("base_model") != row.get("path") or character.get("name") != config.get("sourceName") or character.get("origin") != config.get("sourceOrigin"):
        raise ValueError("Selected asset has no matching official character base-model evidence")
    return {"basis": "official_character_base_path", "characterId": expected, "name": character["name"], "origin": character["origin"], "baseModel": character["base_model"], "originSources": character.get("origin_sources", [])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-query", type=Path, required=True)
    parser.add_argument("--texture-query", type=Path, required=True)
    parser.add_argument("--character-query", type=Path, help="Original registry character results, for explicit base paths whose numeric asset join is absent")
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.selection.read_text())
    models = json.loads(args.model_query.read_text())["results"]
    textures = json.loads(args.texture_query.read_text())["results"]
    row = next(r for r in models if r["id"] == config["asset"])
    characters = json.loads(args.character_query.read_text())["results"] if args.character_query else []
    identity = model_identity(row, config, characters)
    source = Path(row["path"])
    if not source.is_absolute() or not source.is_file() or source.stat().st_size > 64*1024*1024 or args.out.resolve() == source.resolve():
        raise ValueError("Source must be local and output must be separate")
    texture_rows = {mid: next(r for r in textures if r["id"] == identifier) for mid, identifier in config["textures"].items()}
    raw = source.read_bytes()
    doc, binary, report = convert(raw, config["meshes"], list(dict.fromkeys(config["clips"].values())), texture_rows, config["fps"], config.get("flattenHierarchy", False))
    output = encode_glb(doc, binary)
    receipt_path = args.out.with_suffix(".receipt.json")
    if args.out.exists() or receipt_path.exists():
        raise ValueError("Choose a new version output path")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("xb") as stream:
        stream.write(output)
    receipt = {"schema": "ggd-library-model-preparation@1", "asset": row["id"], "source": {"path": str(source), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "characterLinks": row["character_links"], "identity": identity}, "output": {"path": str(args.out.resolve()), "sha256": hashlib.sha256(output).hexdigest(), "bytes": len(output)}, "stateClips": config["clips"], "validation": "pending-shared-validator-and-visual-review", **report}
    with receipt_path.open("x") as stream:
        stream.write(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
