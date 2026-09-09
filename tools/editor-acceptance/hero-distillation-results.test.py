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
        self.data = self.root / 'data'
        put(self.data / 'manifest.json', {'schema': 'fixture-dataset'})
        self.frozen_sha = sha(self.data / 'manifest.json')
        (self.data / 'train.jsonl').write_text(json.dumps({'id': 'seen:HERO', 'heroId': 'seen'}) + '\n')
        (self.data / 'dev.jsonl').write_text(json.dumps({'id': 'dev:HERO', 'heroId': 'dev'}) + '\n')
        self.counts = {'tasks': 119, 'primaryWholeHeroes': 17, 'secondarySlots': 102}
        self.cases = [{'id': str(i) + ':HERO' if i < 17 else str(i) + ':Q',
                       'heroId': str(i), 'slot': 'HERO' if i < 17 else 'Q',
                       'messagesSha256': 'message-' + str(i),
                       'messages': [{}, {'content': json.dumps({'request': {'heroName': '<script>alert(1)</script>'}})}]}
                      for i in range(119)]
        plan_sha = put(self.eval / 'plan.json', {'counts': self.counts, 'sourceManifestSha256': self.frozen_sha,
                                                  'split': 'internal-dev', 'blindTest': False})
        public = self.eval / 'public-cases.jsonl'
        public.write_text('\n'.join(json.dumps(c) for c in self.cases))
        self.eval_sha = put(self.eval / 'manifest.json', {'sourceManifestSha256': self.frozen_sha,
            'outputs': {'plan.json': plan_sha, 'public-cases.jsonl': sha(public)}})
        manifest_sha = put(self.train / 'manifest.json', {'steps': 500, 'frozenManifestSha256': self.frozen_sha,
                                                           'dataDirectory': str(self.data)})
        put(self.train / 'train/state.json', {'status': 'running', 'manifestSha256': manifest_sha})
        self.before = [{'id': c['id'], 'loss': 2.0, 'outputTokens': i + 1} for i, c in enumerate(self.cases)]
        put(self.train / 'train/dev-before.json', self.before)

    def tearDown(self):
        self.temp.cleanup()

    def collect(self):
        return r.collect(self.train, self.eval, self.paired)

    def make_blind(self, overlap=None):
        cases = copy.deepcopy(self.cases)
        if overlap:
            cases[0]['id'] = overlap + ':HERO'; cases[0]['heroId'] = overlap
        public = self.eval / 'public-cases.jsonl'
        public.write_text('\n'.join(json.dumps(c) for c in cases))
        protocol = {'teacherAnswersVisibleToCandidate': False, 'usedForTraining': False,
                    'usedForTuning': False, 'checkpointSelectedBeforeGeneration': True}
        plan_sha = put(self.eval / 'plan.json', {'counts': self.counts, 'sourceManifestSha256': 'blind-source',
            'trainingFrozenManifestSha256': self.frozen_sha, 'split': 'blind-user-batch', 'blindTest': True,
            'blindProtocol': protocol})
        self.eval_sha = put(self.eval / 'manifest.json', {'sourceManifestSha256': 'blind-source',
            'outputs': {'plan.json': plan_sha,
            'public-cases.jsonl': sha(public)}})
        return protocol

    def compilation(self, arm, failed=()):
        value = {'schema': 'ggd-distillation-generation-compile@1', 'evaluationManifestSha256': self.eval_sha,
                 'sourceEvidence': {'arm': arm}, 'rows': [dict(id=c['id'], slot=c['slot'],
                 schemaCompilePassed=i not in failed, diskReloadCompileIdentical=i not in failed,
                 status='passed' if i not in failed else 'failed') for i, c in enumerate(self.cases)]}
        file = self.paired / (arm + '-compile/report.json')
        put(file, value)
        return file, value

    def imported_fixture(self):
        compiled, _ = self.compilation('base')
        package_sha = put(self.paired / 'base-package-admission/report.json', {
            'schema': 'ggd-distillation-package-admission@1', 'compiledReportSha256': sha(compiled),
            'rows': [{'id': self.cases[i]['id'], 'packageAdmissionPassed': True, 'status': 'passed'} for i in range(17)]})
        imported = {'schema': 'ggd-distillation-import-roundtrip@1', 'admittedReportSha256': package_sha,
            'rows': [{'id': self.cases[i]['id'], 'liveImportPassed': i < 14,
                      'status': 'passed' if i < 14 else 'not-passed'} for i in range(17)]}
        import_sha = put(self.paired / 'base-import-roundtrip/report.json', imported)
        audit = {'schema': 'ggd-distillation-import-runtime-audit@1', 'admittedReportSha256': package_sha,
            'importReportSha256': import_sha,
            'rows': [{'id': self.cases[i]['id'], 'runtimeMatchesAdmission': True if i < 14 else None} for i in range(17)]}
        put(self.paired / 'base-import-runtime-audit/report.json', audit)
        return audit

    def test_isolated_import_never_upgrades_full_game_success(self):
        self.imported_fixture()
        data = self.collect()
        arm = data['arms']['base']
        self.assertEqual(arm['isolatedImportPassed'], 14)
        self.assertEqual(arm['runtimeVerifiedImports'], 14)
        self.assertIsNone(arm['fullHeroSuccess'])
        self.assertTrue(all(r['gameplay'] == 'unverified' for r in arm['rows']))
        self.assertIn('隔離匯入通過不等於平台選角', h.render(data))

    def test_runtime_audit_cannot_pass_unimported_hero(self):
        audit = self.imported_fixture()
        audit['rows'][-1]['runtimeMatchesAdmission'] = True
        put(self.paired / 'base-import-runtime-audit/report.json', audit)
        with self.assertRaisesRegex(AssertionError, 'RUNTIME_AUDIT_PASSED_WITHOUT_IMPORT'):
            self.collect()

    def test_runtime_audit_must_bind_exact_import_report(self):
        audit = self.imported_fixture()
        audit['importReportSha256'] = 'wrong'
        put(self.paired / 'base-import-runtime-audit/report.json', audit)
        with self.assertRaisesRegex(AssertionError, 'AUDIT_IMPORT_DRIFT'):
            self.collect()

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

    def test_blind_batch_is_separate_disjoint_and_preserves_protocol(self):
        protocol = self.make_blind()
        data = self.collect()
        self.assertTrue(data['blindTest'])
        self.assertEqual(data['blindProtocol'], protocol)
        self.make_blind('seen')
        with self.assertRaisesRegex(AssertionError, 'BLIND_HERO_OVERLAP:seen'):
            self.collect()

    def test_blind_batch_cannot_reuse_training_manifest_or_leak_teacher(self):
        self.make_blind()
        plan = json.loads((self.eval / 'plan.json').read_text())
        plan['sourceManifestSha256'] = self.frozen_sha
        plan_sha = put(self.eval / 'plan.json', plan)
        put(self.eval / 'manifest.json', {'sourceManifestSha256': self.frozen_sha,
            'outputs': {'plan.json': plan_sha,
            'public-cases.jsonl': sha(self.eval / 'public-cases.jsonl')}})
        with self.assertRaisesRegex(AssertionError, 'BLIND_REUSES_TRAINING_DATASET'):
            self.collect()
        self.make_blind()
        plan = json.loads((self.eval / 'plan.json').read_text())
        plan['blindProtocol']['teacherAnswersVisibleToCandidate'] = True
        plan_sha = put(self.eval / 'plan.json', plan)
        put(self.eval / 'manifest.json', {'sourceManifestSha256': 'blind-source',
            'outputs': {'plan.json': plan_sha,
            'public-cases.jsonl': sha(self.eval / 'public-cases.jsonl')}})
        with self.assertRaisesRegex(AssertionError, 'INVALID_BLIND_PROTOCOL'):
            self.collect()

    def test_blind_teacher_control_must_be_completed_and_bound_to_derived_view(self):
        self.make_blind(); root = self.root / 'teacher-control'; derived = root / 'evaluation'
        put(derived / 'manifest.json', {'originalEvaluationManifestSha256': self.eval_sha})
        derived_sha = sha(derived / 'manifest.json')
        put(root / 'manifest.json', {'schema': 'ggd-distillation-blind-teacher-control@1', 'blindTest': True,
            'originalEvaluationManifestSha256': self.eval_sha, 'derivedEvaluationManifestSha256': derived_sha})
        put(root / 'state.json', {'status': 'completed'})
        teacher_compile = {'schema': 'ggd-distillation-generation-compile@1',
            'evaluationManifestSha256': derived_sha, 'sourceEvidence': {'arm': 'teacher-control'},
            'rows': [dict(id=c['id'], slot=c['slot'], schemaCompilePassed=True,
                          diskReloadCompileIdentical=True, status='passed') for c in self.cases]}
        compile_sha = put(root / 'compile/report.json', teacher_compile)
        outputs = {'compile/report.json': compile_sha}
        put(root / 'result.json', {'schema': 'ggd-distillation-blind-teacher-control-result@1',
                                   'outputs': outputs})
        data = r.collect(self.train, self.eval, self.paired, teacher_control=root)
        self.assertEqual(data['arms']['teacher']['structuralPassed'], 17)
        self.assertEqual(data['blindTeacherControl']['path'], str(root.resolve()))
        manifest = json.loads((root / 'manifest.json').read_text()); manifest['originalEvaluationManifestSha256'] = 'bad'; put(root / 'manifest.json', manifest)
        with self.assertRaisesRegex(AssertionError, 'BLIND_TEACHER_ORIGINAL_EVAL_DRIFT'):
            r.collect(self.train, self.eval, self.paired, teacher_control=root)

    def test_blind_teacher_reports_cannot_bypass_sealed_control(self):
        self.make_blind(); teacher = self.root / 'teacher'; put(teacher / 'report.json', {})
        with self.assertRaisesRegex(AssertionError, 'BLIND_TEACHER_REQUIRES_SEALED_CONTROL'):
            r.collect(self.train, self.eval, self.paired, teacher_compile=teacher)

    def test_generation_cost_keeps_partial_outputs_and_missing_tokens(self):
        cases = [{'id': str(i), 'slot': 'HERO' if i < 2 else 'Q'} for i in range(3)]
        records = [dict(c, seconds=s, promptTokens=100, generationTokens=t, peakMetalBytes=1000,
            attempts=1, humanRepairs=0, complete=i < 2, json={'parsed': i == 0})
            for i, (c, s, t) in enumerate(zip(cases, [2, 4, 10], [20, 40, None]))]
        result = r.generation_stats(records, cases)
        self.assertEqual(result['all']['p95GenerationCallSeconds'], 10)
        self.assertEqual(result['all']['generationCallSeconds'], 16)
        self.assertEqual(result['all']['completeOutputs'], 2)
        self.assertEqual(result['all']['completeJsonOutputs'], 1)
        self.assertIsNone(result['all']['effectiveOutputTokensPerGenerationSecond'])
        self.assertEqual(result['wholeHeroes']['effectiveOutputTokensPerGenerationSecond'], 10)
        self.assertEqual(result['auxiliarySlots']['missingGenerationTokenCounts'], 1)
        self.assertIsNone(result['ttftSeconds'])
        self.assertIsNone(result['decodeOnlyTokensPerSecond'])
        records[0]['seconds'] = 0
        with self.assertRaisesRegex(AssertionError, 'INVALID_GENERATION_SECONDS'):
            r.generation_stats(records, cases)

    def test_inference_raw_and_index_are_bound_before_metrics(self):
        folder = self.paired / 'inference'
        put(folder / 'manifest.json', {'schema': 'ggd-distillation-protected-inference@1',
            'evaluationManifestSha256': self.eval_sha, 'trainingManifestSha256': sha(self.train / 'manifest.json'),
            'caseIds': [c['id'] for c in self.cases], 'decoding': {'max_tokens': 100},
            'blindTest': False, 'blindProtocol': None})
        record = {'id': '0:HERO', 'slot': 'HERO', 'arm': 'base', 'decoding': {'max_tokens': 100},
            'messagesSha256': 'message-0', 'raw': '{}', 'rawSha256': hashlib.sha256(b'{}').hexdigest(),
            'seconds': 2, 'promptTokens': 100, 'generationTokens': 10, 'peakMetalBytes': 1000,
            'attempts': 1, 'humanRepairs': 0, 'complete': True, 'finishReason': 'stop', 'error': None,
            'outputFormatMatches': True, 'json': {'parsed': True}}
        index = [{k: record[k] for k in ['id', 'complete', 'outputFormatMatches', 'seconds']}]
        put(folder / 'base/case-0000.json', record)
        put(folder / 'base/index.json', index)
        data = self.collect()
        self.assertEqual(data['arms']['base']['generation']['all']['recordedCases'], 1)
        self.assertEqual(data['arms']['base']['generation']['wholeHeroes']['plannedCases'], 17)
        self.assertIsNone(data['arms']['lora']['generation'])
        self.assertIsNone(data['arms']['base']['fullHeroSuccess'])
        index[0]['seconds'] = 1
        put(folder / 'base/index.json', index)
        with self.assertRaisesRegex(AssertionError, 'GENERATION_INDEX_DRIFT'):
            self.collect()

    def test_generation_cost_rejects_nan_negative_memory_and_retries(self):
        case = {'id': '0', 'slot': 'HERO'}
        row = dict(case, seconds=1, promptTokens=1, generationTokens=1, peakMetalBytes=1,
            attempts=1, humanRepairs=0, complete=True, json={'parsed': True})
        for key, value in [('seconds', float('nan')), ('peakMetalBytes', -1), ('attempts', 2), ('attempts', True), ('humanRepairs', False), ('generationTokens', True)]:
            with self.assertRaises(AssertionError):
                r.generation_stats([{**row, key: value}], [case])

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
