import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('compact_evaluate', ROOT / 'tools/editor-acceptance/hero-distillation-compact-evaluate.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class CompactEvaluationTest(unittest.TestCase):
    def test_public_dev_bundle_has_no_teacher_answer_and_keeps_six_slot_chain(self):
        heroes = M.public_heroes(ROOT / 'docs/_reports/hero-finetune-research/hero74-compact-v8')
        self.assertEqual(len(heroes), 15)
        self.assertTrue(all([message['role'] for message in hero['selectionMessages']] == ['system', 'user'] for hero in heroes))
        self.assertTrue(all(set(hero) == {'heroId', 'heroName', 'request', 'selectionMessages', 'configurationSystem', 'assetBinding'} for hero in heroes))
        public = json.dumps({'heroes': heroes}, ensure_ascii=False, separators=(',', ':'))
        self.assertNotIn('"role":"assistant"', public)
        self.assertNotIn('forge-config-delta@1', public)


if __name__ == '__main__':
    unittest.main()
