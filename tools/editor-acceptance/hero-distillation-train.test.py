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
    def test_authorized_absolute_floor_replaces_relative_drop(self):
        guard = {**GUARD, 'minBatteryPercent': 30}
        del guard['maxBatteryDropPoints']
        for percent in [100, 98, 80, 31, 30]:
            self.assertIsNone(trainer.violation(START, {**START, 'batteryPercent': percent}, guard))
        for percent in [29.99, 29, 0]:
            self.assertEqual(trainer.violation(START, {**START, 'batteryPercent': percent}, guard), 'BATTERY_BELOW_FLOOR')
        self.assertEqual(trainer.violation(START, {**START, 'batteryPercent': None}, guard), 'BATTERY_STATUS_UNKNOWN')
        self.assertEqual(trainer.violation(START, {**START, 'acPower': False}, guard), 'AC_POWER_REQUIRED')
        self.assertEqual(trainer.violation(START, {**START, 'availableBytes': 5*trainer.GIB}, guard), 'LOW_AVAILABLE_MEMORY')
        self.assertEqual(trainer.violation(START, {**START, 'swapUsedBytes': 13*trainer.GIB}, guard), 'SWAP_GROWTH')

    def test_battery_policy_requires_exact_authorization_and_preserves_legacy(self):
        self.assertEqual(trainer.battery_authorization(None), ({'maxBatteryDropPoints': 2}, None))
        record = {'schema': 'ggd-distillation-battery-authorization@1', 'minimumPercent': 30,
                  'comparison': 'strictly-less-than', 'replacesRelativeDropGuard': True,
                  'otherGuardsUnchanged': True,
                  'userQuote': '電量界限我們改成30%'}
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp)/'authorization.json'; trainer.atomic(file, record)
            guard, receipt = trainer.battery_authorization(file)
            self.assertEqual(guard, {'minBatteryPercent': 30})
            self.assertEqual(receipt['sha256'], trainer.digest(file))
            for mutation in [{'minimumPercent': 29}, {'replacesRelativeDropGuard': False}, {'otherGuardsUnchanged': False}]:
                trainer.atomic(file, {**record, **mutation})
                with self.assertRaises(AssertionError): trainer.battery_authorization(file)

    def test_base_receipt_accepts_preflight_or_prior_training_manifest(self):
        files = [{'name': 'model.safetensors', 'bytes': 1, 'sha256': 'x'}]
        self.assertEqual(trainer.base_files_from_receipt({'files': files}), files)
        self.assertEqual(trainer.base_files_from_receipt({'baseFiles': files}), files)
        for receipt in [{}, {'files': []}, {'baseFiles': 'wrong'}]:
            with self.assertRaisesRegex(AssertionError, 'BASE_FILE_RECEIPT_REQUIRED'):
                trainer.base_files_from_receipt(receipt)

    def test_each_full_probe_leg_starts_the_same_gradient_phase_guard(self):
        events=[];row={'id':'whole:HERO','totalTokens':29995}
        def progress(name,**fields):events.append({'phase':name,**fields})
        with patch.object(trainer.time,'monotonic',side_effect=[0,78]):
            self.assertEqual(trainer.begin_gradient_probe(progress,row,'uncached-reference'),0)
            self.assertEqual(trainer.begin_gradient_probe(progress,row,'cached'),78)
        self.assertEqual([r['comparison'] for r in events],['uncached-reference','cached'])
        self.assertTrue(all(r['phase']=='gradient-probe' and r['tokens']==29995 for r in events))
        with self.assertRaisesRegex(AssertionError,'UNKNOWN_PROBE_LEG'):
            trainer.begin_gradient_probe(progress,row,'unbounded')

    def test_sixteen_hour_authorization_is_explicit_and_does_not_change_defaults(self):
        self.assertEqual(trainer.time_authorization(None),(7200,None))
        valid={'schema':'ggd-distillation-time-authorization@1','maximumSeconds':57600,'epochs':1,
               'userQuote':'延長到16小時','otherGuardsUnchanged':True}
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'authorization.json';trainer.atomic(target,valid)
            seconds,receipt=trainer.time_authorization(target)
            self.assertEqual(seconds,57600);self.assertEqual(receipt['sha256'],trainer.digest(target))
            for changes in [{'maximumSeconds':57601},{'epochs':2},{'userQuote':''},{'otherGuardsUnchanged':False}]:
                trainer.atomic(target,{**valid,**changes})
                with self.assertRaises(AssertionError):trainer.time_authorization(target)

    def test_prefix_alignment_preserves_the_global_attention_block_grid(self):
        for length in [256,257,511,512,19137,20878]:
            boundary=trainer.aligned_prefix_length(length,256)
            self.assertEqual(boundary%256,0)
            self.assertLessEqual(boundary,length)
            self.assertLess(length-boundary,256)
            ids=list(range(length+1000))
            self.assertEqual(ids[:boundary]+ids[boundary:],ids)
            self.assertTrue(all((boundary+offset)%256==0 for offset in range(0,1000,256)))
        for length,block in [(0,256),(255,256),(256,0)]:
            with self.assertRaises(AssertionError):trainer.aligned_prefix_length(length,block)

    def test_capacity_uses_real_format_extremes_without_dev_gradients(self):
        train = [{'id': 'hero-long', 'format': 'hero', 'totalTokens': 20, 'outputTokens': 4},
                 {'id': 'hero-answer', 'format': 'hero', 'totalTokens': 18, 'outputTokens': 6},
                 {'id': 'slot', 'format': 'slot', 'totalTokens': 10, 'outputTokens': 1}]
        dev = [{'id': 'dev-not-a-probe', 'format': 'hero', 'totalTokens': 100, 'outputTokens': 50}]
        strata = trainer.capacity_plan(train, dev)
        self.assertEqual(strata['hero']['probeIds'], ['hero-answer', 'hero-long'])
        self.assertEqual(strata['slot']['probeIds'], ['slot'])
        self.assertEqual(strata['hero']['devTasks'], 1)
        probes = [{'id': row['id'], 'format': row['format'], 'seconds': seconds} for row, seconds in zip(train, [10, 12, 2])]
        self.assertEqual(trainer.epoch_estimate(probes, strata), (12 * 4 + 2) * 1.5 + 300)
        with self.assertRaisesRegex(AssertionError, 'INCOMPLETE_CAPACITY_STRATUM'):
            trainer.epoch_estimate(probes[:-1], strata)

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

    def test_diagnostic_manifest_cannot_start_training_even_if_result_is_changed(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);self.fixture(directory)
            config=trainer.read(directory/'manifest.json');config['cacheDiagnosticOnly']=True
            trainer.atomic(directory/'manifest.json',config)
            with patch.object(trainer.subprocess,'Popen') as popen:
                with self.assertRaisesRegex(AssertionError,'DIAGNOSTIC_CANNOT_TRAIN'):
                    trainer.supervise(directory,'train')
                popen.assert_not_called()


if __name__ == '__main__': unittest.main()
