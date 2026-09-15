import importlib.util
import json
import pathlib
import struct
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("recover_staticmesh_dependencies.py")
SPEC = importlib.util.spec_from_file_location("recover_staticmesh_dependencies", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class RecoveryTests(unittest.TestCase):
    def test_stable_tag_is_deterministic(self):
        self.assertEqual(MODULE.stable_tag(7, "/Game/X"), MODULE.stable_tag(7, "/Game/X"))
        self.assertTrue(MODULE.stable_tag(7, "/Game/X").startswith("007-"))

    def test_parse_glb_rejects_invalid_header(self):
        with tempfile.TemporaryDirectory() as root:
            path = pathlib.Path(root) / "bad.glb"
            path.write_bytes(b"bad")
            with self.assertRaises(RuntimeError):
                MODULE.parse_glb(path)

    def test_parse_minimal_mesh_glb(self):
        document = {
            "asset": {"version": "2.0"},
            "accessors": [{"count": 3}, {"count": 3}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        }
        payload = json.dumps(document).encode("utf-8")
        payload += b" " * (-len(payload) % 4)
        total = 12 + 8 + len(payload)
        raw = struct.pack("<4sII", b"glTF", 2, total)
        raw += struct.pack("<II", len(payload), 0x4E4F534A) + payload
        with tempfile.TemporaryDirectory() as root:
            path = pathlib.Path(root) / "ok.glb"
            path.write_bytes(raw)
            _, structure = MODULE.parse_glb(path)
            self.assertEqual(structure["meshes"], 1)
            self.assertEqual(structure["vertices"], 3)
            self.assertEqual(structure["triangles"], 1)

    def test_strip_unused_tangent_binding(self):
        document = {
            "asset": {"version": "2.0"},
            "materials": [{"name": "plain"}],
            "accessors": [{"count": 3}, {"count": 3}, {"count": 3}],
            "meshes": [{"primitives": [{"material": 0, "attributes": {"POSITION": 0, "TANGENT": 1}, "indices": 2}]}],
        }
        payload = json.dumps(document).encode("utf-8")
        payload += b" " * (-len(payload) % 4)
        total = 12 + 8 + len(payload)
        raw = struct.pack("<4sII", b"glTF", 2, total)
        raw += struct.pack("<II", len(payload), 0x4E4F534A) + payload
        with tempfile.TemporaryDirectory() as root:
            path = pathlib.Path(root) / "tangent.glb"
            path.write_bytes(raw)
            self.assertEqual(MODULE.strip_unused_tangents(path), 1)
            body, _ = MODULE.parse_glb(path)
            self.assertNotIn("TANGENT", body["meshes"][0]["primitives"][0]["attributes"])


if __name__ == "__main__":
    unittest.main()
