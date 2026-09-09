import struct
import tempfile
import unittest
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

from convert_jumpx_body import convert, decompose, native, rotation_matrix, optimize_static_channels, normalize_palette, model_identity, BIAS


def fixture(shear=False):
    head, binary = bytearray(b"fixture\0"), bytearray()

    def h(data):
        at = len(head); head.extend(data); return at

    def d(fmt, values):
        at = len(binary); binary.extend(struct.pack(fmt, *values)); return BIAS + at

    fields = {"ntex": 1, "nmtl": 1, "ngeo": 1, "nbon": 2, "nact": 1}
    texture_name, mesh_name, root_name, child_name = [h(name + b"\0") for name in (b"body.png", b"body", b"Root", b"Child")]
    fields["atex"] = h(struct.pack("<2I", 0, texture_name))
    fields["amtl"] = h(struct.pack("<12I", *([0] * 12)))
    geometry = [0] * 24
    geometry[1:9] = [64, mesh_name, 0, 0, 0, 0, 3, 1]
    geometry[9] = d("<9f", [0, 1, 0, 1, 1, 0, 0, 2, 0])
    geometry[11] = d("<9f", [0, 0, 1] * 3)
    geometry[13] = d("<6f", [0.2, 0.2, 0.8, 0.2, 0.2, 0.8])
    geometry[19] = d("<3H", [0, 1, 2])
    geometry[21:24] = [1, 1, len(binary) + BIAS]
    for _ in range(3):
        binary.extend(struct.pack("<5B3x4f", 1, 1, 0, 0, 0, 1, 0, 0, 0))
    fields["ageo"] = h(struct.pack("<24I", *geometry) + bytes(28))
    bone_headers = []
    for i, name in enumerate((root_name, child_name)):
        inverse = np.eye(4)
        if i:
            inverse[1, 3] = -1
        keys = [0] * 14
        keys[6] = keys[9] = keys[12] = 3
        keys[7] = d("<9f", [0, i, 0, 1, i*2, 0, 2, i, 0])
        keys[10] = d("<12f", ([0, 0, 0.382683432365, 0.923879532511] if shear and i else [0, 0, 0, 1]) * 3)
        keys[13] = d("<9f", ([2, 1, 1] if shear and not i else [1, 1, 1]) * 3)
        bone_headers.append(struct.pack("<3I2iI", 0, 0, name, i-1, 3, 1)
                            + struct.pack("<16f", *inverse.T.reshape(-1))
                            + bytes(28) + struct.pack("<14I", *keys))
    fields["abon"] = h(b"".join(bone_headers))
    fields["aact"] = h(struct.pack("<80s5h", b"idle", 0, 3, 0, 0, 0))
    header = b"".join(struct.pack("<4s2I", key.encode(), 4, value) for key, value in fields.items())
    hc, dc = zlib.compress(head), zlib.compress(binary)
    return b"JUMPX" + bytes(75) + struct.pack("<2I", 8, len(header)) + header + struct.pack("<4I", len(head), len(binary), len(hc), len(dc)) + hc + dc


def values(doc, binary, index, width):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    return np.frombuffer(binary, dtype="<f4", count=accessor["count"]*width, offset=view["byteOffset"]).reshape(-1, width)


