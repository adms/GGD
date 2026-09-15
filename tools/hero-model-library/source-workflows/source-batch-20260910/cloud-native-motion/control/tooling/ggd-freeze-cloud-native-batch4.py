from pathlib import Path
import datetime, hashlib, json, shutil
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/psp-cloud-native-motion-batch4')
assert not (ROOT/'control/handoff.json').exists(), 'Already frozen'
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ref(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
m=json.loads((ROOT/'motion-index.json').read_text());v=json.loads((ROOT/'analysis/khronos-validation-unlimited.json').read_text());cpu=json.loads((ROOT/'analysis/raw-key-and-cpu-playback-verification.json').read_text());uv=json.loads((ROOT/'analysis/source-uv-and-texture-proof.json').read_text());rig=json.loads((ROOT/'analysis/bone-scope-and-bind-pose.json').read_text())
assert v['options']['maxIssues']==0 and not v['report']['issues']['truncated']
assert v['report']['issues']['numErrors']==v['report']['issues']['numWarnings']==0
assert v['report']['info']['animationCount']==13
assert cpu['status']==uv['status']=='pass' and cpu['modelSha256']==uv['modelSha256']==sha(ROOT/m['model']['path'])
assert all(x['notSinglePose'] for x in cpu['clips'])
tools=['ggd-convert-cloud-native-motions.py','ggd-validate-cloud-native.cjs','ggd-check-cloud-native-playback.py','ggd-verify-cloud-source-uv.py','ggd-freeze-cloud-native-batch4.py']
for name in tools:shutil.copyfile(Path('/private/tmp')/name,ROOT/'control/tooling'/name)

preview_review={'reviewedAt':stamp,'reviewedImage':ref(ROOT/'preview/cloud-native-contact-sheet.png'),'method':'Assistant visually inspected actual textured mesh CPU reference renders at four times for native_000A, native_006A and native_101A.','observations':['Corrected preview shows Cloud with dark clothing, blond hair, face and sword texture placement coherent with source PNG.','native_101A shows changing sword/arm poses; native_006A shows substantial movement through the frame.','The small idle-like changes in native_000A are quantified by CPU vertex displacement; no action label assigned from this preview.'],'limitations':['Three clips visually inspected; all thirteen checked numerically at five sample times.','CPU reference renderer is not original game footage, original game shader behavior or a GGD backend test.','Texture orientation fix is corroborated by all 5,643 original SMD triangle corners; other prior-batch GLBs were not re-reviewed.']}
put(ROOT/'analysis/visual-review.json',preview_review)
gaps={'target':'Native PSP GMO motion conversion on the matching Cloud model','convertedClips':13,'fullTrsChannelCoverageClips':11,'partialCoverageClips':[{'clip':x['name'],'omissions':x['unconvertedChannels']} for x in m['clips'] if x['unconvertedChannels']],'remaining':['Original semantic action names unknown; retain native clip IDs.','Core glTF does not encode native FrameLoop subranges; caller should use indexed loopRangeSeconds.','GMO half-float quaternion keys normalized to standard unit quaternions; maximum component correction 0.0005593319625442073, originals retained.','SMD coordinates are 255 times native GMO translations; no metric-scale normalization done.','Original-game actual playback speed and GGD backend playback not independently tested.','One visibility and three unused-target channels remain raw, not attached.','Fate/unlimited codes PSP native FPK/GMO/material/animation/VFX/SFX/voice gap still open; this is an independent PSP reference sample.'],'fateSourceResearchThisBatch':'No new downloads or new FUC source attempts during this bounded motion-conversion task. Prior public tool/source leads and blocked routes remain in prior batch reports; no blocked route retried.','newDownloads':0,'executedDownloadedPrograms':False,'activeProcesses':[]}
put(ROOT/'control/gaps.json',gaps)
source={'schema':'ggd.source-manifest.intake@1','sourceId':'github-neztypezero-psp-gmo-loader-f346daec','derivativeBatchId':'psp-cloud-native-motion-batch4','localRoot':str(ROOT),'sourceUrl':'https://github.com/neztypezero/PSP-GMO-Loader','author':'neztypezero','sourceCommit':'f346daeca824aff9740cd8e41719d88a06133dda','sourcePlatform':'PSP','sourceGame':'unknown','sourceGameHint':'Dissidia Final Fantasy series inferred from author filenames; exact game/version not independently established.','sourceArchiveReceipt':str(ROOT.parent/'fate-unlimited-codes-native-format-batch3/gmoloader/acquisition.json'),'priorCompleteArchiveSha256':'723f8ee9f2b9f042b1ba194cd224fe2965229e6f92c8f4a08b01ad16dba86da5','nativeGmo':ref(ROOT/'original/cloud.gmo'),'matchingSmd':ref(ROOT/'original/cloud-source/cloud.smd'),'priorGlb':ref(ROOT/'original/cloud-smd-bind-pose.glb'),'acquisitionStatus':'reused-frozen-local-source-no-redownload','fucNativeGapClosed':False,'readiness':'converted-native-animation-candidate-cpu-verified','frozenAt':stamp,'licenseStatus':'Public author source preserved; redistribution permission not inferred.'}
put(ROOT/'source-manifest.json',source)
candidate={'candidateId':'psp-gmo-cloud-native-13-motions-batch4','sourceId':source['sourceId'],'character':'Cloud / 克勞德','sourceLabel':'cloud','heroIds':[],'sourcePlatform':'PSP','sourceGame':'unknown','sourceClass':'native-format-reference','model':m['model'],'nativeSource':source['nativeGmo'],'motionIndex':ref(ROOT/'motion-index.json'),'motionCount':13,'singleKeyBindPoseCount':0,'nativeToMatchedSmdTranslationScale':255,'sourceBoneCount':60,'weightedSkinJointCount':44,'matchEvidence':ref(ROOT/'analysis/bone-scope-and-bind-pose.json'),'cpuPlaybackVerified':True,'schemaValidated':True,'runtimeReady':False,'backendVerified':False,'defaultChanged':False,'readiness':'standard-glb-native-animation-candidate','channelCoverage':{'converted':1846,'source':1850,'unconverted':4},'metadata':{'metricScale':'unknown','sourceFps':30,'playbackRate':1,'semanticLabels':'native IDs only','visualIdentity':'Cloud appearance consistent; heroId mapping pending central workflow'}}
put(ROOT/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(ROOT),'candidates':[candidate]})
put(ROOT/'audioFileIndex.json',{'schema':'ggd.audio-file-index.intake@1','localRoot':str(ROOT),'sourceId':source['sourceId'],'files':[],'audioGroups':[],'fileCount':0,'totalSeconds':0,'status':'no-audio-in-source'})

