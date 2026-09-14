#!/usr/bin/env python3
import hashlib,importlib.util,json,shutil
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('h','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=W/'outputs/priority-ou99-standards-v2-20260910'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
read=lambda p:json.loads(p.read_text())
allrows=read(R/'backend-validation-manifest.json')['models'];by={x['modelKey']:x for x in allrows};by.update({x['modelKey']:x for x in read(R/'backend-validation-budget-v3.json')['models']})
controls={x['originalModelKey']:x for x in read(W/'outputs/priority-ou99-standards-20260910/manifest.json')};rows=[];proof=[]
for row in by.values():
 assert row['status']=='backend-prepare-passed';d=Path(row['directory']);runtime=Path(row['runtime']);g,b=h.read_glb(d/'original/bounds-v1.glb');o,z=h.read_glb(runtime/'body.glb');doc=read(runtime/'model.json');std=read(d/'control/standardization.json')
 assert g['nodes']==o['nodes']
 for s,t in zip(g['skins'],o['skins']):
  assert {k:v for k,v in s.items()if k!='inverseBindMatrices'}=={k:v for k,v in t.items()if k!='inverseBindMatrices'}
  assert np.array_equal(h.accessor(g,b,s['inverseBindMatrices']),h.accessor(o,z,t['inverseBindMatrices']))
 clips=[]
 for a in o['animations']:
  source=next(v for v in g['animations']if v['name']==a['name']);assert len(source['channels'])==len(a['channels']);changed=0
  for c1,c2 in zip(source['channels'],a['channels']):
   assert c1['target']==c2['target'];s=source['samplers'][c1['sampler']];t=a['samplers'][c2['sampler']];assert s.get('interpolation','LINEAR')==t.get('interpolation','LINEAR')
   for k in ['input','output']:assert np.array_equal(h.accessor(g,b,s[k]),h.accessor(o,z,t[k]))
  clips.append({'name':a['name'],'channels':len(a['channels']),'allFinalSamplerBytesAndTargetsEqualSource':True})
 assert set(doc['clipMap'].values())=={a['name']for a in o['animations']}
 def images(j,raw):
  return [hashlib.sha256(bytes(raw[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).hexdigest()for im in j.get('images',[])for v in [j['bufferViews'][im['bufferView']]]]
 sourceImages=images(g,b);finalImages=images(o,z);textureLod=row['originalModelKey']=='ou99.472112';geometryLod=row['originalModelKey']=='ou99.497211'
 if not textureLod:assert finalImages[:len(sourceImages)]==sourceImages
 p={'modelKey':row['modelKey'],'finalGlbSha256':sha(runtime/'body.glb'),'nodeHierarchyAndInverseBindMatricesUnchanged':True,'nativeMotion':clips,'allOriginalEmbeddedImageBytesRetainedInFinal':not textureLod,'originalImageSha256':sourceImages,'finalImageSha256':finalImages,'geometryLod':geometryLod,'textureLod':textureLod}
 put(runtime/'final-source-preservation.json',p);proof.append(p)
 c=controls[row['originalModelKey']];native=read(d/'control/source.json').get('nativeZip');motion=read(runtime/'native-motion-equivalence.json')
 record={'sourceId':row['sourceId'],'heroId':row['heroId'],'runtimeHeroId':row['runtimeHeroId'],'originalModelKey':row['originalModelKey'],'sourceGlbPath':c['sourceGlbPath'],'sourceSha256':c['sourceSha256'],'boundsControlSha256':c['sha256'],'modelKey':row['modelKey'],'sha256':sha(runtime/'body.glb'),'bytes':(runtime/'body.glb').stat().st_size,'runtime':str(runtime),'glb':str(runtime/'body.glb'),'modelDocument':str(runtime/'model.json'),'modelDocumentSha256':sha(runtime/'model.json'),'receipt':str(runtime/'receipt.json'),'backendPrepareReceipt':str(runtime/'backend-prepare-receipt.json'),'sourcePreservationReceipt':str(runtime/'final-source-preservation.json'),'status':'backend-prepare-passed','clipMap':doc['clipMap'],'clips':row['clips'],'metrics':row['metrics'],'validator':row['validator'],'warnings':row['warnings'],'nativeAnimationChannelsTargetsAndTimeValuesUnchanged':True,'binaryUnchanged':False,'fullNativeGlbPreserved':str(d/'original/source.glb'),'nativeZipPreserved':str(d/'original/source.zip')if native else None,'geometryLod':geometryLod,'textureLod':textureLod,'atlas':std['atlas'],'runtimeMotionValidation':{'status':motion['status'],'maximumError':motion['maximumError'],'method':motion['method']},'visualAcceptance':'pending; render transparency sorting/atlas mip and LOD details separately','centralWritesPerformed':False}
 rows.append(record)
assert len(rows)==22
for p in ['/private/tmp/ggd-ou99-native-preserving-lod.py',__file__]:shutil.copy2(p,R/'tools'/Path(p).name)
put(R/'final-source-preservation-manifest.json',{'schema':'ggd-final-source-preservation@1','models':proof})
put(R/'manifest.json',rows)
sourceCount=sum(1 for r in rows if r['nativeZipPreserved']);totalBytes=sum(r['bytes']for r in rows)
notes=f'''# OU99 22 件後台模型標準化交付

唯一入口：`manifest.json`。每列包含完整 sourceId、heroId、originalModelKey、modelKey、runtime、glb、modelDocument、SHA 和實際後台準備收據。root 可用這 22 列替換對應 workflow-standardization 的 locator，再複製 model.json 與 body.glb；其他 11 件已過 OU99 和 7 件 LoL 不在本次改動。

22/22 通過目前正式程式的 `inspectModelUpload`、budget、`prepareUploadedHeroModel`、`verifyUploadedHeroModel`，以及 **實際 `ModelVersions.prepare`**。後者在 `backend-prepare-content*` 中複製當前英雄與舊版本，僅呼叫 prepare，未呼叫 writeArtifacts；中央內容、後台、Git、S3、預設完全未改。所有最終 GLB 都經 Khronos maxIssues=0，0 errors、0 warnings、未截斷。

保留原完整 GLB、bounds v1 控制版、來源 model.json 與 {sourceCount} 個現有 native ZIP 副本；原來源動作完整留在原 GLB。runtime 只保留原本六態 clipMap 實際引用的具名原生段，沒有重採樣、刪除動作通道、移動時間或生成替代動作。這些是既有 OU99/W3X 模型包動作，不宣稱是目標角色原作招式。最終 binary 的每個動作 sample、target、interpolation、骨架階層和 IBM 均比對原件通過。

一般處理：僅修正非單位法線、合併渲染設定相同的 primitives；保留 W3X filterMode/blend/alpha/doubleSided。三件需要完整像素的原解析度圖集：458777、473324、491448；原 PNG 全部留在 final GLB，另加 atlas；每張像素直接複製，16px repeat gutter，base-level RGBA 取樣最大誤差 6.53e-6。合併透明材質會改變 per-primitive depth sort 粒度，圖集低 mip 邊界仍待完整視覺驗收。

兩件為明確衍生 LOD：497211 58,410→25,995 面，僅在 Blender 建幾何與 vertex groups後折疊，直接把新幾何貼回原 GLB，未做 glTF骨架／動畫roundtrip。源關節ID、IBM與82通道完全保留；最大頂點影響數3，沒有截掉骨骼權重，2個零法線corner使用面／向上替補。472112 原2048×2048保留原件，runtime用LANCZOS1024×1024，細節與alpha邊緣改變。

21件的六態×兩時點，Babylon CPU skin 世界座標與原件精確對應，最大差0。497211 LOD的12姿勢外框與原模型最大差0.002507個來源單位；其幾何改動不能稱為逐頂點相同。所有視覺、透明排序、LOD細節和遊戲內體驗仍待完整驗收。

22成品 GLB共 {totalBytes:,} bytes；詳細警戒（面數/貼圖/draw）留在manifest。最高每段333channels僅高於300警戒，低於Owner指定500上限。早期 backend-validation-manifest 的兩個 blocked已由 backend-validation-budget-v3修復；一律以manifest.json最終locator為準。
'''
(R/'README.md').write_text(notes)
handoff={'schema':'ggd-ou99-standardization-handoff@2','frozen':True,'localRoot':str(R),'manifest':str(R/'manifest.json'),'manifestSha256':sha(R/'manifest.json'),'count':22,'backendPreparePassed':22,'modelBytes':totalBytes,'originalZipCopies':sourceCount,'centralWrites':False,'runtimePaths':'20 rows use runtime/; 497211 and 472112 use runtime-budget-v3/; use exact manifest runtime paths','limitations':['Visual transparency sort, atlas mip and two LOD details need separate renderer review.','Native OU99 model motion is preserved; target character canonical choreography is not inferred.']}
put(R/'handoff.json',handoff)
files=[]
for p in sorted(R.rglob('*')):
 if p.is_file():files.append({'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
put(R/'file-manifest.json',{'schema':'ggd-file-manifest@1','localRoot':str(R),'files':files,'fileCount':len(files),'bytes':sum(x['bytes']for x in files),'excludes':['file-manifest.json'],'immutable':True})
for x in files:
 p=R/x['path'];assert p.stat().st_size==x['bytes']and sha(p)==x['sha256']
report={**handoff,'handoffSha256':sha(R/'handoff.json'),'fileManifestSha256':sha(R/'file-manifest.json'),'filesIncludingFileManifest':len(files)+1,'allFilesVerified':True}
put(Path('/private/tmp/ggd-ou99-standards-v2-final-report.json'),report);print(json.dumps(report,ensure_ascii=False,indent=2))
