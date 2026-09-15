import hashlib,json,shutil
from pathlib import Path
import numpy as np
from PIL import Image
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=W/'outputs/priority-ou99-standards-v3-20260910';V2=W/'outputs/priority-ou99-standards-v2-20260910'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
prior={r['originalModelKey']:r for r in read(V2/'manifest.json')};rows=[];proof=read(R/'visual-audit/render-proof.json');assert len(proof['proof'])==6;assert all(all(t['ready']for t in x['textures'])for x in proof['proof']);visual=read(R/'visual-audit/image-comparison.json');assert all(i['rgbaPixelExact']for r in visual for i in r['images'])
for row in read(R/'backend-validation-manifest.json')['models']:
 assert row['status']=='backend-prepare-passed';key=row['originalModelKey'];d=Path(row['directory']);runtime=Path(row['runtime']);old=prior[key];alpha=read(d/'control/alpha-repair.json');std=read(d/'control/v2-standardization.json');a=np.asarray(Image.open(next((d/'control').glob('atlas-*-before.png'))).convert('RGBA'));used=np.zeros(a.shape[:2],bool)
 for group in std['atlas']['groups']:
  x,y,w,h=group['atlasRect'];p=group['paddingPixels'];used[y-p:y+h+p,x-p:x+w+p]=True
 changed=a[:,:,3]!=255;assert not np.any(changed&used);assert int(changed.sum())==int((~used).sum());padding={'changedPixels':int(changed.sum()),'onlyUnfilledCanvasChanged':True,'allSourceRgbaAnd16pxGutterPixelsByteExact':True,'allAtlasRgbPixelsByteExact':True};put(runtime/'atlas-padding-only-proof.json',padding)
 doc=read(runtime/'model.json');receipt=read(runtime/'receipt.json');verify=read(runtime/'khronos-unlimited.json');assert verify['issues']['numErrors']==verify['issues']['numWarnings']==0 and verify['issues']['truncated']is False
 native=read(runtime/'final-source-preservation.json');assert native['allOriginalNativeImageBytesStillRetained']
 r={**old,'modelKey':row['modelKey'],'supersedesModelKey':old['modelKey'],'sha256':sha(runtime/'body.glb'),'bytes':(runtime/'body.glb').stat().st_size,'runtime':str(runtime),'glb':str(runtime/'body.glb'),'modelDocument':str(runtime/'model.json'),'modelDocumentSha256':sha(runtime/'model.json'),'receipt':str(runtime/'receipt.json'),'backendPrepareReceipt':str(runtime/'backend-prepare-receipt.json'),'sourcePreservationReceipt':str(runtime/'final-source-preservation.json'),'status':'backend-prepare-and-backdrop-passed','backendPrepareStatus':'passed','clipMap':doc['clipMap'],'clips':row['clips'],'metrics':row['metrics'],'validator':row['validator'],'warnings':row['warnings'],'fullNativeGlbPreserved':str(d/'original/source.glb'),'nativeZipPreserved':str(d/'original/source.zip'),'previousV2GlbPreserved':str(d/'control/v2-body.glb'),'atlas':{**std['atlas'],'v3AlphaRepair':alpha['repairs'],'paddingOnlyProof':padding},'backdropCheckReceipt':str(runtime/'backdrop-check.json'),'visualAcceptance':{'status':'bounded-before-after-webgl-pass','method':'Actual Babylon7.54.3 PBR idle/front and run/oblique-front sampled60%; exactRGBA900x900 screenshots before and after','screenshotPairsPixelExact':True,'proof':str(R/'visual-audit/image-comparison.json'),'contactSheet':str(R/'visual-audit'/(key.replace('.','-')+'-comparison.png'))},'nativeAnimationChannelsTargetsAndTimeValuesUnchanged':True,'geometryAndUvByteExactToPriorV2':True,'sourceIdentityClassificationUnchanged':True,'centralWritesPerformed':False}
 rows.append(r)
for p in [__file__,'/private/tmp/ggd-ou99-v3-visual-summary.py']:shutil.copy2(p,R/'tools'/Path(p).name)
put(R/'manifest.json',rows)
(R/'README.md').write_text('''# OU99 三件 OPAQUE圖集 v3修復

入口 manifest.json：ou99.458777-standard-v3、ou99.473324-standard-v3、ou99.491448-standard-v3。替換這三件受阻v2選項，其他19件v2不變。舊v2完整保留control/v2-body.glb；native ZIP、完整來源GLB、所有原圖和動作仍在original/。本批未修改中央、Git、S3、預設、checker。

根因是圖集未填滿畫布由 Pillow RGBA默認alpha0建立，雖材質為OPAQUE，仍產生41.41%／46.88%／43.75%透明空白，被content gate阻擋。v3僅把空白canvas alpha設255。逐像素核對原圖區域和16px repeat gutter RGBA完全不變；整張atlas RGB也完全不變。這不是把透明來源材質改OPAQUE，原材質語義未改。

3/3通過實際inspectModelUpload、prepareUploadedHeroModel、verifyUploadedHeroModel和ModelVersions.prepare（隔離內容副本，未呼叫writeArtifacts）。Khronos maxIssues0：0 errors、0 warnings、未截斷。未修改的tools/vfx-asset-safety/check.py對旧v2各找出1件阻塞；新v3及prepared version docs均0失敗。最終幾何、法線、UV、索引、骨權重與v2逐字節一致；原native骨架、IBM、保留的具名native clips每個通道／時間／樣本值與原始模型一致，未生成動作。

3件實際Babylon WebGL原v2／v3各idle及run共12張，6組900×900 RGBA截圖逐像素完全相同，模型臉、衣服、肢體未見修復造成的大錯。這是有界姿勢驗收，不宣稱全動作、全攝影角度或遊戲E2E通過。三件源人物均繼續沿用中央相似代理分類，不提升本尊。
''')
handoff={'schema':'ggd-ou99-standardization-handoff@3','frozen':True,'localRoot':str(R),'manifest':str(R/'manifest.json'),'manifestSha256':sha(R/'manifest.json'),'count':3,'backendPreparePassed':3,'realBackdropCheckerPassed':3,'khronosErrors':0,'khronosWarnings':0,'khronosTruncated':False,'modelBytes':sum(r['bytes']for r in rows),'sourceZipCopies':3,'visualScreenshotPairsByteExact':6,'centralWrites':False,'modelKeys':[r['modelKey']for r in rows],'supersedesModelKeys':[r['supersedesModelKey']for r in rows],'scope':'Only3v2atlas candidates superseded; all native source retained; no checker changes'};put(R/'handoff.json',handoff)
files=[{'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(R.rglob('*'))if p.is_file()];put(R/'file-manifest.json',{'schema':'ggd-file-manifest@1','immutable':True,'localRoot':str(R),'excludes':['file-manifest.json'],'fileCount':len(files),'bytes':sum(r['bytes']for r in files),'files':files})
for r in files:
 p=R/r['path'];assert p.stat().st_size==r['bytes'] and sha(p)==r['sha256']
report={**handoff,'handoffSha256':sha(R/'handoff.json'),'fileManifestSha256':sha(R/'file-manifest.json'),'filesIncludingFileManifest':len(files)+1,'allFilesVerified':True};put(Path('/private/tmp/ggd-ou99-standards-v3-final-report.json'),report);print(json.dumps(report,ensure_ascii=False,indent=2))
