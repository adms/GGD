#!/usr/bin/env python3
"""Promote the fully read-back scoped JUMP FORCE archive into central indexes."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from upload_scoped_tar import scoped_members


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
BASE = REPO / 'materials/hero-model-library'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-id', required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    receipt_path, manifest_path = args.receipt.resolve(), args.manifest.resolve()
    receipt, manifest = json.loads(receipt_path.read_text()), json.loads(manifest_path.read_text())
    if receipt.get('schema') != 'ggd-scoped-tar-s3-receipt@1' or manifest.get('schema') != 'ggd-jumpforce-scoped-audio-backup@1':
        raise ValueError('Unexpected scoped backup evidence')
    required = ['readbackVerified', 'fullGetVerified', 'allArchiveMembersSha256Verified', 'localPreserved']
    source_id = args.source_id
    if any(receipt.get(key) is not True for key in required) or receipt.get('id') != source_id or manifest.get('sourceId') != source_id:
        raise ValueError('Scoped backup is not fully verified for this source')
    if (receipt['sha256'], receipt['bytes'], receipt['fileCount'], receipt['s3Uri']) != (
            manifest['sha256'], manifest['bytes'], manifest['fileCount'], manifest['plannedS3Uri']):
        raise ValueError('Receipt does not match frozen archive manifest')
    archive, readback = Path(receipt['localArchive']), Path(receipt['localReadback'])
    expected = manifest['files']
    if (not archive.is_file() or not readback.is_file() or sha(archive) != manifest['sha256']
            or sha(readback) != manifest['sha256'] or scoped_members(readback) != expected):
        raise ValueError('Saved full S3 readback no longer matches the frozen inventory')
    root, delivery = Path(manifest['sourceRoot']).resolve(), Path(manifest['deliveryPath']).resolve()
    if not root.is_relative_to(WORKSPACE) or not delivery.is_relative_to(root) or sha(delivery) != manifest['deliverySha256']:
        raise ValueError('Frozen delivery provenance changed')
    for row in expected:
        local = root / row['path']
        if local.is_symlink() or not local.is_file() or local.stat().st_size != row['bytes'] or sha(local) != row['sha256']:
            raise ValueError('Listed local source member changed: ' + row['path'])
    paths = [BASE / 'download-sources.json', BASE / 'public-source-files.json']
    before = [path.read_bytes() for path in paths]
    downloads, index = [json.loads(blob) for blob in before]
    sources = [row for row in downloads['publicSources'] if row['id'] == source_id]
    if len(sources) != 1:
        raise ValueError('Expected exactly one central source record')
    source = sources[0]
    if (source.get('backup') is not None or source.get('publicationStatus') not in {
            'local-only-preparing-s3-backup', 'local-verified-s3-pending',
            'local-only-awaiting-s3-upload'}):
        raise ValueError('Source publication state changed; preserve for review')
    if any(row['id'] == source_id for row in index.get('sources', [])):
        raise ValueError('A published central archive record already exists')
    backup = {key: receipt[key] for key in ['s3Uri', 'bytes', 'sha256', 'archiveFormat', 'archiveMemberRoot', 'readbackVerified', 'fullGetVerified']}
    backup['s3ReadbackVerified'] = True
    # Some older local ZIPs were created from the mutable shared intake root.
    # Preserve those pending bytes for audit, but do not let their wider member
    # list masquerade as this source's fixed delivery backup.
    old_pending = source.get('pendingBackup')
    if old_pending:
        matches = [row for row in index.get('pendingUploads', [])
                   if (row.get('id'), row.get('sha256')) == (source_id, old_pending.get('sha256'))]
        if len(matches) != 1:
            raise ValueError('Expected one preserved pending archive record')
        old = matches[0]
        if old.get('files') == expected:
            raise ValueError('Existing pending archive unexpectedly duplicates the scoped delivery')
        preserved = dict(old_pending, status='preserved-scope-conflict-not-primary',
                         reason='archive member list exceeds this fixed source delivery; retained locally and unuploaded')
        history = source.setdefault('preservedPendingBackups', [])
        if not any(row.get('sha256') == preserved['sha256'] for row in history):
            history.append(preserved)
        old['scopeStatus'] = 'preserved-not-primary-source-backup'
        old['scopeConflictReason'] = 'member list exceeds fixed delivery; retained without upload or deletion'
        old['supersededByScopedArchive'] = receipt['s3Uri']
        source.pop('pendingBackup')
    source['backup'] = backup
    source['publicationStatus'] = 's3-readback-verified'
    source['verification'] += ' 此固定交付與其 manifest 已重新逐檔 SHA-256 核對，S3 完整讀回及逐成員驗證通過；同根目錄的其他交付不在此備份範圍。'
    index['sources'].append({
        'id': source_id, 'sourceId': source_id,
        'localPath': str(root.relative_to(WORKSPACE)), 'localArchive': str(archive),
        'readbackPath': str(readback), 's3Uri': receipt['s3Uri'], 'manifestUri': receipt['manifestUri'],
        'bytes': receipt['bytes'], 'sha256': receipt['sha256'], 'archiveFormat': receipt['archiveFormat'],
        'archiveMemberRoot': receipt['archiveMemberRoot'], 'fileCount': len(expected), 'files': expected,
        'readbackVerified': True, 'fullReadbackVerified': True, 's3ReadbackVerified': True,
        'localPreserved': True, 'snapshotScope': manifest['snapshotScope'],
        'receiptPath': str(receipt_path), 'receiptSha256': sha(receipt_path),
        'manifestPath': str(manifest_path), 'manifestSha256': sha(manifest_path),
        's3Use': 'backup-only-not-runtime-entry',
    })
    if any(path.read_bytes() != original for path, original in zip(paths, before)):
        raise ValueError('Central files changed during verification')
    for path, value in zip(paths, [downloads, index]):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'id': source_id, 'files': len(expected), 's3Uri': receipt['s3Uri'], 'fullReadbackVerified': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
