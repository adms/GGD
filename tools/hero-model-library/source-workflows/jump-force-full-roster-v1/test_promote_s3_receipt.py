import copy
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jump_s3_promote", HERE / "promote_s3_receipt.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class PromoteS3ReceiptTest(unittest.TestCase):
    def pending_evidence(self):
        return json.loads((HERE.parents[3] / "materials/hero-model-library/source-inventories/"
                           "jump-force-full-roster-v1/local-mirror-evidence.json").read_text())

    def completed_receipt(self, root: Path, evidence: dict):
        payload_dir = root / "backup" / "receipt-sha"
        payload_dir.mkdir(parents=True)
        archive = payload_dir / "source.tar.gz"
        archive.write_bytes(b"frozen JUMP FORCE archive fixture")
        readback = payload_dir / "readback.tar.gz"
        readback.write_bytes(archive.read_bytes())
        archive_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
        files = [
            {"path": f"files/{index:04d}", "bytes": 0, "sha256": "a" * 64}
            for index in range(MOD.EXPECTED_FILES)
        ]
        files[-1]["bytes"] = MOD.EXPECTED_BYTES
        uri = MOD.S3_ARCHIVE_PREFIX + archive_sha + ".tar.gz"
        manifest = {
            "schema": MOD.MANIFEST_SCHEMA,
            "source": evidence["localMirror"]["absoluteRoot"],
            "files": files,
            "archiveSha256": archive_sha,
            "archiveBytes": archive.stat().st_size,
            "s3Uri": uri,
        }
        manifest_path = payload_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        receipt = {
            "schema": MOD.RECEIPT_SCHEMA,
            "s3Uri": uri,
            "manifestUri": uri.removesuffix(".tar.gz") + ".files.json",
            "archiveSha256": archive_sha,
            "archiveBytes": archive.stat().st_size,
            "fileCount": MOD.EXPECTED_FILES,
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "localUnchanged": True,
            "source": evidence["localMirror"]["absoluteRoot"],
            "localArchive": str(archive),
            "readback": str(readback),
            "manifest": str(manifest_path),
            "profile": "vibe-coding",
            "region": "ap-east-2",
            "callerArn": "arn:aws:sts::390630837668:assumed-role/vibe-coding-s3-role/test",
        }
        receipt_path = root / "latest-receipt.json"
        receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
        return receipt_path

    def test_promotes_only_a_complete_receipt(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            receipt = self.completed_receipt(Path(temp), evidence)
            summary = MOD.validate_completed_receipt(receipt, evidence)
        promoted = MOD.promoted_evidence(evidence, summary)
        self.assertEqual(promoted["status"], "verified-local-and-s3-readback-verified")
        self.assertEqual(promoted["s3"]["status"], "s3-readback-verified")
        self.assertEqual(promoted["s3"]["fileCount"], 3466)
        self.assertTrue(promoted["s3"]["fullGetVerified"])
        self.assertTrue(promoted["s3"]["allMemberSha256Verified"])
        MOD.receipt_matches_evidence(promoted, summary)

    def test_rejects_missing_full_readback_before_promotion(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            receipt_path = self.completed_receipt(Path(temp), evidence)
            receipt = json.loads(receipt_path.read_text())
            receipt["fullGetVerified"] = False
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "complete full-readback"):
                MOD.validate_completed_receipt(receipt_path, evidence)
        self.assertEqual(evidence["s3"]["status"], "pending")

    def test_rejects_wrong_legacy_prefix_before_promotion(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            receipt_path = self.completed_receipt(Path(temp), evidence)
            receipt = json.loads(receipt_path.read_text())
            receipt["s3Uri"] = receipt["s3Uri"].replace("legacy/game-intakes", "legacy/wrong")
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "fixed JUMP FORCE legacy prefix"):
                MOD.validate_completed_receipt(receipt_path, evidence)

    def test_rejects_manifest_with_incomplete_member_count(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            receipt_path = self.completed_receipt(Path(temp), evidence)
            receipt = json.loads(receipt_path.read_text())
            manifest_path = Path(receipt["manifest"])
            manifest = json.loads(manifest_path.read_text())
            manifest["files"].pop()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "3,466-file mirror"):
                MOD.validate_completed_receipt(receipt_path, evidence)

    def test_existing_verified_evidence_cannot_be_repromoted(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            receipt = self.completed_receipt(Path(temp), evidence)
            summary = MOD.validate_completed_receipt(receipt, evidence)
        verified = MOD.promoted_evidence(evidence, summary)
        with self.assertRaisesRegex(ValueError, "cannot be overwritten"):
            MOD.promoted_evidence(verified, summary)

    def test_check_mode_requires_the_receipt_and_checks_generated_outputs(self):
        evidence = self.pending_evidence()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            receipt = self.completed_receipt(root, evidence)
            summary = MOD.validate_completed_receipt(receipt, evidence)
            evidence_path = root / "local-mirror-evidence.json"
            evidence_path.write_text(json.dumps(MOD.promoted_evidence(evidence, summary)), encoding="utf-8")
            with mock.patch.object(MOD, "refresh_generated") as refresh, mock.patch.object(
                sys, "argv", ["promote_s3_receipt.py", "--check", "--receipt", str(receipt),
                               "--evidence", str(evidence_path)]
            ), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(MOD.main(), 0)
            refresh.assert_called_once_with(MOD.REPO.resolve(), MOD.REPO.parent.resolve(), check=True)


if __name__ == "__main__":
    unittest.main()
