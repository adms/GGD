import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('batch_verify', Path(__file__).with_name('verify-authoring-batch.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class BatchVerifierTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.a = self.root / 'a'; self.a.mkdir()
        self.b = self.root / 'b'; self.b.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def job(self, code):
        return {'id': 'check', 'argv': [sys.executable, '-c', code]}

    def run_job(self, job, previous=None, fingerprint='source-v1', timeout=10):
        return v.run_job(job, self.b if previous else self.a, fingerprint, dict(os.environ), timeout,
                         {'check': previous} if previous else None, self.a if previous else None)

    def test_success_reuses_only_verified_log(self):
        counter = self.root / 'runs'
        job = self.job(f"from pathlib import Path;p=Path({str(counter)!r});p.write_text(p.read_text()+'x' if p.exists() else 'x');print('ok')")
        first = self.run_job(job)
        second = self.run_job(job, first)
        self.assertTrue(second['reused']); self.assertEqual(counter.read_text(), 'x')
        (self.a / first['log']).write_text('tampered')
        third = self.run_job(job, first)
        self.assertFalse(third['reused']); self.assertEqual(counter.read_text(), 'xx')

    def test_changed_source_or_command_cannot_reuse_success(self):
        job = self.job("print('ok')")
        first = self.run_job(job)
        self.assertFalse(self.run_job(job, first, 'source-v2')['reused'])
        self.assertFalse(self.run_job(self.job("print('different')"), first)['reused'])

    def test_failed_job_runs_again(self):
        flag = self.root / 'ready'
        job = self.job(f"from pathlib import Path;raise SystemExit(0 if Path({str(flag)!r}).exists() else 1)")
        first = self.run_job(job); self.assertEqual(first['exitCode'], 1)
        flag.touch()
        second = self.run_job(job, first)
        self.assertEqual(second['exitCode'], 0); self.assertFalse(second['reused'])

    def test_fingerprint_detects_dirty_files_and_external_batch_changes(self):
        repo = self.root / 'repo'; repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        (repo / 'code.py').write_text('one')
        subprocess.run(['git', 'add', 'code.py'], cwd=repo, check=True)
        (self.a / 'input.json').write_text('{"v":1}')
        first = v.source_fingerprint(repo, self.a)
        (repo / 'code.py').write_text('two')
        self.assertNotEqual(v.source_fingerprint(repo, self.a), first)
        (repo / 'code.py').write_text('one')
        self.assertEqual(v.source_fingerprint(repo, self.a), first)
        (self.a / 'input.json').write_text('{"v":2}')
        self.assertNotEqual(v.source_fingerprint(repo, self.a), first)

    def test_timeout_is_recorded(self):
        result = self.run_job(self.job('import time; time.sleep(30)'), timeout=1)
        self.assertEqual(result['exitCode'], 124); self.assertLess(result['seconds'], 5)

    def test_member_rejects_escape_and_symlink(self):
        for name in ('../secret', '/tmp/secret', 'nested/../secret', 'x\\y'):
            with self.assertRaises(ValueError): v.member(self.a, name)
        (self.a / 'link').symlink_to(self.b)
        with self.assertRaises(ValueError): v.member(self.a, 'link/secret')

    def test_census_refuses_shell_injection(self):
        package = {'scripts': {'skills:check': 'pnpm first && pnpm second', 'first': '', 'second': ''}}
        self.assertEqual(len(v.skills_census_jobs(package)), 2)
        package['scripts']['skills:check'] = 'pnpm first; touch /tmp/no'
        with self.assertRaises(ValueError): v.skills_census_jobs(package)

    def test_preflight_collects_all_hash_errors_for_dynamic_count(self):
        recipe = {'projectId': 'one', 'slots': [{'slot': s, 'ownerDescription': s, 'requiredRefinement': 'original '+s} for s in v.SLOTS]}
        (self.a / 'recipe.json').write_text(json.dumps(recipe))
        project = {'projectId': 'one', 'sourceDesign': {'sourceSha256': v.digest(self.a / 'recipe.json')}}
        (self.a / 'project.json').write_text(json.dumps(project))
        index = {'heroCount': 1, 'slotCount': 6, 'heroes': [{'projectId': 'one', 'name': 'One', 'project': 'project.json', 'recipe': 'recipe.json'}]}
        (self.a / 'index.json').write_text(json.dumps(index))
        files = [{'path': n, 'sha256': v.digest(self.a/n)} for n in ('index.json', 'project.json', 'recipe.json')]
        manifest = {'schema': 'ggd-shared-authoring-handoff@1', 'heroCount': 1, 'slotCount': 6, 'files': files, 'refinements': []}
        (self.a / 'handoff-manifest.json').write_text(json.dumps(manifest))
        errors, rows = v.preflight(self.a)
        self.assertEqual(errors, []); self.assertEqual(len(rows), 6)
        self.assertTrue(all(r['behaviorTests'] == 'not-covered' for r in rows))
        for name in ('project.json', 'recipe.json'):
            with (self.a/name).open('a') as f: f.write(' ')
        errors, _ = v.preflight(self.a)
        self.assertEqual(sum('SHA-256 mismatch' in e for e in errors), 2)

    def test_cross_app_suites_keep_path_and_test_file_guards(self):
        (self.a/'handoff-manifest.json').write_text('{}')
        plan = {'schema': 'ggd-batch-validation-plan@1', 'manifestSha256': v.digest(self.a/'handoff-manifest.json'),
                'suites': [{'id': 'views', 'files': [], 'heroSlots': {'hero': ['E']}}]}
        original_repo = v.REPO
        try:
            v.REPO = self.b
            names = [prefix+'/src/real.test.ts' for prefix in ('packages/shared', 'apps/editor', 'apps/client', 'apps/game-server')]
            for name in names + ['tools/real.test.ts', 'apps/client/src/not-a-test.ts']:
                path = self.b/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('// test fixture')
            plan['suites'][0]['files'] = names
            path = self.a/'validation-plan.json'; path.write_text(json.dumps(plan))
            rows = [{'projectId': 'hero', 'slot': 'E'}]
            self.assertEqual(v.load_plan(self.a, rows)[0]['files'], names)
            for bad in ('tools/real.test.ts', 'apps/client/src/not-a-test.ts', 'apps/client/src/missing.test.ts',
                        '../real.test.ts', '/tmp/real.test.ts', 'apps/client/src/../../../outside.test.ts'):
                with self.subTest(path=bad):
                    plan['suites'][0]['files'] = [bad]; path.write_text(json.dumps(plan))
                    with self.assertRaises(ValueError): v.load_plan(self.a, rows)
        finally:
            v.REPO = original_repo

    def test_stale_plan_and_arbitrary_commands_rejected(self):
        (self.a/'handoff-manifest.json').write_text('{}')
        plan = {'schema': 'ggd-batch-validation-plan@1', 'manifestSha256': 'stale', 'suites': []}
        path = self.a/'validation-plan.json'; path.write_text(json.dumps(plan))
        with self.assertRaisesRegex(ValueError, 'stale'): v.load_plan(self.a, [])
        plan['manifestSha256'] = v.digest(self.a/'handoff-manifest.json')
        plan['suites'] = [{'id':'unsafe', 'files':[], 'heroSlots':{}, 'command':'touch /tmp/no'}]
        path.write_text(json.dumps(plan))
        with self.assertRaisesRegex(ValueError, 'never commands'): v.load_plan(self.a, [])


if __name__ == '__main__': unittest.main()
