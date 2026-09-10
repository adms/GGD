#!/usr/bin/env python3
"""Build Alucard's exact, deterministic 316-member legacy archive.

The allowlist comes from the separately audited admission proposal.  This never
walks the conversion directory, so later experiments and other revisions cannot
silently become part of the published source snapshot.
"""
import argparse
import gzip
import hashlib
import json
import os
import stat
import tarfile
from pathlib import Path, PurePosixPath


CHUNK = 1024 * 1024
REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
SOURCE_ID = 'parallel-ns-alucard-ssbu-audio-decoded-v1'
ROOT = WORKSPACE / 'GGD-Asset-Library/conversions/alucard-audio-20260911-v1'
PROPOSAL = WORKSPACE / 'GGD-Asset-Library/intake/alucard-audio-registration-audit-20260911/scoped-backup-members-proposal.json'
OUT = ROOT / 'integration-v1/scoped-backup-v1'


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def safe_name(name):
    if not isinstance(name, str) or not name or '\\' in name or '\0' in name:
        raise ValueError('Invalid archive member path')
    path = PurePosixPath(name)
    if path.is_absolute() or ':' in name.split('/')[0] or any(part in {'', '.', '..'} for part in path.parts):
        raise ValueError('Archive member must be normalized and relative: ' + name)
    return name


def local_file(name):
    safe_name(name)
    current = ROOT
    if ROOT.is_symlink():
        raise ValueError('Conversion root cannot be a symlink')
    for part in PurePosixPath(name).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symlinked source member: ' + str(current))
    resolved = current.resolve()
    if not resolved.is_relative_to(ROOT.resolve()) or not resolved.is_file():
        raise ValueError('Missing regular source member: ' + str(current))
    return resolved


def rows():
    proposal = json.loads(PROPOSAL.read_text(encoding='utf-8'))
    if (proposal.get('status') != 'proposal-no-archive-built-no-AWS'
            or proposal.get('sourceId') != SOURCE_ID
            or Path(proposal.get('localRoot', '')).resolve() != ROOT.resolve()):
        raise ValueError('Unexpected scoped-backup proposal identity')
    out, seen = [], set()
    for row in proposal.get('files', []):
        name = safe_name(row.get('path'))
        if name in seen or not isinstance(row.get('bytes'), int) or row['bytes'] < 0:
            raise ValueError('Duplicate or invalid proposed member: ' + name)
        if not isinstance(row.get('sha256'), str) or len(row['sha256']) != 64:
            raise ValueError('Invalid proposed member SHA: ' + name)
        seen.add(name)
        out.append({'path': name, 'bytes': row['bytes'], 'sha256': row['sha256']})
    out.sort(key=lambda row: row['path'])
    if len(out) != proposal.get('fileCount') or sum(row['bytes'] for row in out) != proposal.get('bytes'):
        raise ValueError('Proposal count or byte total mismatch')
    if len(out) != 316 or sum(row['bytes'] for row in out) != 143190488:
        raise ValueError('Pinned Alucard scope changed')
    return out


def create(archive, expected):
    with archive.open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', compresslevel=1, fileobj=raw, mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w|', format=tarfile.PAX_FORMAT) as tar:
                for row in expected:
                    path = local_file(row['path'])
                    before = path.stat(follow_symlinks=False)
                    if not stat.S_ISREG(before.st_mode) or before.st_size != row['bytes']:
                        raise ValueError('Source size/type mismatch: ' + row['path'])
                    digest, total = hashlib.sha256(), 0
                    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
                    with os.fdopen(fd, 'rb') as stream:
                        info = tarfile.TarInfo(row['path'])
                        info.size = row['bytes']; info.mode = 0o644
                        info.uid = info.gid = 0; info.uname = info.gname = ''; info.mtime = 0
                        class Reader:
                            def read(self, size=-1):
                                nonlocal total
                                data = stream.read(size); digest.update(data); total += len(data)
                                return data
                        tar.addfile(info, Reader())
                    after = path.stat(follow_symlinks=False)
                    if total != row['bytes'] or digest.hexdigest() != row['sha256'] or after != before:
                        raise ValueError('Source changed or hash mismatch: ' + row['path'])


def verify(archive, expected):
    expected_by_path = {row['path']: row for row in expected}
    found = []
    with tarfile.open(archive, 'r|gz') as tar:
        for item in tar:
            name = safe_name(item.name)
            if not item.isfile() or item.issym() or item.islnk() or name not in expected_by_path:
                raise ValueError('Unexpected/nonregular archive member: ' + name)
            row = expected_by_path.pop(name)
            if item.size != row['bytes'] or item.mode != 0o644 or item.uid or item.gid or item.mtime or item.uname or item.gname:
                raise ValueError('Nondeterministic or invalid member metadata: ' + name)
            digest, total = hashlib.sha256(), 0
            with tar.extractfile(item) as stream:
                for block in iter(lambda: stream.read(CHUNK), b''):
                    digest.update(block); total += len(block)
            if total != row['bytes'] or digest.hexdigest() != row['sha256']:
                raise ValueError('Archive member hash mismatch: ' + name)
            found.append({'path': name, 'bytes': total, 'sha256': digest.hexdigest(), 'localArchiveReadbackVerified': True, 's3ReadbackVerified': False})
    if expected_by_path:
        raise ValueError('Archive missing members: ' + ', '.join(sorted(expected_by_path)[:3]))
    return sorted(found, key=lambda row: row['path'])


def write_once(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if path.exists() and path.read_bytes() != data:
        raise ValueError('Refusing to overwrite different evidence: ' + str(path))
    if not path.exists():
        path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    expected = rows(); OUT.mkdir(parents=True, exist_ok=True)
    archive = OUT / 'parallel-ns-alucard-ssbu-audio-decoded-v1.tar.gz'
    if args.verify_only:
        if not archive.is_file():
            raise FileNotFoundError(archive)
    else:
        create(archive, expected)
    proof = verify(archive, expected)
    digest = sha(archive)
    manifest = {'schema': 'ggd.scoped-local-archive@1', 'sourceId': SOURCE_ID,
        'scope': 'Proposal allowlist only: 314 frozen revision-02 rows, frozen manifest, and normalized adapter; no recursive conversion-root archive.',
        'sourceRoot': str(ROOT), 'archiveFormat': 'tar-gzip', 'archiveMemberRoot': '',
        'absoluteLocalArchive': str(archive.resolve()), 'bytes': archive.stat().st_size, 'sha256': digest,
        'fileCount': len(expected), 'uncompressedFileBytes': sum(row['bytes'] for row in expected),
        'localArchiveReadbackVerified': True, 's3ReadbackVerified': False, 'readbackVerified': False,
        'plannedS3Uri': f's3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/{SOURCE_ID}/{digest}.tar.gz',
        'contentKind': 'scoped-frozen-audio-conversion',
        'deterministicParameters': {'tarFormat': 'PAX', 'memberOrder': 'lexicographic POSIX path', 'mode': '0644', 'uid': 0, 'gid': 0, 'mtime': 0, 'gzipMtime': 0, 'gzipFilename': '', 'gzipCompressLevel': 1},
        'files': expected}
    write_once(OUT / 'manifest.json', manifest)
    write_once(OUT / 'per-member-local-readback.json', {'schema': 'ggd.local-archive-member-readback@1', 'archiveSha256': digest, 'fileCount': len(proof), 'allLocalArchiveMemberHashesMatch': True, 's3ReadbackVerified': False, 'readbackVerified': False, 'files': proof})
    print(json.dumps({key: value for key, value in manifest.items() if key != 'files'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
