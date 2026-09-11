#!/usr/bin/env python3
"""Export one statically inspected Unity prefab to a self-contained skinned GLB.

Uses UnityPy 1.25.3 and numpy, without loading or executing MOD assemblies.
Preserves skin joint order and bind matrices. Animation/morph conversion is not
implemented here and is explicitly reported; this output is an intake artifact.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np

REFLECTION = np.diag([-1., 1., 1., 1.])


def ref(value):
    if value.get('m_FileID', 0):
        raise ValueError('External serialized-file reference must be resolved explicitly')
    return value['m_PathID']


def vector(value, keys):
    return [float(value[k]) for k in keys]


def trs_matrix(position, rotation, scale):
    q = np.asarray(rotation, dtype=float)
    if not np.isfinite([*position, *rotation, *scale]).all() or np.linalg.norm(q) < 1e-12:
        raise ValueError('Non-finite transform or zero quaternion')
    q /= np.linalg.norm(q)
    x, y, z, w = q
    matrix = np.eye(4)
    matrix[:3, :3] = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]) @ np.diag(scale)
    matrix[:3, 3] = position
    return matrix


def converted_trs(tree):
    t = vector(tree['m_LocalPosition'], 'xyz')
    q = vector(tree['m_LocalRotation'], 'xyzw')
    s = vector(tree['m_LocalScale'], 'xyz')
    return [-t[0], t[1], t[2]], [q[0], -q[1], -q[2], q[3]], s


def skin_positions(positions, indices, weights, matrices):
    homogeneous = np.column_stack([positions, np.ones(len(positions))])
    transformed = np.einsum('nkij,nj->nki', matrices[indices], homogeneous)
    return np.einsum('nk,nki->ni', weights, transformed)[:, :3]


def skin_arrays(indices, weights, vertex_count):
    indices = np.asarray(indices, dtype=np.int64)
    if indices.ndim != 2 or indices.shape[0] != vertex_count or not 1 <= indices.shape[1] <= 4:
        raise ValueError('Expected one to four native skin influences per vertex')
    implicit_rigid = weights is None and indices.shape[1] == 1
    weights = np.ones(indices.shape) if implicit_rigid else np.asarray(weights, dtype=float)
    if weights.shape != indices.shape:
        raise ValueError('Skin index/weight channel dimensions differ')
    padding = ((0, 0), (0, 4-indices.shape[1]))
    return np.pad(indices, padding), np.pad(weights, padding), implicit_rigid


def decode_compressed_skin(weights_data, bone_indices_data, vertex_count):
    """Restore Unity's packed 5-bit skin weights without trusting parser output.

    Unity stores up to three explicit integer weights per vertex. They are
    scaled by 31 and, when necessary, the fourth influence is implicit. The
    matching fourth bone index is still present in the packed index stream.
    """
    joints = np.zeros((vertex_count, 4), dtype=np.int64)
    weights = np.zeros((vertex_count, 4), dtype=float)
    index_iter = iter(bone_indices_data)
    vertex_index = 0
    influence_index = 0
    integer_sum = 0
    try:
        for integer_weight in weights_data:
            if vertex_index >= vertex_count or not 0 <= integer_weight <= 31:
                raise ValueError('Invalid compressed skin weight stream')
            joints[vertex_index, influence_index] = next(index_iter)
            weights[vertex_index, influence_index] = integer_weight / 31
            influence_index += 1
            integer_sum += integer_weight
            if integer_sum > 31:
                raise ValueError('Compressed skin weights exceed one')
            if integer_sum == 31:
                vertex_index += 1
                influence_index = integer_sum = 0
            elif influence_index == 3:
                joints[vertex_index, influence_index] = next(index_iter)
                weights[vertex_index, influence_index] = (31-integer_sum) / 31
                vertex_index += 1
                influence_index = integer_sum = 0
    except StopIteration as error:
        raise ValueError('Compressed skin index stream is truncated') from error
    if vertex_index != vertex_count or influence_index or integer_sum:
        raise ValueError('Compressed skin weight stream does not cover every vertex')
    try:
        next(index_iter)
    except StopIteration:
        return joints, weights
    raise ValueError('Compressed skin index stream has unconsumed entries')


def native_skin(mesh, handler, vertex_count):
    """Use the source compressed skin stream when present, otherwise parser data."""
    compressed = getattr(mesh, 'm_CompressedMesh', None)
    packed_weights = getattr(compressed, 'm_Weights', None)
    if packed_weights and packed_weights.m_NumItems > 0:
        from UnityPy.helpers.MeshHelper import unpack_ints
        return decode_compressed_skin(
            unpack_ints(packed_weights),
            unpack_ints(compressed.m_BoneIndices),
            vertex_count,
        )
    return handler.m_BoneIndices, handler.m_BoneWeights


def has_materialized_morph_targets(shapes):
    """Distinguish Unity's empty V_None channel from stored blend-shape data.

    Some Unity exports retain one channel entry even though they store neither
    a frame nor any delta payload.  A channel name alone is therefore not
    sufficient evidence that omitting morph targets would lose source data.
    """
    if not shapes:
        return False
    frames = getattr(shapes, 'frames', None) or []
    data = getattr(shapes, 'data', None) or b''
    return bool(frames or data)


class GLB:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'GGD Unity prefab converter'},
                    'scene': 0, 'scenes': [{'nodes': [0]}],
                    'nodes': [{'name': 'GGD normalized root', 'children': []}],
                    'buffers': [], 'bufferViews': [], 'accessors': [],
                    'meshes': [], 'skins': [], 'materials': [], 'textures': [], 'images': [],
                    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}

    def view(self, blob, target=None):
        self.data.extend(bytes(-len(self.data) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(blob)}
        if target:
            view['target'] = target
        self.data.extend(blob)
        index = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append(view)
        return index

    def accessor(self, array, kind, component=5126, target=None, bounds=False):
        dtype = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[component]
        array = np.asarray(array, dtype=dtype)
        if not np.isfinite(array).all():
            raise ValueError('Non-finite accessor')
        a = {'bufferView': self.view(array.tobytes(), target), 'componentType': component,
             'count': len(array), 'type': kind}
        if bounds:
            a.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        index = len(self.doc['accessors'])
        self.doc['accessors'].append(a)
        return index

    def write(self, path):
        for node in self.doc['nodes']:
            if node.get('children') == []:
                del node['children']
        self.doc['buffers'] = [{'byteLength': len(self.data)}]
        header = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':')).encode()
        header += b' ' * (-len(header) % 4)
        self.data.extend(bytes(-len(self.data) % 4))
        blob = struct.pack('<5I', 0x46546c67, 2, 28+len(header)+len(self.data), len(header), 0x4e4f534a)
        blob += header + struct.pack('<II', len(self.data), 0x004e4942) + self.data
        path.write_bytes(blob)
        return hashlib.sha256(blob).hexdigest()


def convert(bundle, output, root_name, height=1.8):
    import UnityPy
    from UnityPy.helpers.MeshHelper import MeshHandler
    if UnityPy.__version__ != '1.25.3':
        raise ValueError('Use the pinned UnityPy 1.25.3 parser')
    if not np.isfinite(height) or height <= 0:
        raise ValueError('Height must be finite and positive')
    env = UnityPy.load(str(bundle))
    readers = {}
    for obj in env.objects:
        if obj.path_id in readers:
            raise ValueError('Ambiguous path IDs across serialized files')
        readers[obj.path_id] = obj
    trees = {pid: obj.read_typetree() for pid, obj in readers.items()
             if obj.type.name in {'Transform', 'GameObject', 'SkinnedMeshRenderer', 'Material'}}
    transforms = {pid: tree for pid, tree in trees.items() if readers[pid].type.name == 'Transform'}
    roots = [pid for pid, t in transforms.items() if not ref(t['m_Father'])
             and trees[ref(t['m_GameObject'])]['m_Name'] == root_name]
    if len(roots) != 1:
        raise ValueError('Expected one exact prefab root: ' + root_name)
    root = roots[0]
    selected = []

    def visit(pid):
        if pid in selected:
            raise ValueError('Cyclic or multiply-parented hierarchy')
        selected.append(pid)
        for child in transforms[pid]['m_Children']:
            child_id = ref(child)
            if ref(transforms[child_id]['m_Father']) != pid:
                raise ValueError('Inconsistent parent/child references')
            visit(child_id)
    visit(root)
    go_transform = {ref(transforms[pid]['m_GameObject']): pid for pid in selected}
    glb = GLB()
    node_ids = {pid: i+1 for i, pid in enumerate(selected)}
    source_world = {}
    target_world = {}
    for pid in selected:
        tree = transforms[pid]
        game_object = trees[ref(tree['m_GameObject'])]
        if not game_object.get('m_IsActive', True):
            raise ValueError('Inactive prefab branch requires explicit variant selection')
        t, q, s = converted_trs(tree)
        st, sq, ss = vector(tree['m_LocalPosition'], 'xyz'), vector(tree['m_LocalRotation'], 'xyzw'), vector(tree['m_LocalScale'], 'xyz')
        if pid == root:
            t, q, s = [0., 0., 0.], [0., 0., 0., 1.], [1., 1., 1.]
            st, sq, ss = t, q, s
        parent = ref(tree['m_Father'])
        source_world[pid] = (source_world[parent] if pid != root else np.eye(4)) @ trs_matrix(st, sq, ss)
        target_world[pid] = (target_world[parent] if pid != root else np.eye(4)) @ trs_matrix(t, q, s)
        glb.doc['nodes'].append({'name': game_object['m_Name'], 'translation': t, 'rotation': q, 'scale': s,
                                 'children': [node_ids[ref(c)] for c in tree['m_Children']],
                                 'extras': {'unityTransformPathId': str(pid)}})
    glb.doc['nodes'][0]['children'].append(node_ids[root])
    texture_cache, material_cache = {}, {}
    limitations = ['No animation conversion; native clips and Animator remain in the source archive.',
                   'Unity custom shader logic is reduced to base color, metallic and roughness.']

    def material(pid):
        if pid in material_cache:
            return material_cache[pid]
        tree = trees[pid]
        props = tree['m_SavedProperties']
        colors, floats, tex = dict(props['m_Colors']), dict(props['m_Floats']), dict(props['m_TexEnvs'])
        color = colors.get('_BaseColor', colors.get('_Color', dict(r=1., g=1., b=1., a=1.)))
        pbr = {'baseColorFactor': vector(color, 'rgba'), 'metallicFactor': floats.get('_Metallic', 0.),
               'roughnessFactor': 1-floats.get('_Smoothness', floats.get('_Glossiness', 0.))}
        env = next((tex[n] for n in ('_BaseColorMap', '_BaseMap', '_MainTex')
                    if n in tex and ref(tex[n]['m_Texture'])), None)
        if env:
            tid = ref(env['m_Texture'])
            if env['m_Scale'] != {'x': 1., 'y': 1.} or env['m_Offset'] != {'x': 0., 'y': 0.}:
                raise ValueError('Non-identity UV transform must be preserved explicitly')
            if tid not in texture_cache:
                image = readers[tid].read().image
                buffer = io.BytesIO()
                image.save(buffer, format='PNG')
                image_id = len(glb.doc['images'])
                glb.doc['images'].append({'bufferView': glb.view(buffer.getvalue()), 'mimeType': 'image/png',
                                          'name': str(tid)})
                texture_cache[tid] = len(glb.doc['textures'])
                glb.doc['textures'].append({'source': image_id, 'sampler': 0})
            pbr['baseColorTexture'] = {'index': texture_cache[tid]}
        result = {'name': tree['m_Name'], 'pbrMetallicRoughness': pbr,
                  'extras': {'unityMaterialPathId': str(pid)}}
        if floats.get('_SurfaceType', 0.) != 0. or floats.get('_Mode', 0.) != 0.:
            raise ValueError('Transparent Unity material requires explicit conversion')
        if floats.get('_AlphaCutoffEnable', 0.):
            result.update(alphaMode='MASK', alphaCutoff=floats.get('_AlphaCutoff', .5))
        cull = floats.get('_CullMode', floats.get('_Cull', 2.))
        if cull == 0.:
            result['doubleSided'] = True
        elif cull != 2.:
            raise ValueError('Front-face culling requires explicit conversion')
        material_cache[pid] = len(glb.doc['materials'])
        glb.doc['materials'].append(result)
        return material_cache[pid]

    meshes, all_positions = [], []
    for pid, tree in trees.items():
        if readers[pid].type.name != 'SkinnedMeshRenderer' or ref(tree['m_GameObject']) not in go_transform:
            continue
        if not tree.get('m_Enabled', True):
            raise ValueError('Disabled renderer requires explicit variant selection')
        mesh_id = ref(tree['m_Mesh'])
        mesh = readers[mesh_id].read()
        if has_materialized_morph_targets(mesh.m_Shapes):
            raise ValueError('Morph targets must be converted before exporting this mesh')
        handler = MeshHandler(mesh)
        handler.process()
        pos = np.asarray(handler.m_Vertices, dtype=float)
        normals = np.asarray(handler.m_Normals, dtype=float)
        native_joints, native_weights = native_skin(mesh, handler, len(pos))
        joints, weights, implicit_rigid = skin_arrays(native_joints, native_weights, len(pos))
        if not np.isfinite(weights).all() or (weights < 0).any() or (weights.sum(axis=1) <= 0).any():
            raise ValueError('Invalid native skin weights')
        weight_error = float(np.max(np.abs(weights.sum(axis=1)-1)))
        weights /= weights.sum(axis=1)[:, None]
        joints[weights == 0] = 0
        bone_ids = [ref(b) for b in tree['m_Bones']]
        if any(b not in node_ids for b in bone_ids) or joints.max() >= len(bone_ids) or joints.min() < 0:
            raise ValueError('Missing or out-of-range skin joint')
        bind = np.asarray([[[getattr(m, f'e{r}{c}') for c in range(4)] for r in range(4)] for m in mesh.m_BindPose])
        if len(bind) != len(bone_ids):
            raise ValueError('Joint and bind matrix counts differ')
        reflected_bind = REFLECTION @ bind @ REFLECTION
        converted_pos = pos * [-1, 1, 1]
        source_skin = skin_positions(pos, joints, weights, np.asarray([source_world[b] for b in bone_ids]) @ bind)
        target_skin = skin_positions(converted_pos, joints, weights, np.asarray([target_world[b] for b in bone_ids]) @ reflected_bind)
        error = float(np.max(np.abs(target_skin-source_skin*[-1, 1, 1])))
        if error > 1e-6:
            raise ValueError('Skin coordinate conversion changed source positions')
        all_positions.append(target_skin)
        lengths = np.linalg.norm(normals, axis=1)
        if len(normals) != len(pos) or (lengths < 1e-8).any():
            raise ValueError('Missing or zero source normals')
        normals = normals / lengths[:, None] * [-1, 1, 1]
        attrs = {'POSITION': glb.accessor(converted_pos, 'VEC3', target=34962, bounds=True),
                 'NORMAL': glb.accessor(normals, 'VEC3', target=34962),
                 'JOINTS_0': glb.accessor(joints, 'VEC4', 5123, 34962),
                 'WEIGHTS_0': glb.accessor(weights, 'VEC4', target=34962)}
        if handler.m_UV0:
            uv = np.asarray(handler.m_UV0, dtype=float)[:, :2]
            uv[:, 1] = 1-uv[:, 1]
            attrs['TEXCOORD_0'] = glb.accessor(uv, 'VEC2', target=34962)
        triangles = handler.get_triangles()
        if len(triangles) != len(tree['m_Materials']):
            raise ValueError('Submesh/material counts differ')
        primitives, triangle_count = [], 0
        for sub, faces, material_ref in zip(mesh.m_SubMeshes, triangles, tree['m_Materials']):
            faces = np.asarray(faces, dtype=np.int64) + int(sub.baseVertex or 0)
            if faces.ndim != 2 or faces.shape[1] != 3 or faces.min() < 0 or faces.max() >= len(pos):
                raise ValueError('Invalid triangle indices')
            faces = faces[:, [2, 1, 0]].reshape(-1)
            triangle_count += len(faces)//3
            primitives.append({'attributes': attrs, 'indices': glb.accessor(faces, 'SCALAR', 5125, 34963),
                               'material': material(ref(material_ref))})
        skin_id = len(glb.doc['skins'])
        glb.doc['skins'].append({'joints': [node_ids[b] for b in bone_ids], 'skeleton': node_ids[root],
            'inverseBindMatrices': glb.accessor(reflected_bind.transpose(0, 2, 1).reshape(-1, 16), 'MAT4')})
        mesh_index = len(glb.doc['meshes'])
        glb.doc['meshes'].append({'name': mesh.m_Name, 'primitives': primitives})
        render_node = len(glb.doc['nodes'])
        glb.doc['nodes'].append({'name': mesh.m_Name+' renderer', 'mesh': mesh_index, 'skin': skin_id,
                                'extras': {'unityRendererPathId': str(pid), 'unityMeshPathId': str(mesh_id)}})
        # Skinning uses global joints; keep render nodes at scene root to avoid
        # suggesting that their parent transform participates in deformation.
        glb.doc['scenes'][0]['nodes'].append(render_node)
        meshes.append({'meshPathId': str(mesh_id), 'rendererPathId': str(pid), 'name': mesh.m_Name,
                       'vertices': len(pos), 'triangles': triangle_count, 'bones': len(bone_ids),
                       'implicitSingleBoneWeight': implicit_rigid,
                       'sourceWeightSumMaxError': weight_error, 'skinPositionMaxError': error})
    if not meshes:
        raise ValueError('No skinned meshes below the selected root')
    positions = np.concatenate(all_positions)
    minimum, maximum = positions.min(axis=0), positions.max(axis=0)
    if not np.isfinite(positions).all() or maximum[1]-minimum[1] < 1e-8:
        raise ValueError('Invalid or zero-height skinned bounds')
    scale = height/(maximum[1]-minimum[1])
    center = (minimum+maximum)*.5
    glb.doc['nodes'][0].update(scale=[scale]*3, translation=(-np.array([center[0], minimum[1], center[2]])*scale).tolist())
    output.mkdir(parents=True, exist_ok=True)
    glb_path = output/'body.glb'
    digest = glb.write(glb_path)
    receipt = {'schema': 'ggd-unity-prefab-conversion@1', 'source': {'path': str(bundle),
               'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest()}, 'unityPy': UnityPy.__version__,
               'rootName': root_name, 'removedScenePlacement': transforms[root], 'meshes': meshes,
               'output': {'path': 'body.glb', 'sha256': digest, 'bytes': glb_path.stat().st_size,
                          'height': height, 'materials': len(glb.doc['materials']), 'textures': len(glb.doc['textures']),
                          'nodes': len(glb.doc['nodes']), 'animations': 0},
               'drawPrimitives': sum(len(m['primitives']) for m in glb.doc['meshes']),
               'sourceAnimationClips': sum(o.type.name == 'AnimationClip' for o in readers.values()),
               'sourceBoundsBeforeNormalization': {'min': minimum.tolist(), 'max': maximum.tolist()},
               'limitations': limitations, 'runtimeReady': False, 'backendSelectionVerified': False}
    (output/'conversion.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--root-name', required=True)
    parser.add_argument('--height', type=float, default=1.8)
    args = parser.parse_args()
    print(json.dumps(convert(args.bundle, args.output, args.root_name, args.height)['output'], ensure_ascii=False))
