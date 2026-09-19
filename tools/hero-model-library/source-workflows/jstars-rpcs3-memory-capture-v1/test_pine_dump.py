import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("pine_dump.py")
SPEC = importlib.util.spec_from_file_location("jstars_pine_dump", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

CONFIG_PATH = Path(__file__).with_name("configure_ipc.py")
CONFIG_SPEC = importlib.util.spec_from_file_location("jstars_configure_ipc", CONFIG_PATH)
CONFIG_MODULE = importlib.util.module_from_spec(CONFIG_SPEC)
CONFIG_SPEC.loader.exec_module(CONFIG_MODULE)


class PineDumpTests(unittest.TestCase):
    def test_priority_character_ids_are_fixed(self):
        self.assertEqual(MODULE.PRIORITY_CHARACTERS, {
            "017": "gon",
            "041": "nube",
            "037": "luckyman",
            "012": "hiei",
        })

    def synthetic_stpk(self) -> bytes:
        name = b"017_gon_01p_PS3.srd\0".ljust(32, b"\0")
        table = struct.pack(">IIII", 0x50, 4, 0, 0) + name
        return b"STPK" + struct.pack(">III", 1, 1, 16) + table + b"\0" * 16 + b"ABCD" + b"\0" * 12

    def test_inspect_and_carve_table_valid_stpk(self):
        payload = self.synthetic_stpk()
        info = MODULE.inspect_stpk(payload, 0)
        self.assertIsNotNone(info)
        self.assertEqual(info["entryCount"], 1)
        self.assertEqual(info["entries"][0]["name"], "017_gon_01p_PS3.srd")
        with tempfile.TemporaryDirectory() as temporary:
            outputs = MODULE.carve_stpk(b"noise" + payload, 0x10000, Path(temporary))
            self.assertEqual(len(outputs), 1)
            self.assertEqual(outputs[0]["guestAddress"], "0x00010005")
            self.assertEqual(Path(outputs[0]["absolutePath"]).read_bytes(), payload)
            self.assertEqual(len(outputs[0]["splitMembers"]), 1)
            self.assertEqual(Path(outputs[0]["splitMembers"][0]["absolutePath"]).read_bytes(), b"ABCD")

    def test_rejects_unsafe_or_out_of_bounds_stpk(self):
        payload = bytearray(self.synthetic_stpk())
        payload[32:64] = b"../escape\0".ljust(32, b"\0")
        self.assertIsNone(MODULE.inspect_stpk(bytes(payload), 0))
        payload = bytearray(self.synthetic_stpk())
        struct.pack_into(">I", payload, 16, 0xFFFFFF00)
        self.assertIsNone(MODULE.inspect_stpk(bytes(payload), 0))

    def test_range_parser_and_batches(self):
        self.assertEqual(MODULE.parse_range("0x10000:0x10020"), (0x10000, 0x10020))
        self.assertEqual(list(MODULE.batch_ranges(0, 40, 2)), [(0, 16), (16, 32), (32, 40)])

    def test_failed_batch_splits_to_minimum_ranges(self):
        class Client:
            def read_words(self, addresses):
                if 16 in addresses:
                    raise ValueError("unmapped")
                return b"A" * (len(addresses) * 8)

        payload, failed = MODULE.read_resilient(Client(), 0, 32, minimum_bytes=8)
        self.assertEqual(payload, b"A" * 16 + b"\0" * 8 + b"A" * 8)
        self.assertEqual([(row["start"], row["end"]) for row in failed], [("0x00000010", "0x00000018")])

    def test_ipc_config_preserves_unrelated_settings_and_backup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = root / "config/ipc.yml"
            config.parent.mkdir()
            config.write_text("Other: retained\nIPC Server enabled: false\nIPC Port: 1\n", encoding="utf-8")
            result = CONFIG_MODULE.configure(config, root / "backups")
            self.assertTrue(result["changed"])
            self.assertTrue(Path(result["backup"]).is_file())
            self.assertEqual(config.read_text(encoding="utf-8"), "Other: retained\n\n" + CONFIG_MODULE.DESIRED)


if __name__ == "__main__":
    unittest.main()
