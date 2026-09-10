"""Archive the complete frozen main-e36 audit, including this tool.

Modes: freeze, transfer, verify. Only the configured vibe-coding profile is used.
No credentials/IAM access or S3 deletion; an AWS failure stops this script.
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
OUT = ROOT.parent.parent / 'backups' / 'design-backlog-main-e36-20260911'
RECEIPT = OUT / 's3-backup-receipt.json'
TMP_RECEIPT = Path('/private/tmp/ggd-main-e36-source-audit-backup.json')
PREFIX = 's3://ggd-390630837668-ap-east-2-an/legacy/model-design-audits/main-e36-20260911/'
PROFILE = 'vibe-coding'
REGION = 'ap-east-2'
EXPECTED_ROLE = 'assumed-role/vibe-coding-s3-role/'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def inventory():
    rows = []
    for p in sorted(ROOT.rglob('*')):
        assert not p.is_symlink(), 'Unexpected symlink: ' + str(p)
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

def check_members(path, rows):
    checks = []
    with tarfile.open(path, 'r:gz') as tar:
        members = tar.getmembers()
        assert [m.name for m in members] == [r['path'] for r in rows]
        for member, row in zip(members, rows):
            assert member.isfile()
            b = tar.extractfile(member).read()
            assert len(b) == row['bytes'] and digest(b) == row['sha256'], row['path']
            local = (ROOT / row['path']).read_bytes()
            assert len(local) == row['bytes'] and digest(local) == row['sha256'], row['path']
            checks.append({'path': row['path'], 'bytes': len(b), 'sha256': digest(b),
                           'archiveMemberMatchesFrozenLocal': True})
    return checks

def aws(args):
    env = dict(os.environ, AWS_PROFILE=PROFILE, AWS_REGION=REGION)
    p = subprocess.run(['aws', '--profile', PROFILE, '--region', REGION, *args],
                       env=env, text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError('AWS action stopped: ' + json.dumps(args) + '\n' + p.stderr)
    return p.stdout

OUT.mkdir(parents=True, exist_ok=True)
mode = sys.argv[1]
if mode == 'freeze':
    assert not RECEIPT.exists(), 'Receipt exists; do not overwrite frozen backup'
    rows = inventory()
    assert len(rows) == 8, 'Expected confirmed seven audit files plus this archive tool'
    assert any(r['path'] == 'scripts/backup_main_e36_audit.py' for r in rows)
    local_audit = ROOT / 'ggd-dai-vearn-final-backup-audit.json'
    assert digest(local_audit.read_bytes()) == '251b50ae88e087237a1d59df62664a67d188d810ce4f7af3e9ecd83f10bf5db0'
    temporary = OUT / 'source.tar.gz'
    archive(temporary, rows)
    sha = digest(temporary.read_bytes())
    final = OUT / (sha + '.tar.gz')
    assert not final.exists()
    temporary.rename(final)
    check_members(final, rows)
    assert inventory() == rows
    receipt = {'schema': 'ggd.main-e36-source-audit-backup.v1', 'sourceRoot': str(ROOT),
               'classification': 'raw-design-audit-and-authored-tools; not-runtime-assets',
               'archivePath': str(final), 'archiveBytes': final.stat().st_size,
               'archiveSha256': sha, 'archiveFormat': 'tar-gzip', 'archiveMemberRoot': '',
               'memberCount': len(rows), 'members': rows, 's3Uri': PREFIX + final.name,
               'profile': PROFILE, 'region': REGION, 'expectedRoleSubstring': EXPECTED_ROLE,
               'status': 'archive-ready-pending-upload', 'identityVerified': False,
               'uploaded': False, 'fullGetReadback': False, 'localPreserved': True,
               'initialConfirmedFileCount': 7, 'addedBackupScriptCount': 1,
               'daiVearnAuditWasAlreadyPresentAndUnchanged': True,
               'backupScriptIncluded': True, 'allMembersVerifiedBeforeUpload': True,
               'excludedFiles': [], 'repoChanged': False, 'centralChanged': False}
    save(OUT / 'source-files.json', {'schema': 'ggd.frozen-files.v1', 'sourceRoot': str(ROOT), 'files': rows})
    save(RECEIPT, receipt)
elif mode == 'transfer':
    receipt = json.loads(RECEIPT.read_text())
    assert inventory() == receipt['members']
    identity = json.loads(aws(['sts', 'get-caller-identity', '--output', 'json']))
    assert EXPECTED_ROLE in identity['Arn'], 'Unexpected AWS role: stop without S3 action'
    receipt.update({'identityVerified': True, 'verifiedArn': identity['Arn']})
    save(RECEIPT, receipt)
    aws(['s3', 'cp', receipt['archivePath'], receipt['s3Uri'], '--only-show-errors'])
    receipt['uploaded'] = True
    save(RECEIPT, receipt)
    readback = OUT / 'full-get.tar.gz'
    assert not readback.exists(), 'Do not overwrite previous readback'
    aws(['s3', 'cp', receipt['s3Uri'], str(readback), '--only-show-errors'])
    receipt.update({'readbackPath': str(readback), 'status': 'full-get-downloaded-pending-verification'})
    save(RECEIPT, receipt)
elif mode == 'verify':
    receipt = json.loads(RECEIPT.read_text())
    readback = Path(receipt['readbackPath'])
    assert readback.stat().st_size == receipt['archiveBytes']
    assert digest(readback.read_bytes()) == receipt['archiveSha256']
    checks = check_members(readback, receipt['members'])
    assert inventory() == receipt['members']
    second = OUT / 'second-deterministic.tar.gz'
    archive(second, receipt['members'])
    assert digest(second.read_bytes()) == receipt['archiveSha256']
    receipt.update({'status': 's3-full-get-and-every-member-verified', 'fullGetReadback': True,
                    'readbackArchiveSha256': digest(readback.read_bytes()), 'allMembersVerified': True,
                    'memberChecks': checks, 'localUnchangedBeforeAfter': True,
                    'deterministicSecondArchiveSha256': digest(second.read_bytes()),
                    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    save(RECEIPT, receipt)
    save(TMP_RECEIPT, receipt)
    compact = {k: v for k, v in receipt.items() if k not in ['members', 'memberChecks']}
    compact.update({'sourceFileIndex': str(OUT / 'source-files.json'),
                    'sourceFileIndexSha256': digest((OUT / 'source-files.json').read_bytes()),
                    'fullReceiptPath': str(RECEIPT), 'fullReceiptSha256': digest(RECEIPT.read_bytes())})
    save(OUT / 'compact-receipt.json', compact)
else:
    raise SystemExit('Expected freeze, transfer or verify')
print(json.dumps({k: receipt[k] for k in ['status', 'memberCount', 'archiveBytes', 'archiveSha256', 's3Uri']}, ensure_ascii=False))
