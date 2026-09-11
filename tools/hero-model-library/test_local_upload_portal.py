import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('local_upload_portal.py')
SPEC = importlib.util.spec_from_file_location('local_upload_portal', SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class LocalUploadPortalTest(unittest.TestCase):
    def test_resume_streams_then_records_sha_without_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            portal = mod.Portal(Path(folder), 'fixture', 64)
            payload = b'abcdefghij'
            state = portal.init({'name': '../../pakchunk0-WindowsClient.pak', 'size': len(payload), 'lastModified': 1})
            portal.append(state['id'], 0, io.BytesIO(payload[:4]), 4)
            resumed = portal.init({'name': 'pakchunk0-WindowsClient.pak', 'size': len(payload), 'lastModified': 1})
            self.assertEqual(resumed['received'], 4)
            portal.append(state['id'], 4, io.BytesIO(payload[4:]), len(payload) - 4)
            done = portal.finalize(state['id'])
            target = Path(done['absolutePath'])
            self.assertEqual(target.name, 'pakchunk0-WindowsClient.pak')
            self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(done['sha256'], hashlib.sha256(payload).hexdigest())
            receipt = json.loads(Path(done['receiptPath']).read_text())
            self.assertFalse(receipt['s3Uploaded'])
            self.assertEqual(receipt['sourceRegistration'], 'pending-intake-validation')
            repeated = portal.init({'name': 'pakchunk0-WindowsClient.pak', 'size': len(payload), 'lastModified': 1})
            portal.append(repeated['id'], 0, io.BytesIO(payload), len(payload))
            with self.assertRaisesRegex(ValueError, 'Destination already exists'):
                portal.finalize(repeated['id'])


if __name__ == '__main__':
    unittest.main()
