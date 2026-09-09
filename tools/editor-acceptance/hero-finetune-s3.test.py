import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('store', Path(__file__).with_name('hero-finetune-s3.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class FakeAWS:
    def __init__(self):
        self.objects = {}
        self.calls = []
        self.fail = None

    def identity(self): self.calls.append('identity')
    def keys(self): return set(self.objects)
    def put(self, obj, source):
        self.calls.append('put')
        self.objects[obj['key']] = source.read_bytes()
    def get(self, obj, destination):
        self.calls.append('get')
        if self.fail:
            raise RuntimeError(self.fail)
        destination.write_bytes(self.objects[obj['key']])


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.root = self.base / 'repo'
        self.root.mkdir()
        self.cache = self.base / 'cache'
        workspace = self.base / 'workspace'
        workspace.mkdir()
        (workspace / 'sample.py').write_text('print("research only")\n')
        (workspace / 'state.json').write_text('{"status":"completed-control-not-promoted"}')
        with contextlib.redirect_stdout(io.StringIO()):
            s.archive.build(workspace, self.root / 'bundle', [Path('sample.py')], Path('state.json'))
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        # The manifest and readable mirrors belong in Git; archive/model bytes
        # remain untracked and are discovered through the committed manifest.
        subprocess.run(['git', '-C', str(self.root), 'add', 'bundle/manifest.json', 'bundle/sources'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                        'commit', '-qm', 'fixture', '--no-verify'], check=True)
        with contextlib.redirect_stdout(io.StringIO()): s.plan(self.root)
        self.index = s.read_index(self.root)

    def test_binary_payloads_are_not_tracked_but_are_fully_indexed(self):
        tracked = subprocess.check_output(['git', '-C', str(self.root), 'ls-files'], text=True).splitlines()
        self.assertFalse(any(path.endswith(('.zip', '.safetensors')) for path in tracked))
        self.assertTrue(self.index['objects'])
        self.assertTrue(all((self.root / path).is_file()
                            for obj in self.index['objects'] for path in obj['paths']))

    def publish(self, aws):
        with contextlib.redirect_stdout(io.StringIO()):
            return s.publish(self.root, self.cache, aws)

    def test_readback_and_cold_offline_hydration(self):
        aws = FakeAWS()
        self.assertTrue(self.publish(aws)['remotePayloadVerified'])
        self.assertEqual(aws.calls, ['identity', 'put', 'get'])
        s.check_receipt(self.root, self.index)
        for obj in self.index['objects']:
            for path in obj['paths']: (self.root / path).unlink()
        s.read_index(self.root)  # metadata works with no payload, not full proof
        with self.assertRaises(FileNotFoundError):
            s.full_verify(self.root, self.index)
        with contextlib.redirect_stdout(io.StringIO()):
            result = s.hydrate(self.root, self.base / 'restored', self.cache, True)
        self.assertTrue(result['payloadVerified'])
        self.assertFalse(result['remoteReadThisRun'])

    def test_remote_hydration_does_not_use_source_binaries(self):
        aws = FakeAWS(); self.publish(aws)
        for obj in self.index['objects']:
            for name in obj['paths']: (self.root / name).write_bytes(b'bad local file')
        with contextlib.redirect_stdout(io.StringIO()):
            result = s.hydrate(self.root, self.base / 'remote', aws=aws)
        self.assertTrue(result['remoteReadThisRun'])
        self.assertEqual(aws.calls.count('get'), 2)

    def test_existing_object_is_read_back_without_overwrite(self):
        aws = FakeAWS()
        for obj in self.index['objects']: aws.objects[obj['key']] = (self.root / obj['paths'][0]).read_bytes()
        self.publish(aws)
        self.assertNotIn('put', aws.calls)
        self.assertEqual(aws.calls.count('get'), 1)

    def test_remote_corruption_blocks_receipt(self):
        aws = FakeAWS()
        for obj in self.index['objects']: aws.objects[obj['key']] = b'corrupt'
        with self.assertRaisesRegex(ValueError, 'HASH_MISMATCH'): self.publish(aws)
        self.assertFalse((self.root / s.RECEIPT).exists())
        self.assertNotIn('put', aws.calls)

    def test_access_denied_stops_and_retry_resumes_without_put(self):
        aws = FakeAWS(); aws.fail = 'AWS_ACCESS_DENIED_STOP:s3:GetObject:fixture'
        with self.assertRaisesRegex(RuntimeError, 'ACCESS_DENIED_STOP'): self.publish(aws)
        self.assertFalse((self.root / s.RECEIPT).exists())
        # A later explicitly authorized invocation may resume; no internal retries.
        aws.fail = None; self.publish(aws)
        self.assertEqual(aws.calls.count('put'), 1)

    def test_metadata_detects_changed_manifest_missing_payload_and_duplicate(self):
        for mutate in [lambda i: i['objects'].clear(),
                       lambda i: i['objects'].append(copy.deepcopy(i['objects'][0])),
                       lambda i: i['objects'][0].update(sha256='a' * 64)]:
            index = copy.deepcopy(self.index); mutate(index)
            with self.assertRaises(ValueError): s.validate(self.root, index)
        (self.root / 'bundle/manifest.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'MANIFEST_CHANGED'): s.read_index(self.root)

    def test_paths_symlinks_and_policy_overrides_rejected(self):
        for name in ['../escape', '/absolute', 'a/../b', 'a\\b', './x']:
            with self.assertRaises(ValueError): s.safe(self.root, name)
        (self.root / 'link').symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(ValueError): s.safe(self.root, 'link/payload')
        for field in ['profile', 'region', 'bucket', 'prefix']:
            index = copy.deepcopy(self.index); index[field] = 'other'
            with self.assertRaisesRegex(ValueError, 'POLICY_MISMATCH'): s.validate(self.root, index)

    def test_bundle_cannot_be_silently_omitted_from_index(self):
        shutil.copytree(self.root / 'bundle', self.root / 'unindexed/bundle')
        with self.assertRaisesRegex(ValueError, 'UNINDEXED_BUNDLE'): s.read_index(self.root)

    def test_restore_and_receipt_never_overwrite(self):
        aws = FakeAWS(); self.publish(aws)
        with self.assertRaisesRegex(ValueError, 'RECEIPT_ALREADY_EXISTS'): self.publish(aws)
        with self.assertRaisesRegex(ValueError, 'NEW_HYDRATION'):
            s.hydrate(self.root, self.cache, self.cache, True)
        r = json.loads((self.root / s.RECEIPT).read_text()); r['objects'] = []
        (self.root / s.RECEIPT).write_text(json.dumps(r))
        with self.assertRaisesRegex(ValueError, 'INCOMPLETE_RECEIPT'): s.check_receipt(self.root, self.index)


class AWSContractTests(unittest.TestCase):
    def test_identity_mismatch_and_destructive_calls_blocked(self):
        aws = s.AWS(lambda *a, **k: subprocess.CompletedProcess(a, 0, '{"Account":"wrong","Arn":"wrong"}', ''))
        with self.assertRaisesRegex(ValueError, 'IDENTITY_MISMATCH'): aws.identity()
        with self.assertRaisesRegex(ValueError, 'IDENTITY_NOT_VERIFIED'): aws.keys()
        with self.assertRaisesRegex(ValueError, 'ACTION_NOT_ALLOWED'): aws.call('s3api', 'delete-object')

    def test_fixed_profile_region_sanitized_errors_and_no_retry(self):
        calls = []
        def runner(cmd, **kwargs):
            calls.append((cmd, kwargs))
            return subprocess.CompletedProcess(cmd, 1, '', 'AccessDenied secret-looking-response-do-not-print')
        aws = s.AWS(runner); aws.authorized = True
        with self.assertRaisesRegex(RuntimeError, 'AWS_ACCESS_DENIED_STOP:s3:ListBucket:arn:aws:s3:::') as caught:
            aws.keys()
        self.assertNotIn('secret-looking', str(caught.exception))
        self.assertEqual(len(calls), 1)
        command, options = calls[0]
        self.assertEqual(command[1:5], ['--profile', s.PROFILE, '--region', s.REGION])
        self.assertEqual(options['env']['AWS_PROFILE'], s.PROFILE)
        self.assertEqual(options['env']['AWS_MAX_ATTEMPTS'], '1')
        self.assertNotIn('AWS_SECRET_ACCESS_KEY', options['env'])

    def test_put_uses_conditional_create(self):
        calls = []
        def runner(cmd, **kwargs):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, '{}', '')
        aws = s.AWS(runner); aws.authorized = True
        aws.put({'key': s.PREFIX + 'a' * 64 + '.zip', 'sha256': 'a' * 64}, Path('/fixture.zip'))
        self.assertIn('--if-none-match', calls[0])
        self.assertNotIn('--acl', calls[0])


if __name__ == '__main__': unittest.main()
