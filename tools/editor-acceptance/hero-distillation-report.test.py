import copy
import importlib.util
from pathlib import Path
import unittest


HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('report', HERE / 'hero-distillation-report.py')
report = importlib.util.module_from_spec(spec); spec.loader.exec_module(report)


def fixture():
    row = {'id': 'hero:HERO', 'heroId': 'hero', 'name': '<Hero>',
           'structural': {'structuralPassed': True, 'error': None},
           'package': {'passed': True, 'error': None},
           'isolatedImport': {'passed': True, 'runtimeMatchesAdmission': True, 'error': None},
           'semanticFidelity': 'unverified', 'liveImport': 'unverified', 'gameplay': 'unverified',
           'fullHeroSuccess': None, 'unsafeAccept': None}
    arm = {'rows': [row], 'wholeHeroes': 1, 'generation': None, 'structuralPassed': 1,
           'packageAdmissionPassed': 1, 'runtimeVerifiedImports': 1,
           'fullHeroSuccess': None, 'unsafeAccepts': None}
    return {'schema': 'ggd-distillation-results@1', 'capturedAt': '2026-09-10T00:00:00Z',
            'modelPromoted': False, 'fullHeroE2EProven': False, 'blindTest': False,
            'counts': {'primaryWholeHeroes': 1, 'secondarySlots': 0, 'tasks': 1},
            'training': {'completedSteps': 1, 'plannedSteps': 1, 'recordedStatus': 'completed',
                'meanRecordedStepSeconds': 1.0, 'recordedStepPeakMetalBytes': 1024,
                'devBefore': None, 'devAfter': None},
            'arms': {name: copy.deepcopy(arm) for name in ['teacher', 'base', 'lora']},
            'sourceFiles': {}}


class ReportTest(unittest.TestCase):
    def test_unverified_report_keeps_unknown_unknown(self):
        html = report.render(fixture())
        self.assertIn('未測，不能當 0', html)
        self.assertIn('目前不宣告模型達標', html)
        self.assertNotIn('<Hero>', html)
        self.assertIn('&lt;Hero&gt;', html)

    def test_bound_quality_renders_counts_and_blind_label(self):
        data = fixture(); data['fullHeroE2EProven'] = True; data['blindTest'] = True
        for arm in data['arms'].values():
            arm.update(fullHeroSuccess=1, unsafeAccepts=0)
            arm['rows'][0].update(semanticFidelity='passed', liveImport='passed', gameplay='passed',
                                  fullHeroSuccess=True, unsafeAccept=False)
        html = report.render(data)
        self.assertIn('Blind unseen batch', html)
        self.assertIn('已收齊逐英雄品質收據', html)
        self.assertIn('teacher: 成功', html)
        self.assertNotIn('未測，不能當 0', html)

    def test_e2e_claim_rejects_missing_or_drifting_row_evidence(self):
        data = fixture(); data['fullHeroE2EProven'] = True
        for arm in data['arms'].values():
            arm.update(fullHeroSuccess=1, unsafeAccepts=0)
            arm['rows'][0].update(semanticFidelity='passed', liveImport='passed', gameplay='passed',
                                  fullHeroSuccess=False, unsafeAccept=False)
        with self.assertRaisesRegex(AssertionError, 'SUCCESS_AGGREGATE_DRIFT'):
            report.render(data)


if __name__ == '__main__': unittest.main()
