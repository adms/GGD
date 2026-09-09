import hashlib
import importlib.util
import json
import copy
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('gate', HERE / 'hero-distillation-release-gate.py')
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, bytes): path.write_bytes(value)
    elif isinstance(value, str): path.write_text(value)
    else: path.write_text(json.dumps(value))


class GateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.training, self.data = self.root / 'training', self.root / 'data'
        put(self.data / 'train.jsonl', json.dumps({'id': 'seen:HERO', 'heroId': 'seen'}) + '\n')
        put(self.data / 'dev.jsonl', json.dumps({'id': 'dev:HERO', 'heroId': 'dev'}) + '\n')
        put(self.data / 'manifest.json', {'schema': 'fixture'})
        data_sha = gate.digest(self.data / 'manifest.json')
        put(self.training / 'manifest.json', {'steps': 2, 'dataDirectory': str(self.data),
                                              'frozenManifestSha256': data_sha})
        training_sha = gate.digest(self.training / 'manifest.json')
        put(self.training / 'train/state.json', {'status': 'completed', 'manifestSha256': training_sha})
        put(self.training / 'train/checkpoint-0002/adapters.safetensors', b'adapter')
        adapter_sha = hashlib.sha256(b'adapter').hexdigest()
        put(self.training / 'train/result.json', {'phase': 'train', 'steps': 2, 'uniqueTrainingTasks': 2,
            'checkpoint': {'path': 'checkpoint-0002', 'sha256': adapter_sha}})
        put(self.training / 'train/adapter-roundtrip.json', {'passed': True})
        put(self.training / 'train/dev-after.json', [])
        self.manifest_key = str((self.training / 'manifest.json').resolve())
        self.manifest_sha = gate.digest(self.training / 'manifest.json')

    def tearDown(self):
        self.tmp.cleanup()

    def result(self, hero, blind):
        row = {'id': hero + ':HERO', 'heroId': hero, 'semanticFidelity': 'passed', 'liveImport': 'passed',
               'gameplay': 'passed', 'fullHeroSuccess': True, 'unsafeAccept': False,
               'supported': True, 'humanRepairs': 0, 'structural': {'structuralPassed': True},
               'package': {'passed': True},
               'isolatedImport': {'passed': True, 'runtimeMatchesAdmission': True}}
        arm = {'rows': [row], 'generation': {'wholeHeroes': {'plannedCases': 1, 'recordedCases': 1,
               'completeOutputs': 1, 'completeJsonOutputs': 1}}, 'structuralPassed': 1,
               'packageAdmissionPassed': 1, 'isolatedImportPassed': 1, 'runtimeVerifiedImports': 1,
               'fullHeroSuccess': 1, 'unsafeAccepts': 0}
        base = {'rows': [dict(row)], 'generation': {'wholeHeroes': {'plannedCases': 1, 'recordedCases': 1}}}
        teacher = {'rows': [dict(row)]}
        return {'schema': 'ggd-distillation-results@1',
                'arms': {'teacher': teacher, 'base': base, 'lora': arm}, 'blindTest': blind, 'fullHeroE2EProven': True,
                'modelPromoted': False,
                'training': {'recordedStatus': 'completed', 'devAfter': {'cases': 1}},
                'counts': {'primaryWholeHeroes': 1, 'tasks': 1},
                'blindProtocol': {'teacherAnswersVisibleToCandidate': False, 'usedForTraining': False,
                    'usedForTuning': False, 'checkpointSelectedBeforeGeneration': True},
                'sourceFiles': {self.manifest_key: {'sha256': self.manifest_sha}}}

    def finalized(self, name, report):
        root=self.root/name; report_path=root/'report-data.json'; put(report_path,report)
        inputs=[]
        for index in range(2):
            path=root/f'inputs/input-{index}.json'; put(path,{'index':index})
            inputs.append({'snapshot':str(path.relative_to(root)),'sha256':gate.digest(path),'bytes':path.stat().st_size})
        artifacts=[]
        expected=3*sum(len(report['arms'][arm]['rows']) for arm in ['teacher','base','lora'])
        for index in range(expected):
            path=root/f'inputs/evidence-artifacts/{index:04d}.json'; put(path,{'index':index})
            artifacts.append({'snapshot':str(path.relative_to(root)),'sha256':gate.digest(path),'bytes':path.stat().st_size})
        scripts={}
        for index in range(3):
            path=root/f'source/script-{index}.py'; put(path,f'# script {index}\n')
            scripts[path.name]={'path':str(path.relative_to(root)),'sha256':gate.digest(path),'bytes':path.stat().st_size}
        manifest={'schema':'ggd-distillation-finalized-evaluation@1','blindTest':report['blindTest'],
            'fullHeroE2EProven':True,'modelPromoted':False,
            'inputs':{f'input-{i}':entry for i,entry in enumerate(inputs)},
            'evidenceArtifacts':artifacts,'scriptSnapshots':scripts,
            'outputs':{'report-data.json':gate.digest(report_path)}}
        put(root/'manifest.json',manifest)
        return root

    def run_gate(self, internal=None, blind=None):
        internal_path=self.finalized('internal-final',internal or self.result('dev',False))
        blind_path=self.finalized('blind-final',blind or self.result('new',True))
        return gate.evaluate(self.training,internal_path,blind_path)

    def scaled_result(self, prefix, blind, count=20, failures=1):
        result = self.result(prefix + '0', blind)
        exemplar = result['arms']['lora']['rows'][0]
        rows = [{**copy.deepcopy(exemplar), 'id': f'{prefix}{i}:HERO', 'heroId': f'{prefix}{i}'} for i in range(count)]
        for row in rows[:failures]:
            row.update(semanticFidelity='failed', liveImport='failed', gameplay='failed', fullHeroSuccess=False)
            row['structural']['structuralPassed'] = False
            row['package']['passed'] = False
            row['isolatedImport'].update(passed=False, runtimeMatchesAdmission=False)
        passed = count - failures
        result['counts'] = {'primaryWholeHeroes': count, 'tasks': count}
        result['training']['devAfter']['cases'] = count
        result['arms']['lora'].update(rows=rows, structuralPassed=passed, packageAdmissionPassed=passed,
                                     isolatedImportPassed=passed, runtimeVerifiedImports=passed,
                                     fullHeroSuccess=passed, unsafeAccepts=0)
        result['arms']['lora']['generation']['wholeHeroes'].update(
            plannedCases=count, recordedCases=count, completeOutputs=count, completeJsonOutputs=count)
        result['arms']['base'] = {'rows': copy.deepcopy(rows),
            'generation': {'wholeHeroes': {'plannedCases': count, 'recordedCases': count}}}
        result['arms']['teacher'] = {'rows': copy.deepcopy(rows)}
        return result

    def test_complete_disjoint_evidence_passes_without_promoting(self):
        result = self.run_gate()
        self.assertTrue(result['passed']); self.assertTrue(result['modelReady'])
        self.assertFalse(result['promotionAllowed'])

    def test_compile_and_ce_cannot_replace_semantic_gameplay_evidence(self):
        internal = self.result('dev', False)
        internal['arms']['lora']['fullHeroSuccess'] = None
        internal['arms']['lora']['unsafeAccepts'] = None
        internal['arms']['lora']['rows'][0].update(semanticFidelity='unverified', gameplay='unverified',
                                                   fullHeroSuccess=None, unsafeAccept=None)
        result = self.run_gate(internal=internal)
        self.assertFalse(result['passed'])
        failed = {x['name'] for x in result['checks'] if not x['passed']}
        self.assertIn('internal-semantic-gameplay-full-hero-success', failed)
        self.assertIn('internal-dangerous-accepts-zero', failed)
        self.assertIn('internal-row-level-evidence', failed)

    def test_blind_overlap_and_protocol_leak_fail(self):
        blind = self.result('seen', True)
        blind['blindProtocol']['teacherAnswersVisibleToCandidate'] = True
        result = self.run_gate(blind=blind)
        failed = {x['name'] for x in result['checks'] if not x['passed']}
        self.assertIn('blind-teacher-withheld', failed)
        self.assertIn('blind-hero-id-disjoint-from-train-and-dev', failed)

    def test_adapter_hash_and_roundtrip_are_required(self):
        put(self.training / 'train/checkpoint-0002/adapters.safetensors', b'tampered')
        put(self.training / 'train/adapter-roundtrip.json', {'passed': False})
        result = self.run_gate()
        failed = {x['name'] for x in result['checks'] if not x['passed']}
        self.assertIn('final-adapter-hash', failed)
        self.assertIn('adapter-roundtrip', failed)

    def test_finalized_report_or_snapshot_drift_is_rejected(self):
        internal=self.finalized('internal-final',self.result('dev',False))
        blind=self.finalized('blind-final',self.result('new',True))
        report=json.loads((internal/'report-data.json').read_text()); report['capturedAt']='changed'
        put(internal/'report-data.json',report)
        result=gate.evaluate(self.training,internal,blind)
        self.assertFalse(result['passed'])
        self.assertIn('internal-finalized-evidence-bundle',
                      {item['name'] for item in result['checks'] if not item['passed']})

    def test_nineteen_of_twenty_meets_95_percent_but_success_needs_e2e(self):
        internal = self.scaled_result('dev-', False)
        blind = self.scaled_result('new-', True)
        self.assertTrue(self.run_gate(internal, blind)['passed'])
        blind['arms']['lora']['rows'][1]['isolatedImport']['runtimeMatchesAdmission'] = False
        result = self.run_gate(internal, blind)
        self.assertFalse(result['passed'])
        self.assertIn('blind-row-level-evidence',
                      {x['name'] for x in result['checks'] if not x['passed']})


if __name__ == '__main__': unittest.main()
