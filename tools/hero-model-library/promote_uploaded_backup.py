#!/usr/bin/env python3
"""Promote one fully read-back frozen ZIP into the central source catalog.

The upload receipt must have been written by upload_backup.py after it verified
the complete S3 object. This command independently checks the frozen ZIP and
every recorded member before it updates either catalog. It never uploads,
deletes, overwrites, or replaces an existing primary backup.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
BUCKET = 'ggd-390630837668-ap-east-2-an'


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def verify_members(archive, rows):
    paths = [row['path'] for row in rows]
    if len(paths) != len(set(paths)):
        raise ValueError('Pending archive has duplicate member paths')
    with zipfile.ZipFile(archive) as bundle:
        if bundle.namelist() != paths:
            raise ValueError('ZIP member list differs from the frozen pending record')
        for row in rows:
            payload = bundle.read(row['path'])
            if len(payload) != row['bytes'] or hashlib.sha256(payload).hexdigest() != row['sha256']:
                raise ValueError('ZIP member verification failed: ' + row['path'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_id')
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    receipt_path = args.receipt.resolve()
    if not receipt_path.is_relative_to(workspace):
        raise ValueError('Receipt must remain inside the workspace')
    receipt = load(receipt_path)
    downloads_path = REPO / 'materials/hero-model-library/download-sources.json'
    index_path = REPO / 'materials/hero-model-library/public-source-files.json'
    downloads = load(downloads_path)
    index = load(index_path)
    matches = [source for collection in ('publicSources', 'paidSources')
               for source in downloads.get(collection, []) if source.get('id') == args.source_id]
    if len(matches) != 1:
        raise ValueError('Expected one registered source ID')
    source = matches[0]
    published = [row for row in index.get('sources', []) if row.get('id') == args.source_id]
    if source.get('backup', {}).get('readbackVerified'):
        if len(published) != 1 or published[0].get('sha256') != source['backup'].get('sha256'):
            raise ValueError('Published source and primary backup disagree')
        print(json.dumps({'id': args.source_id, 'alreadyPromoted': True, 's3Uri': source['backup']['s3Uri']}))
        return
    pending = source.get('pendingBackup')
    if not pending or pending.get('status') != 'not-uploaded':
        raise ValueError('Expected one unpromoted frozen pending backup')
    rows = [row for row in index.get('pendingUploads', [])
            if (row.get('id'), row.get('sha256')) == (args.source_id, pending.get('sha256'))]
    if len(rows) != 1:
        raise ValueError('Expected one matching central pending record')
    row = rows[0]
    for key in ('localArchive', 'plannedS3Uri', 'bytes', 'sha256'):
        if pending.get(key) != row.get(key):
            raise ValueError('Source and central pending archive identities disagree: ' + key)
    allowed = f's3://{BUCKET}/legacy/'
    if not row['plannedS3Uri'].startswith(allowed) or not row['plannedS3Uri'].endswith('/' + row['sha256'] + '.zip'):
        raise ValueError('Unexpected S3 archive destination')
    for key, expected in [('id', args.source_id), ('type', 'zip'), ('s3Uri', row['plannedS3Uri']),
                          ('bytes', row['bytes']), ('sha256', row['sha256']),
                          ('originalLocalArchive', row['localArchive']), ('contentKind', row['contentKind'])]:
        if receipt.get(key) != expected:
            raise ValueError('Upload receipt differs from frozen record: ' + key)
    if receipt.get('readbackVerified') is not True:
        raise ValueError('Upload receipt lacks complete S3 readback verification')
    archive = (workspace / row['localArchive']).resolve()
    if not archive.is_relative_to(workspace) or not archive.is_file():
        raise ValueError('Frozen archive is not a regular workspace file')
    if archive.stat().st_size != row['bytes'] or digest(archive) != row['sha256']:
        raise ValueError('Frozen archive bytes changed after upload')
    verify_members(archive, row['files'])
    if published:
        raise ValueError('A source record already exists without a matching primary backup')
    entry = dict(row, s3Uri=row['plannedS3Uri'], archiveFormat='zip', readbackVerified=True,
                 fullGetVerified=True, allMemberSha256Verified=True,
                 receiptPath=receipt_path.relative_to(workspace).as_posix(), receiptSha256=digest(receipt_path))
    index['sources'].append(entry)
    index['pendingUploads'] = [item for item in index.get('pendingUploads', [])
                               if (item.get('id'), item.get('sha256')) != (args.source_id, row['sha256'])]
    source['backup'] = {key: entry[key] for key in ('s3Uri', 'bytes', 'sha256', 'archiveFormat',
                                                      'readbackVerified', 'fullGetVerified',
                                                      'allMemberSha256Verified')}
    source['publicationStatus'] = 's3-readback-verified'
    source.pop('pendingBackup')
    suffix = ' 已完成固定 ZIP 的 S3 完整讀回與逐成員 SHA-256 驗證。'
    if suffix.strip() not in source.get('verification', ''):
        source['verification'] = source.get('verification', '') + suffix
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'id': args.source_id, 's3Uri': entry['s3Uri'], 'members': len(entry['files']),
                      'allMemberSha256Verified': True, 'receiptSha256': entry['receiptSha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
