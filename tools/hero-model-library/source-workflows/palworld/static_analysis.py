"""Inspect author-shared FBX and copy embedded PNG bytes; no game/code execution.

Uses the already installed Blender Foundation binary FBX parser as a pure-Python
reader, without importing bpy or executing asset scripts. Source remains unchanged.
"""
import argparse
import collections
import hashlib
import importlib
import json
import math
import struct
import sys
import types
import zlib
from pathlib import Path

args_parser=argparse.ArgumentParser(description=__doc__)
args_parser.add_argument('intake',type=Path)
args_parser.add_argument('--fbx-parser-dir',type=Path,required=True,help='Installed Blender io_scene_fbx addon directory; only its pure-Python parser is loaded')
args=args_parser.parse_args()
root = args.intake.resolve()
source = root / 'original/daedream.fbx'
assert source.is_file()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
parser_dir = args.fbx_parser_dir.resolve()
if not (parser_dir/'parse_fbx.py').is_file():raise ValueError('Missing Blender binary FBX parser: '+str(parser_dir))
package = types.ModuleType('_ggd_static_fbx')
package.__path__ = [str(parser_dir)]
sys.modules[package.__name__] = package
parser = importlib.import_module('_ggd_static_fbx.parse_fbx')
tree, version = parser.parse(str(source))
objects = next(e for e in tree.elems if e.id == b'Objects').elems
connections = next(e for e in tree.elems if e.id == b'Connections').elems
obj_by_id = {e.props[0]: e for e in objects}
def name(e):
    return e.props[1].split(b'\0')[0].decode('utf8')
def child(e, key):
    return next((x for x in e.elems if x.id == key.encode()), None)
def value(e, key, default=None):
    c = child(e, key)
    return c.props[0] if c else default
def clean(v):
    if isinstance(v, bytes):
        return v.decode('utf8', errors='replace')
    if hasattr(v, 'tolist'):
        return v.tolist()
    return v
def props(e):
    p = child(e, 'Properties70')
    return {clean(x.props[0]): [clean(v) for v in x.props[4:]] for x in p.elems} if p else {}

children = collections.defaultdict(list)
for c in connections:
    if c.props[0] == b'OO':
        children[c.props[2]].append(c.props[1])
bones = [e for e in objects if e.id == b'Model' and e.props[-1] == b'LimbNode']
bone_ids = {e.props[0] for e in bones}
parents = {c.props[1]: c.props[2] for c in connections if c.props[0] == b'OO' and c.props[1] in bone_ids}
meshes = []
for g in [e for e in objects if e.id == b'Geometry' and e.props[-1] == b'Mesh']:
    xyz = value(g, 'Vertices')
    indices = value(g, 'PolygonVertexIndex')
    assert len(xyz) % 3 == 0 and all(math.isfinite(x) for x in xyz)
    vertices = len(xyz) // 3
    assert all(0 <= (i if i >= 0 else -i - 1) < vertices for i in indices)
    faces, size = [], 0
    for i in indices:
        size += 1
        if i < 0:
            faces.append(size)
            size = 0
    assert size == 0
    layer = child(g, 'LayerElementMaterial')
    material_indices = list(value(layer, 'Materials', [])) if layer else []
    influence = collections.Counter()
    weight_sum = collections.defaultdict(float)
    cluster_rows = []
    for skin_id in children[g.props[0]]:
        skin = obj_by_id.get(skin_id)
        if not skin or skin.id != b'Deformer' or skin.props[-1] != b'Skin':
            continue
        for cluster_id in children[skin_id]:
            cluster = obj_by_id[cluster_id]
            if cluster.id != b'Deformer' or cluster.props[-1] != b'Cluster':
                continue
            ix = value(cluster, 'Indexes', [])
            weights = value(cluster, 'Weights', [])
            assert len(ix) == len(weights)
            assert all(0 <= i < vertices for i in ix)
            assert all(math.isfinite(w) and w >= 0 for w in weights)
            linked = [name(obj_by_id[x]) for x in children[cluster_id] if x in bone_ids]
            for i, w in zip(ix, weights):
                if w > 0:
                    influence[i] += 1
                    weight_sum[i] += w
            transform = list(value(cluster, 'Transform', []))
            transform_link = list(value(cluster, 'TransformLink', []))
            assert len(transform) == len(transform_link) == 16
            assert all(math.isfinite(v) for v in transform + transform_link)
            cluster_rows.append({'id': cluster_id, 'bones': linked, 'weightedVertexCount': sum(w > 0 for w in weights), 'transform': transform, 'transformLink': transform_link})
    meshes.append({'name': name(g), 'vertices': vertices, 'polygons': len(faces), 'triangleCount': sum(n - 2 for n in faces), 'polygonSizes': dict(collections.Counter(faces)), 'materialFaceCounts': dict(collections.Counter(material_indices)), 'uvLayers': sum(e.id == b'LayerElementUV' for e in g.elems), 'skinClusters': cluster_rows, 'weightedVertices': len(influence), 'maxVertexInfluences': max(influence.values(), default=0), 'maxWeightSumError': max((abs(x - 1) for x in weight_sum.values()), default=0)})

