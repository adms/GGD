import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('evidence', HERE / 'hero-distillation-exact-reference-evidence.py')
e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)
quality_spec = importlib.util.spec_from_file_location('quality', HERE / 'hero-distillation-quality-adjudication.py')
quality = importlib.util.module_from_spec(quality_spec); quality_spec.loader.exec_module(quality)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


class ExactReferenceEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        row = {'id': 'hero:HERO', 'heroId': 'hero', 'structural': {'structuralPassed': True},
               'package': {'passed': True},
               'isolatedImport': {'passed': True, 'runtimeMatchesAdmission': True},
               'semanticFidelity': 'unverified', 'liveImport': 'unverified', 'gameplay': 'unverified',
               'fullHeroSuccess': None, 'unsafeAccept': None}
        self.results = {'schema': 'ggd-distillation-results@1', 'blindTest': False,
            'sourceFiles': {},
            'arms': {arm: {'rows': [copy.deepcopy(row)]} for arm in e.ARMS}}
        self.results_path = self.root / 'results.json'; save(self.results_path, self.results)
        self.qualification = {'schema': 'ggd-distillation-teacher-quality@1', 'blindTest': False,
            'rows': [{'id': 'hero:HERO', 'heroId': 'hero', 'semanticFidelity': 'passed',
                'gameplay': 'passed', 'unsafeAccept': False,
                'engineRevision': 'a' * 40, 'compiledSha256': None,
                'evidence': [{'kind': kind, 'path': f'{kind}.json', 'sha256': '0' * 64}
                             for kind in ['source-semantic', 'teacher-gameplay']]}]}
        self.qualification_path = self.root / 'qualification.json'; save(self.qualification_path, self.qualification)
        self.compiles = {}
        for arm in e.ARMS:
            folder = self.root / (arm + '-compile'); compiled = folder / 'case-0000/compiled.json'
            save(compiled, {'champion': {'id': 'hero'}, 'abilityDrafts': {'Q': {'damage': 10}}})
            save(folder / 'report.json', {'schema': 'ggd-distillation-generation-compile@1',
                'sourceEvidence': {'arm': 'teacher-control' if arm == 'teacher' else arm},
                'rows': [{'id': 'hero:HERO', 'heroId': 'hero', 'slot': 'HERO', 'engineRevision': 'a' * 40,
                    'schemaCompilePassed': True, 'diskReloadCompileIdentical': True,
                    'compiledSha256': sha(compiled)}]})
            self.compiles[arm] = folder
            self.results['sourceFiles'][str((folder / 'report.json').resolve())] = {'sha256': sha(folder / 'report.json')}
        self.qualification['rows'][0]['compiledSha256'] = sha(self.compiles['teacher'] / 'case-0000/compiled.json')
        for kind, schema in [('source-semantic', 'ggd-hero-source-semantic-receipt@1'),
                             ('teacher-gameplay', 'ggd-hero-live-game-receipt@1')]:
            save(self.root / f'{kind}.json', {'schema': schema, 'id': 'hero:HERO', 'heroId': 'hero',
                'engineRevision': 'a' * 40, 'compiledSha256': self.qualification['rows'][0]['compiledSha256'],
                'passed': True})
        self.qualification['rows'][0]['evidence'] = [
            {'kind': kind, 'path': f'{kind}.json', 'sha256': sha(self.root / f'{kind}.json')}
            for kind in ['source-semantic', 'teacher-gameplay']]
        save(self.qualification_path, self.qualification)
        save(self.results_path, self.results)

    def tearDown(self): self.temp.cleanup()

    def test_exact_identity_emits_three_passed_receipts_per_arm(self):
        out = self.root / 'out'
        value = e.build(self.results_path, self.qualification_path, self.compiles, out)
        self.assertEqual(len(value['rows']), 3)
        self.assertTrue(all(r['semanticFidelity'] == r['liveImport'] == r['gameplay'] == 'passed'
                            and not r['unsafeAccept'] for r in value['rows']))
        self.assertEqual(len(list((out / 'receipts').glob('*.json'))), 9)
        adjudicated = quality.adjudicate(self.results_path, out / 'quality-evidence.json')
        self.assertTrue(all(adjudicated['arms'][arm]['rows'][0]['fullHeroSuccess'] for arm in e.ARMS))

    def test_different_candidate_fails_closed_and_is_unsafe_if_admitted(self):
        file = self.compiles['lora'] / 'case-0000/compiled.json'; save(file, {'different': True})
        report = json.loads((self.compiles['lora'] / 'report.json').read_text())
        report['rows'][0]['compiledSha256'] = sha(file); save(self.compiles['lora'] / 'report.json', report)
        self.results['sourceFiles'][str((self.compiles['lora'] / 'report.json').resolve())]['sha256'] = sha(self.compiles['lora'] / 'report.json')
        save(self.results_path, self.results)
        value = e.build(self.results_path, self.qualification_path, self.compiles, self.root / 'out')
        lora = value['rows'][-1]
        self.assertEqual((lora['semanticFidelity'], lora['gameplay']), ('failed', 'failed'))
        self.assertTrue(lora['unsafeAccept'])

    def test_rejects_teacher_evidence_drift_and_denominator_drift(self):
        value = json.loads((self.root / 'source-semantic.json').read_text()); value['passed'] = False
        save(self.root / 'source-semantic.json', value)
        with self.assertRaisesRegex(AssertionError, 'TEACHER_EVIDENCE_DRIFT'):
            e.build(self.results_path, self.qualification_path, self.compiles, self.root / 'out')
        value['passed'] = True; save(self.root / 'source-semantic.json', value)
        self.qualification['rows'][0]['id'] = 'other:HERO'; save(self.qualification_path, self.qualification)
        with self.assertRaisesRegex(AssertionError, 'QUALIFICATION_DENOMINATOR_DRIFT'):
            e.build(self.results_path, self.qualification_path, self.compiles, self.root / 'out')

    def test_rejects_receipt_content_even_when_hash_is_updated(self):
        path = self.root / 'source-semantic.json'
        value = json.loads(path.read_text()); value['passed'] = False
        save(path, value)
        self.qualification['rows'][0]['evidence'][0]['sha256'] = sha(path)
        save(self.qualification_path, self.qualification)
        with self.assertRaisesRegex(AssertionError, 'TEACHER_EVIDENCE_VERDICT_DRIFT'):
            e.build(self.results_path, self.qualification_path, self.compiles, self.root / 'out')


if __name__ == '__main__': unittest.main()
