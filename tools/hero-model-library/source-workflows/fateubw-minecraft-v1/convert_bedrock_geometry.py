#!/usr/bin/env python3
"""Convert one texture-backed Bedrock geometry JSON into a self-contained static GLB.

This converter deliberately does not reinterpret TenshiLib animation curves.
It can emit a rigid rest skin only when its rest-pose handling has been
separately reviewed.  The static-mesh-only mode is the safe path for models
whose Bedrock cubes are already in model space: it retains the original source
bone data outside the GLB and does not make a false claim that the resulting
mesh is animation-ready.  Native MOD animation JSON remains a separately
recorded reserve.
"""
import argparse, hashlib, json, struct
from pathlib import Path

import numpy as np
from PIL import Image


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''): h.update(b)
    return h.hexdigest()


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.g = {'asset': {'version': '2.0', 'generator': 'GGD Bedrock geometry converter'},
                  'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'skins': [],
                  'materials': [], 'textures': [], 'images': [], 'samplers': [],
                  'bufferViews': [], 'accessors': [], 'buffers': []}
    def view(self, blob, target=None):
        self.bin += bytes(-len(self.bin) % 4); i = len(self.g['bufferViews'])
        row = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(blob)}
        if target: row['target'] = target
        self.g['bufferViews'].append(row); self.bin += blob; return i
    def acc(self, array, kind, component=5126, target=None, bounds=False):
        dtype = {5126: '<f4', 5123: '<u2'}[component]; a = np.asarray(array, dtype=dtype)
        if not np.isfinite(a).all(): raise ValueError('non-finite accessor')
        row = {'bufferView': self.view(a.tobytes(), target), 'componentType': component,
               'count': len(a), 'type': kind}
        if bounds: row.update(min=a.min(axis=0).tolist(), max=a.max(axis=0).tolist())
        self.g['accessors'].append(row); return len(self.g['accessors']) - 1
    def write(self, path):
        self.bin += bytes(-len(self.bin) % 4); self.g['buffers'] = [{'byteLength': len(self.bin)}]
        head = json.dumps(self.g, ensure_ascii=False, separators=(',', ':')).encode(); head += b' ' * (-len(head) % 4)
        out = struct.pack('<5I', 0x46546c67, 2, 28 + len(head) + len(self.bin), len(head), 0x4e4f534a)
        out += head + struct.pack('<II', len(self.bin), 0x004e4942) + self.bin; path.write_bytes(out); return sha(path)


def mapped(v): return np.array([v[0] / 16, v[1] / 16, -v[2] / 16], dtype=float)
def mapped_normal(v): return np.array([v[0], v[1], -v[2]], dtype=float)


def rotation_matrix_degrees(rotation):
    """Bedrock rest-pose Euler rotation, in the documented XYZ component order.

    The static mesh path only bakes the rest pose.  It does not reinterpret
    TenshiLib animation rotations or make a glTF rig claim.
    """
    x, y, z = np.deg2rad(np.asarray(rotation, dtype=float))
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def source_bone_world_matrices(bones, by_name):
    """Return source-coordinate rest transforms for a validated bone forest."""
    cache = {}
    visiting = set()
    def build(index):
        if index in cache:
            return cache[index]
        if index in visiting:
            raise ValueError('cycle in Bedrock bone parents')
        visiting.add(index)
        bone = bones[index]
        pivot = np.asarray(bone.get('pivot', [0, 0, 0]), dtype=float)
        local = np.eye(4)
        local[:3, :3] = rotation_matrix_degrees(bone.get('rotation', [0, 0, 0]))
        local[:3, 3] = pivot - local[:3, :3] @ pivot
        parent = bone.get('parent')
        world = build(by_name[parent][0]) @ local if parent else local
        visiting.remove(index)
        cache[index] = world
        return world
    return [build(index) for index in range(len(bones))]


