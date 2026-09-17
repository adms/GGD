import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('promote_split_uploaded_backup.py')
SPEC = importlib.util.spec_from_file_location('promote_split_uploaded_backup', SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class PromoteSplitBackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo = root / 'repo'
        self.workspace = root / 'workspace'
        (self.repo / 'materials/hero-model-library').mkdir(parents=True)
        self.workspace.mkdir()
        self.archive = self.workspace / 'archive.zip'
        payload = b'fixture payload'
        with zipfile.ZipFile(self.archive, 'w') as bundle:
            bundle.writestr('only.txt', payload)
        self.archive_sha = sha(self.archive)
        self.archive_bytes = self.archive.stat().st_size
        self.plan = f's3://{mod.BUCKET}/legacy/public-model-sources/source/{self.archive_sha}.zip'
        self.part = {'number': 1, 'bytes': self.archive_bytes, 'sha256': self.archive_sha,
                     's3Uri': self.plan.removesuffix('.zip') + '/split/archive.zip.part-00001',
                     'readbackVerified': True}
        self.receipt = {'id': 'source', 'type': 'split-zip',
                        's3Uri': self.plan.removesuffix('.zip') + '/split/manifest-' + 'a' * 64 + '.json',
                        's3ObjectSha256': 'a' * 64, 'sha256': self.archive_sha, 'bytes': self.archive_bytes,
                        'parts': [self.part], 'readbackVerified': True, 'orderedArchiveReadbackVerified': True,
                        'originalLocalArchive': 'archive.zip', 'restore': 'fixture'}
        self.receipt_path = self.workspace / 'receipt.json'
        self.receipt_path.write_text(json.dumps(self.receipt))
        source = {'id': 'source', 'verification': 'fixture', 'pendingBackup': {
            'status': 'not-uploaded', 'localArchive': 'archive.zip', 'plannedS3Uri': self.plan,
            'bytes': self.archive_bytes, 'sha256': self.archive_sha}}
        row = {'id': 'source', 'localArchive': 'archive.zip', 'plannedS3Uri': self.plan,
               'bytes': self.archive_bytes, 'sha256': self.archive_sha, 'contentKind': 'complete-intake',
               'files': [{'path': 'only.txt', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}]}
        (self.repo / 'materials/hero-model-library/download-sources.json').write_text(json.dumps({'publicSources': [source]}))
        (self.repo / 'materials/hero-model-library/public-source-files.json').write_text(json.dumps({'sources': [], 'pendingUploads': [row]}))
        self.repo_patch = patch.object(mod, 'REPO', self.repo)
        self.repo_patch.start()
        self.addCleanup(self.repo_patch.stop)

    def invoke(self):
        with patch.object(sys, 'argv', [str(SCRIPT), 'source', '--workspace', str(self.workspace), '--receipt', str(self.receipt_path)]):
            mod.main()

    def state(self):
        base = self.repo / 'materials/hero-model-library'
        return (json.loads((base / 'download-sources.json').read_text()),
                json.loads((base / 'public-source-files.json').read_text()))

    def test_promotes_only_verified_split_archive(self):
        self.invoke()
        downloads, index = self.state()
        source = downloads['publicSources'][0]
        self.assertNotIn('pendingBackup', source)
        self.assertTrue(source['backup']['orderedArchiveReadbackVerified'])
        self.assertEqual(index['pendingUploads'], [])
        self.assertEqual(index['sources'][0]['archiveFormat'], 'split-zip')
        self.assertTrue(index['sources'][0]['allMemberSha256Verified'])

    def test_rejects_changed_part_digest_without_mutation(self):
        self.receipt['parts'][0]['sha256'] = 'b' * 64
        self.receipt_path.write_text(json.dumps(self.receipt))
        with self.assertRaisesRegex(ValueError, 'part differs'):
            self.invoke()
        downloads, index = self.state()
        self.assertIn('pendingBackup', downloads['publicSources'][0])
        self.assertEqual(len(index['pendingUploads']), 1)
        self.assertEqual(index['sources'], [])

    def test_promotes_prior_single_archive_readback_404_state_only_with_split_receipt(self):
        downloads, _ = self.state()
        downloads['publicSources'][0]['pendingBackup']['status'] = 'upload-returned-success-readback-404'
        (self.repo / 'materials/hero-model-library/download-sources.json').write_text(json.dumps(downloads))
        self.invoke()
        downloads, index = self.state()
        self.assertNotIn('pendingBackup', downloads['publicSources'][0])
        self.assertEqual(len(index['sources']), 1)


if __name__ == '__main__':
    unittest.main()
