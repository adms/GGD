"""Publish a verified preparation manifest, or explicitly restore it outside Git.

Network upload/readback is performed by upload_scoped_tar.py. This tool never
downloads from legacy automatically and never overwrites a different file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tarfile

from upload_scoped_tar import scoped_members

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / 'materials/hero-model-library/pr1284-preparation-s3.json'
PREFIX = 's3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/pr1284-preparation-final-v1/'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()


def publish(manifest_path, receipt_path):
    manifest = json.loads(manifest_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    assert receipt['s3Uri'].startswith(PREFIX)
    assert receipt['sha256'] == manifest['sha256']
    assert receipt['manifestSha256'] == sha(manifest_path)
    assert receipt['fullGetVerified'] and receipt['allArchiveMembersSha256Verified']
    assert receipt['profile'] == 'vibe-coding' and receipt['region'] == 'ap-east-2'
    readback = Path(receipt['localReadback'])
    assert sha(readback) == receipt['sha256']
    assert scoped_members(readback) == manifest['files']
    result = {
        'schema': 'ggd.pr1284-preparation-s3@1',
        'scope': 'Only the listed preparation evidence and full analysis receipts; not all local materials.',
        'status': 's3-full-readback-verified',
        's3Uri': receipt['s3Uri'], 'manifestUri': receipt['manifestUri'],
        'sha256': receipt['sha256'], 'bytes': receipt['bytes'],
        'fileCount': receipt['fileCount'], 'files': manifest['files'],
        'fullGetVerified': True, 'allArchiveMembersSha256Verified': True,
        'profile': 'vibe-coding', 'region': 'ap-east-2', 'localPreserved': True,
        'localArchive': receipt['localArchive'], 'localReadback': str(readback),
        'restorePolicy': 'Manual read-only retrieval only. Restore to a separate directory; full analysis JSON must not overwrite compact Git summaries.',
        'productionDeploymentVerified': False,
    }
    INDEX.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Published {result["fileCount"]} verified preparation files: {INDEX}')


def prepare(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    archive = Path(manifest['absoluteLocalArchive'])
    assert manifest['plannedS3Uri'].startswith(PREFIX)
    assert sha(archive) == manifest['sha256']
    assert scoped_members(archive) == manifest['files']
    if INDEX.exists() and json.loads(INDEX.read_text()).get('fullGetVerified'):
        raise ValueError('Preserve an already verified publication receipt')
    result = {
        'schema': 'ggd.pr1284-preparation-s3@1',
        'scope': 'Only the listed preparation evidence and full analysis receipts; not all local materials.',
        'status': 'local-frozen-awaiting-explicit-upload-approval',
        'plannedS3Uri': manifest['plannedS3Uri'], 's3Uri': None,
        'sha256': manifest['sha256'], 'bytes': manifest['bytes'],
        'fileCount': manifest['fileCount'], 'files': manifest['files'],
        'localArchive': str(archive), 'localPreserved': True,
        'fullGetVerified': False, 'allArchiveMembersSha256Verified': False,
        'localArchiveMembersSha256Verified': True,
        'productionDeploymentVerified': False,
    }
    INDEX.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared local-only manifest for {result["fileCount"]} files: {INDEX}')


def restore(archive, destination):
    doc = json.loads(INDEX.read_text())
    assert sha(archive) == doc['sha256'], 'Archive SHA-256 mismatch'
    assert scoped_members(archive) == doc['files'], 'Archive member manifest mismatch'
    destination = destination.resolve()
    if destination == ROOT or destination.is_relative_to(ROOT):
        raise ValueError('Restore full preparation outside the Git checkout')
    with tarfile.open(archive, 'r:gz') as tar:
        for row in doc['files']:
            target = destination / row['path']
            if not target.resolve().is_relative_to(destination):
                raise ValueError('Restore destination escapes through a symlink')
            if target.exists():
                if target.is_file() and sha(target) == row['sha256']:
                    continue
                raise ValueError(f'Preserve existing different file: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(row['path']) as source, target.open('xb') as output:
                for data in iter(lambda: source.read(1024 * 1024), b''):
                    output.write(data)
            assert sha(target) == row['sha256']
    print(f'Restored and verified {len(doc["files"])} files in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--restore-from', type=Path)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--prepare-manifest', type=Path)
    args = parser.parse_args()
    if args.prepare_manifest and not any((args.manifest, args.receipt, args.restore_from, args.destination)):
        prepare(args.prepare_manifest)
    elif args.restore_from and args.destination and not args.manifest and not args.receipt:
        restore(args.restore_from, args.destination)
    elif args.manifest and args.receipt and not args.restore_from and not args.destination:
        publish(args.manifest, args.receipt)
    else:
        parser.error('Use --prepare-manifest, --manifest + --receipt, or --restore-from + --destination')
