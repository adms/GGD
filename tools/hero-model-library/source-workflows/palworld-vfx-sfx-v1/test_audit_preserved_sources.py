import unittest

import audit_preserved_sources


class PalworldPreservedSourceAuditTest(unittest.TestCase):
    def test_every_preserved_candidate_is_hashed_but_no_binding_is_invented(self):
        audit = audit_preserved_sources.build()
        summary = audit["summary"]
        self.assertEqual(summary["characters"], 3)
        self.assertEqual(summary["modelCandidateFilesVerified"], 23)
        self.assertEqual(summary["genericCryCandidatesVerified"], 18)
        self.assertEqual(summary["currentReviewComponentsPolicyVerified"], 3)
        self.assertEqual(summary["currentReviewComponentsPolicyClean"], 2)
        self.assertEqual(summary["currentReviewComponentsPolicyWarningOnly"], 1)
        self.assertEqual(summary["currentReviewComponentsPolicyHardBlocked"], 0)
        self.assertEqual(summary["sourceSkillMotionCandidates"], 70)
        self.assertGreater(summary["sourceAssetFilesHashed"], 0)
        self.assertGreater(summary["glbLikeContainersParsed"], 0)
        self.assertEqual(summary["originalGamePakOrIoStoreContainers"], 0)
        self.assertEqual(summary["wwiseBanks"], 0)
        self.assertEqual(summary["wwiseMedia"], 0)
        self.assertEqual(summary["standaloneVfxCandidates"], 0)
        self.assertEqual(summary["skillSpecificSfxCandidates"], 0)
        self.assertEqual(summary["runtimeBindingsAdded"], 0)
        self.assertTrue(all(row["file"]["sha256Verified"] for row in audit["modelContainers"]))
        self.assertTrue(all(not row["runtimeBinding"] for row in audit["audioCandidates"]))
        self.assertTrue(all(not row["runtimeBinding"] for row in audit["skillMotionCandidates"]))


if __name__ == "__main__":
    unittest.main()
