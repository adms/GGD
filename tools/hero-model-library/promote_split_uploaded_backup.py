#!/usr/bin/env python3
"""Promote one fully read-back split ZIP archive into the central catalog.

``upload_split_backup.py`` keeps large archives as independently verified S3
objects plus an S3 manifest.  This command is deliberately separate from that
upload: it checks that the receipt describes the frozen local ZIP exactly,
checks every ZIP member recorded in the pending catalog, and only then updates
the two central source indexes.  It never uploads, deletes, or replaces an
existing primary backup.
"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
BUCKET = 'ggd-390630837668-ap-east-2-an'
PART_SIZES = {64 << 20, 128 << 20, 256 << 20, 512 << 20}
SHA256 = re.compile(r'^[0-9a-f]{64}$')


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
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


def verify_parts(archive, parts, row, expected_prefix):
    if not isinstance(parts, list) or not parts:
        raise ValueError('Split receipt has no archive parts')
    part_size = parts[0].get('bytes')
    if len(parts) == 1 and part_size != row['bytes']:
        raise ValueError('Single-part split receipt does not cover frozen archive size')
    if len(parts) > 1 and part_size not in PART_SIZES:
        raise ValueError('Split receipt uses an unsupported part size')
    expected_count = (row['bytes'] + part_size - 1) // part_size
    if len(parts) != expected_count:
        raise ValueError('Split receipt part count differs from frozen archive size')
    whole = hashlib.sha256()
    with archive.open('rb') as stream:
        for number, part in enumerate(parts, start=1):
            expected_bytes = part_size if number < expected_count else row['bytes'] - part_size * (expected_count - 1)
            expected_uri = f'{expected_prefix}/archive.zip.part-{number:05d}'
            if (part.get('number') != number or part.get('bytes') != expected_bytes or
                    part.get('s3Uri') != expected_uri or part.get('readbackVerified') is not True or
                    not isinstance(part.get('sha256'), str) or not SHA256.fullmatch(part['sha256'])):
                raise ValueError('Split receipt part metadata is invalid: ' + str(number))
            payload = stream.read(expected_bytes)
            if len(payload) != expected_bytes or hashlib.sha256(payload).hexdigest() != part['sha256']:
                raise ValueError('Split receipt part differs from frozen local archive: ' + str(number))
            whole.update(payload)
        if stream.read(1):
            raise ValueError('Split receipt parts do not cover the frozen local archive')
    if whole.hexdigest() != row['sha256']:
        raise ValueError('Ordered local archive digest differs from frozen record')


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
    published = [entry for entry in index.get('sources', []) if entry.get('id') == args.source_id]
    if source.get('backup', {}).get('orderedArchiveReadbackVerified') is True:
        if len(published) != 1 or published[0].get('sha256') != source['backup'].get('sha256'):
            raise ValueError('Published source and primary split backup disagree')
        print(json.dumps({'id': args.source_id, 'alreadyPromoted': True, 's3Uri': source['backup']['s3Uri']}))
        return
    pending = source.get('pendingBackup')
    permitted_pending_states = {'not-uploaded', 'upload-returned-success-readback-404'}
    if not pending or pending.get('status') not in permitted_pending_states:
        raise ValueError('Expected one unpromoted frozen pending backup')
    rows = [item for item in index.get('pendingUploads', [])
            if (item.get('id'), item.get('sha256')) == (args.source_id, pending.get('sha256'))]
    if len(rows) != 1:
        raise ValueError('Expected one matching central pending record')
    row = rows[0]
    for key in ('localArchive', 'plannedS3Uri', 'bytes', 'sha256'):
        if pending.get(key) != row.get(key):
            raise ValueError('Source and central pending archive identities disagree: ' + key)
    planned = row['plannedS3Uri']
    prefix = planned.removesuffix('.zip') + '/split'
    if (not planned.startswith(f's3://{BUCKET}/legacy/') or not planned.endswith('/' + row['sha256'] + '.zip')):
        raise ValueError('Unexpected S3 archive destination')
    manifest_pattern = re.escape(prefix + '/manifest-') + r'[0-9a-f]{64}\.json'
    for key, expected in [('id', args.source_id), ('type', 'split-zip'), ('bytes', row['bytes']),
                          ('sha256', row['sha256']), ('originalLocalArchive', row['localArchive'])]:
        if receipt.get(key) != expected:
            raise ValueError('Split receipt differs from frozen record: ' + key)
    if (receipt.get('readbackVerified') is not True or receipt.get('orderedArchiveReadbackVerified') is not True or
            not isinstance(receipt.get('s3ObjectSha256'), str) or not SHA256.fullmatch(receipt['s3ObjectSha256']) or
            not isinstance(receipt.get('s3Uri'), str) or not re.fullmatch(manifest_pattern, receipt['s3Uri'])):
        raise ValueError('Split receipt lacks a verified authorized manifest')
    archive = (workspace / row['localArchive']).resolve()
    if not archive.is_relative_to(workspace) or not archive.is_file():
        raise ValueError('Frozen archive is not a regular workspace file')
    if archive.stat().st_size != row['bytes'] or digest(archive) != row['sha256']:
        raise ValueError('Frozen archive bytes changed after upload')
    verify_parts(archive, receipt.get('parts'), row, prefix)
    verify_members(archive, row['files'])
    if published:
        raise ValueError('A source record already exists without a matching primary backup')
    entry = dict(row, s3Uri=receipt['s3Uri'], archiveFormat='split-zip',
                 archiveManifestSha256=receipt['s3ObjectSha256'], parts=receipt['parts'],
                 readbackVerified=True, orderedArchiveReadbackVerified=True,
                 allMemberSha256Verified=True,
                 receiptPath=receipt_path.relative_to(workspace).as_posix(), receiptSha256=digest(receipt_path))
    index['sources'].append(entry)
    index['pendingUploads'] = [item for item in index.get('pendingUploads', [])
                               if (item.get('id'), item.get('sha256')) != (args.source_id, row['sha256'])]
    source['backup'] = {key: entry[key] for key in ('s3Uri', 'bytes', 'sha256', 'archiveFormat',
                                                      'archiveManifestSha256', 'readbackVerified',
                                                      'orderedArchiveReadbackVerified', 'allMemberSha256Verified')}
    source['publicationStatus'] = 's3-readback-verified'
    source.pop('pendingBackup')
    suffix = ' 已完成分段 ZIP 的逐片與有序整體 S3 讀回、以及固定 ZIP 逐成員 SHA-256 驗證。'
    if suffix.strip() not in source.get('verification', ''):
        source['verification'] = source.get('verification', '') + suffix
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'id': args.source_id, 's3Uri': entry['s3Uri'], 'members': len(entry['files']),
                      'parts': len(entry['parts']), 'allMemberSha256Verified': True,
                      'receiptSha256': entry['receiptSha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
