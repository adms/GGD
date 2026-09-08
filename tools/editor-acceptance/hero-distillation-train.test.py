"""CPU-only admission/ownership tests. Never import MLX or load weights."""
import importlib.util
import json
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('distillation_train', Path(__file__).with_name('hero-distillation-train.py'))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)
START = {'acPower': True, 'batteryPercent': 100, 'availableBytes': 64 * trainer.GIB, 'swapUsedBytes': 10 * trainer.GIB}
GUARD = {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, 'maxBatteryDropPoints': 2}


class GuardTests(unittest.TestCase):
    def test_every_resource_boundary(self):
        self.assertIsNone(trainer.violation(START, START, GUARD))
        for changes, reason in [({'acPower': False}, 'AC_POWER_REQUIRED'),
                ({'batteryPercent': 98}, 'BATTERY_DROPPING'), ({'batteryPercent': None}, 'BATTERY_DROPPING'),
                ({'availableBytes': 6 * trainer.GIB - 1}, 'LOW_AVAILABLE_MEMORY'),
                ({'swapUsedBytes': 12 * trainer.GIB + 1}, 'SWAP_GROWTH')]:
            self.assertEqual(trainer.violation(START, {**START, **changes}, GUARD), reason)

    def fixture(self, directory):
        config = {'workerSha256': trainer.digest(trainer.SCRIPT), 'minimumAvailableBytes': 24 * trainer.GIB, 'guard': GUARD}
        trainer.atomic(directory / 'manifest.json', config)
        return directory / 'gpu.lock'

    def test_other_lock_is_not_removed_or_restarted(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp); lock = self.fixture(directory)
            lock.write_text(json.dumps({'token': 'other-worker'}))
            with patch.object(trainer, 'LOCK', lock), patch.object(trainer, 'resources', return_value=START), patch.object(trainer.subprocess, 'Popen') as popen:
                with self.assertRaises(SystemExit): trainer.supervise(directory, 'probe')
                popen.assert_not_called()
            self.assertEqual(json.loads(lock.read_text()), {'token': 'other-worker'})
            self.assertFalse((directory / 'probe').exists())

    def test_spawn_failure_releases_own_lock_and_restores_handlers(self):
        handlers = {sig: signal.getsignal(sig) for sig in [signal.SIGTERM, signal.SIGINT]}
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp); lock = self.fixture(directory)
            with patch.object(trainer, 'LOCK', lock), patch.object(trainer, 'resources', return_value=START), patch.object(trainer.subprocess, 'Popen', side_effect=OSError('spawn-test')):
                with self.assertRaises(SystemExit): trainer.supervise(directory, 'probe')
            self.assertFalse(lock.exists())
            self.assertEqual(trainer.read(directory / 'probe/state.json')['status'], 'stopped-or-failed')
        self.assertEqual(handlers, {sig: signal.getsignal(sig) for sig in handlers})

    def test_mkdir_failure_releases_own_lock_without_writing_foreign_directory(self):
        original = Path.mkdir
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp); lock = self.fixture(directory)
            def mkdir(path, *args, **kwargs):
                if path == directory / 'probe': raise PermissionError('mkdir-test')
                return original(path, *args, **kwargs)
            with patch.object(trainer, 'LOCK', lock), patch.object(trainer, 'resources', return_value=START), patch.object(Path, 'mkdir', mkdir):
                with self.assertRaises(SystemExit): trainer.supervise(directory, 'probe')
            self.assertFalse(lock.exists())
            self.assertFalse((directory / 'probe').exists())

    def test_existing_run_and_unplugged_machine_do_not_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp); lock = self.fixture(directory)
            with patch.object(trainer, 'LOCK', lock), patch.object(trainer, 'resources', return_value={**START, 'acPower': False}), patch.object(trainer.subprocess, 'Popen') as popen:
                with self.assertRaisesRegex(AssertionError, 'RESOURCE_ADMISSION'): trainer.supervise(directory, 'probe')
                (directory / 'probe').mkdir()
                with self.assertRaisesRegex(AssertionError, 'REFUSE_RESTART'): trainer.supervise(directory, 'probe')
                popen.assert_not_called()
            self.assertFalse(lock.exists())

    def test_failed_probe_cannot_start_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp); self.fixture(directory)
            (directory / 'probe').mkdir()
            trainer.atomic(directory / 'probe/result.json', {'fitsTimeBudget': False, 'fitsStepBudget': True})
            with patch.object(trainer.subprocess, 'Popen') as popen:
                with self.assertRaisesRegex(AssertionError, 'PROBE_BUDGET_FAILED'): trainer.supervise(directory, 'train')
                popen.assert_not_called()


if __name__ == '__main__': unittest.main()
