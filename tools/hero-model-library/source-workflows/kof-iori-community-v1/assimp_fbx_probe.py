#!/usr/bin/env python3
"""Probe one FBX with Assimp and reject GLBs that retain unresolved image URIs."""
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
        raise ValueError('Expected GLB 2.0 with JSON first chunk')
    return json.loads(blob[20:20+json_length])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fbx', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source = args.fbx.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError('Output must be a new conversion-attempt directory')
    if not source.is_file():
        raise ValueError('FBX source is missing')
    output.mkdir(parents=True)
    target = output / 'assimp-output.glb'
    version = subprocess.check_output(['assimp', 'version'], text=True).strip().splitlines()[-1]
    run = subprocess.run(['assimp', 'export', str(source), str(target)], text=True, capture_output=True)
    if run.returncode != 0 or not target.is_file():
        raise ValueError('Assimp export failed: ' + run.stderr.strip())
    document = glb_document(target)
    unresolved = [image.get('uri') for image in document.get('images', []) if image.get('uri')]
    if not unresolved:
        raise ValueError('Probe expects the known unresolved-image case; inspect conversion policy before accepting output')
    report = {
        'schema': 'ggd-kof-fbx-assimp-probe@1',
        'input': {'path': str(source), 'sha256': sha256(source), 'bytes': source.stat().st_size},
        'tool': {'name': 'Assimp commandline', 'version': version, 'arguments': ['assimp', 'export', '<fbx>', 'assimp-output.glb']},
        'output': {'path': target.name, 'sha256': sha256(target), 'bytes': target.stat().st_size,
                   'meshCount': len(document.get('meshes', [])), 'skinCount': len(document.get('skins', [])),
                   'materialCount': len(document.get('materials', [])), 'imageCount': len(document.get('images', []))},
        'rejection': {'status': 'rejected-not-self-contained',
                      'reason': 'Assimp preserved unresolved source material filenames as external GLB image URIs. Supplied TGA files have no verified per-material binding in the FBX metadata, so this workflow must not infer replacements.',
                      'externalImageUris': unresolved,
                      'nextRequirement': 'Obtain an authoritative material-binding source or produce a visually reviewed explicit mapping before standardizing.'},
        'runtimeReady': False,
        'backendSelectionVerified': False,
    }
    (output / 'conversion-attempt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'output': report['output'], 'status': report['rejection']['status'],
                      'externalImageCount': len(unresolved)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
