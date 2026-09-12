#!/usr/bin/env python3
"""Archive a registered public or paid intake, retaining every file and SHA-256.

Creates a local content-addressed ZIP and pending upload records only; no AWS calls.
"""
import argparse
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_id')
    parser.add_argument('--workspace', type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    data_path = REPO / 'materials/hero-model-library/download-sources.json'
    index_path = data_path.with_name('public-source-files.json')
    data = json.loads(data_path.read_text())
    index = json.loads(index_path.read_text())
    matches = [(collection, s) for collection in ('publicSources', 'paidSources')
               for s in data.get(collection, []) if s['id'] == args.source_id]
    if len(matches) != 1:
        raise SystemExit('Expected one unique registered source ID')
    collection, source = matches[0]
    source_id = source['id']
    if not source_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in source_id):
        raise SystemExit('Source ID must be a safe lowercase path component')
    home = (workspace / source['localPath']).resolve()
    if not home.is_relative_to(workspace) or home == workspace or not home.is_dir():
        raise SystemExit('Intake must be an existing directory within the workspace')
    output = workspace / 'outputs/model-source-backups' / source_id
    if output.resolve().is_relative_to(home):
        raise SystemExit('Backup output cannot be inside the intake')
    files = []
    for path in sorted(home.rglob('*')):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise SystemExit('Unsupported intake member: ' + str(path.relative_to(home)))
        if path.is_file():
            files.append(path)
    if not files:
        raise SystemExit('Refusing an empty intake')
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    with tempfile.TemporaryDirectory(prefix='building-', dir=output) as temp:
        archive = Path(temp) / 'backup.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for path in files:
                blob = path.read_bytes()
                rel = path.relative_to(home).as_posix()
                info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, blob)
                rows.append({'path': rel, 'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()})
        with zipfile.ZipFile(archive) as z:
            for row in rows:
                blob = z.read(row['path'])
                if len(blob) != row['bytes'] or hashlib.sha256(blob).hexdigest() != row['sha256']:
                    raise SystemExit('Backup readback mismatch: ' + row['path'])
        digest = file_sha256(archive)
        final = output / (digest + '.zip')
        if final.exists():
            if file_sha256(final) != digest:
                raise SystemExit('Existing content-addressed archive is corrupt')
        else:
            archive.rename(final)
    prefix = 'paid-model-sources' if collection == 'paidSources' else 'public-model-sources'
    uri = f's3://ggd-390630837668-ap-east-2-an/legacy/{prefix}/{source_id}/{digest}.zip'
    existing = next((s for s in index['sources'] if s['id'] == source_id and s['sha256'] == digest), None)
    if existing:
        print('Already indexed: ' + existing['s3Uri'])
        return
    pending = {'id': source_id, 'localArchive': final.relative_to(workspace).as_posix(),
               'plannedS3Uri': uri, 'bytes': final.stat().st_size, 'sha256': digest,
               'contentKind': 'complete-intake', 'files': rows, 'readbackVerified': False}
    if not any(s['id'] == source_id and s['sha256'] == digest for s in index.get('pendingUploads', [])):
        index.setdefault('pendingUploads', []).append(pending)
    source['pendingBackup'] = {k: pending[k] for k in ('localArchive', 'plannedS3Uri', 'bytes', 'sha256', 'readbackVerified')}
    source['pendingBackup']['status'] = 'not-uploaded'
    # A prior verified backup remains in the history and on the source until the new upload succeeds.
    if not source.get('backup'):
        source['publicationStatus'] = 'local-only-awaiting-s3-upload'
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in pending.items() if k != 'files'}, ensure_ascii=False))
    print('Files archived and readback verified:', len(rows))


if __name__ == '__main__':
    main()
