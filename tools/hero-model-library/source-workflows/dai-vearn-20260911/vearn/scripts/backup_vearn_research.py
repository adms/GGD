import gzip
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile


OUT = pathlib.Path(__file__).resolve().parents[1]
LIBRARY = OUT.parents[1]
SOURCE = LIBRARY / 'intake/public-models-20260911/parallel-vearn-priority-source-audit'
MEMBER_ROOT = SOURCE.name
BUCKET = 'ggd-390630837668-ap-east-2-an'
EXPECTED_MANIFEST_SHA = 'a737913e84d5f1afcc6bc1b3a1b01ae29380868159b22f1c6df0d0ce5a5dc673'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write(name, obj):
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    return p


def aws(arguments, action, resource):
    env = os.environ.copy()
    env.update(AWS_PROFILE='vibe-coding', AWS_REGION='ap-east-2', AWS_DEFAULT_REGION='ap-east-2')
    result = subprocess.run(
        ['aws', '--profile', 'vibe-coding', '--region', 'ap-east-2'] + arguments,
        env=env, capture_output=True, text=True,
    )
    if result.returncode:
        failure = dict(action=action, resource=resource, returncode=result.returncode,
                       accessDenied=('AccessDenied' in result.stderr), error=result.stderr.strip())
        write('failure.json', failure)
        raise RuntimeError(json.dumps(failure))
    return result.stdout


def rows_in_archive(path):
    rows = []
    with tarfile.open(path, 'r:gz') as archive:
        seen = set()
        for member in archive:
            p = pathlib.PurePosixPath(member.name)
            assert member.isfile() and not member.issym() and not member.islnk()
            assert not p.is_absolute() and '..' not in p.parts
            assert p.parts[0] == MEMBER_ROOT and len(p.parts) > 1
            assert member.name not in seen
            seen.add(member.name)
            payload = archive.extractfile(member).read()
            rows.append(dict(path=pathlib.PurePosixPath(*p.parts[1:]).as_posix(),
                             archiveMember=member.name, bytes=len(payload),
                             sha256=hashlib.sha256(payload).hexdigest()))
    return rows


