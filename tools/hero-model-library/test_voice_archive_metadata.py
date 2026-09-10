"""Archive metadata preserves local paths while locating real backup members."""
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import unittest

from voice_index import public_archive_member, public_archive_type


class VoiceArchiveMetadata(unittest.TestCase):
    def test_legacy_receipts_keep_zip_or_local_and_member(self):
        for receipt, expected in [({'sha256': 'known'}, 'zip'), ({}, 'local-intake')]:
            with self.subTest(receipt=receipt):
                self.assertEqual(public_archive_type(receipt), expected)
                self.assertEqual(public_archive_member(receipt, 'raw/音声 01.ogg'), 'raw/音声 01.ogg')

    def test_explicit_format_and_root_locate_tar_bytes_once(self):
        receipt = {'archiveFormat': 'tar-gzip', 'archiveMemberRoot': 'package/v1/'}
        blob = b'audio payload'
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w:gz') as handle:
            info = tarfile.TarInfo('package/v1/raw/clip.ogg')
            info.size = len(blob)
            handle.addfile(info, io.BytesIO(blob))
        self.assertEqual(public_archive_type(receipt), 'tar-gzip')
        for path in ['raw/clip.ogg', 'package/v1/raw/clip.ogg']:
            member = public_archive_member(receipt, path)
            self.assertEqual(member, 'package/v1/raw/clip.ogg')
            archive.seek(0)
            with tarfile.open(fileobj=archive, mode='r:gz') as handle:
                self.assertEqual(handle.extractfile(member).read(), blob)
        # A partial string match is not a directory prefix.
        self.assertEqual(public_archive_member(receipt, 'package/v10/clip.ogg'),
                         'package/v1/package/v10/clip.ogg')

    def test_explicit_zip_and_rootless_tar(self):
        self.assertEqual(public_archive_type({'archiveFormat': 'zip'}), 'zip')
        receipt = {'archiveFormat': 'tar-gzip', 'archiveMemberRoot': ''}
        self.assertEqual(public_archive_member(receipt, 'clip.ogg'), 'clip.ogg')
        with self.assertRaises(ValueError):
            public_archive_type({'archiveFormat': 'unknown'})

    def test_member_and_root_cannot_escape(self):
        for invalid in ['../clip.ogg', 'raw/../clip.ogg', '/clip.ogg',
                        'C:/clip.ogg', 'C:\\clip.ogg', '\\\\server\\clip.ogg',
                        'raw\\clip.ogg', './clip.ogg', 'raw//clip.ogg', 'raw/\0clip.ogg']:
            with self.subTest(member=invalid), self.assertRaises(ValueError):
                public_archive_member({'archiveMemberRoot': 'package/'}, invalid)
            with self.subTest(root=invalid), self.assertRaises(ValueError):
                public_archive_member({'archiveMemberRoot': invalid}, 'clip.ogg')
        for invalid in [None, 7, {}, []]:
            with self.subTest(root=invalid), self.assertRaises(ValueError):
                public_archive_member({'archiveMemberRoot': invalid}, 'clip.ogg')

    @unittest.skipUnless(os.environ.get('GGD_VOICE_ARCHIVE_RECEIPT') and
                         os.environ.get('GGD_VOICE_ARCHIVE_INDEX'),
                         'Set local receipt/index paths to verify acquired FateUBW backup')
    def test_actual_fateubw_readback_five_audio_members_match_sha(self):
        receipt = json.loads(Path(os.environ['GGD_VOICE_ARCHIVE_RECEIPT']).read_text())
        index = json.loads(Path(os.environ['GGD_VOICE_ARCHIVE_INDEX']).read_text())
        archive = Path(receipt['readbackPath'])
        self.assertTrue(receipt['verified'])
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), receipt['archiveSha256'])
        self.assertEqual(len(index['files']), 5)
        metadata = dict(archiveFormat='tar-gzip', archiveMemberRoot=receipt['archiveMemberRoot'])
        self.assertEqual(public_archive_type(metadata), 'tar-gzip')
        members = []
        with tarfile.open(archive, 'r:gz') as handle:
            for row in index['files']:
                member = public_archive_member(metadata, row['path'])
                self.assertEqual(public_archive_member(metadata, member), member)
                info = handle.getmember(member)
                self.assertTrue(info.isfile())
                content = handle.extractfile(info).read()
                self.assertEqual(len(content), row['bytes'])
                self.assertEqual(hashlib.sha256(content).hexdigest(), row['sha256'])
                members.append(member)
        self.assertEqual(len(set(members)), 5)


if __name__ == '__main__':
    unittest.main()
