"""CPU tests of the actual supervisor using deterministic resource/process fakes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import training_runtime_checkpoint as cp

spec = importlib.util.spec_from_file_location('trainer', Path(__file__).with_name('hero-distillation-train.py'))
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
POLICY = {'schema': 'ggd-training-power-governor@1', 'hardStopPercent': 20, 'pauseBelowPercent': 30,
          'fullSpeedResumePercent': 70, 'sampleIntervalSeconds': 1, 'lowPowerMode': 'pause', 'throttleSeconds': 0}


class SupervisorTests(unittest.TestCase):
    def exercise(self, batteries, behavior='pause', maximum=40, policy=None):
        policy = POLICY if policy is None else policy
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); work = root / 'train'; lock = root / 'gpu.lock'
            (root / 'probe').mkdir()
            t.atomic(root / 'probe/result.json', {'fitsTimeBudget': True, 'fitsStepBudget': True})
            t.atomic(root / 'probe/state.json', {'status': 'completed'})
            t.atomic(root / 'manifest.json', {'workerSha256': t.digest(t.SCRIPT), 'powerPolicy': policy,
                'minimumAvailableBytes': 24 * t.GIB, 'secondsMaximum': maximum,
                'resourceSampleIntervalSeconds': policy['sampleIntervalSeconds'], 'stepSecondsMaximum': 10,
                'guard': {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, 'minBatteryPercent': 20}})
            ticks = [1000.0]; calls = []; samples = []
            def resource():
                percent = batteries[min(len(samples), len(batteries)-1)]
                sample = {'acPower': True, 'batteryPercent': percent, 'availableBytes': 64*t.GIB,
                          'swapUsedBytes': 0, 'sampledAt': ticks[0]}
                samples.append(sample); return sample
            class Child:
                def __init__(self, cmd, **kwargs):
                    self.pid = 100 + len(calls); self.returncode = None
                    calls.append({'cmd': cmd, 'sample': samples[-1].copy(), 'time': ticks[0]})
                    self.index = len(calls); self.polls = 0
                def poll(self):
                    if self.returncode is not None: return self.returncode
                    self.polls += 1
                    t.atomic(work/'worker-progress.json', {'pid': self.pid, 'startedAt': ticks[0], 'phase': 'training', 'step': 1})
                    if behavior == 'failed': self.returncode = 1
                    elif behavior == 'unrequested': self.returncode = 75
                    elif self.index > 1 or behavior == 'complete':
                        t.atomic(work/'result.json', {'phase': 'train'}); self.returncode = 0
                    else:
                        control = work/'power-control.json'
                        if control.exists() and t.read(control)['action'] == 'checkpoint-pause':
                            receipt = cp.save(work/'runtime-checkpoints', {}, {'step': 1},
                                is_tensor=lambda v: False, save_tensors=lambda path, ts: Path(path).write_text('{}'))
                            receipt.update(workerPid=self.pid, completedSteps=1)
                            if behavior == 'corrupt': (Path(receipt['path'])/'state.json').write_text('broken')
                            t.atomic(work/'resume.json', receipt); self.returncode = 75
                    return self.returncode
                def wait(self, timeout=None): self.returncode = -15; return self.returncode
            with patch.object(t, 'LOCK', lock), patch.object(t, 'resources', side_effect=resource), \
                 patch.object(t.subprocess, 'Popen', side_effect=Child), patch.object(t.time, 'time', side_effect=lambda: ticks[0]), \
                 patch.object(t.time, 'monotonic', side_effect=lambda: ticks[0]), \
                 patch.object(t.time, 'sleep', side_effect=lambda seconds: ticks.__setitem__(0, ticks[0]+seconds)), \
                 patch.object(t.os, 'killpg'):
                try: t.supervise(root, 'train')
                except SystemExit: pass
            self.assertFalse(lock.exists())
            return t.read(work/'state.json'), calls, samples

    def test_pause_exits_before_charge_then_resume_at_70(self):
        state, calls, samples = self.exercise([80, 29, 50, 70])
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(len(calls), 2)
        self.assertIn('--resume-checkpoint', calls[1]['cmd'])
        self.assertEqual(calls[1]['sample']['batteryPercent'], 70)
        events = [e['event'] for e in state['powerEvents']]
        self.assertLess(events.index('worker-exited-for-charge'), len(events)-1)
        self.assertEqual(state['startedAt'], 1000)
    def test_initial_48_waits_without_starting_gpu(self):
        state, calls, _ = self.exercise([48, 60, 70], 'complete')
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(len(calls), 1); self.assertEqual(calls[0]['sample']['batteryPercent'], 70)
    def test_wait_has_finite_wall_deadline(self):
        state, calls, _ = self.exercise([48], maximum=5)
        self.assertIn('RUN_TIME_LIMIT', state['error']); self.assertEqual(calls, [])
    def test_failed_worker_never_restarts(self):
        state, calls, _ = self.exercise([80], 'failed')
        self.assertIn('WORKER_EXIT:1', state['error']); self.assertEqual(len(calls), 1)
    def test_corrupt_checkpoint_never_restarts(self):
        state, calls, _ = self.exercise([80, 29, 70], 'corrupt')
        self.assertIn('PAUSE_CHECKPOINT_DRIFT', state['error']); self.assertEqual(len(calls), 1)
    def test_hard_floor_while_charging_is_terminal(self):
        state, calls, _ = self.exercise([80, 29, 19])
        self.assertIn('BATTERY_BELOW_FLOOR', state['error']); self.assertEqual(len(calls), 1)
    def test_exit75_requires_a_requested_pause(self):
        state, calls, _ = self.exercise([80], 'unrequested')
        self.assertIn('UNSOLICITED_WORKER_PAUSE', state['error']); self.assertEqual(len(calls), 1)
    def test_sensor_sampling_180_seconds_not_process_poll_interval(self):
        state, calls, samples = self.exercise([80, 29, 50, 70], maximum=800,
            policy={**POLICY, 'sampleIntervalSeconds': 180})
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(b['sampledAt'] - a['sampledAt'] >= 180 for a, b in zip(samples, samples[1:])))
    def test_configurable_throttle_declines_fall_back_to_pause(self):
        state, calls, _ = self.exercise([80, 29, 28, 27, 70], policy={**POLICY,
            'lowPowerMode': 'throttle', 'throttleSeconds': 4, 'throttleDecliningSamples': 3})
        self.assertEqual(state['status'], 'completed')
        pauses = [e for e in state['powerEvents'] if e['event'] == 'pause-request']
        self.assertEqual(pauses[0]['reason'], 'THROTTLE_STILL_DISCHARGING')
        self.assertEqual(len(calls), 2)

if __name__ == '__main__': unittest.main()
