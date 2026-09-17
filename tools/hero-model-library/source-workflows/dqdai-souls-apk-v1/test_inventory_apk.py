import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("inventory_apk.py")
SPEC = importlib.util.spec_from_file_location("dqdai_souls_apk_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ApkInventoryTest(unittest.TestCase):
    def build_apk(self, root: Path) -> Path:
        apk = root / "dqdai-souls-jp.apk"
        with zipfile.ZipFile(apk, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("assets/bin/Data/globalgamemanagers", b"unity")
            archive.writestr("assets/bin/Data/Managed/Metadata/global-metadata.dat", "老バーン".encode())
            archive.writestr("assets/bin/Data/StreamingAssets/aa/catalog.json", json.dumps({"name": "young_vearn"}))
            archive.writestr("assets/bin/Data/StreamingAssets/chara/kigan.bundle", b"UnityFS\x00" + "鬼眼王バーン".encode())
            archive.writestr("assets/bin/Data/StreamingAssets/audio/mystvearn.awb", b"AFS2")
            archive.writestr("assets/bin/Data/StreamingAssets/chara/baran.bundle", b"UnityFS\x00baran")
            archive.writestr("lib/arm64-v8a/libunity.so", b"ELF")
            archive.writestr("lib/arm64-v8a/libil2cpp.so", b"ELF")
        return apk

    def test_inventory_detects_unity_candidates_and_keeps_baran_excluded(self):
        with tempfile.TemporaryDirectory() as temporary:
            apk = self.build_apk(Path(temporary))
            payload = MODULE.inventory(apk)
        self.assertTrue(payload["safety"]["readOnly"])
        self.assertTrue(payload["unityDetection"]["isUnityCandidate"])
        self.assertGreaterEqual(payload["summary"]["bundleCandidateCount"], 2)
        self.assertEqual(payload["summary"]["addressableCandidateCount"], 1)
        self.assertEqual(payload["summary"]["audioContainerCandidateCount"], 1)
        forms = {form for row in payload["identitySearch"]["matches"] for form in row["targetForms"]}
        self.assertEqual(forms, {"old-vearn", "young-vearn", "kigan-king-vearn", "mystvearn"})
        excluded_paths = {row["path"] for row in payload["identitySearch"]["baranExclusions"]}
        self.assertIn("assets/bin/Data/StreamingAssets/chara/baran.bundle", excluded_paths)
        target_paths = {row["path"] for row in payload["identitySearch"]["matches"]}
        self.assertNotIn("assets/bin/Data/StreamingAssets/chara/baran.bundle", target_paths)
        self.assertFalse(payload["readiness"]["unityObjectsParsed"])
        self.assertFalse(payload["readiness"]["registered"])

    def test_latin_aliases_require_boundaries(self):
        self.assertEqual(MODULE.aliases_in_text("baroness", MODULE.EXCLUDED_ALIASES), {})
        self.assertEqual(MODULE.aliases_in_text("notvearnish", MODULE.TARGET_ALIASES), {})
        self.assertIn("vearn", MODULE.aliases_in_text("Vearn", MODULE.TARGET_ALIASES))
        self.assertIn("vearn", MODULE.aliases_in_text("vearn", MODULE.TARGET_ALIASES))
        self.assertIn("young-vearn", MODULE.aliases_in_text("年輕巴恩", MODULE.TARGET_ALIASES))
        self.assertNotIn("vearn", MODULE.aliases_in_text("年輕巴恩", MODULE.TARGET_ALIASES))
        self.assertIn("baran", MODULE.aliases_in_text("巴蘭", MODULE.EXCLUDED_ALIASES))

    def test_expected_sha_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            apk = self.build_apk(Path(temporary))
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                MODULE.inventory(apk, expected_sha256="0" * 64)


if __name__ == "__main__":
    unittest.main()
