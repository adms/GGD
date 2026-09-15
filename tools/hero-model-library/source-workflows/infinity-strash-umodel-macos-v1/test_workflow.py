import hashlib
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("infinity_strash_pipeline", HERE / "pipeline.py")
PIPELINE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PIPELINE)
COLLECT_SPEC = importlib.util.spec_from_file_location("collect_popp_delivery", HERE / "collect_popp_delivery.py")
COLLECT = importlib.util.module_from_spec(COLLECT_SPEC)
assert COLLECT_SPEC.loader is not None
COLLECT_SPEC.loader.exec_module(COLLECT)
EN653_COLLECT_SPEC = importlib.util.spec_from_file_location("collect_en653_delivery", HERE / "collect_en653_delivery.py")
EN653_COLLECT = importlib.util.module_from_spec(EN653_COLLECT_SPEC)
assert EN653_COLLECT_SPEC.loader is not None
EN653_COLLECT_SPEC.loader.exec_module(EN653_COLLECT)
EN653_SPEC = importlib.util.spec_from_file_location("prepare_en653_component", HERE / "prepare_en653_component.py")
EN653 = importlib.util.module_from_spec(EN653_SPEC)
assert EN653_SPEC.loader is not None
EN653_SPEC.loader.exec_module(EN653)
DAI_COLLECT_SPEC = importlib.util.spec_from_file_location("collect_dai_pn010_05_delivery", HERE / "collect_dai_pn010_05_delivery.py")
DAI_COLLECT = importlib.util.module_from_spec(DAI_COLLECT_SPEC)
assert DAI_COLLECT_SPEC.loader is not None
DAI_COLLECT_SPEC.loader.exec_module(DAI_COLLECT)


