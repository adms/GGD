"""Immutable Dai component intake backup. Uses the configured AWS profile only.

Run freeze, transfer, verify sequentially. Never modifies intake or deletes S3.
"""
from pathlib import Path
import datetime
import gzip
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parents[2] / 'backups' / 'dai-shinteo-public-20260911'
RECEIPT = Path('/private/tmp/ggd-dai-shinteo-source-s3-backup.json')
PREFIX = 's3://ggd-390630837668-ap-east-2-an/legacy/character-models/dai-shinteo-public-20260911/'
PROFILE = 'vibe-coding'
REGION = 'ap-east-2'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def listing():
    rows = []
    for p in sorted(ROOT.rglob('*')):
        assert not p.is_symlink(), str(p)
        if p.is_file():
            b = p.read_bytes()
            rows.append({'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': digest(b)})
    return rows

def archive(path, rows):
    with path.open('xb') as f:
        with gzip.GzipFile(filename='', fileobj=f, mode='wb', mtime=0, compresslevel=6) as gz:
            with tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tar:
                for row in rows:
                    b = (ROOT / row['path']).read_bytes()
                    assert len(b) == row['bytes'] and digest(b) == row['sha256']
                    info = tarfile.TarInfo(row['path'])
                    info.size, info.mode, info.mtime = len(b), 0o644, 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    tar.addfile(info, io.BytesIO(b))

def aws(args):
    env = dict(os.environ, AWS_PROFILE=PROFILE, AWS_REGION=REGION)
    result = subprocess.run(['aws', '--profile', PROFILE, '--region', REGION, *args],
                            env=env, text=True, capture_output=True)
    if result.returncode:
        # Stop exactly here. Never expand permissions or change credentials.
        raise RuntimeError('AWS action failed: ' + json.dumps(args) + '\n' + result.stderr)
    return result.stdout

def archive_members(path, rows):
    with tarfile.open(path, 'r:gz') as tar:
        members = tar.getmembers()
        assert [m.name for m in members] == [r['path'] for r in rows]
        for member, row in zip(members, rows):
            assert member.isfile()
            b = tar.extractfile(member).read()
            assert len(b) == row['bytes'] and digest(b) == row['sha256'], row['path']

mode = sys.argv[1]
OUT.mkdir(parents=True, exist_ok=True)
if mode == 'freeze':
    assert not RECEIPT.exists()
    rows = listing()
    original_manifest = json.loads((ROOT / 'file-manifest.json').read_text())
    for row in original_manifest['files']:
        b = (ROOT / row['relativePath']).read_bytes()
        assert len(b) == row['bytes'] and digest(b) == row['sha256'], row['relativePath']
    tmp = OUT / 'source.tar.gz'
    archive(tmp, rows)
    sha = digest(tmp.read_bytes())
    dest = OUT / (sha + '.tar.gz')
    assert not dest.exists()
    tmp.rename(dest)
    archive_members(dest, rows)
    assert listing() == rows
    receipt = {'schema': 'ggd.immutable-source-backup.v1', 'sourceRoot': str(ROOT),
               'archivePath': str(dest), 'archiveBytes': dest.stat().st_size,
               'archiveSha256': sha, 'memberCount': len(rows), 'members': rows,
               's3Uri': PREFIX + dest.name, 'profile': PROFILE, 'region': REGION,
               'expectedRoleSubstring': 'assumed-role/vibe-coding-s3-role/',
               'identityVerified': False, 'status': 'archive-ready-pending-upload',
               'uploaded': False, 'fullGetReadback': False, 'localPreserved': True,
               'allLocalArchiveMembersVerifiedBeforeUpload': True, 'excludedFiles': []}
    save(RECEIPT, receipt)
elif mode == 'transfer':
    receipt = json.loads(RECEIPT.read_text())
    assert listing() == receipt['members']
    identity = json.loads(aws(['sts', 'get-caller-identity', '--output', 'json']))
    assert receipt['expectedRoleSubstring'] in identity['Arn'], 'Unexpected AWS role; stopped'
    receipt.update({'identityVerified': True, 'verifiedArn': identity['Arn']})
    save(RECEIPT, receipt)
    aws(['s3', 'cp', receipt['archivePath'], receipt['s3Uri'], '--only-show-errors'])
    receipt['uploaded'] = True
    save(RECEIPT, receipt)
    readback = OUT / 'full-get.tar.gz'
    assert not readback.exists()
    aws(['s3', 'cp', receipt['s3Uri'], str(readback), '--only-show-errors'])
    receipt.update({'readbackPath': str(readback), 'status': 'downloaded-pending-member-verification'})
    save(RECEIPT, receipt)
elif mode == 'verify':
    receipt = json.loads(RECEIPT.read_text())
    readback = Path(receipt['readbackPath'])
    assert readback.stat().st_size == receipt['archiveBytes']
    assert digest(readback.read_bytes()) == receipt['archiveSha256']
    archive_members(readback, receipt['members'])
    assert listing() == receipt['members']
    repeat = OUT / 'second-deterministic.tar.gz'
    archive(repeat, receipt['members'])
    assert digest(repeat.read_bytes()) == receipt['archiveSha256']
    receipt.update({'status': 's3-full-get-and-every-member-verified', 'fullGetReadback': True,
                    'allMembersVerified': True, 'localUnchangedBeforeAfter': True,
                    'deterministicSecondArchiveSha256': digest(repeat.read_bytes()),
                    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    save(RECEIPT, receipt)
    save(OUT / 'backup-receipt.json', receipt)
    entry = json.loads((ROOT / 'public-source-entry.json').read_text())
    entry.update({'publicationStatus': 'legacy-backup-verified', 's3Uri': receipt['s3Uri'],
                  's3Backup': {k: receipt[k] for k in ['archiveSha256', 'archiveBytes', 'memberCount',
                      'fullGetReadback', 'allMembersVerified', 'localUnchangedBeforeAfter']},
                  'backupReceiptPath': str(OUT / 'backup-receipt.json'),
                  'frozenLocalEntryUnchanged': True})
    save(OUT / 'public-source-entry-backed-up.json', entry)
else:
    raise SystemExit('Expected freeze, transfer or verify')
print(json.dumps({k: receipt[k] for k in ['status', 'archivePath', 'archiveSha256', 'archiveBytes', 'memberCount', 's3Uri']}, ensure_ascii=False))
