import hashlib
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from current_resource_index import component_git_evidence, verify_git_contents


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

    def test_component_evidence_is_deduplicated_and_verified(self):
        component = {
            'id': 'example-component',
            'gitPath': 'content/example.glb',
            'sha256': '1' * 64,
            'validationEvidence': self.entry,
            'visualEvidence': dict(self.entry),
        }
        evidence = component_git_evidence([component])
        self.assertEqual(evidence, [self.entry])
        with self.assertRaisesRegex(ValueError, 'absent from the Git index'):
            verify_git_contents(evidence, self.repo)
        subprocess.run(['git', 'add', self.entry['gitPath']], cwd=self.repo, check=True)
        verify_git_contents(evidence, self.repo)

    def test_conflicting_component_evidence_is_rejected(self):
        components = [
            {'validationEvidence': self.entry},
            {'visualEvidence': dict(self.entry, sha256='0' * 64)},
        ]
        with self.assertRaisesRegex(ValueError, 'Conflicting component evidence'):
            component_git_evidence(components)


if __name__ == '__main__':
    unittest.main()
