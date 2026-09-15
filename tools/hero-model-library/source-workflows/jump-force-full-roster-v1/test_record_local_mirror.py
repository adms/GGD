import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("record_local_mirror", HERE / "record_local_mirror.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class RecordLocalMirrorTest(unittest.TestCase):
    def fixture(self, root: Path):
        containers = [{
            "name": f"pak{order}.pak",
            "order": order,
            "absolutePath": str(root / f"pak{order}.pak"),
            "bytes": order + 1,
            "sha256": str(order) * 64,
            "identityVerified": True,
        } for order in range(6)]
        authority = root / "authority.json"
        authority.write_text(json.dumps({"sourceId": MOD.SOURCE_ID, "containers": containers}), encoding="utf-8")
        index = root / "files.jsonl.gz"
        index.write_bytes(b"fixture index")
        mirror = {
            "schema": "ggd.local-readonly-game-mirror@1",
            "complete": True,
            "fileCount": MOD.EXPECTED_FILES,
            "bytes": MOD.EXPECTED_BYTES,
            "source": "smb://lv99/common/JUMP FORCE",
            "sourceReadOnly": True,
            "destination": str(root / "raw-game"),
            "copyMode": "fixture",
            "startedAt": "2026-09-14T18:01:02Z",
            "finishedAt": "2026-09-14T18:11:25Z",
            "durationSeconds": 623.0,
            "averageBytesPerSecond": 1.0,
            "filesIndex": {"path": str(index), "bytes": 13, "sha256": MOD.EXPECTED_INDEX_SHA256},
        }
        (root / "mirror-complete.json").write_text(json.dumps(mirror), encoding="utf-8")
        verification = {
            "schema": "ggd.jumpforce-pak-mirror@1",
            "sourceId": MOD.SOURCE_ID,
            "mirrorRoot": str(root / "raw-game/JUMP_FORCE/Content/Paks"),
            "containers": containers,
            "summary": {"requiredContainers": 6, "verifiedContainers": 6, "verifiedBytes": 21, "allSha256Verified": True},
        }
        (root / "pak-authority-verification.json").write_text(json.dumps(verification), encoding="utf-8")
        return authority

    def test_builds_complete_git_only_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            authority = self.fixture(root)
            evidence = MOD.build(root, authority, verify_local_index=False)
            self.assertEqual(evidence["localMirror"]["fileCount"], 3466)
            self.assertEqual(evidence["localMirror"]["bytes"], 23856777652)
            self.assertEqual(len(evidence["containers"]), 6)
            self.assertFalse(evidence["scope"]["payloadCommittedToGit"])
            self.assertFalse(evidence["scope"]["lv99ShareRequiredForExtraction"])
            self.assertEqual(evidence["s3"]["status"], "pending")
            self.assertEqual(evidence["states"]["convertedModels"], 0)

    def test_rejects_downstream_overclaim(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            authority_path = self.fixture(root)
            authority = MOD.load_json(authority_path)
            evidence = MOD.build(root, authority_path, verify_local_index=False)
            evidence["states"]["backendOptions"] = 1
            with self.assertRaisesRegex(ValueError, "overclaims downstream state"):
                MOD.validate_evidence(evidence, authority)


if __name__ == "__main__":
    unittest.main()
