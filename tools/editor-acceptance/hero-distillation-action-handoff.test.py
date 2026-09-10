import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_handoff', ROOT / 'tools/editor-acceptance/hero-distillation-action-handoff.py')
handoff = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(handoff)


class ActionHandoffTest(unittest.TestCase):
    def options(self, root):
        run = root / 'run'; (run / 'train').mkdir(parents=True)
        for name in ['dataset', 'models', 'dependencies', 'api', 'assets']:
            (root / name).mkdir()
        return {'run': run, 'dataset': root / 'dataset', 'evaluation': root / 'evaluation',
                'models': root / 'models', 'dependencies': root / 'dependencies',
                'api_dependencies': root / 'api', 'source_repo': ROOT, 'e2e_out': root / 'e2e',
                'out': root / 'handoff', 'asset_roots': [root / 'assets'], 'node_binary': None,
                'poll_seconds': 10}

    def test_terminal_success_runs_one_workflow(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, options = Path(temporary), None
            options = self.options(root)
            (options['run'] / 'train' / 'state.json').write_text(json.dumps({'status': 'completed'}))
            (options['run'] / 'train' / 'result.json').write_text(json.dumps({'status': 'completed'}))
            (options['run'] / 'train' / 'adapter-roundtrip.json').write_text(json.dumps({'passed': True}))
            calls = []
            class Done: returncode = 0
            def execute(argv, **kwargs): calls.append(argv); return Done()
            result = handoff.run(options, execute=execute)
            self.assertEqual('completed', result['status'])
            self.assertEqual(1, len(calls))
            self.assertIn('--training', calls[0])
            receipt = json.loads((root / 'handoff' / 'state.json').read_text())
            self.assertFalse(receipt['automaticRetry'])

    def test_terminal_failure_never_starts_workflow(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, options = Path(temporary), None
            options = self.options(root)
            (options['run'] / 'train' / 'state.json').write_text(json.dumps({'status': 'stopped-or-failed'}))
            result = handoff.run(options, execute=lambda *args, **kwargs: self.fail('must not execute'))
            self.assertEqual('stopped-or-failed', result['status'])
            self.assertEqual('TRAINING_NOT_COMPLETED', result['reason'])


if __name__ == '__main__':
    unittest.main()
