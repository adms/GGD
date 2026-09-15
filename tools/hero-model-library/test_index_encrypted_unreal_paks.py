import gzip
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("index_encrypted_unreal_paks.py")


class EncryptedPakIndexTest(unittest.TestCase):
    def test_preserves_duplicate_relations_and_patch_winner(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "containers.json"
            raw = root / "raw"
            raw.mkdir()
            manifest.write_text(json.dumps({"files": [
                {"path": "/games/JUMP FORCE/JUMP_FORCE/Content/Paks/base.pak", "size": 10, "sha256": "a" * 64},
                {"path": "/games/JUMP FORCE/JUMP_FORCE/Content/Paks/patch.pak", "size": 20, "sha256": "b" * 64},
            ]}))
            (raw / "base.txt").write_text(
                "JUMP_FORCE/Content/Character/chr0430/body.uasset\n"
                "JUMP_FORCE/Content/Sound/Character/chr0430/voice.uasset\n"
            )
            (raw / "patch.txt").write_text(
                "JUMP_FORCE/Content/Character/chr0430/body.uasset\n"
                "JUMP_FORCE/Content/Effects/equipment/0430/slash.uasset\n"
            )
            summary_json = root / "summary.json"
            summary_md = root / "summary.md"
            full = root / "full.jsonl.gz"
            subprocess.run([
                "python3", str(SCRIPT),
                "--container-manifest", str(manifest),
                "--raw-list-dir", str(raw),
                "--source-id", "fixture",
                "--character-map", "chr0430:Dai:godie-nbbc,godie-n01c",
                "--summary-json", str(summary_json),
                "--summary-md", str(summary_md),
                "--full-index", str(full),
                "--key-sha256", "c" * 64,
            ], check=True, capture_output=True, text=True)
            summary = json.loads(summary_json.read_text())
            self.assertEqual(summary["relationCount"], 4)
            self.assertEqual(summary["uniquePathCount"], 3)
            self.assertEqual(summary["duplicateRelationCount"], 1)
            self.assertEqual(summary["characters"][0]["relationCount"], 4)
            with gzip.open(full, "rt", encoding="utf-8") as handle:
                rows = [json.loads(line) for line in handle]
            body = [row for row in rows if row["path"].endswith("body.uasset")]
            self.assertEqual([row["selectedByPatchOrder"] for row in body], [False, True])
            self.assertEqual(body[0]["overriddenBy"], ["patch.pak"])
            self.assertNotIn("UNREAL_PAK_AES_KEY", summary_json.read_text())

    def test_rejects_traversal_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / "raw"
            raw.mkdir()
            (root / "containers.json").write_text(json.dumps({"files": [
                {"path": "/games/JUMP FORCE/JUMP_FORCE/Content/Paks/base.pak", "size": 1, "sha256": "a" * 64},
            ]}))
            (raw / "base.txt").write_text("../../../escape.uasset\n")
            result = subprocess.run([
                "python3", str(SCRIPT),
                "--container-manifest", str(root / "containers.json"),
                "--raw-list-dir", str(raw),
                "--source-id", "fixture",
                "--summary-json", str(root / "out.json"),
                "--summary-md", str(root / "out.md"),
                "--full-index", str(root / "out.jsonl.gz"),
            ], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unsafe PAK entry path", result.stderr)


if __name__ == "__main__":
    unittest.main()
