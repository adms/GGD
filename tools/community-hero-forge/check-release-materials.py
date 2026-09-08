#!/usr/bin/env python3
"""Check committed release indexes and recorded S3 receipts; no network or writes."""
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / 'materials/community-hero-forge/supplements'
BUCKET = 'ggd-390630837668-ap-east-2-an'


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def archive(name, receipt_count_field):
    root = BASE / name
    manifest = read(root / 'manifest.json')
    location = read(root / 's3-location.json')
    uploaded = read(root / 's3-upload-receipt.json')
    restored = read(root / 's3-restore-receipt.json')
    fingerprint = digest(root / 'manifest.json')
    assert manifest['schema'] == 'ggd-community-materials-archive@1'
    assert location['manifestSha256'] == uploaded['manifestSha256'] == restored['manifestSha256'] == fingerprint
    assert location['bucket'] == uploaded['bucket'] == BUCKET
    assert location['profile'] == uploaded['profile'] == 'vibe-coding'
    assert location['region'] == uploaded['region'] == 'ap-east-2'
    assert location['prefix'] == uploaded['prefix'] == f'community-hero-forge/{fingerprint}/'
    files = {}
    for row in manifest['files']:
        path = PurePosixPath(row['path'])
        assert not path.is_absolute() and '..' not in path.parts and str(path) not in files
        assert len(bytes.fromhex(row['sha256'])) == 32 and row['bytes'] >= 0
        files[str(path)] = row
    assert restored['status'] == 'passed' and restored[receipt_count_field] == len(files)
    assert len(uploaded['objects']) == len(manifest['parts']) + 1
    objects = {row['path']: row for row in uploaded['objects']}
    expected = [*manifest['parts'], {'path': 'manifest.json', 'sha256': fingerprint, 'bytes': (root / 'manifest.json').stat().st_size}]
    for row in expected:
        actual = objects[row['path']]
        assert actual['sha256'] == row['sha256'] and actual['bytes'] == row['bytes']
        assert actual['key'] == location['prefix'] + row['path']
        assert base64.b64decode(actual['checksumSHA256']).hex() == row['sha256']
    return files


def main():
    payload = archive('release-13956d93b', 's3FilesVerified')
    evidence = archive('release-evidence-c2487661f', 'restoredFiles')
    index = read(BASE / 'release-13956d93b/version-index.json')
    assert index['status'] == 'isolated-accepted-not-production'
    assert len(index['heroes']) == index['heroCount'] == 37 and index['slotCount'] == 222
    assert index['payloadManifestSha256'] == digest(BASE / 'release-13956d93b/manifest.json')
    assert index['evidenceManifestSha256'] == digest(BASE / 'release-evidence-c2487661f/manifest.json')
    assert len({row['projectId'] for row in index['heroes']}) == 37
    for row in index['heroes']:
        recipe = REPO / row['designRecipe']
        document = read(recipe)
        assert digest(recipe) == row['designRecipeSha256']
        assert document['displayName'] == row['name'] and len(document['slots']) == 6
        assert payload[row['zipMember']]['sha256'] == row['archiveSha256'].removeprefix('sha256:')
        assert row['projectEvidenceMember'] in evidence
    print(json.dumps({'status': 'passed', 'heroes': 37, 'slots': 222, 'payloadFiles': len(payload), 'evidenceFiles': len(evidence), 'scope': 'Offline index and recorded-receipt consistency only; no fresh S3 or gameplay claim'}))


if __name__ == '__main__':
    main()
