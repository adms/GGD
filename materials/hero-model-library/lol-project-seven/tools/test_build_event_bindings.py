import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_event_bindings.py")
SPEC = importlib.util.spec_from_file_location("build_event_bindings", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class BuildEventBindingsTest(unittest.TestCase):
    def test_native_spell_tokens_are_candidates(self):
        rules = {"Q": ["LayWaste"], "R": ["FallenOne"]}
        self.assertEqual(mod.category_for_event("Play_vo_Karthus_FallenOne_cast3D", rules),
                         ("ability-cast", "R"))
        self.assertEqual(mod.category_for_event("Play_vo_Karthus_LayWaste_cast3D", rules),
                         ("ability-cast", "Q"))

    def test_generic_categories_do_not_invent_ability_slots(self):
        self.assertEqual(mod.category_for_event("Play_vo_Karthus_Death3D", {}), ("death", None))
        self.assertEqual(mod.category_for_event("Play_vo_Karthus_Move2DStandard", {}), ("move", None))
        self.assertEqual(mod.category_for_event("Play_vo_Karthus_Joke3DGeneral", {}), ("emote", None))

    def test_media_id_must_be_numeric_wem_suffix(self):
        self.assertEqual(mod.media_id_from_source("bank/00002-31441050.wem"), 31441050)
        with self.assertRaisesRegex(ValueError, "numeric WEM"):
            mod.media_id_from_source("bank/not-a-wem.bin")


if __name__ == "__main__":
    unittest.main()
