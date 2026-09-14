import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("integrate.py")
SPEC = importlib.util.spec_from_file_location("vearn_post_form_integrate", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class VearnPostFormIntegrateTest(unittest.TestCase):
    def test_required_identity_boundaries(self):
        self.assertEqual(MODULE.REQUIRED_IDENTITIES["EN801"][0], "Vearn")
        self.assertEqual(MODULE.REQUIRED_IDENTITIES["EN653"][0], "MystVearn")
        self.assertEqual(MODULE.REQUIRED_IDENTITIES["EN680"][0], "Baran")
        self.assertIn("Baran", MODULE.REQUIRED_IDENTITIES["EN681"][0])
        self.assertNotEqual(MODULE.REQUIRED_IDENTITIES["EN801"], MODULE.REQUIRED_IDENTITIES["EN653"])


if __name__ == "__main__":
    unittest.main()
