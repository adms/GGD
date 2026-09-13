#!/usr/bin/env python3
"""Verify Ultimate14's uploaded ZIP member-by-member and publish its receipt.

The old generic ZIP uploader verifies the complete object checksum but does not
persist a remote member manifest.  This finalizer reads the uploaded object,
checks every ZIP member against the frozen pending inventory, reads back its
manifest, verifies the local conversion remains unchanged, and only then
promotes the central pending record.
"""
import hashlib
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
LIBRARY = REPO / 'materials/hero-model-library'
SOURCE_ID = 'parallel-ns-ultimate14-audio-decoded-v1'
BUCKET = 'ggd-390630837668-ap-east-2-an'
AWS = ['aws', '--profile', 'vibe-coding', '--region', 'ap-east-2', '--no-cli-pager']
CHUNK = 1024 * 1024


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def aws(args, action, resource):
    env = {**os.environ, 'AWS_PROFILE': 'vibe-coding', 'AWS_REGION': 'ap-east-2', 'AWS_PAGER': ''}
    result = subprocess.run(AWS + args, env=env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'{action} {resource}: {result.stderr.strip()}')
    return result.stdout


def safe_member(name):
    if (not isinstance(name, str) or not name or '\\' in name or '\0' in name
            or name.startswith('/') or ':' in name.split('/')[0]
            or any(part in {'', '.', '..'} for part in name.split('/'))):
        raise ValueError('Unsafe ZIP member: ' + repr(name))
    return name


def verify_zip(path, expected):
    expected = {safe_member(row['path']): (row['bytes'], row['sha256']) for row in expected}
    found = set()
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            name = safe_member(info.filename)
            if info.is_dir() or name not in expected or name in found:
                raise ValueError('Unexpected/duplicate directory or ZIP member: ' + name)
            found.add(name)
            digest, total = hashlib.sha256(), 0
            with archive.open(info) as stream:
                for block in iter(lambda: stream.read(CHUNK), b''):
                    digest.update(block); total += len(block)
            if (total, digest.hexdigest()) != expected[name]:
                raise ValueError('ZIP member differs: ' + name)
    if found != set(expected):
        raise ValueError('ZIP missing frozen members')


def verify_local_root(root, expected):
    for row in expected:
        name = safe_member(row['path'])
        raw_path = root / name
        path = raw_path.resolve()
        if (raw_path.is_symlink() or not path.is_relative_to(root) or not path.is_file()
                or path.stat().st_size != row['bytes'] or sha(path) != row['sha256']):
            raise ValueError('Listed local conversion member changed: ' + name)


