import copy
import json
import tempfile
import unittest
from pathlib import Path

from current_component_policy import current_policy_for


class CurrentComponentPolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        source = self.repo / "policy.json"
        source.write_text("current")
        model = self.repo / "content/example.glb"
        model.parent.mkdir(parents=True)
        model.write_bytes(b"model")
        import hashlib
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        self.candidate = dict(id="component", gitPath="content/example.glb", sha256=digest(model),
                              bytes=model.stat().st_size, resourceRole="weapon-prop")
        audit = self.repo / "materials/hero-model-library/priority-evidence/current-component-policy-audit.json"
        audit.parent.mkdir(parents=True)
        audit.write_text(json.dumps(dict(schema="ggd-current-component-policy-audit@1",
            generatedFrom=[dict(path="policy.json", bytes=source.stat().st_size, sha256=digest(source))],
            records=[dict(**self.candidate, runtimeBudget={"pass": True, "verdict": "ok", "blockingAxes": []},
                          formalHeroAdoption=dict(eligible=False, requiresDecimatedCandidate=False))])))

    def test_current_record_is_returned_as_pinned_evidence(self):
        result = current_policy_for(self.candidate, self.repo)
        self.assertTrue(result["runtimeBudgetPass"])
        self.assertEqual(result["recordId"], "component")
        self.assertEqual(len(result["sha256"]), 64)

    def test_source_drift_and_record_drift_are_rejected(self):
        (self.repo / "policy.json").write_text("changed")
        with self.assertRaisesRegex(ValueError, "Stale current component policy audit"):
            current_policy_for(self.candidate, self.repo)
        (self.repo / "policy.json").write_text("current")
        changed = copy.deepcopy(self.candidate)
        changed["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "record mismatch"):
            current_policy_for(changed, self.repo)


if __name__ == "__main__":
    unittest.main()
