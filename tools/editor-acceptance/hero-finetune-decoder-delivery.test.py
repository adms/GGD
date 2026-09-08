import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('delivery', Path(__file__).with_name('hero-finetune-decoder-delivery.py'))
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'; h = self.source / d.RUN
        for name in d.CODE + d.INPUTS + ['structured-decoding-v1/report.json', 'structured-decoding-v2/report.json']:
            p = h / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('{}\n')
        self.bundle = self.root / 'bundle'

    def tearDown(self): self.tmp.cleanup()

    def test_roundtrip(self):
        result = d.snapshot(self.source, self.bundle)
        self.assertEqual(result['verifiedTextFiles'], len(d.CODE) + len(d.INPUTS) + 2)
        restored = self.root / 'restored'; d.restore(self.bundle, restored)
        for name in d.CODE + d.INPUTS:
            self.assertEqual((self.source / d.RUN / name).read_bytes(), (restored / d.RUN / name).read_bytes())

    def test_tamper(self):
        d.snapshot(self.source, self.bundle)
        (self.bundle / 'files/structured-hero-control.py.txt').write_text('altered')
        with self.assertRaisesRegex(AssertionError, 'MISMATCH'): d.verify(self.bundle)

    def test_binary_rejected(self):
        (self.source / d.RUN / 'structured-decoding-v1/weight.safetensors').write_bytes(b'abc')
        with self.assertRaisesRegex(AssertionError, 'TEXT_ONLY'): d.snapshot(self.source, self.bundle)

    def test_traversal(self):
        for path in ['../x', '/x', 'a/../b', 'a//b', 'a\\b']:
            with self.assertRaisesRegex(AssertionError, 'UNSAFE'): d.safe_relative(path)

    def test_symlink_rejected(self):
        (self.source / d.RUN / 'structured-decoding-v1/link.json').symlink_to(self.source / d.RUN / d.INPUTS[0])
        with self.assertRaisesRegex(AssertionError, 'SYMLINK'): d.snapshot(self.source, self.bundle)

    def test_unindexed_rejected(self):
        d.snapshot(self.source, self.bundle); (self.bundle / 'files/extra.json').write_text('{}')
        with self.assertRaisesRegex(AssertionError, 'UNINDEXED'): d.verify(self.bundle)

    def test_no_overwrite(self):
        d.snapshot(self.source, self.bundle)
        with self.assertRaisesRegex(AssertionError, 'OVERWRITE'): d.snapshot(self.source, self.bundle)
        with self.assertRaisesRegex(AssertionError, 'OVERWRITE'): d.restore(self.bundle, self.source)


if __name__ == '__main__': unittest.main()
