import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "materials/hero-model-library/design-backlog/sources-community.json"
BACKLOG = ROOT / "materials/hero-model-library/已取得模型待設計英雄.json"


def role_counts(candidates):
    bodies = {"character-body-costume", "character-body-mesh-source"}
    components = {"model-component-or-prop", "independent-static-skinned-model-component"}
    return (
        sum(row.get("resourceRole") in bodies for row in candidates),
        sum(row.get("resourceRole") in components for row in candidates),
        sum(row.get("resourceRole") == "shared-source-container" for row in candidates),
    )


class ModelDesignCandidateRoleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = {row["id"]: row for row in json.loads(SOURCE.read_text())["characters"]}
        cls.backlog = {row["id"]: row for row in json.loads(BACKLOG.read_text())["characters"]}

    def test_priority_gap_sources_do_not_count_props_as_bodies(self):
        expected = {
            "zero-megaman": (1, 1, 0),
            "ram": (1, 0, 1),
            "beatrice": (1, 0, 1),
            "ssbu-mario": (16, 9, 0),
            "ssbu-mewtwo": (8, 1, 0),
            "ssbu-ptrainer": (8, 1, 0),
            "ssbu-ryu": (8, 1, 0),
            "ssbu-pickel": (8, 23, 0),
        }
        for identity, counts in expected.items():
            with self.subTest(identity=identity):
                self.assertEqual(role_counts(self.source[identity]["modelCandidates"]), counts)
                summary = self.backlog[identity]["candidateBreakdown"]
                self.assertEqual(summary["characterBodySources"], counts[0])
                self.assertEqual(summary["componentsOrProps"], counts[1])
                self.assertEqual(summary["sharedContainers"], counts[2])

    def test_ssbu_body_sources_have_mesh_and_rig_but_no_embedded_actions(self):
        for identity in ["zero-megaman", "ssbu-mario", "ssbu-mewtwo", "ssbu-ptrainer", "ssbu-ryu", "ssbu-pickel"]:
            bodies = [row for row in self.source[identity]["modelCandidates"] if row.get("resourceRole") == "character-body-costume"]
            self.assertTrue(bodies, identity)
            for candidate in bodies:
                proof = candidate["modelProof"]
                self.assertGreater(proof["meshDatablocks"], 0, candidate["path"])
                self.assertGreater(proof["armatureDatablocks"], 0, candidate["path"])
                self.assertEqual(proof["actionDatablocks"], 0, candidate["path"])

    def test_zero_validated_component_survives_source_regeneration(self):
        candidate = next(row for row in self.source["zero-megaman"]["modelCandidates"] if row["id"] == "ssbu-zero-c00-static-skinned-v1")
        self.assertEqual(candidate["sha256"], "3804d9bf6fb53514ec7ed8d6684d5e515ac12e24aca980d6daaf5d125d44edf1")
        self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
        self.assertFalse(candidate["runtimeSelectable"])
        self.assertEqual(candidate["modelProof"]["animationEntries"], 0)


if __name__ == "__main__":
    unittest.main()
