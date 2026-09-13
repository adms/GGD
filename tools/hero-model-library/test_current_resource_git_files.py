import hashlib
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from current_resource_index import verify_git_contents


class CurrentResourceGitFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.repo = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q'], cwd=self.repo, check=True)
        self.path = self.repo / 'materials/source-index.json'
        self.path.parent.mkdir(parents=True)
        self.payload = b'{"records": 435}\n'
        self.path.write_bytes(self.payload)
        self.entry = {
            'gitPath': 'materials/source-index.json',
            'bytes': len(self.payload),
            'sha256': hashlib.sha256(self.payload).hexdigest(),
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_untracked_local_copy_does_not_satisfy_git_contract(self):
        with self.assertRaisesRegex(ValueError, 'absent from the Git index'):
            verify_git_contents([self.entry], self.repo)

    def test_staged_exact_blob_satisfies_git_contract(self):
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        verify_git_contents([self.entry], self.repo)

    def test_staged_mismatched_blob_is_rejected(self):
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        changed = dict(self.entry, sha256='0' * 64)
        with self.assertRaisesRegex(ValueError, 'differs from the index'):
            verify_git_contents([changed], self.repo)


if __name__ == '__main__':
    unittest.main()
