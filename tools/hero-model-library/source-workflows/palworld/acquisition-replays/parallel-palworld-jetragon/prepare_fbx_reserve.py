"""Create a new reserve GLB; leave source FBX and direct Assimp export untouched.

Fix only invalid affine-row float roundoff and the four non-unit weight rows
already present in the source. No new animations or geometry replacement.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
source = root / 'converted-assimp-v1/body.glb'
out = root / 'converted-reserve-v2'
out.mkdir(exist_ok=False)
b = source.read_bytes()
jlen, jtype = struct.unpack_from('<II', b, 12)
g = json.loads(b[20:20 + jlen])
blen, btype = struct.unpack_from('<II', b, 20 + jlen)
binary = bytearray(b[28 + jlen:28 + jlen + blen])
original = bytes(binary)
assert jtype == 0x4e4f534a and btype == 0x004e4942
def digest(x):
    return hashlib.sha256(x).hexdigest()
def access(i, width):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126 and not a.get('sparse')
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', width * 4)
    return a, start, stride
weight_changes, matrix_changes = [], []
for i in sorted({p['attributes']['WEIGHTS_0'] for m in g['meshes'] for p in m['primitives']}):
    a, start, stride = access(i, 4)
    values = []
    for row in range(a['count']):
        old = struct.unpack_from('<4f', binary, start + row * stride)
        total = sum(old)
        assert total > 0 and all(math.isfinite(v) and v >= 0 for v in old)
        if abs(total - 1) > 1e-6:
            new = tuple(v / total for v in old)
            struct.pack_into('<4f', binary, start + row * stride, *new)
            new = struct.unpack_from('<4f', binary, start + row * stride)
            weight_changes.append({'accessor': i, 'row': row, 'before': old, 'after': new, 'beforeSum': total, 'afterSum': sum(new)})
        values.append(struct.unpack_from('<4f', binary, start + row * stride))
    a['min'] = [min(v[k] for v in values) for k in range(4)]
    a['max'] = [max(v[k] for v in values) for k in range(4)]
for skin in g['skins']:
    i = skin['inverseBindMatrices']
    a, start, stride = access(i, 16)
    values = []
    for row in range(a['count']):
        old = list(struct.unpack_from('<16f', binary, start + row * stride))
        new = old[:]
        for k, exact in [(3, 0), (7, 0), (11, 0), (15, 1)]:
            assert abs(old[k] - exact) < 2e-7, 'Refuse meaningful non-affine matrix changes'
            new[k] = float(exact)
        if old != new:
            matrix_changes.append({'accessor': i, 'row': row, 'beforeAffineRow': [old[k] for k in [3, 7, 11, 15]], 'afterAffineRow': [new[k] for k in [3, 7, 11, 15]], 'maxAbsDelta': max(abs(x-y) for x,y in zip(old,new))})
            struct.pack_into('<16f', binary, start + row * stride, *new)
        values.append(new)
    a['min'] = [min(v[k] for v in values) for k in range(16)]
    a['max'] = [max(v[k] for v in values) for k in range(16)]

used = set()
def collect(x):
    if isinstance(x, dict):
        if isinstance(x.get('extensions'), dict):
            used.update(x['extensions'])
        for v in x.values():
            collect(v)
    elif isinstance(x, list):
        for v in x:
            collect(v)
collect(g)
removed = [x for x in g.get('extensionsUsed', []) if x not in used]
g['extensionsUsed'] = [x for x in g.get('extensionsUsed', []) if x in used]
assert removed == ['KHR_materials_volume', 'FB_ngon_encoding']
assert g['extensionsUsed'] == ['KHR_materials_specular']

textures = []
for im in g.get('images', []):
    assert 'bufferView' in im and 'uri' not in im
    view = g['bufferViews'][im['bufferView']]
    start = view.get('byteOffset', 0)
    before = original[start:start + view['byteLength']]
    after = bytes(binary[start:start + view['byteLength']])
    assert before == after
    textures.append({'name': im.get('name'), 'sha256': digest(after), 'bytes': len(after)})
native = json.loads((root / 'analysis/static-analysis.json').read_text())
assert {t['sha256'] for t in textures} == {t['sha256'] for t in native['textures']}
receipt = {'schema': 'ggd.reserve-glb-numeric-normalization@1', 'sourcePath': str(source), 'sourceSha256': digest(b), 'sourceFbxSha256': native['sourceSha256'], 'weightChanges': weight_changes, 'inverseBindAffineChanges': matrix_changes, 'removedUnusedExtensionDeclarations': removed, 'materialsUnchanged': True, 'texturesUnchanged': textures, 'geometryNodesSkinsAnimationsUnchangedExceptListedChanges': True, 'nativeAnimations': 0, 'proceduralAnimations': 0, 'boneCount': 65, 'ggdReady': False, 'limitations': ['65 source joints retained; no bone compaction or GGD acceptance.', 'No motion authored or retargeted; source contains zero animations.', 'Visual/material runtime acceptance pending. Normalization repairs unit-weight encoding and affine float roundoff; it is a derived candidate, not untouched native bytes.']}
g.setdefault('extras', {})['ggdReserveDerivation'] = {'sourceSha256': digest(b), 'operation': 'four weight rows normalized; 12 inverse-bind homogeneous roundoff values snapped; unused declarations removed', 'nativeAnimationCount': 0, 'proceduralAnimationCount': 0}
j = json.dumps(g, ensure_ascii=False, separators=(',', ':')).encode()
j += b' ' * ((-len(j)) % 4)
data = bytes(binary)
data += b'\0' * ((-len(data)) % 4)
result = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(j) + 8 + len(data)) + struct.pack('<II', len(j), jtype) + j + struct.pack('<II', len(data), btype) + data
(out / 'body.glb').write_bytes(result)
receipt['outputSha256'] = digest(result)
receipt['outputBytes'] = len(result)
(out / 'normalization-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
assert source.read_bytes() == b
print(json.dumps({'weightRows': len(weight_changes), 'matrixAffineRows': len(matrix_changes), 'imagesPreserved': len(textures), 'outputSha256': digest(result)}, ensure_ascii=False))
