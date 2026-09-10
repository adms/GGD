#!/usr/bin/env python3
"""Blender geometry-only LOD; no glTF import/export, no skeleton/animation rewrite."""
import os,sys,json,hashlib,importlib.util,copy
from pathlib import Path
sys.path=[p for p in sys.path if p!='/private/tmp']
src=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();target=int(sys.argv[3]);out.mkdir(exist_ok=False)
for key,sub in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','datafiles')]:
 p=out/'isolated-blender'/sub;p.mkdir(parents=True);os.environ[key]=str(p)
print('Loading isolated bpy',flush=True)
import bpy,numpy as np
print('bpy loaded '+bpy.app.version_string,flush=True)
spec=importlib.util.spec_from_file_location('ggd_glb','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g,b=h.read_glb(src);beforeDoc=copy.deepcopy(g);beforeBin=bytes(b);assert len(g['meshes'])==1 and len(g['skins'])==1
bpy.ops.wm.read_factory_settings(use_empty=True)
prims=g['meshes'][0]['primitives'];before=sum(g['accessors'][p['indices']]['count']//3 for p in prims);ratio=target/before;output=[];proof=[]
for pi,p in enumerate(prims):
 print('primitive '+str(pi)+' start',flush=True)
 attrs={k:h.accessor(g,b,i)for k,i in p['attributes'].items()};indices=h.accessor(g,b,p['indices']).reshape(-1,3)
 print('primitive geometry '+str([len(attrs['POSITION']),len(indices),int(indices.min()),int(indices.max())]),flush=True)
 mesh=bpy.data.meshes.new('source primitive '+str(pi));mesh.from_pydata(attrs['POSITION'].tolist(),[],indices.tolist());mesh.update();print('mesh built',flush=True);obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 uv=mesh.uv_layers.new(name='Source UV0')
 for loop in mesh.loops:uv.data[loop.index].uv=attrs['TEXCOORD_0'][loop.vertex_index].tolist()
 for poly in mesh.polygons:poly.use_smooth=True
 print('uv assigned',flush=True)
 # The LOD changes topology; use generated smooth corner normals and retain
 # every original normal in the source GLB rather than transfer stale normals.
 used=sorted(set(int(x)for x in attrs['JOINTS_0'].reshape(-1)));vgs={j:obj.vertex_groups.new(name='joint_'+str(j))for j in used}
 for vi,(js,ws)in enumerate(zip(attrs['JOINTS_0'],attrs['WEIGHTS_0'])):
  accum={}
  for j,w in zip(js,ws):
   if w>0:accum[int(j)]=accum.get(int(j),0)+float(w)
  for j,w in accum.items():vgs[j].add([vi],w,'REPLACE')
 print('weights assigned',flush=True)
 mod=obj.modifiers.new('GGD independent native-motion-preserving LOD','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);print('decimated',flush=True)
 m=obj.data;m.calc_loop_triangles();normals=m.corner_normals;uv=m.uv_layers.active;verts=[];nr=[];uvs=[];js=[];ws=[];ids=[];lookup={};maxDropped=0.;maxInfluences=0;zeroCornerNormals=0
 groups={v.index:int(v.name.removeprefix('joint_'))for v in obj.vertex_groups}
 for tri in m.loop_triangles:
  for li in tri.loops:
   vi=m.loops[li].vertex_index;v=m.vertices[vi];tex=tuple(uv.data[li].uv);normal=tuple(normals[li].vector)
   if np.linalg.norm(normal)<1e-8:
    zeroCornerNormals+=1;normal=tuple(tri.normal)
    if np.linalg.norm(normal)<1e-8:normal=(0.,1.,0.)
   key=(vi,tex,normal)
   if key not in lookup:
    influences=sorted([(groups[x.group],float(x.weight))for x in v.groups if x.weight>0],key=lambda x:-x[1]);maxInfluences=max(maxInfluences,len(influences));assert influences
    maxDropped=max(maxDropped,sum(w for _,w in influences[4:]));influences=influences[:4];total=sum(w for _,w in influences);j=[a for a,_ in influences];w=[a/total for _,a in influences];j+=[0]*(4-len(j));w+=[0]*(4-len(w))
    lookup[key]=len(verts);verts.append(tuple(v.co));nr.append(normal);uvs.append(tex);js.append(j);ws.append(w)
   ids.append(lookup[key])
 result={}
 for key,array,kind,comp in [('POSITION',verts,'VEC3',5126),('NORMAL',nr,'VEC3',5126),('TEXCOORD_0',uvs,'VEC2',5126),('JOINTS_0',js,'VEC4',5123),('WEIGHTS_0',ws,'VEC4',5126)]:
  a=np.asarray(array)
  if key=='NORMAL':length=np.linalg.norm(a,axis=1);assert np.min(length)>1e-8;a=a/length[:,None]
  result[key]=h.add_accessor(g,b,a,kind,comp,bounds=key=='POSITION',target=34962)
 output.append({**p,'attributes':result,'indices':h.add_accessor(g,b,ids,'SCALAR',5125,target=34963)})
 proof.append({'primitive':pi,'sourceTriangles':len(indices),'outputTriangles':len(ids)//3,'sourceVertices':len(attrs['POSITION']),'outputVertices':len(verts),'maximumInterpolatedBoneInfluences':maxInfluences,'maximumDiscardedWeightWhenRetainingFourInfluences':maxDropped,'zeroCornerNormalsGivenFaceOrUpFallback':zeroCornerNormals})
 obj.select_set(False)
g['meshes'][0]['primitives']=output
assert beforeDoc['nodes']==g['nodes'] and beforeDoc['skins']==g['skins'] and beforeDoc['animations']==g['animations']
for anim in g['animations']:
 for s in anim['samplers']:
  for k in ['input','output']:assert np.array_equal(h.accessor(beforeDoc,beforeBin,s[k]),h.accessor(g,b,s[k]))
dest=out/'body.glb';h.write_glb(g,b,dest)
r={'schema':'ggd-native-motion-preserving-geometry-lod@1','source':str(src),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'output':str(dest),'outputSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'tool':'bpy '+bpy.app.version_string,'method':'Construct only source GLB primitive geometry in Blender, collapse decimate with vertex groups and UVs; append new geometry to original GLB. No glTF roundtrip, skeleton or animation export.','beforeTriangles':before,'afterTriangles':sum(p['outputTriangles']for p in proof),'targetTriangles':target,'ratio':ratio,'geometry':proof,'nodeHierarchyJointIdsInverseBindsMaterialsAndNativeAnimationArraysUnchanged':True,'allNativeSamplerBytesUnchanged':True,'limitations':['Derived LOD changes topology and surface detail; full source geometry retained separately.','Interpolated influences limited to 4 with discarded weight measured per primitive.','Animated deformation and appearance require rendered acceptance; not claimed byte-identical geometry.']}
(out/'lod.receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True)
