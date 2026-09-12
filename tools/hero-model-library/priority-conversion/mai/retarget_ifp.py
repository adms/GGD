#!/usr/bin/env python3
"""Create a non-destructive Mai IFP motion-library candidate.

The source is a GTA SA ANP3 community port, not a DOA6 G1A delivery.  This
tool maps only documented biped rotation tracks onto the current Mai GLB and
keeps all source timings and identities in the result.  It deliberately does
not bind gameplay states, claim native motion, write runtime configuration, or
replace the active model.
"""
import copy
import hashlib
import json
import math
import struct
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
INTAKE = WORKSPACE / 'GGD-Asset-Library/intake/public-models-20260911/mai-doa6-gtasa-motion-round23'
SOURCE = INTAKE / 'clip-analysis.json'
TARGET = REPO / 'content/assets/models/community/versions/7627155536b28da0c6486b7f91e76c79ec713bb1cee86a8388a45492a73c562d.glb'
OUT = INTAKE / 'converted/mai-gtasa-anp3-retargeted-core-rotations.glb'
REPORT = INTAKE / 'converted/mai-gtasa-anp3-retargeted-core-rotations.json'
HELPER = REPO / 'tools/hero-model-library/source-workflows/model-batch-20260910-round18/lina-retarget/scripts'
sys.path.insert(0, str(HELPER))
import glb_io as glb  # noqa: E402


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for block in iter(lambda: fh.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def normal_name(name):
    name = name.strip()
    if name == 'Normal':
        return 'Bip001'
    if name == 'Pelvis':
        return 'Bip001 Pelvis'
    if name == 'Spine 1':
        return 'Bip001 Spine'
    if name == 'Spine 2':
        return 'Bip001 Spine1'
    if name in {'Neck', 'Head'}:
        return 'Bip001 ' + name
    if name.startswith('Bip01 '):
        return 'Bip001 ' + name[6:]
    if name.startswith(('L ', 'R ')):
        return 'Bip001 ' + name
    return None


def target_nodes(doc):
    result = {node.get('name'): i for i, node in enumerate(doc['nodes']) if node.get('name')}
    required = {'Bip001', 'Bip001 Pelvis', 'Bip001 Spine', 'Bip001 Spine1',
                'Bip001 Neck', 'Bip001 Head', 'Bip001 L UpperArm',
                'Bip001 R UpperArm', 'Bip001 L Thigh', 'Bip001 R Thigh'}
    missing = required - result.keys()
    if missing:
        raise ValueError('Target GLB is missing expected biped nodes: ' + ', '.join(sorted(missing)))
    return result


def add_payload(doc, binary, payload, component_type, kind, bounds=False):
    binary += b'\0' * ((-len(binary)) % 4)
    offset = len(binary)
    binary += payload
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)})
    view = len(doc['bufferViews']) - 1
    components = glb.NUM_COMPONENTS[kind]
    fmt = glb.COMPONENT_FMT[component_type]
    values = struct.unpack('<' + fmt * (len(payload) // glb.COMPONENT_SIZE[component_type]), payload)
    accessor = {'bufferView': view, 'componentType': component_type,
                'count': len(values) // components, 'type': kind}
    if bounds and values:
        accessor['min'] = [min(values[i::components]) for i in range(components)]
        accessor['max'] = [max(values[i::components]) for i in range(components)]
    doc['accessors'].append(accessor)
    return binary, len(doc['accessors']) - 1


def parse_track(source_path, track):
    raw = source_path.read_bytes()
    start = track['keyframeOffset']
    count = track['keyframeCount']
    typ = track['keyFrameType']
    width = 16 if typ == 4 else 10
    frames = [struct.unpack_from('<' + 'h' * (width // 2), raw, start + n * width)
              for n in range(count)]
    times = [frame[4] / 60 for frame in frames]
    if any(b < a for a, b in zip(times, times[1:])):
        raise ValueError('Non-monotonic source timing: ' + str(source_path))
    values = []
    for frame in frames:
        quaternion = [value / 4096 for value in frame[:4]]
        length = math.sqrt(sum(value * value for value in quaternion))
        if not math.isfinite(length) or length < 0.9 or length > 1.1:
            raise ValueError('Invalid ANP3 quaternion: ' + str(source_path))
        values.extend(value / length for value in quaternion)
    return times, values


def main():
    source = json.loads(SOURCE.read_text())
    model = glb.read(str(TARGET))
    doc = copy.deepcopy(model.gltf)
    binary = bytes(model.bin)
    if len(doc.get('buffers', [])) != 1:
        raise ValueError('Expected one target GLB buffer')
    nodes = target_nodes(doc)
    clips = source['clips']
    if len(clips) != 162 or not source.get('allFilesConsumedExactly'):
        raise ValueError('Expected the frozen 162-clip fully consumed source analysis')
    original_animation_count = len(doc.get('animations', []))
    produced = []
    dropped = {}
    for clip in clips:
        source_path = INTAKE / clip['path']
        if digest(source_path) != clip['sha256']:
            raise ValueError('Source file changed: ' + clip['path'])
        channels = []
        samplers = []
        mapped_names = []
        for track in clip['tracks']:
            target_name = normal_name(track['boneName'])
            if target_name is None or target_name not in nodes:
                dropped[track['boneName']] = dropped.get(track['boneName'], 0) + 1
                continue
            times, rotations = parse_track(source_path, track)
            if len(times) < 2:
                continue
            binary, times_accessor = add_payload(
                doc, binary, struct.pack('<' + 'f' * len(times), *times), 5126, 'SCALAR', bounds=True)
            binary, rotations_accessor = add_payload(
                doc, binary, struct.pack('<' + 'f' * len(rotations), *rotations), 5126, 'VEC4')
            sampler = len(samplers)
            samplers.append({'input': times_accessor, 'output': rotations_accessor, 'interpolation': 'LINEAR'})
            channels.append({'sampler': sampler, 'target': {'node': nodes[target_name], 'path': 'rotation'}})
            mapped_names.append(target_name)
        if not channels:
            raise ValueError('No target channels for ' + clip['path'])
        name = 'retargeted_ANP3_' + clip['nativeClipName'] + '_' + clip['sha256'][:12]
        doc.setdefault('animations', []).append({
            'name': name, 'samplers': samplers, 'channels': channels,
            'extras': {
                'provenance': 'GTA SA ANP3 community-port rotation retarget; not native DOA6 animation',
                'sourceId': source['sourceId'], 'sourcePath': clip['path'], 'sourceSha256': clip['sha256'],
                'sourceVariant': clip['sourceVariant'], 'sourceDurationSecondsAt60TicksPerSecond': clip['durationSecondsAt60TicksPerSecond'],
                'retargeted': True, 'native': False, 'translationTracksDropped': True,
                'unmappedTracksDropped': True, 'stateBinding': 'none',
            }})
        produced.append({'name': name, 'sourcePath': clip['path'], 'sourceSha256': clip['sha256'],
                         'sourceVariant': clip['sourceVariant'], 'durationSeconds': clip['durationSecondsAt60TicksPerSecond'],
                         'mappedTargetNodes': mapped_names, 'channels': len(channels)})
    doc['buffers'][0]['byteLength'] = len(binary) + ((-len(binary)) % 4)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    glb.write(str(OUT), doc, binary)
    output = glb.read(str(OUT))
    if len(output.gltf['animations']) != original_animation_count + len(clips):
        raise ValueError('Output animation count differs from source clips')
    target_joint_nodes = {node for skin in output.gltf.get('skins', []) for node in skin['joints']}
    for animation in output.gltf['animations'][original_animation_count:]:
        if not animation['channels'] or any(channel['target']['node'] not in target_joint_nodes for channel in animation['channels']):
            raise ValueError('Output references non-skin animation target')
    report = {
        'schema': 'ggd.mai-anp3-core-rotation-retarget@1',
        'source': {'clipAnalysis': str(SOURCE.resolve()), 'clipAnalysisSha256': digest(SOURCE),
                   'clipCount': len(clips), 'ifpFormat': 'GTA SA ANP3 IFP',
                   'sourceGameClaim': 'Dead or Alive 6 author-described animation origin'},
        'target': {'path': str(TARGET.resolve()), 'sha256': digest(TARGET),
                   'activeModelUnchanged': True, 'skinJointCount': len(target_joint_nodes)},
        'output': {'path': str(OUT.resolve()), 'sha256': digest(OUT), 'bytes': OUT.stat().st_size,
                   'animationCount': len(produced), 'runtimeReady': False, 'backendSelectableVerified': False},
        'animationProvenance': {'kind': 'community-port retarget', 'native': False, 'retargeted': True,
                                'sourceNativeAnimationCount': 0, 'sourcePortClipCount': 146,
                                'customVariantClipCount': 16},
        'mapping': {'normalization': 'GTA Bip01/Bip001 core biped names to target Bip001 hierarchy',
                    'mappedTracks': sum(item['channels'] for item in produced),
                    'droppedSourceTracks': dropped,
                    'translationTracksDropped': True,
                    'faceAndFingerLimitation': 'Missing/ambiguous face and reduced hand tracks remain in target rest pose.'},
        'clips': produced,
        'validation': {'sourceShaVerified': True, 'all162Produced': len(produced) == 162,
                       'allChannelsTargetSkinJoints': True, 'structuralReadback': True},
        'limitations': [
            'Source is a GTA SA community port; no original DOA6 G1A container or source skeleton was supplied.',
            'Numeric source names are not mapped to idle, run, attack, hurt, death, cast, or any gameplay event.',
            'Root/translation tracks are intentionally dropped because source and target coordinate/unit semantics are unverified.',
            'Visual playback, feet, collision, performance, runtime acceptance and backend registration remain required.',
        ],
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(OUT), 'sha256': report['output']['sha256'],
                      'clips': len(produced), 'mappedTracks': report['mapping']['mappedTracks'],
                      'droppedTracks': dropped}, ensure_ascii=False))


if __name__ == '__main__':
    main()
