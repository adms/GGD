from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jstars_priority_six", HERE / "pipeline.py")
assert SPEC and SPEC.loader
PIPELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PIPELINE)


def artifact(kind: str, index: int, audio: bool = False) -> dict:
    digest = hashlib.sha256(f"{kind}-{index}".encode()).hexdigest()
    row = {"path": f"assets/{kind}/{index}.bin", "bytes": 10, "sha256": digest}
    if audio:
        row["ownerReview"] = {
            "reviewer": "owner", "decision": "approve", "event": f"event-{index}",
            **({"speaker": "character", "language": "ja"} if kind == "voice" else {}),
        }
    return row


def source_character(target: dict) -> dict:
    rows = {kind: [artifact(kind, 0, kind in {"sfx", "voice"})] for kind in ("modelSources", "textures", "skeletons", "motions", "vfx", "sfx", "voice")}
    evidence = {}
    for kind in ("vfx", "sfx", "voice"):
        evidence[kind] = {
            "status": PIPELINE.BOUND_STATUS,
            "boundArtifactSha256": [rows[kind][0]["sha256"]],
            "runtimeBindingCount": 1,
        }
    return {
        "nativeCharacterId": "native-" + target["key"], "heroId": target["heroIds"][0], "identityVerified": True,
        "animationSelections": {state: index for index, state in enumerate(PIPELINE.STATES)},
        "artifacts": {**rows, "runtimeGlb": artifact("runtime", 0)}, "moduleEvidence": evidence,
    }


def conversion_character(source: dict) -> dict:
    stages = [{"id": module, "status": PIPELINE.PASS_CONVERSION[module]} for module in ("model", "texture", "skeleton", "motion")]
    stages.extend([
        {"id": "vfx", "status": "verified-source-candidates-no-runtime-binding"},
        {"id": "sfx", "status": "verified-candidates-awaiting-checked-binder"},
        {"id": "voice", "status": "verified-candidates-awaiting-checked-binder"},
        {"id": "model-registration", "status": "registered-non-default-independent-option", "automaticEligible": False},
    ])
    return {
        "heroId": source["heroId"], "nativeCharacterId": source["nativeCharacterId"], "stages": stages,
        "modelResult": {
            "status": "prepared-and-officially-verified",
            "qualityEvidence": {"originalTriangles": 9900, "outputTriangles": 9900, "textureMaxEdge": 256, "decimationApplied": False},
        },
    }


