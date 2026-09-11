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
            already = portal.init({'name': 'pakchunk0-WindowsClient.pak', 'size': len(payload), 'lastModified': 1})
            self.assertTrue(already['complete'])
            self.assertEqual(portal.finalize(already['id'])['sha256'], done['sha256'])
            repeated = portal.init({'name': 'pakchunk0-WindowsClient.pak', 'size': len(payload), 'lastModified': 1})
            self.assertEqual(repeated['received'], len(payload))

    def test_steam_collection_preserves_paths_and_writes_intake(self):
        with tempfile.TemporaryDirectory() as folder:
            portal = mod.Portal(Path(folder), 'fixture', 64, postprocess=False)
            payload = b'pak-data'
            state = portal.init({'name': 'pakchunk0-WindowsClient.pak', 'size': len(payload),
                                 'lastModified': 2, 'collection': 'steam-1850510-infinity-library-1',
                                 'relativePath': 'Game/Content/Paks/pakchunk0-WindowsClient.pak'})
            portal.append(state['id'], 0, io.BytesIO(payload), len(payload))
            done = portal.finalize(state['id'])
            self.assertTrue(done['absolutePath'].endswith(
                'steam-intakes/steam-1850510-infinity-library-1/files/Game/Content/Paks/pakchunk0-WindowsClient.pak'))
            result = portal.finalize_collection({'collection': 'steam-1850510-infinity-library-1',
                'libraryLabel': 'SteamLibrary', 'gameName': 'Infinity Strash', 'appId': '1850510',
                'installDir': 'InfinityStrash', 'buildId': '123456', 'manifestLastUpdated': '1780000000',
                'prioritySource': True, 'detectedAssetKinds': ['Unreal'], 'uploads': [state['id']]})
            intake = json.loads(Path(result['manifestPath']).read_text())
            self.assertEqual(intake['fileCount'], 1)
            self.assertEqual(intake['files'][0]['assetFamily'], 'unreal')
            self.assertEqual(intake['postProcessing']['state'], 'queued')
            self.assertEqual(intake['buildId'], '123456')
            self.assertTrue(intake['prioritySource'])
            self.assertEqual(intake['detectedAssetKinds'], ['Unreal'])

    def test_steam_collection_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as folder:
            portal = mod.Portal(Path(folder), 'fixture', 64, postprocess=False)
            with self.assertRaisesRegex(ValueError, 'relative path'):
                portal.init({'name': 'asset.pak', 'size': 1, 'lastModified': 2,
                             'collection': 'steam-test-library-1', 'relativePath': '../asset.pak'})

    def test_steam_collection_rejects_invalid_scanner_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            portal = mod.Portal(Path(folder), 'fixture', 64, postprocess=False)
            with self.assertRaisesRegex(ValueError, 'asset kinds'):
                portal.finalize_collection({'collection': 'steam-test-library-1', 'uploads': [],
                                            'detectedAssetKinds': 'Unreal'})


if __name__ == '__main__':
    unittest.main()
