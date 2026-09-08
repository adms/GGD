#!/usr/bin/env python3
"""Create original, explicitly labelled cartoon stand-ins with six skeletal clips.

These are GGD procedural proxies, not recovered original character assets or
original choreography. Use only after checking the local asset registry. Output
versions are immutable and still require shared upload and visual verification.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from prepare_mba_body import encode_glb


COLORS = [(249, 148, 188), (187, 33, 76), (24, 25, 38), (250, 250, 245),
          (255, 211, 33), (32, 31, 48), (222, 158, 36), (50, 108, 206)]


class Body:
    def __init__(self):
        self.nodes = []
        self.positions, self.normals, self.uv, self.joints = [], [], [], []
        self.indices = []
        self.rest_world = []

    def bone(self, name, parent, position):
        index = len(self.nodes)
        self.nodes.append({'name': name, 'translation': list(position)})
        world = np.array(position, dtype=float)
        if parent is not None:
            self.nodes[parent].setdefault('children', []).append(index)
            world += self.rest_world[parent]
        self.rest_world.append(world)
        return index

    def vertex(self, point, normal, bone, color):
        self.positions.append(point)
        self.normals.append(normal)
        self.uv.append([(color % 4 + .5) / 4, (color // 4 + .5) / 2])
        self.joints.append([bone, 0, 0, 0])

    def ellipsoid(self, center, scale, bone, color, rings=12, segments=16):
        start = len(self.positions)
        center, scale = np.array(center), np.array(scale)
        for row in range(rings + 1):
            theta = math.pi * row / rings
            for col in range(segments + 1):
                phi = 2 * math.pi * col / segments
                unit = np.array([math.sin(theta) * math.cos(phi), math.cos(theta), math.sin(theta) * math.sin(phi)])
                normal = unit / scale; normal /= np.linalg.norm(normal)
                self.vertex((center + unit * scale).tolist(), normal.tolist(), bone, color)
        for row in range(rings):
            for col in range(segments):
                a = start + row * (segments + 1) + col; b = a + segments + 1
                # Avoid zero-area pole triangles.
                if row != 0: self.indices.extend([a, b, a + 1])
                if row != rings - 1: self.indices.extend([a + 1, b, b + 1])

    def tube(self, points, radius, bone, color):
        points = np.asarray(points, dtype=float); start = len(self.positions)
        for i, point in enumerate(points):
            tangent = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
            tangent /= np.linalg.norm(tangent)
            across = np.cross(tangent, [0, 0, 1])
            if np.linalg.norm(across) < .01: across = np.cross(tangent, [0, 1, 0])
            across /= np.linalg.norm(across); up = np.cross(tangent, across)
            r = radius * (1 - .35 * i / (len(points) - 1))
            for j in range(10):
                angle = j * math.tau / 10
                normal = math.cos(angle) * across + math.sin(angle) * up
                self.vertex((point + normal * r).tolist(), normal.tolist(), bone, color)
        for i in range(len(points) - 1):
            for j in range(10):
                a = start + i * 10 + j; b = start + i * 10 + (j + 1) % 10
                self.indices.extend([a, a + 10, b, b, a + 10, b + 10])
        self.ellipsoid(points[-1], [radius * .65] * 3, bone, color, 6, 10)

    def build(self, style):
        binary = bytearray()
        doc = {'asset': {'version': '2.0', 'generator': 'GGD original cartoon proxy generator'},
               'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': self.nodes,
               'bufferViews': [], 'accessors': [], 'meshes': [], 'skins': [], 'animations': [],
               'extensionsUsed': ['KHR_materials_unlit']}

        def view(data, target=None):
            binary.extend(bytes(-len(binary) % 4))
            item = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
            if target: item['target'] = target
            binary.extend(data); doc['bufferViews'].append(item)
            return len(doc['bufferViews']) - 1

        def accessor(values, kind, integer=False, target=None):
            array = np.asarray(values, dtype='<u2' if integer else '<f4')
            if not np.isfinite(array).all(): raise ValueError('Non-finite geometry or animation')
            item = {'bufferView': view(array.tobytes(), target), 'componentType': 5123 if integer else 5126,
                    'count': len(array), 'type': kind}
            if kind in ('VEC3', 'SCALAR'):
                flat = array.reshape(len(array), -1)
                item.update(min=flat.min(axis=0).tolist(), max=flat.max(axis=0).tolist())
            doc['accessors'].append(item); return len(doc['accessors']) - 1

        palette = Image.new('RGB', (4, 2)); palette.putdata(COLORS)
        png = io.BytesIO(); palette.save(png, format='PNG')
        doc['images'] = [{'name': 'Original GGD proxy palette', 'bufferView': view(png.getvalue()), 'mimeType': 'image/png'}]
        doc['samplers'] = [{'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}]
        doc['textures'] = [{'source': 0, 'sampler': 0}]
        doc['materials'] = [{'name': 'Cartoon palette', 'extensions': {'KHR_materials_unlit': {}}, 'doubleSided': True,
                              'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}]
        primitive = {'attributes': {
            'POSITION': accessor(self.positions, 'VEC3', target=34962),
            'NORMAL': accessor(self.normals, 'VEC3', target=34962),
            'TEXCOORD_0': accessor(self.uv, 'VEC2', target=34962),
            'JOINTS_0': accessor(self.joints, 'VEC4', True, 34962),
            'WEIGHTS_0': accessor([[1, 0, 0, 0]] * len(self.positions), 'VEC4', target=34962)},
            'indices': accessor(self.indices, 'SCALAR', True, 34963), 'material': 0, 'mode': 4}
        doc['meshes'] = [{'name': f'ggd-{style}-proxy', 'primitives': [primitive]}]
        joint_count = len(self.nodes); inverses = []
        for position in self.rest_world:
            matrix = np.eye(4); matrix[:3, 3] = -position
            inverses.append(matrix.T.reshape(-1))
        doc['skins'] = [{'name': 'Original proxy rig', 'skeleton': 0, 'joints': list(range(joint_count)), 'inverseBindMatrices': accessor(inverses, 'MAT4')}]
        # Skin mesh is a separate scene root, not a child of its animated rig.
        doc['nodes'].append({'name': 'proxy-body', 'mesh': 0, 'skin': 0})
        doc['scenes'][0]['nodes'].append(joint_count)
        durations = {'idle': 1.6, 'run': .8, 'attack': .7, 'cast': 1, 'hurt': .5, 'death': 1.2}
        rest = [np.array(node['translation']) for node in self.nodes[:joint_count]]
        for state, duration in durations.items():
            times = np.linspace(0, duration, round(duration * 30) + 1)
            animation = {'name': state, 'channels': [], 'samplers': []}
            ti = accessor(times, 'SCALAR')
            for joint in range(joint_count):
                tracks = [[], [], []]
                name = self.nodes[joint]['name']
                for seconds in times:
                    f = seconds / duration; pulse = math.sin(math.pi * f)
                    position, scale, angle, axis = rest[joint].copy(), np.ones(3), 0, np.array([1, 0, 0])
                    if name == 'body':
                        if state == 'idle': position[1] += .018 * math.sin(math.tau * f)
                        if state == 'run': position[1] += .045 * abs(math.sin(math.tau * f))
                        if state == 'attack': position[2] += .16 * pulse
                        if state == 'cast': scale = np.array([1 + .12 * pulse, 1 - .08 * pulse, 1 + .08 * pulse])
                        if state == 'hurt': angle = -.3 * pulse
                    if name.startswith(('arm', 'leg')):
                        sign = (-1 if '--1' in name else 1) * (-1 if name.startswith('arm') else 1)
                        if state == 'idle': angle = .035 * sign * math.sin(math.tau * f)
                        if state == 'run': angle = .7 * sign * math.sin(math.tau * f)
                        if state == 'attack' and name.startswith('arm'): position[2] += .32 * pulse; angle = -.6 * pulse
                        if state == 'cast' and name.startswith('arm'): position[1] += .16 * pulse; angle = .6 * sign * pulse
                        if state == 'hurt': angle = .2 * sign * pulse
                    if joint == 0 and state == 'death':
                        settle = min(1, f / .75)
                        axis = np.array([1, 0, 0]) if style == 'pink-round' else np.array([0, 0, 1])
                        angle = -math.pi / 2 * settle
                        position[1] += (.54 if style == 'pink-round' else .40) * settle
                    rotation = np.r_[axis * math.sin(angle / 2), math.cos(angle / 2)]
                    for track, value in zip(tracks, [position, rotation, scale]): track.append(value)
                for path, kind, track in zip(['translation', 'rotation', 'scale'], ['VEC3', 'VEC4', 'VEC3'], tracks):
                    sampler = len(animation['samplers'])
                    animation['samplers'].append({'input': ti, 'output': accessor(track, kind), 'interpolation': 'LINEAR'})
                    animation['channels'].append({'sampler': sampler, 'target': {'node': joint, 'path': path}})
            doc['animations'].append(animation)
        return encode_glb(doc, bytes(binary)), {'triangles': len(self.indices) // 3, 'bones': joint_count, 'animationChannels': joint_count * 3}


def make_body(style):
    b = Body(); root = b.bone('root', None, [0, 0, 0])
    if style == 'pink-round':
        body = b.bone('body', root, [0, .70, 0]); b.ellipsoid([0, .70, 0], [.55, .55, .49], body, 0)
        for side in [-1, 1]:
            arm = b.bone(f'arm-{side}', body, [side * .5, -.02, 0])
            b.ellipsoid([side * .55, .68, 0], [.22, .18, .2], arm, 0)
            leg = b.bone(f'leg-{side}', root, [side * .26, .16, .11])
            b.ellipsoid([side * .26, .16, .14], [.26, .15, .30], leg, 1)
            b.ellipsoid([side * .16, .83, .464], [.055, .13, .026], body, 2, 10, 12)
            b.ellipsoid([side * .16, .88, .487], [.027, .048, .012], body, 3, 8, 10)
            b.ellipsoid([side * .33, .65, .40], [.075, .035, .019], body, 1, 8, 10)
        b.ellipsoid([0, .57, .475], [.08, .06, .022], body, 2, 8, 12)
    else:
        body = b.bone('body', root, [0, 1.05, 0])
        b.ellipsoid([0, .91, 0], [.37, .64, .28], body, 5)
        b.ellipsoid([0, 1.67, 0], [.38, .38, .35], body, 4)
        b.ellipsoid([0, 2.045, 0], [.43, .025, .40], body, 5, 6, 8)
        b.ellipsoid([0, 1.32, .24], [.19, .16, .045], body, 3)
        b.ellipsoid([0, .9, .281], [.037, .51, .018], body, 6)
        for side in [-1, 1]:
            b.ellipsoid([side * .14, 1.74, .32], [.034, .046, .022], body, 2, 8, 10)
            for k in range(2):
                base = np.array([side * .27, 1.21 - .27 * k, -.04])
                arm = b.bone(f'arm-{side}-{k}', body, base - b.rest_world[body])
                points = [base + [side * (.09 * i), -.035 * i + .008 * i * i, .035 * i] for i in range(7)]
                b.tube(points, .06, arm, 4)
            for k in range(2):
                base = np.array([side * .18, .39, (k - .5) * .25])
                leg = b.bone(f'leg-{side}-{k}', root, base)
                points = [base + [side * .035 * i, -.047 * i, .035 * i] for i in range(7)]
                b.tube(points, .064, leg, 4)
        for i in range(9):
            x = -.21 + i * .0525
            b.ellipsoid([x, 1.49 + .14 * (x / .21) ** 2, math.sqrt(.35 ** 2 * (1 - (x / .38) ** 2)) + .002], [.027, .022, .017], body, 2, 6, 8)
    return b


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--style', choices=['pink-round', 'yellow-teacher'], required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(); output = args.out.resolve(); output.mkdir(parents=True, exist_ok=False)
    data, metrics = make_body(args.style).build(args.style)
    glb = output / 'body.glb'; glb.write_bytes(data)
    source = Path(__file__).resolve(); raw = source.read_bytes()
    receipt = {'schema': 'ggd-library-model-preparation@1', 'asset': f'generated:ggd-cartoon-proxy-{args.style}',
               'source': {'path': str(source), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)},
               'output': {'path': str(glb), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)},
               'stateClips': {state: state for state in ['idle', 'run', 'attack', 'cast', 'hurt', 'death']},
               'metrics': metrics, 'coordinateConversion': 'Authored in metres, Y up, facing +Z',
               'adaptations': ['Original procedural GGD stand-in; not an extracted character model',
                               'Six authored skeletal motions, not original character choreography',
                               'Single palette material; rounded toy geometry and rigid limb skinning'],
               'validation': 'pending-shared-validator-and-visual-review'}
    (output / 'body.receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(metrics))


if __name__ == '__main__':
    main()
