"""Archive verification must apply to the exact preserved full-audit bytes."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from full_audit_archive import (
    COMPACT_AUDITS, GIT_MANIFEST, PENDING, VERIFIED,
    refresh_compact_audits, refreshed_full_audit,
)


class FullAuditArchiveTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.repo = Path(temporary.name)
        self.manifest_path = self.repo / GIT_MANIFEST
        self.manifest_path.parent.mkdir(parents=True)
        self.audit = {
            "bytes": 200,
            "sha256": "a" * 64,
            "archiveMember": COMPACT_AUDITS[0],
            "gitManifest": GIT_MANIFEST,
            "localPath": "preserved-source.json",
            "restoreRequiredForCatalogBuild": False,
        }
        self.manifest = {
            "fullGetVerified": True,
            "allArchiveMembersSha256Verified": True,
            "files": [{"path": COMPACT_AUDITS[0], "sha256": "a" * 64, "bytes": 200}],
        }

    def write_manifest(self, manifest=None):
        self.manifest_path.write_text(json.dumps(self.manifest if manifest is None else manifest))

    def test_missing_pending_or_incomplete_receipt_stays_pending(self):
        self.assertEqual(refreshed_full_audit(self.audit, self.repo)["archiveStatus"], PENDING)
        for field in ("fullGetVerified", "allArchiveMembersSha256Verified"):
            for value in (False, None, "true", 1):
                with self.subTest(field=field, value=value):
                    manifest = copy.deepcopy(self.manifest)
                    manifest[field] = value
                    self.write_manifest(manifest)
                    self.assertEqual(refreshed_full_audit(self.audit, self.repo)["archiveStatus"], PENDING)

    def test_verified_exact_member_preserves_reference_data(self):
        self.write_manifest()
        result = refreshed_full_audit(self.audit, self.repo)
        self.assertEqual(result["archiveStatus"], VERIFIED)
        self.assertEqual(result["status"], "local-preserved-s3-readback-verified")
        self.assertEqual({key: result[key] for key in self.audit}, self.audit)
        self.assertNotIn("archiveStatus", self.audit)

    def test_member_path_hash_size_or_duplicate_mismatch_stays_pending(self):
        for field, value in (("path", "different.json"), ("sha256", "b" * 64), ("bytes", 201), ("bytes", "200")):
            with self.subTest(field=field):
                manifest = copy.deepcopy(self.manifest)
                manifest["files"][0][field] = value
                self.write_manifest(manifest)
                self.assertEqual(refreshed_full_audit(self.audit, self.repo)["archiveStatus"], PENDING)
        self.manifest["files"] *= 2
        self.write_manifest()
        self.assertEqual(refreshed_full_audit(self.audit, self.repo)["archiveStatus"], PENDING)

    def test_refresh_only_five_full_audit_objects_and_is_idempotent(self):
        originals = {}
        self.manifest["files"] = []
        for relative in COMPACT_AUDITS:
            audit = dict(self.audit, archiveMember=relative, status="local-preserved-s3-readback-pending", archiveStatus=PENDING)
            doc = {"fullAudit": audit, "candidates": [{"name": "坂田銀時", "count": 399}], "source": {"preserved": True}}
            originals[relative] = copy.deepcopy(doc)
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(doc))
            self.manifest["files"].append({"path": relative, "bytes": 200, "sha256": "a" * 64})
        self.write_manifest()
        before_bytes = {relative: (self.repo / relative).read_bytes() for relative in COMPACT_AUDITS}
        self.assertEqual(refresh_compact_audits(self.repo, check=True), list(COMPACT_AUDITS))
        self.assertEqual(before_bytes, {relative: (self.repo / relative).read_bytes() for relative in COMPACT_AUDITS})
        self.assertEqual(refresh_compact_audits(self.repo), list(COMPACT_AUDITS))
        for relative, original in originals.items():
            result = json.loads((self.repo / relative).read_text())
            self.assertEqual(result.pop("fullAudit")["archiveStatus"], VERIFIED)
            original.pop("fullAudit")
            self.assertEqual(result, original)
        self.assertEqual(refresh_compact_audits(self.repo), [])

    def test_verified_receipt_invalidated_by_later_member_mismatch(self):
        self.write_manifest()
        verified = refreshed_full_audit(self.audit, self.repo)
        self.manifest["files"][0]["sha256"] = "b" * 64
        self.write_manifest()
        result = refreshed_full_audit(verified, self.repo)
        self.assertEqual(result["archiveStatus"], PENDING)
        self.assertEqual(result["status"], "local-preserved-s3-readback-pending")


if __name__ == "__main__":
    unittest.main()
