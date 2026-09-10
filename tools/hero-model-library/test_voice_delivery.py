"""Explicit primary audio selection survives full-archive backup publication."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from voice_index import primary_audio, excluded_from_speech
from query_voice import read_voice_files


class VoiceDelivery(unittest.TestCase):
    def test_mixed_synthetic_provenance_does_not_identify_each_clip(self):
        self.assertTrue(excluded_from_speech('unclassified', None, True))
        self.assertTrue(excluded_from_speech('music'))
        self.assertTrue(excluded_from_speech('sound-effect'))
        self.assertFalse(excluded_from_speech('unclassified', None, None))
        with self.assertRaises(AssertionError):
            excluded_from_speech('unclassified', 'unknown')

    def test_backup_preserves_original_without_counting_it_twice(self):
        original=dict(path='source.ogg',sha256='source-hash',bytes=12)
        converted=dict(path='converted.wav',sha256='wav-hash',bytes=24)
        archived=[original,converted]
        self.assertEqual(primary_audio(archived,[converted]),[converted])
        self.assertEqual(archived,[original,converted])

    def test_missing_or_changed_delivery_cannot_use_stale_backup(self):
        f=dict(path='a.wav',sha256='a',bytes=24)
        for archive in [[],[dict(f,sha256='changed')],[dict(f,bytes=23)]]:
            with self.subTest(archive=archive),self.assertRaises(AssertionError):
                primary_audio(archive,[f])

    def test_source_format_preference_keeps_one_primary_conversion(self):
        files=[dict(path='a.ogg',sha256='a',bytes=12),dict(path='a.wav',sha256='b',bytes=24)]
        self.assertEqual(primary_audio(files,files,['.wav']),[files[1]])

    def test_clean_checkout_reads_complete_gzip_without_local_jsonl(self):
        rows=[dict(groupId='a',path='one.wav'),dict(groupId='b',path='two.wav')]
        raw=('\n'.join(json.dumps(r) for r in rows)+'\n').encode()
        blob=gzip.compress(raw,mtime=0)
        data=dict(sourceFileManifest='files.jsonl.gz',sourceFileEncoding='gzip',
                  sourceFileManifestSha256=hashlib.sha256(blob).hexdigest(),
                  uncompressedFileManifestSha256=hashlib.sha256(raw).hexdigest())
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'files.jsonl.gz').write_bytes(blob)
            self.assertEqual(list(read_voice_files(data,root)),rows)
            with self.assertRaises(AssertionError):
                list(read_voice_files(dict(data,sourceFileManifestSha256='corrupt'),root))


if __name__=='__main__':unittest.main()
