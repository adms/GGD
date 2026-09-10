import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('hero-distillation-run-status.py')
SPEC = importlib.util.spec_from_file_location('run_status', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RunStatusTest(unittest.TestCase):
    def fixture(self, status='running', progress=None):
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        train = root / 'run' / 'train'
        train.mkdir(parents=True)
        (train / 'state.json').write_text(json.dumps({'status': status, 'error': None}))
        if progress is not None:
            (train / 'worker-progress.json').write_text(json.dumps(progress))
        rows = root / 'train.jsonl'
        rows.write_text('{"id":"one"}\n{"id":"two"}\n{"id":"three"}\n')
        return temp, root / 'run', rows

    def test_uses_monotonic_trainer_step_not_id_position(self):
        temp, run, rows = self.fixture(progress={'phase': 'training', 'step': 2, 'id': 'one'})
        with temp:
            actual = MODULE.summarize(run, rows)
        self.assertEqual(actual['completedSteps'], 2)
        self.assertEqual(actual['totalSteps'], 3)
        self.assertEqual(actual['source'], 'worker-progress.step-legacy')

    def test_completed_count_is_not_inflight_step(self):
        temp, run, rows = self.fixture(progress={'phase': 'training', 'step': 2, 'completedSteps': 1})
        with temp: actual = MODULE.summarize(run, rows)
        self.assertEqual(actual['completedSteps'], 1)

    def test_pause_and_guard_stop_are_reportable(self):
        for status in ('paused-charging', 'stopped-or-failed'):
            temp, run, rows = self.fixture(status=status, progress={'phase': 'paused', 'step': 2})
            with temp:
                (run / 'train/training-trace.json').write_text('[{}, {}]')
                actual = MODULE.summarize(run, rows)
            self.assertEqual(actual['completedSteps'], 2)

    def test_completed_run_reports_full_training_set(self):
        temp, run, rows = self.fixture(status='completed')
        with temp:
            actual = MODULE.summarize(run, rows)
        self.assertEqual(actual['completedSteps'], 3)
        self.assertEqual(actual['fraction'], 1)

    def test_rejects_invalid_live_step(self):
        temp, run, rows = self.fixture(progress={'phase': 'training', 'step': 4})
        with temp:
            with self.assertRaisesRegex(ValueError, 'INVALID_LIVE_TRAIN_STEP'):
                MODULE.summarize(run, rows)


if __name__ == '__main__':
    unittest.main()