def main():
    identity = json.loads(aws(['sts', 'get-caller-identity', '--output', 'json'],
                              'sts:GetCallerIdentity', 'configured profile vibe-coding'))
    assert 'assumed-role/vibe-coding-s3-role/' in identity['Arn'], 'STOP: unexpected AWS identity'
    manifest_path = SOURCE / 'file-manifest.json'
    assert sha(manifest_path) == EXPECTED_MANIFEST_SHA, 'Frozen source manifest changed'
    manifest = json.loads(manifest_path.read_text())
    for row in manifest['files']:
        p = SOURCE / row['path']
        assert p.stat().st_size == row['bytes'] and sha(p) == row['sha256'], p
    files = sorted(p for p in SOURCE.rglob('*') if p.is_file())
    assert len(files) == 19  # 17 listed files plus the frozen manifest and delivery receipt.
    assert not any(p.is_symlink() for p in SOURCE.rglob('*'))
    expected = [dict(path=p.relative_to(SOURCE).as_posix(),
                     archiveMember=(pathlib.PurePosixPath(MEMBER_ROOT) / p.relative_to(SOURCE).as_posix()).as_posix(),
                     bytes=p.stat().st_size, sha256=sha(p)) for p in files]
    tar_path = OUT / 'raw-backup.tar'
    with tarfile.open(tar_path, 'w', format=tarfile.PAX_FORMAT) as archive:
        for p, row in zip(files, expected):
            info = archive.gettarinfo(str(p), arcname=row['archiveMember'])
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            info.mode = 0o644
            info.pax_headers = {}
            with p.open('rb') as stream:
                archive.addfile(info, stream)
    gzip_path = OUT / 'raw-backup.tar.gz'
    with tar_path.open('rb') as src, gzip_path.open('wb') as dst:
        with gzip.GzipFile(filename='', fileobj=dst, mode='wb', mtime=0, compresslevel=9) as compressor:
            shutil.copyfileobj(src, compressor)
    digest = sha(gzip_path)
    assert rows_in_archive(gzip_path) == expected
    archive_path = OUT / (digest + '.tar.gz')
    if archive_path.exists():
        assert sha(archive_path) == digest
    else:
        shutil.copyfile(gzip_path, archive_path)
    uri = f's3://{BUCKET}/legacy/source-research/vearn-priority-20260911/{digest}.tar.gz'
    inventory = write('backup-files.json', dict(schema='ggd.raw-backup-file-manifest@1',
                       sourceRoot=str(SOURCE), archiveMemberRoot=MEMBER_ROOT,
                       archiveFormat='tar-gzip', sourceInventorySha256=EXPECTED_MANIFEST_SHA,
                       files=expected, fileCount=len(expected), bytes=sum(r['bytes'] for r in expected)))
    aws(['s3', 'cp', str(archive_path), uri, '--only-show-errors'], 's3:PutObject', uri)
    readback = OUT / 'full-get.tar.gz'
    aws(['s3', 'cp', uri, str(readback), '--only-show-errors'], 's3:GetObject', uri)
    assert sha(readback) == digest
    assert rows_in_archive(readback) == expected
    for p, row in zip(files, expected):
        assert p.stat().st_size == row['bytes'] and sha(p) == row['sha256'], 'Source changed during backup'
    manifest_uri = uri[:-7] + '.files.json'
    aws(['s3', 'cp', str(inventory), manifest_uri, '--only-show-errors'], 's3:PutObject', manifest_uri)
    manifest_readback = OUT / 'backup-files-full-get.json'
    aws(['s3', 'cp', manifest_uri, str(manifest_readback), '--only-show-errors'], 's3:GetObject', manifest_uri)
    assert inventory.read_bytes() == manifest_readback.read_bytes()
    receipt = dict(schema='ggd.verified-source-research-backup@1', sourceRoot=str(SOURCE),
        s3Uri=uri, sha256=digest, bytes=archive_path.stat().st_size, archiveFormat='tar-gzip',
        archiveMemberRoot=MEMBER_ROOT, localArchive=str(archive_path), fullGetPath=str(readback),
        sourceInventoryPath=str(manifest_path), sourceInventorySha256=EXPECTED_MANIFEST_SHA,
        backupInventoryPath=str(inventory), backupInventorySha256=sha(inventory),
        backupInventoryUri=manifest_uri, listedSourceFiles=17, archiveFileCount=19,
        fullGetSha256Verified=True, allArchiveMembersSha256Verified=True,
        allLocalFilesUnchanged=True, inventoryFullGetVerified=True, verified=True,
        acquiredCharacterAssetCount=0, classification='research-only', defaultEligible=False,
        identityArn=identity['Arn'], awsProfile='vibe-coding', awsRegion='ap-east-2')
    receipt_path = write('s3-backup-receipt.json', receipt)
    entry = json.loads((SOURCE / 'public-source-entry.json').read_text())
    entry.update(sourceKind='research-only', acquisitionStatus='research-only-no-asset-package',
                 acquiredAssetPayloadCount=0, defaultEligible=False,
                 backup=dict(s3Uri=uri, sha256=digest, bytes=receipt['bytes'],
                   archiveFormat='tar-gzip', archiveMemberRoot=MEMBER_ROOT,
                   verified=True, fullGetAndEveryFileVerified=True,
                   inventoryUri=manifest_uri, inventorySha256=sha(inventory),
                   receiptPath=str(receipt_path), receiptSha256=sha(receipt_path)))
    entry_path = write('source-lead-entry.json', entry)
    delivery = dict(receiptPath=str(receipt_path), receiptSha256=sha(receipt_path),
                    sourceLeadEntryPath=str(entry_path), sourceLeadEntrySha256=sha(entry_path),
                    s3Uri=uri, sha256=digest, bytes=receipt['bytes'], verified=True,
                    note='17 evidence/script/report files + manifest + delivery receipt = 19 archive files. Zero new character assets.')
    write('delivery.json', delivery)
    pathlib.Path('/private/tmp/ggd-vearn-research-s3-backup.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(delivery, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
