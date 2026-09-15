import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest


HERE = Path(__file__).resolve().parent


def load(name):
    path = HERE / (name + ".py")
    spec = importlib.util.spec_from_file_location("jumpforce_" + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extract = load("extract")
integrate = load("integrate")


class JumpForceStreamingAudioTest(unittest.TestCase):
    def test_afs2_stream_count_and_rejection(self):
        with tempfile.TemporaryDirectory() as temporary:
            valid = Path(temporary) / "valid.awb"
            valid.write_bytes(b"AFS2" + b"\x02\x04\x02\x00" + (143).to_bytes(4, "little") + b"\x20\x00\x00\x00")
            self.assertEqual(extract.awb_stream_count(valid), 143)
            invalid = Path(temporary) / "invalid.awb"
            invalid.write_bytes(b"NOPE" + bytes(12))
            with self.assertRaises(ValueError):
                extract.awb_stream_count(invalid)

    def test_pcm_wave_metadata_uses_data_chunk_frames(self):
        fmt = struct.pack("<HHIIHH", 1, 1, 48000, 96000, 2, 16)
        payload = b"\x00\x00\x01\x00\x02\x00\x03\x00"
        body = b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(payload)) + payload
        riff = b"RIFF" + struct.pack("<I", len(body) + 4) + b"WAVE" + body
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decoded.wav"
            path.write_bytes(riff)
            metadata = extract.parse_pcm_wave(path)
        self.assertEqual(metadata["sampleRate"], 48000)
        self.assertEqual(metadata["channels"], 1)
        self.assertEqual(metadata["frames"], 4)
        self.assertEqual(metadata["bitsPerSample"], 16)
        self.assertEqual(metadata["durationSeconds"], 4 / 48000)

    def test_native_label_categories_remain_narrow(self):
        self.assertEqual(extract.category_for("130000_chr0000_EvnVoice.awb"), "voice")
        self.assertEqual(extract.category_for("100060_chr0060_ActSE.awb"), "sfx")
        self.assertEqual(extract.category_for("900000_ResidentBGM.awb"), "music")

    def test_grouping_keeps_character_and_common_banks_distinct(self):
        self.assertEqual(integrate.classify_group({"nativeCharacterId": "chr0060", "sourceBank": "original/a.awb"}), "chr0060")
        self.assertEqual(integrate.classify_group({"nativeCharacterId": None, "sourceBank": "original/910001_BattleResSE.awb"}), "battle-res-se")

    def test_character_map_does_not_resolve_unknown_ids(self):
        document = json.loads((HERE / "character-map.json").read_text())
        self.assertEqual(document["schema"], "ggd.jumpforce.native-character-map.v1")
        self.assertFalse(set(document["characters"]) & set(document["unresolvedNativeIds"]))
        self.assertIn("0060", document["characters"])
        self.assertIn("0440", document["unresolvedNativeIds"])


if __name__ == "__main__":
    unittest.main()
