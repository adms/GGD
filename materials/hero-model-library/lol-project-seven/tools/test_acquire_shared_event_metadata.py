import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("acquire_shared_event_metadata.py")
SPEC = importlib.util.spec_from_file_location("acquire_shared_event_metadata", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class SharedEventMetadataTest(unittest.TestCase):
    def test_chunks_cover_exact_cross_chunk_range(self):
        rows = [
            mod.ChunkRef(1, 10, 0, 7, 10, 0),
            mod.ChunkRef(2, 10, 7, 8, 10, 10),
            mod.ChunkRef(3, 10, 15, 9, 10, 20),
        ]
        self.assertEqual([row.chunk_id for row in mod.chunks_covering(rows, 8, 22)], [1, 2, 3])
        with self.assertRaisesRegex(ValueError, "cover"):
            mod.chunks_covering(rows[:2], 8, 22)

    def test_parse_v34_toc_preserves_type_and_subchunk_fields(self):
        blob = bytearray(mod.WAD_V34_HEADER_BYTES + mod.WAD_V34_ENTRY_BYTES)
        blob[:4] = b"RW\x03\x04"
        struct.pack_into("<I", blob, 268, 1)
        struct.pack_into("<QIIIBBHQ", blob, mod.WAD_V34_HEADER_BYTES,
                         0x1234, 900, 80, 120, 0x43, 2, 7, 0xABCDEF)
        entry = mod.parse_wad_v34_toc(bytes(blob))[0]
        self.assertEqual(entry.path_hash, 0x1234)
        self.assertEqual(entry.compression_type, 3)
        self.assertEqual(entry.subchunk_count, 4)
        self.assertEqual(entry.first_subchunk_index, 7 + (2 << 16))

    def test_control_refuses_names_outside_seven(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "control.json"
            path.write_text('{"schema":"ggd.lol-shared-event-metadata-scope@1",'
                            '"scope":"project-seven-only","enabled":true,"fullRosterEnabled":false,'
                            '"allowedFetchNames":["Karthus"],'
                            '"characters":[{"nativeId":"Karthus","heroId":"example:karthus","skinPaths":[]}]}' )
            with self.assertRaisesRegex(ValueError, "Unlisted"):
                mod.load_control(path, ["Ahri"])


if __name__ == "__main__":
    unittest.main()
