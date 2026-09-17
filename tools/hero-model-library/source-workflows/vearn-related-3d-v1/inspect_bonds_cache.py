#!/usr/bin/env python3
"""Preserve the verified Android cache and inventory files without executing them."""
import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'tools/hero-model-library'))
from extract_public_sources import unpack_zip


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=ROOT.parent)
    args = parser.parse_args()
    intake = args.workspace.resolve() / 'GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121'
    archive = intake / 'original/com.square_enix.android_googleplay.dqdaihb-1.17.0.121.zip'
    expected = '0b66d970b997a0216e09e2d6f3ba4fe0ed31f8a8cb94bef21e9e0ab2091c3644'
    if sha(archive) != expected: raise ValueError('Cache archive SHA-256 differs')
    dest = intake / 'extracted/cache-v1'
    index = intake / 'extracted/cache-v1-files.jsonl.gz'
    if not dest.exists():
        unpack_zip(archive, dest)
    elif not index.is_file():
        raise ValueError('Incomplete previous extraction; preserve it and choose a new version before retrying')
    rows = []
    signatures = Counter()
    for path in sorted(dest.rglob('*')):
        if not path.is_file(): continue
        with path.open('rb') as handle: magic = handle.read(16)
        kind = next((name for name in ('UnityFS', 'UnityRaw', 'UnityWeb', 'AFS2', 'CRID', 'FSB5') if magic.startswith(name.encode())), 'unclassified')
        signatures[kind] += 1
        rows.append({'path': path.relative_to(dest).as_posix(), 'absolutePath': str(path),
                     'bytes': path.stat().st_size, 'sha256': sha(path), 'magicHex': magic.hex(), 'containerKind': kind})
    payload = ''.join(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n' for row in rows).encode()
    encoded = gzip.compress(payload, mtime=0)
    if index.exists() and index.read_bytes() != encoded: raise ValueError('Preserved extracted files changed')
    index.write_bytes(encoded)
    receipt = {'schema': 'ggd.bonds-cache-preservation@1', 'sourceId': 'internet-archive-heros-bonds-final-cache-1.17.0.121',
               'archive': {'absolutePath': str(archive), 'sha256': expected, 'bytes': archive.stat().st_size},
               'extractedRoot': str(dest), 'fileCount': len(rows), 'fileBytes': sum(row['bytes'] for row in rows),
               'containerKindsByMagic': dict(sorted(signatures.items())),
               'fileIndex': {'absolutePath': str(index), 'sha256': sha(index), 'bytes': index.stat().st_size},
               'identityVerified': False, 'modelConverted': False, 's3BackupVerified': False,
               'limitations': ['Container signatures are discovery evidence only; no ghost-eye Vearn mesh identity is established.',
                               'Downloaded app/cache code was not executed. S3 backup remains pending.']}
    out = ROOT / 'materials/hero-model-library/source-inventories/vearn-related-3d-v1/bonds-cache-preservation.json'
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__': main()
