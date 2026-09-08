import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('delivery', Path(__file__).with_name('hero-finetune-low-update-delivery.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.data = self.root / 'files/report.json'
        self.data.parent.mkdir()
        self.data.write_text('{"qualified":false}\n')
        objects = []
        for step in [6, 12, 18, 24]:
            sha = d.store.archive.hashlib.sha256(str(step).encode()).hexdigest()
            paths = [str(d.REL / (d.RUN + '-pilot') / f'checkpoint-{step:04d}' / 'adapters.safetensors')]
            if step == 24:
                paths.append(str(d.REL / d.RUN / 'research-adapter/adapters.safetensors'))
            objects.append({'sha256': sha, 'bytes': len(str(step)), 'key': d.store.PREFIX + sha + '.safetensors', 'paths': paths})
        self.index = {'schema': 'ggd-low-update-delivery@1', 'run': d.RUN,
            'profile': d.store.PROFILE, 'region': d.store.REGION, 'bucket': d.store.BUCKET,
            'productionQualified': False, 'objects': objects,
            'text': [{'path': 'files/report.json', 'originalPath': str(d.REL / d.RUN / 'result.json'), 'bytes': self.data.stat().st_size,
                      'sha256': d.store.archive.digest(self.data)}]}
        self.save()

    def save(self):
        (self.root / d.INDEX).write_text(json.dumps(self.index))

    def test_valid_offline_metadata_not_payload_proof(self):
        r = d.verify(self.root)
        self.assertEqual((r['uniqueCheckpoints'], r['weightPaths']), (4, 5))
        self.assertFalse(r['payloadVerified'])
        self.assertFalse(r['remoteChecked'])

    def test_changed_text_rejected(self):
        self.data.write_text('{}')
        with self.assertRaises(Exception):
            d.verify(self.root)

    def test_missing_checkpoint_rejected(self):
        self.index['objects'].pop(0)
        self.save()
        with self.assertRaisesRegex(Exception, 'ALL_CHECKPOINTS'):
            d.verify(self.root)

    def test_path_traversal_rejected(self):
        self.index['objects'][0]['paths'][0] = '../escape'
        self.save()
        with self.assertRaises(Exception):
            d.verify(self.root)

    def test_storage_boundary_pinned(self):
        self.index['bucket'] = 'other-bucket'
        self.save()
        with self.assertRaisesRegex(Exception, 'STORAGE_BOUNDARY'):
            d.verify(self.root)

    def test_cannot_overwrite_snapshot(self):
        with self.assertRaisesRegex(Exception, 'NEW_DESTINATION_REQUIRED'):
            d.snapshot(self.root, self.root)

    def test_bad_hash_key_rejected(self):
        self.index['objects'][0]['sha256'] = '../bad'
        self.save()
        with self.assertRaisesRegex(Exception, 'OBJECT_HASH'):
            d.verify(self.root)

    def test_verified_offline_restore(self):
        cache = self.root / 'cache'
        cache.mkdir()
        for step, obj in zip([6, 12, 18, 24], self.index['objects']):
            (cache / Path(obj['key']).name).write_bytes(str(step).encode())
        with tempfile.TemporaryDirectory() as other:
            dest = Path(other).resolve() / 'new'
            result = d.restore(self.root, dest, cache, offline=True)
            self.assertEqual(result['restoredWeightPaths'], 5)
            self.assertFalse(result['remoteReadThisRun'])
            with self.assertRaisesRegex(Exception, 'NEW_RESTORE_DESTINATION_REQUIRED'):
                d.restore(self.root, dest, cache, offline=True)

    def test_missing_cache_does_not_pass(self):
        with tempfile.TemporaryDirectory() as other:
            with self.assertRaisesRegex(Exception, 'PAYLOAD_HASH_MISMATCH'):
                d.restore(self.root, Path(other).resolve() / 'new', self.root / 'missing', offline=True)


if __name__ == '__main__':
    unittest.main()
