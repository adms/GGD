import hashlib
import importlib.util
import json
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
        self.assertIn("Magikaru staff is rigid-skinned", runtime)
        self.assertIn("AS_PN020_00_B_Special03_01.psa", assembly)
        self.assertIn("'popp-pn020-00'", runtime)
        self.assertIn("cast: 'GGD_native_special03'", runtime)

    def test_popp_magikaru_delivery_is_append_only_delta_with_failed_attempts(self):
        profile = COLLECT.PROFILES["magikaru-v2"]
        self.assertEqual(profile["baseDeliveryId"], "infinity-strash-popp-pn020-00-delivery-v1")
        paths = {destination: source for destination, source in profile["stages"]}
        self.assertEqual(paths["runtime-v4"], "runtime-candidates-v4/popp-pn020-00")
        self.assertIn("failed-attempts/unskinned-attachment", paths)
        self.assertIn("weapon/mesh-psk-v1", paths)

if __name__ == "__main__":
    unittest.main()
