#!/usr/bin/env python3
"""Decode a hash-pinned Alucard SSM source delivery; never overwrite an intake."""
import argparse
import array
import hashlib
import json
import platform
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path


DECODER_SHA = 'd1d9f856163023833a4959feacda78275a0d26e0b8163d8cd4bfd6d5e8aa7e8e'
SOURCE_ID = 'parallel-ns-alucard-ssbu-audio-decoded-v1'


def sha(p):
    with p.open('rb') as f:
        d = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            d.update(chunk)
    return d.hexdigest()


def put(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def run(argv):
    p = subprocess.run([str(x) for x in argv], capture_output=True, text=True)
    if p.returncode or p.stderr:
        raise RuntimeError(f'{argv[0]} exit={p.returncode}: {p.stderr}')
    return p.stdout


def metadata(decoder, source, stream=None):
    args = [decoder, '-m', '-I']
    if stream is not None:
        args += ['-s', str(stream)]
    value = json.loads(run(args + [source]))
    assert value['version'] == 'r2117'
    return value


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source-root', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--config', type=Path, default=Path(__file__).with_name('source-config.json'))
    ap.add_argument('--decoder', type=Path, default=Path('/private/tmp/ggd-vgmstream-r2117/cli/vgmstream-cli'))
    ap.add_argument('--ffmpeg', type=Path, default=Path('/usr/local/bin/ffmpeg'))
    args = ap.parse_args()
    root, out = args.source_root.resolve(), args.output.resolve()
    assert root.is_dir() and not out.exists(), 'Use a new output directory; preserve earlier deliveries'
    assert not out.is_relative_to(root), 'Do not write into the frozen source intake'
    assert sha(args.decoder) == DECODER_SHA, 'Use the pinned decoder executable'
    config = json.loads(args.config.read_text())
    assert config['upstreamSourceId'] == 'parallel-ns-alucard-ssbu'
    for spec in config['sourceFiles']:
        p = root/spec['path']
        assert not p.is_symlink() and p.resolve().is_relative_to(root) and p.is_file()
        assert p.stat().st_size == spec['bytes'] and sha(p) == spec['sha256'], str(p)
    out.mkdir(parents=True)
    originals = []
    for spec in config['sourceFiles']:
        src = root/spec['path']; dst = out/'raw'/spec['path']
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, dst)
        assert sha(dst) == spec['sha256']
        originals.append(dict(spec, originalAbsolutePath=str(src), preservedPath=str(dst.relative_to(out))))
    (out/'tools').mkdir()
    shutil.copy2(__file__, out/'tools/decode.py')
    shutil.copy2(args.config, out/'tools/source-config.json')
    shutil.copy2(args.decoder, out/'tools/vgmstream-cli')
    tool_info = {'decoder': {'path': str(args.decoder.resolve()), 'sha256': DECODER_SHA, 'version': 'r2117'},
                 'ffmpeg': {'path': str(args.ffmpeg.resolve()), 'sha256': sha(args.ffmpeg),
                            'version': run([args.ffmpeg, '-version']).splitlines()[0]},
                 'python': sys.version, 'platform': platform.platform(),
                 'decoderFlags': ['-i', '-w', '-s', '<one-based-stream-index>', '-o', '<new-output.wav>'],
                 'policy': 'Decode each native stream once, preserving native sample rate/channels; no normalization, resampling, trimming, fade, repeat or gain.'}
    rows, banks, decode_log = [], [], []
    for bank in config['audioInputs']:
        src = out/'raw'/bank['path']
        first = metadata(args.decoder, src)
        total = first['streamInfo']['total'] or 1
        assert total == bank['expectedStreams'], str(src)
        if src.suffix == '.nus3audio':
            assert src.read_bytes()[:4] == b'NUS3'
        elif src.suffix == '.idsp':
            assert src.read_bytes()[:4] == b'IDSP' and total == 1
        else:
            raise AssertionError('Unsupported source type')
        bank_rows = []
        for index in range(1, total + 1):
            info = metadata(args.decoder, src, index)
            # Two original bank entries intentionally resolve to vgmstream's
            # one-second Silence placeholder. Preserve and explicitly flag them.
            assert info['encoding'] in ('Nintendo DSP 4-bit ADPCM', 'Silence')
            if info['encoding'] == 'Silence':
                assert bank['groupId'] == 'alucard-ssm-source-se' and index in (24, 32)
            name = info['streamInfo'].get('name')
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', name or src.stem)[:120]
            target = out/'decoded-audio'/bank['groupId']/f'{index:04d}-{safe}.wav'
            target.parent.mkdir(parents=True, exist_ok=True)
            command = [args.decoder, '-i', '-w', '-s', str(index), '-o', target, src]
            output = run(command)
            with wave.open(str(target), 'rb') as wav:
                frames, rate, channels, width = wav.getnframes(), wav.getframerate(), wav.getnchannels(), wav.getsampwidth()
                pcm = wav.readframes(frames)
                assert wav.getcomptype() == 'NONE' and width == 2
                assert frames == info['numberOfSamples'] and rate == info['sampleRate']
                assert channels == info['mixingInfo']['outputChannels']
                assert len(pcm) == frames * channels * width
            samples = array.array('h', pcm)
            if sys.byteorder != 'little':
                samples.byteswap()
            peak = max((abs(x) for x in samples), default=0) / 32768
            if info['encoding'] == 'Silence':
                assert peak == 0 and name == 'dummy'
            ff = [args.ffmpeg, '-v', 'error', '-nostdin', '-i', target, '-f', 'null', '-']
            run(ff)
            # Decoder replay goes through stdout, leaving every earlier master untouched.
            replay = subprocess.run([str(args.decoder), '-i', '-w', '-s', str(index), '-p', str(src)], capture_output=True)
            assert replay.returncode == 0 and not replay.stderr
            assert hashlib.sha256(replay.stdout).hexdigest() == sha(target), 'Non-deterministic decode'
            row = {'path': target.relative_to(out).as_posix(), 'localAbsolutePath': str(target),
                   'sha256': sha(target), 'bytes': target.stat().st_size, 'format': 'wav-pcm',
                   'sampleRate': rate, 'channels': channels, 'sampleWidth': width, 'frames': frames,
                   'seconds': frames/rate, 'pcmSha256': hashlib.sha256(pcm).hexdigest(),
                   'peakAbsoluteNormalized': peak, 'fullScaleSampleCount': sum(x in (-32768,32767) for x in samples),
                   'sourceId': SOURCE_ID, 'upstreamSourceId': config['upstreamSourceId'],
                   'sourceBank': bank['path'], 'preservedSourceBank': src.relative_to(out).as_posix(),
                   'sourceBankSha256': sha(src), 'streamIndex': index, 'streamName': name,
                   'sourceBankEntryName': bank.get('sourceBankEntryNames', [src.stem])[index-1],
                   'sourceEncoding': info['encoding'], 'sourceSilentPlaceholder': info['encoding'] == 'Silence',
                   'allSamplesZero': peak == 0,
                   'sourceLabelCategory': bank['sourceLabelCategory'], 'groupId': bank['groupId'],
                   'classification': 'unclassified', 'language': 'unknown', 'speakerVerified': False,
                   'speakerReviewed': False, 'languageReviewed': False, 'transcriptReviewed': False,
                   'eventReview': 'source-label-only-unreviewed', 'heroIds': [], 'synthesisReady': False,
                   'pcmPayloadVerified': True, 'ffmpegFullDecode': 'pass', 'deterministicReplay': 'byte-identical',
                   'nativeMetadataPath': f'metadata/{bank["groupId"]}/{index:04d}.json'}
            put(out/row['nativeMetadataPath'], info)
            rows.append(row); bank_rows.append(row['path'])
            decode_log.append({'output': row['path'], 'command': [str(x) for x in command],
                               'decoderStdout': output, 'ffmpegCommand': [str(x) for x in ff]})
        banks.append(dict(bank, nativeMetadata=first, decodedPaths=bank_rows))
    assert len(rows) == 135
    for spec in config['sourceFiles']:
        assert sha(root/spec['path']) == spec['sha256'], 'Source changed during decode'
    report = {'schema': 'ggd-audio-source-delivery@1', 'sourceId': SOURCE_ID,
              'upstreamSourceId': config['upstreamSourceId'], 'localRoot': str(out),
              'sourceRoot': str(root), 'sourceGame': 'Super Smash Bros. Ultimate', 'platform': 'Nintendo Switch',
              'sourceVersion': 'Alucard SSM 2.7', 'selectionClass': 'community-mod',
              'characterLabel': 'Alucard / 阿魯卡多（惡魔城）; native mod slot richter',
              'heroIds': [], 'sourceUrl': config['sourceUrl'], 'author': 'CSharpM7 (C#)',
              'sourceFiles': originals, 'toolInfo': tool_info, 'audioInputs': banks,
              'fileCount': len(rows), 'totalSeconds': sum(x['seconds'] for x in rows),
              'totalAudioBytes': sum(x['bytes'] for x in rows),
              'sourceSilentPlaceholderCount': sum(x['sourceSilentPlaceholder'] for x in rows),
              'allZeroPcmCount': sum(x['allSamplesZero'] for x in rows),
              'files': rows, 'audioGroups': config['audioGroups'],
              'validation': {'freshSourceSha256': 'pass', 'copiedSourceSha256': 'pass', 'allPcmPayloads': 'pass',
                             'allFfmpegFullDecode': 'pass', 'allReplay': 'byte-identical',
                             'sourceUnchangedAfterDecode': 'pass'},
              'readiness': 'decoded-verified-local-awaiting-listening-and-central-registration',
              'confirmedVoiceCount': None, 'synthesisReady': False, 'runtimeReady': False,
              'limitations': ['No language, actual speaker, dialogue, vocalization or skill-event confirmation from bank labels.',
                             'Castlevania Alucard MOD identity is distinct from Hellsing Alucard; no GGD hero mapping assigned.',
                             'Native loops retained in metadata; decoded masters contain each stream once.',
                             'PCM masters are candidates for listening and classification; no backend option/default/deployment performed.']}
    put(out/'decode-commands.json', decode_log)
    put(out/'audioFileIndex.json', report)
    put(out/'delivery.json', {k:v for k,v in report.items() if k not in ('files','audioInputs')})
    put(out/'files-sha256.json', {'schema':'ggd-local-file-manifest@1', 'files':[
        {'path':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
        for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'files-sha256.json']})
    print(json.dumps({'localRoot':str(out),'files':len(rows),'seconds':report['totalSeconds'],
                      'audioBytes':report['totalAudioBytes'],'indexSha256':sha(out/'audioFileIndex.json')}))


if __name__ == '__main__':
    main()
