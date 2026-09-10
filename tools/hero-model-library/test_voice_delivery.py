"""Explicit primary audio selection survives full-archive backup publication."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from voice_index import primary_audio, excluded_from_speech, source_audio_spec, audio_index_files, shared_audio_owner
from query_voice import read_voice_files


class VoiceDelivery(unittest.TestCase):
    def test_absolute_source_paths_require_matching_safe_relative_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = root / 'audio.json'
            source = dict(localPath=str(root), audioFileIndex=dict(reportPath='audio.json', pathField='relativePath'))
            def write(rows):
                report.write_text(json.dumps(dict(files=rows)))
                source['audioFileIndex']['reportSha256'] = hashlib.sha256(report.read_bytes()).hexdigest()
            row = dict(path=str(root / 'original/a.mp3'), relativePath='original/a.mp3', label='Joy')
            write([row])
            self.assertEqual(audio_index_files(source, root)[0]['path'], 'original/a.mp3')
            self.assertEqual(audio_index_files(source, root)[0]['label'], 'Joy')
            for bad in [dict(row, relativePath='../escape.mp3'), dict(row, path=str(root / 'other.mp3'))]:
                write([bad])
                with self.assertRaises((ValueError, AssertionError)):
                    audio_index_files(source, root)

    def test_shared_model_archive_cannot_hide_audio_with_missing_or_wrong_owner(self):
        model = dict(id='model', localPath='intake/shared', audioCount=0, audioIndexedBySourceId='audio')
        audio = dict(id='audio', localPath='intake/shared', audioCount=6, audioFileIndex=dict(reportPath='audio.json'))
        self.assertTrue(shared_audio_owner(model, [model, audio], Path('/workspace')))
        self.assertFalse(shared_audio_owner(audio, [model, audio], Path('/workspace')))
        for rows in [[model], [model, dict(audio, localPath='unrelated')], [model, dict(audio, audioIndexedBySourceId='model')]]:
            with self.assertRaises(AssertionError):
                shared_audio_owner(model, rows, Path('/workspace'))

    def test_null_model_audio_index_does_not_discard_a_real_conversion(self):
        self.assertEqual(source_audio_spec({'audioFileIndex': None}), {})
        conversion = {'reportPath': 'decoded.json', 'reportSha256': 'pinned'}
        self.assertEqual(source_audio_spec({'audioFileIndex': None, 'audioConversion': conversion}), conversion)
        explicit = {'reportPath': 'declared.json', 'reportSha256': 'other'}
        self.assertEqual(source_audio_spec({'audioFileIndex': explicit, 'audioConversion': conversion}), explicit)

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

    def test_format_revision_keeps_old_group_and_all_alternate_paths_queryable(self):
        """A consumer using either source ID gets one performance and its old encoding."""
        primary=dict(groupId='kof-old:voice',path='new/float.wav',sha256='float-hash')
        alternate=dict(groupId='kof-old:voice',path='old/pcm.wav',sha256='pcm-hash',primary=False)
        raw=(json.dumps(primary)+'\n').encode();blob=gzip.compress(raw,mtime=0)
        data=dict(groups=[dict(id='kof-old:voice',name='Ash',heroIds=[],backupIds=[],
                              aliasGroupIds=['kof-old','kof-float'],fileCount=1)],
                  alternateAudioSources=[dict(id='kof-old',preferredGroupId='kof-old:voice',
                                              preferredSourceId='kof-float',files=[alternate])],
                  prefetchAliases=[dict(groupId='kof-old:voice',path='new/float.wav',
                                        fragmentPath='raw/prefix.wem',completeSourcePath='raw/full.wem',
                                        alreadyCountedPrimaryAudio=True)],
                  localWorkspace='/local/assets',backups={},synthesisContract={},
                  sourceFileManifest='voice-files.jsonl.gz',sourceFileEncoding='gzip',
                  sourceFileManifestSha256=hashlib.sha256(blob).hexdigest(),
                  uncompressedFileManifestSha256=hashlib.sha256(raw).hexdigest())
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);tool=root/'tools/hero-model-library/query_voice.py'
            tool.parent.mkdir(parents=True)
            shutil.copyfile(Path(__file__).with_name('query_voice.py'),tool)
            index=root/'materials/hero-model-library';index.mkdir(parents=True)
            (index/'voice-index.json').write_text(json.dumps(data))
            (index/'voice-files.jsonl.gz').write_bytes(blob)
            for query in ['kof-old:voice','kof-old','kof-float']:
                with self.subTest(query=query):
                    result=json.loads(subprocess.check_output(
                        [sys.executable,str(tool),query,'--files','--json'],text=True))
                    self.assertEqual([g['id'] for g in result['groups']],['kof-old:voice'])
                    self.assertEqual(len(result['files']),1)
                    self.assertEqual(result['files'][0]['absolutePath'],'/local/assets/new/float.wav')
                    self.assertEqual(result['alternateFiles'],
                                     [dict(alternate,absolutePath='/local/assets/old/pcm.wav')])
                    self.assertEqual(len(result['prefetchAliases']),1)
                    self.assertEqual(result['prefetchAliases'][0]['completeSourceAbsolutePath'],
                                     '/local/assets/raw/full.wem')


if __name__=='__main__':unittest.main()
