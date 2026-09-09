"""CPU-only evidence export tests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('receipt', Path(__file__).with_name('hero-distillation-receipt.py'))
receipt = importlib.util.module_from_spec(spec); spec.loader.exec_module(receipt)


class ReceiptTests(unittest.TestCase):
    def fixture(self, root):
        run = root / 'run'; (run / 'source').mkdir(parents=True); (run / 'probe').mkdir()
        for name in ['hero-distillation-train.py', 'hero-distillation-memory.py']:
            (run / 'source' / name).write_bytes(b'fixed-source\n')
        (run / 'tokens.json').write_text('[]')
        (run / 'token-preflight.json').write_text('{}')
        manifest = {'workerSha256': receipt.digest(b'fixed-source\n'), 'memoryHelperSha256': receipt.digest(b'fixed-source\n'),
                    'tokenizedSha256': receipt.digest(b'[]')}
        (run / 'manifest.json').write_text(json.dumps(manifest))
        resource = {'availableBytes': 100, 'swapUsedBytes': 20, 'acPower': True, 'batteryPercent': 100}
        state = {'status': 'stopped-or-failed', 'finishedAt': 20, 'startedAt': 10, 'workerPid': None,
                 'manifestSha256': receipt.digest((run / 'manifest.json').read_bytes()),
                 'preflight': resource, 'samples': [{**resource, 'availableBytes': 80, 'swapUsedBytes': 23}], 'error': 'test-stop'}
        (run / 'probe/state.json').write_text(json.dumps(state))
        return run

    def test_exact_source_receipts_not_weights_and_no_promotion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); run = self.fixture(root)
            (run / 'probe/adapters.safetensors').write_bytes(b'not-real-weights')
            result = receipt.export(run, root / 'out')
            self.assertEqual(result['phases']['probe']['optimizerStepsRecorded'], 0)
            self.assertEqual(result['phases']['probe']['maxObservedSwapGrowthBytes'], 3)
            self.assertFalse(result['modelPromoted'])
            self.assertFalse((root / 'out/probe/adapters.safetensors').exists())
            self.assertEqual((root / 'out/source/hero-distillation-train.py').read_bytes(), b'fixed-source\n')
            with self.assertRaisesRegex(AssertionError, 'NEW_INDEPENDENT_OUTPUT'): receipt.export(run, root / 'out')

    def test_live_phase_and_source_or_token_drift_fail_before_writing(self):
        for kind in ['running', 'source', 'tokens']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); run = self.fixture(root)
                if kind == 'running':
                    state = receipt.read(run / 'probe/state.json'); state['status'] = 'running'
                    (run / 'probe/state.json').write_text(json.dumps(state))
                elif kind == 'source': (run / 'source/hero-distillation-train.py').write_text('changed')
                else: (run / 'tokens.json').write_text('[1]')
                with self.assertRaises(AssertionError): receipt.export(run, root / 'out')
                self.assertFalse((root / 'out').exists())


if __name__ == '__main__': unittest.main()
