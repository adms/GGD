#!/usr/bin/env python3
"""Preserve native GTA DFF/TXD data using the pinned standalone DragonFF parser.

Large parsed JSON and texture PNGs are intake/S3 artifacts, never Git or a
runtime release. This does not create animations or certify model readiness.
"""
import argparse
import base64
from enum import Enum
import hashlib
import json
from pathlib import Path
import re
import subprocess
import struct
import sys

PARSER_REPOSITORY = 'https://github.com/Parik27/DragonFF'
PARSER_COMMIT = '5a7c2f18d6ff9ac4e3424d552cfe404c931d039d'


def remove_empty_frame_padding(data):
    """Remove only zero-length null chunks after the declared frame extensions.

    Some old GTA exports append a null chunk inside FrameList. DragonFF treats
    that padding as an extra frame. Actual frame/geometry bytes stay unchanged.
    """
    repairs = []
    def chunks(blob, start, end):
        while start < end:
            if end - start < 12:
                if any(blob[start:end]): raise ValueError('Truncated RenderWare chunk header')
                yield start, None, None, blob[start:end]
                break
            kind, size, version = struct.unpack_from('<III', blob, start)
            stop = start + 12 + size
            if stop > end: raise ValueError('RenderWare chunk exceeds container')
            yield start, kind, version, blob[start + 12:stop]
            start = stop
    def frame_list(payload, absolute, version):
        if len(payload) < 16: return payload
        kind, size, _ = struct.unpack_from('<III', payload)
        count = struct.unpack_from('<I', payload, 12)[0]
        if kind != 1 or size != 4 + 56 * count or 12 + size > len(payload): return payload
        cursor = 12 + size
        for _ in range(count):
            if cursor + 12 > len(payload): return payload
            kind, size, _ = struct.unpack_from('<III', payload, cursor)
            if kind != 3 or cursor + 12 + size > len(payload): return payload
            cursor += 12 + size
        tail = payload[cursor:]
        if tail and len(tail) <= 4096 and len(tail) % 12 == 0 and all(
                struct.unpack_from('<III', tail, pos) in {(0, 0, 0), (0, 0, version)}
                for pos in range(0, len(tail), 12)):
            repairs.append({'rawOffset': absolute + cursor, 'removedBytes': len(tail),
                'declaredFrames': count, 'reason': 'zero-length null chunks after all declared frame extensions'})
            return payload[:cursor]
        return payload
    rebuilt = bytearray()
    for root_pos, kind, version, payload in chunks(data, 0, len(data)):
        if kind is None:
            rebuilt.extend(payload)
            continue
        if kind == 0x10:  # Clump
            children = bytearray()
            for pos, child_kind, child_version, child in chunks(payload, 0, len(payload)):
                if child_kind is None:
                    children.extend(child)
                    continue
                if child_kind == 0x0e: child = frame_list(child, root_pos + 12 + pos + 12, child_version)
                children.extend(struct.pack('<III', child_kind, len(child), child_version) + child)
            payload = bytes(children)
        rebuilt.extend(struct.pack('<III', kind, len(payload), version) + payload)
    return bytes(rebuilt), repairs


def native_json(value):
    if value is None or isinstance(value, (str, int, float, bool)): return value
    if isinstance(value, Enum): return value.value
    if isinstance(value, (bytes, bytearray)):
        return {'encoding': 'base64', 'data': base64.b64encode(value).decode()}
    if hasattr(value, '_asdict'): return native_json(value._asdict())
    if isinstance(value, (tuple, list)): return [native_json(v) for v in value]
    if isinstance(value, dict): return {str(k): native_json(v) for k, v in value.items()}
    fields = vars(value) if hasattr(value, '__dict__') else {
        name: getattr(value, name) for name in getattr(value, '__slots__', []) if hasattr(value, name)}
    if not fields: raise TypeError('Unsupported native object: ' + type(value).__name__)
    # The original file is retained separately, with its SHA; do not duplicate it.
    if type(value).__name__ in {'dff', 'Clump', 'txd'}:
        fields = {k: v for k, v in fields.items() if k not in {'data', 'pos'}}
    return {k: native_json(v) for k, v in fields.items()}


