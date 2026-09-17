"""Decode stored meshopt accessors with installed Blender code, never asset scripts.
Material shader binding is intentionally pending; source textures stay unchanged.
"""
from pathlib import Path
import sys,json,hashlib,struct,copy
import bpy,numpy as np
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
sys.path.insert(0,str(Path(bpy.__file__).parent/'5.2/scripts/addons_core'))
from io_scene_gltf2.io.imp.gltf2_io_gltf import glTFImporter
from io_scene_gltf2.io.imp.gltf2_io_binary import BinaryData
root=Path(__file__).resolve().parents[1];source=root/'original/model.glb';b=source.read_bytes()
loader=glTFImporter(str(source),{'import_user_extensions':[]});loader.read();loader.checks()
n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);cache={}
def acc(i):
 if i not in cache:
  x=BinaryData.decode_accessor(loader,i);assert np.isfinite(x).all();cache[i]=x
 return cache[i]
meshes=[]
for mi,m in enumerate(g['meshes']):
 for pi,p in enumerate(m['primitives']):
  pos=acc(p['attributes']['POSITION']);ind=acc(p['indices']);assert ind.min()>=0 and ind.max()<len(pos)
  weights=acc(p['attributes']['WEIGHTS_0']);joints=acc(p['attributes']['JOINTS_0'])
  meshes.append({'mesh':mi,'primitive':pi,'name':m.get('name'),'vertices':len(pos),'triangles':len(ind)//3,'positionMin':pos.min(axis=0).tolist(),'positionMax':pos.max(axis=0).tolist(),'maxWeightSumError':float(np.max(np.abs(weights.sum(axis=1)-1))),'jointIndexRange':[int(joints.min()),int(joints.max())]})
clips=[]
for a in g['animations']:
 rows=[]
 for c in a['channels']:
  s=a['samplers'][c['sampler']];t=acc(s['input']);v=acc(s['output']);assert len(t)==len(v) and np.all(np.diff(t[:,0])>=0)
  delta=float(np.max(np.abs(v-v[0])))
  rows.append({'node':c['target']['node'],'path':c['target']['path'],'samples':len(t),'start':float(t.min()),'end':float(t.max()),'maxValueDelta':delta,'timeSha256':hashlib.sha256(t.tobytes()).hexdigest(),'valuesSha256':hashlib.sha256(v.tobytes()).hexdigest()})
 clips.append({'name':a['name'],'durationSeconds':max(r['end'] for r in rows)-min(r['start'] for r in rows),'channels':len(rows),'varyingChannels':sum(r['maxValueDelta']>1e-7 for r in rows),'targets':len({r['node'] for r in rows}),'tracks':rows,'provenance':'source-supplied game-named clip; original Unreal animation container not acquired','procedural':False})
# Preserve all view bytes after codec decompression; do not resample/retarget.
new=copy.deepcopy(g);blob=bytearray()
for i,v in enumerate(new['bufferViews']):
 data=bytes(BinaryData.get_buffer_view(loader,i));assert len(data)==v['byteLength']
 blob.extend(b'\0'*((-len(blob))%4));v['buffer']=0;v['byteOffset']=len(blob);blob.extend(data)
 if 'extensions' in v:
  v['extensions'].pop('EXT_meshopt_compression',None);v['extensions'].pop('KHR_meshopt_compression',None)
  if not v['extensions']:v.pop('extensions')
new['buffers']=[{'byteLength':len(blob)}]
for k in ['extensionsUsed','extensionsRequired']:
 new[k]=[x for x in new.get(k,[]) if x not in ['EXT_meshopt_compression','KHR_meshopt_compression']]
 if not new[k]:new.pop(k)
j=json.dumps(new,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob.extend(b'\0'*((-len(blob))%4))
out=root/'decoded/cattiva-meshopt-decoded.glb';out.parent.mkdir(exist_ok=True);payload=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob
assert not out.exists() or out.read_bytes()==payload;out.write_bytes(payload)
mat=json.loads((root/'original/materials.json').read_text());assert mat['animations']==[a['name'] for a in g['animations']]
report={'schema':'ggd.cattiva.opgg.static-analysis@1','sourcePath':str(source),'sourceBytes':len(b),'sourceSha256':hashlib.sha256(b).hexdigest(),'asset':g['asset'],'meshes':meshes,'meshCount':len(g['meshes']),'skinCount':len(g['skins']),'uniqueJointNodes':len({i for s in g['skins'] for i in s['joints']}),'animationCount':len(clips),'sourceManifestMatchesClipNames':True,'animations':clips,'sumClipDurations':sum(c['durationSeconds'] for c in clips),'sourceTextureCount':len({v for x in mat['materials'].values() for k,v in x.items() if k.endswith('Texture') and isinstance(v,str)}),'imageCountInSourceGlb':len(g.get('images',[])),'nativeAudioCount':0,'vfxCount':0,'decodedModel':{'path':str(out),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'method':'meshopt view decompression only; same geometry accessor bytes/rig/animation values; no retarget/resampling'},'readiness':'pending-material-binding-and-GGD-standardization','limitations':['Original model.glb has no images. All five source material images and material parameters preserved separately; no claim this raw body is textured in GGD.','Source shader subsurface/clearcoat render profile is not fully translated.','33 stored game-named clips verified with decoded samples; raw Unreal animation files not acquired.','No new procedural animation. No original Wwise bank or VFX in this model source.']}
(root/'analysis/static-analysis.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'meshCount':report['meshCount'],'jointCount':report['uniqueJointNodes'],'animations':[{k:c[k] for k in ['name','durationSeconds','varyingChannels']} for c in clips],'decoded':report['decodedModel']},indent=2))
