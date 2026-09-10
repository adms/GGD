"""Register a verified backup without replacing the source's original archive.

All files stay in the fixed public-source-files index. Optional source linkage
adds a supplemental delivery; matching independent components gain backup
locators only, never runtime URLs or hero readiness.
"""
import argparse
import json
from pathlib import Path

from backup_intake import BUCKET, sha
from upload_scoped_tar import scoped_members


def record_pending(args, repo):
    """Track a locally verified snapshot while its remote readback is pending."""
    manifest_path = args.receipt.resolve()
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('schema') != 'ggd-intake-backup-manifest@1':
        raise ValueError('Unexpected pending snapshot manifest')
    archive = manifest_path.with_name('source.tar.gz')
    uri, digest = manifest['s3Uri'], manifest['archiveSha256']
    if not uri.startswith(f's3://{BUCKET}/legacy/') or not uri.endswith('/' + digest + '.tar.gz'):
        raise ValueError('Unexpected pending snapshot URI')
    expected = [{key: row[key] for key in ['path', 'bytes', 'sha256']} for row in manifest['files']]
    if archive.stat().st_size != manifest['archiveBytes'] or sha(archive) != digest or scoped_members(archive) != expected:
        raise ValueError('Pending local archive changed')
    source_root = Path(manifest['source']).resolve()
    if not source_root.is_relative_to(repo.parent):
        raise ValueError('Pending source is outside workspace')
    for row in expected:
        local = source_root / row['path']
        parts = Path(row['path']).parts
        linked = any(source_root.joinpath(*parts[:end]).is_symlink() for end in range(1, len(parts) + 1))
        if linked or not local.resolve().is_relative_to(source_root) or not local.is_file() or local.stat().st_size != row['bytes'] or sha(local) != row['sha256']:
            raise ValueError('Pending snapshot listed source changed')
    base = repo / 'materials/hero-model-library'
    paths = [base / 'download-sources.json', base / 'public-source-files.json']
    initial = [path.read_bytes() for path in paths]
    downloads, index = [json.loads(blob) for blob in initial]
    key = (args.id, digest)
    if any((row['id'], row['sha256']) == key for row in index['sources']):
        raise ValueError('Cannot downgrade verified supplemental snapshot')
    entry = dict(id=args.id, sourceId=args.source_id, resourceRole=args.role,
        localPath=source_root.relative_to(repo.parent).as_posix(), localArchive=str(archive),
        plannedS3Uri=uri, bytes=manifest['archiveBytes'], sha256=digest, fileCount=len(expected),
        archiveFormat='tar-gzip', archiveMemberRoot='', files=expected,
        readbackVerified=False, fullReadbackVerified=False, s3ReadbackVerified=False,
        localArchiveReadbackVerified=True, localPreserved=True, acquiredAssetPayloadCount=0,
        snapshotScope='manifest-listed-files-only', unlistedLocalFiles='not-enumerated-or-claimed-backed-up',
        manifestPath=str(manifest_path), manifestSha256=sha(manifest_path),
        s3Use='backup-only-not-runtime-entry', publicationStatus='remote-full-readback-pending')
    rows = index.setdefault('pendingUploads', [])
    prior = [row for row in rows if (row['id'], row['sha256']) == key]
    if prior and prior != [entry]:
        raise ValueError('Different pending snapshot already recorded')
    if not prior:
        rows.append(entry)
    if args.source_id:
        sources = [row for row in downloads.get('publicSources', []) + downloads.get('paidSources', []) if row['id'] == args.source_id]
        if len(sources) != 1:
            raise ValueError('Expected one existing pending snapshot source')
        links = sources[0].setdefault('pendingSupplementalDeliveries', [])
        link = {key: value for key, value in entry.items() if key != 'files'}
        prior = [row for row in links if (row['id'], row['sha256']) == (args.id, digest)]
        if prior and prior != [link]:
            raise ValueError('Different pending source link already recorded')
        if not prior:
            links.append(link)
    if any(path.read_bytes() != before for path, before in zip(paths, initial)):
        raise ValueError('Central sources changed during pending verification')
    for path, data in zip(paths, [downloads, index]):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(id=args.id, files=len(expected), localArchiveVerified=True, remoteReadbackVerified=False)))


