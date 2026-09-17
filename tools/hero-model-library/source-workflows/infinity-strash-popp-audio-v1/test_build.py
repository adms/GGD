#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import struct
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build.py")
SPEC = importlib.util.spec_from_file_location("strash_popp_audio", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildTests(unittest.TestCase):
    def test_event_classification_keeps_voice_sound_and_music_separate(self) -> None:
        self.assertEqual(MODULE.event_kind("WwiseAudio/Events/Voice_Work_Unit/VO_PN020/x.uasset"), "voice")
        self.assertEqual(MODULE.event_kind("WwiseAudio/Events/EN_Boss/PN020/x.uasset"), "sound-effect")
        self.assertEqual(MODULE.event_kind("WwiseAudio/Events/BGM_Work_Unit/x.uasset"), "music")

    def test_language_comes_from_localized_path(self) -> None:
        self.assertEqual(MODULE.language_for("/Localized/Japanese/Media/1"), "Japanese")
        self.assertEqual(MODULE.language_for("/Localized/English_US_/Media/1"), "English_US")
        self.assertEqual(MODULE.language_for("/Media/1"), "nonlocalized")

    def test_chooses_the_single_riff_that_ends_at_payload_boundary(self) -> None:
        ending = b"RIFF" + struct.pack("<I", 4) + b"WAVE"
        overlapping = b"RIFF" + struct.pack("<I", 100) + b"junk"
        self.assertEqual(MODULE.exact_riff_at_end(overlapping + ending), ending)

    def test_rejects_payload_without_exact_ending_riff(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.exact_riff_at_end(b"no audio")


if __name__ == "__main__":
    unittest.main()
