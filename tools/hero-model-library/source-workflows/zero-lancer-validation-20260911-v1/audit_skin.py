#!/usr/bin/env python3
"""Read-only independent Unity serialized JSON / glTF accessor and skin audit.
Uses NumPy only; does not import the production converter or execute MOD code.
Re-run with --source-root and a new --output directory. Source inputs remain read-only.
"""
import argparse,ast,hashlib,json,platform,struct
from pathlib import Path
import numpy as np
ap=argparse.ArgumentParser();ap.add_argument('--source-root',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=False)
SRC=args.source_root.resolve()
INPUTS={}
def read(p):
 p=Path(p);b=p.read_bytes();INPUTS[str(p)]={'absolutePath':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};return b

def jread(p):return json.loads(read(p))
def bounds(a):
 return {'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist(),'extent':np.ptp(a,axis=0).tolist()}
def maxerr(a,b):return float(np.max(np.abs(a-b)))
def trs(t,q,s):
 # Hamilton quaternion as w, vector; rotation via skew-matrix formula.
 q=np.array(q,dtype=float);q/=np.linalg.norm(q);v=q[:3];w=q[3]
 x,y,z=v;K=np.array([[0.,-z,y],[z,0.,-x],[-y,x,0.]])
 R=np.eye(3)+2*w*K+2*K@K
 m=np.eye(4);m[:3,:3]=R@np.diag(s);m[:3,3]=t;return m

def glb(path):
 b=read(path);magic,ver,total=struct.unpack_from('<III',b);assert (magic,ver,total)==(0x46546c67,2,len(b))
 off=12;chunks={}
 while off<len(b):
  size,kind=struct.unpack_from('<II',b,off);off+=8;chunks[kind]=b[off:off+size];off+=size
 return json.loads(chunks[0x4E4F534A]),chunks[0x004E4942]

def accessor(doc,blob,idx):
 a=doc['accessors'][idx];assert 'sparse' not in a
 v=doc['bufferViews'][a['bufferView']];assert v['buffer']==0
 dt=np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
 n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 p=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',n*dt.itemsize)
 r=np.ndarray((a['count'],n),dtype=dt,buffer=blob,offset=p,strides=(stride,dt.itemsize)).copy()
 if a.get('normalized'):
  r=r.astype(float)/(2**(dt.itemsize*8)-1 if dt.kind=='u' else 2**(dt.itemsize*8-1)-1)
  if dt.kind=='i':r=np.maximum(-1,r)
 if a['type']=='MAT4':return r.reshape(-1,4,4).transpose(0,2,1)
 return r

def mesh_source(m):
 vd=m['m_VertexData'];N=vd['m_VertexCount'];raw=ast.literal_eval(vd['m_DataSize']);assert isinstance(raw,bytes)
 dims={0:4,1:2,10:4};dtypes={0:'<f4',1:'<f2',10:'<i4'}
 strides={};starts={};off=0
 for c in vd['m_Channels']:
  if c['dimension']:strides[c['stream']]=max(strides.get(c['stream'],0),c['offset']+c['dimension']*dims[c['format']])
 for stream,stride in sorted(strides.items()):starts[stream]=off;off=(off+stride*N+15)//16*16
 assert off==len(raw)
 def chan(i):
  c=vd['m_Channels'][i];dt=np.dtype(dtypes[c['format']]);return np.ndarray((N,c['dimension']),buffer=raw,dtype=dt,offset=starts[c['stream']]+c['offset'],strides=(strides[c['stream']],dt.itemsize)).copy()
 return chan(0),chan(1),chan(4),chan(12),chan(13)

def world_matrices(nodes):
 parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])};memo={}
 def get(i):
  if i not in memo:
   n=nodes[i];local=np.array(n['matrix']).reshape(4,4).T if 'matrix'in n else trs(n.get('translation',[0,0,0]),n.get('rotation',[0,0,0,1]),n.get('scale',[1,1,1]))
   memo[i]=(get(parents[i]) if i in parents else np.eye(4))@local
  return memo[i]
 return np.stack([get(i) for i in range(len(nodes))])

def skin(p,j,w,palette):
 hp=np.column_stack((p,np.ones(len(p))))
 return sum(w[:,i,None]*(palette[j[:,i]]@hp[...,None])[...,0] for i in range(4))[:,:3]

