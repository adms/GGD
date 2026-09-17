import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_apply", HERE / "apply_decision.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PoppDecisionTest(unittest.TestCase):
    def test_committed_owner_decision_is_current_and_applied(self):
        decision = MODULE.read_json(MODULE.DECISION_PATH)
        contract = MODULE.read_json(MODULE.CONTRACT_PATH)
        champion = MODULE.read_json(MODULE.CHAMPION_PATH)
        receipt = MODULE.read_json(MODULE.RECEIPT_PATH)
        MODULE.assert_applied(decision, contract, champion, receipt)
        self.assertEqual(
            receipt["selectionAfter"]["sourceModelKey"],
            "community.body.a6b90f165d9f40e019b02cc8172717a06a5e1201feb5ab14",
        )
        self.assertTrue(receipt["deathPresentation"]["runtimeAlreadyImplemented"])
        self.assertEqual(len(receipt["remainingOpenIntegrationGapIds"]), 4)


if __name__ == "__main__":
    unittest.main()
