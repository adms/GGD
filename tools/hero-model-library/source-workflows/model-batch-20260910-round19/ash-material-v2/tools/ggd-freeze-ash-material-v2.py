import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import json,hashlib,datetime,shutil
root=Path(sys.argv[1]).resolve();old=root.parent/'kof-open3dlab-ash-xv'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(name,data):
 p=root/name
 with p.open('x') as f:f.write(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
assert not (root/'candidate-manifest.json').exists()
up=json.loads((old/'candidate-manifest.json').read_text());repair=json.loads((root/'analysis/material-repair-report.json').read_text());metrics=json.loads((root/'analysis/comparison-metrics.json').read_text());source=json.loads((root/'source-analysis.json').read_text())
assert sha(root/'original/Ash.blend')==sha(old/'original/Ash.blend')=='30e11c524fb8223fd421ecf3c2d832fff7a3671f6a38444f7ebed5adeb2cc746'
preservation=[]
for p in sorted((root/'native-textures').iterdir()):
 assert sha(p)==sha(old/'native-textures'/p.name)
 preservation.append(dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=sha(p),sourceUnchanged=True))
assert len(preservation)==15
for variant in ['left-hair','right-hair']:
 b=root/'baseline/v1'/variant;b.mkdir(parents=True);src=old/'converted'/variant/'body.glb';shutil.copy2(src,b/'body.glb');assert sha(src)==sha(b/'body.glb')
 for n in ['conversion.json','validation.json']:
  if (src.parent/n).exists():shutil.copy2(src.parent/n,b/n)
for d in ['tools','execution-logs']:(root/d).mkdir()
for name in ['ggd-ash-material-repair-v2.py','ggd-ash-render-comparison-v2.py','ggd-ash-material-probe-v2.py','ggd-ash-v2-geometry-probe.py','ggd-kof-glb-validate.py','ggd-freeze-ash-material-v2.py']:
 shutil.copy2(Path('/private/tmp')/name,root/'tools'/name)
for name in ['ggd-ash-comparison-left-v2.log','ggd-ash-comparison-right-v2.log','ggd-ash-v2-geometry-probe.log']:
 shutil.copy2(Path('/private/tmp')/name,root/'execution-logs'/name)
write('analysis/original-texture-preservation.json',dict(originalBlendSha256=sha(root/'original/Ash.blend'),originalPackedTextures=15,allOriginalTextureBytesPreserved=True,files=preservation))
write('analysis/superseded-probes/README.json',dict(status='superseded-not-authoritative',items=['baseline-pixel-audit-incorrect-power-not-for-use.json','../luminance-coefficients.json','../luminance-coefficients-initial-dithered.json'],reason='Initial POWER socket was misread (actual used exponent 2.0); synthetic low-sample EXR probe was noisy. Final material-repair-report.json uses actual active source shader and bundled OCIO matrix. Raw diagnostic evidence retained.'))
observations=[
 'Same-camera source/baseline/repaired renders for both hairstyle variants show the false white fringe emission removed; source fringe still naturally covers one side of the face.',
 'Boot bright white spots visible in v1 disappear in v2; pants roughness and lightmap response are closer to the native shader.',
 'Original base-color hair/boots alpha is 255 and exported pixel arrays match original source; no alpha-channel restoration, texture repainting or mesh editing was performed.',
 'Source-to-baseline evaluated-position maximum nearest distance is 7.63e-6 m; v2 preserves the complete old BIN prefix and geometry/skin/accessor/node JSON exactly.',
 'All eight controlled views have lower source masked RGB error in v2; this is comparison evidence only, not GGD runtime acceptance.'
]
gaps=[
 'Original reflection-vector TextureEnvironment additive emission is view-dependent and has no core glTF static UV texture equivalent; its source images and node graph are preserved, but this term is not reproduced in v2.',
 'Diffuse/lightmap multiplication and nonlinear roughness are sampled to 8-bit PNG; original source textures are unchanged. Filtering between texel centers is a finite-resolution approximation.',
 'Only source frame 1 and two camera directions plus face/boots detail views were compared. Dynamic deformation, retargeting, gameplay, performance and GGD backend selection remain unverified.',
 'Source Rigify controls and 3 single-frame pose actions remain in original blend; there are 0 original gameplay animation clips in either candidate.',
 'Maximum 5 vertex influences retained; target runtime compatibility must be accepted separately.'
]
review=dict(schema='ggd-model-visual-review@2',status='material-translation-repaired-runtime-review-pending',causesConfirmed=True,observations=observations,limitations=gaps,runtimeReady=False,backendSelectionVerified=False,deformationAccepted=False,originalGameplayAnimations=0,inspectedContactSheets=[x['path'] for x in metrics['contactSheets']],comparisons=metrics['metrics'],sourceGeometryEdited=False,originalTexturesEdited=False,sourceMaterialPortOnly=True)
write('visual-review.json',review)
candidates=[]
for item in up['candidates']:
 variant=item['variant'];v=json.loads((root/'converted'/variant/'glb-validation.json').read_text());r=next(x for x in repair['variants'] if x['variant']==variant);assert sha(root/item['model'])==v['sha256']==r['sha256'];assert not v['animations']
 c=dict(item);c.update(candidateId=item['candidateId']+'-material-v2',sourceId='kof-open3dlab-ash-xv-material-repair-v2',revisionOfCandidateId=item['candidateId'],revision=2,upstreamCandidateRetained=True,upstreamModelPath='baseline/v1/'+variant+'/body.glb',upstreamModelSha256=sha(root/'baseline/v1'/variant/'body.glb'),bytes=v['bytes'],sha256=v['sha256'],readyStage='standard-glb-candidate-material-repaired-runtime-review-pending',textureCount=len(v['embeddedImages']),manualVisualReview=review['status'],visualReviewPath='visual-review.json',runtimeReady=False,backendSelectionVerified=False,defaultChanged=False,limitations=gaps,materialRepairReport='analysis/material-repair-report.json',comparisonSheet='comparisons/'+variant+'-source-baseline-repair.png');candidates.append(c)
