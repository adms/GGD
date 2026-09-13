#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("extract.py")
SPEC = importlib.util.spec_from_file_location("infinity_strash_extract", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SelectionTests(unittest.TestCase):
    def test_selects_all_three_native_ids_and_deduplicates(self) -> None:
        paths = [
            "strash/Content/Strash/Chara/Player/PN010/mesh.uasset",
            "strash/Content/Strash/VFX/EN801/effect.uasset",
            "strash/Content/WwiseAudio/VO_EN653_MystVearn/event.uasset",
            "strash/Content/Other.uasset",
            "strash/Content/Strash/Chara/Player/PN010/mesh.uasset",
        ]
        self.assertEqual(MODULE.select(paths), sorted(paths[:3]))

    def test_keeps_baran_separate(self) -> None:
        self.assertEqual(MODULE.select(["VO_EN680_Baran/event.uasset"]), [])

    def test_classifies_audio_before_other_tokens(self) -> None:
        self.assertEqual(MODULE.classify("strash/Content/WwiseAudio/VO_PN010/Animations.uasset"), "audio-event-or-audio-package")

    def test_identity_requires_exact_native_token(self) -> None:
        self.assertEqual(MODULE.identity_for("VFX/EN801/effect.uasset"), "EN801")
        self.assertEqual(MODULE.identity_for("VFX/EN801/PN010/shared.uasset"), "multiple-or-unresolved")
        self.assertEqual(MODULE.identity_for("VFX/XEN801A/effect.uasset"), "multiple-or-unresolved")
        self.assertEqual(MODULE.select(["VFX/XPN010A/effect.uasset"]), [])


if __name__ == "__main__":
    unittest.main()