class NativeBodyTest(unittest.TestCase):
    def test_selective_repair_detaches_only_joint_with_local_shear(self):
        with tempfile.TemporaryDirectory() as temp:
            image = Path(temp)/"body.png"
            Image.new("RGBA", (4, 4), (100, 20, 200, 255)).save(image)
            row = {"id": "fixture", "path": str(image), "exists_local": True, "kind": "texture", "readiness": "native"}
            with self.assertRaisesRegex(ValueError, "shear|TRS"):
                convert(fixture(shear=True), [0], ["idle"], {"0": row}, 32)
            doc, binary, report = convert(fixture(shear=True), [0], ["idle"], {"0": row}, 32, "repair")
        self.assertEqual(report["detachedNativeBones"], [1])
        self.assertEqual(report["hierarchyMode"], "selective-shear-repair")
        self.assertEqual(len(doc["skins"][0]["joints"]), 2)
        self.assertNotIn(1, doc["nodes"][0].get("children", []))
        self.assertEqual(doc["nodes"][1]["extras"]["nativeParent"], 0)


    def test_character_base_path_resolves_non_numeric_identity_without_guessing(self):
        row = {"library": "300heroes", "kind": "model", "format": "x", "exists_local": True, "readiness": "native", "path": "/library/099.x", "character_links": []}
        config = {"characterId": "300heroes:104", "sourceName": "Gilgamesh", "sourceOrigin": "Fate"}
        character = {"id": "300heroes:104", "library": "300heroes", "name": "Gilgamesh", "origin": "Fate", "base_model_present": True, "base_model": "/library/099.x", "readiness": "native_and_static_preview"}
        self.assertEqual(model_identity(row, config, [character])["basis"], "official_character_base_path")
        self.assertEqual(row["character_links"], [])
        for changed in ({"base_model": "/library/099_skin1.x"}, {"id": "300heroes:105"}, {"base_model_present": False}, {"origin": "Other"}, {"readiness": "missing"}):
            with self.assertRaisesRegex(ValueError, "evidence"):
                model_identity(row, config, [{**character, **changed}])
        with self.assertRaisesRegex(ValueError, "evidence"):
            model_identity(row, config)
        with self.assertRaisesRegex(ValueError, "available"):
            model_identity({**row, "exists_local": False}, config, [character])
        linked = {**row, "character_links": [{"character_id": "300heroes:105", "confidence": "official_base_model"}]}
        with self.assertRaisesRegex(ValueError, "evidence"):
            model_identity(linked, config)
        with self.assertRaisesRegex(ValueError, "conflicting"):
            model_identity(linked, config, [character])

    def test_global_keys_become_correct_local_tracks_with_original_hierarchy(self):
        with tempfile.TemporaryDirectory() as temp:
            image = Path(temp)/"body.png"
            Image.new("RGBA", (4, 4), (100, 20, 200, 255)).save(image)
            row = {"id": "fixture", "path": str(image), "exists_local": True, "kind": "texture", "readiness": "native"}
            doc, binary, report = convert(fixture(), [0], ["idle"], {"0": row}, 32)
        self.assertEqual(doc["nodes"][0]["children"], [1])
        self.assertEqual(report["retainedBones"], [0, 1])
        animation = doc["animations"][0]
        tracks = {(channel["target"]["node"], channel["target"]["path"]): animation["samplers"][channel["sampler"]] for channel in animation["channels"]}
        root = values(doc, binary, tracks[(0, "translation")]["output"], 3)
        child = values(doc, binary, tracks[(1, "translation")]["output"], 3)
        np.testing.assert_allclose(root, [[0, 0, 0], [0.01, 0, 0], [0.02, 0, 0]], atol=1e-8)
        np.testing.assert_allclose(child, [[0, 0, -0.01], [0, 0, -0.02], [0, 0, -0.01]], atol=1e-8)
        primitive = doc["meshes"][0]["primitives"][0]
        np.testing.assert_allclose(values(doc, binary, primitive["attributes"]["POSITION"], 3), [[0, 0, -0.01], [0.01, 0, -0.01], [0, 0, -0.02]], atol=1e-8)
        # At frame 1, child pose + inverse bind moves vertex 0 to (0.01, 0, -0.02).
        ibm = values(doc, binary, doc["skins"][0]["inverseBindMatrices"], 16)[1].reshape(4, 4).T
        global_child = np.eye(4); global_child[:3, 3] = root[1] + child[1]
        point = global_child @ ibm @ [0, 0, -0.01, 1]
        np.testing.assert_allclose(point, [0.01, 0, -0.02, 1], atol=1e-8)

    def test_static_channels_preserve_cross_clip_resets_and_sign_equivalent_rotations(self):
        nodes = [{}]
        tracks = {
            "idle": {0: [[[1, 2, 3], [1, 2, 3]], [[0, 0, 0, 1], [0, 0, 0, -1]], [[1, 1, 1], [1, 1, 1]]]},
            "attack": {0: [[[1, 2, 3], [1, 2, 3]], [[0, 0, 0, -1], [0, 0, 0, 1]], [[2, 2, 2], [2, 2, 2]]]},
        }
        omitted = optimize_static_channels(tracks, nodes, {0: 0})
        self.assertEqual(omitted, {(0, "translation"), (0, "rotation")})
        self.assertEqual(nodes[0]["translation"], [1, 2, 3])
        # Scale is constant INSIDE each clip, but changes between them. Both
        # clips need their original scale keys or switching would retain 2x.
        self.assertNotIn("scale", nodes[0])

    def test_zero_weight_exporter_sentinels_do_not_become_skin_dependencies(self):
        joints, weights = normalize_palette(4, [14, 76, 255, 20], [1, 0, 0, 0], 86)
        self.assertEqual(joints, [14, 14, 14, 14])
        np.testing.assert_array_equal(weights, [1, 0, 0, 0])
        with self.assertRaisesRegex(ValueError, "Weighted joint"):
            normalize_palette(4, [14, 76, 255, 20], [0.5, 0, 0.5, 0], 86)
        with self.assertRaisesRegex(ValueError, "Unweighted"):
            normalize_palette(1, [14, 76, 255, 20], [0, 0, 0, 0], 86)

    def test_half_turns_nonuniform_scale_and_reflections_round_trip(self):
        for quaternion in ([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0.2, -0.4, 0.1, 0.8]):
            for scale in ([2, 1, 0.5], [-1, 2, 1]):
                matrix = np.eye(4); matrix[:3, :3] = rotation_matrix(quaternion) @ np.diag(scale); matrix[:3, 3] = [2, 3, 4]
                t, r, s = decompose(matrix)
                np.testing.assert_allclose(rotation_matrix(r) @ np.diag(s), matrix[:3, :3], atol=1e-10)
                np.testing.assert_allclose(t, [2, 3, 4])

    def test_rejects_truncation_and_non_native_files(self):
        for raw in (fixture()[:-1], b"xof " + bytes(200)):
            with self.assertRaises(ValueError):
                native(raw)


if __name__ == "__main__":
    unittest.main()
