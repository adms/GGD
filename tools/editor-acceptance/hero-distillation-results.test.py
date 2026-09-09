"""Synthetic report fixtures; no MLX, generation, or teacher answers accessed."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('hero-distillation-' + name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


r, h = module('results'), module('report')


def put(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value))
    return sha(file)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


class ResultsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.train, self.eval, self.paired = [self.root / x for x in ['train', 'eval', 'paired']]
        self.counts = {'tasks': 119, 'primaryWholeHeroes': 17, 'secondarySlots': 102}
        self.cases = [{'id': str(i), 'slot': 'HERO' if i < 17 else 'Q',
                       'messages': [{}, {'content': json.dumps({'request': {'heroName': '<script>alert(1)</script>'}})}]}
                      for i in range(119)]
        plan_sha = put(self.eval / 'plan.json', {'counts': self.counts, 'sourceManifestSha256': 'frozen'})
        public = self.eval / 'public-cases.jsonl'
        public.write_text('\n'.join(json.dumps(c) for c in self.cases))
        self.eval_sha = put(self.eval / 'manifest.json', {'outputs': {'plan.json': plan_sha, 'public-cases.jsonl': sha(public)}})
        manifest_sha = put(self.train / 'manifest.json', {'steps': 500, 'frozenManifestSha256': 'frozen'})
        put(self.train / 'train/state.json', {'status': 'running', 'manifestSha256': manifest_sha})
        self.before = [{'id': c['id'], 'loss': 2.0, 'outputTokens': i + 1} for i, c in enumerate(self.cases)]
        put(self.train / 'train/dev-before.json', self.before)

    def tearDown(self):
        self.temp.cleanup()

    def collect(self):
        return r.collect(self.train, self.eval, self.paired)

    def compilation(self, arm, failed=()):
        value = {'schema': 'ggd-distillation-generation-compile@1', 'evaluationManifestSha256': self.eval_sha,
                 'sourceEvidence': {'arm': arm}, 'rows': [dict(id=c['id'], slot=c['slot'],
                 schemaCompilePassed=i not in failed, diskReloadCompileIdentical=i not in failed,
                 status='passed' if i not in failed else 'failed') for i, c in enumerate(self.cases)]}
        file = self.paired / (arm + '-compile/report.json')
        put(file, value)
        return file, value

    def test_missing_is_null_not_zero_and_html_escapes(self):
        data = self.collect()
        self.assertIsNone(data['training']['devAfterMinusBefore'])
        for arm in data['arms'].values():
            self.assertIsNone(arm['fullHeroSuccess'])
            self.assertIsNone(arm['unsafeAccepts'])
            self.assertIsNone(arm['structuralPassed'])
            self.assertEqual(len(arm['rows']), 17)
        html = h.render(data)
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', html)
        self.assertNotIn('<script>', html)
        self.assertIn('未測，不能當 0', html)
        self.assertIn('本 dev 組須 17/17', html)

    def test_ce_same_cases_weighting_and_delta(self):
        after = copy.deepcopy(self.before)
        for row in after:
            row['loss'] = 1.0
        put(self.train / 'train/dev-after.json', after)
        data = self.collect()
        self.assertEqual(data['training']['devAfterMinusBefore'], {'macroCE': -1, 'tokenWeightedCE': -1})
        self.assertEqual(r.dev_loss([{'id': 'a', 'loss': 1, 'outputTokens': 1},
            {'id': 'b', 'loss': 3, 'outputTokens': 3}], ['a', 'b'])['tokenWeightedCE'], 2.5)
        after[0]['outputTokens'] += 1
        put(self.train / 'train/dev-after.json', after)
        with self.assertRaisesRegex(AssertionError, 'DEV_ANSWER_LENGTH_DRIFT'):
            self.collect()

    def test_bad_metrics_and_case_order_fail(self):
        for loss, tokens in [(float('nan'), 1), (float('inf'), 1), (-1, 1), (1, True), (1, 0)]:
            with self.assertRaises(AssertionError):
                r.dev_loss([{'id': 'a', 'loss': loss, 'outputTokens': tokens}], ['a'])
        put(self.train / 'train/dev-before.json', self.before[::-1])
        with self.assertRaisesRegex(AssertionError, 'DEV_CASE_ORDER_MISMATCH'):
            self.collect()

    def test_paired_hero_changes_do_not_count_aux_slots(self):
        self.compilation('base', failed=(0, 17, 18))
        self.compilation('lora', failed=(1,))
        data = self.collect()
        self.assertEqual(data['pairedStructural'], {'improved': 1, 'regressed': 1})
        self.assertEqual(data['arms']['base']['structuralPassed'], 16)
        self.assertIsNone(data['arms']['base']['packageAdmissionPassed'])

    def test_wrong_compile_slots_and_report_hashes_rejected(self):
        file, value = self.compilation('base')
        value['rows'][0]['slot'] = 'Q'
        put(file, value)
        with self.assertRaisesRegex(AssertionError, 'COMPILE_SLOT_MISMATCH'):
            self.collect()
        self.compilation('base')
        put(self.paired / 'base-package-admission/report.json', {
            'schema': 'ggd-distillation-package-admission@1', 'compiledReportSha256': 'wrong'})
        with self.assertRaisesRegex(AssertionError, 'PACKAGE_COMPILE_DRIFT'):
            self.collect()

    def test_unverified_success_cannot_render_as_pass(self):
        data = self.collect()
        data['arms']['lora']['unsafeAccepts'] = 0
        with self.assertRaisesRegex(AssertionError, 'UNVERIFIED_QUALITY_CANNOT_BE_SCORED'):
            h.render(data)

    def test_duplicate_updates_not_progress(self):
        put(self.train / 'train/training-trace.json', [
            {'step': 1, 'id': 'same'}, {'step': 2, 'id': 'same'}])
        with self.assertRaisesRegex(AssertionError, 'REPEATED_OR_EXCESS_STEPS'):
            self.collect()


if __name__ == '__main__':
    unittest.main()
