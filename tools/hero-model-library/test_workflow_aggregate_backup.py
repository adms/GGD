import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).with_name('workflow_aggregate_backup.py')
SPEC = importlib.util.spec_from_file_location('workflow_aggregate_backup', SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class WorkflowAggregateBackupTest(unittest.TestCase):
    def test_plan_requires_exact_member_union_and_explicit_metadata_gap(self):
        with tempfile.TemporaryDirectory() as folder:
            ws = Path(folder)
            repo = ws / 'GGD'; root = repo / 'materials/hero-model-library'; root.mkdir(parents=True)
            archive = ws / 'outputs/a.zip'; archive.parent.mkdir()
            blobs = {'source/a.bin': b'a', 'metadata.json': b'meta'}
            with zipfile.ZipFile(archive, 'w') as z:
                for name, data in blobs.items(): z.writestr(name, data)
            rows = [dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()) for name, data in blobs.items()]
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            pending = dict(id='old-source', localArchive='outputs/a.zip', bytes=archive.stat().st_size,
                           sha256=digest, files=rows)
            verified = dict(id='source-a', readbackVerified=True, files=[rows[0]])
            (root / 'download-sources.json').write_text(json.dumps({'publicSources': []}))
            (root / 'public-source-files.json').write_text(json.dumps({'sources': [verified], 'pendingUploads': [pending]}))
            args = SimpleNamespace(workspace=ws, pending_id='old-source', sha256=digest,
                                   aggregate_id='fixture-aggregate', source_ids=['source-a'],
                                   extra_member=['metadata.json'])
            prior = mod.REPO; mod.REPO = repo
            try:
                _, _, _, result, checked, _, records, extra = mod.plan(args, repo)
            finally:
                mod.REPO = prior
            self.assertEqual(result['sha256'], digest)
            self.assertEqual(checked, archive.resolve())
            self.assertEqual([x['id'] for x in records], ['source-a'])
            self.assertEqual(extra, ['metadata.json'])

    def test_range_readback_is_resumable_and_compares_each_part_to_local_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            payload = bytes(range(100))
            expected = root / 'expected.zip'; expected.write_bytes(payload)
            destination = root / 'readback.zip'
            calls = []
            original = mod.aws
            def fake_aws(args, action, resource):
                calls.append((args, action, resource))
                start, end = map(int, args[args.index('--range') + 1].removeprefix('bytes=').split('-'))
                Path(args[-1]).write_bytes(payload[start:end + 1])
                return '{}'
            mod.aws = fake_aws
            try:
                mod.range_readback('fixture/key.zip', destination, expected, len(payload), chunk_bytes=17)
                first_calls = len(calls)
                mod.range_readback('fixture/key.zip', destination, expected, len(payload), chunk_bytes=17)
            finally:
                mod.aws = original
            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(first_calls, 6)
            self.assertEqual(len(calls), first_calls)

    def test_seed_range_parts_copies_only_exact_ranges_and_preserves_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            expected_bytes = bytes(range(48))
            expected = root / 'expected.zip'; expected.write_bytes(expected_bytes)
            seed_bytes = expected_bytes[:16] + (b'x' * 16) + expected_bytes[32:]
            partial = root / 'old-readback.partial'; partial.write_bytes(seed_bytes)
            destination = root / 'readback.zip'
            parts = root / 'readback.zip.parts'; parts.mkdir()
            first = parts / '000000000000-000000000015.part'
            first.write_bytes(expected_bytes[:16])
            first_inode = first.stat().st_ino
            third = parts / '000000000032-000000000047.part'
            third.write_bytes(b'bad')
            expected_before = expected.read_bytes()
            partial_before = partial.read_bytes()

            result = mod.seed_range_parts(partial, expected, destination, len(expected_bytes), chunk_bytes=16)

            self.assertEqual(result['seededParts'], 1)
            self.assertEqual(result['seededBytes'], 16)
            self.assertEqual(result['reusedParts'], 1)
            self.assertEqual(result['reusedBytes'], 16)
            self.assertEqual(result['mismatchedParts'], 1)
            self.assertEqual(first.stat().st_ino, first_inode)
            self.assertEqual(third.read_bytes(), expected_bytes[32:])
            self.assertEqual(len(list(parts.glob(third.name + '.invalid-*'))), 1)
            self.assertEqual(expected.read_bytes(), expected_before)
            self.assertEqual(partial.read_bytes(), partial_before)


if __name__ == '__main__':
    unittest.main()
