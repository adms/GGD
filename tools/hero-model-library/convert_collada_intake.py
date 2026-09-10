#!/usr/bin/env python3
"""Convert a local Collada intake with Assimp, retaining source and raw export.

Only repair an invalid texture-coordinate reference when the Collada inputs,
bindings and every consuming GLB primitive all prove a single UV set 0.
This does not certify motion, draw-call budgets or backend readiness.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET

NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def read_glb(blob):
    magic, version, size, length, kind = struct.unpack_from('<5I', blob)
    if (magic, version, size, kind) != (0x46546c67, 2, len(blob), 0x4e4f534a):
        raise ValueError('Expected complete GLB 2.0')
    doc = json.loads(blob[20:20 + length])
    tail = blob[20 + length:]
    n, kind = struct.unpack_from('<II', tail)
    if kind != 0x004e4942 or len(tail) != n + 8:
        raise ValueError('Expected one complete binary chunk')
    return doc, tail


def repair_uv(doc, tree):
    result = deepcopy(doc)
    fixes = []
    source_sets = {int(x.get('set', '0')) for x in tree.findall('.//c:input[@semantic="TEXCOORD"]', NS)}
    binding_sets = {int(x.get('input_set', '-1')) for x in tree.findall('.//c:bind_vertex_input[@input_semantic="TEXCOORD"]', NS)}
    for i, material in enumerate(result.get('materials', [])):
        consumers = [p for m in result.get('meshes', []) for p in m['primitives'] if p.get('material') == i]
        for channel, texture in material.get('pbrMetallicRoughness', {}).items():
            if not channel.endswith('Texture'):
                continue
            uv = texture.get('texCoord', 0)
            if all('TEXCOORD_' + str(uv) in p['attributes'] for p in consumers):
                continue
            if source_sets != {0} or binding_sets != {0} or not consumers or any(
                {k for k in p['attributes'] if k.startswith('TEXCOORD_')} != {'TEXCOORD_0'} for p in consumers
            ):
                raise ValueError('Ambiguous UV mapping; no automatic repair')
            texture['texCoord'] = 0
            fixes.append({'material': i, 'channel': channel, 'from': uv, 'to': 0,
                          'evidence': 'Collada inputs and vertex bindings plus every consumer use only UV set 0'})
    return result, fixes


def convert(source, output):
    source = source.resolve()
    original = source.read_bytes()
    tree = ET.fromstring(original)
    images = []
    for image in tree.findall('.//c:library_images/c:image', NS):
        rel = image.findtext('c:init_from', namespaces=NS)
        path = (source.parent / rel).resolve()
        if not path.is_relative_to(source.parent) or not path.is_file():
            raise ValueError('Missing or external texture: ' + str(rel))
        blob = path.read_bytes()
        images.append({'path': rel, 'bytes': len(blob), 'sha256': digest(blob)})
    output.mkdir(parents=True, exist_ok=False)
    raw = output / 'assimp-original.glb'
    args = ['assimp', 'export', str(source), str(raw.resolve()), '-fglb2', '-embtex']
    with (output / 'assimp-export.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60)
    document, tail = read_glb(raw.read_bytes())
    fixed, fixes = repair_uv(document, tree)
    js = json.dumps(fixed, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    blob = struct.pack('<5I', 0x46546c67, 2, 20 + len(js) + len(tail), len(js), 0x4e4f534a) + js + tail
    (output / 'body.glb').write_bytes(blob)
    binary = tail[8:]
    embedded = []
    for image in fixed.get('images', []):
        if 'bufferView' not in image:
            raise ValueError('Export contains external images')
        view = fixed['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        embedded.append(digest(binary[start:start + view['byteLength']]))
    if set(embedded) != {i['sha256'] for i in images}:
        raise ValueError('Embedded textures differ from referenced source images')
    source_triangles = sum(int(x.get('count')) for x in tree.findall('.//c:geometry/c:mesh/c:triangles', NS))
    if tree.findall('.//c:geometry/c:mesh/c:polylist', NS):
        raise ValueError('Polygon preservation needs separate verification')
    primitives = [p for m in fixed['meshes'] for p in m['primitives']]
    if any(p.get('mode', 4) != 4 for p in primitives):
        raise ValueError('Expected triangles')
    triangles = sum(fixed['accessors'][p['indices']]['count'] // 3 for p in primitives)
    if triangles != source_triangles or source.read_bytes() != original:
        raise ValueError('Source or triangle count changed')
    proof = {'schema': 'ggd-collada-intake-conversion@1', 'sourceSha256': digest(original),
             'command': args, 'assimpVersion': subprocess.check_output(['assimp', 'version'], text=True).strip(),
             'sourceJointNodes': len(tree.findall('.//c:node[@type="JOINT"]', NS)),
             'sourceControllers': len(tree.findall('.//c:controller', NS)),
             'referencedImages': images, 'embeddedImageSha256': embedded,
             'rawExportSha256': digest(raw.read_bytes()), 'sha256': digest(blob), 'bytes': len(blob),
             'uvRepairs': fixes, 'rawBinaryPayloadUnchanged': read_glb(blob)[1] == tail,
             'meshes': len(fixed['meshes']), 'drawPrimitives': len(primitives), 'triangles': triangles,
             'skins': len(fixed.get('skins', [])), 'weightedJoints': [len(s['joints']) for s in fixed.get('skins', [])],
             'animationClips': len(fixed.get('animations', [])),
             'limitations': ['UV reference repair only; coordinate transforms, rest-pose fidelity and animation still require acceptance.',
                             'Original Collada and all archive textures, including unreferenced textures, must remain in the intake.'],
             'runtimeReady': False, 'backendSelectionVerified': False}
    (output / 'conversion.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output), ensure_ascii=False))
