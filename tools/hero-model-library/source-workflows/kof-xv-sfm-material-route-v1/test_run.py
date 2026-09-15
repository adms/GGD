from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_xv_sfm_material_route", HERE / "run.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class KofXvSfmMaterialRouteTest(unittest.TestCase):
    def test_material_path_rejects_parent_escape(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsafe VMT material reference"):
            MODULE.material_path(Path("/tmp/source"), "../escape")

    def test_static_contract_does_not_promote_unconverted_source(self) -> None:
        self.assertEqual(MODULE.MODEL_PARTS, ("kof_xv_mai_body", "kof_xv_mai_head"))
        self.assertEqual(MODULE.SOURCE_RELATIVE.name, "mai-xv-sfm")
        self.assertEqual(MODULE.OUTPUT_RELATIVE.name, "receipt.json")


if __name__ == "__main__":
    unittest.main()
