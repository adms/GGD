import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_workflow', ROOT / 'tools/editor-acceptance/hero-distillation-action-workflow.py')
workflow = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(workflow)


class ActionWorkflowTest(unittest.TestCase):
    def test_runs_exact_fixed_sequence_without_retries(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = {name: root / name for name in ['training', 'dataset', 'models', 'dependencies', 'api']}
            for path in paths.values(): path.mkdir()
            asset = root / 'asset'; asset.mkdir()
            evaluation, e2e = root / 'evaluation', root / 'e2e'
            calls = []
            def fake(argv, log):
                calls.append((argv, log.name))
            result = workflow.run({
                'training': paths['training'], 'dataset': paths['dataset'], 'evaluation': evaluation,
                'models': paths['models'], 'dependencies': paths['dependencies'],
                'api_dependencies': paths['api'], 'asset_roots': [asset], 'source_repo': ROOT,
                'e2e_out': e2e,
            }, execute=fake)
            self.assertEqual(['prepare', 'base', 'lora', 'compile-package-import-readback', 'render-evidence-report'],
                             [log.removesuffix('.log') for _, log in calls])
            self.assertTrue(calls[0][0][1].endswith('hero-distillation-action-evaluate.py'))
            self.assertEqual('prepare', calls[0][0][2])
            self.assertEqual(['base', 'lora'], [calls[1][0][-1], calls[2][0][-1]])
            self.assertTrue(calls[3][0][1].endswith('hero-distillation-action-e2e.py'))
            self.assertTrue(calls[4][0][1].endswith('hero-distillation-action-report.py'))
            expected_report = str(root.resolve() / 'e2e-report.html')
            self.assertEqual(result['reportPath'], expected_report)
            self.assertEqual(calls[4][0][-1], expected_report)
            receipt = Path(result['workflowDirectory']) / 'state.json'
            self.assertEqual('completed', json.loads(receipt.read_text())['status'])
            self.assertFalse(json.loads((receipt.parent / 'manifest.json').read_text())['automaticRetry'])

    def test_failing_step_writes_terminal_failure_and_does_not_continue(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = {name: root / name for name in ['training', 'dataset', 'models', 'dependencies', 'api']}
            for path in paths.values(): path.mkdir()
            asset = root / 'asset'; asset.mkdir()
            calls = []
            def fail(argv, log):
                calls.append(argv); raise RuntimeError('synthetic failure')
            with self.assertRaisesRegex(RuntimeError, 'synthetic failure'):
                workflow.run({'training': paths['training'], 'dataset': paths['dataset'], 'evaluation': root / 'evaluation',
                              'models': paths['models'], 'dependencies': paths['dependencies'],
                              'api_dependencies': paths['api'], 'asset_roots': [asset], 'source_repo': ROOT,
                              'e2e_out': root / 'e2e'}, execute=fail)
            self.assertEqual(1, len(calls))
            receipt = root / 'e2e-workflow' / 'state.json'
            self.assertEqual('stopped-or-failed', json.loads(receipt.read_text())['status'])


if __name__ == '__main__':
    unittest.main()
