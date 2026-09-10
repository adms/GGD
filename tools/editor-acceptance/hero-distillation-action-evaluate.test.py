import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('action_evaluate', ROOT / 'tools/editor-acceptance/hero-distillation-action-evaluate.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class ActionEvaluateTest(unittest.TestCase):
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
                                                        'detailedCatalog'})


if __name__ == '__main__':
    unittest.main()
