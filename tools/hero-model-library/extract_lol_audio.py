#!/usr/bin/env python3
"""Snapshot installed LoL champion WADs and extract native audio without network.

Run with the existing CDTB Python environment. Originals and unresolved paths
are retained; per-WAD receipts are frozen and support checked resumption.
"""
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import shutil
import struct

from embedded_resources import wwise_media


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def wpk_media(blob):
    """Strict container bounds; numeric names are media IDs, not event names."""
    if len(blob) < 12 or blob[:4] != b'r3d2':
        raise ValueError('Invalid WPK header')
    version, count = struct.unpack_from('<II', blob, 4)
    if version != 1 or count > (len(blob) - 12) // 4:
        raise ValueError('Unsupported WPK version or invalid offset table')
    rows = []
    for i in range(count):
        offset, = struct.unpack_from('<I', blob, 12 + i * 4)
        if offset < 12 + count * 4 or offset + 12 > len(blob):
            raise ValueError('Invalid WPK entry offset')
        data_offset, size, chars = struct.unpack_from('<III', blob, offset)
        end = offset + 12 + chars * 2
        if end > len(blob) or not size or data_offset < end or data_offset + size > len(blob):
            raise ValueError('Invalid WPK name or payload bounds')
        name = blob[offset + 12:end].decode('utf-16-le').rstrip('\0')
        if not re.fullmatch(r'\d+\.wem', name, re.IGNORECASE):
            raise ValueError('Unexpected WPK media filename')
        rows.append((name, blob[data_offset:data_offset + size]))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wad-directory', required=True, type=Path)
    parser.add_argument('--hashes', required=True, type=Path)
    parser.add_argument('--intake', required=True, type=Path)
    args = parser.parse_args()
    from cdtb.wad import Wad
    import cdtb.wad
    root = args.intake.resolve()
    root.mkdir(parents=True, exist_ok=True)
    source_dir = args.wad_directory.resolve()
    if source_dir == root or root.is_relative_to(source_dir):
        raise ValueError('Intake must be separate from installed assets')
    hashes = {}
    for line in args.hashes.open():
        key, value = line.rstrip('\n').split(' ', 1)
        hashes[int(key, 16)] = value
    tool = {'name': 'CDTB', 'version': importlib.metadata.version('cdtb'),
            'wadModuleSha256': sha(Path(cdtb.wad.__file__)),
            'hashesSha256': sha(args.hashes),
            'formatReferences': ['https://github.com/CommunityDragon/CDTB',
                                 'https://github.com/Virace/league-tools/blob/package/docs/audio_bank_parsing.md']}
    priorities = {'warwick', 'lux', 'karthus', 'yasuo', 'missfortune', 'leesin', 'xerath'}
    paths = sorted(source_dir.glob('*.wad.client'), key=lambda p: (p.name.split('.')[0].lower() not in priorities, p.name))
    packages = []
    for path in paths:
        name = path.name.removesuffix('.wad.client')
        home = root / 'packages' / name
        receipt = home / 'extraction.json'
        if receipt.exists():
            data = json.loads(receipt.read_text())
            for row in data['files']:
                f = home / row['path']
                if f.stat().st_size != row['bytes'] or sha(f) != row['sha256']:
                    raise ValueError('Frozen package changed: ' + str(f))
            packages.append(data)
            continue
        home.mkdir(parents=True, exist_ok=False)
        original = home / path.name
        before = path.stat()
        shutil.copy2(path, original)
        original_sha = sha(original)
        if sha(path) != original_sha or path.stat().st_mtime_ns != before.st_mtime_ns:
            raise ValueError('Installed WAD changed during snapshot')
        wad = Wad(str(original), hashes)
        files = [dict(path=original.name, bytes=original.stat().st_size, sha256=original_sha, kind='original-wad')]
        banks, media, errors, unresolved = [], [], [], []

        def save(rel, blob, **extra):
            target = home / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(blob)
            row = dict(path=rel, bytes=len(blob), sha256=hashlib.sha256(blob).hexdigest(), **extra)
            files.append(row)
            return row

        with original.open('rb') as stream:
            for entry in wad.files:
                if entry.offset + entry.compressed_size > original.stat().st_size:
                    raise ValueError('Out-of-bounds WAD entry')
                if entry.ext and entry.ext not in {'bnk', 'wpk', 'wem', 'ogg', 'wav'}:
                    continue
                try:
                    blob = entry.read_data(stream, wad.subchunk_toc)
                    if blob is None:
                        continue
                    if len(blob) != entry.size:
                        raise ValueError('Decompressed entry size mismatch')
                    ext = entry.ext or entry.guess_extension(blob)
                    if not entry.path:
                        unresolved.append(dict(pathHash=f'{entry.path_hash:016x}', detectedFormat=ext))
                    if ext not in {'bnk', 'wpk', 'wem', 'ogg', 'wav'}:
                        continue
                    native_id = f'{entry.path_hash:016x}'
                    row = save(f'native/{native_id}.{ext}', blob, sourcePath=entry.path,
                               pathHash=native_id, kind='native-bank' if ext in {'bnk', 'wpk'} else 'native-audio')
                    banks.append(row)
                    payloads = wwise_media(blob) if ext == 'bnk' else wpk_media(blob) if ext == 'wpk' else []
                    for index, (mid, payload) in enumerate(payloads):
                        filename = str(mid) if ext == 'wpk' else str(mid) + '.wem'
                        media.append(save(f'media/{native_id}/{index:05d}-{filename}', payload,
                                          sourceBank=row['path'], sourcePath=entry.path, mediaId=str(mid), kind='wem'))
                except (ValueError, struct.error, UnicodeError) as exc:
                    errors.append(dict(pathHash=f'{entry.path_hash:016x}', sourcePath=entry.path, error=str(exc)))
        data = dict(schema='ggd-lol-audio-extraction@1', nativeId=name, originalPath=str(path),
                    originalSha256=original_sha, wadVersion=wad.version, wadEntries=len(wad.files),
                    files=files, nativeAudioBanks=banks, media=media, errors=errors, unresolved=unresolved,
                    reportedLocale=name.split('.', 1)[1] if '.' in name else None,
                    languageEvidence='outer installed WAD suffix; internal en_us paths are not listening evidence',
                    speakerVerified=False, languageVerified=False, tool=tool, immutable=True)
        receipt.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        packages.append(data)
        summary = dict(schema='ggd-lol-audio-batch@1', localRoot=str(root), sourceDirectory=str(source_dir),
                       expectedWads=len(paths), completeWads=len(packages),
                       nativeBanks=sum(len(p['nativeAudioBanks']) for p in packages),
                       wemFiles=sum(len(p['media']) for p in packages),
                       errors=sum(len(p['errors']) for p in packages),
                       locales=dict(Counter(p['reportedLocale'] or 'shared' for p in packages)),
                       receipts=[f'packages/{p["nativeId"]}/extraction.json' for p in packages])
        temporary = root / 'batch-progress.tmp'
        temporary.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(root / 'batch-progress.json')
        print(json.dumps({k:summary[k] for k in ['completeWads', 'expectedWads', 'nativeBanks', 'wemFiles', 'errors']}), flush=True)


if __name__ == '__main__':
    main()