class PrioritySixPipelineTest(unittest.TestCase):
    def args(self, root: Path, source: Path, conversion: Path | None = None, mode: str = "plan") -> argparse.Namespace:
        return argparse.Namespace(
            repo=PIPELINE.DEFAULT_REPO, source_receipt=source, conversion_receipt=conversion,
            output=root / "out", mode=mode, content=None,
        )

    def test_policy_and_priority_are_exact(self) -> None:
        contract = PIPELINE.validate_contract()
        self.assertEqual(contract["pipelineId"], "jstars-priority-six-v1")
        self.assertEqual(len(PIPELINE.PRIORITY), 6)
        self.assertEqual([row["key"] for row in PIPELINE.PRIORITY], ["gintoki", "nube", "gon", "killua", "luckyman", "hiei"])
        policy = PIPELINE.policy_record()
        self.assertEqual(policy["decimateOnlyWhenTrianglesAbove"], 10000)
        self.assertEqual(policy["decimatedMaximumAcceptedTriangles"], 8000)
        self.assertEqual(policy["textureMaxEdge"], 256)
        self.assertEqual(tuple(policy["requiredMotionStates"]), PIPELINE.STATES)
        self.assertTrue(policy["manualSelectionMustBePreserved"])

    def test_missing_source_is_blocked_without_claiming_upload(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            result, code = PIPELINE.build(self.args(root, root / "missing.json"))
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "blocked-no-source-receipt")
        self.assertEqual(len(result["characters"]), 6)
        self.assertTrue(all(not row["automaticDefaultApplied"] for row in result["characters"]))
        self.assertFalse(result["productionDeploymentVerified"])

    def test_raw_owner_archive_receipt_is_not_a_conversion_source_receipt(self) -> None:
        candidates = [
            PIPELINE.DEFAULT_REPO / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json",
            PIPELINE.DEFAULT_REPO / "materials/hero-model-library/priority-evidence/jstars-owner-archive-extract-v1/receipt.json",
        ]
        source = next((path for path in candidates if path.is_file()), None)
        self.assertIsNotNone(source)
        assert source is not None
        with tempfile.TemporaryDirectory() as folder:
            result, code = PIPELINE.build(self.args(Path(folder), source))
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "blocked-unsupported-source-receipt")
        self.assertTrue(all(all(stage["status"] == "blocked" for stage in row["stages"]) for row in result["characters"]))

    def test_priority_source_inventory_preserves_precise_native_blocker(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "source.json"
            source.write_text(json.dumps({
                "schema": "ggd.jstars-priority-six-source-receipt@1",
                "status": "owner-archive-inventoried-native-conversion-blocked",
                "summary": {"nativeIdsConfirmed": 1, "nativeIdsUnproven": 5},
                "blockers": [],
            }))
            result, code = PIPELINE.build(self.args(root, source))
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "blocked-native-extraction")
        self.assertEqual(result["input"]["upstream"]["summary"]["nativeIdsConfirmed"], 1)

    def test_all_seven_modules_and_registration_unlock_default(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            characters = [source_character(target) for target in PIPELINE.PRIORITY]
            source = root / "source.json"
            source.write_text(json.dumps({"schema": "ggd.jstars-extraction-receipt@1", "characters": characters}))
            conversion = root / "conversion.json"
            conversion.write_text(json.dumps({"schema": "ggd.jstars-conversion-runtime-receipt@1", "characters": [conversion_character(row) for row in characters]}))
            result, code = PIPELINE.build(self.args(root, source, conversion))
            filtered = json.loads((root / "out/pipeline-source-receipt.json").read_text())
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "ready-priority-six")
        self.assertEqual(result["counts"]["allGatesPassed"], 6)
        self.assertEqual(result["counts"]["registeredOptions"], 6)
        self.assertEqual(result["counts"]["automaticDefaultsApplied"], 0)
        self.assertEqual(len(filtered["characters"]), 6)
        for row in result["characters"]:
            self.assertTrue(row["allGatesPassed"])
            self.assertEqual(next(stage for stage in row["stages"] if stage["id"] == "automatic-default")["status"], "ready")

    def test_one_unapproved_voice_blocks_only_that_character(self) -> None:
        target = PIPELINE.PRIORITY[0]
        source = source_character(target)
        source["artifacts"]["voice"][0]["ownerReview"]["decision"] = "pending"
        result = PIPELINE.evaluate_character(target, source, conversion_character(source))
        voice = next(stage for stage in result["stages"] if stage["id"] == "voice")
        self.assertEqual(voice["status"], "blocked")
        self.assertIn("lacks owner approve review", " ".join(voice["blockers"]))
        self.assertFalse(result["allGatesPassed"])

    def test_malformed_binder_evidence_blocks_instead_of_crashing(self) -> None:
        target = PIPELINE.PRIORITY[4]
        source = source_character(target)
        source["moduleEvidence"] = []
        result = PIPELINE.evaluate_character(target, source, conversion_character(source))
        self.assertEqual(next(stage for stage in result["stages"] if stage["id"] == "vfx")["status"], "blocked")
        self.assertFalse(result["allGatesPassed"])

    def test_incomplete_six_state_map_blocks_motion(self) -> None:
        target = PIPELINE.PRIORITY[2]
        source = source_character(target)
        del source["animationSelections"]["death"]
        result = PIPELINE.evaluate_character(target, source, conversion_character(source))
        motion = next(stage for stage in result["stages"] if stage["id"] == "motion")
        self.assertEqual(motion["status"], "blocked")
        self.assertFalse(result["allGatesPassed"])

    def test_over_ten_thousand_accepts_exactly_eight_thousand(self) -> None:
        target = PIPELINE.PRIORITY[3]
        source = source_character(target)
        conversion = conversion_character(source)
        conversion["modelResult"]["qualityEvidence"] = {
            "originalTriangles": 10001, "outputTriangles": 8000, "textureMaxEdge": 256, "decimationApplied": True,
        }
        result = PIPELINE.evaluate_character(target, source, conversion)
        model = next(stage for stage in result["stages"] if stage["id"] == "model")
        self.assertEqual(model["status"], "passed")

    def test_over_ten_thousand_rejects_eight_thousand_and_one(self) -> None:
        target = PIPELINE.PRIORITY[3]
        source = source_character(target)
        conversion = conversion_character(source)
        conversion["modelResult"]["qualityEvidence"] = {
            "originalTriangles": 10001, "outputTriangles": 8001, "textureMaxEdge": 256, "decimationApplied": True,
        }
        result = PIPELINE.evaluate_character(target, source, conversion)
        model = next(stage for stage in result["stages"] if stage["id"] == "model")
        self.assertEqual(model["status"], "blocked")
        self.assertIn("at most 8000", " ".join(model["blockers"]))

    def test_identity_must_use_exact_ggd_id_and_be_verified(self) -> None:
        rows = [source_character(PIPELINE.PRIORITY[0]), source_character(PIPELINE.PRIORITY[1])]
        rows[0]["identityVerified"] = False
        rows[1]["heroId"] = "guessed-nube"
        matched, invalid = PIPELINE.match_priority({"characters": rows})
        self.assertEqual(matched, {})
        self.assertEqual(invalid[0]["reason"], "identityVerified is not true")

    def test_promoter_has_manual_selection_guard(self) -> None:
        source = (HERE / "pipeline_promote.mts").read_text()
        self.assertIn('before.selectionMode === "manual"', source)
        self.assertIn("manual active selection must not change", source)
        self.assertIn("independent non-default J-Stars option must be registered before promotion", source)


if __name__ == "__main__":
    unittest.main()
