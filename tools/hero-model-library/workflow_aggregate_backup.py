#!/usr/bin/env python3
"""Archive an already-frozen cross-source ZIP without changing any source's primary backup.

This is intentionally separate from upload_backup.py: an aggregate may span
several independently archived sources.  It can therefore be retained as an
additional legacy receipt, but must never replace a constituent source's
primary archive or make a component runtime-addressable.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path


BUCKET = 'ggd-390630837668-ap-east-2-an'
REPO = Path(__file__).resolve().parents[2]


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def digest_range(path, start, length):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        stream.seek(start)
        left = length
        while left:
            chunk = stream.read(min(left, 1024 * 1024))
            if not chunk:
                raise ValueError('Expected local archive ended during range verification')
            h.update(chunk)
            left -= len(chunk)
    return h.hexdigest()


def aws(args, action, resource):
    env = {**os.environ, 'AWS_PROFILE': 'vibe-coding', 'AWS_REGION': 'ap-east-2', 'AWS_PAGER': ''}
    result = subprocess.run(['aws', *args, '--profile', 'vibe-coding', '--region', 'ap-east-2', '--no-cli-pager'],
                            env=env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'{action} {resource}: {result.stderr.strip()}')
    return result.stdout


def existing_object_size(key):
    """Return an existing object's byte size, or None only for NotFound."""
    env = {**os.environ, 'AWS_PROFILE': 'vibe-coding', 'AWS_REGION': 'ap-east-2', 'AWS_PAGER': ''}
    result = subprocess.run(['aws', 's3api', 'head-object', '--bucket', BUCKET, '--key', key,
                             '--profile', 'vibe-coding', '--region', 'ap-east-2', '--no-cli-pager'],
                            env=env, text=True, capture_output=True)
    if result.returncode == 0:
        return json.loads(result.stdout)['ContentLength']
    if 'Not Found' in result.stderr or '(404)' in result.stderr:
        return None
    raise RuntimeError('s3:HeadObject s3://' + BUCKET + '/' + key + ': ' + result.stderr.strip())


def range_readback(key, destination, expected, size, chunk_bytes=32 * 1024 * 1024):
    """Download fixed ranges that can resume and verify against the frozen local archive."""
    destination, expected = Path(destination), Path(expected)
    if destination.is_file():
        if destination.stat().st_size == size and digest(destination) == digest(expected):
            return destination
        bad = destination.with_name(destination.name + '.invalid-' + digest(destination)[:12])
        destination.rename(bad)
    parts = destination.with_name(destination.name + '.parts')
    parts.mkdir(parents=True, exist_ok=True)
    uri = f's3://{BUCKET}/{key}'
    ordered = []
    pending = []
    for start in range(0, size, chunk_bytes):
        end = min(size, start + chunk_bytes) - 1
        length = end - start + 1
        piece = parts / f'{start:012d}-{end:012d}.part'
        expected_sha = digest_range(expected, start, length)
        if piece.is_file() and piece.stat().st_size == length and digest(piece) == expected_sha:
            ordered.append(piece)
            continue
        if piece.exists():
            piece.rename(piece.with_name(piece.name + '.invalid-' + digest(piece)[:12]))
        ordered.append(piece)
        pending.append((start, end, length, piece, expected_sha))

    def fetch(item):
        start, end, length, piece, expected_sha = item
        last_error = None
        for attempt in range(1, 4):
            try:
                aws(['s3api', 'get-object', '--bucket', BUCKET, '--key', key,
                     '--range', f'bytes={start}-{end}', str(piece)], 's3:GetObject', uri)
                if piece.stat().st_size != length or digest(piece) != expected_sha:
                    piece.rename(piece.with_name(piece.name + f'.mismatch-attempt-{attempt}'))
                    raise ValueError(f'S3 range differs from frozen local archive: {start}-{end}')
                last_error = None
                break
            except (OSError, RuntimeError, ValueError) as error:
                last_error = error
                if piece.exists():
                    piece.rename(piece.with_name(piece.name + f'.failed-attempt-{attempt}'))
        if last_error is not None:
            raise last_error
        return start, end, piece

    verified = sum(piece.stat().st_size for piece in ordered if piece.exists())
    if pending:
        with ThreadPoolExecutor(max_workers=min(3, len(pending))) as pool:
            futures = [pool.submit(fetch, item) for item in pending]
            for future in as_completed(futures):
                start, end, piece = future.result()
                verified += piece.stat().st_size
                print(json.dumps({'phase': 'range-readback', 'start': start, 'end': end,
                                  'verifiedBytes': verified, 'totalBytes': size}), flush=True)
    ordered.sort()
    assembling = destination.with_name(destination.name + f'.assembling-{os.getpid()}')
    with assembling.open('xb') as output:
        for piece in ordered:
            with piece.open('rb') as source:
                shutil.copyfileobj(source, output, 1024 * 1024)
    if assembling.stat().st_size != size or digest(assembling) != digest(expected):
        raise ValueError('Assembled S3 range readback differs from frozen local archive')
    os.replace(assembling, destination)
    return destination


