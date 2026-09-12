#!/usr/bin/env python3
import hashlib,json,shutil,zipfile
from pathlib import Path
root=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/sinbad-baal-runtime-option-20260910')
original=root.parent/'tmr-sinbad-baal'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x') as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
for p in ['/private/tmp/ggd-sinbad-world-pose-check.mjs',__file__]:shutil.copy2(p,root/'tools'/Path(p).name)
copied=[]
for p in sorted(original.rglob('*')):
 if p.is_file():
  q=root/'original'/p.relative_to(original);assert q.is_file() and sha(q)==sha(p)
  copied.append({'source':str(p),'copy':q.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
put(root/'control/original-retention-verification.json',{'schema':'ggd-source-copy-verification@1','sourceRoot':str(original),'allOriginalFilesCopiedByteExact':True,'files':copied})
receipt=json.loads((root/'runtime-v3/receipt.json').read_text());model=receipt['document'];motion=json.loads((root/'runtime-v3/motion.json').read_text());validator=json.loads((root/'runtime-v3/khronos-unlimited.json').read_text());render=json.loads((root/'control/render-v3b/render-proof.json').read_text());comp=json.loads((root/'control/rest-world-comparison.json').read_text());acq=json.loads((root/'original/acquisition.json').read_text())
assert validator['issues']['numErrors']==0 and validator['issues']['numWarnings']==0 and not validator['issues']['truncated']
assert not motion['stationaryClips'] and len(render['shots'])==12 and comp['passed']
assert all(t['ready'] for t in render['textures'])
source={'schema':'ggd-source-manifest@1','sourceId':'tmr-sinbad-baal','platform':'Nintendo 3DS','game':'Magi: Aratanaru Sekai','targetHeroIds':['b2-sinbad'],'character':'Sinbad','form':'Baal Djinn Equip','authorOrUploader':'Ozci','sourcePageUrl':acq['page'],'downloadUrl':acq['url'],'sourceArchive':{'path':'original/source.zip','bytes':(root/'original/source.zip').stat().st_size,'sha256':sha(root/'original/source.zip'),'zipCRC':'passed'},'acquisitionThisBatch':'none; existing verified local source reused','nativeAssetEvidence':{'sourceFile':'original/extracted/Magi_AS_character_SinbadBaalDjinnEquip_DAE/Magi_AS_character_SinbadBaalDjinnEquip_DAE.dae','sourceFilenameExplicitlyNamesBaalDjinnEquip':True,'visualFormCheck':'Existing source preview and new runtime renders show blue armored Sinbad with headpiece, sword, waist cloth and long tail. No base-form substitution asserted.','retainedPngFiles':6,'embeddedReferencedPngFiles':5,'weightedJoints':48,'nativeAnimationClips':0,'nativeAudioFiles':0,'nativeVfxFiles':0},'ownerDecision':'Parent reports explicit owner acceptance of Baal Djinn as Sinbad shared normal model; no central default changed by this agent.','licenseStatus':'Existing source attribution retained; no new license grant inferred.'}
put(root/'source-manifest.json',source)
candidate={'candidateId':'tmr-sinbad-baal-procedural-six-state-v1','sourceId':'tmr-sinbad-baal','heroIds':['b2-sinbad'],'displayName':'辛巴達｜巴力魔裝（3DS 原作模型＋GGD 程序化六態）','identityMatch':'same character, Baal Djinn Equip form','form':'Baal Djinn Equip','ownerAcceptedAsNormalModel':True,'defaultChangePerformed':False,'modelSourceCategory':'original-game-extracted-model','animationSourceCategory':'ggd-procedural-fallback','nativeAnimationCount':0,'generatedAnimationCount':6,'runtimeModelId':model['id'],'glbPath':'runtime-v3/body.glb','modelDocumentPath':'runtime-v3/model.json','preparationReceiptPath':'procedural-v3/preparation.receipt.json','runtimeReceiptPath':'runtime-v3/receipt.json','uploadedModelPath':'runtime-v3/uploaded-model.json','clipMap':model['clipMap'],'clips':receipt['preparation']['clipDetails'],'readiness':{'sourceAcquired':True,'modelConverted':True,'standardRuntimeContractVerified':True,'runtimeMotionSampled':True,'textureRendered':True,'visualBasicInspection':'six gestures visibly distinct; source form/materials intact, no missing body parts seen in the inspected front samples','fullVisualQualityAcceptance':'pending','backendSelectionVerified':False,'deployed':False},'limits':{'triangles':3674,'vertices':3185,'drawPrimitives':5,'weightedJoints':48,'maximumClipChannels':12,'largestTextureEdge':512},'preservation':{'originalCopyRoot':'original','allOriginalFilesByteExact':True,'allSixPngRetained':True,'originalAndCompactedRestVertexWorldPositionsMaxError':0.0},'materialAdaptation':['Unsupported source KHR_materials_ior IOR1 converted to supported zero-specular material; original materials preserved separately.','Unused KHR_materials_volume / FB_ngon_encoding declarations removed.','Shared finalizer made opaque image 3 alpha fully opaque; original RGB unchanged and original PNG retained.'],'gaps':['No source native animations, VFX, SFX or voice in this package.','Procedural run has no source root-motion or foot-contact guarantee; death has no collision/grounding guarantee.','Six states are general fallback gestures, not Sinbad game attack choreography.','Source long-tail geometry and source head angle retained; full animation aesthetics and in-game framing remain pending.','Backend option publication and default selection belong to root integration.']}
put(root/'candidate-manifest.json',{'schema':'ggd-candidate-manifest@1','localRoot':str(root),'candidates':[candidate]})
put(root/'audio-file-index.json',{'schema':'ggd-audio-file-index@1','localRoot':str(root),'sourceId':'tmr-sinbad-baal','files':[],'audioGroups':[],'status':'no audio in retained source package; no generated or inferred voice'})
put(root/'control/validation-summary.json',{'schema':'ggd-sinbad-validation@1','sharedPrepareVerify':True,'khronos':{'version':validator.get('validatorVersion'),'errors':0,'warnings':0,'infos':validator['issues']['numInfos'],'truncated':False,'path':'runtime-v3/khronos-unlimited.json'},'runtimeMotion':{'babylonVersion':'7.54.3','rows':motion['rows'],'stationaryClips':[],'method':motion['method'],'positionUnits':'source model units, not metres'},'restGeometry':comp,'render':{'path':'control/render-v3b/render-proof.json','shots':12,'allTexturesReady':True,'inspectedImages':['ggd-procedural-idle-start.png','ggd-procedural-run-middle.png','ggd-procedural-attack-middle.png','ggd-procedural-cast-middle.png','ggd-procedural-hurt-middle.png','ggd-procedural-death-middle.png'],'observation':'Blue armor/headpiece/sword/cloth/tail and textured body visible in all states; moving limb and body poses distinguish all six. Full polish and game interaction are pending.'},'preparationHistory':[{'directory':'procedural-v1','status':'not runtime candidate','reason':'original Assimp material extensions outside upload subset'},{'directory':'procedural-v2','status':'not runtime candidate','reason':'unused Assimp extension declarations outside upload subset'},{'directory':'procedural-v3','status':'final selected procedural preparation'},{'directory':'runtime-v3','status':'only final runtime candidate'}],'processSafety':'No game or mod executable, acquisition, AWS, Git mutation or central file edit performed.'})
notes='''# 辛巴達・巴力魔裝：獨立模型交付

唯一待整合選項在 `runtime-v3/`：`body.glb`、`model.json`、`uploaded-model.json`、`receipt.json`。角色 `b2-sinbad`；此包確實是巴力魔裝形態。Owner 已接受此形態當一般模型；本工作流沒有自行更改中央預設。

來源：Ozci 分享的 Nintendo 3DS《Magi: Aratanaru Sekai》Sinbad Baal Djinn Equip。來源 ZIP、DAE、全部 6 PNG、早期轉換与來源收據已逐檔複製到 `original/`，SHA 完全相同；未新增下載。

原包沒有動作、音效、語音或 VFX。最終的 idle/run/attack/cast/hurt/death 是 **GGD 程序化替補**，並非原作動作或重定向動作。時間以秒自訂；30 Hz 是生成取樣率，不是來源遊戲 FPS。骨架映射、各段參數与所有中間版本保留。

3,674 三角面、3,185 頂點、48 加權關節。完全同材質的 primitive 合併，14 → 5；原來 5 張使用中的貼圖保留原解析度，第 6 張 unused PNG 仍在原件。上傳適配移除了不支援的 IOR1，使用零 specular；共享 finalizer 只把一張 opaque 材質 PNG 的 alpha 修為不透明，原 RGB 不變。

通過真實 shared prepare/verify；Khronos 完整檢查 0 error、0 warning、26 info（空的原 renderer 節點），未截斷。Babylon 48 骨 CPU 蒙皮檢查：六段都產生實際位移。來源、合併版、final rest pose 的頂點世界位置一致。另有 12 張 WebGL 圖與全貼圖載入證據。

原作招式、腳底接地、死亡碰撞、完整視覺品質、後台選單和實戰仍待驗收。程序化動作僅提供可運作的通用替補，不把這些缺口宣稱已補。

其他工作流可直接用本機絕對 `localRoot` 加 manifest 內相對路徑。先讀 `candidate-manifest.json`；`audio-file-index.json` 是空清單，不能當成有語音。`procedural-v1/v2` 僅歷程，不可發布為選項。

本包不修改中央索引、Git、S3 或任何預設。成品與控制資料交 root 按使用者規則整合；原件／中間料保留本機並歸 S3。
'''
(root/'README.md').write_text(notes)
handoff={'schema':'ggd-sinbad-baal-handoff@1','frozen':True,'localRoot':str(root),'sourceId':'tmr-sinbad-baal','candidateId':candidate['candidateId'],'heroIds':['b2-sinbad'],'sourceManifest':'source-manifest.json','candidateManifest':'candidate-manifest.json','audioFileIndex':'audio-file-index.json','fileManifest':'file-manifest.json','runtimeRoot':'runtime-v3','model':{'id':model['id'],'path':'runtime-v3/body.glb','bytes':(root/'runtime-v3/body.glb').stat().st_size,'sha256':sha(root/'runtime-v3/body.glb')},'validation':'control/validation-summary.json','nativeMotion':False,'proceduralFallbackClips':6,'centralChangesPerformed':False,'nextAction':'Root adds candidate model option, preserves prior choices, and handles owner-approved Sinbad default; no additional download needed.'}
put(root/'control/handoff.json',handoff)
files=[]
for p in sorted(root.rglob('*')):
 if p.is_file():files.append({'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
put(root/'file-manifest.json',{'schema':'ggd-file-manifest@1','localRoot':str(root),'files':files,'fileCount':len(files),'bytes':sum(r['bytes'] for r in files),'excludes':['file-manifest.json'],'immutable':True})
for row in files:
 p=root/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256']
report={**handoff,'handoffSha256':sha(root/'control/handoff.json'),'fileManifestSha256':sha(root/'file-manifest.json'),'verifiedFilesExcludingFileManifest':len(files),'totalFilesIncludingFileManifest':len(files)+1,'verifiedBytesExcludingFileManifest':sum(r['bytes'] for r in files),'sharedHelperPath':str(root/'tools/ggd-procedural-six-state.py'),'sharedHelperSha256':sha(root/'tools/ggd-procedural-six-state.py')}
put(Path('/private/tmp/ggd-sinbad-baal-runtime-option-report.json'),report)
print(json.dumps(report,ensure_ascii=False,indent=2))
