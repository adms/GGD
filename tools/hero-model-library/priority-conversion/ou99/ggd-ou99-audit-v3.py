import hashlib,importlib.util,io,json,shutil
from pathlib import Path
import numpy as np
from PIL import Image
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=W/'outputs/priority-ou99-standards-v3-20260910';V2=W/'outputs/priority-ou99-standards-v2-20260910';REPO=W/'GGD-hero-model-options'
def mod(name,p):
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
h=mod('h','/private/tmp/ggd-procedural-six-state.py');check=mod('backdrop',REPO/'tools/vfx-asset-safety/check.py')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def same(a,b):assert np.array_equal(a,b)
def img(g,b,i):
 v=g['bufferViews'][g['images'][i]['bufferView']];return bytes(b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
rows=json.loads((R/'backend-validation-manifest.json').read_text())['models'];allproof=[];checks=[]
for row in rows:
 assert row['status']=='backend-prepare-passed';d=Path(row['directory']);runtime=Path(row['runtime']);old=d/'control/v2-body.glb';p=runtime/'body.glb';a,b=h.read_glb(old);g,z=h.read_glb(p);native,nb=h.read_glb(d/'original/source.glb')
 for k in ['nodes','materials','textures','scene','scenes']:assert a.get(k)==g.get(k)
 assert native['nodes']==g['nodes'];assert len(a['meshes'])==len(g['meshes'])
 for m,n in zip(a['meshes'],g['meshes']):
  assert len(m['primitives'])==len(n['primitives'])
  for u,v in zip(m['primitives'],n['primitives']):
   assert u['material']==v['material'] and u.get('mode',4)==v.get('mode',4);assert set(u['attributes'])==set(v['attributes']);same(h.accessor(a,b,u['indices']),h.accessor(g,z,v['indices']))
   for k in u['attributes']:same(h.accessor(a,b,u['attributes'][k]),h.accessor(g,z,v['attributes'][k]))
 for s,t in zip(native['skins'],g['skins']):
  assert {k:v for k,v in s.items()if k!='inverseBindMatrices'}=={k:v for k,v in t.items()if k!='inverseBindMatrices'};same(h.accessor(native,nb,s['inverseBindMatrices']),h.accessor(g,z,t['inverseBindMatrices']))
 clips=[]
 for aclip in g['animations']:
  source=next(v for v in native['animations']if v['name']==aclip['name']);assert len(source['channels'])==len(aclip['channels'])
  for c1,c2 in zip(source['channels'],aclip['channels']):
   assert c1['target']==c2['target'];s=source['samplers'][c1['sampler']];t=aclip['samplers'][c2['sampler']];assert s.get('interpolation','LINEAR')==t.get('interpolation','LINEAR')
   for k in ['input','output']:same(h.accessor(native,nb,s[k]),h.accessor(g,z,t[k]))
  clips.append({'name':aclip['name'],'channels':len(aclip['channels']),'targetsTimesValuesAndInterpolationByteExactToNative':True})
 assert len(a['images'])==len(g['images']);changed=[]
 for i in range(len(g['images'])):
  raw=img(a,b,i);new=img(g,z,i)
  if raw==new:continue
  im=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA'));now=np.asarray(Image.open(io.BytesIO(new)).convert('RGBA'));same(im[:,:,:3],now[:,:,:3]);assert np.all(now[:,:,3]==255);changed.append(i)
 assert len(changed)==1
 # Unmodified real checker; scope to exact isolated candidate files only.
 check.CONTENT=R/'backend-prepare-content';fails=check.check_model_doc(runtime/'model.json',set());assert not fails,fails
 controls=R/'backdrop-control-content';controls.mkdir(exist_ok=True);cd=json.loads((d/'control/v2-model.json').read_text());cd['glbPath']=str(old);put(controls/(row['originalModelKey']+'.json'),cd);before=check.check_model_doc(controls/(row['originalModelKey']+'.json'),set());assert len(before)==1 and 'MODEL_TEXTURE_BACKDROP'in before[0],before
 prepared=json.loads((runtime/'backend-prepare-receipt.json').read_text());versionchecks=[]
 for v in prepared['artifacts']:
  doc=v['document'];doc['glbPath']=str(p);vp=controls/(doc['id']+'.json');put(vp,doc);errs=check.check_model_doc(vp,set());assert not errs;versionchecks.append({'modelKey':doc['id'],'failures':errs,'note':'Prepared artifact SHA matches candidate; exact modeldoc with local absolute path for checker.'});assert v['sha256']==sha(p)
 cp={'modelKey':row['modelKey'],'checkerPath':str(REPO/'tools/vfx-asset-safety/check.py'),'checkerSha256':sha(REPO/'tools/vfx-asset-safety/check.py'),'checkerUnmodified':True,'beforeFailures':before,'afterFailures':fails,'versionArtifacts':versionchecks,'status':'passed'};put(runtime/'backdrop-check.json',cp);checks.append(cp)
 evidence={'schema':'ggd-opaque-atlas-final-proof@1','modelKey':row['modelKey'],'glbSha256':sha(p),'priorV2GlbSha256':sha(old),'allGeometryNormalsUvIndicesWeightsJointsByteExactToV2':True,'nodesSkinsAndIbmByteExactToNative':True,'nativeClips':clips,'allOriginalNativeImageBytesStillRetained':all(img(native,nb,i)==img(g,z,i)for i in range(len(native['images']))),'changedImageIndices':changed,'allAtlasRgbPixelsByteExactToV2':True,'onlyAtlasAlphaNormalized255':True,'backdropCheckerPassed':True,'actualModelVersionsPreparePassed':True};assert evidence['allOriginalNativeImageBytesStillRetained'];put(runtime/'final-source-preservation.json',evidence);allproof.append(evidence)
 print(row['modelKey'],'alpha-only proof + native samples + real backdrop checker passed',flush=True)
put(R/'final-source-preservation-manifest.json',{'schema':'ggd-final-source-preservation@1','models':allproof});put(R/'backdrop-check-manifest.json',{'schema':'ggd-backdrop-check-proof@1','models':checks});shutil.copy2(__file__,R/'tools'/Path(__file__).name)
