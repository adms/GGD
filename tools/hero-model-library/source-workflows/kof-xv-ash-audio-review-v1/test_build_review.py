#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_xv_ash_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class KofXvAshReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_receipt_manifest_becomes_exactly_86_sha_pinned_pending_clips(self):
        rows = self.contract["audioCandidates"]
        summary = self.contract["summary"]
        self.assertEqual(len(rows), 86)
        self.assertEqual(summary["candidateCount"], 86)
        self.assertEqual(summary["pendingListeningDecisionCount"], 86)
        self.assertEqual(summary["pendingLanguageConfirmationCount"], 86)
        self.assertEqual(summary["pendingSpeakerConfirmationCount"], 86)
        self.assertEqual(summary["pendingEventConfirmationCount"], 86)
        self.assertEqual(len({row["candidateId"] for row in rows}), 86)
        self.assertTrue(all(row["classification"] == {
            "category": "unclassified-audio",
            "language": "pending-confirmation",
            "speaker": "pending-confirmation",
            "event": "pending-confirmation",
        } for row in rows))
        self.assertTrue(all(Path(row["reviewMp3"]["absolutePath"]).is_absolute() for row in rows))
        self.assertTrue(all(Path(row["sourceWav"]["absolutePath"]).is_absolute() for row in rows))
        self.assertTrue(all(len(row["reviewMp3"]["sha256"]) == 64 for row in rows))
        self.assertTrue(all(len(row["sourceWav"]["sha256"]) == 64 for row in rows))

    def test_portal_has_no_runtime_or_automatic_classification_authority(self):
        rows = self.contract["audioCandidates"]
        self.assertIs(self.contract["policy"]["runtimeMutationAllowed"], False)
        self.assertIs(self.contract["policy"]["runtimeBindingAuthorized"], False)
        self.assertEqual(self.contract["policy"]["backendSelectableAssets"], 0)
        self.assertEqual(self.contract["policy"]["productionDeployments"], 0)
        self.assertTrue(all(row["runtimeBindingAuthorized"] is False for row in rows))
        self.assertTrue(all(row["runtimeSelectable"] is False for row in rows))
        self.assertTrue(all(row["productionDeployed"] is False for row in rows))
        self.assertTrue(all(row["listeningDecision"] == "pending" for row in rows))

    def test_export_schema_is_fingerprint_pinned_and_cannot_authorize_runtime(self):
        schema = MODULE.decision_schema(self.contract)
        properties = schema["properties"]
        self.assertEqual(properties["sourceFingerprint"]["const"], self.contract["sourceFingerprint"])
        self.assertIs(properties["runtimeMutationAllowed"]["const"], False)
        decisions = properties["decisions"]
        self.assertEqual(decisions["minItems"], 86)
        self.assertEqual(decisions["maxItems"], 86)
        self.assertIs(decisions["items"]["properties"]["runtimeBindingAuthorized"]["const"], False)
        self.assertEqual(
            decisions["items"]["properties"]["listeningDecision"]["enum"],
            ["pending", "auditioned-needs-classification", "exclude-from-voice-candidates"],
        )

    def test_products_are_json_and_html_serializable(self):
        generated = MODULE.products()
        contract = json.loads(generated[MODULE.OUTPUT_JSON])
        self.assertEqual(contract["sourceFingerprint"], self.contract["sourceFingerprint"])
        self.assertIn("pending-confirmation", generated[MODULE.OUTPUT_HTML])
        self.assertIn("runtimeBindingAuthorized:false", generated[MODULE.OUTPUT_HTML])

    def test_existing_allowlist_server_accepts_only_the_86_review_mp3s(self):
        server_path = HERE.parent / "asset-review-portal-v1" / "serve_review.py"
        spec = importlib.util.spec_from_file_location("asset_review_server", server_path)
        server = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(server)
        allowlist = server.media_map(MODULE.OUTPUT_JSON)
        self.assertEqual(len(allowlist), 86)
        self.assertTrue(all(key.startswith("kof-xv-ash:") for key in allowlist))
        self.assertTrue(all(path.suffix == ".mp3" for path, _ in allowlist.values()))


if __name__ == "__main__":
    unittest.main()
