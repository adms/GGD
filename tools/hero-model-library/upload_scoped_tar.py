"""Publish an already frozen scoped TAR with full archive and member readback.

Uses the existing authorized AWS wrapper. No catalog mutation or local deletion.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import tarfile

from backup_intake import aws, sha, BUCKET


def scoped_members(path):
    """Hash every ordinary member and reject any member outside the allowlist shape."""
    rows = []
    seen = set()
    with tarfile.open(path, 'r|gz') as archive:
        for entry in archive:
            name = entry.name
            if (not entry.isfile() or name.startswith('/') or '\\' in name or '\0' in name
                    or ':' in name.split('/')[0]
                    or any(part in {'', '.', '..'} for part in name.split('/'))):
                raise ValueError('Nonregular or unsafe scoped archive member: ' + name)
            if name in seen:
                raise ValueError('Duplicate scoped archive member: ' + name)
            seen.add(name)
            digest = hashlib.sha256()
            size = 0
            with archive.extractfile(entry) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
                    size += len(block)
            if size != entry.size:
                raise ValueError('Scoped archive member size mismatch: ' + name)
            rows.append(dict(path=name, bytes=size, sha256=digest.hexdigest()))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
    manifest = json.loads(manifest_bytes)

    def require_frozen_manifest():
        if manifest_path.read_bytes() != manifest_bytes:
            raise ValueError('Frozen manifest bytes changed during publication')
    source_id, digest = manifest['sourceId'], manifest['sha256']
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', source_id) or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Invalid frozen source or archive identity')
    uri = f's3://{BUCKET}/legacy/public-model-sources/{source_id}/{digest}.tar.gz'
    if manifest['plannedS3Uri'] != uri or manifest['archiveFormat'] != 'tar-gzip':
        raise ValueError('Unexpected bucket, namespace or container format')
    archive = Path(manifest['absoluteLocalArchive'])
    if archive.stat().st_size != manifest['bytes'] or sha(archive) != digest:
        raise ValueError('Frozen archive bytes changed')
    expected = [{k: row[k] for k in ('path', 'bytes', 'sha256')} for row in manifest['files']]
    if len(expected) != manifest['fileCount'] or len({row['path'] for row in expected}) != len(expected):
        raise ValueError('Duplicate or inconsistent frozen member inventory')
    output = manifest_path.parent
    back = output / 's3-full-readback.tar.gz'
    manifest_back = output / 's3-manifest-readback.json'
    receipt_path = output / 's3-verified-receipt.json'
    for destination in (back, manifest_back, receipt_path):
        if destination.exists() or destination.is_symlink():
            raise ValueError('Preserve existing publication output: ' + str(destination))
    arn = aws(['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'],
              'sts:GetCallerIdentity', 'configured vibe-coding role').strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:
        raise ValueError('Configured identity is not the authorized role')
    print(json.dumps(dict(phase='uploading', bytes=manifest['bytes'], s3Uri=uri)), flush=True)
    aws(['s3', 'cp', str(archive), uri, '--only-show-errors'], 's3:PutObject', uri)
    print(json.dumps(dict(phase='full-get', s3Uri=uri)), flush=True)
    aws(['s3', 'cp', uri, str(back), '--only-show-errors'], 's3:GetObject', uri)
    if sha(back) != digest or scoped_members(back) != expected:
        raise ValueError('Remote archive or per-member content mismatch')
    require_frozen_manifest()
    manifest_uri = uri.removesuffix('.tar.gz') + '.files.json'
    aws(['s3', 'cp', str(manifest_path), manifest_uri, '--only-show-errors'], 's3:PutObject', manifest_uri)
    aws(['s3', 'cp', manifest_uri, str(manifest_back), '--only-show-errors'], 's3:GetObject', manifest_uri)
    if manifest_back.read_bytes() != manifest_bytes:
        raise ValueError('Remote file manifest differs')
    require_frozen_manifest()
    receipt = dict(schema='ggd-scoped-tar-s3-receipt@1', id=source_id,
        s3Uri=uri, manifestUri=manifest_uri, sha256=digest, bytes=manifest['bytes'],
        archiveFormat='tar-gzip', archiveMemberRoot=manifest.get('archiveMemberRoot', ''),
        fileCount=len(expected), manifestSha256=manifest_sha256,
        localArchive=str(archive), localReadback=str(back), localManifest=str(manifest_path),
        readbackVerified=True, fullGetVerified=True, allArchiveMembersSha256Verified=True,
        profile='vibe-coding', region='ap-east-2', localPreserved=True)
    with receipt_path.open('x') as receipt_file:
        receipt_file.write(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(receiptPath=str(receipt_path), fileCount=len(expected), fullGetVerified=True)), flush=True)


if __name__ == '__main__':
    main()
