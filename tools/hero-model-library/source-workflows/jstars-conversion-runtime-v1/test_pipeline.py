from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jstars_conversion_pipeline", HERE / "pipeline.py")
assert SPEC and SPEC.loader
PIPELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PIPELINE)
CURRENT_OWNER_RECEIPT_CANDIDATES = [
    PIPELINE.DEFAULT_REPO / "materials/hero-model-library/priority-evidence/jstars-owner-archive-extract-v1/receipt.json",
    PIPELINE.DEFAULT_REPO / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json",
]


def record(root: Path, relative: str, body: bytes) -> dict:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return {"path": relative, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


class JStarsPipelineTest(unittest.TestCase):
    def test_contract_is_ordered_and_fail_closed(self) -> None:
        contract = PIPELINE.validate_contract()
        self.assertTrue(contract["failClosed"]["missingExtractionReceipt"])
        self.assertTrue(contract["failClosed"]["unreviewedAudioRuntimeBinding"])
        self.assertEqual(contract["authorities"]["modelRegistration"], "apps/content-api/src/modelVersions.ts::ModelVersions.prepare")

    def test_missing_receipt_plan_is_precisely_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = argparse.Namespace(repo=PIPELINE.DEFAULT_REPO, receipt=root / "missing.json", output=root / "out", mode="plan", content=None)
            result, code = PIPELINE.build(args)
            self.assertEqual(code, 0)
            self.assertEqual(result["status"], "blocked-no-extraction-receipt")
            self.assertEqual([row["id"] for row in result["stages"]], PIPELINE.STAGE_IDS)
            self.assertTrue(all(row["status"] == "blocked" for row in result["stages"]))
            self.assertEqual(result["counts"]["preparedModels"], 0)

    def test_current_owner_extraction_receipt_propagates_nine_blocked_stages(self) -> None:
        receipt = next((path for path in CURRENT_OWNER_RECEIPT_CANDIDATES if path.is_file()), None)
        self.assertIsNotNone(receipt, "current owner extraction receipt fixture is missing")
        assert receipt is not None
        with tempfile.TemporaryDirectory() as folder:
            args = argparse.Namespace(repo=PIPELINE.DEFAULT_REPO, receipt=receipt, output=Path(folder) / "out", mode="plan", content=None)
            result, code = PIPELINE.build(args)
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "blocked-upstream-extraction")
        self.assertEqual(result["input"]["schema"], PIPELINE.OWNER_RECEIPT_SCHEMA)
        self.assertEqual(result["input"]["upstreamStatus"], "blocked-archive-not-found")
        self.assertEqual([row["id"] for row in result["stages"]], PIPELINE.STAGE_IDS)
        self.assertTrue(all(row["status"] == "blocked" for row in result["stages"]))

    def test_apply_without_receipt_fails(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = argparse.Namespace(repo=PIPELINE.DEFAULT_REPO, receipt=root / "missing.json", output=root / "out", mode="apply", content=None)
            result, code = PIPELINE.build(args)
            self.assertEqual(code, 2)
            self.assertEqual(result["status"], "blocked-no-extraction-receipt")

    def test_receipt_hash_drift_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = record(root, "source/game.7z", b"archive")
            receipt = {
                "schema": "ggd.jstars-extraction-receipt@1", "sourceId": "owner-jstars-test",
                "sourceGame": "J-Stars Victory VS+", "platform": "PS3", "extractionRoot": str(root),
                "archive": archive, "characters": [],
            }
            receipt_path = root / "receipt.json"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            (root / "source/game.7z").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "receipt mismatch"):
                PIPELINE.load_and_normalize_receipt(receipt_path)

    def test_owner_inventory_normalizes_container_tokens_without_claiming_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive_path = root / "J-Stars Victory Vs+.7z"
            archive_path.write_bytes(b"owner-archive")
            receipt = {
                "schema": PIPELINE.OWNER_RECEIPT_SCHEMA,
                "sourceId": "owner-jstars-victory-vs-plus-test",
                "status": "inventoried-read-only",
                "source": {
                    "absolutePath": str(archive_path), "bytes": archive_path.stat().st_size,
                    "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                },
                "identification": {"title": "J-Stars Victory VS+", "platform": "PS3"},
                "characterContainerTokens": [{
                    "token": "018", "samplePaths": ["PS3_GAME/USRDIR/character_model_018_i.pak"],
                    "assetKinds": ["model"],
                    "identityStatus": "native-token-observed-character-identity-not-yet-proven",
                }],
                "blockers": [],
            }
            receipt_path = root / "owner-receipt.json"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            normalized, extraction_root, paths, blocked = PIPELINE.load_and_normalize_receipt(receipt_path)
            self.assertIsNone(blocked)
            assert normalized is not None and extraction_root is not None
            self.assertEqual(normalized["characters"][0]["nativeCharacterId"], "018")
            self.assertEqual(normalized["characters"][0]["containerMembers"][0]["memberPath"], "PS3_GAME/USRDIR/character_model_018_i.pak")
            self.assertFalse(normalized["characters"][0]["identityVerified"])
            self.assertFalse(normalized["_normalization"]["extractionComplete"])
            self.assertEqual(paths["archive"], archive_path.resolve())
            args = argparse.Namespace(repo=PIPELINE.DEFAULT_REPO, receipt=receipt_path, output=root / "out", mode="plan", content=None)
            result, code = PIPELINE.build(args)
            self.assertEqual(code, 0)
            self.assertEqual(result["counts"]["identifiedNativeTokens"], 1)
            self.assertEqual(result["counts"]["extractedCharacters"], 0)
            self.assertEqual(result["characters"][0]["stages"][0]["status"], "container-members-normalized-identity-pending")

    def test_unreviewed_audio_never_authorizes_runtime(self) -> None:
        rows = [
            {"reviewDecision": "pending", "runtimeBindingAuthorized": False, "language": "pending-confirmation", "speaker": "pending-confirmation", "event": "pending-confirmation"},
            {"reviewDecision": "approve", "runtimeBindingAuthorized": True, "language": "ja", "speaker": "Gon", "event": "attack"},
        ]
        stage = PIPELINE.audio_stage("voice", rows)
        self.assertEqual(stage["reviewedAndAuthorizedFiles"], 1)
        self.assertEqual(stage["runtimeBindingsWritten"], 0)
        self.assertFalse(stage["runtimeBindingAuthorized"])

    def test_verified_sources_do_not_become_completed_model(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = record(root, "source/game.7z", b"archive")
            model_source = record(root, "extracted/001/model.bin", b"native-model")
            receipt = {
                "schema": "ggd.jstars-extraction-receipt@1", "sourceId": "owner-jstars-test",
                "sourceGame": "J-Stars Victory VS+", "platform": "PS3", "extractionRoot": str(root),
                "archive": archive,
                "characters": [{
                    "nativeCharacterId": "001", "identityVerified": True, "heroId": "hero-001",
                    "label": "J-Stars 原作", "character": "Test", "work": "Test Work",
                    "artifacts": {"modelSources": [model_source], "textures": [], "skeletons": [], "motions": [], "vfx": [], "sfx": [], "voice": []},
                }],
            }
            receipt_path = root / "receipt.json"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            validated, extraction_root, _, blocked = PIPELINE.load_and_normalize_receipt(receipt_path)
            self.assertIsNone(blocked)
            assert validated is not None and extraction_root is not None
            result = PIPELINE.character_plan(PIPELINE.DEFAULT_REPO, validated, extraction_root, validated["characters"][0], root / "out", "plan", None)
            model = next(row for row in result["stages"] if row["id"] == "model")
            self.assertEqual(model["status"], "blocked-no-rigged-animated-glb")


if __name__ == "__main__":
    unittest.main()
