import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('base', Path(__file__).with_name('hero-finetune-base-s3.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class FakeAWS:
    def __init__(self):
        self.objects = {}
        self.calls = []
        self.fail_at = None
        self.get_count = 0

    def identity(self): self.calls.append('identity')
    def keys(self): return set(self.objects)
    def put(self, obj, source):
        self.calls.append('put')
        self.objects[obj['key']] = source.read_bytes()
    def get(self, obj, destination):
        self.get_count += 1
        self.calls.append('get')
        if self.get_count == self.fail_at:
            raise RuntimeError('AWS_ACCESS_DENIED_STOP:s3:GetObject:fixture')
        destination.write_bytes(self.objects[obj['key']])


class BaseStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.root, self.model, self.cache = [self.base / n for n in ('report', 'model', 'cache')]
        self.root.mkdir(); self.model.mkdir()
        original = b.CHUNK
        b.CHUNK = 64
        self.addCleanup(setattr, b, 'CHUNK', original)
        self.prior = self.base / 'download.json'
        self.preflight = self.base / 'preflight.json'
        files = []
        for n, name in enumerate(sorted(b.NAMES)):
            content = b'{}' if name.endswith('.json') else bytes([n + 1]) * 150
            if name == 'model.safetensors.index.json':
                content = json.dumps({'weight_map': {name: name for name in sorted(b.NAMES) if name.endswith('.safetensors')}}).encode()
            (self.model / name).write_bytes(content)
            files.append({'name': name, 'bytes': len(content), 'sha256': b.s.archive.digest(self.model / name)})
        self.prior.write_text(json.dumps({'repo': b.MODEL, 'revision': b.REVISION, 'status': 'verified',
                                         'expectedBytes': sum(f['bytes'] for f in files), 'files': files}))
        self.preflight.write_text(json.dumps({'modelRevision': b.REVISION, 'files': files, 'versions': {'mlx': 'test-only'}}))
        with contextlib.redirect_stdout(io.StringIO()):
            b.prepare(self.root, self.model, self.prior, self.preflight)
        self.index = b.load(self.root)

    def publish(self, aws):
        with contextlib.redirect_stdout(io.StringIO()):
            return b.publish(self.root, self.model, self.cache, aws)

    def test_all_file_bytes_survive_remote_and_offline_restore(self):
        aws = FakeAWS(); self.publish(aws)
        b.check_receipt(self.root, self.index)
        offline = self.base / 'offline'
        remote = self.base / 'remote'
        with contextlib.redirect_stdout(io.StringIO()):
            result = b.restore(self.root, offline, self.cache, True)
            b.restore(self.root, remote, aws=aws)
        self.assertTrue(result['allOriginalFileHashesMatch'])
        for name in b.NAMES:
            self.assertEqual((self.model / name).read_bytes(), (offline / name).read_bytes())
            self.assertEqual((self.model / name).read_bytes(), (remote / name).read_bytes())

    def test_access_denied_stops_without_receipt_and_explicit_resume_preserves_verified_chunks(self):
        aws = FakeAWS(); aws.fail_at = 3
        with self.assertRaisesRegex(RuntimeError, 'ACCESS_DENIED_STOP'): self.publish(aws)
        self.assertFalse((self.root / b.RECEIPT).exists())
        count = len(b.objects(self.index))
        self.publish(aws)  # separate invocation after test-simulated permission resolution
        self.assertEqual(aws.calls.count('put'), count)
        self.assertEqual(aws.calls.count('get'), count + 1)
        self.assertEqual(aws.calls.count('identity'), 2)

    def test_modified_source_is_rejected_before_aws(self):
        (self.model / 'config.json').write_bytes(b'changed')
        aws = FakeAWS()
        with self.assertRaisesRegex(ValueError, 'HASH_MISMATCH'): self.publish(aws)
        self.assertEqual(aws.calls, [])

    def test_corrupt_remote_chunk_never_gets_receipt(self):
        aws = FakeAWS()
        aws.objects[b.objects(self.index)[0]['key']] = b'bad'
        with self.assertRaisesRegex(ValueError, 'HASH_MISMATCH'): self.publish(aws)
        self.assertFalse((self.root / b.RECEIPT).exists())

    def test_corrupt_cached_progress_is_not_trusted(self):
        aws = FakeAWS(); aws.fail_at = 3
        with self.assertRaises(RuntimeError): self.publish(aws)
        first = b.objects(self.index)[0]
        (self.cache / first['key'].rsplit('/', 1)[-1]).write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'HASH_MISMATCH'): self.publish(aws)

    def test_chunk_layout_missing_file_policy_override_and_traversal_rejected(self):
        mutations = [lambda i: i.update(bucket='other'), lambda i: i.update(revision='other'),
                     lambda i: i['files'].pop(), lambda i: i['files'][0].update(name='../escape'),
                     lambda i: i['files'][0]['parts'][0].update(offset=10),
                     lambda i: i['files'][0]['parts'][0].update(key='other-prefix')]
        for mutate in mutations:
            index = copy.deepcopy(self.index); mutate(index)
            with self.assertRaises(ValueError): b.validate(index)

    def test_original_training_hashes_are_required(self):
        new = self.base / 'new-report'; new.mkdir()
        old = json.loads(self.preflight.read_text()); old['files'][0]['sha256'] = '0' * 64
        self.preflight.write_text(json.dumps(old))
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_MODEL_CHANGED'), contextlib.redirect_stdout(io.StringIO()):
            b.prepare(new, self.model, self.prior, self.preflight)

    def test_existing_destination_receipt_and_incomplete_receipt_rejected(self):
        aws = FakeAWS(); self.publish(aws)
        with self.assertRaisesRegex(ValueError, 'ALREADY_EXISTS'): self.publish(aws)
        with self.assertRaisesRegex(ValueError, 'NEW_SEPARATE_DESTINATION'):
            b.restore(self.root, self.model, self.cache, True)
        receipt = json.loads((self.root / b.RECEIPT).read_text()); receipt['objects'].pop()
        (self.root / b.RECEIPT).write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, 'INCOMPLETE_BASE_RECEIPT'): b.check_receipt(self.root, self.index)

    def test_cli_restore_report_is_written_only_after_full_verification(self):
        aws = FakeAWS(); self.publish(aws)
        report = self.base / 'verification.json'
        argv = ['restore-tool', 'restore', str(self.root), '--destination', str(self.base / 'restored-cli'),
                '--cache', str(self.cache), '--offline', '--report', str(report)]
        with patch('sys.argv', argv), contextlib.redirect_stdout(io.StringIO()):
            b.main()
        value = json.loads(report.read_text())
        self.assertEqual(value['indexSha256'], b.s.archive.digest(self.root / b.INDEX))
        self.assertTrue(value['allOriginalFileHashesMatch'])
        self.assertFalse(value['sourceModelDirectoryUsed'])
        with patch('sys.argv', argv), self.assertRaisesRegex(ValueError, 'NEW_RESTORE_REPORT'):
            b.main()

    def test_verified_historical_index_can_only_relocate_to_legacy_prefix(self):
        aws = FakeAWS(); self.publish(aws)
        historical = self.base / 'historical-index.json'
        old = copy.deepcopy(self.index)
        old['prefix'] = b.HISTORICAL_PREFIX
        for entry in old['files']:
            for part in entry['parts']:
                part['key'] = b.HISTORICAL_PREFIX + part['sha256'] + '.bin'
        historical.write_text(json.dumps(old))
        old_hash = b.s.archive.digest(historical)
        receipt = json.loads((self.root / b.RECEIPT).read_text())
        receipt['indexSha256'] = old_hash
        for row in receipt['objects']:
            row['indexSha256'] = old_hash
            row['object']['key'] = b.HISTORICAL_PREFIX + row['object']['sha256'] + '.bin'
        old_receipt = self.base / 'historical-receipt.json'; old_receipt.write_text(json.dumps(receipt))
        relocated = self.base / 'relocated'; relocated.mkdir()
        with contextlib.redirect_stdout(io.StringIO()):
            result = b.relocate(relocated, historical, old_receipt)
        self.assertTrue(result['sourceReceiptVerified'])
        self.assertEqual(b.load(relocated)['prefix'], b.PREFIX)
        self.assertEqual(b.load(relocated)['relocatedFrom']['prefix'], b.HISTORICAL_PREFIX)


