#!/usr/bin/env python3
"""Freeze the first immutable ten-package JUMP FORCE audio delivery.

The shared intake contains later deliveries, so this deliberately archives only
the files enumerated by the first frozen delivery manifest plus that manifest.
It never alters the intake or central registry.
"""
import argparse
import gzip
import hashlib
import json
import tarfile
from pathlib import Path


BUCKET = 'ggd-390630837668-ap-east-2-an'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def safe_relative(value):
    path = Path(value)
    if path.is_absolute() or not path.parts or any(part in {'', '.', '..'} for part in path.parts):
        raise ValueError('Unsafe delivery member: ' + value)
    return path


def validated_rows(root, delivery_path):
    delivery = json.loads(delivery_path.read_text())
    if delivery.get('schema') != 'ggd.frozen-local-audio-delivery.v1' or not delivery.get('immutable'):
        raise ValueError('Expected an immutable frozen audio delivery')
    if Path(delivery['localRoot']).resolve() != root:
        raise ValueError('Delivery localRoot does not identify this intake')
    rows, seen = [], set()
    for row in delivery['files']:
        relative = safe_relative(row['path'])
        member = relative.as_posix()
        if member in seen:
            raise ValueError('Duplicate delivery member: ' + member)
        seen.add(member)
        local = root / relative
        if local.is_symlink() or not local.is_file() or local.stat().st_size != row['bytes'] or sha(local) != row['sha256']:
            raise ValueError('Frozen delivery member changed: ' + member)
        rows.append({'path': member, 'bytes': row['bytes'], 'sha256': row['sha256']})
    # The delivery is the immutable declaration of this exact subset; retain it
    # inside the archive even though it is not one of its own file rows.
    manifest_member = delivery_path.relative_to(root).as_posix()
    if manifest_member in seen:
        raise ValueError('Delivery unexpectedly lists itself')
    rows.append({'path': manifest_member, 'bytes': delivery_path.stat().st_size, 'sha256': sha(delivery_path)})
    return sorted(rows, key=lambda row: row['path'])


def write_archive(root, rows, archive):
    with archive.open('xb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as zipped:
        with tarfile.open(fileobj=zipped, mode='w|') as tar:
            for row in rows:
                local = root / row['path']
                info = tar.gettarinfo(str(local), arcname=row['path'])
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ''
                with local.open('rb') as stream:
                    tar.addfile(info, stream)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-id', required=True)
    parser.add_argument('--delivery', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    delivery_path = args.delivery.resolve()
    root = Path(json.loads(delivery_path.read_text())['localRoot']).resolve()
    output = args.output.resolve()
    if not root.is_dir() or output.is_relative_to(root):
        raise ValueError('Invalid frozen delivery root or output location')
    rows = validated_rows(root, delivery_path)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'source.tar.gz'
    manifest_path = output / 'scoped-manifest.json'
    if archive.exists() or manifest_path.exists():
        raise FileExistsError('Preserve existing frozen output: ' + str(output))
    write_archive(root, rows, archive)
    # Re-read every archive member before pinning its content address.
    with tarfile.open(archive, 'r:gz') as tar:
        archived = []
        for entry in tar:
            if not entry.isfile() or entry.name not in {row['path'] for row in rows}:
                raise ValueError('Unexpected archive member: ' + entry.name)
            payload = tar.extractfile(entry).read()
            archived.append({'path': entry.name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    if sorted(archived, key=lambda row: row['path']) != rows or validated_rows(root, delivery_path) != rows:
        raise ValueError('Delivery changed while freezing')
    digest = sha(archive)
    uri = f's3://{BUCKET}/legacy/public-model-sources/{args.source_id}/{digest}.tar.gz'
    manifest = {
        'schema': 'ggd-jumpforce-scoped-audio-backup@1',
        'sourceId': args.source_id,
        'deliveryPath': str(delivery_path),
        'deliverySha256': sha(delivery_path),
        'sourceRoot': str(root),
        'absoluteLocalArchive': str(archive),
        'archiveFormat': 'tar-gzip',
        'archiveMemberRoot': '',
        'bytes': archive.stat().st_size,
        'sha256': digest,
        'fileCount': len(rows),
        'files': rows,
        'plannedS3Uri': uri,
        'localPreserved': True,
        'snapshotScope': 'first-frozen-ten-package-delivery-plus-delivery-manifest',
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: manifest[key] for key in ['sourceId', 'fileCount', 'bytes', 'sha256', 'plannedS3Uri']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
