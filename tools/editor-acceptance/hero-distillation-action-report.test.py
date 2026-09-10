import importlib.util
import json
import hashlib
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_report', ROOT / 'tools/editor-acceptance/hero-distillation-action-report.py')
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)


class ActionReportTest(unittest.TestCase):
    def test_renders_negative_e2e_without_claiming_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); training, evaluation, e2e = [root / name for name in ['train', 'evaluation', 'e2e']]
            (training / 'train').mkdir(parents=True); evaluation.mkdir(); e2e.mkdir()
            (training / 'manifest.json').write_text(json.dumps({'schema': 'ggd-full-hero-lora-run@1', 'steps': 2}))
            (training / 'train/state.json').write_text(json.dumps({'status': 'completed', 'workerPid': None}))
            (training / 'train/result.json').write_text(json.dumps({'steps': 2, 'trainingSeconds': 3.0, 'peakMetalBytes': 1024 ** 3,
                'beforeMeanDevCE': 2.0, 'afterMeanDevCE': 1.0}))
            (evaluation / 'manifest.json').write_text(json.dumps({'schema': 'ggd-action-protected-evaluation@1', 'heroes': 1, 'kind': 'internal-dev-seen-regression'}))
            for name in ['base', 'lora']:
                (evaluation / name).mkdir()
                (evaluation / name / 'result.json').write_text(json.dumps({'attemptedHeroes': 1, 'completeHeroes': 0}))
                (evaluation / name / 'action-metrics.json').write_text(json.dumps({'calls': 2, 'completeHeroes': 0, 'failedHeroes': 1,
                    'terminalHeroFailures': {'bad': 1}, 'byStage': {'identity': {'calls': 2, 'streamComplete': 1, 'jsonAccepted': 1, 'transportAndJsonAccepted': 1}}}))
            (e2e / 'result.json').write_text(json.dumps({'schema': 'ggd-action-e2e-result@1', 'skipped': True,
                'skipReason': 'INCOMPLETE_HERO_PLANS', 'fullHeroE2EProven': False}))
            html = M.render(M.collect(training, evaluation, e2e))
            self.assertIn('未執行編譯', html)
            self.assertIn('不宣告未見泛化', html)
            self.assertIn('0 / 1', html)
            match = root / 'match'; match.mkdir()
            evidence = {'schema': 'ggd-match-entry-batch@1', 'status': 'completed',
                'e2eResultSha256': hashlib.sha256((e2e / 'result.json').read_bytes()).hexdigest(),
                'arms': {name: {'wholeHeroes': 1, 'entryPassed': 0, 'rows': [{'entryPassed': False}]} for name in ['base', 'lora']}}
            (match / 'report.json').write_text(json.dumps(evidence))
            html = M.render(M.collect(training, evaluation, e2e, match))
            self.assertIn('base：0 / 1', html)
            self.assertIn('不是六槽機制完整驗收', html)
            evidence['arms']['base']['entryPassed'] = 1
            (match / 'report.json').write_text(json.dumps(evidence))
            with self.assertRaisesRegex(AssertionError, 'MATCH_PASS_COUNT_DRIFT'):
                M.collect(training, evaluation, e2e, match)


if __name__ == '__main__':
    unittest.main()
