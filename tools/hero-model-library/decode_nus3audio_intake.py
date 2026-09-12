#!/usr/bin/env python3
"""Decode every stream in local NUS3AUDIO reserves without executing mod code."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import wave


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('intake', type=Path)
    parser.add_argument('--vgmstream', required=True, type=Path)
    args = parser.parse_args()
    root = args.intake.resolve()
    decoder = args.vgmstream.resolve()
    banks = sorted((root/'extracted').rglob('*.nus3audio'))
    if not banks:
        raise SystemExit('No extracted NUS3AUDIO banks')
    all_banks = list(banks)
    canonical, bank_hashes = {}, {}
    for bank in all_banks:
        if bank.is_symlink() or not bank.resolve().is_relative_to(root):
            raise SystemExit('Source bank must be a regular file inside intake')
        bank_hashes[bank] = digest(bank)
        canonical.setdefault(bank_hashes[bank], bank)
    aliases = [dict(path=p.relative_to(root).as_posix(), sha256=bank_hashes[p], bytes=p.stat().st_size,
                    canonicalBank=canonical[bank_hashes[p]].relative_to(root).as_posix()) for p in all_banks]
    banks = list(canonical.values())
    output = root/'decoded-audio-nus3'
    if output.exists():
        raise SystemExit('Decoded output already exists; preserve it and inspect the existing receipt')
    output.mkdir()
    rows, originals = [], []
    for bank_id, bank in enumerate(banks, 1):
        if bank.is_symlink() or not bank.resolve().is_relative_to(root):
            raise SystemExit('Source bank must be a regular file inside intake')
        assert bank.read_bytes()[:4] == b'NUS3', 'Unexpected bank signature'
        bank_sha = digest(bank)
        meta = json.loads(subprocess.check_output([str(decoder), '-m', '-I', str(bank)], text=True))
        count = meta['streamInfo']['total']
        assert 0 < count <= 10000, 'Unexpected stream count'
        originals.append(dict(path=bank.relative_to(root).as_posix(), sha256=bank_sha,
                              bytes=bank.stat().st_size, streams=count))
        folder = output/f'{bank_id:03d}-{bank.stem}'
        folder.mkdir()
        for stream_id in range(1, count+1):
            info = json.loads(subprocess.check_output(
                [str(decoder), '-m', '-I', '-s', str(stream_id), str(bank)], text=True))
            name = re.sub(r'[^A-Za-z0-9._-]', '_', info['streamInfo'].get('name') or 'stream')[:120]
            target = folder/f'{stream_id:04d}-{name}.wav'
            subprocess.run([str(decoder), '-i', '-w', '-s', str(stream_id), '-o', str(target), str(bank)],
                           check=True, stdout=subprocess.DEVNULL)
            with wave.open(str(target), 'rb') as audio:
                frames, channels, width, rate = audio.getnframes(), audio.getnchannels(), audio.getsampwidth(), audio.getframerate()
                assert audio.getcomptype() == 'NONE', 'Expected PCM WAV'
                assert frames == info['numberOfSamples'] and rate == info['sampleRate']
                assert channels == info['mixingInfo']['outputChannels']
                assert len(audio.readframes(frames)) == frames*channels*width, 'Truncated PCM payload'
            rows.append(dict(path=target.relative_to(root).as_posix(), bytes=target.stat().st_size,
                sha256=digest(target), sourceBank=bank.relative_to(root).as_posix(), sourceBankSha256=bank_sha,
                streamIndex=stream_id, streamName=info['streamInfo'].get('name'), encoding=info['encoding'],
                sampleRate=rate, channels=channels, sampleWidth=width, frames=frames, seconds=frames/rate,
                pcmPayloadVerified=True, speakerVerified=False, transcriptStatus='not-transcribed'))
        assert digest(bank) == bank_sha, 'Original bank changed during decoding'
    report = dict(schema='ggd-nus3audio-decoding@1',
        decoder=dict(name='vgmstream-cli', path=str(decoder), sha256=digest(decoder)),
        looping='ignored; each stream decoded once without normalization or appended fade',
        originalBanks=[dict(a, streams=next(o['streams'] for o in originals if o['path']==a['canonicalBank'])) for a in aliases],
        bankAliases=aliases, originalBankCount=len(all_banks), uniqueDecodedBankCount=len(banks),
        deduplication='Only byte-identical banks share decoded streams; every original bank and costume path is retained in bankAliases. Stream count is not distinct voices.',
        decodedWavCount=len(rows), audioSeconds=sum(r['seconds'] for r in rows),
        files=rows, listeningVerified=False, confirmedVoiceCount=None, synthesisReady=False)
    (root/'nus3audio-decoding.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['decodedWavCount','audioSeconds','confirmedVoiceCount','synthesisReady']}))


if __name__ == '__main__':
    main()
