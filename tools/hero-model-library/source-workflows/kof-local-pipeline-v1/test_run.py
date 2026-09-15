from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_local_pipeline", HERE / "run.py")
PIPELINE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PIPELINE)


class KofLocalPipelineTest(unittest.TestCase):
    def test_definition_is_offline_and_dependency_ordered(self) -> None:
        definition = json.loads((HERE / "pipeline.json").read_text(encoding="utf-8"))
        PIPELINE.validate_definition(definition)
        self.assertFalse(definition["scope"]["remoteLibraryReadAllowed"])
        self.assertFalse(definition["failClosed"]["runtimeClaimWithoutConverter"])

    def test_report_fragment_never_promotes_native_containers(self) -> None:
        fragment = PIPELINE.build_fragment()
        summary = fragment["summary"]
        self.assertEqual(summary["runtimeSelectableModels"], 0)
        self.assertEqual(summary["runtimeMotionBindings"], 0)
        self.assertEqual(summary["runtimeVfxBindings"], 0)
        self.assertEqual(summary["productionDeployments"], 0)
        self.assertTrue(any("OBAC" in blocker for blocker in fragment["blockers"]))

    def test_texture_validator_rejects_over_limit_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "x.png"
            output.write_bytes(b"candidate")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"files": [{
                "outputAbsolutePath": str(output),
                "outputBytes": output.stat().st_size,
                "outputSha256": PIPELINE.sha256(output),
                "width": 512,
                "height": 256,
            }]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exceeds 256"):
                PIPELINE.validate_texture_manifest(manifest, 1)

    def test_command_receipt_is_checkout_portable(self) -> None:
        workspace = Path("/tmp/workspace")
        repo = workspace / "GGD-branch"
        record = {"command": ["python3", str(repo / "tools/a.py"), "--workspace", str(workspace)]}
        portable = PIPELINE.portable_command_record(record, repo, workspace)
        self.assertEqual(portable["command"], ["python3", "$REPO/tools/a.py", "--workspace", "$WORKSPACE"])


if __name__ == "__main__":
    unittest.main()
