import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('match_batch', HERE / 'hero-distillation-match-batch.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class MatchBatchTests(unittest.TestCase):
    def fixture(self, root, skipped=False):
        e2e, evaluation = root / 'e2e', root / 'evaluation'
        e2e.mkdir(); evaluation.mkdir()
        m.write(evaluation / 'public-heroes.json', {'heroes': [{'heroId': 'a'}, {'heroId': 'b'}]})
        m.write(evaluation / 'manifest.json', {'heroes': 2, 'publicHeroesSha256': m.digest(evaluation / 'public-heroes.json')})
        m.write(e2e / 'manifest.json', {'schema': 'ggd-action-e2e@1', 'evaluationDirectory': str(evaluation),
            'evaluationManifestSha256': m.digest(evaluation / 'manifest.json')})
        m.write(e2e / 'result.json', {'schema': 'ggd-action-e2e-result@1', 'skipped': skipped, 'skipReason': 'INCOMPLETE_HERO_PLANS'})
        m.write(e2e / 'state.json', {'status': 'completed'})
        for arm in ['base', 'lora']:
            package, imported, audit = [e2e / f'{arm}-{name}' for name in ['package', 'import', 'runtime-audit']]
            for folder in [package, imported, audit]: folder.mkdir()
            m.write(package / 'case-0000.json', {})
            (imported / 'case-0000').mkdir(); (imported / 'case-0000/hero.zip').write_bytes(b'archive fixture')
            sha = m.digest(imported / 'case-0000/hero.zip')
            m.write(package / 'report.json', {'rows': [{'heroId': 'a', 'artifact': 'case-0000.json',
                'artifactSha256': m.digest(package / 'case-0000.json')}, {'heroId': 'b'}]})
            m.write(imported / 'report.json', {'admittedReportSha256': m.digest(package / 'report.json'),
                'rows': [{'id': 'a', 'heroId': 'a', 'liveImportPassed': True, 'archiveSha256': sha},
                         {'id': 'b', 'heroId': 'b', 'liveImportPassed': False}]})
            m.write(audit / 'report.json', {'importReportSha256': m.digest(imported / 'report.json'),
                'admittedReportSha256': m.digest(package / 'report.json'),
                'rows': [{'id': 'a', 'runtimeMatchesAdmission': True, 'archiveSha256': sha}, {'id': 'b', 'runtimeMatchesAdmission': None}]})
        return {'e2e': str(e2e), 'out': str(root / 'out'), 'node_binary': 'node', 'source_repo': str(HERE.parents[1]),
                'game_dependencies': 'unused', 'shared_dependencies': 'unused'}

    def launch(self, argv, log, timeout):
        out = Path(argv[argv.index('--out') + 1]); out.mkdir()
        m.write(out / 'report.json', {'heroId': argv[argv.index('--hero-id') + 1],
            'archiveSha256': m.digest(argv[argv.index('--zip') + 1]), 'scriptSha256': m.digest(m.ENTRY),
            'status': 'entry-passed-not-mechanism-acceptance', 'selectionPassed': True, 'spawnPassed': True,
            'combatEntryPassed': True, 'unknownSelectionRejected': True})
        return 0

    def test_only_audited_candidates_run_full_denominator_remains(self):
        with tempfile.TemporaryDirectory() as tmp:
            options = self.fixture(Path(tmp)); calls = []
            def run(argv, log, timeout): calls.append(argv); return self.launch(argv, log, timeout)
            result = m.run(options, run)
            self.assertEqual(len(calls), 2)
            for arm in result['arms'].values():
                self.assertEqual((arm['wholeHeroes'], arm['entryPassed'], arm['unpassed']), (2, 1, 1))
                self.assertEqual(arm['rows'][1]['status'], 'blocked-by-import-or-runtime-audit')
            self.assertFalse(result['fullHeroE2EProven'])

    def test_generation_skip_runs_no_case(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = m.run(self.fixture(Path(tmp), True), lambda *args: self.fail('must not run'))
            self.assertEqual(result['arms']['base']['wholeHeroes'], 2)
            self.assertEqual(result['arms']['lora']['entryPassed'], 0)

    def test_case_exception_does_not_retry_or_drop_other_arm(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def fail(*args): calls.append(args); raise TimeoutError('bounded test timeout')
            result = m.run(self.fixture(Path(tmp)), fail)
            self.assertEqual(len(calls), 2)
            self.assertEqual(result['arms']['base']['entryPassed'], 0)
            self.assertEqual(result['arms']['lora']['rows'][0]['status'], 'check-execution-failed')

    def test_nonzero_exit_cannot_claim_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            def nonzero(*args): self.launch(*args); return 1
            result = m.run(self.fixture(Path(tmp)), nonzero)
            self.assertEqual(result['arms']['base']['entryPassed'], 0)

    def test_changed_archive_is_rejected_before_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); options = self.fixture(root)
            (root / 'e2e/base-import/case-0000/hero.zip').write_bytes(b'changed')
            with self.assertRaisesRegex(AssertionError, 'AUDITED_ARCHIVE_DRIFT'):
                m.run(options, lambda *args: self.fail('must not run'))
            self.assertEqual(m.read(root / 'out/report.json')['status'], 'stopped-or-failed')


if __name__ == '__main__': unittest.main()
