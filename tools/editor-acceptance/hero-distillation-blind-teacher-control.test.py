"""CPU controller tests use fake stage reports and never start services."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('control', HERE / 'hero-distillation-blind-teacher-control.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value if isinstance(value, str) else json.dumps(value))


class BlindTeacherControlTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.options = {key: str(self.root / key) for key in ['evaluation', 'seal', 'models', 'assets', 'dependencies', 'source_repo', 'out']}
        evaluation, seal = Path(self.options['evaluation']), Path(self.options['seal'])
        case = {'id': 'new:HERO', 'heroId': 'new', 'slot': 'HERO'}
        public = json.dumps(case) + '\n'; put(evaluation / 'public-cases.jsonl', public)
        plan = {'split': 'blind-user-batch', 'blindTest': True, 'sourceManifestSha256': 'source',
                'counts': {'tasks': 1, 'primaryWholeHeroes': 1}}
        put(evaluation / 'plan.json', plan)
        put(evaluation / 'manifest.json', {'outputs': {'public-cases.jsonl': c.digest(evaluation / 'public-cases.jsonl'),
            'plan.json': c.digest(evaluation / 'plan.json')}})
        teachers = json.dumps({'id': 'new:HERO', 'answer': '{}'}) + '\n'; put(seal / 'private-teachers.jsonl', teachers)
        put(seal / 'manifest.json', {'schema': 'ggd-distillation-blind-teacher-seal@1', 'blindTest': True,
            'evaluationManifestSha256': c.digest(evaluation / 'manifest.json'),
            'publicCasesSha256': c.digest(evaluation / 'public-cases.jsonl'),
            'outputs': {'private-teachers.jsonl': c.digest(seal / 'private-teachers.jsonl')}})
        for key in ['models', 'assets']: put(Path(self.options[key]) / 'manifest.json', {'fixture': key})
        Path(self.options['dependencies']).mkdir(); Path(self.options['source_repo']).mkdir()
        self.options['asset_roots'] = [self.options['assets']]
        self.options['api_dependencies'] = str(self.root / 'api')
        for name in ['fastify', 'tsx']: put(Path(self.options['api_dependencies']) / name / 'package.json', {})
        self.commands = []

    def tearDown(self): self.temp.cleanup()

    def execute(self, command, log):
        self.commands.append(command); out = Path(command[command.index('--out') + 1])
        if 'generation-compile' in command[3]:
            evaluation = Path(command[command.index('--evaluation') + 1])
            put(out / 'report.json', {'evaluationManifestSha256': c.digest(evaluation / 'manifest.json'),
                'counts': {'allCases': 1, 'primaryWholeHeroes': 1}})
        else:
            put(out / 'report.json', {'counts': {'wholeHeroes': 1}})

    def test_runs_four_teacher_control_stages_after_seal(self):
        state = c.run(self.options, self.execute); out = Path(self.options['out'])
        self.assertEqual(state['status'], 'completed')
        self.assertEqual([row['name'] for row in state['steps']], ['compile-teacher', 'package-admission-teacher',
            'isolated-import-teacher', 'verify-import-runtime-teacher'])
        self.assertIn('--teacher-control', self.commands[0])
        self.assertEqual(c.read(out / 'result.json')['modelInferenceCalls'], 0)
        self.assertTrue(c.read(out / 'manifest.json')['blindTest'])
        self.assertEqual(c.read(out / 'evaluation/manifest.json')['teacherSealManifestSha256'], c.digest(Path(self.options['seal']) / 'manifest.json'))

    def test_rejects_unbound_seal_before_output(self):
        seal = Path(self.options['seal']) / 'manifest.json'; value = c.read(seal); value['evaluationManifestSha256'] = 'bad'; put(seal, value)
        with self.assertRaisesRegex(AssertionError, 'TEACHER_SEAL_EVALUATION_DRIFT'):
            c.run(self.options, self.execute)
        self.assertFalse(Path(self.options['out']).exists())

    def test_stage_failure_is_terminal_without_retry(self):
        def fail(command, log):
            if 'package-admission' in command[3]: raise RuntimeError('PACKAGE_FAIL')
            self.execute(command, log)
        with self.assertRaisesRegex(RuntimeError, 'PACKAGE_FAIL'):
            c.run(self.options, fail)
        state = c.read(Path(self.options['out']) / 'state.json')
        self.assertEqual(state['status'], 'stopped-or-failed')
        self.assertEqual([row['name'] for row in state['steps']], ['compile-teacher', 'package-admission-teacher'])
        self.assertFalse((Path(self.options['out']) / 'result.json').exists())


if __name__ == '__main__': unittest.main()
