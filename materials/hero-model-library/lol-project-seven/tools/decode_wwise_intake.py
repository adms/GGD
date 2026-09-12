#!/usr/bin/env python3
"""Decode local WEM media with vgmstream; preserve originals and event gaps.

Requires vgmstream-cli r2117. No MOD assembly is executed. Float32 WAV keeps
native rate/channels and peaks above unity; PCM16 is an explicit diagnostic
option that can clip. Neither mode adds a fade, loops, normalizes or resamples.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import wave


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def riff_chunks(blob):
    if len(blob) < 12 or blob[:4] != b'RIFF' or blob[8:12] != b'WAVE':
        raise ValueError('Expected little-endian Wwise RIFF/WAVE')
    if struct.unpack_from('<I', blob, 4)[0] + 8 != len(blob):
        raise ValueError('RIFF length differs from available bytes; possible prefetch')
    chunks, offset = {}, 12
    while offset < len(blob):
        if offset + 8 > len(blob):
            raise ValueError('Truncated RIFF chunk header')
        kind, size = struct.unpack_from('<4sI', blob, offset)
        end = offset + 8 + size
        if end > len(blob) or kind in chunks:
            raise ValueError('Truncated or duplicate RIFF chunk')
        chunks[kind] = blob[offset + 8:end]
        offset = end if end == len(blob) else end + size % 2
    if len(chunks.get(b'fmt ', b'')) < 16 or not chunks.get(b'data'):
        raise ValueError('Missing RIFF format or media payload')
    return chunks


def inspect_riff(blob):
    chunks = riff_chunks(blob)
    codec, channels, rate = struct.unpack_from('<HHI', chunks[b'fmt '])
    return {'codecTag': codec, 'channels': channels, 'sampleRate': rate,
            'riffBytes': len(blob), 'dataBytes': len(chunks[b'data'])}


def inspect_pcm(path, metadata):
    with wave.open(str(path), 'rb') as stream:
        if stream.getcomptype() != 'NONE' or stream.getsampwidth() != 2:
            raise ValueError('Expected uncompressed PCM16 WAV')
        channels, rate, frames = stream.getnchannels(), stream.getframerate(), stream.getnframes()
        if (channels, rate, frames) != (metadata['channels'], metadata['sampleRate'], metadata['numberOfSamples']):
            raise ValueError('Decoded channel, rate or frame count differs from source metadata')
        if frames <= 0 or metadata['playSamples'] != frames:
            raise ValueError('Unexpected empty stream or loop/fade expansion')
        pcm = stream.readframes(frames)
        if len(pcm) != frames * channels * 2:
            raise ValueError('Truncated PCM payload')
    samples = array.array('h', pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(abs(v) for v in samples)
    return {'channels': channels, 'sampleRate': rate, 'frames': frames,
            'seconds': frames / rate, 'pcmBytes': len(pcm),
            'pcmSha256': hashlib.sha256(pcm).hexdigest(), 'peakAbsPcm16': peak,
            'rmsPcm16': (sum(v * v for v in samples) / len(samples)) ** .5,
            'fullScaleSamples': sum(v in (-32768, 32767) for v in samples),
            'allSilent': peak == 0}


def inspect_float32(path, metadata):
    chunks = riff_chunks(path.read_bytes())
    codec, channels, rate, byte_rate, block, bits = struct.unpack_from('<HHIIHH', chunks[b'fmt '])
    pcm = chunks[b'data']
    if codec != 3 or bits != 32 or block != channels * 4 or byte_rate != rate * block:
        raise ValueError('Expected IEEE float32 WAV with consistent block alignment')
    if channels <= 0 or len(pcm) % block:
        raise ValueError('Incomplete float32 PCM frame')
    frames = len(pcm) // block
    if (channels, rate, frames) != (metadata['channels'], metadata['sampleRate'], metadata['numberOfSamples']):
        raise ValueError('Decoded channel, rate or frame count differs from source metadata')
    if frames <= 0 or metadata['playSamples'] != frames:
        raise ValueError('Unexpected empty stream or loop/fade expansion')
    samples = array.array('f', pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    if not all(math.isfinite(v) for v in samples):
        raise ValueError('Non-finite float32 audio sample')
    peak = max(abs(v) for v in samples)
    return {'channels': channels, 'sampleRate': rate, 'frames': frames,
            'seconds': frames / rate, 'pcmBytes': len(pcm),
            'pcmSha256': hashlib.sha256(pcm).hexdigest(), 'peakAbsFloat': peak,
            'rmsFloat': (sum(v * v for v in samples) / len(samples)) ** .5,
            'samplesAboveUnity': sum(abs(v) > 1 for v in samples),
            'allSilent': peak == 0}


def decode(source, output, decoder, sample_format='float32'):
    if sample_format not in ('float32', 'pcm16'):
        raise ValueError('Unsupported sample format')
    source, output, decoder = source.resolve(), output.resolve(), decoder.resolve()
    inputs = sorted(source.rglob('*.wem'))
    if not source.is_dir() or not inputs or not decoder.is_file():
        raise ValueError('Expected existing WEM directory and decoder executable')
    if output == source or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError('Output must be separate from the WEM input tree')
    if any(p.is_symlink() or not p.resolve().is_relative_to(source) for p in inputs):
        raise ValueError('WEM input must stay within the source directory')
    # r2117 deliberately routes -V through its argument-parser exit 1 path.
    info = subprocess.run([str(decoder), '-V'], capture_output=True, text=True, timeout=20)
    if info.returncode not in (0, 1) or info.stderr:
        raise ValueError('Cannot inspect decoder version')
    version = json.loads(info.stdout)['version']
    if version != 'r2117':
        raise ValueError('Use pinned vgmstream-cli r2117')
    output.mkdir(parents=True, exist_ok=False)
    records = []
    for path in inputs:
        rel = path.relative_to(source)
        row = {'source': rel.as_posix(), 'sourceSha256': sha256(path),
               'sourceBytes': path.stat().st_size, 'eventBindings': [], 'decoded': False}
        try:
            native = inspect_riff(path.read_bytes())
            metadata = json.loads(subprocess.check_output(
                [str(decoder), '-m', '-i', '-I', str(path)], text=True, timeout=30))
            if metadata['channels'] != native['channels'] or metadata['sampleRate'] != native['sampleRate']:
                raise ValueError('Decoder metadata differs from native RIFF format')
            if metadata['streamInfo']['total'] > 1 or 'prefetch' in metadata['metadataSource'].lower():
                raise ValueError('Multiple streams or prefetch require separate handling')
            target = output / 'wav' / rel.with_suffix('.wav')
            target.parent.mkdir(parents=True, exist_ok=True)
            command = [str(decoder), '-i', '-I', *(['-w'] if sample_format == 'float32' else []), '-o', str(target), str(path)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
            target.with_suffix('.decoder.log').write_text(result.stdout + result.stderr)
            result.check_returncode()
            pcm = (inspect_float32 if sample_format == 'float32' else inspect_pcm)(target, metadata)
            if sha256(path) != row['sourceSha256']:
                raise ValueError('Source WEM changed while decoding')
            row.update(decoded=True, native=native, metadata=metadata, pcm=pcm,
                       sampleFormat=sample_format, output=target.relative_to(output).as_posix(), bytes=target.stat().st_size,
                       sha256=sha256(target))
        except (ValueError, OSError, subprocess.SubprocessError, wave.Error, KeyError) as exc:
            row['error'] = str(exc)
        records.append(row)
    report = {'schema': 'ggd-wwise-intake-audio@1',
              'decoder': {'name': 'vgmstream-cli', 'version': version, 'sha256': sha256(decoder),
                          'source': 'https://github.com/vgmstream/vgmstream/tree/r2117',
                          'sourceCommit': '71e2361042531fe767fb98300cf8c1ee95e539a0'},
              'inputDirectory': str(source), 'commandPolicy': ['-i', '-I', *(['-w'] if sample_format == 'float32' else []), '-o'],
              'sampleFormat': sample_format,
              'outputFormat': sample_format + ' WAV; native rate and channels; once; no fade, normalization or resampling',
              'files': records, 'inputCount': len(records),
              'decodedCount': sum(r['decoded'] for r in records),
              'failedCount': sum(not r['decoded'] for r in records),
              'eventBindingsVerified': False, 'listeningReviewComplete': False,
              'runtimeReady': False,
              'limitations': ['RIFF and decoder frame agreement do not prove bank event coverage or perceptual fidelity.',
                              'Original bank, WEM media, loop metadata and unconverted records must be retained.',
                              'Float peaks above unity require a recorded gain decision before playback or integer encoding; diagnostic PCM16 may clip.']}
    (output / 'audio-index.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--decoder', type=Path, required=True)
    parser.add_argument('--sample-format', choices=['float32', 'pcm16'], default='float32')
    args = parser.parse_args()
    report = decode(args.source, args.output, args.decoder, args.sample_format)
    print(json.dumps({k: report[k] for k in ('inputCount', 'decodedCount', 'failedCount', 'runtimeReady')}))
    raise SystemExit(1 if report['failedCount'] else 0)
