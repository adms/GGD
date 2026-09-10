import importlib.util
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_generation', ROOT / 'tools/editor-acceptance/hero-distillation-action-generation.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        return '|'.join(message['content'] for message in messages)
    def encode(self, text, **kwargs):
        return list(range(len(text)))


class Item:
    def __init__(self, text):
        self.text, self.finish_reason, self.generation_tokens = text, 'stop', 10


class ActionGenerationTest(unittest.TestCase):
    def test_action_queue_uses_own_prior_shapes(self):
        state = {'queue': [[]], 'root': None, 'accepted': 0}
        for answer in [
            {'format': 'forge-next-json-action@1', 'op': 'shape', 'value': {'kind': 'object', 'keys': ['effects']}},
            {'format': 'forge-next-json-action@1', 'op': 'shape', 'value': {'kind': 'array', 'length': 1}},
            {'format': 'forge-next-json-action@1', 'op': 'value', 'value': {'kind': 'damage', 'amount': 10}},
        ]:
            state = M.apply_action(state, answer)
        self.assertEqual(state['queue'], [])
        self.assertEqual(state['root'], {'effects': [{'kind': 'damage', 'amount': 10}]})

    def test_teacher_trace_can_drive_full_action_pipeline_without_teacher_plan_argument(self):
        root = ROOT / 'docs/_reports/hero-finetune-research'
        atomic = json.loads((root / 'hero74-action-v3/examples.json').read_text())
        compact = json.loads((root / 'hero74-compact-v8/examples.json').read_text())
        hero_id = 'community-review-01-20260907'
        rows = [row for row in atomic if row['heroId'] == hero_id]
        by_stage = {}
        for row in rows:
            by_stage.setdefault(row['stage'], []).append(row)
        source = next(row for row in compact if row['heroId'] == hero_id and row['slot'] == 'HERO')
        source_input = json.loads(source['messages'][1]['content'])
        identity = by_stage['identity'][0]
        identity_input = json.loads(identity['messages'][1]['content'])
        values = [identity['messages'][2]['content']]
        for slot in M.SLOTS:
            values.append(by_stage[f'selection:{slot}'][0]['messages'][2]['content'])
        for slot in M.SLOTS:
            values.append(by_stage[f'core:{slot}'][0]['messages'][2]['content'])
            values.extend(row['messages'][2]['content'] for row in by_stage[f'core-action:{slot}'])
            core = json.loads(by_stage[f'core:{slot}'][0]['messages'][2]['content'])
            for index in range(len(core['productTemplates'])):
                values.extend(row['messages'][2]['content'] for row in by_stage[f'action:{slot}:{index}'])
        values = iter(values)
        systems = {stage: by_stage[stage][0]['messages'][0]['content'] for stage in by_stage if stage.split(':')[0] in ['selection', 'core', 'action', 'core-action']}
        case = {'heroId': hero_id, 'heroName': source_input['request']['heroName'], 'request': identity_input['request'],
                'decisionSpace': identity_input['decisionSpace'],
                'assetBinding': json.loads((root / 'hero74-compact-v8/asset-bindings.json').read_text())[hero_id],
                'identityMessages': identity['messages'][:2], 'selectionSystem': systems['selection:PASSIVE'],
                'coreSystem': systems['core:PASSIVE'], 'actionSystem': systems['core-action:PASSIVE'],
                'detailedCatalog': json.loads((root / 'hero74-compact-v8/parameter-catalog.json').read_text())}
        records = []
        def factory(prompt, ids, settings):
            self.assertEqual(settings, M.decoding_contract())
            return iter([Item(next(values))])
        result = M.generate_hero(case, ROOT / 'tools/editor-acceptance/hero-distillation-action-runtime-cli.mjs', Tokenizer(), factory,
                                 lambda *args, **kwargs: None, records.append)
        self.assertEqual(result['target']['format'], 'hero-plan')
        self.assertEqual(set(result['target']['plan']['slots']), set(M.SLOTS))
        self.assertFalse(result['fullHeroE2EProven'])
        with self.assertRaises(StopIteration):
            next(values)
        # The bounded action protocol must feed the real Main materializer and
        # compiler without a teacher plan or repair step.  This is a fixture
        # target only; it is not model-quality or gameplay evidence.
        with tempfile.TemporaryDirectory() as temp:
            evaluation = Path(temp) / 'evaluation'; arm = evaluation / 'base'
            (arm / 'heroes').mkdir(parents=True)
            public = {'schema': 'ggd-action-public-evaluation@1', 'split': 'fixture',
                      'heroes': [{'heroId': hero_id, 'heroName': case['heroName'], 'decisionSpace': case['decisionSpace']}],
                      'teacherAccess': 'fixture action output is not a model prompt'}
            public_bytes = (json.dumps(public, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
            (evaluation / 'public-heroes.json').write_bytes(public_bytes)
            (evaluation / 'manifest.json').write_text(json.dumps({'schema': 'ggd-action-protected-evaluation@1',
                'modelDirectory': 'fixture', 'trainingDirectory': 'fixture', 'publicHeroesSha256': hashlib.sha256(public_bytes).hexdigest(),
                'heroes': 1}) + '\n')
            (arm / 'state.json').write_text(json.dumps({'status': 'completed', 'workerPid': None}) + '\n')
            (arm / 'result.json').write_text(json.dumps({'attemptedHeroes': 1}) + '\n')
            (arm / 'hero-index.json').write_text(json.dumps([{'heroId': hero_id, 'status': 'complete'}]) + '\n')
            (arm / 'heroes' / (hero_id + '.json')).write_text(json.dumps({'heroId': hero_id, 'status': 'complete',
                'target': result['target'], 'targetSha256': result['targetSha256']}) + '\n')
            compiled = Path(temp) / 'compiled'
            process = subprocess.run(['node', '--import', 'tsx', str(ROOT / 'tools/editor-acceptance/hero-distillation-action-compile.mts'),
                '--evaluation', str(evaluation), '--models', str(root / 'hero74-model-bindings-v1'),
                '--source-repo', str(ROOT), '--out', str(compiled), '--arm', 'base'], cwd=ROOT, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            self.assertEqual(process.returncode, 0, process.stderr)
            report = json.loads((compiled / 'report.json').read_text())
            self.assertEqual(report['counts']['primaryWholeHeroes'], 1)
            self.assertEqual(report['counts']['structuralPassed'], 1)


if __name__ == '__main__':
    unittest.main()
