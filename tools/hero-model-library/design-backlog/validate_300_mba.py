"""Read-only local-file validation enrichment for ggd-audit-undesigned-300-mba.py.

Only writes the specified audit JSON. Run after the Node ability scan and Python
audit. SHA checks cover declared converted files; raw multi-GB bodies are stat-only.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--audit', default='/private/tmp/ggd-undesigned-300-mba.json')
ap.add_argument('--abilities', default='/private/tmp/ggd-undesigned-hero-ability-checks.json')
a = ap.parse_args()
p = Path(a.audit)
d = json.loads(p.read_text())
cs = d['characters']
assert len(cs) == len({x['id'] for x in cs})
ids = [s for c in cs for s in c['sourceIds']]
assert len(ids) == len(set(ids))
errors, glbs, hashes = [], [], []
body_roles = {'official-base-body', 'official-base-body-alternate-native-extension', 'character-definition-body'}
for c in cs:
    assert c['name'] and c['work'] and c['sourceIds'] and c['modelCandidates']
    assert c['designStatus'] in {'not-defined', 'definitions-incomplete', 'identity-review', 'designed'}
    assert any(m['resourceRole'] in body_roles for m in c['modelCandidates'])
    if c['designStatus'] == 'not-defined':
        assert not c['identityHeroIds'] and not c['possibleIdentityHeroIds']
    for m in c['modelCandidates']:
        f = Path(m['path'])
        if not (f.is_file() and f.stat().st_size == m['bytes'] and m['bytes'] > 0):
            errors.append({'path': str(f), 'error': 'missing or stat changed'})
            continue
        if m.get('sha256'):
            h = hashlib.sha256(f.read_bytes()).hexdigest()
            hashes.append({'path': str(f), 'matches': h == m['sha256']})
            if h != m['sha256']:
                errors.append({'path': str(f), 'error': 'converted declared SHA mismatch'})
            else:
                m['sha256Evidence'] = 'independently rehashed by audit; matches sourceIndex declaration'
        if f.suffix.lower() == '.glb':
            with f.open('rb') as fh:
                magic, version, size = struct.unpack('<4sII', fh.read(12))
                n, typ = struct.unpack('<II', fh.read(8))
                assert typ == 0x4e4f534a
                g = json.loads(fh.read(n))
            stats = {
                'headerValid': magic == b'glTF' and version == 2 and size == m['bytes'],
                'meshes': len(g.get('meshes', [])),
                'primitives': sum(len(x.get('primitives', [])) for x in g.get('meshes', [])),
                'skins': len(g.get('skins', [])),
                'joints': sum(len(x.get('joints', [])) for x in g.get('skins', [])),
                'animations': len(g.get('animations', [])),
                'materials': len(g.get('materials', [])),
                'images': len(g.get('images', [])),
            }
            glbs.append({'path': str(f), **stats})
            m['containerStats'] = stats
            if not stats['headerValid'] or not stats['meshes']:
                errors.append({'path': str(f), 'error': 'invalid/no mesh GLB'})
assert not errors, errors
checks = json.loads(Path(a.abilities).read_text())
paths = set()
for hero in checks['heroes']:
    paths.add(hero['path'])
    paths.update(x['path'] for x in hero['abilityChecks'] if x['exists'])
d['definitionFingerprints'] = [
    {'path': q, 'sha256': hashlib.sha256(Path(q).read_bytes()).hexdigest(), 'bytes': Path(q).stat().st_size}
    for q in sorted(paths)
]
d['validation'] = {
    'modelCandidatesStatChecked': sum(len(c['modelCandidates']) for c in cs),
    'glbContainersChecked': len(glbs),
    'convertedDeclaredShaChecked': len(hashes),
    'convertedDeclaredShaMismatches': 0,
    'sourceIdsUnique': True,
    'allCharacterGroupsHaveSourceDefinedNativeBody': True,
    'errors': errors,
}
d['limitations'] = [
    s.replace(
        'SHA on converted candidates is retained source-manifest evidence, not a new full native-byte hash pass. Every listed file was checked with live stat.',
        f'{len(hashes)} declared converted candidate SHA values were independently checked; native files were not rehashed in full. Every listed file was checked with live stat.'
    ) for s in d['limitations']
]
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(d['validation'], ensure_ascii=False))
print(hashlib.sha256(p.read_bytes()).hexdigest(), str(p))
