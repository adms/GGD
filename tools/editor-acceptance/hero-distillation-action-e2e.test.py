import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_e2e', ROOT / 'tools/editor-acceptance/hero-distillation-action-e2e.py')
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)


class ActionE2ETest(unittest.TestCase):
    def test_keeps_full_denominator_through_all_cpu_stages(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); evaluation, models, dependencies, assets = [root / name for name in ['evaluation', 'models', 'deps', 'assets']]
            for folder in [evaluation, models, dependencies, assets]: folder.mkdir()
            (evaluation / 'manifest.json').write_text(json.dumps({'schema': 'ggd-action-protected-evaluation@1',
                'kind': 'internal-dev-seen-regression', 'heroes': 1}) + '\n')
            for arm in ['base', 'lora']:
                (evaluation / arm).mkdir(); (evaluation / arm / 'state.json').write_text(json.dumps({'status': 'completed', 'workerPid': None}) + '\n')
                (evaluation / arm / 'result.json').write_text(json.dumps({'attemptedHeroes': 1}) + '\n')
            (models / 'manifest.json').write_text('{}\n')
            calls = []
            def fake(argv, log, timeout=180):
                calls.append(argv); out = Path(argv[argv.index('--out') + 1]); out.mkdir()
                if 'action-compile' in argv[3]: counts = {'primaryWholeHeroes': 1}
                elif 'package-admission' in argv[3]: counts = {'wholeHeroes': 1}
                elif '--verify-saved-runtime' in argv: counts = {'wholeHeroes': 1}
                else: counts = {'wholeHeroes': 1}
                (out / 'report.json').write_text(json.dumps({'counts': counts}) + '\n')
            result = M.run({'evaluation': str(evaluation), 'models': str(models), 'dependencies': str(dependencies),
                'source_repo': str(ROOT), 'api_dependencies': str(dependencies), 'asset_roots': [str(assets)], 'out': str(root / 'out')}, execute=fake)
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(len(calls), 8)
            report = json.loads((root / 'out' / 'result.json').read_text())
            self.assertEqual(report['arms']['base']['runtimeAudit']['wholeHeroes'], 1)
            self.assertEqual(report['arms']['lora']['compile']['primaryWholeHeroes'], 1)


if __name__ == '__main__':
    unittest.main()
