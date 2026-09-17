"""Collect and archive only the authorized completed main-e36 merge evidence.

Modes: collect, freeze, transfer, verify. Only the configured vibe-coding profile is used.
No credentials/IAM access or S3 deletion; an AWS failure stops this script.
"""
from pathlib import Path
import datetime
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent.parent / 'backups' / 'main-e36-merge-evidence-20260911'
RECEIPT = OUT / 's3-backup-receipt.json'
TMP_RECEIPT = Path('/private/tmp/ggd-main-e36-merge-evidence-full-backup.json')
PREFIX = 's3://ggd-390630837668-ap-east-2-an/legacy/model-design-audits/main-e36-merge-evidence-20260911/'
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
if mode == 'collect':
    assert not (ROOT / 'collection-manifest.json').exists(), 'Do not overwrite prior collection'
    repo = ROOT.parents[2] / 'GGD-hero-model-options'
    board = repo / 'docs/legacy/_overwrites/overwrite_temp_20260911-024729'
    checks = Path('/private/tmp/ggd-main-merge-checks')
    fix = Path('/private/tmp/ggd-formreceipts-history-fix')
    selected = []
    for p in sorted(board.rglob('*')):
        assert not p.is_symlink()
        if p.is_file():
            selected.append((p, 'board-history/overwrite_temp_20260911-024729/' + str(p.relative_to(board))))
    regeneration = json.loads((checks / 'regeneration.json').read_text())
    assert len(regeneration) == 20 and all(x['exitCode'] == 0 for x in regeneration)
    logs = sorted(checks.glob('*.txt'))
    logs = [p for p in logs if re.match(r'^(?:0[0-9]|1[0-9])-', p.name)]
    assert len(logs) == 20 and sorted(int(p.name[:2]) for p in logs) == list(range(20))
    assert {Path(x['log']).resolve() for x in regeneration} == {p.resolve() for p in logs}
    selected.extend((p, 'completed-regeneration/' + p.name) for p in logs)
    selected.append((checks / 'regeneration.json', 'completed-regeneration/regeneration.json'))
    selected.append((Path('/private/tmp/ggd-main-e36-postmerge-review.json'), 'postmerge-review/ggd-main-e36-postmerge-review.json'))
    excluded = []
    for p in sorted(fix.rglob('*')):
        rel = p.relative_to(fix)
        if 'node_modules' in rel.parts:
            excluded.append(str(rel))
            continue
        assert not p.is_symlink()
        if p.is_file():
            selected.append((p, 'formreceipts-history-fix/' + str(rel)))
    assert len(selected) == 37, 'Expected one board + twenty logs + regeneration + review + fourteen fix files'
    rows = []
    for source, relative in selected:
        assert source.is_file() and not source.is_symlink()
        data = source.read_bytes()
        dest = ROOT / relative
        assert not dest.exists(), str(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        assert source.read_bytes() == data and dest.read_bytes() == data
        rows.append({'originalPath': str(source.resolve()), 'path': relative, 'bytes': len(data), 'sha256': digest(data)})
    save(ROOT / 'collection-manifest.json', {'schema': 'ggd.scoped-evidence-collection.v1',
        'files': rows, 'copiedFileCount': len(rows), 'completedRegenerationLogCount': 20,
        'allListedGeneratorExitCodesZero': True, 'excludedNodeModulesEntries': excluded,
        'excludedOtherMergeCheckLogs': True, 'noRunningReleaseCheckLogsRead': True,
        'excluded20260910History': True, 'sourceFilesUnchangedAfterCopy': True})
    print(json.dumps({'status': 'collected-authorized-evidence', 'files': len(rows)}, ensure_ascii=False))
    raise SystemExit(0)
elif mode == 'freeze':
    assert not RECEIPT.exists(), 'Receipt exists; do not overwrite frozen backup'
    rows = inventory()
    assert len(rows) == 39, 'Expected37collectedfiles + collection-manifest + this archive tool'
    assert any(r['path'] == 'scripts/backup_main_e36_merge_evidence.py' for r in rows)
    collection = json.loads((ROOT / 'collection-manifest.json').read_text())
    assert collection['copiedFileCount'] == 37
    for row in collection['files']:
        assert digest(Path(row['originalPath']).read_bytes()) == row['sha256']
    temporary = OUT / 'source.tar.gz'
    archive(temporary, rows)
    sha = digest(temporary.read_bytes())
    final = OUT / (sha + '.tar.gz')
    assert not final.exists()
    temporary.rename(final)
    check_members(final, rows)
    assert inventory() == rows
    receipt = {'schema': 'ggd.main-e36-merge-evidence-backup.v1', 'sourceRoot': str(ROOT),
               'classification': 'merge-intermediates-completed-logs-and-history-fix-tools; not-runtime-assets',
               'archivePath': str(final), 'archiveBytes': final.stat().st_size,
               'archiveSha256': sha, 'archiveFormat': 'tar-gzip', 'archiveMemberRoot': '',
               'memberCount': len(rows), 'members': rows, 's3Uri': PREFIX + final.name,
               'profile': PROFILE, 'region': REGION, 'expectedRoleSubstring': EXPECTED_ROLE,
               'status': 'archive-ready-pending-upload', 'identityVerified': False,
               'uploaded': False, 'fullGetReadback': False, 'localPreserved': True,
               'collectedOriginalFileCount': 37, 'addedBackupScriptCount': 1,
               'collectionManifestIncluded': True, 'completedRegenerationLogs': 20,
               'releaseCheckLogsExcluded': True, 'old20260910HistoryExcluded': True,
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
    original_checks = []
    collection = json.loads((ROOT / 'collection-manifest.json').read_text())
    for row in collection['files']:
        source = Path(row['originalPath'])
        assert source.stat().st_size == row['bytes'] and digest(source.read_bytes()) == row['sha256']
        original_checks.append({'path': str(source), 'sha256': row['sha256'], 'unchanged': True})
    receipt.update({'originalSourceChecks': original_checks, 'originalSourcesUnchanged': True, 'status': 's3-full-get-and-every-member-verified', 'fullGetReadback': True,
                    'readbackArchiveSha256': digest(readback.read_bytes()), 'allMembersVerified': True,
                    'memberChecks': checks, 'localUnchangedBeforeAfter': True,
                    'deterministicSecondArchiveSha256': digest(second.read_bytes()),
                    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    save(RECEIPT, receipt)
    save(TMP_RECEIPT, receipt)
    compact = {k: v for k, v in receipt.items() if k not in ['members', 'memberChecks', 'originalSourceChecks']}
    compact.update({'sourceFileIndex': str(OUT / 'source-files.json'),
                    'sourceFileIndexSha256': digest((OUT / 'source-files.json').read_bytes()),
                    'fullReceiptPath': str(RECEIPT), 'fullReceiptSha256': digest(RECEIPT.read_bytes())})
    save(OUT / 'compact-receipt.json', compact)
    save(Path('/private/tmp/ggd-main-e36-merge-evidence-backup.json'), compact)
else:
    raise SystemExit('Expected collect, freeze, transfer or verify')
print(json.dumps({k: receipt[k] for k in ['status', 'memberCount', 'archiveBytes', 'archiveSha256', 's3Uri']}, ensure_ascii=False))
