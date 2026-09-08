import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / 'materials/community-hero-forge/s3_transport.py'
SPEC = importlib.util.spec_from_file_location('s3_transport', SCRIPT)
transport = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transport)


class TransportSecurity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.part = self.root / 'payload.tar.gz.part000'
        self.part.write_bytes(b'hello')
        self.manifest = self.root / 'manifest.json'
        self.manifest.write_text(json.dumps({'schema': 'ggd-community-materials-archive@1', 'parts': [
            {'path': self.part.name, 'bytes': 5, 'sha256': hashlib.sha256(b'hello').hexdigest()}]}))
        self.loc = {'schema': 'ggd-community-materials-s3@1', 'bucket': transport.BUCKET,
                    'region': transport.REGION, 'profile': transport.PROFILE,
                    'manifestSha256': transport.digest(self.manifest)}
        self.loc['prefix'] = 'community-hero-forge/' + self.loc['manifestSha256'] + '/'
        self.save_location()

    def save_location(self):
        (self.root / 's3-location.json').write_text(json.dumps(self.loc))

    def test_wrong_role_stops_before_s3(self):
        with patch.object(transport, 'aws', return_value={'Arn': 'arn:aws:sts::390630837668:assumed-role/unexpected/session'}) as call:
            with self.assertRaisesRegex(PermissionError, 'Unexpected AWS role'):
                transport.fetch_parts(self.root, self.root / 'cache')
        self.assertEqual([c.args[0] for c in call.call_args_list], [['sts', 'get-caller-identity']])

    def test_access_denied_reports_action_resource_without_retry_or_diagnostics(self):
        result = subprocess.CompletedProcess([], 254, '', 'An error occurred (AccessDenied) when calling the PutObject operation: PRIVATE_DIAGNOSTIC')
        resource = 'arn:aws:s3:::' + transport.BUCKET + '/test'
        with patch.object(transport.subprocess, 'run', return_value=result) as run:
            with self.assertRaises(PermissionError) as failure:
                transport.aws(['s3api', 'put-object'], 's3:PutObject', resource)
        self.assertIn('s3:PutObject on ' + resource, str(failure.exception))
        self.assertNotIn('PRIVATE_DIAGNOSTIC', str(failure.exception))
        self.assertEqual(run.call_count, 1)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index('--profile') + 1], 'vibe-coding')
        self.assertEqual(command[command.index('--region') + 1], 'ap-east-2')

    def test_changed_destination_is_rejected_without_aws(self):
        for field, value in [('bucket', 'different-bucket'), ('profile', 'different-profile'), ('prefix', 'elsewhere/')]:
            original = self.loc[field]
            self.loc[field] = value
            self.save_location()
            with patch.object(transport, 'aws') as call:
                with self.assertRaisesRegex(ValueError, 'authorized bucket/profile'):
                    transport.fetch_parts(self.root, self.root / 'cache')
                call.assert_not_called()
            self.loc[field] = original

    def test_invalid_local_source_prevents_remote_write(self):
        self.part.write_bytes(b'other')
        with patch.object(transport, 'aws') as call:
            with self.assertRaisesRegex(ValueError, 'corrupt material'):
                transport.publish(self.root, self.root)
        call.assert_not_called()

    def test_download_corruption_is_never_promoted_to_cache(self):
        def aws(args, *unused, **kwargs):
            if args[0] == 'sts':
                return {'Arn': transport.ROLE + 'test'}
            Path(args[-1]).write_bytes(b'other')
            return {}
        cache = self.root / 'cache'
        with patch.object(transport, 'aws', side_effect=aws):
            with self.assertRaisesRegex(ValueError, 'corrupt material'):
                transport.fetch_parts(self.root, cache)
        self.assertEqual(list(cache.iterdir()), [])

    def test_existing_different_object_is_never_overwritten(self):
        responses = [{'Arn': transport.ROLE + 'test'}, {'ContentLength': 5, 'ChecksumSHA256': 'different'}]
        with patch.object(transport, 'aws', side_effect=responses) as call:
            with self.assertRaisesRegex(ValueError, 'will not be overwritten'):
                transport.publish(self.root, self.root)
        self.assertFalse(any(c.args[0][:2] == ['s3api', 'put-object'] for c in call.call_args_list))


if __name__ == '__main__':
    unittest.main()