rows=['| Clip | 原始幀域 | 原始循環幀域 | 完整時長 s | TRS 通道／原始通道 |','| --- | --- | --- | ---: | ---: |']
for x in m['clips']:rows.append(f"| {x['name']} | {x['sourceFrameDomain'][0]:g}–{x['sourceFrameDomain'][1]:g} | {x['sourceFrameLoop'][0]:g}–{x['sourceFrameLoop'][1]:g} | {x['durationSeconds']:.6f} | {x['convertedTrsChannels']}／{x['sourceChannels']} |")
readme='''# PSP Cloud：13 段原生 Motion 轉換交付

整合入口是 control/handoff.json；模型入口是 candidate-manifest.json。這批重用前批已凍結作者原檔，不重下載、不覆寫前批、不改中央預設。它是 PSP 原生格式儲備，不能當作 Fate/unlimited codes 原生素材已取得。

converted/cloud-native-13-motions.glb 含原有貼圖／蒙皮模型及 13 段真正由 GMO Motion / FCurve 轉出的標準 glTF 動畫；已移除舊的 SMD 單幀 bind pose animation。骨名、父階層及綁定姿勢均核對：60 個 GMO 骨節與 60 個 SMD 節點相符，44 個節點實際承載 skin weights。SMD 平移等於 GMO × 255；最大平移殘差 4.88e-5 SMD 單位、四元數最大分量差 3.80e-6，未宣称原生值等同米。

每段原始 Motion 都有 FrameRate (0xB2) float32 = 30.0，索引保留區塊偏移和原始 bytes。時間換算是 (frame − timeOriginFrame) / 30；不能把 FrameLoop 當作完整鍵域。例如 _001A 前 25 幀、_009A 前 50 幀仍保留；_101A 的 −6 幀前導經位移後匯出，完整長度 3.2 秒。playbackRate 預設 1，可依整合端設定；未觀察原遊戲引擎實际速度。

'''+ '\n'.join(rows)+'''

_003A 的 3 個 0xffffffff 目標沒有可綁骨節；_010A 的 1 條 visibility 不是 glTF 核心 TRS 通道。四條均連同所有 1,386 條曲線及 20,970 個原始鍵完整保留在 raw/motions/；逐段索引記錄覆蓋率與缺口。原始 GMO、SMD、所有來源 PNG、舊 GLB 和格式參考原碼都在 original/。

驗證有三層：Khronos glTF Validator maxIssues=0 的完整結果為 0 errors、0 warnings、truncated=false；獨立 glTF 解碼器核對 21,438 次來源鍵引用及 19,592 個區間中點；13 段各取 5 幀 CPU skinning，全部有限值且有真實位移。共享曲線可被多個通道引用，因此引用次數大於 20,970 個原始鍵。這是 CPU 參考播放驗證，尚非 GGD 後台或原遊戲 E2E。

實際渲染發現舊 Assimp 匯出把本作者 SMD 的 UV 上下翻轉，本批已還原來源 UV，5,643 個三角形角點與原始 SMD 全核對，最大 UV 差 1.29e-7；4 個嵌入 PNG 仍逐位元組相同。preview/cloud-native-contact-sheet.png 是實際模型在不同時間點的參考渲染，3 段經視覺核對；其餘 10 段已做數值播放檢查。這項修正僅在新批，前批檔案不變。

原始單位、動作語意、Loop 設定、原遊戲視覺比對、未轉 visibility 通道和 GGD 後台驗證仍需後續處理；runtimeReady=false。無本批語音、音效或 VFX。公開取得不代表已確認再散布授權。

全部工具保留於 control/tooling/，使用本機既有 numpy、Pillow、Khronos Validator。腳本固定對應本批路徑，含凍結檢查；後續轉換須新建資料夾，不可在本批直接重跑。逐檔入口 files.sha256.json。
'''
(ROOT/'README.md').write_text(readme)
handoff={'schema':'ggd.intake-handoff@1','batchId':'psp-cloud-native-motion-batch4','localRoot':str(ROOT),'status':'frozen-native-motion-conversion-candidate','frozenAt':stamp,'source':ref(ROOT/'source-manifest.json'),'candidateManifest':ref(ROOT/'candidate-manifest.json'),'motionIndex':ref(ROOT/'motion-index.json'),'audioFileIndex':ref(ROOT/'audioFileIndex.json'),'model':m['model'],'validation':{'khronos':ref(ROOT/'analysis/khronos-validation-unlimited.json'),'cpuPlayback':ref(ROOT/'analysis/raw-key-and-cpu-playback-verification.json'),'sourceUvTexture':ref(ROOT/'analysis/source-uv-and-texture-proof.json'),'boneScope':ref(ROOT/'analysis/bone-scope-and-bind-pose.json'),'visualReview':ref(ROOT/'analysis/visual-review.json')},'preview':ref(ROOT/'preview/cloud-native-contact-sheet.png'),'gaps':ref(ROOT/'control/gaps.json'),'totals':{'newDownloads':0,'models':1,'nativeMotionClips':13,'convertedTrsChannels':1846,'originalChannels':1850,'rawCurves':1386,'rawKeys':20970,'rawKeyReferencesVerified':21438,'interiorSamplesVerified':19592,'cpuSkinnedFrames':65,'originalGmoBonesMatched':60,'weightedSkinJoints':44,'sourceTriangleCornersVerified':5643,'audioFiles':0,'fucNativePackages':0},'runtimeReady':False,'originalGameTested':False,'centralIndexChanged':False,'gitChanged':False,'s3Changed':False,'defaultChanged':False,'activeDownloads':[]}
put(ROOT/'control/handoff.json',handoff)
files=[ref(p) for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='files.sha256.json']
assert all(not p.is_symlink() for p in ROOT.rglob('*'))
manifest={'schema':'ggd.file-manifest.intake@1','localRoot':str(ROOT),'frozenAt':stamp,'files':files,'fileCount':len(files),'totalBytes':sum(x['bytes'] for x in files),'excludes':['files.sha256.json']}
put(ROOT/'files.sha256.json',manifest)
for item in files:
 p=ROOT/item['path'];assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],str(p)
report={**handoff,'handoffPath':str(ROOT/'control/handoff.json'),'handoffSha256':sha(ROOT/'control/handoff.json'),'fileManifest':ref(ROOT/'files.sha256.json'),'postFreezeReadback':{'status':'pass','filesVerified':len(files)}}
put(Path('/private/tmp/ggd-psp-cloud-native-batch4-report.json'),report)
print(json.dumps({'handoffPath':report['handoffPath'],'handoffSha256':report['handoffSha256'],'filesVerified':len(files),'fileManifestSha256':sha(ROOT/'files.sha256.json'),'model':m['model']},ensure_ascii=False,indent=2))
