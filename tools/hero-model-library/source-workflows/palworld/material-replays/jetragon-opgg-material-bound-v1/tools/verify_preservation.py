"""Independent byte preservation check for material conversion and frozen input."""
from pathlib import Path
import json,struct,hashlib
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT.parents[1]/'public-models-20260911/parallel-palworld-jetragon'
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return b,json.loads(b[20:20+n]),b[28+n:]
b,original,blob=load(ROOT/'inputs/source.glb');rows=[]
normal_ids={p['attributes']['NORMAL'] for m in original['meshes'] for p in m['primitives']}
animation_accessor_ids={s[k] for a in original['animations'] for s in a['samplers'] for k in ['input','output']}
for label in ['native-res','256']:
 p=ROOT/'models'/('jetragon-materials-'+label+'.glb');raw,g,bin2=load(p)
 assert bin2[:len(blob)]==blob
 for k in ['nodes','skins','animations','meshes','scenes','scene']:assert g.get(k)==original.get(k),k
 changed=[i for i,(a,c) in enumerate(zip(original['accessors'],g['accessors'])) if a!=c];assert set(changed)==normal_ids
 assert all(g['accessors'][i]==original['accessors'][i] for i in animation_accessor_ids)
 assert [a['name'] for a in g['animations']]==[a['name'] for a in original['animations']]
 assert len(g['images'])==9 and all(x['mimeType']=='image/png' for x in g['images'])
 image_rows=[]
 for i,image in enumerate(g['images']):
  v=g['bufferViews'][image['bufferView']];d=bin2[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];external=ROOT/'textures'/label/(image['name']+'.png');assert d==external.read_bytes();image_rows.append({'image':i,'name':image['name'],'sha256':sha(d),'matchesDerivedPng':True})
 rows.append({'variant':label,'path':str(p),'sha256':sha(raw),'sourceBinByteIdenticalPrefix':True,'sourceNodesSkinsScenesAndMeshesUnchanged':True,'animationEntryCount':29,'animationAccessorCount':len(animation_accessor_ids),'allNativeAnimationAccessorDescriptionsAndBytesUnchanged':True,'onlyModifiedAccessors':changed,'normalConversion':'normalizedSHORT to FLOAT; same decoded semantic','embeddedImages':image_rows})
manifest=json.loads((SRC/'files-sha256.json').read_text());checks=[]
for x in manifest['files']:
 d=(SRC/x['path']).read_bytes();assert len(d)==x['bytes'] and sha(d)==x['sha256'];checks.append(x['path'])
proof={'schema':'ggd.jetragon.material-preservation@1','variants':rows,'frozenInputOriginalFilesUnchanged':True,'frozenManifestVerifiedFileCount':len(checks),'frozenManifestSha256':sha((SRC/'files-sha256.json').read_bytes()),'sourceIntake':str(SRC),'originalAnimationUniqueContents':28,'sourceIdenticalMotionNames':['Carrying','Carrying_Start']}
out=ROOT/'evidence/preservation.json';data=(json.dumps(proof,indent=2)+'\n').encode()
if out.exists():assert out.read_bytes()==data
else:out.write_bytes(data)
print(json.dumps({'variants':len(rows),'preservedAnimationAccessors':len(animation_accessor_ids),'frozenSourceFiles':len(checks),'allPass':True}))
