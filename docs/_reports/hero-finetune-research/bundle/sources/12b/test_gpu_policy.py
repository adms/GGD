import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hero_gpu_smoke', HERE / 'gpu-smoke.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.base = {'acPower': True, 'batteryPercent': 100, 'availableBytes': 20 * module.GIB, 'swapUsedBytes': 18 * module.GIB}
        self.protocol = {'guard': {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, 'maxBatteryDropPoints': 2}}

    def test_existing_swap_is_not_new_worker_growth(self):
        self.assertIsNone(module.policy_violation(self.base, self.base, self.protocol))

    def test_ac_disconnect(self):
        self.assertEqual(module.policy_violation(self.base, {**self.base, 'acPower': False}, self.protocol), 'AC_POWER_REQUIRED')

    def test_battery_drop_even_with_ac(self):
        self.assertEqual(module.policy_violation(self.base, {**self.base, 'batteryPercent': 98}, self.protocol), 'BATTERY_DROPPING')

    def test_unknown_battery_fails_closed(self):
        self.assertEqual(module.policy_violation(self.base, {**self.base, 'batteryPercent': None}, self.protocol), 'BATTERY_DROPPING')

    def test_low_memory(self):
        self.assertEqual(module.policy_violation(self.base, {**self.base, 'availableBytes': 5 * module.GIB}, self.protocol), 'LOW_AVAILABLE_MEMORY')

    def test_swap_growth(self):
        self.assertEqual(module.policy_violation(self.base, {**self.base, 'swapUsedBytes': 21 * module.GIB}, self.protocol), 'SWAP_GROWTH')

    def test_json_hash_stable_utf8(self):
        self.assertEqual(module.json_hash({'角色': '甲'}), module.hashlib.sha256('{"角色":"甲"}'.encode()).hexdigest())


if __name__ == '__main__':
    unittest.main()
