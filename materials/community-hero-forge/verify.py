#!/usr/bin/env python3
"""Verify all restored material bytes and the 37 delivered hero packages offline."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--restored-root', type=Path, required=True)
    args = ap.parse_args()
    root = args.restored_root
    here = Path(__file__).resolve().parent
    manifest = json.loads((here / 'manifest.json').read_text())
    for row in manifest['files']:
        path = root / row['path']
        if path.is_symlink() or path.stat().st_size != row['bytes'] or sha(path.read_bytes()) != row['sha256']:
            raise ValueError('Restored material mismatch: ' + row['path'])
    base = root / 'outputs/community-hero-asset-integration/editor-publication-20260907'
    audit = json.loads((base / 'delivery-review/current-package-audit.json').read_text())
    publications = json.loads((base / 'delivery-review/current-publication-audit.json').read_text())
    rows, assets, slots = [], {}, 0
    for record in audit['rows']:
        number = f"{record['number']:02}"
        folder = base / 'generator-rebuild' / number
        packages = list((folder / 'package').glob('*.zip'))
        assert len(packages) == 1, number
        archive_path = packages[0]
        assert sha(archive_path.read_bytes()) == record['archiveSha256'], number
        recipe = json.loads((root / 'GGD社群英雄上傳內容_37名/recipes' / (number + '.upload-recipe.json')).read_text())
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
            assert len(names) == len(set(names)), number
            package = json.loads(archive.read('manifest.json'))
            assert package['packageDigest'] == record['packageDigest'], number
            transport = {entry['path']: entry for entry in package['transport']['entries']}
            assert set(transport) == {entry['path'] for entry in package['entries']}
            model_paths = []
            for entry in package['entries']:
                data = archive.read(entry['path'])
                # JSON contentSize/contentSha256 describe JCS canonical content, not pretty ZIP bytes.
                raw = transport[entry['path']]
                assert len(data) == raw['rawSize'], entry['path']
                assert 'sha256:' + sha(data) == raw['rawSha256'], entry['path']
                if entry['role'] == 'asset':
                    assert len(data) == entry['contentSize']
                    assert 'sha256:' + sha(data) == entry['contentSha256']
                    assets[sha(data)] = {'bytes': len(data), 'path': entry['path']}
                    if entry['path'].endswith('.glb'):
                        assert data[:4] == b'glTF'
                        model_paths.append(entry['path'])
            assert model_paths, number
            project_path = next(n for n in names if n.startswith('authoring/hero-projects/'))
            project = json.loads(archive.read(project_path))
            design = project['sourceDesign']
            assert design['name'] == recipe['displayName'] == record['name']
            assert design['ownerText'] == recipe['sourceOwnerText']
            assert design['reviewText'] == recipe['reviewText']
            assert set(design['slots']) == {'PASSIVE', 'Q', 'W', 'E', 'R', 'EX'}
            for slot in recipe['slots']:
                for key in ['name', 'ownerDescription', 'requiredRefinement', 'refinementContracts']:
                    assert design['slots'][slot['slot']][key] == slot[key], (number, slot['slot'], key)
                slots += 1
            drafts = list((folder / 'after').glob('*-draft.json'))
            assert len(drafts) == 1
            draft = json.loads(drafts[0].read_text())
            assert draft['payload']['project']['sourceDesign'] == design
            pub = next(r for r in publications['rows'] if r['number'] == record['number'])
            assert pub['packageDigest'] == record['packageDigest']
            assert pub['currentSubmissionId'] == record['submissionId']
            rows.append({'number': record['number'], 'name': record['name'],
                         'package': str(archive_path.relative_to(root)), 'archiveSha256': record['archiveSha256'],
                         'draft': str(drafts[0].relative_to(root)), 'packageDigest': record['packageDigest'],
                         'modelPaths': model_paths, 'originalTextAndRefinementsExact': True})
    assert len(rows) == 37 and slots == 222
    print(json.dumps({'schema': 'ggd-community-materials-verification@1', 'status': 'verified',
                      'scope': 'Offline restored bytes and prior isolated publication receipts; not new gameplay or production publication',
                      'filesVerified': len(manifest['files']), 'heroCount': len(rows), 'slotCount': slots,
                      'uniqueAssets': len(assets), 'assetBytes': sum(r['bytes'] for r in assets.values()),
                      'redactedFiles': manifest['summary']['redactedFiles'], 'rows': rows}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
