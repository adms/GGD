"""Immutable backup receipts add provenance without replacing source archives."""
import contextlib
import copy
import io
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from backup_intake import BUCKET, sha
from record_supplemental_backup import main


class SupplementalBackup(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.repo = self.root / 'repo'
        self.base = self.repo / 'materials/hero-model-library'
        self.base.mkdir(parents=True)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.model = self.source / 'weapon.glb'
        self.model.write_bytes(b'unchanged component bytes')
        self.original_backup = dict(s3Uri='s3://original/frozen-source.zip', sha256='original-source')
        self.candidate = dict(id='weapon', absolutePath=str(self.model), sha256=sha(self.model),
            bytes=self.model.stat().st_size, s3Uri=None, resourceRole='weapon-prop',
            fullHeroModel=False, runtimeSelectable=False, defaultEligible=False, heroIds=[])
        source = dict(id='original-source', backup=self.original_backup, readiness='body-missing',
                      componentCandidates=[copy.deepcopy(self.candidate)])
        (self.base / 'download-sources.json').write_text(json.dumps(dict(publicSources=[source])))
        (self.base / 'public-source-files.json').write_text(json.dumps(dict(sources=[
            dict(id='original-source', sha256='original-source', files=[])])))
        self.receipt = self.snapshot('first', ['weapon.glb'])

    def snapshot(self, name, members):
        out = self.root / 'backups' / name
        out.mkdir(parents=True)
        archive = out / 'source.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for relative in sorted(members):
                tar.add(self.source / relative, arcname=relative, recursive=False)
        readback = out / 'readback.tar.gz'
        shutil.copyfile(archive, readback)
        digest, size = sha(archive), archive.stat().st_size
        uri = f's3://{BUCKET}/legacy/test-snapshots/{digest}.tar.gz'
        rows = [dict(path=relative, bytes=(self.source / relative).stat().st_size,
                     sha256=sha(self.source / relative)) for relative in sorted(members)]
        manifest = out / 'manifest.json'
        manifest.write_text(json.dumps(dict(schema='ggd-intake-backup-manifest@1',
            source=str(self.source), files=rows, archiveSha256=digest, archiveBytes=size, s3Uri=uri)))
        shutil.copyfile(manifest, out / 'manifest-readback.json')
        receipt = out / 'receipt.json'
        receipt.write_text(json.dumps(dict(schema='ggd-intake-backup-receipt@1', s3Uri=uri,
            manifestUri=uri.removesuffix('.tar.gz') + '.files.json', archiveSha256=digest,
            archiveBytes=size, fileCount=len(rows), fullGetVerified=True, allMemberSha256Verified=True,
            localUnchanged=True, source=str(self.source), localArchive=str(archive),
            readback=str(readback), manifest=str(manifest))))
        return receipt

    def scoped_snapshot(self, name, members):
        receipt = self.snapshot(name, members)
        out = receipt.parent
        archive = out / 'source.tar.gz'
        readback = out / 'readback.tar.gz'
        digest, size = sha(archive), archive.stat().st_size
        uri = f's3://{BUCKET}/legacy/public-model-sources/conversion-source/{digest}.tar.gz'
        rows = [dict(path=relative, bytes=(self.source / relative).stat().st_size,
                     sha256=sha(self.source / relative)) for relative in sorted(members)]
        manifest = out / 'scoped-manifest.json'
        manifest.write_text(json.dumps(dict(schema='test-scoped-manifest@1', sourceId='conversion-source',
            sourceRoot=str(self.source), absoluteLocalArchive=str(archive), archiveFormat='tar-gzip',
            archiveMemberRoot='', bytes=size, sha256=digest, fileCount=len(rows), files=rows,
            plannedS3Uri=uri, localPreserved=True)))
        shutil.copyfile(manifest, out / 's3-manifest-readback.json')
        receipt.write_text(json.dumps(dict(schema='ggd-scoped-tar-s3-receipt@1', id='conversion-source',
            s3Uri=uri, manifestUri=uri.removesuffix('.tar.gz') + '.files.json', sha256=digest,
            bytes=size, fileCount=len(rows), manifestSha256=sha(manifest), archiveFormat='tar-gzip',
            archiveMemberRoot='', readbackVerified=True, fullGetVerified=True,
            allArchiveMembersSha256Verified=True, localPreserved=True, localArchive=str(archive),
            localReadback=str(readback), localManifest=str(manifest))))
        return receipt

    def run_record(self, receipt=None, linked=True):
        args = [str(receipt or self.receipt), '--id', 'conversion-source', '--role', 'model-conversion-backup']
        if linked:
            args += ['--source-id', 'original-source']
        with contextlib.redirect_stdout(io.StringIO()):
            main(args, repo=self.repo)

    def catalogs(self):
        return [(self.base / name).read_bytes() for name in ['download-sources.json', 'public-source-files.json']]

    def decoded(self):
        return [json.loads(blob) for blob in self.catalogs()]

    def test_verified_snapshot_adds_backup_only_locators_preserving_source(self):
        self.run_record()
        downloads, index = self.decoded()
        source = downloads['publicSources'][0]
        self.assertEqual(source['backup'], self.original_backup)
        self.assertEqual(source['readiness'], 'body-missing')
        component = source['componentCandidates'][0]
        for field in ['resourceRole', 'fullHeroModel', 'runtimeSelectable', 'defaultEligible', 'heroIds']:
            self.assertEqual(component[field], self.candidate[field])
        self.assertEqual(component['s3Use'], 'backup-only-not-runtime-entry')
        self.assertEqual(len(component['backupLocations']), 1)
        self.assertEqual(index['sources'][0]['id'], 'original-source')
        self.assertEqual(index['sources'][1]['acquiredAssetPayloadCount'], 0)

    def test_scoped_uploader_receipt_is_verified_and_registered(self):
        scoped = self.scoped_snapshot('scoped', ['weapon.glb'])
        self.run_record(scoped)
        downloads, index = self.decoded()
        component = downloads['publicSources'][0]['componentCandidates'][0]
        self.assertEqual(component['s3ArchiveMember'], 'weapon.glb')
        self.assertTrue(index['sources'][-1]['fullReadbackVerified'])
        before = self.catalogs()
        data = json.loads(scoped.read_text())
        data['allArchiveMembersSha256Verified'] = False
        scoped.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'not fully verified'):
            self.run_record(scoped)
        self.assertEqual(self.catalogs(), before)

    def test_repeating_same_receipt_is_byte_idempotent(self):
        self.run_record()
        before = self.catalogs()
        self.run_record()
        self.assertEqual(self.catalogs(), before)

    def test_pending_then_verified_promotes_only_the_matching_snapshot(self):
        path = self.base / 'public-source-files.json'
        data = json.loads(path.read_text())
        data['pendingUploads'] = [dict(id='other-workflow', sha256='other')]
        path.write_text(json.dumps(data))
        args = [str(self.receipt.with_name('manifest.json')), '--pending-manifest',
                '--id', 'conversion-source', '--role', 'model-conversion-backup', '--source-id', 'original-source']
        with contextlib.redirect_stdout(io.StringIO()):
            main(args, repo=self.repo)
            before = self.catalogs()
            main(args, repo=self.repo)
        self.assertEqual(self.catalogs(), before)
        downloads, index = self.decoded()
        self.assertFalse(index['pendingUploads'][-1]['readbackVerified'])
        self.assertIsNone(downloads['publicSources'][0]['componentCandidates'][0]['s3Uri'])
        self.assertEqual(downloads['publicSources'][0]['backup'], self.original_backup)
        self.run_record()
        downloads, index = self.decoded()
        self.assertEqual(index['pendingUploads'], [dict(id='other-workflow', sha256='other')])
        self.assertEqual(downloads['publicSources'][0]['pendingSupplementalDeliveries'], [])
        with self.assertRaises(ValueError):
            main(args, repo=self.repo)

    def test_pending_rejects_changed_archive_before_catalog_writes(self):
        before = self.catalogs()
        self.receipt.with_name('source.tar.gz').write_bytes(b'changed')
        args = [str(self.receipt.with_name('manifest.json')), '--pending-manifest',
                '--id', 'conversion-source', '--role', 'model-conversion-backup']
        with self.assertRaises(ValueError):
            main(args, repo=self.repo)
        self.assertEqual(self.catalogs(), before)

    def test_wrong_receipt_and_changed_archive_or_readback_are_rejected(self):
        receipt_data = json.loads(self.receipt.read_text())
        before = self.catalogs()
        for field, value in [('fullGetVerified', False), ('manifestUri', 's3://other/unrelated.json')]:
            with self.subTest(field=field):
                self.receipt.write_text(json.dumps(dict(receipt_data, **{field: value})))
                with self.assertRaises(ValueError):
                    self.run_record()
                self.assertEqual(self.catalogs(), before)
        self.receipt.write_text(json.dumps(receipt_data))
        for path in [Path(receipt_data['readback']), Path(receipt_data['localArchive']),
                     Path(receipt_data['manifest']).with_name('manifest-readback.json')]:
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.write_bytes(b'X' * len(original))
                with self.assertRaises(ValueError):
                    self.run_record()
                self.assertEqual(self.catalogs(), before)
                path.write_bytes(original)

    def test_added_unlisted_file_is_preserved_but_changed_listed_file_is_rejected(self):
        (self.source / 'later-not-backed-up.txt').write_text('new preparation work')
        with patch.object(Path, 'rglob', side_effect=AssertionError('Must not enumerate unlisted source files')):
            self.run_record(linked=False)
        _, index = self.decoded()
        snapshot = index['sources'][-1]
        self.assertEqual([row['path'] for row in snapshot['files']], ['weapon.glb'])
        self.assertEqual(snapshot['snapshotScope'], 'manifest-listed-files-only')
        before = self.catalogs()
        self.model.write_bytes(b'X' * self.candidate['bytes'])
        with self.assertRaisesRegex(ValueError, 'snapshot member changed locally'):
            self.run_record()
        self.assertEqual(self.catalogs(), before)

    def test_second_archive_revision_preserves_old_links_and_scalar_locator(self):
        self.run_record()
        first = self.decoded()[0]['publicSources'][0]['componentCandidates'][0]['s3Uri']
        (self.source / 'additional-evidence.json').write_text('{}')
        second = self.snapshot('second', ['weapon.glb', 'additional-evidence.json'])
        self.run_record(second)
        downloads, index = self.decoded()
        source = downloads['publicSources'][0]
        self.assertEqual(len(index['sources']), 3)
        self.assertEqual(len(source['supplementalDeliveries']), 2)
        self.assertEqual(len(source['componentCandidates'][0]['backupLocations']), 2)
        self.assertEqual(source['componentCandidates'][0]['s3Uri'], first)
        self.assertEqual(source['backup'], self.original_backup)
        before = self.catalogs()
        self.run_record(self.receipt)
        self.run_record(second)
        self.assertEqual(self.catalogs(), before)

    def test_component_payload_mismatch_does_not_partially_write_catalogs(self):
        downloads, index = self.decoded()
        downloads['publicSources'][0]['componentCandidates'][0]['sha256'] = 'wrong-component'
        (self.base / 'download-sources.json').write_text(json.dumps(downloads))
        before = self.catalogs()
        with self.assertRaisesRegex(ValueError, 'does not cover component'):
            self.run_record()
        self.assertEqual(self.catalogs(), before)

    def test_primary_snapshot_replaces_only_not_uploaded_placeholder(self):
        downloads, index = self.decoded()
        source = downloads['publicSources'][0]
        source['backup'] = {'status': 'not-uploaded', 'readbackVerified': False}
        index['sources'] = []
        (self.base / 'download-sources.json').write_text(json.dumps(downloads))
        (self.base / 'public-source-files.json').write_text(json.dumps(index))
        args = [str(self.receipt), '--id', 'original-source', '--source-id', 'original-source',
                '--role', 'model-conversion-backup', '--primary-source-backup']
        with contextlib.redirect_stdout(io.StringIO()):
            main(args, repo=self.repo)
        downloads, index = self.decoded()
        primary = downloads['publicSources'][0]['backup']
        self.assertEqual(primary['sha256'], sha(self.receipt.with_name('source.tar.gz')))
        self.assertTrue(primary['fullReadbackVerified'])
        self.assertEqual(downloads['publicSources'][0]['publicationStatus'], 's3-readback-verified')
        self.assertEqual(index['sources'][0]['id'], 'original-source')

    def test_primary_snapshot_does_not_replace_an_existing_archive(self):
        downloads, index = self.decoded()
        index['sources'] = []
        (self.base / 'public-source-files.json').write_text(json.dumps(index))
        before = self.catalogs()
        args = [str(self.receipt), '--id', 'original-source', '--source-id', 'original-source',
                '--role', 'model-conversion-backup', '--primary-source-backup']
        with self.assertRaisesRegex(ValueError, 'Different primary backup'):
            main(args, repo=self.repo)
        self.assertEqual(self.catalogs(), before)


if __name__ == '__main__':
    unittest.main()
