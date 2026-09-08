#!/usr/bin/env python3
"""Transfer fixed material bytes through the preconfigured AWS CLI profile."""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

PROFILE = 'vibe-coding'
REGION = 'ap-east-2'
BUCKET = 'ggd-390630837668-ap-east-2-an'
ROLE = 'arn:aws:sts::390630837668:assumed-role/vibe-coding-s3-role/'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def aws(args, action, resource, missing_ok=False):
    # The CLI resolves and refreshes AssumeRole credentials. Never read credential files.
    result = subprocess.run(['aws', *args, '--profile', PROFILE, '--region', REGION,
                             '--no-cli-pager', '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        match = re.search(r'An error occurred \(([^)]+)\)', result.stderr)
        code = match.group(1) if match else 'CLI exit ' + str(result.returncode)
        if 'AccessDenied' in code or code == 'Forbidden' or code == '403':
            raise PermissionError(f'AccessDenied: {action} on {resource}; stopped without retry or profile change')
        if missing_ok and code in {'404', 'NoSuchKey', 'NotFound'}:
            return None
        # Do not echo the CLI environment, configuration or diagnostic output.
        raise RuntimeError(f'{action} failed ({code}) on {resource}')
    return json.loads(result.stdout)


def verify_identity():
    identity = aws(['sts', 'get-caller-identity'], 'sts:GetCallerIdentity', 'current profile')
    if not identity.get('Arn', '').startswith(ROLE):
        raise PermissionError('Unexpected AWS role; no S3 operation performed. ARN: ' + identity.get('Arn', '(missing)'))


def location(here):
    loc = json.loads((here / 's3-location.json').read_text())
    manifest_path = here / 'manifest.json'
    sha = digest(manifest_path)
    if (loc.get('schema') != 'ggd-community-materials-s3@1' or loc.get('bucket') != BUCKET
            or loc.get('region') != REGION or loc.get('profile') != PROFILE
            or loc.get('manifestSha256') != sha or loc.get('prefix') != f'community-hero-forge/{sha}/'):
        raise ValueError('S3 location must match the authorized bucket/profile and committed manifest')
    manifest = json.loads(manifest_path.read_text())
    rows = manifest['parts']
    if not rows or manifest.get('schema') != 'ggd-community-materials-archive@1':
        raise ValueError('Unknown or empty material manifest')
    for index, row in enumerate(rows):
        if (row['path'] != f'payload.tar.gz.part{index:03d}' or not 0 < row['bytes'] <= 32 * 1024 * 1024
                or not re.fullmatch('[0-9a-f]{64}', row['sha256'])):
            raise ValueError('Invalid material part')
    return loc, rows


def validate_file(path, row):
    if path.is_symlink() or not path.is_file() or path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
        raise ValueError('Missing or corrupt material: ' + str(path))


def fetch_parts(here, cache):
    loc, rows = location(here)
    if cache.is_symlink():
        raise ValueError('Cache cannot be a symlink')
    cache.mkdir(parents=True, exist_ok=True)
    verify_identity()
    for index, row in enumerate(rows):
        target = cache / row['path']
        if target.exists() or target.is_symlink():
            validate_file(target, row)
            continue
        fd, temporary = tempfile.mkstemp(prefix=row['path'] + '.', suffix='.download', dir=cache)
        os.close(fd)
        temporary = Path(temporary)
        key = loc['prefix'] + row['path']
        try:
            aws(['s3api', 'get-object', '--bucket', BUCKET, '--key', key,
                 '--checksum-mode', 'ENABLED', str(temporary)], 's3:GetObject', f'arn:aws:s3:::{BUCKET}/{key}')
            validate_file(temporary, row)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        print(json.dumps({'downloadedParts': index + 1, 'totalParts': len(rows)}), flush=True)
    return {'verifiedParts': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'cache': str(cache)}


def publish(here, source):
    loc, parts = location(here)
    manifest = here / 'manifest.json'
    rows = [*parts, {'path': 'manifest.json', 'bytes': manifest.stat().st_size, 'sha256': digest(manifest)}]
    paths = [source / row['path'] for row in parts] + [manifest]
    # Fail before any remote write when local bytes are incomplete or changed.
    for path, row in zip(paths, rows):
        validate_file(path, row)
    verify_identity()
    receipts = []
    for path, row in zip(paths, rows):
        key = loc['prefix'] + row['path']
        resource = f'arn:aws:s3:::{BUCKET}/{key}'
        checksum = base64.b64encode(bytes.fromhex(row['sha256'])).decode('ascii')
        head_args = ['s3api', 'head-object', '--bucket', BUCKET, '--key', key, '--checksum-mode', 'ENABLED']
        existing = aws(head_args, 's3:GetObject', resource, missing_ok=True)
        if existing is None:
            result = aws(['s3api', 'put-object', '--bucket', BUCKET, '--key', key,
                          '--body', str(path), '--if-none-match', '*', '--checksum-algorithm', 'SHA256',
                          '--checksum-sha256', checksum, '--metadata', 'sha256=' + row['sha256']],
                         's3:PutObject', resource)
            if result.get('ChecksumSHA256') != checksum:
                raise ValueError('S3 did not confirm the expected upload checksum: ' + key)
            existing = aws(head_args, 's3:GetObject', resource)
        if (existing.get('ContentLength') != row['bytes'] or existing.get('ChecksumSHA256') != checksum
                or existing.get('Metadata', {}).get('sha256') != row['sha256']):
            raise ValueError('Existing S3 object differs; it will not be overwritten: ' + key)
        receipts.append({**row, 'key': key, 'etag': existing['ETag'], 'checksumSHA256': checksum})
        print(json.dumps({'verifiedObjects': len(receipts), 'totalObjects': len(rows), 'key': key}), flush=True)
    return {'schema': 'ggd-community-materials-s3-receipt@1', 'bucket': BUCKET, 'region': REGION,
            'profile': PROFILE, 'manifestSha256': loc['manifestSha256'], 'prefix': loc['prefix'],
            'objects': receipts, 'parts': len(parts), 'partBytes': sum(r['bytes'] for r in parts)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    commands = ap.add_subparsers(dest='command', required=True)
    upload = commands.add_parser('upload', help='Create only; refuses replacement, uses no deletion or IAM actions')
    upload.add_argument('--source-parts', type=Path, required=True)
    upload.add_argument('--receipt', type=Path, required=True)
    download = commands.add_parser('download', help='Fetch verified parts for restore.py --parts-dir')
    download.add_argument('--parts-dir', type=Path, required=True)
    args = ap.parse_args()
    here = Path(__file__).resolve().parent
    if args.command == 'upload':
        if args.receipt.exists() or args.receipt.is_symlink():
            raise ValueError('Receipt must be a new file')
        receipt = publish(here, args.source_parts)
        args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    else:
        print(json.dumps(fetch_parts(here, args.parts_dir)))


if __name__ == '__main__':
    main()