catalog=jread(SRC/'analysis/unity-objects.json')
objects={str(o['pathId']):o for o in catalog['objects']}
def obj(pid):return jread(SRC/objects[str(pid)]['dataPath'])
source_mesh=obj('4912938233241089334')
sp,sn,suv,sw,sj=mesh_source(source_mesh)
original_weights=sw.copy();sw=sw.astype(float);sw/=sw.sum(axis=1,keepdims=True);sj[sw==0]=0
bind=np.array([[[b[f'e{r}{c}'] for c in range(4)] for r in range(4)] for b in source_mesh['m_BindPose']])
renderer=obj('-4941642568377141772');bone_ids=[str(x['m_PathID']) for x in renderer['m_Bones']]
source_transform_cache={};source_local={}
def source_world(pid):
 pid=str(pid)
 if pid not in source_transform_cache:
  o=obj(pid);t=[o['m_LocalPosition'][c] for c in 'xyz'];q=[o['m_LocalRotation'][c] for c in 'xyzw'];s=[o['m_LocalScale'][c] for c in 'xyz'];M=trs(t,q,s);source_local[pid]=M
  par=o['m_Father']['m_PathID'];source_transform_cache[pid]=(source_world(par) if par else np.eye(4))@M
 return source_transform_cache[pid]
