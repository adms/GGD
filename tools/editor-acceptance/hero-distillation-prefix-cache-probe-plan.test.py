import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location('probe_plan', Path(__file__).with_name(
    'hero-distillation-prefix-cache-probe-plan.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class ProbePlanTests(unittest.TestCase):
    def fixture(self, root):
        source = root/'source'; source.mkdir()
        rows = [{'id':'a:HERO','heroId':'a','slot':'HERO'}, {'id':'a:Q','heroId':'a','slot':'Q'},
                {'id':'b:HERO','heroId':'b','slot':'HERO'}]
        public = ''.join(json.dumps(row)+'\n' for row in rows)
        (source/'public-cases.jsonl').write_text(public)
        (source/'private-teachers.jsonl').write_text('{}\n')
        (source/'plan.json').write_text(json.dumps({'sourceManifestSha256':'dataset',
            'arms':{'base':{},'lora':{}}}))
        outputs = {name:p.digest(source/name) for name in ['public-cases.jsonl','private-teachers.jsonl','plan.json']}
        (source/'manifest.json').write_text(json.dumps({'schema':'ggd-distillation-evaluation-inputs@1',
            'outputs':outputs}))
        return source

    def test_freezes_adjacent_pair_without_teacher(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=self.fixture(root); out=root/'out'
            plan=p.build(source,out)
            self.assertEqual(plan['primaryCaseIds'],['a:HERO'])
            self.assertEqual(plan['secondaryCaseIds'],['a:Q'])
            self.assertFalse((out/'private-teachers.jsonl').exists())
            self.assertFalse(plan['scoring']['qualityScoringEnabled'])
            self.assertEqual(json.loads((out/'manifest.json').read_text())['sourceManifestSha256'],
                             'dataset')
            with self.assertRaisesRegex(AssertionError,'NEW_PROBE_PLAN'):
                p.build(source,out)

    def test_rejects_source_drift_or_wrong_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=self.fixture(root)
            (source/'public-cases.jsonl').write_text('changed')
            with self.assertRaisesRegex(AssertionError,'SOURCE_EVALUATION_DRIFT'):
                p.build(source,root/'out')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=self.fixture(root)
            rows=[{'id':'a:HERO','heroId':'a','slot':'HERO'},{'id':'b:Q','heroId':'b','slot':'Q'}]
            (source/'public-cases.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in rows))
            manifest=json.loads((source/'manifest.json').read_text())
            manifest['outputs']['public-cases.jsonl']=p.digest(source/'public-cases.jsonl')
            (source/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(AssertionError,'PROBE_REQUIRES'):
                p.build(source,root/'out')


if __name__ == '__main__': unittest.main()
