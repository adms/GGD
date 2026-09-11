#!/usr/bin/env python3
"""Attach a fully verified rejected KOF XV conversion probe to its source record."""
import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / 'GGD-Asset-Library'
SOURCE_ID = 'kof-xv-iori-whitemagesunny-raw'
ATTEMPT = ASSET_ROOT / 'conversions/kof-xv-iori-assimp-probe-v1'
DOWNLOADS = ROOT / 'materials/hero-model-library/download-sources.json'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    report = read(ATTEMPT / 'conversion-attempt.json')
    output = ATTEMPT / report['output']['path']
    if report['rejection']['status'] != 'rejected-not-self-contained' or report['output']['sha256'] != sha256(output):
        raise ValueError('Unexpected or changed conversion probe')
    receipt = read(args.receipt)
    if (receipt.get('schema') != 'ggd-intake-backup-receipt@1'
            or not all(receipt.get(key) is True for key in ['fullGetVerified', 'allMemberSha256Verified', 'localUnchanged'])
            or Path(receipt.get('source', '')).resolve() != ATTEMPT.resolve()):
        raise ValueError('Backup receipt is incomplete or targets another conversion stage')
    manifest = read(Path(receipt['manifest']))
    if not any(row == {'path': report['output']['path'], 'bytes': output.stat().st_size, 'sha256': sha256(output)}
               for row in manifest['files']):
        raise ValueError('Verified backup does not contain rejected Assimp GLB')
    data = read(DOWNLOADS)
    sources = [row for row in data['publicSources'] if row['id'] == SOURCE_ID]
    if len(sources) != 1:
        raise ValueError('Expected one KOF XV Iori source')
    attempt = {'id': 'kof-xv-iori-assimp-probe-v1', 'status': report['rejection']['status'],
               'localPath': str(ATTEMPT), 'reportPath': str(ATTEMPT/'conversion-attempt.json'),
               'reportSha256': sha256(ATTEMPT/'conversion-attempt.json'),
               'outputPath': str(output), 'outputSha256': sha256(output),
               's3Uri': receipt['s3Uri'], 's3ArchiveMember': report['output']['path'],
               'backupReceiptPath': str(args.receipt.resolve()), 'backupReceiptSha256': sha256(args.receipt),
               's3Use': 'backup-only-not-runtime-entry', 'runtimeReady': False,
               'reason': report['rejection']['reason']}
    prior = [row for row in sources[0].get('conversionAttempts', []) if row['id'] == attempt['id']]
    if prior and prior != [attempt]:
        raise ValueError('Existing probe record differs')
    if not prior:
        sources[0].setdefault('conversionAttempts', []).append(attempt)
    DOWNLOADS.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'sourceId': SOURCE_ID, 'attempt': attempt['id'], 'status': attempt['status']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
