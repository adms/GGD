#!/usr/bin/env python3
"""Probe a Blender model with Assimp and reject lossy GLB exports.

This is intentionally an evidence-producing probe, not a standardizer.  A
source .blend may have adjacent texture files and an armature object, while
Assimp's Blender importer can still drop their material bindings and skinning.
Such an output must be preserved as a rejected attempt instead of being
registered as an untextured static hero candidate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def glb_document(path):
    blob = path.read_bytes()
    if len(blob) < 20:
        raise ValueError('GLB is truncated')
    magic, version, length, json_length, json_kind = struct.unpack_from('<5I', blob)
    if (magic, version, length, json_kind) != (0x46546C67, 2, len(blob), 0x4E4F534A):
        raise ValueError('Expected a GLB 2.0 JSON-first chunk')
    return json.loads(blob[20:20 + json_length])


def count_primitives(document):
    vertices = triangles = 0
    accessors = document.get('accessors', [])
    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            position = primitive.get('attributes', {}).get('POSITION')
            if position is not None:
                vertices += accessors[position]['count']
            indices = primitive.get('indices')
            if indices is not None and primitive.get('mode', 4) == 4:
                triangles += accessors[indices]['count'] // 3
    return vertices, triangles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('blend', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source = args.blend.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError('Output must be a new conversion-attempt directory')
    if source.suffix.lower() != '.blend' or not source.is_file():
        raise ValueError('Expected an existing .blend source')
    output.mkdir(parents=True)
    target = output / 'assimp-output.glb'
    version = subprocess.check_output(['assimp', 'version'], text=True).strip().splitlines()[-1]
    run = subprocess.run(['assimp', 'export', str(source), str(target)], text=True, capture_output=True)
    if run.returncode != 0 or not target.is_file():
        raise ValueError('Assimp export failed: ' + run.stderr.strip())
    document = glb_document(target)
    sidecars = sorted(path for path in source.parent.iterdir()
                      if path.is_file() and path.suffix.lower() in {'.png', '.dds', '.tga', '.jpg', '.jpeg'})
    vertices, triangles = count_primitives(document)
    output_summary = {
        'path': target.name, 'sha256': sha256(target), 'bytes': target.stat().st_size,
        'meshCount': len(document.get('meshes', [])), 'skinCount': len(document.get('skins', [])),
        'animationCount': len(document.get('animations', [])), 'materialCount': len(document.get('materials', [])),
        'imageCount': len(document.get('images', [])), 'textureCount': len(document.get('textures', [])),
        'vertices': vertices, 'triangles': triangles,
    }
    if output_summary['imageCount'] or output_summary['textureCount']:
        raise ValueError('Probe expected the known texture-loss case; inspect this output before recording it')
    if not sidecars:
        raise ValueError('Probe expects texture sidecars; do not use this rejection category for a textureless source')
    report = {
        'schema': 'ggd-ssbu-blend-assimp-probe@1',
        'input': {'path': str(source), 'sha256': sha256(source), 'bytes': source.stat().st_size,
                  'blenderVersionHeader': source.read_bytes()[:12].decode('ascii', 'replace')},
        'sourceTextureSidecars': [
            {'path': path.name, 'bytes': path.stat().st_size, 'sha256': sha256(path)} for path in sidecars
        ],
        'tool': {'name': 'Assimp commandline', 'version': version,
                 'arguments': ['assimp', 'export', '<blend>', 'assimp-output.glb']},
        'output': output_summary,
        'rejection': {
            'status': 'rejected-lossy-conversion',
            'reason': ('Assimp imported geometry but did not preserve any image or texture in the GLB, despite '
                       'the source directory containing texture sidecars. It also emitted no glTF skin or animation. '
                       'This workflow must not infer material bindings or represent the static output as a complete '
                       'native character model.'),
            'nextRequirement': ('Use a Blender-compatible standardizer that preserves the source material graph and '
                                'armature, then obtain visual review before registering a candidate.'),
        },
        'runtimeReady': False,
        'backendSelectionVerified': False,
    }
    (output / 'conversion-attempt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': output_summary, 'status': report['rejection']['status'],
                      'sourceTextureSidecarCount': len(sidecars)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
