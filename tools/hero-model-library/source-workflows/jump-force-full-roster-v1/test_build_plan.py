import gzip
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build_plan = load("build_plan")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class BuildPlanTest(unittest.TestCase):
    def test_numeric_namespace_is_limited_to_character_vfx_and_skill_config(self):
        common = build_plan.character_matches
        self.assertTrue(common("JUMP_FORCE/Content/Effects/equipment/0430/P.uasset", "chr0430", "vfx-package"))
        self.assertTrue(common("JUMP_FORCE/Content/Game/skill_0430_00_anim.uasset", "chr0430", "skill-config-package"))
        self.assertFalse(common("JUMP_FORCE/Content/Map/Map0430/P.uasset", "chr0430", "other"))
        self.assertFalse(common("JUMP_FORCE/Content/Sound/Character/chr0030/CV_0430.uasset", "chr0430", "audio-package"))

    def test_builds_exactly_63_batched_high_confidence_rows(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            index = root / "index.jsonl.gz"
            rows = []
            templates = [
                ("Character/{token}/{token}_body.uasset", "character-package"),
                ("Character/{token}/Textures/T_{token}_body.uasset", "character-package"),
                ("Character/{token}/{token}_Skeleton.uasset", "character-package"),
                ("Game/{token}_anim.uasset", "character-config-package"),
                ("Effects/{token}/P_{token}.uasset", "vfx-package"),
                ("Sound/Character/{token}/ActVoice/line.uasset", "audio-package"),
            ]
            for number in range(63):
                token = f"chr{number:04d}"
                for template, kind in templates:
                    path = template.format(token=token)
                    for suffix in (".uasset", ".uexp"):
                        member = path if suffix == ".uasset" else path[:-7] + suffix
                        rows.append({
                            "path": member,
                            "container": "pak0.pak",
                            "containerOrder": 0,
                            "containerSha256": "a" * 64,
                            "sourceKind": kind,
                            "nativeCharacterIds": [],
                            "selectedByPatchOrder": True,
                            "overriddenBy": [],
                        })
            with gzip.open(index, "wt", encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row) + "\n")
            authority = root / "authority.json"
            authority.write_text(json.dumps({
                "sourceId": build_plan.SOURCE_ID,
                "containers": [{"name": f"pak{order}.pak", "order": order, "bytes": order + 1, "sha256": f"{order}" * 64} for order in range(6)],
            }))
            identity = root / "identity.json"
            identity.write_text(json.dumps({
                "sourceId": build_plan.SOURCE_ID,
                "inputs": {
                    "pakPathIndex": {"sha256": digest(index)},
                    "pakAuthority": {"sha256": digest(authority)},
                },
                "tokens": [{
                    "nativeCharacterIdToken": f"chr{number:04d}",
                    "characterName": f"Character {number}",
                    "identityState": "fixture-exact",
                    "identityConfidence": "high",
                    "identityScope": "character-family",
                    "heroIds": [],
                } for number in range(63)],
            }))
            plan, details = build_plan.build(identity, authority, index, 7, mirror_evidence_path=root / "absent-evidence.json")
            self.assertEqual(plan["summary"]["characters"], 63)
            self.assertEqual(plan["scope"]["batchCount"], 9)
            self.assertEqual(plan["characters"][-1]["batch"], 9)
            self.assertEqual(plan["summary"]["assetClasses"]["model"]["charactersWithCandidates"], 63)
            self.assertEqual(plan["summary"]["assetClasses"]["motion"]["charactersWithCandidates"], 63)
            self.assertGreater(len(details), 63)
            self.assertEqual(plan["summary"]["paksMirroredThisRun"], 0)
            self.assertEqual(plan["summary"]["payloadFilesExtractedThisRun"], 0)
            self.assertEqual(plan["states"]["mirror"], "not-created-by-this-plan")
            self.assertFalse(plan["states"]["runtimeSelectable"])

    def test_repository_plan_records_verified_local_mirror_only(self):
        plan = json.loads((HERE.parents[3] / "materials/hero-model-library/source-inventories/jump-force-full-roster-v1/plan.json").read_text())
        self.assertEqual(plan["summary"]["paksMirroredThisRun"], 6)
        self.assertEqual(plan["states"]["mirror"], "verified-local-6-of-6-authority-paks")
        self.assertEqual(plan["localMirrorTarget"]["fileCount"], 3466)
        self.assertEqual(plan["localMirrorTarget"]["bytes"], 23856777652)
        self.assertFalse(plan["localMirrorTarget"]["lv99ShareRequired"])
        self.assertEqual(plan["summary"]["payloadFilesExtractedThisRun"], 0)
        self.assertEqual(plan["summary"]["backendOptionsAdded"], 0)
        self.assertEqual(plan["summary"]["productionDeployments"], 0)

    def test_repository_plan_tracks_batch_one_key_injection_blocker_without_claiming_extraction(self):
        readiness = build_plan.load_readiness(HERE.parents[3] / build_plan.READINESS_GIT_PATH)
        self.assertIsNotNone(readiness)
        self.assertEqual(readiness["authorization"]["keyState"], "not-supplied")
        self.assertEqual(readiness["stages"]["extraction"], "blocked-awaiting-owner-or-runtime-key-injection")
        self.assertEqual(readiness["source"]["plannedMemberRelations"], 14031)


if __name__ == "__main__":
    unittest.main()
