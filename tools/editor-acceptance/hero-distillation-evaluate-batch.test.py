"""Controller tests use fake inference; never load MLX/model weights."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('batch', Path(__file__).with_name('hero-distillation-evaluate-batch.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def put(file, obj):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(obj))


class FakeInference:
    def __init__(self, fail=None, ready=True, drift=None):
        self.fail, self.ready, self.drift, self.calls = fail, ready, drift, []

    def final_checkpoint(self, run):
        self.calls.append('checkpoint')
        assert self.ready, 'TRAIN_NOT_TERMINAL_SUCCESS'
        return {}, run / 'adapter', []

    def prepare(self, run, evaluation, out):
        self.calls.append('prepare')
        put(out / 'manifest.json', {'counts': {'tasks': 119, 'primaryWholeHeroes': 17}})

    def supervise(self, out, arm):
        self.calls.append(arm)
        if arm == self.fail:
            raise RuntimeError('GUARD_STOP')
        put(out / arm / 'state.json', {'status': 'completed', 'workerPid': None})
        if self.drift:
            put(self.drift, {'changed': True})


class BatchTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.options = {k: str(self.root / k) for k in ['training', 'evaluation', 'models', 'assets', 'dependencies', 'out']}
        for k in ['training', 'evaluation', 'models', 'assets', 'dependencies']:
            put(Path(self.options[k]) / 'manifest.json', {'fixture': k})
        self.options['asset_roots'] = [self.options['assets']]
        self.options['api_dependencies'] = str(self.root / 'api-dependencies')
        for name in ['fastify', 'tsx']:
            put(Path(self.options['api_dependencies']) / name / 'package.json', {'version': 'fixture'})
        self.cpu = []

    def tearDown(self):
        self.temp.cleanup()

    def execute(self, command, log):
        self.cpu.append(command)
        out = Path(command[command.index('--out') + 1])
        if 'hero-distillation-results.py' in command[1]:
            put(out, {'fixture': 'collected'})
            return
        if 'hero-distillation-report.py' in command[1]:
            out.write_text('<html>fixture</html>')
            return
        counts = {'allCases': 119, 'primaryWholeHeroes': 17} if '--arm' in command else {'wholeHeroes': 17}
        put(out / 'report.json', {'counts': counts})

    def test_reject_live_training_without_output_or_commands(self):
        fake = FakeInference(ready=False)
        with self.assertRaisesRegex(AssertionError, 'TRAIN_NOT_TERMINAL_SUCCESS'):
            b.run(self.options, fake, self.execute)
        self.assertFalse(Path(self.options['out']).exists())
        self.assertEqual(self.cpu, [])

    def test_success_is_sequential_all_cases_and_never_model_promotion(self):
        fake = FakeInference()
        state = b.run(self.options, fake, self.execute)
        self.assertEqual(fake.calls, ['checkpoint', 'prepare', 'base', 'lora'])
        self.assertEqual([s['name'] for s in state['steps']], ['prepare-inference', 'infer-base', 'infer-lora',
            'compile-base', 'package-admission-base', 'compile-lora', 'package-admission-lora',
            'isolated-import-base', 'verify-import-runtime-base', 'isolated-import-lora', 'verify-import-runtime-lora',
            'collect-results', 'render-report'])
        self.assertEqual(len(self.cpu), 10)
        self.assertEqual(state['status'], 'completed')
        result = b.read(Path(self.options['out']) / 'result.json')
        for key in ['fullHeroE2EProven', 'modelPromoted', 'semanticFidelityMeasured', 'liveImportMeasured']:
            self.assertIs(result[key], False)
        self.assertNotIn('--teacher-control', [x for command in self.cpu for x in command])
        with self.assertRaisesRegex(AssertionError, 'REFUSE_OVERWRITE_OR_RETRY'):
            b.run(self.options, FakeInference(), self.execute)

    def test_guard_failure_stops_without_second_arm_or_cpu_stage(self):
        fake = FakeInference(fail='base')
        with self.assertRaisesRegex(RuntimeError, 'GUARD_STOP'):
            b.run(self.options, fake, self.execute)
        self.assertEqual(fake.calls, ['checkpoint', 'prepare', 'base'])
        self.assertEqual(self.cpu, [])
        state = b.read(Path(self.options['out']) / 'state.json')
        self.assertEqual(state['status'], 'stopped-or-failed')
        self.assertEqual(state['steps'][-1]['status'], 'stopped-or-failed')
        self.assertFalse((Path(self.options['out']) / 'result.json').exists())

    def test_manifest_drift_stops_before_second_arm(self):
        fake = FakeInference(drift=Path(self.options['models']) / 'manifest.json')
        with self.assertRaisesRegex(AssertionError, 'INPUT_MANIFEST_DRIFT'):
            b.run(self.options, fake, self.execute)
        self.assertEqual(fake.calls, ['checkpoint', 'prepare', 'base'])

    def test_missing_case_denominator_cannot_complete(self):
        def shortened(command, log):
            self.execute(command, log)
            if '--arm' in command:
                out = Path(command[command.index('--out') + 1])
                put(out / 'report.json', {'counts': {'allCases': 12, 'primaryWholeHeroes': 2}})
        with self.assertRaisesRegex(AssertionError, 'COMPILE_CASES_MISSING'):
            b.run(self.options, FakeInference(), shortened)
        self.assertEqual(b.read(Path(self.options['out']) / 'state.json')['status'], 'stopped-or-failed')

    def test_report_failure_preserves_evaluations_without_success_receipt(self):
        def fail_report(command, log):
            if 'hero-distillation-report.py' in command[1]:
                raise RuntimeError('REPORT_FAILED')
            self.execute(command, log)
        with self.assertRaisesRegex(RuntimeError, 'REPORT_FAILED'):
            b.run(self.options, FakeInference(), fail_report)
        out = Path(self.options['out'])
        self.assertTrue((out / 'base-compile/report.json').exists())
        self.assertTrue((out / 'report-data.json').exists())
        self.assertFalse((out / 'result.json').exists())
        self.assertEqual(b.read(out / 'state.json')['steps'][-1]['status'], 'stopped-or-failed')

    def test_teacher_control_report_drift_cannot_change_comparison(self):
        teacher = self.root / 'teacher'
        put(teacher / 'report.json', {'fixture': True})
        self.options['teacher_compile'] = str(teacher)
        fake = FakeInference(drift=teacher / 'report.json')
        with self.assertRaisesRegex(AssertionError, 'INPUT_MANIFEST_DRIFT'):
            b.run(self.options, fake, self.execute)
        self.assertEqual(fake.calls, ['checkpoint', 'prepare', 'base'])

    def test_import_timeout_does_not_retry_or_produce_final_success(self):
        def timeout(command, log):
            if '--api-dependencies' in command:
                raise TimeoutError('IMPORT_PHASE_TIMEOUT')
            self.execute(command, log)
        with self.assertRaisesRegex(TimeoutError, 'IMPORT_PHASE_TIMEOUT'):
            b.run(self.options, FakeInference(), timeout)
        out = Path(self.options['out'])
        self.assertTrue((out / 'lora-compile/report.json').exists())
        self.assertFalse((out / 'result.json').exists())
        self.assertEqual(b.read(out / 'state.json')['steps'][-1]['name'], 'isolated-import-base')
        manifest = b.read(out / 'manifest.json')
        self.assertEqual(manifest['importPhaseTimeoutSeconds'], 180)
        self.assertIs(manifest['automaticRetry'], False)

    def test_missing_api_dependencies_fail_before_inference_prepare(self):
        self.options['api_dependencies'] = str(self.root / 'missing')
        fake = FakeInference()
        with self.assertRaisesRegex(AssertionError, 'API_DEPENDENCIES_MISSING'):
            b.run(self.options, fake, self.execute)
        self.assertEqual(fake.calls, ['checkpoint'])
        self.assertFalse(Path(self.options['out']).exists())


if __name__ == '__main__':
    unittest.main()
