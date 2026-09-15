import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("probe_kof_xiv_effects.py")
SPEC = importlib.util.spec_from_file_location("probe_kof_xiv_effects", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ProbeKofXivEffectsTest(unittest.TestCase):
    def test_ascii_runs_preserve_offsets(self):
        self.assertEqual([(4, "MAI_Fire1"), (15, "fire_add")], MODULE.ascii_runs(b"\0\0\0\0MAI_Fire1\0\0fire_add\0"))

    def test_file_record_is_hash_bound(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "asset.dds"
            path.write_bytes(b"proof")
            row = MODULE.file_record(path, "effect-texture-source", [12, 40])
            self.assertEqual("asset", row["basename"])
            self.assertEqual(5, row["bytes"])
            self.assertEqual([12, 40], row["occurrenceOffsets"])
            self.assertEqual("c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7", row["sha256"])


if __name__ == "__main__":
    unittest.main()