def inspect(home, dff, txd):
    from PIL import Image
    report = {'schema': 'ggd-renderware-inspection@1', 'parser': {
        'repository': PARSER_REPOSITORY, 'commit': PARSER_COMMIT, 'license': 'GPL-3.0-or-later'},
        'models': [], 'textureDictionaries': [], 'errors': [],
        'skeletalAnimationFiles': [str(p.relative_to(home)) for p in home.rglob('*') if p.suffix.lower() == '.ifp'],
        'scope': 'Native mesh, skin weights, bind matrices, frame hierarchy and texture data; not retargeted or runtime-ready.'}
    for source in sorted(home.rglob('*')):
        if source.relative_to(home).parts[0] == 'renderware': continue
        if source.suffix.lower() not in {'.dff', '.txd'}: continue
        sha = hashlib.sha256(source.read_bytes()).hexdigest()
        folder = home/'renderware'/(re.sub(r'[^a-zA-Z0-9_-]', '_', source.stem)+'-'+sha[:10])
        folder.mkdir(parents=True, exist_ok=True)
        try:
            record = {'path': str(source.relative_to(home)), 'sha256': sha}
            parsed = dff.dff() if source.suffix.lower() == '.dff' else txd.txd()
            if source.suffix.lower() == '.dff':
                adjusted, repairs = remove_empty_frame_padding(source.read_bytes())
                if repairs:
                    adjusted_path = folder/'parser-input.dff'
                    adjusted_path.write_bytes(adjusted)
                    record['parserInput'] = {'path': str(adjusted_path.relative_to(home)),
                        'sha256': hashlib.sha256(adjusted).hexdigest(), 'repairs': repairs,
                        'scope': 'Only null frame-padding records removed; raw source, frame data, weights and geometry preserved.'}
                parsed.load_memory(adjusted)
            else:
                parsed.load_file(str(source))
            dump = folder/'native.json'
            dump.write_text(json.dumps(native_json(parsed), ensure_ascii=False, allow_nan=False)+'\n')
            record['nativeJson'] = str(dump.relative_to(home))
            if source.suffix.lower() == '.dff':
                geometries = [g for clump in parsed.clumps for g in clump.geometry_list]
                frames = [f for clump in parsed.clumps for f in clump.frame_list]
                record.update({'clumps': len(parsed.clumps), 'frames': len(frames),
                    'geometries': len(geometries), 'vertices': sum(len(g.vertices) for g in geometries),
                    'triangles': sum(len(g.triangles) for g in geometries),
                    'skins': [{'bones': g.extensions['skin'].num_bones,
                        'weightedVertices': len(g.extensions['skin'].vertex_bone_weights),
                        'bindMatrices': len(g.extensions['skin'].bone_matrices)} for g in geometries if 'skin' in g.extensions],
                    'textureReferences': sorted({t.name for g in geometries for m in g.materials for t in m.textures}),
                    'uvAnimations': len(parsed.uvanim_dict)})
                if not record['vertices']: raise ValueError('No model vertices parsed')
                report['models'].append(record)
            else:
                textures = []
                for index, texture in enumerate(parsed.native_textures):
                    width, height = texture.get_width(), texture.get_height()
                    if not 0 < width * height <= 64_000_000: raise ValueError('Texture dimensions exceed limit')
                    data = texture.to_rgba()
                    if len(data) != width * height * 4: raise ValueError('Texture decode size mismatch')
                    path = folder/(str(index)+'.png')
                    Image.frombytes('RGBA', (width, height), bytes(data)).save(path)
                    textures.append({'name': texture.name, 'width': width, 'height': height,
                        'png': str(path.relative_to(home)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                record['textures'] = textures
                report['textureDictionaries'].append(record)
        except Exception as exc:
            report['errors'].append({'path': str(source.relative_to(home)), 'error': str(exc)})
    (home/'renderware-inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(home.name, 'models', len(report['models']), 'texture dictionaries', len(report['textureDictionaries']), 'errors', len(report['errors']))
    return bool(report['errors'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dragonff', type=Path, required=True)
    parser.add_argument('source', type=Path, nargs='+')
    args = parser.parse_args()
    revision = subprocess.check_output(['git', '-C', str(args.dragonff), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != PARSER_COMMIT: parser.error('DragonFF revision differs from pinned parser')
    if subprocess.check_output(['git', '-C', str(args.dragonff), 'status', '--porcelain', '--', 'gtaLib'], text=True).strip():
        parser.error('DragonFF parser sources have local changes')
    sys.path.insert(0, str(args.dragonff.resolve()))
    from gtaLib import dff, txd
    failures = [inspect(home, dff, txd) for home in args.source]
    raise SystemExit(1 if any(failures) else 0)
