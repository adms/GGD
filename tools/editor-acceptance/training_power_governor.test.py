import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('governor', Path(__file__).with_name('training_power_governor.py'))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
POLICY = {'schema': g.SCHEMA, 'hardStopPercent': 20, 'pauseBelowPercent': 30,
          'fullSpeedResumePercent': 70, 'sampleIntervalSeconds': 180,
          'lowPowerMode': 'pause', 'throttleSeconds': 0}

class GovernorTests(unittest.TestCase):
    def sample(self, percent, ac=True): return {'batteryPercent': percent, 'acPower': ac}
    def test_boundaries_and_hysteresis(self):
        self.assertEqual(g.decide(POLICY, self.sample(70))['action'], 'run-full')
        self.assertEqual(g.decide(POLICY, self.sample(69), 'paused')['action'], 'wait')
        self.assertEqual(g.decide(POLICY, self.sample(30))['action'], 'run-full')
        self.assertEqual(g.decide(POLICY, self.sample(29))['action'], 'checkpoint-pause')
        self.assertEqual(g.decide(POLICY, self.sample(20))['action'], 'checkpoint-pause')
        self.assertEqual(g.decide(POLICY, self.sample(19.99))['action'], 'hard-stop')
    def test_ac_unknown_and_throttle(self):
        self.assertEqual(g.decide(POLICY, self.sample(80, False))['reason'], 'AC_POWER_REQUIRED')
        self.assertEqual(g.decide(POLICY, self.sample(None))['reason'], 'BATTERY_STATUS_UNKNOWN')
        policy = {**POLICY, 'lowPowerMode': 'throttle', 'throttleSeconds': 4}
        got = g.decide(policy, self.sample(25)); self.assertEqual((got['action'], got['sleepSeconds']), ('run-throttled', 4))
    def test_rejects_invalid_policy(self):
        with self.assertRaises(ValueError): g.validate({**POLICY, 'pauseBelowPercent': 20})
        with self.assertRaises(ValueError): g.validate({**POLICY, 'throttleDecliningSamples': 0})
        for value in (float('nan'), float('inf'), True, '20'):
            with self.assertRaises(ValueError): g.validate({**POLICY, 'hardStopPercent': value})
        with self.assertRaises(ValueError): g.validate({**POLICY, 'lowPowerMode': 'throttle'})
    def test_bad_sensor_never_runs(self):
        for percent in (float('nan'), float('inf'), -1, 101, True, '80'):
            self.assertEqual(g.decide(POLICY, self.sample(percent))['action'], 'hard-stop')

if __name__ == '__main__': unittest.main()
