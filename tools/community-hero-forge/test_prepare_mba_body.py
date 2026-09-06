import copy
import io
import struct
import unittest

from PIL import Image

from prepare_mba_body import prepare, encode_glb, read_glb


def fixture():
    doc = {"asset": {"version": "2.0"}, "buffers": [], "bufferViews": [], "accessors": [], "images": [], "textures": [], "materials": [],
           "meshes": [{"primitives": []}], "nodes": [{"mesh": 0, "skin": 0}, {"name": "original-bone"}],
           "skins": [{"joints": [1]}], "animations": [{"name": "native-timing", "channels": [], "samplers": []}],
           "extensionsUsed": ["KHR_materials_specular"]}
    binary = bytearray()

    def view(data):
        binary.extend(bytes(-len(binary) % 4))
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)})
        binary.extend(data)
        return len(doc["bufferViews"]) - 1

    def accessor(rows, fmt, kind):
        data = struct.pack("<" + fmt * sum(len(v) for v in rows), *(v for row in rows for v in row))
        doc["accessors"].append({"bufferView": view(data), "componentType": 5126 if fmt == "f" else 5123, "type": kind, "count": len(rows)})
        return len(doc["accessors"]) - 1

    for n, color in enumerate(((245, 25, 30, 255), (40, 100, 250, 255))):
        png = io.BytesIO()
        Image.new("RGBA", (8, 8), color).save(png, format="PNG")
        doc["images"].append({"bufferView": view(png.getvalue()), "mimeType": "image/png"})
        doc["textures"].append({"source": n})
        doc["materials"].append({"pbrMetallicRoughness": {"baseColorTexture": {"index": n}}, "extensions": {"KHR_materials_specular": {"specularColorFactor": [0, 0, 0]}}})
        attrs = {
            "POSITION": accessor([(n * 2.0, 0, 0), (n * 2.0 + 1, 0, 0), (n * 2.0, 1, 0)], "f", "VEC3"),
            "NORMAL": accessor([(0, 0, 1)] * 3, "f", "VEC3"),
            "TEXCOORD_0": accessor([(0.2, 0.2), (0.8, 0.2), (0.2, 0.8)], "f", "VEC2"),
            "JOINTS_0": accessor([(0, 0, 0, 0)] * 3, "H", "VEC4"),
            "WEIGHTS_0": accessor([(0.7, 0.2, 0, 0)] * 3, "f", "VEC4"),
        }
        doc["meshes"][0]["primitives"].append({"attributes": attrs, "indices": accessor([(0,), (1,), (2,)], "H", "SCALAR"), "material": n})
    return doc, bytes(binary)


def decoded(doc, binary, index, fmt, width):
    a = doc["accessors"][index]
    at = doc["bufferViews"][a["bufferView"]]["byteOffset"]
    return [struct.unpack_from("<" + fmt * width, binary, at + i * struct.calcsize("<" + fmt * width)) for i in range(a["count"])]


class PreparationTest(unittest.TestCase):
    def test_preserves_shape_rig_animation_and_texture_color_at_vertices(self):
        original, binary = fixture()
        before = copy.deepcopy(original)
        doc, data, report = prepare(original, binary)
        self.assertEqual(original, before)
        self.assertEqual(doc["nodes"], original["nodes"])
        self.assertEqual(doc["skins"], original["skins"])
        self.assertEqual(doc["animations"], original["animations"])
        self.assertEqual(data[:len(binary)], binary)
        primitive = doc["meshes"][0]["primitives"][0]
        positions = decoded(doc, data, primitive["attributes"]["POSITION"], "f", 3)
        self.assertEqual(positions, [(0, 0, 0), (1, 0, 0), (0, 1, 0), (2, 0, 0), (3, 0, 0), (2, 1, 0)])
        self.assertEqual(decoded(doc, data, primitive["indices"], "I", 1), [(i,) for i in range(6)])
        self.assertEqual(decoded(doc, data, primitive["attributes"]["JOINTS_0"], "H", 4), [(0, 0, 0, 0)] * 6)
        for weights in decoded(doc, data, primitive["attributes"]["WEIGHTS_0"], "f", 4):
            self.assertAlmostEqual(sum(weights), 1)
            self.assertAlmostEqual(weights[0] / weights[1], 3.5, places=5)
        image_view = doc["bufferViews"][doc["images"][0]["bufferView"]]
        with Image.open(io.BytesIO(data[image_view["byteOffset"]:image_view["byteOffset"] + image_view["byteLength"]])) as atlas:
            for i, uv in enumerate(decoded(doc, data, primitive["attributes"]["TEXCOORD_0"], "f", 2)):
                expected = (245, 25, 30, 255) if i < 3 else (40, 100, 250, 255)
                self.assertEqual(atlas.getpixel((int(uv[0] * atlas.width), int(uv[1] * atlas.height))), expected)
        self.assertEqual(report["outputDrawPrimitives"], 1)
        restored_doc, restored_binary = read_glb(encode_glb(doc, data))
        self.assertEqual(restored_doc["skins"], original["skins"])
        self.assertEqual(restored_binary[:len(data)], data)

    def test_rejects_layouts_that_cannot_be_preserved(self):
        for change in (lambda d: d.update(extensionsRequired=["KHR_materials_volume"]),
                       lambda d: d["meshes"][0]["primitives"][0].update(targets=[{}]),
                       lambda d: d["materials"][0].update(alphaMode="BLEND"),
                       lambda d: d["nodes"].append({"mesh": 0, "skin": 0})):
            doc, binary = fixture()
            change(doc)
            with self.assertRaises(ValueError):
                prepare(doc, binary)

    def test_rejects_zero_weights_and_uvs_that_need_wrapping(self):
        for key, replacement in (("WEIGHTS_0", (0, 0, 0, 0)), ("TEXCOORD_0", (-0.5, 0.2))):
            doc, data = fixture()
            index = doc["meshes"][0]["primitives"][0]["attributes"][key]
            view = doc["bufferViews"][doc["accessors"][index]["bufferView"]]
            binary = bytearray(data)
            struct.pack_into("<" + "f" * len(replacement), binary, view["byteOffset"], *replacement)
            with self.assertRaises(ValueError):
                prepare(doc, bytes(binary))

    def test_rejects_incomplete_glb(self):
        doc, binary = fixture()
        raw = encode_glb(doc, binary)
        with self.assertRaises(ValueError):
            read_glb(raw[:-4])


if __name__ == "__main__":
    unittest.main()
