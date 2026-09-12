import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from freeze_scoped_stage import freeze, sha


class FreezeScopedStageTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "stage"
        self.source.mkdir()
        (self.source / "nested").mkdir()
        (self.source / "z.txt").write_bytes(b"z")
        (self.source / "nested/a.bin").write_bytes(b"abc")

    def test_freezes_every_regular_file_with_hashes_and_safe_member_names(self):
        output = self.root / "backup"
        result = freeze(self.source, output, "stage-v1", "complete-test-stage")
        self.assertEqual(result["fileCount"], 2)
        self.assertEqual([row["path"] for row in result["files"]], ["nested/a.bin", "z.txt"])
        self.assertTrue(result["plannedS3Uri"].endswith("/" + result["sha256"] + ".tar.gz"))
        with tarfile.open(output / "source.tar.gz", "r:gz") as archive:
            self.assertEqual(archive.getnames(), ["nested/a.bin", "z.txt"])
            self.assertEqual(archive.extractfile("nested/a.bin").read(), b"abc")
        self.assertEqual(sha(output / "source.tar.gz"), result["sha256"])
        self.assertEqual(json.loads((output / "scoped-manifest.json").read_text())["files"], result["files"])
        second = freeze(self.source, self.root / "backup-second", "stage-v1", "complete-test-stage")
        self.assertEqual(second["sha256"], result["sha256"])
        self.assertEqual((self.root / "backup-second/source.tar.gz").read_bytes(), (output / "source.tar.gz").read_bytes())

    def test_refuses_existing_output_and_symlinked_members(self):
        output = self.root / "backup"
        output.mkdir()
        with self.assertRaisesRegex(ValueError, "Preserve existing"):
            freeze(self.source, output, "stage-v1", "test")
        output.rmdir()
        (self.source / "link").symlink_to(self.source / "z.txt")
        with self.assertRaisesRegex(ValueError, "symlink"):
            freeze(self.source, output, "stage-v1", "test")


if __name__ == "__main__":
    unittest.main()