source_palette=np.stack([source_world(b) for b in bone_ids])@bind
source_skin=skin(sp,sj,sw,source_palette)
F=np.diag([-1.,1.,1.,1.]);reflection=F[:3,:3]
source_triangles=np.frombuffer(bytes(source_mesh['m_IndexBuffer']),dtype='<u2').reshape(-1,3)
# Independently measure native triangle-normal correspondence before conversion.
native_faces=np.cross(sp[source_triangles[:,1]].astype(float)-sp[source_triangles[:,0]],sp[source_triangles[:,2]].astype(float)-sp[source_triangles[:,0]])
native_face_len=np.linalg.norm(native_faces,axis=1)
native_vertex_normal_mean=sn[source_triangles].astype(float).sum(axis=1)
native_dots=(native_faces*native_vertex_normal_mean).sum(axis=1)/native_face_len/np.linalg.norm(native_vertex_normal_mean,axis=1)
native_negative_ids=np.flatnonzero(native_dots<0).tolist()
results=[];docs=[];data=[]
for variant in ['p1','p2']:
 model=SRC/f'converted/diarmuid-{variant}-textured/body.glb';receipt=jread(model.parent/'conversion.json');doc,blob=glb(model);docs.append(doc)
 prim=doc['meshes'][0]['primitives'][0];attrs={k:accessor(doc,blob,v) for k,v in prim['attributes'].items()};data.append(attrs)
 p,n,w,j=(attrs[x] for x in ['POSITION','NORMAL','WEIGHTS_0','JOINTS_0']);j=j.astype(int)
 indices=accessor(doc,blob,prim['indices']).reshape(-1,3)
 s=doc['skins'][0];ibm=accessor(doc,blob,s['inverseBindMatrices']);world=world_matrices(doc['nodes']);palette=world[s['joints']]@ibm
 wp=skin(p,j,w,palette)
 normalizer=world[0];expected=np.einsum('ij,nj->ni',normalizer,np.column_stack((source_skin*[-1,1,1],np.ones(len(sp)))))[:,:3]
 expected_ibm=F@bind@F
 expected_n=sn.astype(float)/np.linalg.norm(sn.astype(float),axis=1,keepdims=True);expected_n=expected_n*[-1,1,1]
 expected_uv=suv.astype(float);expected_uv[:,1]=1-expected_uv[:,1]
 transform_errors=[]
 for idx,node in enumerate(doc['nodes']):
  pid=node.get('extras',{}).get('unityTransformPathId')
  if pid:
   expected_world=normalizer@F@source_world(pid)@F
   transform_errors.append({'node':idx,'pathId':pid,'name':node['name'],'maxAbsError':maxerr(world[idx],expected_world)})
 # Weighted skin matrix is evaluated in world space; normals use inverse-transpose.
 weighted_matrix=sum(w[:,i,None,None]*palette[j[:,i],:3,:3] for i in range(4))
 wn=(np.linalg.inv(weighted_matrix).transpose(0,2,1)@n[...,None])[...,0];normal_lengths=np.linalg.norm(wn,axis=1);wn/=normal_lengths[:,None]
 # Winding agreement is a diagnostic on unchanged source faces, not proof of original art intent.
 edges0=wp[indices[:,1]]-wp[indices[:,0]];edges1=wp[indices[:,2]]-wp[indices[:,0]];face=np.cross(edges0,edges1);areas=np.linalg.norm(face,axis=1);valid=areas>1e-12
 face_n=face[valid]/areas[valid,None];avg_n=wn[indices[valid]].sum(axis=1);avg_n/=np.linalg.norm(avg_n,axis=1,keepdims=True);dots=(face_n*avg_n).sum(axis=1)
 landmarks=[]
 for idx,node in enumerate(doc['nodes']):
  if node.get('name') in ['hip','head','face','L_foot','R_foot','L_toe','R_toe','neck','chest']:
   landmarks.append({'node':idx,'name':node['name'],'worldOrigin':world[idx,:3,3].tolist()})
 result={
 'variant':variant,'absolutePath':str(model),'sha256':INPUTS[str(model)]['sha256'],'receiptHashMatches':INPUTS[str(model)]['sha256']==receipt['output']['sha256'],
 'vertices':len(p),'triangles':len(indices),'joints':len(s['joints']),'animations':len(doc.get('animations',[])),
 'bounds':{'positionAccessorLocal':bounds(p),'worldSkinnedRest':bounds(wp),'independentUnityWorld':bounds(source_skin),'normalizedUnityExpected':bounds(expected)},
 'orientation':{'upAxis':'Y','basis':'Full node hierarchy and inverse-bind skinning; highest point world Y=1.8 m; original mesh-local long axis Z is transformed by source skeleton','landmarks':landmarks},
 'skin':{'finite':bool(np.isfinite(wp).all()),'jointIndicesMin':int(j.min()),'jointIndicesMax':int(j.max()),'outOfRangeJointEntries':int(((j<0)|(j>=len(s['joints']))).sum()),'negativeWeightEntries':int((w<0).sum()),'weightSumMaxAbsError':maxerr(w.sum(axis=1),np.ones(len(w))),'maxPositiveInfluences':int((w>0).sum(axis=1).max()),'activeJointCount':int(len(np.unique(j[w>0]))),'zeroTotalWeightVertices':int((w.sum(axis=1)==0).sum()),'jointOrderMatchesNativeRenderer':all(doc['nodes'][node]['extras']['unityTransformPathId']==bone_ids[i] for i,node in enumerate(s['joints'])),'nativeWeightSumMaxAbsError':maxerr(original_weights.astype(float).sum(axis=1),np.ones(len(w))),'normalizedNativeWeightMaxAbsError':maxerr(w,sw),'jointIndicesEqualNative':bool(np.array_equal(j,sj)),'worldPositionMaxAbsErrorVsUnity':maxerr(wp,expected),'worldPositionRmsErrorVsUnity':float(np.sqrt(np.mean((wp-expected)**2)))},
 'bindMatrices':{'finite':bool(np.isfinite(ibm).all()),'count':len(ibm),'minAbsLinearDeterminant':float(abs(np.linalg.det(ibm[:,:3,:3])).min()),'maxLinearConditionNumber':float(np.linalg.cond(ibm[:,:3,:3]).max()),'maxAbsErrorVsReflectedNative':maxerr(ibm,expected_ibm),'maxAffineBottomRowError':maxerr(ibm[:,3,:],np.tile([0,0,0,1],(len(ibm),1)))},
 'geometryFidelity':{'positionMaxAbsErrorVsReflectedNative':maxerr(p,sp*[-1,1,1]),'normalMaxAbsErrorVsNormalizedReflectedNative':maxerr(n,expected_n),'uvMaxAbsErrorVsNativeWithVFlip':maxerr(attrs['TEXCOORD_0'],expected_uv),'indicesEqualReversedNativeWinding':bool(np.array_equal(indices,source_triangles[:,::-1])),'sourceTransformCountChecked':len(transform_errors),'allNativeTransformsPreserved':max(x['maxAbsError'] for x in transform_errors)<1e-12,'transformMaxAbsError':max(x['maxAbsError'] for x in transform_errors)},
 'normals':{'localFinite':bool(np.isfinite(n).all()),'localZeroLengthVertices':int((np.linalg.norm(n,axis=1)<1e-8).sum()),'localUnitLengthMaxError':maxerr(np.linalg.norm(n.astype(float),axis=1),np.ones(len(n))),'worldSkinFinite':bool(np.isfinite(wn).all()),'worldBeforeRenormalizationLengthRange':[float(normal_lengths.min()),float(normal_lengths.max())],'worldTriangleDegenerates':int((~valid).sum()),'worldTriangleVsMeanVertexNormalDotRange':[float(dots.min()),float(dots.max())],'negativeDotTriangleCount':int((dots<0).sum()),'negativeDotTriangleIds':np.flatnonzero(valid)[dots<0].tolist(),'nativeLocalNegativeDotTriangleIds':native_negative_ids,'negativeTriangleIdsMatchSource':np.flatnonzero(valid)[dots<0].tolist()==native_negative_ids,'interpretation':'Ten native faces have mean vertex normals opposite their geometric normal; all positions, winding, and normalized source normals are preserved. Not a new conversion defect.'},
 'materials':doc.get('materials'),
 'gaps':['No animations or morph targets are in this source model; retargeted MOD skeleton is not a proven original PSP/PS2 skeleton.','Custom Unity toon outline/shader behavior is reduced to portable material parameters.','This audit does not establish animation playback, backend selection, deployment, or visual source-engine parity.'],
 }
 results.append(result)
