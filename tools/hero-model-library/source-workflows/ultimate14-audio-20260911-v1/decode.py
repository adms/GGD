#!/usr/bin/env python3
"""Decode Ultimate14's seven unique patch3audio banks into PCM masters.

The source has 56 costume-path aliases for seven byte-identical banks.  This
tool writes a new conversion root, decodes each unique bank once, and records
every alias instead of multiplying the 19 decoded streams into 152 clips.
"""
import argparse
import hashlib
import json
import platform
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path


SOURCE_ID = 'parallel-ns-ultimate14-audio-decoded-v1'
UPSTREAM_ID = 'parallel-ns-ultimate14'
DECODER_SHA = 'd1d9f856163023833a4959feacda78275a0d26e0b8163d8cd4bfd6d5e8aa7e8e'
EXPECTED_PHYSICAL_BANKS = 56
EXPECTED_UNIQUE_BANKS = 7
EXPECTED_STREAMS = 19
CHUNK = 1024 * 1024


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(argv, *, binary=False):
    result = subprocess.run([str(value) for value in argv], capture_output=True,
                            text=not binary)
    if result.returncode or result.stderr:
        raise RuntimeError(f'{argv[0]} exit={result.returncode}: {result.stderr}')
    return result.stdout


def metadata(decoder, bank, stream=None):
    command = [decoder, '-m', '-I']
    if stream is not None:
        command += ['-s', str(stream)]
    value = json.loads(run(command + [bank]))
    if value.get('version') != 'r2117':
        raise ValueError('Pinned vgmstream version changed')
    return value


