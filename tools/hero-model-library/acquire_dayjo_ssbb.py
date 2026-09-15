#!/usr/bin/env python3
"""Preserve the complete ZIP packs linked by Dayjo's public Brawl sound index.

Reads the page's data as text, never executes its JavaScript. Downloads use the
published relative links without authentication or access-control workarounds.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import wave
import zipfile

from extract_public_sources import safe_path

PAGE = 'https://noproblo.dayjo.org/zeldasounds/ssbb/'
DATA = 'https://noproblo.dayjo.org/zeldasounds/ZS_SSBB.js'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise ValueError('Use a new intake directory; preserving ' + str(path))
    subprocess.run(['curl', '-fSL', '--max-time', '60', '--max-filesize', '20000000',
                    url, '-o', str(path)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = args.output.resolve()
    fetch(DATA, root/'source-index.js')
    data = (root/'source-index.js').read_text()
    names = sorted(set(re.findall(r'SSBB_[A-Za-z]+\.zip', data)))
    if not names:
        raise ValueError('No complete ZIP links in the published index')
    packs = []
    for name in names:
        archive = root/'original'/name
        fetch(PAGE + name, archive)
        rows = []
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            assert sum(i.file_size for i in z.infolist()) < 100_000_000
            for info in z.infolist():
                if info.is_dir():
                    continue
                assert (info.external_attr >> 16) & 0o170000 != 0o120000
                dest = safe_path(root/'extracted'/archive.stem, info.filename)
                dest.parent.mkdir(parents=True, exist_ok=True)
                with dest.open('xb') as stream:
                    stream.write(z.read(info))
                row = dict(path=dest.relative_to(root).as_posix(), bytes=dest.stat().st_size,
                           sha256=sha(dest), archiveMember=info.filename)
                if dest.suffix.lower() == '.wav':
                    with wave.open(str(dest), 'rb') as audio:
                        frames = audio.getnframes()
                        payload = audio.readframes(frames)
                        assert len(payload) == frames*audio.getnchannels()*audio.getsampwidth()
                        row.update(audioFrames=frames, channels=audio.getnchannels(),
                                   sampleRate=audio.getframerate(), sampleBytes=audio.getsampwidth(),
                                   seconds=frames/audio.getframerate(), category='unclassified')
                rows.append(row)
        packs.append(dict(id=archive.stem, downloadUrl=PAGE+name,
                          archivePath=archive.relative_to(root).as_posix(), bytes=archive.stat().st_size,
                          sha256=sha(archive), crcVerified=True, files=rows))
        print(name, len(rows), 'files verified', flush=True)
    report = dict(schema='ggd-public-console-audio-intake@1', sourcePage=PAGE,
                  sourceDataUrl=DATA, sourceDataSha256=sha(root/'source-index.js'),
                  sourceGame='Super Smash Bros. Brawl', platform='Wii', packs=packs,
                  audioCount=sum('audioFrames' in f for p in packs for f in p['files']),
                  audioSeconds=sum(f.get('seconds',0) for p in packs for f in p['files']),
                  confirmedVoiceCount=None, listeningVerified=False, eventBindingsVerified=False,
                  modelCount=0, animationCount=0, vfxCount=0, runtimeReady=False,
                  note='Source index describes voices, effects and pitch variants; native game bytes and event bindings are not independently verified.')
    (root/'acquisition.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'packs'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
