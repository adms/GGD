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
            "ram": (1, 1, 1),
            "beatrice": (1, 1, 1),
            "subaru": (1, 1, 1),
            "rem": (1, 1, 1),
            "emilia": (1, 1, 1),
            "felix": (1, 1, 1),
            "ssbu-mario": (16, 10, 0),
            "ssbu-mewtwo": (8, 2, 0),
            "ssbu-ptrainer": (8, 3, 0),
            "ssbu-ryu": (8, 2, 0),
            "ssbu-pickel": (8, 25, 0),
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

    def test_mario_validated_component_survives_source_regeneration(self):
        candidate = next(row for row in self.source["ssbu-mario"]["modelCandidates"] if row["id"] == "ssbu-mario-c00-static-skinned-v1")
        self.assertEqual(candidate["sha256"], "bf35a1a5f517a37424b7b186978c78e8ab5717d68b7dbb23035e2d641e2248a6")
        self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
        self.assertFalse(candidate["runtimeSelectable"])
        self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_mewtwo_validated_component_survives_source_regeneration(self):
        candidate = next(row for row in self.source["ssbu-mewtwo"]["modelCandidates"] if row["id"] == "ssbu-mewtwo-c00-static-skinned-v1")
        self.assertEqual(candidate["sha256"], "ce4caf1e9dbe7461d625a62a31362f34f62cc5222896ed9fecdfa3387e33bea9")
        self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
        self.assertFalse(candidate["runtimeSelectable"])
        self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_ryu_validated_component_survives_source_regeneration(self):
        candidate = next(row for row in self.source["ssbu-ryu"]["modelCandidates"] if row["id"] == "ssbu-ryu-c00-static-skinned-v1")
        self.assertEqual(candidate["sha256"], "cb216ec537d9ea1a5c5d01c3a8afe88de547c57b76282254c1b6da0e15193c5c")
        self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
        self.assertFalse(candidate["runtimeSelectable"])
        self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_pickel_validated_components_survive_source_regeneration(self):
        expected = {
            "ssbu-pickel-steve-c00-static-skinned-v1": "087602550e80ef44c20d874a8b804df6f898b43fa93615c5cbfe95523d131a75",
            "ssbu-pickel-alex-c01-static-skinned-v1": "681ff2f2f551afe5b144b2b5077e0de4af4f81057bf531cb7ca69b30fc5a1177",
        }
        candidates = {row["id"]: row for row in self.source["ssbu-pickel"]["modelCandidates"]}
        for component_id, digest in expected.items():
            with self.subTest(component_id=component_id):
                candidate = candidates[component_id]
                self.assertEqual(candidate["sha256"], digest)
                self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
                self.assertFalse(candidate["runtimeSelectable"])
                self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_ptrainer_validated_components_survive_source_regeneration(self):
        expected = {
            "ssbu-ptrainer-male-c00-static-skinned-v1": "f9ae10168ce75cb6e9b6d4d8c8157cfa77e5da11b1b8531c799f61b1f3fe9f8b",
            "ssbu-ptrainer-female-c01-static-skinned-v1": "a40f2f987a31f4220f5b6686bd92f8fbf547f39a96ccc46be76ba42abc2e2cec",
        }
        candidates = {row["id"]: row for row in self.source["ssbu-ptrainer"]["modelCandidates"]}
        for component_id, digest in expected.items():
            with self.subTest(component_id=component_id):
                candidate = candidates[component_id]
                self.assertEqual(candidate["sha256"], digest)
                self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
                self.assertFalse(candidate["runtimeSelectable"])
                self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_rezero_validated_components_survive_source_regeneration(self):
        expected = {
            "ram": (
                "rezero-ram-thunderstore-0.1.1-static-skinned-v1",
                "333c43b9a8a1cbaa8871072df7eec1a41307fcb1aa27af5aab63203e81221e3b",
            ),
            "beatrice": (
                "rezero-beatrice-thunderstore-0.1.1-static-skinned-v1",
                "4ddaa0fcc4362b8caef122aebeddd349404306693bfe5ae4222cced08830e34c",
            ),
            "subaru": (
                "rezero-subaru-thunderstore-0.1.1-static-skinned-v1",
                "782b715815b20e10aa0ea34c463d59abb9eed86990d78b5dda2e241f8edc69af",
            ),
            "rem": (
                "rezero-rem-thunderstore-0.1.1-static-skinned-v1",
                "5bc147726f99061f492fe5dc34700a033a46c7ac4941a3255e7ab927e6766e93",
            ),
            "emilia": (
                "rezero-emilia-thunderstore-0.1.1-static-skinned-v1",
                "6a848b70006cefac04ec791295aca9d89fda64028c074597f2b0925d3276d6a9",
            ),
            "felix": (
                "rezero-felix-thunderstore-0.1.1-static-skinned-v1",
                "35e41dd3684240a99fab59e28bb6864a8c1ed8d2b071c9fc7d38bb927c4a7cc1",
            ),
        }
        for identity, (component_id, digest) in expected.items():
            with self.subTest(identity=identity):
                candidates = {row["id"]: row for row in self.source[identity]["modelCandidates"]}
                candidate = candidates[component_id]
                self.assertEqual(candidate["sha256"], digest)
                self.assertEqual(candidate["readiness"], "accepted-independent-static-skinned-component-actions-missing")
                self.assertFalse(candidate["runtimeSelectable"])
                self.assertEqual(candidate["nativeAnimationCount"], 0)

    def test_palworld_converted_paths_are_grouped_under_integrated_rows(self):
        source_document = json.loads(SOURCE.read_text())
        affected = {"opgg-palworld-astralym-2026081102", "palworld-cattiva-opgg", "opgg-palworld-jetragon"}
        self.assertFalse([issue for issue in source_document["issues"] if issue.get("sourceId") in affected])
        expected = {
            "community:palworld-astralym": 6,
            "community:palworld-cattiva": 8,
            "community:palworld-jetragon": 8,
        }
        for identity, count in expected.items():
            with self.subTest(identity=identity):
                self.assertEqual(len(self.backlog[identity]["modelCandidates"]), count)
        superseded = {
            "opgg-palworld-astralym-2026081102:枯星龍 / Astralym",
            "palworld-cattiva-opgg:Cattiva",
            "opgg-palworld-jetragon:空渦龍 / Jetragon",
            "mediafire-shinypenguin-palworld-jetragon:空渦龍 / Jetragon",
        }
        self.assertTrue(superseded.isdisjoint(self.backlog))


if __name__ == "__main__":
    unittest.main()