class InfinityStrashUmodelWorkflowTest(unittest.TestCase):
    def test_patch_has_game_tag_and_section_alignment_fix(self):
        patch = (HERE / "ueviewer-infinity-strash.patch").read_text(encoding="utf-8")
        self.assertIn("GAME_InfinityStrash", patch)
        self.assertIn("strash, GAME_InfinityStrash", patch)
        self.assertIn("uint64 BaseVertexIndex64", patch)
        self.assertIn("S.BaseVertexIndex = (uint32)BaseVertexIndex64", patch)
        self.assertIn("RegisterExporter<UTexture2D>", patch)
        self.assertIn("ExportTexture(Tex)", patch)
        self.assertIn("-arch x86_64", patch)

    def test_pipeline_resume_requires_matching_receipt_bytes_and_sha(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "candidate.glb"
            output.write_bytes(b"verified candidate")
            receipt = root / "receipt.json"
            receipt.write_text(json.dumps({"output": {
                "path": str(output),
                "bytes": output.stat().st_size,
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            }}))
            self.assertTrue(PIPELINE.validate_receipt_file(receipt, "output"))
            output.write_bytes(b"changed candidate")
            self.assertFalse(PIPELINE.validate_receipt_file(receipt, "output"))

    def test_pipeline_runtime_and_review_resume_require_complete_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "runtime"
            runtime.mkdir()
            body = runtime / "body.glb"
            body.write_bytes(b"runtime body")
            (runtime / "model.json").write_text("{}")
            (runtime / "uploaded-model.json").write_text("{}")
            (runtime / "receipt.json").write_text(json.dumps({"output": {
                "sha256": hashlib.sha256(body.read_bytes()).hexdigest(),
            }}))
            self.assertTrue(PIPELINE.validate_runtime(runtime))
            (runtime / "uploaded-model.json").unlink()
            self.assertFalse(PIPELINE.validate_runtime(runtime))

            review = root / "review"
            review.mkdir()
            (review / "run.json").write_text(json.dumps({"complete": True}))
            for index in range(18):
                (review / f"ggd-state-{index:02d}.png").write_bytes(b"png")
            self.assertTrue(PIPELINE.validate_review(review))
            (review / "ggd-state-17.png").unlink()
            self.assertFalse(PIPELINE.validate_review(review))

    def test_pipeline_quarantines_incomplete_stage_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "normalized" / "candidate"
            root.mkdir(parents=True)
            (root / "partial.txt").write_text("preserve me")
            first = PIPELINE.quarantine_incomplete(root, "normalize", False)
            self.assertEqual(first.name, "candidate-normalize-attempt-1")
            self.assertEqual((first / "partial.txt").read_text(), "preserve me")
            root.mkdir()
            second = PIPELINE.quarantine_incomplete(root, "normalize", False)
            self.assertEqual(second.name, "candidate-normalize-attempt-2")

    def test_popp_recipe_pins_independent_export_roots_and_native_mapping(self):
        config = json.loads((HERE / "pipeline-config.json").read_text(encoding="utf-8"))
        popp = next(row for row in config["candidates"] if row["id"] == "popp-pn020-00")
        self.assertEqual(popp["heroId"], "b2-popp")
        self.assertEqual(popp["catalogCandidateId"], "infinity-strash-popp-pn020-00-magikaru-native-v2")
        self.assertEqual(
            {
                "meshRoot", "materialContextRoot", "textureRoot", "psaRoot",
                "attachmentMeshRoot", "attachmentTextureRoot", "attachmentSourceRoot",
            },
            {key for key in popp if key.endswith("Root")},
        )
        assembly = (HERE / "assemble_candidate_blender.py").read_text(encoding="utf-8")
        runtime = (HERE / "prepare_runtime_candidate.mts").read_text(encoding="utf-8")
        self.assertIn("SK_PN020_00_Body.gltf", assembly)
        self.assertIn("SK_PN020_Weapon_Magikaru.gltf", assembly)
        self.assertIn('"socket": "Weapon1_R"', assembly)
        self.assertIn('"sourceConfig": "Strash/Chara/Player/PN020/Data/CB_PN020.uasset"', assembly)
        self.assertIn("source-component-zero-relative-rigid-skin", assembly)
        self.assertIn('group.add(range(len(mesh.data.vertices)), 1.0, "REPLACE")', assembly)
        self.assertIn("The ${weapon} staff is rigid-skinned", runtime)
        self.assertIn("AS_PN020_00_B_Special03_01.psa", assembly)
        self.assertIn("'popp-pn020-00'", runtime)
        self.assertIn("cast: 'GGD_native_special03'", runtime)

    def test_dai_pn010_05_recipe_keeps_source_selected_daino_variant_independent(self):
        config = json.loads((HERE / "pipeline-config.json").read_text(encoding="utf-8"))
        dai = next(row for row in config["candidates"] if row["id"] == "dai-pn010-05-daino-tsurugi")
        self.assertEqual(dai["heroId"], "godie-nbbc")
        self.assertEqual(dai["catalogCandidateId"], "infinity-strash-dai-pn010-05-daino-tsurugi-native-v1")
        self.assertEqual(
            {
                "meshRoot", "materialContextRoot", "textureRoot", "psaRoot",
                "attachmentMeshRoot", "attachmentMaterialContextRoot",
                "attachmentTextureRoot", "attachmentSourceRoot",
            },
            {key for key in dai if key.endswith("Root")},
        )
        assembly = (HERE / "assemble_candidate_blender.py").read_text(encoding="utf-8")
        pipeline = (HERE / "pipeline.py").read_text(encoding="utf-8")
        runtime = (HERE / "prepare_runtime_candidate.mts").read_text(encoding="utf-8")
        self.assertIn("SK_PN010_05_Body.gltf", assembly)
        self.assertIn("SK_PN010_01_Hair.gltf", assembly)
        self.assertIn("SK_PN010_Weapon_DainoTsurugi.gltf", assembly)
        self.assertIn('"sourceConfig": "strash/Content/Strash/Chara/Player/PN010/Data/CB_PN010_05.uasset"', assembly)
        self.assertIn('"filterSourceMaterials": True', assembly)
        self.assertIn('"mergeWithRole": "sheath"', assembly)
        self.assertIn("create_horizontal_texture_atlas", assembly)
        self.assertIn("remap_material_uv_horizontal", assembly)
        self.assertIn('{"part": "body", "contains": "papunica", "exclude": True}', assembly)
        self.assertIn('{"part": "body", "containsAll": ["daino", "sheath"], "colorRole": "sheath"}', assembly)
        self.assertIn('"socket": "Weapon1_R"', assembly)
        self.assertIn('"attachmentMaterialContextRoot": "--attachment-material-context-root"', pipeline)
        self.assertIn("'dai-pn010-05-daino-tsurugi'", runtime)
        self.assertIn("PN010/05 body, PN010 Hair/01 and Dai no Tsurugi", runtime)

    def test_popp_magikaru_delivery_is_append_only_delta_with_failed_attempts(self):
        profile = COLLECT.PROFILES["magikaru-v2"]
        self.assertEqual(profile["baseDeliveryId"], "infinity-strash-popp-pn020-00-delivery-v1")
        paths = {destination: source for destination, source in profile["stages"]}
        self.assertEqual(paths["runtime-v4"], "runtime-candidates-v4/popp-pn020-00")
        self.assertIn("failed-attempts/unskinned-attachment", paths)
        self.assertIn("weapon/mesh-psk-v1", paths)

    def test_popp_alternate_staffs_are_independent_append_only_delta(self):
        profile = COLLECT.PROFILES["alternate-staffs-v3"]
        self.assertEqual(profile["baseDeliveryId"], "infinity-strash-popp-pn020-00-magikaru-delivery-v2")
        paths = {destination: source for destination, source in profile["stages"]}
        self.assertEqual(paths["mahouno/runtime-v1"], "runtime-candidates-popp-mahouno-v1/popp-pn020-01-mahouno")
        self.assertEqual(paths["kagayaki/runtime-v1"], "runtime-candidates-popp-kagayaki-v1/popp-pn020-02-kagayaki")
        self.assertIn("mahouno/textures-v1", paths)
        self.assertIn("kagayaki/textures-v1", paths)

    def test_en653_component_identity_and_embedded_texture_mapping(self):
        source = {
            "asset": {"version": "2.0"},
            "buffers": [{"uri": "mesh.bin", "byteLength": 72}],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": 36},
                {"buffer": 0, "byteOffset": 36, "byteLength": 36},
            ],
            "accessors": [
                {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
                {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"},
            ],
            "materials": [{"name": name} for name in EN653.MATERIAL_TEXTURES],
            "meshes": [{"primitives": [{
                "indices": 1, "material": index,
                "attributes": {key: 0 for key in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0")},
            } for index in range(4)]}],
            "skins": [{"joints": [0]}],
            "nodes": [{}],
        }
        source_bin = struct.pack("<9f", -1, 0, 2, 3, -4, 5, 6, 7, -8) + b"\0" * 36
        document, binary = EN653.build_document(source, source_bin, {"body": b"body", "face": b"face"})
        self.assertEqual(len(document["images"]), 2)
        self.assertTrue(all("bufferView" in image and "uri" not in image for image in document["images"]))
        self.assertEqual(document["buffers"], [{"byteLength": len(binary)}])
        self.assertEqual(document["bufferViews"][0]["target"], 34962)
        self.assertEqual(document["bufferViews"][1]["target"], 34963)
        self.assertEqual(document["accessors"][0]["min"], [-1.0, -4.0, -8.0])
        self.assertEqual(document["accessors"][0]["max"], [6.0, 7.0, 5.0])
        self.assertEqual(document["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"], 1)
        self.assertEqual(document["materials"][1]["pbrMetallicRoughness"]["baseColorTexture"]["index"], 0)
        glb = EN653.encode_glb(document, binary)
        self.assertEqual(glb[:4], b"glTF")
        script = (HERE / "prepare_en653_component.py").read_text(encoding="utf-8")
        self.assertIn('"notVearnPostTransformation": True', script)
        self.assertIn('"notBaran": True', script)

    def test_babylon_renderer_has_explicit_static_component_mode(self):
        runner = (HERE / "render_babylon.py").read_text(encoding="utf-8")
        browser = (HERE / "render_babylon.mjs").read_text(encoding="utf-8")
        self.assertIn('parser.add_argument("--static"', runner)
        self.assertIn('request_path = self.path.partition("?")[0]', runner)
        self.assertIn("expected_images = 3 if args.static else 18", runner)
        self.assertIn("static component review requires zero animation groups", browser)
        self.assertIn("ggd.infinity-strash-babylon-webgl-static@1", browser)
        self.assertIn("nativeMotion:!staticMode", browser)

    def test_en653_delivery_pins_all_conversion_and_review_modules(self):
        self.assertEqual(EN653_COLLECT.CANDIDATE_ID, EN653.CANDIDATE_ID)
        self.assertEqual(
            {
                "export.py", "ueviewer-infinity-strash.patch", "prepare_en653_component.py",
                "normalize_validate_candidate.mts", "render_babylon.py", "render_babylon.mjs",
                "collect_en653_delivery.py",
            },
            set(EN653_COLLECT.TOOL_NAMES),
        )

    def test_dai_pn010_05_delivery_pins_failed_attempt_final_stages_and_tools(self):
        stages = dict(DAI_COLLECT.STAGES)
        self.assertEqual(stages["failed-attempts/seven-draw-normalized-v1"], "normalized-animated-candidates-psk-blender-dai-pn010-05-daino-v1/dai-pn010-05-daino-tsurugi")
        self.assertEqual(stages["runtime-v2"], "runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi")
        self.assertIn("pipeline.py", DAI_COLLECT.TOOL_NAMES)
        self.assertIn("assemble_candidate_blender.py", DAI_COLLECT.TOOL_NAMES)
        self.assertIn("collect_dai_pn010_05_delivery.py", DAI_COLLECT.TOOL_NAMES)

if __name__ == "__main__":
    unittest.main()
