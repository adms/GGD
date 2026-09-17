import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("cmp_probe.py")
SPEC = importlib.util.spec_from_file_location("jstars_cmp_probe", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CmpProbeTests(unittest.TestCase):
    def test_mixed_chunks_record_ch0_without_claiming_decode(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "018/sample.pak"
            path.parent.mkdir()
            header = bytearray(32)
            header[:4] = b"$CMP"
            header[16:20] = struct.pack(">I", 1234)
            cl0 = b"$CL0" + struct.pack(">III", 20, 20, 0) + b"abcd"
            nested = b"$CH0" + struct.pack(">III", 16, 4, 0)
            clh = b"$CLH" + struct.pack(">III", 20, 32, 0) + nested
            path.write_bytes(header + cl0 + clh)
            value = MODULE.inspect_cmp(path, root)
            self.assertEqual(value["chunkModes"], {"$CL0": 1, "$CLH": 1})
            self.assertTrue(value["requiresUnsupportedCh0Stage"])
            self.assertEqual(value["nativeToken"], "018")


if __name__ == "__main__":
    unittest.main()