def load_catalogs(repo=REPO):
    root = Path(repo) / 'materials/hero-model-library'
    return root, json.loads((root / 'download-sources.json').read_text()), json.loads((root / 'public-source-files.json').read_text())


def verify_members(path, rows):
    expected = [(row['path'], row['bytes'], row['sha256']) for row in rows]
    names = [row[0] for row in expected]
    if len(names) != len(set(names)):
        raise ValueError('Aggregate manifest contains duplicate paths')
    with zipfile.ZipFile(path) as bundle:
        actual = [info.filename for info in bundle.infolist() if not info.is_dir()]
        if actual != names:
            raise ValueError('Aggregate ZIP member list differs from frozen manifest')
        for member, size, expected_sha in expected:
            payload = bundle.read(member)
            if len(payload) != size or hashlib.sha256(payload).hexdigest() != expected_sha:
                raise ValueError('Aggregate ZIP member SHA-256 mismatch: ' + member)


def plan(args, repo=REPO):
    root, downloads, index = load_catalogs(repo)
    pending = [row for row in index.get('pendingUploads', [])
               if (row.get('id'), row.get('sha256')) == (args.pending_id, args.sha256)]
    if len(pending) != 1:
        raise ValueError('Expected one frozen pending aggregate row')
    pending = pending[0]
    archive = (Path(args.workspace).resolve() / pending['localArchive']).resolve()
    workspace = Path(args.workspace).resolve()
    if not archive.is_relative_to(workspace) or not archive.is_file():
        raise ValueError('Aggregate ZIP is not a regular workspace file')
    if archive.stat().st_size != pending['bytes'] or digest(archive) != pending['sha256']:
        raise ValueError('Aggregate ZIP identity differs from pending record')
    if pending['sha256'] != args.sha256:
        raise ValueError('Provided digest differs from pending record')
    records = [row for row in index.get('sources', []) if row.get('id') in args.source_ids]
    if len(records) != len(args.source_ids):
        raise ValueError('Every covered source must have exactly one verified archive record')
    if any(row.get('readbackVerified') is not True for row in records):
        raise ValueError('Covered source lacks a verified S3 readback')
    covered = {}
    for record in records:
        for row in record.get('files', []):
            item = (row['bytes'], row['sha256'])
            prior = covered.setdefault(row['path'], item)
            if prior != item:
                raise ValueError('Covered source archives disagree: ' + row['path'])
    aggregate = {row['path']: (row['bytes'], row['sha256']) for row in pending['files']}
    if len(aggregate) != len(pending['files']):
        raise ValueError('Pending aggregate has duplicate member paths')
    source_only = sorted(set(covered) - set(aggregate))
    missing = sorted(set(aggregate) - set(covered))
    mismatched = sorted(path for path in set(aggregate) & set(covered) if aggregate[path] != covered[path])
    if source_only or mismatched or missing != sorted(args.extra_member):
        raise ValueError('Covered-source relationship differs from declared aggregate metadata')
    verify_members(archive, pending['files'])
    key = f'legacy/workflow-aggregates/{args.aggregate_id}/{pending["sha256"]}.zip'
    return root, downloads, index, pending, archive, key, records, missing


def upload(args):
    root, downloads, index, pending, archive, key, records, extra = plan(args)
    arn = aws(['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'], 'sts:GetCallerIdentity', 'configured role').strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:
        raise RuntimeError('STOP identity mismatch: ' + arn)
    uri = f's3://{BUCKET}/{key}'
    out = Path(args.output).resolve() / args.aggregate_id / pending['sha256']
    out.mkdir(parents=True, exist_ok=True)
    local_copy = out / 'aggregate.zip'
    if not local_copy.exists():
        shutil.copyfile(archive, local_copy)
    if local_copy.stat().st_size != pending['bytes'] or digest(local_copy) != pending['sha256']:
        raise ValueError('Local aggregate copy changed')
    existing = existing_object_size(key)
    if existing is None:
        aws(['s3', 'cp', str(local_copy), uri, '--only-show-errors'], 's3:PutObject', uri)
    elif existing != pending['bytes']:
        raise ValueError('Existing aggregate object has an unexpected byte size')
    readback = range_readback(key, out / 'readback.zip', local_copy, pending['bytes'])
    if readback.stat().st_size != pending['bytes'] or digest(readback) != pending['sha256']:
        raise ValueError('S3 aggregate readback SHA-256 mismatch')
    verify_members(readback, pending['files'])
    manifest = dict(schema='ggd-workflow-aggregate-manifest@1', aggregateId=args.aggregate_id,
                    sourcePendingId=args.pending_id, coveredSourceIds=args.source_ids,
                    extraMetadataMembers=extra, archiveMemberCount=len(pending['files']),
                    archiveBytes=pending['bytes'], archiveSha256=pending['sha256'],
                    s3Uri=uri, archiveFormat='zip', localArchive=str(archive),
                    readback=str(readback), allMemberSha256Verified=True,
                    fullGetVerified=True, primarySourceBackupReplaced=False)
    manifest_path = out / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    manifest_uri = uri.removesuffix('.zip') + '.manifest.json'
    aws(['s3', 'cp', str(manifest_path), manifest_uri, '--only-show-errors'], 's3:PutObject', manifest_uri)
    manifest_back = out / 'manifest-readback.json'
    aws(['s3', 'cp', manifest_uri, str(manifest_back), '--only-show-errors'], 's3:GetObject', manifest_uri)
    if manifest_back.read_bytes() != manifest_path.read_bytes():
        raise ValueError('S3 aggregate manifest readback mismatch')
    receipt = {**manifest, 'schema': 'ggd-workflow-aggregate-receipt@1', 'manifestUri': manifest_uri,
               'manifestSha256': digest(manifest_path), 'localPreserved': True}
    receipt_path = out / 'receipt.json'
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'receiptPath': str(receipt_path), 'receiptSha256': digest(receipt_path),
                      's3Uri': uri, 'members': len(pending['files']), 'fullGetAndMembersVerified': True}, ensure_ascii=False))