def main():
    downloads_path, index_path = LIBRARY / 'download-sources.json', LIBRARY / 'public-source-files.json'
    original_downloads, original_index = downloads_path.read_bytes(), index_path.read_bytes()
    downloads, index = json.loads(original_downloads), json.loads(original_index)
    source_rows = [row for row in downloads['publicSources'] if row['id'] == SOURCE_ID]
    if len(source_rows) != 1:
        raise ValueError('Expected exactly one decoded source')
    source = source_rows[0]
    pending = source.get('pendingBackup')
    if not pending or pending.get('status') != 'not-uploaded':
        raise ValueError('Expected an unpromoted frozen pending backup')
    archive_rows = [row for row in index.get('pendingUploads', [])
                    if row.get('id') == SOURCE_ID and row.get('sha256') == pending.get('sha256')]
    if len(archive_rows) != 1:
        raise ValueError('Expected exactly one matching frozen archive record')
    frozen = archive_rows[0]
    expected = frozen['files']
    archive = (WORKSPACE / frozen['localArchive']).resolve()
    root = (WORKSPACE / source['localPath']).resolve()
    uri = frozen['plannedS3Uri']
    if (not archive.is_relative_to(WORKSPACE) or archive.stat().st_size != frozen['bytes']
            or sha(archive) != frozen['sha256'] or not root.is_relative_to(WORKSPACE)
            or not uri == f's3://{BUCKET}/legacy/public-model-sources/{SOURCE_ID}/{frozen["sha256"]}.zip'):
        raise ValueError('Frozen archive, conversion root, or authorized S3 URI mismatch')
    verify_zip(archive, expected); verify_local_root(root, expected)
    arn = aws(['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'],
              'sts:GetCallerIdentity', 'configured vibe-coding role').strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:
        raise ValueError('Configured identity is not the authorized role')
    receipt_dir = archive.parent
    receipt_path = receipt_dir / f's3-verified-receipt-{frozen["sha256"]}.json'
    manifest_path = receipt_dir / f's3-member-manifest-{frozen["sha256"]}.json'
    manifest_uri = uri + '.files.json'
    if receipt_path.exists() or manifest_path.exists():
        raise ValueError('Preserve existing verification output; inspect it before rerun')
    with tempfile.TemporaryDirectory(prefix='ultimate14-audio-readback-', dir=receipt_dir) as temp:
        temp = Path(temp); remote = temp / 'full-get.zip'; manifest_back = temp / 'manifest-readback.json'
        aws(['s3', 'cp', uri, str(remote), '--only-show-errors'], 's3:GetObject', uri)
        if remote.stat().st_size != frozen['bytes'] or sha(remote) != frozen['sha256']:
            raise ValueError('Remote archive checksum mismatch')
        verify_zip(remote, expected)
        manifest = {'schema': 'ggd-zip-intake-member-manifest@1', 'id': SOURCE_ID, 'sourceId': SOURCE_ID,
                    'archiveFormat': 'zip', 'archiveMemberRoot': '', 's3Uri': uri,
                    'archiveSha256': frozen['sha256'], 'archiveBytes': frozen['bytes'],
                    'fileCount': len(expected), 'files': expected}
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
        manifest_path.write_bytes(manifest_bytes)
        aws(['s3', 'cp', str(manifest_path), manifest_uri, '--only-show-errors'], 's3:PutObject', manifest_uri)
        aws(['s3', 'cp', manifest_uri, str(manifest_back), '--only-show-errors'], 's3:GetObject', manifest_uri)
        if manifest_back.read_bytes() != manifest_bytes:
            raise ValueError('Remote member manifest differs')
    verify_local_root(root, expected)
    receipt = {'schema': 'ggd-zip-intake-s3-receipt@1', 'id': SOURCE_ID, 'sourceId': SOURCE_ID,
               's3Uri': uri, 'manifestUri': manifest_uri, 'archiveFormat': 'zip', 'archiveMemberRoot': '',
               'sha256': frozen['sha256'], 'bytes': frozen['bytes'], 'fileCount': len(expected),
               'manifestSha256': sha(manifest_path), 'localArchive': str(archive),
               'readbackVerified': True, 'fullGetVerified': True, 'allMemberSha256Verified': True,
               'localUnchanged': True, 'localPreserved': True, 'profile': 'vibe-coding', 'region': 'ap-east-2'}
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    entry = {key: frozen[key] for key in ['id', 'localArchive', 'bytes', 'sha256', 'contentKind', 'files']}
    entry.update({'sourceId': SOURCE_ID, 'resourceRole': 'audio-conversion-backup', 's3Uri': uri,
                  'manifestUri': manifest_uri, 'archiveFormat': 'zip', 'archiveMemberRoot': '',
                  'readbackVerified': True, 'fullReadbackVerified': True, 's3ReadbackVerified': True,
                  'localPreserved': True, 'receiptPath': str(receipt_path), 'receiptSha256': sha(receipt_path),
                  'manifestSha256': sha(manifest_path), 's3Use': 'backup-only-not-runtime-entry'})
    if any(row.get('id') == SOURCE_ID and row.get('sha256') != entry['sha256'] for row in index.get('sources', [])):
        raise ValueError('A different immutable published backup already exists')
    if source.get('backup') not in (None, {'status': 'not-uploaded', 'readbackVerified': False}):
        raise ValueError('Refusing to replace an existing primary backup')
    source['backup'] = {key: entry[key] for key in ['s3Uri', 'bytes', 'sha256', 'archiveFormat', 'archiveMemberRoot',
                                                     'readbackVerified', 'fullReadbackVerified', 's3ReadbackVerified']}
    source['publicationStatus'] = 's3-readback-verified'; source.pop('pendingBackup')
    index['pendingUploads'] = [row for row in index.get('pendingUploads', [])
                               if not (row.get('id') == SOURCE_ID and row.get('sha256') == entry['sha256'])]
    index['sources'].append(entry)
    if downloads_path.read_bytes() != original_downloads or index_path.read_bytes() != original_index:
        raise ValueError('Central catalogs changed during verification')
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'id': SOURCE_ID, 'files': len(expected), 's3Uri': uri,
                      'fullGetAndEveryMemberVerified': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
