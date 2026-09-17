import importlib.util
import os
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ptrainer_validate", HERE / "validate_preservation.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class StaticHelpersTest(unittest.TestCase):
    def test_identity_trs_elision_is_equivalent(self):
        maximum = MODULE.compare_nodes(
            [{"name": "x", "scale": [0.9999999, 1, 1], "rotation": [0, 0, 0.000001, 1]}],
            [{"name": "x"}], "fixture")
        self.assertLessEqual(maximum, 1e-5)

    def test_real_candidates_remain_current(self):
        repo = HERE.parents[3]
        asset_root = Path(os.environ.get("GGD_ASSET_ROOT", repo.parent / "GGD-Asset-Library"))
        asset = asset_root / "conversions/ssbu-ptrainer-formal-decimation-v1"
        if not asset.is_dir():
            self.skipTest("set GGD_ASSET_ROOT to run the real-candidate regression")
        result = MODULE.validate(repo, asset, False)
        self.assertEqual([7896, 7892], [row["metrics"]["triangles"] for row in result["candidates"]])


if __name__ == "__main__":
    unittest.main()
