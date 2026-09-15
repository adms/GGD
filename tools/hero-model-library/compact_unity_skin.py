#!/usr/bin/env python3
"""Compact supported opaque, unanimated Unity-converted skins without discarding parts.

Keeps patterned textures at their native resolution. Solid materials use linear
vertex colors. A guarded unused corner supplies white for those vertices; one
roughness texture encodes otherwise incompatible solid roughness values.
"""
import argparse
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from convert_unity_prefab import GLB, skin_positions, trs_matrix


def read_glb(path):
    blob=path.read_bytes()
    magic,version,size,n,kind=struct.unpack_from('<5I',blob)
    if (magic,version,size,kind)!=(0x46546c67,2,len(blob),0x4e4f534a):
        raise ValueError('Expected a complete GLB 2.0 file')
    doc=json.loads(blob[20:20+n]);length,kind=struct.unpack_from('<II',blob,20+n)
    if kind!=0x004e4942 or 28+n+length!=len(blob):raise ValueError('Expected one complete BIN chunk')
    return doc,blob[28+n:]


def accessor(doc,blob,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    if a.get('sparse') or a.get('normalized') or v.get('byteStride') or v.get('buffer',0):
        raise ValueError('Unsupported accessor layout')
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
    return np.frombuffer(blob,dtype=dtype,count=a['count']*width,
                         offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()


def srgb_to_linear(value):
    value=np.asarray(value,dtype=float)
    return np.where(value<=.04045,value/12.92,((value+.055)/1.055)**2.4)


def common_bind_shape(base,bind):
    transforms=np.linalg.inv(base)@bind
    error=float(np.max(np.abs(transforms-transforms[0])))
    if not np.isfinite(transforms).all() or error>2e-6:
        raise ValueError('Skins do not share one constant bind-shape transform')
    transform=transforms[0]
    if np.linalg.det(transform[:3,:3])<=0:
        raise ValueError('Reflected or degenerate bind shape is unsupported')
    return transform,error


def compact(source,output):
    g,b=read_glb(source)
    if g.get('animations') or g.get('extensionsUsed'):
        raise ValueError('Only the unanimated, extension-free intake converter output is supported')
    skins=g['skins'];joints=skins[0]['joints']
    if any(s['joints']!=joints for s in skins):raise ValueError('Skin joint orders differ')
    binds=[accessor(g,b,s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float) for s in skins]
    render_nodes=[i for i,n in enumerate(g['nodes']) if 'mesh' in n]
    if render_nodes!=list(range(min(render_nodes),len(g['nodes']))):
        raise ValueError('Expected converter render nodes after the preserved transform hierarchy')
    nodes=deepcopy(g['nodes'][:min(render_nodes)])
    if any(c>=len(nodes) for n in nodes for c in n.get('children',[])):
        raise ValueError('A hierarchy node refers to a render node')
    out=GLB();out.doc['nodes']=nodes;out.doc['scenes']=deepcopy(g['scenes'])
    out.doc['scenes'][0]['nodes']=[i for i in out.doc['scenes'][0]['nodes'] if i not in render_nodes]
    out.doc['samplers']=deepcopy(g.get('samplers',[]))
    material_images={};solid={};patterned=[]
    for i,m in enumerate(g['materials']):
        if m.get('alphaMode','OPAQUE')!='OPAQUE' or m.get('doubleSided') or m.get('extensions'):
            raise ValueError('Only matching opaque back-face-culled materials are supported')
        if any(k in m for k in ['normalTexture','occlusionTexture','emissiveTexture','emissiveFactor']):
            raise ValueError('Additional material channels require explicit preservation')
        p=m['pbrMetallicRoughness']
        if p.get('metallicFactor',1)!=0 or p.get('metallicRoughnessTexture'):
            raise ValueError('Only nonmetallic constant roughness inputs are supported')
        color=np.asarray(p.get('baseColorFactor',[1,1,1,1]),float)[:3]
        texture=p.get('baseColorTexture')
        if texture:
            if texture.get('texCoord',0)!=0 or texture.get('extensions'):raise ValueError('Unsupported UV mapping')
            img=g['images'][g['textures'][texture['index']]['source']]
            view=g['bufferViews'][img['bufferView']];start=view.get('byteOffset',0)
            image=Image.open(io.BytesIO(b[start:start+view['byteLength']])).convert('RGB')
            colors=image.getcolors(1)
            if colors:color*=srgb_to_linear(np.asarray(colors[0][1])/255)
            else:
                if not np.array_equal(color,[1,1,1]):raise ValueError('Patterned base factors require explicit baking')
                material_images[i]=image;patterned.append(i);continue
        solid[i]={'color':color,'roughness':p.get('roughnessFactor',1)}
    if not patterned or len(patterned)>5:raise ValueError('Need one to five patterned material slots')
    slot={mid:i for i,mid in enumerate(patterned)}
    assignments={mid:slot[mid] for mid in patterned};patches={};rough_patches={}
    for mid,item in solid.items():
        matches=[p for p in patterned if abs(g['materials'][p]['pbrMetallicRoughness']['roughnessFactor']-item['roughness'])<1e-8]
        chosen=matches[0] if matches else patterned[-1]
        assignments[mid]=slot[chosen];patches.setdefault(chosen,set()).add(mid)
        if not matches:rough_patches.setdefault(chosen,{})[mid]=item['roughness']
    # Each solid gets a separate 8x8 patch so multiple roughness values remain representable.
    patch_uv={};patch_rects={}
    for mid,items in patches.items():
        width,height=material_images[mid].size
        for j,solid_id in enumerate(sorted(items)):
            x,y=j*8,0
            if x+8>width:raise ValueError('Too many solid-material corner patches')
            patch_rects[solid_id]=(x,y,8,8)
            patch_uv[solid_id]=[(x+4)/width,(y+4)/height]
    # Guard all original UVs, including triangle interiors, against the modified strip.
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            mid=p['material']
            if mid not in patches:continue
            ids=accessor(g,b,p['indices']).reshape(-1)
            uv=accessor(g,b,p['attributes']['TEXCOORD_0'])[ids]
            if uv.min()<0 or uv.max()>1 or uv[:,1].min()*material_images[mid].height<24:
                raise ValueError('Original sampled UVs approach the reserved corner strip')
    quantization=[]
    for mid in patterned:
        image=material_images[mid].copy();m=deepcopy(g['materials'][mid]);p=m['pbrMetallicRoughness']
        for solid_id in patches.get(mid,[]):
            x,y,w,h=patch_rects[solid_id];image.paste((255,255,255),(x,y,x+w,y+h))
        def embed(im,name):
            buffer=io.BytesIO();im.save(buffer,format='PNG');idx=len(out.doc['images'])
            out.doc['images'].append({'bufferView':out.view(buffer.getvalue()),'mimeType':'image/png','name':name})
            ti=len(out.doc['textures']);out.doc['textures'].append({'source':idx,'sampler':0});return ti
        p['baseColorTexture']={'index':embed(image,m['name']+' original-resolution base color')}
        if mid in rough_patches:
            original=p['roughnessFactor'];encoded=round(original*255)
            mr=Image.new('RGB',image.size,(255,encoded,0))
            for solid_id in patches.get(mid,[]):
                x,y,w,h=patch_rects[solid_id];rough=solid[solid_id]['roughness']
                mr.paste((255,round(rough*255),0),(x,y,x+w,y+h))
                quantization.append(abs(rough-round(rough*255)/255))
            quantization.append(abs(original-encoded/255))
            p['roughnessFactor']=1;p['metallicRoughnessTexture']={'index':embed(mr,m['name']+' roughness')}
        out.doc['materials'].append(m)
    groups=[{'POSITION':[],'NORMAL':[],'TEXCOORD_0':[],'COLOR_0':[],'JOINTS_0':[],'WEIGHTS_0':[],'indices':[],'count':0} for _ in patterned]
    # Test multiple independent global joint poses, not only a rest-pose coincidence.
    worlds=[]
    for phase in [0.,.7,1.9]:
        worlds.append(np.array([trs_matrix([np.sin(j+phase),j*.03,np.cos(j-phase)],
            [np.sin((j*.11+phase)/2),0,0,np.cos((j*.11+phase)/2)],[1,1,1]) for j in range(len(joints))]))
    proof=[];triangles=0
    for ni in render_nodes:
        node=g['nodes'][ni];mesh=g['meshes'][node['mesh']];bind=binds[node['skin']]
        transform,variance=common_bind_shape(binds[0],bind);max_error=0
        for prim in mesh['primitives']:
            if prim.get('targets') or prim.get('mode',4)!=4:raise ValueError('Only unmorphed triangles are supported')
            if set(prim['attributes'])-{'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}:
                raise ValueError('Unsupported vertex channels must not be discarded')
            ids=accessor(g,b,prim['indices']).reshape(-1);used,inverse=np.unique(ids,return_inverse=True)
            attrs={key:accessor(g,b,index)[used] for key,index in prim['attributes'].items()}
            positions=attrs['POSITION'].astype(float)
            converted=(np.column_stack([positions,np.ones(len(positions))])@transform.T)[:,:3]
            for world in worlds:
                expected=skin_positions(positions,attrs['JOINTS_0'],attrs['WEIGHTS_0'],world@bind)
                actual=skin_positions(converted,attrs['JOINTS_0'],attrs['WEIGHTS_0'],world@binds[0])
                max_error=max(max_error,float(np.max(np.abs(expected-actual))))
            normals=attrs['NORMAL']@np.linalg.inv(transform[:3,:3])
            normals/=np.linalg.norm(normals,axis=1)[:,None]
            mid=prim['material'];colors=np.ones((len(positions),4));uv=attrs.get('TEXCOORD_0')
            if mid in solid:
                colors[:,:3]=solid[mid]['color'];uv=np.tile(patch_uv[mid],(len(positions),1))
            if uv is None:raise ValueError('Patterned material lacks UVs')
            attrs.update(POSITION=converted,NORMAL=normals,TEXCOORD_0=uv,COLOR_0=colors)
            group=groups[assignments[mid]];group['indices'].append(inverse+group['count']);group['count']+=len(positions)
            for key in attrs:group[key].append(attrs[key])
            triangles+=len(ids)//3
        if max_error>3e-6:raise ValueError('Compaction changes posed vertex locations')
        proof.append({'mesh':mesh.get('name',f"mesh-{node['mesh']}"),'bindShapeMatrixMaxVariance':variance,'posedVertexMaxError':max_error})
    primitives=[]
    for slot_id,group in enumerate(groups):
        attrs={}
        for name,kind in [('POSITION','VEC3'),('NORMAL','VEC3'),('TEXCOORD_0','VEC2'),('COLOR_0','VEC4'),('JOINTS_0','VEC4'),('WEIGHTS_0','VEC4')]:
            attrs[name]=out.accessor(np.concatenate(group[name]),kind,5123 if name=='JOINTS_0' else 5126,34962,name=='POSITION')
        primitives.append({'attributes':attrs,'indices':out.accessor(np.concatenate(group['indices']),'SCALAR',5125,34963),'material':slot_id})
    skin=deepcopy(skins[0]);skin['inverseBindMatrices']=out.accessor(binds[0].transpose(0,2,1).reshape(-1,16),'MAT4')
    out.doc['skins']=[skin];out.doc['meshes']=[{'name':'Preserved prefab geometry','primitives':primitives}]
    out.doc['scenes'][0]['nodes'].append(len(nodes));nodes.append({'name':'Compacted renderer','mesh':0,'skin':0})
    output.mkdir(parents=True,exist_ok=True);target=output/'body.glb';sha=out.write(target)
    result={'schema':'ggd-unity-skin-compaction@1','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'output':{'path':'body.glb','sha256':sha,'bytes':target.stat().st_size,'meshes':1,'skins':1,'bones':len(joints),'drawPrimitives':len(primitives),'triangles':triangles},
            'geometryProof':proof,'patternedTextureResolutions':[list(material_images[m].size) for m in patterned],
            'maxRoughnessQuantizationError':max(quantization,default=0.),
            'limitations':['Unused guarded texture strip stores solid colors; very small mip levels may mix the strip.',
                           'Roughness encoded in 8-bit texture where needed; no patterned texture downsampling.',
                           'No animation transfer or backend selection validation yet.'],
            'runtimeReady':False,'backendSelectionVerified':False}
    (output/'compaction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();print(json.dumps(compact(args.source,args.output)['output']))