def png_crc(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    at, chunks = 8, []
    while at < len(data):
        n = struct.unpack('>I', data[at:at + 4])[0]
        kind = data[at + 4:at + 8]
        payload = data[at + 8:at + 8 + n]
        expected = struct.unpack('>I', data[at + 8 + n:at + 12 + n])[0]
        assert len(payload) == n and zlib.crc32(kind + payload) & 0xffffffff == expected
        chunks.append(kind.decode('ascii'))
        at += n + 12
    assert at == len(data) and chunks[-1] == 'IEND'
    return chunks

textures = []
(root / 'extracted/textures').mkdir(parents=True, exist_ok=True)
for video in [e for e in objects if e.id == b'Video']:
    data = value(video, 'Content')
    if not data:
        continue
    filename = name(video)
    assert Path(filename).name == filename and filename.lower().endswith('.png')
    chunks = png_crc(data)
    out = root / 'extracted/textures' / filename
    assert not out.exists() or out.read_bytes() == data
    out.write_bytes(data)
    width, height = struct.unpack('>II', data[16:24])
    textures.append({'name': filename, 'path': str(out), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'crc32': f'{zlib.crc32(data) & 0xffffffff:08x}', 'pngAllChunkCrcValid': True, 'pngChunks': chunks, 'width': width, 'height': height, 'extraction': 'byte-exact FBX Video/Content, no conversion'})

global_settings = next(e for e in tree.elems if e.id == b'GlobalSettings')
analysis = {
    'schema': 'ggd.static-fbx-source-analysis@1',
    'sourcePath': str(source), 'sourceBytes': source.stat().st_size,
    'sourceSha256': digest, 'sourceCrc32': f'{zlib.crc32(source.read_bytes()) & 0xffffffff:08x}',
    'crcScope': 'FBX CRC32 computed locally only; all 5 embedded PNG stored chunk CRC values independently verified. Upstream FBX is not an archive and has no provided CRC.',
    'fbxVersion': version, 'parser': str(parser_dir / 'parse_fbx.py'),
    'parserSha256': hashlib.sha256((parser_dir / 'parse_fbx.py').read_bytes()).hexdigest(),
    'globalSettings': props(global_settings),
    'geometryCount': len(meshes), 'meshes': meshes,
    'uniqueBoneCount': len(bones),
    'bones': [{'id': e.props[0], 'name': name(e), 'parent': name(obj_by_id[parents[e.props[0]]]) if parents.get(e.props[0]) in obj_by_id else None, 'properties': props(e)} for e in bones],
    'materialCount': sum(e.id == b'Material' for e in objects),
    'materials': [{'name': name(e), 'properties': props(e)} for e in objects if e.id == b'Material'],
    'textures': textures,
    'nativeAnimationCount': sum(e.id == b'AnimationStack' for e in objects),
    'animationCurveCount': sum(e.id == b'AnimationCurve' for e in objects),
    'audioCount': 0, 'standaloneVfxCount': 0,
    'vfxRelatedMaterials': ['MI_Pal_Twinkle_DreamDemon'],
    'vfxEvidence': 'Twinkle material/geometry is present in this body. Author says hair twinkles are inside mesh and animation control is unknown. This is not a complete particle/VFX package.',
    'readiness': 'acquired-rigged-source-pending-standardization',
    'limitations': ['No game installation, DRM/AES handling, executable or asset script execution.', 'No GLB conversion, GGD registration, visual/material/animation runtime acceptance in this source intake.', 'Source author says game models were exported and textures assigned/tweaked in Blender; fidelity to original shader logic is not proved.', 'No animation stacks/curves or audio files in this acquired FBX. Skeleton presence does not mean original game animations were obtained.', 'Assimp reports 220 bone instances across 5 material splits; source has 44 unique bone nodes, not 220 unique bones.'],
}
assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
(root / 'analysis').mkdir(exist_ok=True)
(root / 'analysis/static-analysis.json').write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: analysis[k] for k in ['sourceBytes', 'sourceSha256', 'uniqueBoneCount', 'geometryCount', 'materialCount', 'nativeAnimationCount', 'animationCurveCount']}, ensure_ascii=False))
print('mesh summary', [(m['vertices'], m['triangleCount'], m['weightedVertices'], m['maxVertexInfluences'], m['maxWeightSumError']) for m in meshes])
print('textures', [(t['name'], t['width'], t['height']) for t in textures])
