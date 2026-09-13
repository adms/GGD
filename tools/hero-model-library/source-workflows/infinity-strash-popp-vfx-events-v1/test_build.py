import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


BUILD = module("build")
EXTRACT = module("extract")
SERVER = module("serve_review")
PROBE = module("probe_conversion")
CLOSURE = module("extract_dependency_closure")


class PoppVfxEventAuditTests(unittest.TestCase):
    def test_extraction_manifest_has_exact_direct_vfx_pairs(self):
        dependency_index = json.loads(BUILD.DEPENDENCY_INDEX.read_text())
        members = EXTRACT.selected_members(dependency_index)
        self.assertEqual(len(members), 34)
        self.assertEqual(len(set(members)), 34)
        self.assertTrue(all(member.endswith((".uasset", ".uexp")) for member in members))

    def test_exact_voice_resolution_does_not_mix_io_and_iora(self):
        io = "/Game/WwiseAudio/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_IO"
        iora = "strash/Content/WwiseAudio/Localized/Japanese/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_IORA.uasset"
        self.assertFalse(BUILD.event_matches(io, iora))

    def test_generated_queue_is_unbound_and_allowlisted(self):
        queue_path = BUILD.OUTPUT / "event-audio-review-queue.json"
        queue = json.loads(queue_path.read_text())
        self.assertEqual(len(queue["candidates"]), 36)
        self.assertTrue(all(row["runtimeSelectable"] is False for row in queue["candidates"]))
        self.assertTrue(all(row["reviewDecision"] is None for row in queue["candidates"]))
        allowlist = SERVER.load_allowlist(queue_path)
        self.assertEqual(set(allowlist), {row["candidateId"] for row in queue["candidates"]})

    def test_receipt_keeps_acquisition_conversion_and_binding_separate(self):
        receipt = json.loads((BUILD.OUTPUT / "receipt.json").read_text())
        self.assertEqual(receipt["summary"]["vfxReferences"], 17)
        self.assertEqual(receipt["summary"]["vfxDirectPairsAcquired"], 17)
        self.assertEqual(receipt["summary"]["vfxConverted"], 0)
        self.assertEqual(receipt["summary"]["vfxFirstLevelDependencyReferenceOccurrences"], 229)
        self.assertEqual(receipt["summary"]["vfxFirstLevelUniqueDependencyReferences"], 138)
        self.assertEqual(receipt["summary"]["vfxClosurePackageReferencesDiscovered"], 309)
        self.assertEqual(receipt["summary"]["vfxClosurePackageReferencesAcquired"], 309)
        self.assertEqual(receipt["summary"]["vfxClosurePackageReferencesMissing"], 0)
        self.assertTrue(receipt["summary"]["vfxNonScriptPackageDependencyClosureComplete"])
        self.assertEqual(receipt["summary"]["eventReferences"], 41)
        self.assertEqual(receipt["summary"]["eventPairsAcquired"], 41)
        self.assertEqual(receipt["summary"]["runtimeBindingsCreated"], 0)
        self.assertEqual(receipt["summary"]["supportingGenericSfxReferences"], 10)
        self.assertFalse(receipt["runtimeSelectable"])

    def test_preserved_converter_probe_covers_every_vfx_reference(self):
        probe = json.loads((BUILD.OUTPUT / "conversion-probe.json").read_text())
        self.assertEqual(probe["packageCount"], 17)
        self.assertEqual(probe["noExportableOutputCount"], 17)
        self.assertTrue(all(row["returnCode"] == 0 and not row["producedFiles"] for row in probe["rows"]))
        self.assertIn("does not prove", probe["claim"])

    def test_closure_probe_still_does_not_claim_conversion(self):
        probe = json.loads((BUILD.OUTPUT / "closure-conversion-probe.json").read_text())
        self.assertEqual(probe["packageCount"], 17)
        self.assertEqual(probe["noExportableOutputCount"], 17)
        receipt = json.loads((BUILD.OUTPUT / "receipt.json").read_text())
        self.assertEqual(receipt["summary"]["vfxConverted"], 0)
        self.assertTrue(all(row["conversion"]["status"] == "dependency-closure-acquired-conversion-blocked" for row in receipt["vfx"]))

    def test_virtual_mount_mapping_covers_game_engine_and_niagara(self):
        self.assertEqual(CLOSURE.mount_reference("strash/Content/A/B.uasset"), "/Game/A/B")
        self.assertEqual(CLOSURE.mount_reference("Engine/Content/A/B.uasset"), "/Engine/A/B")
        self.assertEqual(
            CLOSURE.mount_reference("Engine/Plugins/FX/Niagara/Content/VectorFields/TilingCurl32.uasset"),
            "/Niagara/VectorFields/TilingCurl32",
        )

    def test_unknown_audio_id_is_not_in_allowlist(self):
        allowlist = SERVER.load_allowlist(BUILD.OUTPUT / "event-audio-review-queue.json")
        self.assertNotIn("../../etc/passwd", allowlist)


if __name__ == "__main__":
    unittest.main()
