"""An intake backup preserves every byte and keeps paid deliveries separate from releases."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


class IntakeArchive(unittest.TestCase):
    def test_paid_complete_archive_is_idempotent_and_rejects_links(self):
        with tempfile.TemporaryDirectory() as folder:
            workspace = Path(folder)
            repo = workspace / 'GGD'
            script = repo / 'tools/hero-model-library/archive-intake.py'
            script.parent.mkdir(parents=True)
            shutil.copyfile(Path(__file__).with_name('archive-intake.py'), script)
            data = repo / 'materials/hero-model-library'
            data.mkdir(parents=True)
            home = workspace / 'intake/paid-test-v1'
            (home / 'extracted').mkdir(parents=True)
            payloads = {'raw.zip': b'original archive', 'extracted/model.bin': bytes(range(256)),
                        'extracted/.credits.txt': '來源作者'.encode()}
            for name, blob in payloads.items():
                (home / name).write_bytes(blob)
            source = {'id': 'paid-test-v1', 'localPath': 'intake/paid-test-v1'}
            (data / 'download-sources.json').write_text(json.dumps({'paidSources': [source]}))
            (data / 'public-source-files.json').write_text(json.dumps({'sources': [], 'pendingUploads': []}))
            cmd = [sys.executable, str(script), 'paid-test-v1', '--workspace', str(workspace)]
            subprocess.run(cmd, check=True, capture_output=True)
            subprocess.run(cmd, check=True, capture_output=True)
            index = json.loads((data / 'public-source-files.json').read_text())
            self.assertEqual(index['sources'], [])
            self.assertEqual(len(index['pendingUploads']), 1)
            pending = index['pendingUploads'][0]
            self.assertIn('/legacy/paid-model-sources/paid-test-v1/', pending['plannedS3Uri'])
            self.assertFalse(pending['readbackVerified'])
            archive = workspace / pending['localArchive']
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), pending['sha256'])
            with zipfile.ZipFile(archive) as z:
                self.assertEqual(set(z.namelist()), set(payloads))
                for row in pending['files']:
                    self.assertEqual(z.read(row['path']), payloads[row['path']])
                    self.assertEqual(row['sha256'], hashlib.sha256(payloads[row['path']]).hexdigest())
            (home / 'link').symlink_to(workspace)
            result = subprocess.run(cmd, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Unsupported intake member', result.stderr)


if __name__ == '__main__':
    unittest.main()
