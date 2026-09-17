import json
import subprocess
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
RECEIPT = REPO / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/identity-probe.json"


class IdentityProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = json.loads(RECEIPT.read_text(encoding="utf-8"))

    def test_generated_receipt_is_current(self):
        completed = subprocess.run(
            ["python3", str(HERE / "identity_probe.py"), "--check"],
            cwd=REPO,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

    def test_all_priority_identities_are_unique_internal_names(self):
        expected = {
            "gintoki": "028",
            "nube": "041",
            "gon": "017",
            "killua": "018",
            "luckyman": "037",
            "hiei": "012",
        }
        observed = {row["slug"]: row["nativeId"] for row in self.value["priorityCharacters"]}
        self.assertEqual(observed, expected)
        rows = {row["nativeToken"]: row for row in self.value["rows"]}
        for token in expected.values():
            self.assertFalse(rows[token]["completeNativeDecode"])

    def test_partial_identity_does_not_claim_conversion(self):
        self.assertEqual(self.value["summary"]["nativeTokensProbed"], 56)
        self.assertEqual(self.value["summary"]["tokensWithInternalIdentity"], 56)
        self.assertEqual(self.value["summary"]["priorityIdentitiesConfirmed"], 6)
        self.assertFalse(self.value["method"]["completeNativeDecodeClaimed"])


if __name__ == "__main__":
    unittest.main()