write('candidate-manifest.json',dict(schema='ggd.model-candidates.intake@1',localRoot=str(root),candidates=candidates))
readme='''# Ash Crimson — KOF XV 材質轉譯修訂 v2

本次交付包含左髮、右髮兩個 GLB 候選，修復舊版的材質轉譯錯誤；不更改角色預設、不取代或刪除舊候選。中央工作流可合併 `candidate-manifest.json`，並以 `deliveries/` 的不可變清單逐檔驗證。

| 用途 | 固定相對路徑 |
|---|---|
| 新版本候選與 SHA | `candidate-manifest.json` |
| 左／右髮 GLB | `converted/left-hair/body.glb`、`converted/right-hair/body.glb` |
| 同相機來源／舊版／修復版對照 | `comparisons/left-hair-source-baseline-repair.png`、`comparisons/right-hair-source-baseline-repair.png` |
| 原始 Ash.blend 與 15 張原始貼圖 | `original/`、`native-textures/` |
| 舊版 GLB 完整副本 | `baseline/v1/` |
| 生效節點、轉譯修正、誤差證據 | `analysis/native-materials.json`、`analysis/material-repair-report.json` |
| 外觀檢視與仍待驗收項目 | `visual-review.json` |
| 轉譯／渲染／驗證工具 | `tools/` |

已修正：來源 XPS Shader 的粗糙度 `1 − RGBToBW(Specular)^2`，舊 GLB 曾直接使用 Specular 綠通道；已恢復生效的 Diffuse × Lightmap 與 IOR 1.45；來源視角反射節點被錯誤匯出為常數白色自發光，現已移除這項錯譯。外套使用另一個直接連接的 Principled 材質，未套用其已斷線的 XPS 節點。

兩款 GLB 的幾何、骨架、權重、節點、UV 與原 BIN 內容均保留。頭髮透明度與原貼圖原本一致，沒有補畫透明度或改造髮型。24 張原生渲染與 2 張對照總圖實際產生，左右髮型各 4 組相同相機與燈光對比。

仍有限制：來源 Reflection-vector TextureEnvironment 是隨視角變化的加算效果，核心 glTF 無等價靜態 UV 貼圖；此項僅保留來源，不宣稱完整還原。衍生材質貼圖含 8-bit 取樣／濾波近似。尚未通過 GGD 後台選取、重定向、動態變形或效能驗收。

原作動作 0、此來源音訊 0；來源 3 個單幀 pose 不算動作库。原作者上傳頁標示的授權與來源 metadata 隨包保留，未另行驗證。這是已下載同一來源的修訂，不能算新增一名角色或新取得一份遊戲原包。

`analysis/superseded-probes/README.json` 明確標記早期粗糙度公式誤讀與有雜訊的合成 EXR 探測；它們只保留診斷過程，不可當最終參數。最終公式與實際使用的 socket 已在主報告更正。
'''
with (root/'README.md').open('x') as f:f.write(readme)
totals=dict(completeSourcePackages=1,newlyAcquiredSourcePackages=0,standardGlbCandidates=2,revisionCandidates=2,preservedBaselineGlbs=2,sourcePackedTextures=15,derivedMaterialTextures=6,sourceStaticPoseActions=3,gameplayAnimationClips=0,sourceAudioDatablocks=len(source['sounds']),backendReadyModels=0,appearanceParityAcceptedModels=0,actualRenderImages=24,comparisonSheets=2)
now=datetime.datetime.now(datetime.timezone.utc);cm=root/'candidate-manifest.json'
files=[dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(root.rglob('*')) if p.is_file() and 'deliveries' not in p.relative_to(root).parts]
delivery=dict(schema='ggd-immutable-local-model-delivery@1',createdAt=now.isoformat(),sourceId='kof-open3dlab-ash-xv-material-repair-v2',upstreamSourceId='kof-open3dlab-ash-xv',localRoot=str(root),deliveryFrozen=True,candidateManifest=dict(path='candidate-manifest.json',sha256=sha(cm)),candidates=candidates,files=files,allFiles=files,totals=totals,audioFileIndex=dict(files=[],actualAudioCount=0),sourceUrl=candidates[0]['sourceUrl'],author=candidates[0]['author'],channel='model-sharing-community-public-free-mirror',sourceLicense='Uploader-declared CC BY-NC-ND 4.0; license metadata unverified',defaultChanged=False,readinessGaps=gaps,notes=observations)
folder=root/'deliveries';folder.mkdir();p=folder/('local-model-delivery-'+now.strftime('%Y%m%dT%H%M%S%fZ')+'.json')
with p.open('x') as f:f.write(json.dumps(delivery,ensure_ascii=False,indent=2)+'\n')
for f in files:
 q=root/f['path'];assert q.stat().st_size==f['bytes'] and sha(q)==f['sha256']
receipt=dict(localRoot=str(root),manifestPath=str(p),manifestSha256=sha(p),candidateManifestPath=str(cm),candidateManifestSha256=sha(cm),verifiedFiles=len(files),verifiedBytes=sum(f['bytes'] for f in files),**totals)
out=Path('/private/tmp/ggd-kof-ash-material-v2-delivery-receipt.json')
with out.open('x') as f:f.write(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False,indent=2))