class TransferRetryTests(unittest.TestCase):
    def test_only_known_network_errors_get_bounded_retries(self):
        aws = b.AWS()
        call = unittest.mock.Mock(side_effect=[RuntimeError('AWS_COMMAND_FAILED:s3:GetObject:fixture:connection-reset'), None])
        call.__name__ = 'get'
        with patch.object(b.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            aws.transfer(call, {}, Path('/fixture'))
        self.assertEqual(call.call_count, 2)
        for message in ['AWS_ACCESS_DENIED_STOP:s3:GetObject:fixture:AccessDenied',
                        'AWS_COMMAND_FAILED:s3:GetObject:fixture:tls-validation-failed',
                        'AWS_COMMAND_FAILED:s3:GetObject:fixture:profile-provider-failed',
                        'AWS_COMMAND_FAILED:s3:GetObject:fixture:cli-exit-255']:
            call = unittest.mock.Mock(side_effect=RuntimeError(message)); call.__name__ = 'get'
            with self.assertRaises(RuntimeError): aws.transfer(call, {}, Path('/fixture'))
            self.assertEqual(call.call_count, 1)

    def test_unknown_put_outcome_requires_get_not_overwrite(self):
        aws = b.AWS()
        call = unittest.mock.Mock(side_effect=[RuntimeError('AWS_TIMEOUT:s3api:put-object:fixture'),
                                              RuntimeError('AWS_COMMAND_FAILED:s3:PutObject:fixture:PreconditionFailed')])
        call.__name__ = 'put'
        with patch.object(b.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            aws.transfer(call, {}, Path('/fixture'))
        self.assertEqual(call.call_count, 2)

    def test_network_retries_have_a_hard_limit(self):
        aws = b.AWS()
        call = unittest.mock.Mock(side_effect=RuntimeError('AWS_TIMEOUT:s3api:get-object:fixture')); call.__name__ = 'get'
        with patch.object(b.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(RuntimeError):
            aws.transfer(call, {}, Path('/fixture'))
        self.assertEqual(call.call_count, 3)


if __name__ == '__main__': unittest.main()