def main(argv=None, repo=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--id', required=True)
    parser.add_argument('--role', choices=['model-conversion-backup', 'integration-evidence-backup'], required=True)
    parser.add_argument('--source-id')
    parser.add_argument('--pending-manifest', action='store_true', help='The positional path is an intake manifest; remote readback is not yet verified.')
    args = parser.parse_args(argv)
    repo = Path(repo).resolve() if repo is not None else Path(__file__).resolve().parents[2]
    if args.pending_manifest:
        return record_pending(args, repo)
    receipt = json.loads(args.receipt.read_text())
    if any(receipt.get(key) is not True for key in ['fullGetVerified', 'allMemberSha256Verified', 'localUnchanged']):
        raise ValueError('Supplemental backup is not fully verified')
    if receipt.get('schema') != 'ggd-intake-backup-receipt@1':
        raise ValueError('Unexpected supplemental receipt schema')
    uri = receipt['s3Uri']
    if not uri.startswith(f's3://{BUCKET}/legacy/') or not uri.endswith('/' + receipt['archiveSha256'] + '.tar.gz'):
        raise ValueError('Unexpected supplemental archive location')
    if receipt.get('manifestUri') != uri.removesuffix('.tar.gz') + '.files.json':
        raise ValueError('Supplemental manifest URI does not match archive')
    manifest_path = Path(receipt['manifest'])
    manifest = json.loads(manifest_path.read_text())
    manifest_readback = manifest_path.with_name('manifest-readback.json')
    if (manifest.get('schema') != 'ggd-intake-backup-manifest@1'
            or not manifest_readback.is_file() or manifest_readback.read_bytes() != manifest_path.read_bytes()):
        raise ValueError('Supplemental manifest readback missing or changed')
    readback = Path(receipt['readback'])
    local_archive = Path(receipt['localArchive'])
    expected = [{key: row[key] for key in ['path', 'bytes', 'sha256']} for row in manifest['files']]
    if (manifest['s3Uri'] != uri or manifest['archiveSha256'] != receipt['archiveSha256']
            or manifest['archiveBytes'] != receipt['archiveBytes']
            or len(expected) != receipt['fileCount'] or readback.stat().st_size != receipt['archiveBytes']
            or local_archive.stat().st_size != receipt['archiveBytes'] or sha(local_archive) != receipt['archiveSha256']
            or sha(readback) != receipt['archiveSha256'] or scoped_members(readback) != expected):
        raise ValueError('Supplemental manifest or saved full readback changed')
    source_root = Path(receipt['source']).resolve()
    if manifest['source'] != str(source_root) or not source_root.is_relative_to(repo.parent):
        raise ValueError('Unexpected supplemental source root')
    # Check only this immutable snapshot's listed members. Later unlisted files
    # remain local and are neither rejected nor claimed to be in this backup.
    for row in expected:
        local = source_root / row['path']
        parts = Path(row['path']).parts
        linked = any((source_root.joinpath(*parts[:end])).is_symlink() for end in range(1, len(parts) + 1))
        if (linked or not local.resolve().is_relative_to(source_root) or not local.is_file()
                or local.stat().st_size != row['bytes'] or sha(local) != row['sha256']):
            raise ValueError('Supplemental snapshot member changed locally: ' + row['path'])
    base = repo / 'materials/hero-model-library'
    paths = [base / 'download-sources.json', base / 'public-source-files.json']
    initial = [path.read_bytes() for path in paths]
    downloads, index = [json.loads(blob) for blob in initial]
    entry = dict(id=args.id, sourceId=args.source_id, resourceRole=args.role,
        localPath=source_root.relative_to(repo.parent).as_posix(), localArchive=receipt['localArchive'],
        readbackPath=str(readback), s3Uri=uri, manifestUri=receipt['manifestUri'],
        bytes=receipt['archiveBytes'], sha256=receipt['archiveSha256'], fileCount=len(expected),
        archiveFormat='tar-gzip', archiveMemberRoot='', files=expected,
        readbackVerified=True, fullReadbackVerified=True, s3ReadbackVerified=True,
        localPreserved=True, acquiredAssetPayloadCount=0,
        snapshotScope='manifest-listed-files-only', unlistedLocalFiles='not-enumerated-or-claimed-backed-up',
        receiptPath=str(args.receipt.resolve()), receiptSha256=sha(args.receipt),
        manifestSha256=sha(manifest_path), s3Use='backup-only-not-runtime-entry')
    same_id = [row for row in index['sources'] if row['id'] == entry['id']]
    if any((row.get('resourceRole'), row.get('sourceId'), row.get('s3Use')) !=
           (entry['resourceRole'], entry['sourceId'], entry['s3Use']) for row in same_id):
        raise ValueError('Supplemental ID would shadow a different original source or backup role')
    prior = [row for row in index['sources'] if (row['id'], row['sha256']) == (entry['id'], entry['sha256'])]
    if prior and prior != [entry]:
        raise ValueError('Different supplemental record already exists')
    if not prior:
        index['sources'].append(entry)
    if 'pendingUploads' in index:
        index['pendingUploads'] = [row for row in index['pendingUploads'] if (row['id'], row['sha256']) != (entry['id'], entry['sha256'])]
    if args.source_id:
        matches = [row for row in downloads.get('publicSources', []) + downloads.get('paidSources', []) if row['id'] == args.source_id]
        if len(matches) != 1:
            raise ValueError('Expected one existing source for supplemental delivery')
        source = matches[0]
        if 'pendingSupplementalDeliveries' in source:
            source['pendingSupplementalDeliveries'] = [row for row in source['pendingSupplementalDeliveries'] if (row['id'], row['sha256']) != (entry['id'], entry['sha256'])]
        link = {key: value for key, value in entry.items() if key != 'files'}
        prior = [row for row in source.setdefault('supplementalDeliveries', [])
                 if (row['id'], row['sha256']) == (entry['id'], entry['sha256'])]
        if prior and prior != [link]:
            raise ValueError('Different source supplemental revision already exists')
        if not prior:
            source['supplementalDeliveries'].append(link)
        by_path = {row['path']: row for row in expected}
        for candidate in source.get('componentCandidates', []):
            local = Path(candidate['absolutePath']).resolve()
            if not local.is_relative_to(source_root):
                continue
            member = local.relative_to(source_root).as_posix()
            row = by_path.get(member)
            if row is None or (row['sha256'], row['bytes']) != (candidate['sha256'], candidate['bytes']):
                raise ValueError('Supplemental archive does not cover component')
            locator = dict(s3Uri=uri, s3ArchiveMember=member, s3Use='backup-only-not-runtime-entry',
                           backupReceiptPath=str(args.receipt.resolve()), backupReceiptSha256=sha(args.receipt))
            locations = candidate.setdefault('backupLocations', [])
            # Preserve a previously recorded scalar locator as an older version.
            if candidate.get('s3Uri'):
                old = {key: candidate[key] for key in locator if key in candidate}
                if not any((row.get('s3Uri'), row.get('s3ArchiveMember')) ==
                           (old['s3Uri'], old.get('s3ArchiveMember')) for row in locations):
                    locations.append(old)
            prior_locations = [row for row in locations
                               if (row['s3Uri'], row.get('s3ArchiveMember')) == (uri, member)]
            if prior_locations and prior_locations != [locator]:
                raise ValueError('Conflicting receipt for existing component backup: ' + candidate['id'])
            if not prior_locations:
                locations.append(locator)
            if not candidate.get('s3Uri'):
                candidate.update(locator)
    if any(path.read_bytes() != before for path, before in zip(paths, initial)):
        raise ValueError('Central sources changed during verification')
    for path, data in zip(paths, [downloads, index]):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(id=args.id, files=len(expected), newAcquisition=False, savedFullReadbackVerified=True)))


if __name__ == '__main__':
    main()
