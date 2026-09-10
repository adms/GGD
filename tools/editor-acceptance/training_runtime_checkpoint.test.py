"""CPU serialization/failure tests; no ML stack or battery sensors."""
import json
from pathlib import Path
import random
import tempfile
import unittest
import training_runtime_checkpoint as c

class CheckpointTests(unittest.TestCase):
    def save(self, root, data):
        return c.save(root, {'recipe': 'fixed'}, data, is_tensor=lambda v: False,
                      save_tensors=lambda p, ts: Path(p).write_text(json.dumps(ts)))
    def load(self, receipt, contract=None):
        return c.load(receipt, contract or {'recipe': 'fixed'}, load_tensors=lambda p: json.loads(Path(p).read_text()))
    def test_roundtrip_types_rng_and_contract(self):
        rng = random.Random(123); state = rng.getstate()
        data = {'optimizer': {'step': 7, 'rate': .002}, 'rng': state, 'order': [3, 1, 2], 'nextStep': 2}
        with tempfile.TemporaryDirectory() as root:
            receipt = self.save(root, data); loaded = self.load(receipt)
            self.assertEqual(data, loaded)
            restored = random.Random(); restored.setstate(loaded['rng'])
            self.assertEqual(rng.random(), restored.random())
            with self.assertRaisesRegex(ValueError, 'CONTRACT_DRIFT'): self.load(receipt, {'recipe': 'changed'})
    def test_corrupt_and_partial_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            receipt = self.save(root, {'step': 7})
            (Path(receipt['path']) / 'tensors.safetensors').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'TENSOR_DRIFT'): self.load(receipt)
            receipt = self.save(root, {'step': 8})
            (Path(receipt['path']) / 'state.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'STATE_DRIFT'): self.load(receipt)
            with self.assertRaisesRegex(ValueError, 'INCOMPLETE'): self.load({'path': str(Path(root)/'broken.pending')})
    def test_failed_write_never_publishes(self):
        with tempfile.TemporaryDirectory() as root:
            def failure(path, ts): Path(path).write_bytes(b'partial'); raise OSError('disk full')
            with self.assertRaises(OSError):
                c.save(root, {}, {}, is_tensor=lambda v: False, save_tensors=failure)
            self.assertTrue(all(p.name.endswith('.pending') for p in Path(root).iterdir()))
    def test_unsupported_values_fail(self):
        for v in (float('nan'), float('inf'), {3: 'key'}, object()):
            with self.assertRaises((TypeError, ValueError)): c.pack(v, {}, lambda x: False)

if __name__ == '__main__': unittest.main()
