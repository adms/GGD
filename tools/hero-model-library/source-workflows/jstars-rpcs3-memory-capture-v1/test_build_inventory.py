import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_rpcs3_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

SETUP_PATH = Path(__file__).with_name("setup_rpcs3.py")
SETUP_SPEC = importlib.util.spec_from_file_location("jstars_setup_rpcs3", SETUP_PATH)
SETUP_MODULE = importlib.util.module_from_spec(SETUP_SPEC)
SETUP_SPEC.loader.exec_module(SETUP_MODULE)

PRESERVE_PATH = Path(__file__).with_name("preserve_boot_inputs.py")
PRESERVE_SPEC = importlib.util.spec_from_file_location("jstars_preserve_boot", PRESERVE_PATH)
PRESERVE_MODULE = importlib.util.module_from_spec(PRESERVE_SPEC)
PRESERVE_SPEC.loader.exec_module(PRESERVE_MODULE)

VERIFY_PATH = Path(__file__).with_name("verify_runtime.py")
VERIFY_SPEC = importlib.util.spec_from_file_location("jstars_verify_runtime", VERIFY_PATH)
VERIFY_MODULE = importlib.util.module_from_spec(VERIFY_SPEC)
VERIFY_SPEC.loader.exec_module(VERIFY_MODULE)


class InventoryTests(unittest.TestCase):
    def test_priority_contract_and_expected_hashes(self):
        self.assertEqual([row["nativeId"] for row in MODULE.CHARACTERS], ["017", "041", "037", "012"])
        self.assertEqual(MODULE.EXPECTED["rpcs3"]["bytes"], 40_231_415)
        self.assertEqual(MODULE.EXPECTED["firmware"]["bytes"], 268_435_456)
        self.assertTrue(all(len(row["sha256"]) == 64 for row in MODULE.EXPECTED.values()))

    def test_keka_7zz_is_a_pinned_local_candidate(self):
        self.assertIn(Path("/Applications/Keka.app/Contents/MacOS/keka7zz"), SETUP_MODULE.SEVEN_ZIP_CANDIDATES)

    def test_package_status_distinguishes_partial_and_hash_mismatch(self):
        self.assertEqual(MODULE.rpcs3_package_status({"existsLocal": False}), "missing")
        self.assertEqual(MODULE.rpcs3_package_status({"existsLocal": True, "downloadState": "incomplete-byte-count"}), "download-incomplete")
        self.assertEqual(MODULE.rpcs3_package_status({"existsLocal": True, "verified": False, "bytes": 40_231_415}), "hash-mismatch")
        self.assertEqual(MODULE.rpcs3_package_status({"existsLocal": True, "verified": True}), "verified")

    def test_boot_inputs_are_fixed_to_verified_disc_files(self):
        self.assertEqual([row[0] for row in PRESERVE_MODULE.FILES], [
            "PS3_GAME/USRDIR/EBOOT.BIN",
            "PS3_GAME/PARAM.SFO",
            "PS3_UPDATE/PS3UPDAT.PUP",
        ])
        self.assertTrue(all(len(row[2]) == 64 for row in PRESERVE_MODULE.FILES))

    def test_runtime_verifier_requires_exact_firmware_and_ipc_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            version = root / "dev_flash/vsh/etc/version.txt"
            version.parent.mkdir(parents=True)
            version.write_text("release:04.7000:\nbuild:test\n", encoding="utf-8")
            ipc = root / "ipc.yml"
            ipc.write_text(VERIFY_MODULE.EXPECTED_IPC, encoding="utf-8")
            result = VERIFY_MODULE.verify(root / "dev_flash", ipc)
            self.assertEqual(result["firmware"]["status"], "installed-verified")
            self.assertEqual(result["firmware"]["release"], "04.7000")
            self.assertEqual(result["pine"]["port"], 28012)


if __name__ == "__main__":
    unittest.main()
