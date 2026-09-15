#!/usr/bin/env python3

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("run_asset_pipeline", HERE / "run_asset_pipeline.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class AssetPipelineTest(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((HERE / "asset-pipeline-v1.json").read_text(encoding="utf-8"))

    def test_manifest_is_fail_closed_and_acyclic(self):
        MODULE.validate_manifest(self.manifest)
        self.assertFalse(self.manifest["scope"]["networkAccessAllowed"])
        self.assertFalse(self.manifest["scope"]["awsAccessAllowed"])
        self.assertFalse(self.manifest["scope"]["runtimeRegistrationAllowed"])
        self.assertEqual(
            set(self.manifest["scope"]["sources"]),
            {"jump-force", "kof", "fate", "smash", "community", "lol", "historical", "palworld", "core"},
        )

    def test_default_selection_skips_deep_source_hash(self):
        stages = MODULE.select_stages(self.manifest, set(self.manifest["scope"]["sources"]), False)
        self.assertNotIn("jump-deep-source-verify", {row["id"] for row in stages})
        self.assertIn("core-dropdown-audit", {row["id"] for row in stages})

    def test_deep_selection_is_explicit(self):
        stages = MODULE.select_stages(self.manifest, {"jump-force"}, True)
        self.assertIn("jump-deep-source-verify", {row["id"] for row in stages})

    def test_core_selection_includes_source_dependencies(self):
        stages = MODULE.select_stages(self.manifest, {"core"}, False)
        ids = {row["id"] for row in stages}
        self.assertIn("jump-report", ids)
        self.assertIn("kof-local", ids)
        self.assertIn("fate-report", ids)

    def test_rejects_shell_or_network_command(self):
        unsafe = json.loads(json.dumps(self.manifest))
        unsafe["stages"][0]["checkCommand"] = ["curl", "https://example.invalid"]
        with self.assertRaisesRegex(ValueError, "unsafe"):
            MODULE.validate_manifest(unsafe)

    def test_current_resource_check_verifies_git_bytes(self):
        stage = next(row for row in self.manifest["stages"] if row["id"] == "core-current-resources")
        self.assertIn("--check-git", stage["checkCommand"])

    def test_refresh_expands_asset_root_prefix(self):
        stage = next(row for row in self.manifest["stages"] if row["id"] == "smash-ultimate-evidence")
        command = MODULE.expand_command(stage["refreshCommand"], MODULE.REPO, MODULE.WORKSPACE, MODULE.ASSET_ROOT)
        self.assertEqual(
            command[-1],
            str(MODULE.ASSET_ROOT / "intake/ultimate16-nsandns2-audit-20260915-v1/reconciliation.json"),
        )

    def test_portable_receipt_removes_absolute_roots(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            repo = base / "repo"
            workspace = base
            assets = base / "GGD-Asset-Library"
            receipt = {"path": str(repo / "content/a.json"), "asset": str(assets / "x.glb")}
            portable = MODULE.portable_receipt(receipt, repo, workspace, assets)
            self.assertEqual(portable["path"], "$REPO/content/a.json")
            self.assertEqual(portable["asset"], "$ASSET_ROOT/x.glb")

    def test_resume_receipt_returns_only_passed_stages(self):
        with tempfile.TemporaryDirectory() as folder:
            receipt = Path(folder) / "run.json"
            receipt.write_text(json.dumps({
                "schema": "ggd.asset-library-pipeline-run@1",
                "pipelineId": self.manifest["pipelineId"],
                "mode": "refresh",
                "previouslyPassedStages": ["community-300-mba"],
                "results": [
                    {"id": "jump-plan", "exitCode": 0},
                    {"id": "kof-local", "exitCode": 1},
                ],
            }))
            self.assertEqual(
                MODULE.passed_stage_ids(receipt, self.manifest["pipelineId"], "refresh"),
                {"community-300-mba", "jump-plan"},
            )


if __name__ == "__main__":
    unittest.main()
