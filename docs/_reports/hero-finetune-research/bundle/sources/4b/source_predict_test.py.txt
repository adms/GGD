"""CPU-only source request integrity test; no model import or GPU."""
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("source_predict", Path(__file__).with_name("source-predict.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
root = Path(__file__).resolve().parents[3] / "outputs/forge-mechanism-priority-r3-20260906"


class SourceInputs(unittest.TestCase):
    def test_real_js_requests_checklist_and_tampering(self):
        row = json.loads((root / "main-hero-diagnostic-v1/requests.json").read_text())[0]
        self.assertEqual(mod.requests_from({"resolution": {"status": "resolved"}, "request": row}), [row])
        bundle = json.loads((root / "fidelity-diagnostic-v2/bundle.private.json").read_text())
        plan = bundle["plans"][0]["plan"]
        self.assertEqual(mod.requests_from(plan), plan["requests"])
        with self.assertRaisesRegex(ValueError, "UNRESOLVED"):
            mod.requests_from({"resolution": {"status": "ambiguous"}, "request": None})
        with self.assertRaisesRegex(ValueError, "REQUEST_CHANGED"):
            mod.requests_from({**row, "requestDigest": "changed"})
        with self.assertRaisesRegex(ValueError, "REQUEST_ID"):
            mod.requests_from([row, row])
        plan["proposalSha256"] = "changed"
        with self.assertRaisesRegex(ValueError, "PLAN_CHANGED"):
            mod.requests_from(plan)


if __name__ == "__main__":
    unittest.main()