def register(args):
    root, downloads, index, pending, archive, key, records, extra = plan(args)
    receipt_path = Path(args.receipt).resolve()
    receipt = json.loads(receipt_path.read_text())
    uri = f's3://{BUCKET}/{key}'
    required = {'schema': 'ggd-workflow-aggregate-receipt@1', 'aggregateId': args.aggregate_id,
                'sourcePendingId': args.pending_id, 'coveredSourceIds': args.source_ids,
                'archiveMemberCount': len(pending['files']), 'archiveBytes': pending['bytes'],
                'archiveSha256': pending['sha256'], 's3Uri': uri, 'archiveFormat': 'zip',
                'allMemberSha256Verified': True, 'fullGetVerified': True,
                'primarySourceBackupReplaced': False, 'localPreserved': True}
    if any(receipt.get(key) != value for key, value in required.items()):
        raise ValueError('Aggregate receipt does not match frozen plan')
    if not Path(receipt['readback']).is_file() or digest(receipt['readback']) != pending['sha256']:
        raise ValueError('Aggregate receipt has no matching local full readback')
    verify_members(receipt['readback'], pending['files'])
    if any(row.get('id') == args.aggregate_id for row in index.get('sources', [])):
        raise ValueError('Aggregate ID already exists')
    entry = dict(id=args.aggregate_id, sourceId=None, resourceRole='cross-source-workflow-aggregate',
                 originatingPendingId=args.pending_id, coveredSourceIds=args.source_ids,
                 extraMetadataMembers=extra, localArchive=pending['localArchive'], readbackPath=receipt['readback'],
                 s3Uri=uri, manifestUri=receipt['manifestUri'], bytes=pending['bytes'], sha256=pending['sha256'],
                 fileCount=len(pending['files']), archiveFormat='zip', files=pending['files'],
                 readbackVerified=True, fullGetVerified=True, allMemberSha256Verified=True,
                 localPreserved=True, s3Use='backup-only-not-runtime-entry',
                 receiptPath=str(receipt_path), receiptSha256=digest(receipt_path))
    index['sources'].append(entry)
    index['pendingUploads'] = [row for row in index.get('pendingUploads', [])
                               if (row.get('id'), row.get('sha256')) != (args.pending_id, args.sha256)]
    source = next((row for row in downloads.get('publicSources', []) if row.get('id') == args.pending_id), None)
    if source is None:
        raise ValueError('Original pending source no longer exists')
    old = [row for row in source.get('preservedPendingBackups', []) if row.get('sha256') == args.sha256]
    if len(old) != 1:
        raise ValueError('Expected one source-level aggregate-pending record')
    source['preservedPendingBackups'] = [row for row in source['preservedPendingBackups'] if row not in old]
    source.setdefault('preservedAggregateBackups', []).append({**old[0], 'aggregateId': args.aggregate_id,
        's3Uri': uri, 'manifestUri': receipt['manifestUri'], 'readbackVerified': True,
        'allMemberSha256Verified': True, 'coveredSourceIds': args.source_ids,
        'extraMetadataMembers': extra, 'status': 's3-readback-verified-cross-source-aggregate-not-primary'})
    (root / 'download-sources.json').write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + '\n')
    (root / 'public-source-files.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'aggregateId': args.aggregate_id, 's3Uri': uri, 'members': len(pending['files']),
                      'primaryBackupsPreserved': len(records), 'registered': True}, ensure_ascii=False))


def parse():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['upload', 'register'])
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--pending-id', required=True)
    parser.add_argument('--aggregate-id', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--source-id', dest='source_ids', action='append', required=True)
    parser.add_argument('--extra-member', dest='extra_member', action='append', default=[])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    if args.mode == 'upload' and args.output is None: parser.error('upload requires --output')
    if args.mode == 'register' and args.receipt is None: parser.error('register requires --receipt')
    return args


if __name__ == '__main__':
    args = parse()
    upload(args) if args.mode == 'upload' else register(args)
