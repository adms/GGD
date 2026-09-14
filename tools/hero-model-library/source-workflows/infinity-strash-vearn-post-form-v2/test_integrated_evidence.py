import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2/report.json"
SOURCES = ROOT / "materials/hero-model-library/download-sources.json"


class VearnPostFormIntegratedEvidenceTest(unittest.TestCase):
    def test_evidence_keeps_identities_separate(self):
        report = json.loads(EVIDENCE.read_text(encoding="utf-8"))
        self.assertFalse(report["result"]["postTransformationYoungTrueBodyLocated"])
        self.assertEqual(report["result"]["convertedPostTransformationModelCount"], 0)
        self.assertEqual(report["result"]["postTransformationRuntimeOptionCount"], 0)
        self.assertEqual(report["identities"]["EN801"]["originalName"], "Vearn")
        self.assertEqual(report["identities"]["EN653"]["originalName"], "MystVearn")
        self.assertEqual(report["identities"]["EN680"]["originalName"], "Baran")
        self.assertIn("Baran", report["identities"]["EN681"]["originalName"])

    def test_canonical_source_has_no_model_candidate(self):
        sources = json.loads(SOURCES.read_text(encoding="utf-8"))["publicSources"]
        rows = [row for row in sources if row.get("id") == "infinity-strash-vearn-post-form-local-audit-v2"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["acquiredAssetPayloadCount"], 0)
        self.assertEqual(row["modelCandidates"], [])
        self.assertFalse(row["backendIntegration"]["selectable"])
        self.assertFalse(row["backendIntegration"]["productionDeployed"])
        self.assertTrue(row["backup"]["fullReadbackVerified"])
        self.assertTrue(row["backup"]["allMemberSha256Verified"])
        self.assertEqual(row["backup"]["sha256"], "4ce21f4f4598f00edd1a6e360dec9a485a06f967a8e8826c971ff406eb3469c5")


if __name__ == "__main__":
    unittest.main()
