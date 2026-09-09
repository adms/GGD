import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('finalize', HERE / 'hero-distillation-finalize-evaluation.py')
finalize = importlib.util.module_from_spec(spec); spec.loader.exec_module(finalize)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value if isinstance(value, str) else json.dumps(value))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class FinalizeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        row = {'id': 'hero:HERO', 'heroId': 'hero', 'name': 'Hero',
               'structural': {'structuralPassed': True}, 'package': {'passed': True},
               'isolatedImport': {'passed': True, 'runtimeMatchesAdmission': True},
               'semanticFidelity': 'unverified', 'liveImport': 'unverified', 'gameplay': 'unverified',
               'fullHeroSuccess': None, 'unsafeAccept': None}
        arm = {'rows': [row], 'structuralPassed': 1, 'packageAdmissionPassed': 1,
               'runtimeVerifiedImports': 1, 'fullHeroSuccess': None, 'unsafeAccepts': None,
               'generation': None}
        self.results = {'schema': 'ggd-distillation-results@1', 'capturedAt': '2026-09-10T00:00:00Z',
            'blindTest': False, 'fullHeroE2EProven': False, 'modelPromoted': False,
            'sourceFiles': {}, 'counts': {'primaryWholeHeroes': 1, 'secondarySlots': 0, 'tasks': 1},
            'training': {'completedSteps': 1, 'plannedSteps': 1, 'recordedStatus': 'completed',
                'meanRecordedStepSeconds': 1.0, 'recordedStepPeakMetalBytes': 1024,
                'devBefore': None, 'devAfter': None},
            'arms': {name: copy.deepcopy(arm) for name in ['teacher', 'base', 'lora']}}
        self.results_path = self.root / 'results.json'; save(self.results_path, self.results)
        rows = []
        for arm_name in ['teacher', 'base', 'lora']:
            artifacts = []
            for kind in ['semantic', 'live-import', 'gameplay']:
                path = self.root / 'evidence-files' / f'{arm_name}-{kind}.json'; save(path, {
                    'schema': 'ggd-distillation-exact-reference-receipt@1', 'arm': arm_name,
                    'id': 'hero:HERO', 'heroId': 'hero', 'verdict': 'passed'})
                artifacts.append({'kind': kind, 'path': str(path.relative_to(self.root)), 'sha256': sha(path)})
            rows.append({'arm': arm_name, 'id': 'hero:HERO', 'heroId': 'hero', 'supported': True,
                'humanRepairs': 0, 'reviewerInterventions': 0, 'semanticFidelity': 'passed',
                'liveImport': 'passed', 'gameplay': 'passed', 'unsafeAccept': False,
                'evidence': artifacts})
        self.evidence = self.root / 'evidence.json'
        save(self.evidence, {'schema': 'ggd-distillation-quality-evidence@1',
            'resultsSha256': sha(self.results_path), 'blindTest': False, 'rows': rows})

    def tearDown(self): self.temp.cleanup()

    def test_writes_hash_bound_data_html_and_manifest(self):
        out = self.root / 'final'
        manifest = finalize.finalize(self.results_path, self.evidence, out)
        self.assertTrue(json.loads((out / 'report-data.json').read_text())['fullHeroE2EProven'])
        self.assertIn('已收齊逐英雄品質收據', (out / 'report.html').read_text())
        self.assertEqual(manifest['outputs']['report-data.json'], sha(out / 'report-data.json'))
        self.assertFalse(manifest['modelPromoted'])

    def test_refuses_existing_output_and_drifted_receipt_artifact(self):
        out = self.root / 'final'; out.mkdir()
        with self.assertRaisesRegex(AssertionError, 'REFUSE_OVERWRITE_OR_RETRY'):
            finalize.finalize(self.results_path, self.evidence, out)
        out.rmdir()
        save(self.root / 'evidence-files/teacher-semantic.json', {'passed': False})
        with self.assertRaisesRegex(AssertionError, 'QUALITY_EVIDENCE_DRIFT'):
            finalize.finalize(self.results_path, self.evidence, out)


if __name__ == '__main__': unittest.main()
