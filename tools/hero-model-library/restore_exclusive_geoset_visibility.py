#!/usr/bin/env python3
"""Restore verified binary GEOA visibility using an exclusively weighted leaf joint.

This narrow conversion retains every original primitive, texture and motion channel.
It refuses shared joints, animated joints, fractional alpha and global sequences.
The native provenance report and its original archive must match their SHA-256.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(data):
    magic, version, length = struct.unpack_from('<4sII', data)
    assert (magic, version, length) == (b'glTF', 2, len(data))
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(data[20:20 + size])
    offset = 20 + size
    size, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004e4942 and offset + 8 + size == len(data)
    return gltf, bytearray(data[offset + 8:])


def accessor(gltf, binary, index):
    acc = gltf['accessors'][index]
    assert 'sparse' not in acc and not acc.get('normalized', False)
    view = gltf['bufferViews'][acc['bufferView']]
    assert view.get('buffer', 0) == 0
    fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[acc['componentType']]
    count = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    stride = view.get('byteStride', struct.calcsize(fmt) * count)
    offset = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * count, binary, offset + i * stride)
            for i in range(acc['count'])]


def append_accessor(gltf, binary, values, kind):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    flat = [v for row in values for v in row]
    binary.extend(struct.pack('<' + 'f' * len(flat), *flat))
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset,
                               'byteLength': len(binary) - offset})
    result = len(gltf['accessors'])
    acc = {'bufferView': view, 'componentType': 5126, 'count': len(values), 'type': kind}
    if kind == 'SCALAR':
        acc.update(min=[min(flat)], max=[max(flat)])
    gltf['accessors'].append(acc)
    return result


def transform(gltf, binary, proof):
    original = copy.deepcopy(gltf)
    match = proof['mdxGeosetMatch']
    assert match['sameTriangleVertexTriples'] and match['affinePositionMaxError'] < 1e-5
    tracks = match['nativeGeosetAnimation']
    assert len(tracks) == 1
    track = tracks[0]['tracks']['KGAO']
    assert track['interp'] == 0 and track['gseq'] == -1
    keys = track['keys']
    assert keys and all(value in (0, 1) for _, value in keys)
    assert all(a[0] < b[0] for a, b in zip(keys, keys[1:]))
    assert len(gltf['meshes']) == len(gltf['skins']) == 1
    primitive = proof['suspectPrimitive']
    prims = gltf['meshes'][0]['primitives']
    influences = []
    for prim in prims:
        attrs = prim['attributes']
        assert 'JOINTS_1' not in attrs and 'WEIGHTS_1' not in attrs
        joints = accessor(gltf, binary, attrs['JOINTS_0'])
        weights = accessor(gltf, binary, attrs['WEIGHTS_0'])
        assert len(joints) == len(weights)
        assert all(abs(sum(ws) - 1) < 1e-6 for ws in weights)
        influences.append({j for js, ws in zip(joints, weights)
                           for j, w in zip(js, ws) if w > 0})
    assert len(influences[primitive]) == 1
    joint_index = next(iter(influences[primitive]))
    assert all(joint_index not in used for i, used in enumerate(influences) if i != primitive)
    node_index = gltf['skins'][0]['joints'][joint_index]
    node = gltf['nodes'][node_index]
    assert not node.get('children') and 'matrix' not in node
    assert node.get('scale', [1, 1, 1]) == [1, 1, 1]
    native_bones = match['nativeGroupBones']
    assert len(native_bones) == 1 and native_bones[0]['name'] == node['name']
    assert all(not native_bones[0][key] for key in ['translation', 'rotation', 'scaling'])
    assert all(c['target']['node'] != node_index for a in gltf['animations'] for c in a['channels'])
    sequences = {seq['name']: seq for seq in match['sequenceVisibility']}
    assert len(sequences) == len(gltf['animations'])
    clips = []
    for animation in gltf['animations']:
        seq = sequences[animation['name']]
        start, end = seq['start'], seq['end']
        duration = (end - start) / 1000
        actual = max(row[0] for sampler in animation['samplers']
                     for row in accessor(gltf, binary, sampler['input']))
        assert math.isclose(actual, duration, abs_tol=1e-5)
        initial = [value for time, value in keys if time <= start]
        assert initial, 'Sequence has no verified initial alpha'
        timeline = [(0.0, initial[-1])]
        timeline.extend(((time - start) / 1000, value) for time, value in keys if start < time < end)
        timeline.append((duration, timeline[-1][1]))
        times = append_accessor(gltf, binary, [(time,) for time, _ in timeline], 'SCALAR')
        scales = append_accessor(gltf, binary, [(value,) * 3 for _, value in timeline], 'VEC3')
        sampler = len(animation['samplers'])
        animation['samplers'].append({'input': times, 'output': scales, 'interpolation': 'STEP'})
        animation['channels'].append({'sampler': sampler, 'target': {'node': node_index, 'path': 'scale'}})
        clips.append({'name': animation['name'], 'seconds': duration, 'scaleKeys': timeline})
    # Before an animation starts, the source Stand pose must also hide this geoset.
    assert next(c for c in clips if c['name'] == 'Stand')['scaleKeys'][0][1] == 0
    node['scale'] = [0, 0, 0]
    gltf['buffers'][0]['byteLength'] = len(binary)
    for key in ['meshes', 'skins', 'materials', 'textures', 'images']:
        assert gltf.get(key) == original.get(key)
    for old, new in zip(original['animations'], gltf['animations']):
        assert old['channels'] == new['channels'][:-1]
        assert old['samplers'] == new['samplers'][:-1]
    return clips, node_index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--glb', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--proof-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    proof_bytes = args.proof.read_bytes()
    assert sha(proof_bytes) == args.proof_sha256
    proof = json.loads(proof_bytes)
    original = args.glb.read_bytes()
    assert sha(original) == proof['glbSha256']
    archive = Path(proof['nativeArchive'])
    assert sha(archive.read_bytes()) == proof['nativeArchiveSha256']
    with zipfile.ZipFile(archive) as opened:
        assert sha(opened.read(proof['nativeMember'])) == proof['nativeMdxSha256']
    gltf, binary = read_glb(original)
    old_binary = bytes(binary)
    clips, node_index = transform(gltf, binary, proof)
    assert binary[:len(old_binary)] == old_binary
    encoded = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    payload = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) +
               struct.pack('<II', len(encoded), 0x4e4f534a) + encoded +
               struct.pack('<II', len(binary), 0x004e4942) + binary)
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'body.glb').write_bytes(payload)
    receipt = dict(schema='ggd-native-geoset-visibility-conversion@1', sourceGlbSha256=sha(original),
                   outputSha256=sha(payload), bytes=len(payload), proofSha256=sha(proof_bytes),
                   node=node_index, primitive=proof['suspectPrimitive'], nativeAnimationCount=len(clips),
                   originalBinaryPrefixUnchanged=True, allOriginalMotionChannelsUnchanged=True,
                   allOriginalGeometryMaterialsTexturesAndSkinUnchanged=True, clips=clips,
                   method='STEP scale of an exclusive fully weighted leaf joint; binary alpha only',
                   limitation='Animation blending can transiently scale this geoset; sampled direct playback requires renderer validation.')
    (args.output / 'conversion.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: receipt[key] for key in ['outputSha256', 'bytes', 'nativeAnimationCount']}))


if __name__ == '__main__':
    main()
