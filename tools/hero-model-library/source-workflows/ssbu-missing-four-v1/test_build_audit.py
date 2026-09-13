import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ssbu_missing_four", HERE / "build_audit.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class AuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = MODULE.build()

    def test_models_are_real_and_hard_policy_passes(self):
        self.assertEqual(6, self.audit["summary"]["acceptedModelComponents"])
        self.assertTrue(all(row["runtimeBudget"]["pass"] for row in self.audit["candidates"]))
        self.assertTrue(all(len(row["gitModel"]["sha256"]) == 64 for row in self.audit["candidates"]))

    def test_motion_claims_are_scoped(self):
        mario = next(row for row in self.audit["candidates"] if row["heroId"] == "acquired-mario")
        self.assertEqual(5, len(mario["nativeClipNames"]))
        self.assertEqual(MODULE.REQUIRED_STATES, mario["missingRequiredStates"])
        others = [row for row in self.audit["candidates"] if row["heroId"] != "acquired-mario"]
        self.assertTrue(all(row["nativeClipNames"] == [] for row in others))

    def test_no_unapproved_runtime_registration(self):
        self.assertEqual(0, self.audit["summary"]["sixStateCompleteVariants"])
        self.assertEqual(0, self.audit["summary"]["newRuntimeDropdownOptions"])
        self.assertTrue(all(not row["modelOptionRegistered"] for row in self.audit["candidates"]))
        self.assertTrue(all(not row["automaticBindingAllowed"] for row in self.audit["deathSubstitutionReview"]))

    def test_manual_defaults_are_preserved(self):
        self.assertEqual(MODULE.CURRENT_DEFAULTS, self.audit["currentManualDefaults"])

    def test_trainer_formal_decimation_gap_is_explicit(self):
        trainer = [row for row in self.audit["candidates"] if row["fighterId"] == "ptrainer"]
        self.assertEqual(2, len(trainer))
        self.assertTrue(all(row["formalHeroAdoption"]["requiresDecimatedCandidate"] for row in trainer))


if __name__ == "__main__":
    unittest.main()