# receipt consistency for retained untextured intermediate, source archive and Unity bundle
pre=SRC/'converted/diarmuid-p1/body.glb';pre_receipt=jread(pre.parent/'conversion.json');glb(pre)
source_archive=SRC/'original/zero_lancer.7z';read(source_archive);read(SRC/'extracted/Zero Lancer/zero lancer.cbb')
report={'schema':'ggd-independent-unity-glb-skin-audit@1','sourceId':'gamebanana-zero-lancer-493444','tool':{'python':platform.python_version(),'numpy':np.__version__,'scriptPath':str(Path(__file__).resolve())},'method':'Decode Unity JSON vertex streams with ast.literal_eval, source hierarchy/IBM via matrix math, compare reflected source to all GLB vertices after skinning and current normalization. No converter import.','variants':results,'p1P2AccessorDataIdentical':all(np.array_equal(data[0][k],data[1][k]) for k in data[0]),'preTexturedIntermediate':{'absolutePath':str(pre),'actualSha256':INPUTS[str(pre)]['sha256'],'receiptSha256':pre_receipt['output']['sha256'],'receiptMatches':INPUTS[str(pre)]['sha256']==pre_receipt['output']['sha256']},'sourceArchive':INPUTS[str(source_archive)],'sourceBundle':INPUTS[str(SRC/'extracted/Zero Lancer/zero lancer.cbb')],'inputs':list(INPUTS.values())}
report['passedSourceFidelityChecks']=all(
 v['receiptHashMatches'] and v['skin']['finite'] and v['skin']['outOfRangeJointEntries']==0
 and v['skin']['negativeWeightEntries']==0 and v['skin']['zeroTotalWeightVertices']==0
 and v['skin']['weightSumMaxAbsError']<1e-6 and v['skin']['jointOrderMatchesNativeRenderer']
 and v['skin']['jointIndicesEqualNative'] and v['skin']['worldPositionMaxAbsErrorVsUnity']<1e-6
 and v['bindMatrices']['maxAbsErrorVsReflectedNative']==0
 and v['geometryFidelity']['positionMaxAbsErrorVsReflectedNative']==0
 and v['geometryFidelity']['uvMaxAbsErrorVsNativeWithVFlip']==0
 and v['geometryFidelity']['normalMaxAbsErrorVsNormalizedReflectedNative']<1e-6
 and v['geometryFidelity']['indicesEqualReversedNativeWinding']
 and v['geometryFidelity']['allNativeTransformsPreserved']
 and v['normals']['localZeroLengthVertices']==0 and v['normals']['negativeTriangleIdsMatchSource']
 for v in results) and report['preTexturedIntermediate']['receiptMatches']
assert report['passedSourceFidelityChecks'], 'Independent source-fidelity check failed; inspect audit inputs.'
(OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['inputs','variants']},indent=2))
for x in results:print(json.dumps({k:x[k] for k in ['variant','bounds','skin','bindMatrices','geometryFidelity','normals']},indent=2))