def regular_inside(root, path):
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
        raise ValueError('Expected regular intake file inside source root: ' + str(path))
    return path



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--decoder', type=Path, default=Path('/private/tmp/ggd-vgmstream-r2117/cli/vgmstream-cli'))
    parser.add_argument('--ffmpeg', type=Path, default=Path('/usr/local/bin/ffmpeg'))
    args = parser.parse_args()
    root, out = args.source_root.resolve(), args.output.resolve()
    decoder, ffmpeg = args.decoder.resolve(), args.ffmpeg.resolve()
    if not root.is_dir() or out.exists() or out.is_relative_to(root):
        raise ValueError('Use a new output directory outside the immutable source intake')
    if sha(decoder) != DECODER_SHA:
        raise ValueError('Pinned vgmstream decoder hash mismatch')
    native_path = root / 'native-format-validation.json'
    regular_inside(root, native_path)
    native = json.loads(native_path.read_text(encoding='utf-8'))
    if (native.get('nativeAudioBankFiles') != EXPECTED_PHYSICAL_BANKS
            or native.get('uniqueNativeAudioBanks') != EXPECTED_UNIQUE_BANKS
            or native.get('nativeAudioEntryCount') != 152):
        raise ValueError('Unexpected Ultimate14 native-audio inventory')
    native_banks = native.get('nativeAudioBanks', [])
    if len(native_banks) != EXPECTED_PHYSICAL_BANKS:
        raise ValueError('Native bank row count mismatch')

    aliases, unique = [], {}
    for row in native_banks:
        member = row['path']
        source = regular_inside(root, root / member)
        actual = sha(source)
        if actual != row['sha256'] or source.stat().st_size != row.get('bytes', source.stat().st_size):
            raise ValueError('Source bank hash or size mismatch: ' + member)
        first = unique.setdefault(actual, {'source': source, 'members': [], 'metadata': row})
        first['members'].append(member)
        aliases.append({'path': member, 'bytes': source.stat().st_size, 'sha256': actual,
                        'nativeEntryCount': row['nativeEntryCount'], 'streamNames': row['streamNames']})
    if len(unique) != EXPECTED_UNIQUE_BANKS:
        raise ValueError('Physical banks no longer deduplicate to seven inputs')

    out.mkdir(parents=True)
    (out / 'tools').mkdir()
    shutil.copy2(__file__, out / 'tools/decode.py')
    shutil.copy2(decoder, out / 'tools/vgmstream-cli')
    tool_info = {'python': sys.version, 'platform': platform.platform(),
                 'decoder': {'path': str(decoder), 'sha256': DECODER_SHA, 'version': 'r2117'},
                 'ffmpeg': {'path': str(ffmpeg), 'sha256': sha(ffmpeg),
                            'version': run([ffmpeg, '-version']).splitlines()[0]},
                 'policy': 'One PCM master per unique source-bank stream. Preserve all 56 costume aliases and metadata; no gain, resample, trim, loop extension or guessed speaker/language/event binding.'}
    rows, input_rows, log, groups = [], [], [], []
    for bank_number, (bank_sha, bank) in enumerate(sorted(unique.items()), 1):
        source = bank['source']
        before = sha(source)
        copied = out / 'raw' / f'{bank_number:02d}-{bank_sha}.patch3audio'
        copied.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, copied)
        if sha(copied) != bank_sha:
            raise ValueError('Copied bank differs: ' + str(source))
        meta = metadata(decoder, copied)
        count = meta['streamInfo'].get('total')
        if not isinstance(count, int) or count <= 0:
            raise ValueError('Invalid source stream count: ' + str(copied))
        source_names = bank['metadata']['streamNames']
        if count != bank['metadata']['nativeEntryCount'] or len(source_names) != count:
            raise ValueError('Native index and decoder stream count differ: ' + str(source))
        label = re.sub(r'[^a-z0-9]+', '-', source.stem.lower()).strip('-')
        group_id = f'ultimate14-{label}'
        prefix = f'decoded-audio/{group_id}/'
        paths = []
        for index in range(1, count + 1):
            info = metadata(decoder, copied, index)
            name = info['streamInfo'].get('name') or source_names[index - 1]
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', name)[:120]
            target = out / prefix / f'{index:04d}-{safe}.wav'
            target.parent.mkdir(parents=True, exist_ok=True)
            command = [decoder, '-i', '-w', '-s', str(index), '-o', target, copied]
            run(command)
            with wave.open(str(target), 'rb') as wav:
                frames, rate = wav.getnframes(), wav.getframerate()
                channels, width = wav.getnchannels(), wav.getsampwidth()
                pcm = wav.readframes(frames)
                if (wav.getcomptype() != 'NONE' or width != 2 or frames != info['numberOfSamples']
                        or rate != info['sampleRate'] or channels != info['mixingInfo']['outputChannels']
                        or len(pcm) != frames * channels * width):
                    raise ValueError('WAV metadata/PCM validation failed: ' + str(target))
            run([ffmpeg, '-v', 'error', '-nostdin', '-i', target, '-f', 'null', '-'])
            replay = run([decoder, '-i', '-w', '-s', str(index), '-p', copied], binary=True)
            if hashlib.sha256(replay).hexdigest() != sha(target):
                raise ValueError('Non-deterministic replay: ' + str(target))
            item = {'path': target.relative_to(out).as_posix(), 'localAbsolutePath': str(target),
                    'bytes': target.stat().st_size, 'sha256': sha(target), 'format': 'wav-pcm',
                    'sampleRate': rate, 'channels': channels, 'sampleWidth': width, 'frames': frames,
                    'seconds': frames / rate, 'pcmSha256': hashlib.sha256(pcm).hexdigest(),
                    'sourceId': SOURCE_ID, 'upstreamSourceId': UPSTREAM_ID,
                    'sourceBank': copied.relative_to(out).as_posix(), 'sourceBankSha256': bank_sha,
                    'sourceAliases': sorted(bank['members']), 'streamIndex': index, 'streamName': name,
                    'sourceBankEntryName': source_names[index - 1], 'sourceEncoding': info['encoding'],
                    'sourceLabelCategory': 'sound-effect-source-labelled', 'groupId': group_id,
                    'audioCategory': 'unclassified', 'reportedLanguage': 'unreviewed', 'language': 'unknown',
                    'speakerVerified': False, 'speakerReviewed': False, 'languageReviewed': False,
                    'transcriptReviewed': False, 'eventBindingsVerified': False, 'countAsNewPerformance': False,
                    'synthesisReady': False, 'pcmPayloadVerified': True, 'ffmpegFullDecode': 'pass',
                    'deterministicReplay': 'byte-identical', 'heroIds': []}
            rows.append(item); paths.append(item['path'])
            put(out / 'metadata' / group_id / f'{index:04d}.json', info)
            log.append({'output': item['path'], 'command': [str(v) for v in command],
                        'ffmpegCommand': [str(ffmpeg), '-v', 'error', '-nostdin', '-i', item['path'], '-f', 'null', '-']})
        groups.append({'id': group_id, 'name': f'Ultimate14 / {source.stem} / 原始 se_ 標籤未聽審音訊',
                       'heroIds': [], 'pathPrefixes': [prefix], 'fileCount': len(paths),
                       'audioCategory': 'unclassified', 'sourceLabelCategory': 'sound-effect-source-labelled',
                       'reportedLanguage': 'unreviewed', 'speakerVerified': False, 'languageVerified': False,
                       'eventBindingsVerified': False, 'synthesisReady': False, 'countAsNewPerformance': False,
                       'classificationEvidence': 'se_ 名稱僅為來源事件標籤；未確認說話者、語言、台詞或遊戲事件。'})
        input_rows.append({'canonicalPath': copied.relative_to(out).as_posix(), 'sha256': bank_sha,
                           'bytes': copied.stat().st_size, 'streamCount': count,
                           'sourceAliases': sorted(bank['members']), 'nativeEntryNames': source_names})
        if sha(source) != before:
            raise ValueError('Original intake changed during conversion: ' + str(source))
    if len(rows) != EXPECTED_STREAMS:
        raise ValueError(f'Expected {EXPECTED_STREAMS} streams, got {len(rows)}')
    for alias in aliases:
        if sha(root / alias['path']) != alias['sha256']:
            raise ValueError('Original alias changed during conversion: ' + alias['path'])
    report = {'schema': 'ggd-ultimate14-decoded-audio@1', 'sourceId': SOURCE_ID, 'upstreamSourceId': UPSTREAM_ID,
              'localRoot': str(out), 'sourceRoot': str(root), 'sourceGame': 'Super Smash Bros. Ultimate',
              'platform': 'Nintendo Switch', 'sourceVersion': 'Ultimate14 1.0', 'selectionClass': 'community-mod',
              'sourceUrl': 'https://github.com/CSharpM7/Ultimate14-release/releases/tag/1.0',
              'toolInfo': tool_info, 'physicalBankAliasCount': len(aliases), 'uniqueBankCount': len(input_rows),
              'physicalNativeEntryCount': 152, 'decodedWavCount': len(rows),
              'totalSeconds': sum(row['seconds'] for row in rows), 'totalAudioBytes': sum(row['bytes'] for row in rows),
              'sourceAliasDeduplication': '56 costume-path bank aliases -> 7 byte-identical canonical banks -> 19 decoded streams. Aliases are retained per canonical input and per decoded master.',
              'audioGroups': groups, 'audioInputs': input_rows, 'bankAliases': sorted(aliases, key=lambda row: row['path']),
              'files': rows, 'validation': {'allOriginalAliasSha256': 'pass', 'copiedCanonicalSha256': 'pass',
                                              'allPcmPayloads': 'pass', 'allFfmpegFullDecode': 'pass',
                                              'allReplay': 'byte-identical', 'sourceUnchangedAfterDecode': 'pass'},
              'readiness': 'decoded-verified-local-awaiting-listening-and-central-registration',
              'confirmedVoiceCount': None, 'synthesisReady': False, 'runtimeReady': False,
              'limitations': ['No character body is included by Ultimate14.',
                              'The 56 costume-path aliases and 152 native entries are not 152 distinct clips.',
                              'Source se_ labels do not prove dialogue, speaker, language, voice or skill event.',
                              'No backend option, default or deployment is performed.']}
    put(out / 'decode-commands.json', log)
    put(out / 'audioFileIndex.json', report)
    put(out / 'delivery.json', {key: value for key, value in report.items() if key not in {'files', 'audioInputs', 'bankAliases'}})
    put(out / 'files-sha256.json', {'schema': 'ggd-local-file-manifest@1', 'files': [
        {'path': path.relative_to(out).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha(path)}
        for path in sorted(out.rglob('*')) if path.is_file() and path.name != 'files-sha256.json']})
    print(json.dumps({'sourceId': SOURCE_ID, 'canonicalBanks': len(input_rows), 'aliases': len(aliases),
                      'decodedWavCount': len(rows), 'seconds': report['totalSeconds'],
                      'audioBytes': report['totalAudioBytes'], 'indexSha256': sha(out / 'audioFileIndex.json')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
