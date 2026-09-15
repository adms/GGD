#!/usr/bin/env python3
"""Retain every finished resource from a verified local release in Git; no S3 calls."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'materials/asset-library'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inside(root, relative):
    path = root / relative
    if Path(relative).is_absolute() or '..' in Path(relative).parts or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Escaping release path: ' + relative)
    if path.is_symlink():
        raise ValueError('Symlink in release: ' + relative)
    return path


def verify(root, records):
    paths = [r['path'] for r in records]
    if len(paths) != len(set(paths)):
        raise ValueError('Duplicate release path')
    for record in records:
        path = inside(root, record['path'])
        if not path.is_file() or path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
            raise ValueError('Missing or changed release file: ' + record['path'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    pointer = ROOT / 'git-release.json'
    if args.check:
        receipt = json.loads(pointer.read_text())
        verify(inside(REPO, receipt['gitRoot']), receipt['files'])
    else:
        if args.library is None:
            parser.error('--library is required to copy an existing local release')
        release = json.loads((REPO / 'materials/hero-model-library/release.json').read_text())
        proof = json.loads((REPO / 'materials/hero-model-library/s3-publication-receipt.json').read_text())
        if proof['release'] != release['release'] or proof['status'] != 'published_and_read_back_verified':
            raise ValueError('Expected an already verified finished release')
        source = args.library.resolve() / 'shared/releases' / release['release']
        source_manifest = source / 'release-manifest.json'
        manifest = json.loads(source_manifest.read_text())
        if manifest['release'] != release['release']:
            raise ValueError('Release identity mismatch')
        archive = source / 'GGD-Asset-Library.zip'
        if proof['archive_sha256'] != release['archive_sha256'] or digest(archive) != release['archive_sha256']:
            raise ValueError('Source archive differs from the Git-pinned publication receipt')
        # Preserve finished payloads, dependencies and their validation receipts.
        # Historical tool/document copies are not current control-policy sources.
        metadata = {'catalog.json', 'resources.json', 'hero-model-options.json', 'spider-identity.json'}
        records = [r for r in manifest['files'] if r['path'].startswith('ready/') or r['path'] in metadata]
        verify(source, records)
        with zipfile.ZipFile(archive) as zipped:
            for record in records:
                data = zipped.read('GGD-Asset-Library/' + record['path'])
                if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
                    raise ValueError('Local source differs from verified archive: ' + record['path'])
        destination = ROOT / 'releases' / release['release']
        for record in records:
            target = inside(destination, record['path'])
            if target.exists():
                verify(destination, [record])
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation protects independent work and retained revisions.
            with target.open('xb') as stream:
                stream.write(inside(source, record['path']).read_bytes())
        verify(destination, records)
        receipt = {
            'schema': 'ggd-git-finished-resource-release@1',
            'release': release['release'], 'gitRoot': destination.relative_to(REPO).as_posix(),
            'sourceS3Release': release['release_uri'],
            'sourceManifestSha256': digest(source_manifest),
            'sourceArchiveSha256': release['archive_sha256'],
            'entryCount': manifest['entry_count'], 'resourceCount': manifest['resource_count'],
            'fileCount': len(records), 'totalBytes': sum(r['bytes'] for r in records),
            'files': records,
            'allFinishedPayloadsRetained': True, 'localOriginalsRetained': True,
            'runtimeSelectionPolicy': 'materials/hero-model-library/default-policy.json',
            'snapshotSelectionMetadata': 'historical; current Git selection policy takes precedence',
            'scope': 'Finished reusable components, dependencies and validation receipts; not a complete-hero or deployment assertion.'
        }
        pointer.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: receipt[k] for k in ['release', 'fileCount', 'totalBytes', 'resourceCount']}))


if __name__ == '__main__':
    main()
