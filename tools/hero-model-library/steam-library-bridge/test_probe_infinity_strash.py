import tempfile
import unittest
import zipfile
from pathlib import Path

from build_infinity_strash_probe_bundle import MEMBERS, main as build_bundle


ROOT = Path(__file__).resolve().parent


class InfinityStrashProbeTest(unittest.TestCase):
    def test_probe_is_read_only_and_keeps_stage_claims_honest(self):
        text = (ROOT / "probe_infinity_strash.ps1").read_text()
        self.assertIn("F:\\SteamLibrary\\steamapps\\common\\Strash", text)
        self.assertIn("Get-FileHash", text)
        self.assertIn("'-list'", text)
        self.assertIn("'*.uasset'", text)
        self.assertNotIn("-export", text.lower())
        for mutator in ("Copy-Item", "Move-Item", "Remove-Item", "Set-SmbShare", "Grant-SmbShareAccess"):
            self.assertNotIn(mutator, text)
        for state in ("assets-extracted", "identity-verified", "converted", "accepted", "registered", "switchable", "deployed"):
            self.assertIn(state, text)
        self.assertIn("Vearn is distinct from Baran", text)

    def test_bundle_contains_only_the_three_user_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "probe.zip"
            import sys
            previous = sys.argv
            try:
                sys.argv = ["build", str(output)]
                self.assertEqual(build_bundle(), 0)
            finally:
                sys.argv = previous
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(tuple(archive.namelist()), MEMBERS)


if __name__ == "__main__":
    unittest.main()
