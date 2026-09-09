import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('quality', HERE/'hero-distillation-quality-adjudication.py')
q = importlib.util.module_from_spec(spec); spec.loader.exec_module(q)


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value if isinstance(value, str) else json.dumps(value))


class QualityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        base_row = {'id': 'hero:HERO', 'heroId': 'hero', 'structural': {'structuralPassed': True},
                    'package': {'passed': True},
                    'isolatedImport': {'passed': True, 'runtimeMatchesAdmission': True},
                    'semanticFidelity': 'unverified', 'liveImport': 'unverified', 'gameplay': 'unverified',
                    'fullHeroSuccess': None, 'unsafeAccept': None}
        self.results = {'schema': 'ggd-distillation-results@1', 'blindTest': False, 'modelPromoted': False,
                        'fullHeroE2EProven': False, 'sourceFiles': {},
                        'arms': {arm: {'rows': [copy.deepcopy(base_row)], 'fullHeroSuccess': None,
                                      'unsafeAccepts': None} for arm in q.ARMS}}
        self.results_path = self.root/'results.json'; put(self.results_path, self.results)
        self.evidence_path = self.root/'evidence.json'
        self.rows = []
        for arm in q.ARMS:
            artifacts=[]
            for kind in q.EVIDENCE_KINDS:
                relative=f'artifacts/{arm}-{kind}.json'; put(self.root/relative, {
                    'schema':'ggd-distillation-exact-reference-receipt@1','arm':arm,
                    'id':'hero:HERO','heroId':'hero','verdict':'passed'})
                artifacts.append({'kind': kind, 'path': relative,
                                  'sha256': q.digest(self.root/relative)})
            self.rows.append({'arm': arm, 'id': 'hero:HERO', 'heroId': 'hero', 'supported': True,
                'humanRepairs': 0, 'reviewerInterventions': 1, 'semanticFidelity': 'passed',
                'liveImport': 'passed', 'gameplay': 'passed', 'unsafeAccept': False, 'evidence': artifacts})

    def tearDown(self): self.tmp.cleanup()

    def write_evidence(self):
        put(self.evidence_path, {'schema': 'ggd-distillation-quality-evidence@1',
            'resultsSha256': q.digest(self.results_path), 'blindTest': False, 'rows': self.rows})

    def test_derives_three_arm_success_and_records_review_not_repairs(self):
        self.write_evidence(); result=q.adjudicate(self.results_path,self.evidence_path)
        for arm in q.ARMS:
            self.assertEqual(result['arms'][arm]['fullHeroSuccess'],1)
            self.assertEqual(result['arms'][arm]['unsafeAccepts'],0)
            self.assertTrue(result['arms'][arm]['rows'][0]['fullHeroSuccess'])
        self.assertEqual(result['qualityEvidence']['reviewerInterventions'],3)
        self.assertEqual(result['qualityEvidence']['humanRepairs'],0)
        self.assertIn(str((self.root/'artifacts/teacher-semantic.json').resolve()), result['sourceFiles'])
        self.assertTrue(result['fullHeroE2EProven']); self.assertFalse(result['modelPromoted'])

    def test_repair_missing_runtime_and_unsafe_accept_cannot_be_success(self):
        self.results['arms']['lora']['rows'][0]['isolatedImport']['runtimeMatchesAdmission']=False
        put(self.results_path,self.results)
        self.rows[-1].update(humanRepairs=1,unsafeAccept=True)
        self.write_evidence(); result=q.adjudicate(self.results_path,self.evidence_path)
        self.assertFalse(result['arms']['lora']['rows'][0]['fullHeroSuccess'])
        self.assertEqual(result['arms']['lora']['unsafeAccepts'],1)

    def test_rejects_missing_row_unverified_verdict_and_artifact_drift(self):
        self.write_evidence()
        evidence=json.loads(self.evidence_path.read_text()); evidence['rows'].pop(); put(self.evidence_path,evidence)
        with self.assertRaisesRegex(AssertionError,'QUALITY_ROW_ORDER_OR_DENOMINATOR_DRIFT'):
            q.adjudicate(self.results_path,self.evidence_path)
        self.rows[-1]['semanticFidelity']='unverified'; self.write_evidence()
        with self.assertRaisesRegex(AssertionError,'UNVERIFIED_QUALITY_VERDICT'):
            q.adjudicate(self.results_path,self.evidence_path)
        self.rows[-1]['semanticFidelity']='passed'; self.write_evidence()
        put(self.root/self.rows[-1]['evidence'][0]['path'],{'passed':False})
        with self.assertRaisesRegex(AssertionError,'QUALITY_EVIDENCE_DRIFT'):
            q.adjudicate(self.results_path,self.evidence_path)

    def test_rejects_wrong_receipt_identity_or_verdict_even_with_updated_hash(self):
        item=self.rows[0]['evidence'][0]; path=self.root/item['path']
        artifact=json.loads(path.read_text()); artifact['heroId']='other'; put(path,artifact)
        item['sha256']=q.digest(path); self.write_evidence()
        with self.assertRaisesRegex(AssertionError,'QUALITY_RECEIPT_IDENTITY_DRIFT'):
            q.adjudicate(self.results_path,self.evidence_path)
        artifact['heroId']='hero'; artifact['verdict']='failed'; put(path,artifact)
        item['sha256']=q.digest(path); self.write_evidence()
        with self.assertRaisesRegex(AssertionError,'QUALITY_RECEIPT_VERDICT_DRIFT'):
            q.adjudicate(self.results_path,self.evidence_path)


if __name__ == '__main__': unittest.main()
