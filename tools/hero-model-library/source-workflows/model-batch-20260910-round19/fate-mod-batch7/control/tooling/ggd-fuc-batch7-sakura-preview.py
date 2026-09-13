"""Independent glTF accessor/animation/CPU-skinning readback for batch 4.
Compares exported samples with retained raw native keys and renders previews.
This is a CPU reference player, not a GGD runtime or original-game check.
"""
from pathlib import Path
import bisect, hashlib, io, json, math, struct
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7/dark-sakura')
assert not (ROOT.parent/'control/handoff.json').exists()
(ROOT/'preview').mkdir(exist_ok=True)
import sys
variant=sys.argv[1];data=(ROOT/'converted/models'/variant/'body.glb').read_bytes()
jlen=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+jlen]);blen=struct.unpack_from('<I',data,20+jlen)[0];binary=data[28+jlen:28+jlen+blen]
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def accessor(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',dt.itemsize*n)
    assert off+(a['count']-1)*stride+dt.itemsize*n<=len(binary)
    return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=off,strides=(stride,dt.itemsize)).copy()
def normalize(q):return q/np.linalg.norm(q)
def slerp(a,b,t):
    a=normalize(a);b=normalize(b);dot=float(np.dot(a,b))
    if dot<0:b=-b;dot=-dot
    dot=np.clip(dot,-1.,1.)
    if dot>0.9995:return normalize(a+(b-a)*t)
    angle=math.acos(dot)
    return normalize((math.sin((1-t)*angle)*a+math.sin(t*angle)*b)/math.sin(angle))
def interpolate(times,values,time,mode,rotation):
    if len(times)==1 or time<=times[0]:return values[0]
    if time>=times[-1]:return values[-1]
    k=bisect.bisect_right(times,time)-1
    if mode=='STEP':return values[k]
    f=(time-times[k])/(times[k+1]-times[k])
    return slerp(values[k],values[k+1],f) if rotation else values[k]*(1-f)+values[k+1]*f
def matrix(t,q,s):
    x,y,z,w=normalize(np.array(q,float));m=np.eye(4)
    m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(s)
    m[:3,3]=t;return m
base=[]
fixedMatrices={}
for n in g['nodes']:
    if 'matrix' in n:fixedMatrices[len(base)]=np.array(n['matrix'],float).reshape(4,4).T
    base.append((np.array(n.get('translation',[0,0,0]),float),np.array(n.get('rotation',[0,0,0,1]),float),np.array(n.get('scale',[1,1,1]),float)))
parent={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])}
prepared=[]
for a in g.get('animations',[]):
    rows=[]
    for ch in a['channels']:
        sampler=a['samplers'][ch['sampler']]
        rows.append({'node':ch['target']['node'],'path':ch['target']['path'],'times':accessor(sampler['input'])[:,0].astype(float),'values':accessor(sampler['output']).astype(float),'mode':sampler.get('interpolation','LINEAR')})
    prepared.append(rows)
def transforms(ai,time):
    local=[[x.copy() for x in item] for item in base]
    if ai is not None:
        for ch in prepared[ai]:
            slot={'translation':0,'rotation':1,'scale':2}[ch['path']]
            local[ch['node']][slot]=interpolate(ch['times'],ch['values'],time,ch['mode'],slot==1)
    matrices={}
    def world(i):
        if i not in matrices:
            m=fixedMatrices[i] if i in fixedMatrices else matrix(*local[i]);matrices[i]=world(parent[i])@m if i in parent else m
        return matrices[i]
    return [world(i) for i in range(len(base))]
skin=g['skins'][0];ibm=accessor(skin['inverseBindMatrices']).reshape((-1,4,4)).transpose(0,2,1).astype(float)
primitives=[]
for p in [p for mesh in g['meshes'] for p in mesh['primitives']]:
    a=p['attributes'];positions=accessor(a['POSITION']).astype(float);joints=accessor(a['JOINTS_0']).astype(int);weights=accessor(a['WEIGHTS_0']).astype(float)
    assert np.max(np.abs(weights.sum(axis=1)-1))<1e-5
    imid=g['textures'][g['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];bv=g['bufferViews'][g['images'][imid]['bufferView']];off=bv.get('byteOffset',0)
    image=np.array(Image.open(io.BytesIO(binary[off:off+bv['byteLength']])).convert('RGBA'))
    primitives.append({'positions':positions,'positions4':np.concatenate([positions,np.ones((len(positions),1))],axis=1),'joints':joints,'weights':weights,'indices':accessor(p['indices']).reshape((-1,3)).astype(int),'uv':accessor(a['TEXCOORD_0']).astype(float),'image':image})
def skinned(worlds):
    joints=np.array([worlds[n] for n in skin['joints']]);jm=joints@ibm
    return [np.einsum('nijk,nk,ni->nj',jm[p['joints']],p['positions4'],p['weights'])[:,:3] for p in primitives]

# Small actual-mesh reference render, preserving source texture pixels.
view=np.array([[.866,0,-.5],[.25,.866,.433],[.433,-.5,.75]])
def render(vertices,center,span,size=320):
    zbuf=np.full((size,size),-np.inf);canvas=np.empty((size,size,3),np.uint8);canvas[:]=[235,238,243]
    for p,verts in zip(primitives,vertices):
        v=(verts-center)@view.T;xy=v[:,:2]*((size-24)/span);xy[:,0]+=size/2;xy[:,1]=size/2-xy[:,1]
        tex=p['image'];uv=p['uv']
        for tri in p['indices']:
            points=xy[tri];x0=max(0,int(np.floor(points[:,0].min())));x1=min(size-1,int(np.ceil(points[:,0].max())));y0=max(0,int(np.floor(points[:,1].min())));y1=min(size-1,int(np.ceil(points[:,1].max())))
            if x0>x1 or y0>y1:continue
            x,y=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);a,b,c=points
            denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(denominator)<1e-9:continue
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator;w=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;t=1-u-w
            z=u*v[tri[0],2]+w*v[tri[1],2]+t*v[tri[2],2];old=zbuf[y0:y1+1,x0:x1+1];mask=(u>=0)&(w>=0)&(t>=0)&(z>old)
            tx=np.clip(((u*uv[tri[0],0]+w*uv[tri[1],0]+t*uv[tri[2],0])%1)*tex.shape[1],0,tex.shape[1]-1).astype(int)
            ty=np.clip(((u*uv[tri[0],1]+w*uv[tri[1],1]+t*uv[tri[2],1])%1)*tex.shape[0],0,tex.shape[0]-1).astype(int)
            colors=tex[ty,tx];mask&=colors[:,:,3]>32
            normal=np.cross(verts[tri[1]]-verts[tri[0]],verts[tri[2]]-verts[tri[0]]);norm=np.linalg.norm(normal);shade=.55+.45*abs(float(normal@np.array([.2,.8,.5]))/norm) if norm>1e-9 else 1.;shade=min(shade,1.)
            rgb=np.clip(colors[:,:,:3]*shade,0,255).astype(np.uint8);part=canvas[y0:y1+1,x0:x1+1];part[mask]=rgb[mask];old[mask]=z[mask]
    return Image.fromarray(canvas)
vertices=skinned(transforms(None,0));allverts=np.concatenate(vertices);assert np.isfinite(allverts).all();center=(allverts.max(axis=0)+allverts.min(axis=0))/2;projected=(allverts-center)@view.T;span=float(np.ptp(projected[:,:2],axis=0).max())*1.12
im=render(vertices,center,span,size=512);im.save(ROOT/'preview'/(variant+'.png'));print(str(ROOT/'preview'/(variant+'.png')))
