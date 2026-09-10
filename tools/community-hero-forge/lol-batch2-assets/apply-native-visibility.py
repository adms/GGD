#!/usr/bin/env python3
"""Apply only skin0 initialSubmeshToHide; preserve complete converted GLBs."""
import argparse, copy, hashlib, json, struct
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('base', type=Path)
a = p.parse_args()
base = a.base.resolve()
recipes = json.loads((base / 'conversion-recipes.json').read_text())
out = base / 'native-visible'
out.mkdir(exist_ok=False)
rows = []
def sha(b): return hashlib.sha256(b).hexdigest()
for recipe in recipes['characters']:
    slug = recipe['nativeId'].lower()
    config_path = base / 'skin-config' / slug / 'skin0.json'
    config = json.loads(config_path.read_text())
    skin = [v for v in config.values() if isinstance(v, dict) and 'skinMeshProperties' in v]
    assert len(skin) == 1
    hidden = skin[0]['skinMeshProperties'].get('initialSubmeshToHide', '').split()
    assert hidden == recipe['initialSubmeshToHide']
    source = base / 'converted' / f'{slug}.glb'
    raw = source.read_bytes()
    assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw))
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    original = json.loads(raw[20:20+size])
    document = copy.deepcopy(original)
    tail = raw[20+size:]
    removed = []
    for mesh_index, mesh in enumerate(document['meshes']):
        kept = []
        for primitive_index, primitive in enumerate(mesh['primitives']):
            name = document['materials'][primitive['material']]['name']
            if name in hidden:
                removed.append({'mesh': mesh_index, 'primitive': primitive_index, 'submesh': name})
            else:
                kept.append(primitive)
        assert kept, 'Native hidden list removed an entire mesh'
        mesh['primitives'] = kept
    check = copy.deepcopy(document)
    for i in range(len(check['meshes'])):
        check['meshes'][i]['primitives'] = original['meshes'][i]['primitives']
    assert check == original, 'Unexpected non-primitive change'
    if removed:
        encoded = json.dumps(document, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        result = struct.pack('<IIIII', 0x46546c67, 2, 20+len(encoded)+len(tail), len(encoded), 0x4e4f534a) + encoded + tail
        assert result[20+len(encoded):] == tail, 'Binary source changed'
    else:
        result = raw
    output = out / f'{slug}.glb'
    output.write_bytes(result)
    rows.append({'nativeId': recipe['nativeId'], 'source': str(source), 'sourceSha256': sha(raw), 'output': str(output), 'outputSha256': sha(result), 'sourceSkinBin': str(config_path.with_suffix('.bin')), 'sourceSkinBinSha256': sha(config_path.with_suffix('.bin').read_bytes()), 'sourceSkinJsonSha256': sha(config_path.read_bytes()), 'initialSubmeshToHide': hidden, 'removedPrimitives': removed, 'hiddenNamesAbsentFromSkn': [n for n in hidden if n not in [r['submesh'] for r in removed]], 'binaryChunkUnchanged': True, 'otherJsonUnchanged': True})
    print(f'{slug}: removed {len(removed)} native-hidden primitives')
(base / 'native-visibility-receipt.json').write_text(json.dumps({'schema': 'ggd-lol-native-visibility@1', 'policy': 'Only native skin0 initialSubmeshToHide; original complete converted candidates retained', 'models': rows}, indent=2)+'\n')