def cube_faces(origin, size, uv, tex_size, mirror, transform=None):
    o, s = np.array(origin, dtype=float), np.array(size, dtype=float); lo, hi = o, o + s
    x0, y0, z0 = lo; x1, y1, z1 = hi; w, h, d = s; u, v = uv
    # Bedrock's ordinary [u, v] box layout.  Per-face UV objects are rejected
    # until their semantics are explicitly implemented rather than guessed.
    layouts = [(u+d, v+d, u+d+w, v+d+h), (u+2*d+w, v+d, u+2*d+2*w, v+d+h),
               (u, v+d, u+d, v+d+h), (u+d+w, v+d, u+d+w+d, v+d+h),
               (u+d+w, v, u+d+w+w, v+d), (u+d, v, u+d+w, v+d)]
    points = [([(x1,y0,z0),(x0,y0,z0),(x0,y1,z0),(x1,y1,z0)], (0,0,-1)),
              ([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)], (0,0,1)),
              ([(x0,y0,z0),(x0,y0,z1),(x0,y1,z1),(x0,y1,z0)], (-1,0,0)),
              ([(x1,y0,z1),(x1,y0,z0),(x1,y1,z0),(x1,y1,z1)], (1,0,0)),
              ([(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)], (0,-1,0)),
              ([(x0,y1,z1),(x1,y1,z1),(x1,y1,z0),(x0,y1,z0)], (0,1,0))]
    for (corners, normal), (u0,v0,u1,v1) in zip(points, layouts):
        if mirror: u0, u1 = u1, u0
        if transform is not None:
            corners = [(transform @ np.append(point, 1.0))[:3] for point in corners]
            normal = transform[:3, :3] @ np.asarray(normal, dtype=float)
        # glTF and Bedrock geometry JSON both address image data from the
        # top-left.  Do not flip V here: image loaders apply their own GPU
        # convention and an extra flip samples transparent atlas regions.
        yield [mapped(p) for p in corners], mapped_normal(normal), [(u0/tex_size[0], v0/tex_size[1]),
            (u1/tex_size[0], v0/tex_size[1]), (u1/tex_size[0], v1/tex_size[1]), (u0/tex_size[0], v1/tex_size[1])]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--geometry', type=Path, required=True); ap.add_argument('--texture', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True); ap.add_argument('--report', type=Path, required=True)
    ap.add_argument('--source-id', required=True); ap.add_argument('--candidate-id', required=True)
    ap.add_argument('--static-mesh-only', action='store_true',
                    help='emit the verified static model without a glTF skin; source bones remain a conversion gap')
    ap.add_argument('--bake-static-bone-rotations', action='store_true',
                    help='only with --static-mesh-only: bake source rest-pose bone rotations into mesh vertices')
    args = ap.parse_args(); geo, texture, out, report = args.geometry.resolve(), args.texture.resolve(), args.output.resolve(), args.report.resolve()
    if out.exists() or report.exists(): raise ValueError('output and report must be new')
    doc = json.loads(geo.read_text()); geos = doc.get('minecraft:geometry', [])
    if len(geos) != 1: raise ValueError('expected exactly one Bedrock geometry')
    geometry = geos[0]; desc, bones = geometry['description'], geometry['bones']; names = [b['name'] for b in bones]
    if len(names) != len(set(names)): raise ValueError('duplicate bone names')
    has_static_rotations = any('rotation' in b and any(float(x) for x in b['rotation']) for b in bones)
    if has_static_rotations and not (args.static_mesh_only and args.bake_static_bone_rotations):
        raise ValueError('static bone rotations require --static-mesh-only --bake-static-bone-rotations')
    by_name = {b['name']: (i, b) for i, b in enumerate(bones)}
    for _, b in by_name.values():
        if b.get('parent') and b['parent'] not in by_name: raise ValueError('missing parent bone: ' + b['parent'])
        for c in b.get('cubes', []):
            if not isinstance(c.get('uv'), list) or len(c['uv']) != 2: raise ValueError('only ordinary [u,v] cube UV is implemented')
    image = Image.open(texture).convert('RGBA'); width, height = image.size
    rest_world = source_bone_world_matrices(bones, by_name) if has_static_rotations else [None] * len(bones)
    g = GLB()
    if args.static_mesh_only:
        # glTF treats an empty top-level array as an invalid empty entity; omit
        # the optional property entirely for a deliberately unskinned mesh.
        del g.g['skins']
    positions=[]; normals=[]; texcoords=[]; joints=[]; weights=[]; indices=[]
    for bone_i, bone in enumerate(bones):
        for cube in bone.get('cubes', []):
            inflate = float(cube.get('inflate', 0)); origin = np.array(cube['origin'], float) - inflate; size = np.array(cube['size'], float) + 2*inflate
            for pts, normal, uv in cube_faces(origin, size, cube['uv'], (width,height), bool(cube.get('mirror', False)), rest_world[bone_i]):
                base=len(positions); positions += pts; normals += [normal]*4; texcoords += uv
                if not args.static_mesh_only:
                    joints += [[bone_i,0,0,0]]*4; weights += [[1,0,0,0]]*4
                # mapped() mirrors Z to move Bedrock into glTF coordinates;
                # reverse the source-space winding so it continues to agree
                # with the transformed outward normal after that reflection.
                indices += [base,base+2,base+1,base,base+3,base+2]
    if not positions: raise ValueError('no cube geometry')
    pos=g.acc(positions,'VEC3',bounds=True,target=34962); nor=g.acc(normals,'VEC3',target=34962); tex=g.acc(texcoords,'VEC2',target=34962)
    ind=g.acc(indices,'SCALAR',5123,target=34963)
    image_view=g.view(texture.read_bytes()); image_i=len(g.g['images']); g.g['images'].append({'name':texture.name,'mimeType':'image/png','bufferView':image_view})
    g.g['samplers'].append({'magFilter':9728,'minFilter':9984,'wrapS':10497,'wrapT':10497}); g.g['textures'].append({'source':image_i,'sampler':0})
    alpha = image.getchannel('A').getextrema()[0] < 255
    g.g['materials'].append({'name': args.candidate_id+' source texture','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1},'alphaMode':'MASK' if alpha else 'OPAQUE','alphaCutoff':.5 if alpha else None,'doubleSided':False})
    if not alpha: del g.g['materials'][0]['alphaCutoff']
    attributes={'POSITION':pos,'NORMAL':nor,'TEXCOORD_0':tex}
    if not args.static_mesh_only:
        # The rest pose has no static rotations.  A cube stays in world model space;
        # its inverse bind translation cancels the joint's rest pivot exactly.
        for i, bone in enumerate(bones):
            parent = bone.get('parent'); pivot = mapped(bone.get('pivot', [0,0,0]))
            parent_pivot = mapped(by_name[parent][1].get('pivot', [0,0,0])) if parent else np.zeros(3)
            node = {'name': bone['name'], 'translation': (pivot-parent_pivot).tolist()}
            if parent: g.g['nodes'][by_name[parent][0]].setdefault('children', []).append(i)
            else: g.g['scenes'][0]['nodes'].append(i)
            g.g['nodes'].append(node)
        world = []
        def world_pos(i):
            if i < len(world): return world[i]
            b=bones[i]; parent=b.get('parent'); p=mapped(b.get('pivot',[0,0,0])); value=p if not parent else world_pos(by_name[parent][0])+(p-mapped(by_name[parent][1].get('pivot',[0,0,0])))
            while len(world) <= i: world.append(None)
            world[i]=value; return value
        ibm=[]
        for i in range(len(bones)):
            m=np.eye(4,dtype=np.float32); m[:3,3]=-world_pos(i); ibm.append(m.T.reshape(-1))
        joint=g.acc(joints,'VEC4',5123,target=34962); weight=g.acc(weights,'VEC4',target=34962); inv=g.acc(ibm,'MAT4')
        attributes.update({'JOINTS_0':joint,'WEIGHTS_0':weight})
    mesh_i=len(g.g['meshes']); g.g['meshes'].append({'name':args.candidate_id,'primitives':[{'attributes':attributes,'indices':ind,'material':0}]})
    mesh_node=len(g.g['nodes']); mesh={'name':args.candidate_id+' mesh','mesh':mesh_i}
    if not args.static_mesh_only:
        # Several Bedrock models use deliberate independent attachment roots.  glTF
        # permits that joint forest, but has no valid single `skin.skeleton` root.
        g.g['skins'].append({'name':args.candidate_id+' Bedrock rigid-cube skin','joints':list(range(len(bones))),'inverseBindMatrices':inv})
        mesh['skin']=0
    g.g['nodes'].append(mesh); g.g['scenes'][0]['nodes'].append(mesh_node)
    g.g['extras']={'ggd':{'sourceId':args.source_id,'candidateId':args.candidate_id,'format':'Bedrock geometry JSON','unitScale':'1/16','nativeAnimationIncluded':False,'nativeAnimationReason':'TenshiLib animation JSON preserved separately; not reinterpreted by this static converter','staticMeshOnly':args.static_mesh_only,'bakedStaticBoneRotations':has_static_rotations,'sourceBoneCount':len(bones),'sourceBoneHierarchyPreservedIn':str(geo)}}
    out.parent.mkdir(parents=True,exist_ok=True); report.parent.mkdir(parents=True,exist_ok=True); digest=g.write(out)
    receipt={'schema':'ggd-bedrock-static-glb-conversion@1','sourceId':args.source_id,'candidateId':args.candidate_id,
             'input':{'geometry':{'path':str(geo),'sha256':sha(geo),'bytes':geo.stat().st_size},'texture':{'path':str(texture),'sha256':sha(texture),'bytes':texture.stat().st_size,'width':width,'height':height}},
             'output':{'path':str(out),'sha256':digest,'bytes':out.stat().st_size,'meshCount':1,'skinCount':0 if args.static_mesh_only else 1,'jointCount':0 if args.static_mesh_only else len(bones),'sourceBoneCount':len(bones),'cubeCount':sum(len(b.get('cubes',[])) for b in bones),'vertices':len(positions),'triangles':len(indices)//3,'textureCount':1,'animationCount':0,'staticMeshOnly':args.static_mesh_only,'bakedStaticBoneRotations':has_static_rotations},
             'animationProvenance':'No animation converted. Source TenshiLib JSON is retained as native MOD motion reserve and must be converted/reviewed independently.','skeletonProvenance':'No glTF skin in static-mesh-only output; source Bedrock bones are retained in the source geometry and animation reserve.' if args.static_mesh_only else 'Rigid rest skin generated from source Bedrock bone pivots.','runtimeReady':False,'backendSelectionVerified':False,'visualReview':'pending','rightsStatus':'Author MOD metadata marks ARR; no separate redistribution permission found.'}
    report.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n'); print(json.dumps(receipt,ensure_ascii=False))

if __name__ == '__main__': main()
