import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path


try:
    import UnityPy  # noqa: F401
except ImportError:
    UnityPy = None

MODULE = None
if UnityPy is not None:
    MODULE_PATH = Path(__file__).with_name("export_rigged_gltf.py")
    SPEC = importlib.util.spec_from_file_location("export_rigged_gltf", MODULE_PATH)
    MODULE = importlib.util.module_from_spec(SPEC)
    assert SPEC.loader is not None
    sys.modules[SPEC.name] = MODULE
    SPEC.loader.exec_module(MODULE)


class Vector:
    def __init__(self, x, y, z, w=None):
        self.x = x
        self.y = y
        self.z = z
        if w is not None:
            self.w = w


class Matrix:
    pass


@unittest.skipUnless(UnityPy is not None, "UnityPy is an optional analysis dependency")
class RiggedGltfTests(unittest.TestCase):
    def test_coordinate_conversion(self):
        self.assertEqual(MODULE.unity_vector(Vector(2, 3, 4)), [-2.0, 3.0, 4.0])
        self.assertEqual(
            MODULE.unity_quaternion(Vector(0, 0, 0, 1)),
            [0.0, -0.0, -0.0, 1.0],
        )

    def test_inverse_bind_matrix_mirror_and_column_major(self):
        matrix = Matrix()
        for row in range(4):
            for column in range(4):
                setattr(matrix, f"e{row}{column}", 1.0 if row == column else 0.0)
        matrix.e03 = 2.0
        matrix.e13 = 3.0
        matrix.e23 = 4.0
        converted = MODULE.unity_matrix(matrix)
        self.assertEqual(converted[12:15], [-2.0, 3.0, 4.0])

    def test_glb_header_and_deterministic_json(self):
        builder = MODULE.GltfBuilder("test")
        builder.add_accessor(
            [(0.0, 1.0, 2.0)],
            component_type=5126,
            accessor_type="VEC3",
            target=34962,
            include_bounds=True,
        )
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.glb"
            second = Path(directory) / "second.glb"
            builder.write_glb(first)
            builder.write_glb(second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            magic, version, total = struct.unpack("<4sII", first.read_bytes()[:12])
            self.assertEqual(magic, b"glTF")
            self.assertEqual(version, 2)
            self.assertEqual(total, first.stat().st_size)

    def test_material_texture_rules(self):
        self.assertEqual(
            MODULE.select_texture_name("mch0270058_v00_kiganBurnHead_body"),
            "tch0270058_v00_kiganburnhead_body_co",
        )
        self.assertEqual(
            MODULE.select_texture_name("mch0270058_v00_shin_Leye"),
            "tch0270058_v00_shinburn_eye_co",
        )


if __name__ == "__main__":
    unittest.main()
