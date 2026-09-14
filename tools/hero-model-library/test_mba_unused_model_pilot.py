import hashlib,json,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

class MbaUnusedModelPilotTest(unittest.TestCase):
    def setUp(self):
        self.report=json.loads((ROOT/"materials/hero-model-library/priority-evidence/mba-unused-model-pilot-v1/report.json").read_text())

    def test_four_components_are_pinned_but_not_registered(self):
        self.assertEqual(self.report["schema"],"ggd-mba-unused-model-pilot@1")
        self.assertEqual(self.report["summary"]["componentsAccepted"],4)
        self.assertEqual(self.report["summary"]["componentsRejected"],1)
        downloads=json.loads((ROOT/"materials/hero-model-library/download-sources.json").read_text())
        source=next(row for row in downloads["publicSources"] if row["id"]==self.report["sourceId"])
        self.assertEqual(len(source["componentCandidates"]),4)
        for row in self.report["candidates"]:
            path=ROOT/row["gitPath"]
            self.assertEqual((path.stat().st_size,hashlib.sha256(path.read_bytes()).hexdigest()),(row["bytes"],row["sha256"]))
            self.assertLess(row["metrics"]["triangles"],10000)
            self.assertLessEqual(row["metrics"]["drawPrimitives"],3)
            self.assertLessEqual(row["metrics"]["maxTextureEdge"],256)
            self.assertLessEqual(row["metrics"]["maxChannelsPerClip"],300)
            self.assertEqual(row["metrics"]["nativeClips"],6)
            self.assertEqual(row["validation"]["khronosErrors"],0)
            self.assertTrue(row["validation"]["allFinite"])
            self.assertTrue(row["validation"]["deterministicRebuild"])
            self.assertFalse(row["runtimeSelectable"])
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertFalse(row["defaultEligible"])
            self.assertEqual(row["heroIds"],[])

    def test_rejection_is_not_a_component(self):
        rejected=self.report["rejected"]
        self.assertEqual([(row["sourceCharacterId"],row["status"]) for row in rejected],[("mba:Chara10","rejected-before-standardization")])
        component_ids={row["sourceCharacterId"] for row in self.report["candidates"]}
        self.assertNotIn("mba:Chara10",component_ids)

if __name__=="__main__": unittest.main()
