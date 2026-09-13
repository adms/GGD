import json,sys,copy,hashlib,importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('glb','/private/tmp/ggd-procedural-six-state.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-shinchan-canonical-20260910');out=root/'budget-static-v1';out.mkdir(exist_ok=False)
for variant in ['sd2','kstamil']:
 src=root/'optimized-v3'/variant/'atlas-static.glb';old,ob=m.read_glb(src);data=json.loads((root/'decimated-v2'/(variant+'-mesh.json')).read_text());skin=old['skins'][0];nodes=copy.deepcopy(old['nodes'][:98]);g=dict(asset=old['asset'],scene=0,scenes=[dict(nodes=[0,98])],nodes=nodes+[dict(name='Shinchan_'+variant,mesh=0,skin=0)],skins=[copy.deepcopy(skin)],meshes=[],materials=old['materials'],textures=[dict(source=0,sampler=0)],samplers=old['samplers'],images=[],extras=old['extras']);b=bytearray()
 ibm=m.accessor(old,ob,skin['inverseBindMatrices']);g['skins'][0]['inverseBindMatrices']=m.add_accessor(g,b,ibm,'MAT4');names={n['name']:i for i,n in enumerate(nodes)};n=len(data['positions']);j=np.zeros((n,8),dtype=np.uint16);w=np.zeros((n,8),dtype=float)
 for i,entries in enumerate(data['weights']):
  assert entries and len(entries)<=8
  for k,(name,value) in enumerate(entries):j[i,k]=names[name];w[i,k]=value
  w[i]/=w[i].sum()
 attrs={'POSITION':m.add_accessor(g,b,data['positions'],'VEC3',bounds=True,target=34962),'NORMAL':m.add_accessor(g,b,data['normals'],'VEC3',target=34962),'TEXCOORD_0':m.add_accessor(g,b,data['uv'],'VEC2',target=34962),'JOINTS_0':m.add_accessor(g,b,j[:,:4],'VEC4',5123,target=34962),'WEIGHTS_0':m.add_accessor(g,b,w[:,:4],'VEC4',target=34962),'JOINTS_1':m.add_accessor(g,b,j[:,4:],'VEC4',5123,target=34962),'WEIGHTS_1':m.add_accessor(g,b,w[:,4:],'VEC4',target=34962)};ai=m.add_accessor(g,b,np.array(data['indices']).reshape(-1,1),'SCALAR',5123,target=34963);g['meshes']=[dict(name='Shinchan_'+variant,primitives=[dict(attributes=attrs,indices=ai,material=0,mode=4)])]
 png=(root/'optimized-v3'/variant/'atlas.png').read_bytes()
 while len(b)%4:b.append(0)
 vi=len(g['bufferViews']);g['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=len(png)));b.extend(png);g['images']=[dict(name='Shinchan_'+variant+'_atlas',mimeType='image/png',bufferView=vi)];g['extras']['budgetOptimization']=dict(trianglesBefore=58752,trianglesAfter=data['trianglesAfter'],meshCountBefore=9,meshCountAfter=1,allPostDecimationWeightsPreserved=True,maxInfluences=7,nativeAnimationCount=0);dest=out/(variant+'.glb');sha=m.write_glb(g,b,dest)
 print(json.dumps(dict(variant=variant,path=str(dest),sha256=sha,vertices=n,triangles=data['trianglesAfter'],maxInfluences=int(np.max((w>0).sum(1))),weightedBones=len(set(j[w>0].tolist())))))
