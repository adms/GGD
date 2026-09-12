#!/usr/bin/env python3
import copy,hashlib,importlib.util,io,json,shutil,sys
from pathlib import Path
import numpy as np
from PIL import Image
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=W/'outputs/priority-ou99-standards-v3-20260910';V2=W/'outputs/priority-ou99-standards-v2-20260910'
spec=importlib.util.spec_from_file_location('h','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
R.mkdir();(R/'tools').mkdir();shutil.copy2(__file__,R/'tools'/Path(__file__).name);shutil.copy2('/private/tmp/ggd-procedural-six-state.py',R/'tools/ggd-glb-io-helper.py')
rows=[]
for row in json.loads((V2/'manifest.json').read_text()):
 key=row['originalModelKey']
 if key not in ['ou99.458777','ou99.473324','ou99.491448']:continue
 d=R/key;d.mkdir();(d/'converted').mkdir();(d/'control').mkdir();shutil.copytree(V2/key/'original',d/'original')
 prior=Path(row['glb']);assert sha(prior)==row['sha256'];shutil.copy2(prior,d/'control/v2-body.glb');shutil.copy2(row['modelDocument'],d/'control/v2-model.json');shutil.copy2(V2/key/'control/standardization.json',d/'control/v2-standardization.json')
 g,b=h.read_glb(prior);og=copy.deepcopy(g);ob=bytes(b);fixes=[]
 for mi,m in enumerate(g['materials']):
  if not m.get('extras',{}).get('ggdAtlasSourceMaterials'):continue
  assert m.get('alphaMode','OPAQUE')=='OPAQUE'
  ii=g['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];im=g['images'][ii];bv=g['bufferViews'][im['bufferView']];raw=bytes(b[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]);a=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA')).copy();before=a.copy();changed=int(np.count_nonzero(a[:,:,3]!=255));a[:,:,3]=255
  assert np.array_equal(a[:,:,:3],before[:,:,:3]);buf=io.BytesIO();Image.fromarray(a).save(buf,format='PNG');png=buf.getvalue();(d/'control'/f'atlas-mat{mi}-before.png').write_bytes(raw);(d/'converted'/f'atlas-mat{mi}-opaque.png').write_bytes(png)
  while len(b)%4:b.append(0)
  vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(png)});b.extend(png);im['bufferView']=vi
  fixes.append({'materialIndex':mi,'imageIndex':ii,'alphaMode':'OPAQUE','size':[a.shape[1],a.shape[0]],'changedAlphaPixels':changed,'transparentAlphaBefore':int(np.count_nonzero(before[:,:,3]<=5)),'transparentAlphaAfter':0,'rgbAllPixelsByteExact':True,'beforePngSha256':hashlib.sha256(raw).hexdigest(),'afterPngSha256':hashlib.sha256(png).hexdigest(),'note':'Only atlas alpha normalized; original embedded images unchanged, including source native alpha.'})
 assert len(fixes)==1
 for k in ['meshes','nodes','skins','animations','accessors','materials','textures','scenes','scene']:assert g.get(k)==og.get(k)
 assert bytes(b[:len(ob)])==ob
 dest=d/'converted/body.glb';h.write_glb(g,b,dest)
 receipt={'schema':'ggd-opaque-atlas-alpha-repair@1','originalModelKey':key,'previousModelKey':row['modelKey'],'sourceGlb':str(prior),'sourceSha256':sha(prior),'outputGlb':str(dest),'outputSha256':sha(dest),'rootCause':"Pillow Image.new('RGBA', size) filled unused atlas canvas with alpha0 although merged material is OPAQUE; no used RGB changes needed.",'repairs':fixes,'geometryUvRigNativeMotionAndMaterialSettingsUnchanged':True,'oldBinaryPrefixByteExact':True,'fullSourceAndPriorCandidateRetained':True,'gateCodeChanged':False}
 put(d/'control/alpha-repair.json',receipt)
 doc=json.loads((d/'original/model.json').read_text());put(d/'converted/preparation.receipt.json',{'schema':'ggd-library-model-preparation@1','asset':row['sourceId'],'source':{'path':str(prior),'bytes':prior.stat().st_size,'sha256':sha(prior)},'output':{'path':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest)},'stateClips':doc['clipMap'],'yawOffsetDeg':doc.get('yawOffsetDeg',0),'nativeAnimation':True,'limitations':['Only OPAQUE atlas alpha normalized to255. Original native images and unused clips preserved in original/source.glb.'],'alphaRepairReceipt':str(d/'control/alpha-repair.json')})
 rows.append({**row,'sourceModelKey':key,'modelKey':key+'-standard-v3','directory':str(d),'runtime':str(d/'runtime'),'status':'conversion-ready'})
 print(key,fixes[0]['changedAlphaPixels'],flush=True)
put(R/'conversion-manifest.json',{'schema':'ggd-ou99-conversion-manifest@3','localRoot':str(R),'sourceCommit':json.loads((V2/'conversion-manifest.json').read_text())['sourceCommit'],'models':rows})
