import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location('failure_receipt', Path(__file__).with_name(
    'hero-distillation-evaluation-failure-receipt.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class FailureReceiptTests(unittest.TestCase):
    def fixture(self, root):
        run = root / 'evaluation'
        inference = run / 'inference'
        base = inference / 'base'
        (run / 'source').mkdir(parents=True)
        (inference / 'source').mkdir(parents=True)
        base.mkdir()
        source = b'fixed\n'
        (run / 'source' / 'controller.py').write_bytes(source)
        (inference / 'source' / 'infer.py').write_bytes(source)
        external = root / 'input.json'
        external.write_text('{}\n')
        manifest = {'schema': 'ggd-distillation-evaluation-batch@1',
            'fixedArmOrder': ['base', 'lora'], 'sources': {'controller.py': r.digest(run/'source/controller.py')},
            'inputManifests': {str(external): r.digest(external)}, 'modelPromoted': False,
            'fullHeroE2EProven': False}
        (run / 'manifest.json').write_text(json.dumps(manifest))
        state = {'schema': 'ggd-distillation-evaluation-batch-state@1', 'status': 'stopped-or-failed',
            'finishedAt': 3, 'error': 'SystemExit(1)', 'modelPromoted': False, 'fullHeroE2EProven': False,
            'steps': [{'status': 'completed'}, {'status': 'stopped-or-failed'}]}
        (run / 'state.json').write_text(json.dumps(state))
        inference_manifest = {'schema': 'ggd-distillation-protected-inference@1',
            'counts': {'tasks': 3}, 'caseIds': ['a:HERO', 'a:Q', 'a:W'],
            'sources': {'infer.py': r.digest(inference/'source/infer.py')},
            'modelPromoted': False, 'fullHeroE2EProven': False}
        (inference / 'manifest.json').write_text(json.dumps(inference_manifest))
        rows = []
        for number, (case_id, complete, matches) in enumerate([('a:HERO', True, False), ('a:Q', False, False)]):
            case = {'id': case_id, 'complete': complete, 'outputFormatMatches': matches,
                'seconds': number + 1, 'error': None if complete else 'InterruptedError'}
            (base / f'case-{number:04d}.json').write_text(json.dumps(case))
            rows.append({key: case[key] for key in ['id', 'complete', 'outputFormatMatches', 'seconds']})
        (base / 'index.json').write_text(json.dumps(rows))
        arm_state = {'status': 'stopped-or-failed', 'arm': 'base', 'workerPid': None,
            'finishedAt': 3, 'error': "RuntimeError('RUN_TIME_LIMIT')",
            'manifestSha256': r.digest(inference/'manifest.json')}
        (base / 'state.json').write_text(json.dumps(arm_state))
        (base / 'worker.log').write_text('')
        return run

    def test_exports_and_reverifies_partial_terminal_failure(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            run = self.fixture(root)
            out = root / 'receipt'
            receipt = r.export(run, out)
            self.assertEqual(receipt['arms'][0]['attemptedFiles'], 2)
            self.assertEqual(receipt['arms'][0]['completeOutputs'], 1)
            self.assertFalse(receipt['evaluationCompleted'])
            r.verify_output(out)
            with self.assertRaisesRegex(AssertionError, 'NEW_INDEPENDENT_OUTPUT'):
                r.export(run, out)

    def test_rejects_running_or_unjoined_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = self.fixture(root)
            state = r.read(run/'state.json')
            state['status'] = 'running'
            (run/'state.json').write_text(json.dumps(state))
            with self.assertRaisesRegex(AssertionError, 'EVALUATION_NOT_TERMINAL_FAILURE'):
                r.export(run, root/'out')
            state['status'] = 'stopped-or-failed'
            (run/'state.json').write_text(json.dumps(state))
            arm = r.read(run/'inference/base/state.json')
            arm['workerPid'] = 42
            (run/'inference/base/state.json').write_text(json.dumps(arm))
            with self.assertRaisesRegex(AssertionError, 'ARM_WORKER_NOT_JOINED'):
                r.export(run, root/'out2')

    def test_rejects_case_order_drift_and_success_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = self.fixture(root)
            case = r.read(run/'inference/base/case-0001.json')
            case['id'] = 'wrong:Q'
            (run/'inference/base/case-0001.json').write_text(json.dumps(case))
            with self.assertRaisesRegex(AssertionError, 'PARTIAL_CASE_ORDER_DRIFT'):
                r.export(run, root/'out')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = self.fixture(root)
            (run/'result.json').write_text('{}')
            with self.assertRaisesRegex(AssertionError, 'FAILED_RUN_HAS_SUCCESS_REPORT'):
                r.export(run, root/'out')

    def test_detects_receipt_drift(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            out = root/'receipt'
            r.export(self.fixture(root), out)
            next(path for path in out.rglob('case-*.json')).write_text('changed')
            with self.assertRaisesRegex(AssertionError, 'RECEIPT_FILE_'):
                r.verify_output(out)


if __name__ == '__main__':
    unittest.main()
