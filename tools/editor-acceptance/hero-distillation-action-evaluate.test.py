import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_evaluate', ROOT / 'tools/editor-acceptance/hero-distillation-action-evaluate.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class ActionEvaluateTest(unittest.TestCase):
    def test_supervisor_samples_at_policy_interval_not_every_poll(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / 'manifest.json').write_text('{}')
            ticks = [0]; sampled = []
            def resources():
                sampled.append(ticks[0])
                return {'acPower': True, 'batteryPercent': 100, 'availableBytes': 64 * M.t.GIB, 'swapUsedBytes': 0}
            policy = {'trainingDirectory': 'unused', 'minimumAvailableBytes': M.t.GIB, 'heroes': 0,
                'resourceSampleIntervalSeconds': 6, 'guard': {'minBatteryPercent': 20, 'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2}}
            class Child:
                pid = 9001
                returncode = None
                def poll(self):
                    if ticks[0] < 12: return None
                    M.atomic(root / 'base/result.json', {'attemptedHeroes': 0})
                    self.returncode = 0; return 0
            with patch.object(M, 'verify', return_value=(policy, [])), patch.object(M.t, 'LOCK', root / 'gpu.lock'), \
                 patch.object(M.t, 'resources', side_effect=resources), patch.object(M.subprocess, 'Popen', return_value=Child()), \
                 patch.object(M.time, 'sleep', side_effect=lambda seconds: ticks.__setitem__(0, ticks[0] + seconds)), \
                 patch.object(M.time, 'monotonic', side_effect=lambda: ticks[0]), \
                 patch.object(M.time, 'time', side_effect=lambda: ticks[0]):
                M.supervise(root, 'base')
            self.assertEqual(sampled, [0, 6, 12])
            self.assertEqual(json.loads((root / 'base/state.json').read_text())['status'], 'completed')

    def test_action_metrics_separate_json_health_from_hero_correctness(self):
        metrics = M.action_metrics([
            {'stage': 'identity', 'complete': True, 'jsonAccepted': True},
            {'stage': 'identity', 'complete': True, 'jsonAccepted': False},
            {'stage': 'action', 'complete': False, 'jsonAccepted': False},
        ], [
            {'heroId': 'a', 'status': 'complete'},
            {'heroId': 'b', 'status': 'failed', 'error': "AssertionError('ACTION_VALUE_NOT_SCALAR')"},
            {'heroId': 'c', 'status': 'failed', 'error': "AssertionError('ACTION_VALUE_NOT_SCALAR')"},
        ])
        self.assertEqual(metrics['byStage']['identity'], {'calls': 2, 'streamComplete': 2, 'jsonAccepted': 1,
                                                           'transportAndJsonAccepted': 1})
        self.assertEqual(metrics['terminalHeroFailures']["AssertionError('ACTION_VALUE_NOT_SCALAR')"], 2)
        self.assertEqual(metrics['completeHeroes'], 1)
        self.assertFalse(metrics['semanticCorrectnessProven'])

    def test_frozen_public_cases_have_no_assistant_teacher_message(self):
        source = ROOT / 'docs/_reports/hero-finetune-research/hero74-action-v3'
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'evaluation'
            manifest = M.freeze(source, out)
            verified, heroes = M.verify(out)
            public = json.loads((out / 'public-heroes.json').read_text())
            self.assertEqual(len(heroes), 15)
            self.assertEqual(manifest['kind'], 'internal-dev-seen-regression')
            self.assertEqual(verified['publicHeroesSha256'], manifest['publicHeroesSha256'])
            self.assertNotIn('"role":"assistant"', json.dumps(public, ensure_ascii=False, separators=(',', ':')))
            self.assertEqual(set(public['heroes'][0]), {'heroId', 'heroName', 'request', 'decisionSpace', 'assetBinding',
                                                        'identityMessages', 'selectionSystem', 'coreSystem', 'actionSystem',
                                                        'detailedCatalog', 'actionProtocol'})
            self.assertEqual(public['heroes'][0]['actionProtocol'], 'legacy@1')


if __name__ == '__main__':
    unittest.main()
