from pathlib import Path
import collections, datetime, hashlib, json, shutil, struct

ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-native-format-batch3')
G=ROOT/'gmoloader'; P=ROOT/'piosgmo'; C=ROOT/'control'
assert not (C/'handoff.json').exists(), 'Batch is already frozen; do not overwrite'
C.mkdir(exist_ok=True); (C/'tooling').mkdir(exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ref(p,root): return {'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)}
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()

# Verify the FINAL, numerically canonicalized GLBs, not initial assimp output.
texture_proofs=[]; final_conversions=[]
for name in ['cloud','sephiroth','squall']:
    receipt=json.loads((G/'converted'/name/'conversion.json').read_text())
    f=G/receipt['model']; b=f.read_bytes()
    assert len(b)==receipt['bytes'] and sha(f)==receipt['sha256']
    magic,version,total,jlen,jtype=struct.unpack_from('<5I',b,0)
    assert (magic,version,total,jtype)==(0x46546c67,2,len(b),0x4e4f534a)
    doc=json.loads(b[20:20+jlen]); blen,btype=struct.unpack_from('<2I',b,20+jlen)
    assert btype==0x004e4942
    binary=b[28+jlen:28+jlen+blen]
    assert len(doc.get('images',[]))==len(receipt['embeddedTextureFiles'])
    for i,(im,src) in enumerate(zip(doc['images'],receipt['embeddedTextureFiles'])):
        assert 'uri' not in im and im['mimeType']=='image/png'
        bv=doc['bufferViews'][im['bufferView']]; assert bv['buffer']==0
        start=bv.get('byteOffset',0); end=start+bv['byteLength']; assert end<=len(binary)
        raw=binary[start:end]; expected=G/src['path']
        assert raw==expected.read_bytes() and hashlib.sha256(raw).hexdigest()==src['sha256']
        texture_proofs.append({'model':receipt['model'],'imageIndex':i,'sourceTexture':src['path'],'bytes':len(raw),'sha256':src['sha256'],'byteIdentity':'pass'})
    for animation in doc.get('animations',[]):
        assert animation['name']=='bind_pose_one_key'
        assert all(doc['accessors'][s['input']]['count']==1 for s in animation['samplers'])
    final_conversions.append(receipt)
put(G/'analysis/final-texture-byte-identity.json', {'verifiedAt':stamp,'status':'pass','files':texture_proofs})
put(G/'analysis/smd-conversions.json',final_conversions)
validator=json.loads((G/'analysis/khronos-validation.json').read_text())
assert len(validator['results'])==3
assert all(x['report']['issues']['numErrors']==x['report']['issues']['numWarnings']==0 for x in validator['results'])
probes=json.loads((G/'analysis/probe-summary.json').read_text())
summary=json.loads((G/'analysis/native-index-summary.json').read_text())
assert len(probes)==21 and all(x['status']=='pass' for x in probes)
totals={k:sum(x[k] for x in probes) for k in ['bones','motions','curves','keys']}
assert summary['nativeMotionRecords']==totals['motions']==258
assert summary['embeddedImagePayloads']==116

progress=json.loads((ROOT/'download-progress.json').read_text())
progress['retry'].pop('activeSession',None)
progress['retry'].update(terminalSession=39447,curlExit=0,status='complete',bytes=15252855)
progress.update(activeDownloads=[],status='complete-and-frozen',frozenAt=stamp)
put(ROOT/'download-progress.json',progress)

tools=['ggd-inspect-psp-gmo.py','ggd-index-native-gmo.py','ggd-convert-native-smd-samples.py','ggd-fix-native-smd-gltf.py','ggd-validate-native-smd.cjs','ggd-freeze-fuc-native-batch3.py']
for name in tools: shutil.copyfile(Path('/private/tmp')/name,C/'tooling'/name)

gmotext='''# PSP 原生格式儲備：PSP-GMO-Loader

此包是 neztypezero 公開作者倉庫固定版本的完整快照，並非 Fate/unlimited codes 原生素材包。21 個 GMO 的實際檔頭與作者專案均指向 PSP；檔名暗示 Dissidia Final Fantasy 系列，但確切作品版本與角色身分仍待人工核對，heroIds 保持空陣列。

候選入口是 candidate-manifest.json：19 個角色名稱候選、2 個場景，所有來源均保留；沒有改動中央預設或上架狀態。

- 完整原包及作者原檔：original/、extracted/；379 個 Git blob 全部驗證大小和 SHA-1，ZIP CRC 通過。
- 原生資料：21 GMO、2,142 個 Bone 區塊、258 個 Motion 區塊、32,891 條 FCurve、525,913 個鍵。native-motion-index.json 保存原檔路徑、區塊偏移、長度和 SHA-256；這些是原始動作資料，尚未驗證播放或轉成標準動畫。
- 貼圖：116 個內嵌 GIM 位元組原樣擷取至 native-extracted/textures/，native-texture-index.json 可查；尚未解碼成 PNG。作者另附的 PNG 原樣保留。
- GLB：converted/cloud、converted/sephiroth、converted/squall 是從作者另附的 SMD 轉換，含嵌入 PNG 和 skin；不能宣稱已完整轉換 GMO 骨架。Khronos 驗證皆為 0 errors / 0 warnings，9 個嵌入貼圖與原始 PNG 逐位元組一致。
- GLB 各有一個明確命名 bind_pose_one_key 的單幀參考姿勢，不是遊戲動作。保留原始 Assimp 輸出、數值正規化紀錄、驗證資訊與提示；權重和逆綁定矩陣只修正小於 1e-6 左右的浮點誤差。
- 本包沒有語音或音效，audioFileIndex.json 是明確的空索引。沒有經確認的 VFX 資產。

尺寸單位、視覺核對、原生/SMD 骨架等價性、動畫語意與播放、重定向、後台載入仍待處理；runtimeReady=false。公開取得不代表已證明再散布授權。完整來源及工具授權聲明保留，不自行補上授權。

此資料夾交付後凍結。請在新資料夾做後續轉換，勿覆寫本批證據。逐檔驗證入口：files.sha256.json。
'''
(G/'README.md').write_text(gmotext)
(P/'README.md').write_text('''# PiosGmoLibrary 格式參考工具

pionome 公開作者倉庫固定版本完整快照，15 個 Git blob 全部驗證大小和 SHA-1，ZIP CRC 通過。11 個 C# 原始碼提供 GMO 區塊、骨架、Motion / FCurve 的格式參考。此包没有遊戲模型、動畫檔或音訊，不能當作 Fate/unlimited codes 素材已取得。沒有執行作者程式。

未找到明確 LICENSE，不推定寬鬆授權。此資料夾凍結；所有原檔與來源收據保留，逐檔驗證入口是 files.sha256.json。
''')

validation={'verifiedAt':stamp,'archives':'ZIP CRC and all author Git blob sizes/SHA-1 pass','nativeGmo':{'fileCount':21,'structure':'bounded read-only parser passed','totals':totals,'animationReferenceBoundsChecks':95903,'playbackVerified':False},'nativeTextures':{'gimCount':116,'payloadBoundsAndSha256':'pass','pngDecoded':False},'standardGlb':{'count':3,'khronosErrors':0,'khronosWarnings':0,'retainedInfoAndHintMessages':True,'embeddedPngByteIdentityCount':len(texture_proofs),'gameAnimations':0,'singleKeyReferencePoses':3,'runtimeReady':False},'fucNativePackages':0,'audioFiles':0,'validatedVfxAssets':0}
put(G/'validation.json',validation)

sources=[]
for short,root,sourceid,author,url,commit in [
 ('gmoloader',G,'github-neztypezero-psp-gmo-loader-f346daec','neztypezero','https://github.com/neztypezero/PSP-GMO-Loader','f346daeca824aff9740cd8e41719d88a06133dda'),
 ('piosgmo',P,'github-pionome-piosgmolibrary-ff019de8','pionome','https://github.com/pionome/PiosGmoLibrary','ff019de81a424155561b16919a6fbaefe7f0c269')]:
    acquisition=json.loads((root/'acquisition.json').read_text())
    manifest={'schema':'ggd.source-manifest.intake@1','sourceId':sourceid,'localRoot':str(root),'author':author,'sourceUrl':url,'downloadUrl':url.replace('https://github.com/','https://codeload.github.com/')+'/zip/'+commit,'sourceCommit':commit,'sourcePlatform':'PSP' if short=='gmoloader' else 'tool-only','sourceGame':'unknown' if short=='gmoloader' else None,'status':'complete-local-frozen','acquisition':acquisition,'fucNativeGapClosed':False,'licenseStatus':'public-source-preserved-no-redistribution-permission-inferred','executedDownloadedPrograms':False,'frozenAt':stamp}
    if short=='gmoloader':
        manifest.update(candidateManifest=ref(root/'candidate-manifest.json',root),audioFileIndex=ref(root/'audioFileIndex.json',root),nativeMotionIndex=ref(root/'native-motion-index.json',root),nativeTextureIndex=ref(root/'native-texture-index.json',root),validation=ref(root/'validation.json',root))
    put(root/'source-manifest.json',manifest)
    files=[ref(p,root) for p in sorted(root.rglob('*')) if p.is_file() and p.name!='files.sha256.json']
    assert all(not p.is_symlink() for p in root.rglob('*'))
    put(root/'files.sha256.json',{'schema':'ggd.file-manifest.intake@1','localRoot':str(root),'frozenAt':stamp,'files':files,'fileCount':len(files),'totalBytes':sum(x['bytes'] for x in files),'excludes':['files.sha256.json']})
    sources.append({'sourceId':sourceid,'localRoot':str(root),'sourceManifest':ref(root/'source-manifest.json',root),'fileManifest':ref(root/'files.sha256.json',root),'acquisition':acquisition,'files':len(files)})

gaps={
 'target':'Fate/unlimited codes PSP original model/rig/all motion/VFX/SFX/voice library',
 'fucNativeModelPackagesAcquired':0,'fucNativeFpkSamplesAcquired':0,
 'fucNativeGapStatus':'open; independent PSP reference samples do not satisfy Fate asset acquisition',
 'formatPath':['FUC FPK PRS extraction tool was retained in first batch; only synthetic FPK cases validated, no actual FUC FPK sample acquired.','GMO bounded structural parser now validated against 21 actual public PSP samples; these samples are not identified as FUC.','Noesis author documentation describes FUC FPK/GMO and external TTD support; software not acquired or executed.','Native FUC model/texture/animation relationship and PSP versus PS2 layout still require an authorized actual FUC package.'],
 'blockedSources':[{'sourceUrl':'https://reshax.com/topic/806-pspwii-kamen-rider-chou-climax-heroes-mot/','downloadUrl':progress['blockedIndependentSample']['url'],'status':'HTTP-403-stopped','bytesAcquired':0,'notFuc':True,'notes':'Public discussion mixed PSP little-endian GMO and Wii big-endian MOT; does not prove compatible bones or FUC assets. No alternate endpoint tried.'}],
 'references':[{'sourceUrl':'https://www.richwhitehouse.com/noesis/nms/index.php?content=readme','status':'author-format-documentation-only; not installed/run'},{'sourceUrl':'https://github.com/ShrineFox/P4GMOdelConverter','status':'independent game-specific format tool lead only; not downloaded or FUC verified'}],
 'priorBlockedSources':'First and second batch reports retain prior 403/login/ROM-gated sources. None was retried through a bypass in this batch.',
 'runtimeGaps':['metric scale normalization','manual identity and appearance review','native GMO geometry conversion','native Motion semantic labels and playable conversion','SMD versus GMO skeleton equivalence','GGD backend load test','rights for redistribution'],
 'nextSafeAction':'Continue public author/forum FUC native package research or process a user-provided lawful local native sample; no ROM/DRM/paywall bypass.',
 'activeDownloads':[]}
put(C/'gaps-and-source-search.json',gaps)
(C/'README.md').write_text('''# Fate 原生素材搜尋第三批：凍結交付

本批真正完成兩個公開作者倉庫，保存原包、所有原檔、21 個 PSP 原生 GMO、258 個原生 Motion 記錄、116 個 GIM 與 3 個 GLB 候選。沒有本批新音訊。這是独立格式儲備，不能替代尚未取得的 Fate/unlimited codes PSP 原生素材。

handoff.json 是整合入口；各 source-manifest.json / files.sha256.json 是不可變來源及逐檔索引。所有路徑可由其他本機工作流立即讀取，無需等待 S3。下載已全部結束，原先逾時 partial 保留且不計入完整原包總量。

tooling 保存本批讀取、索引、轉換、浮點修復和驗證程式。腳本目前固定指向此次 intake；後續工作必須在新批次路徑副本執行，不得直接重跑覆寫凍結資料。ggd-inspect-psp-gmo.py 接受命令列來源與輸出參數。原生 GMO 格式解析依 PiosGmoLibrary 公開格式定義，並未使用或執行 Noesis。下載原件也未執行。

GLB 經既有 /usr/local/bin/assimp 6.0.0 轉換；Khronos glTF Validator 使用共享 repo 已有版本 2.0.0-dev.3.10。尚未具備完整遊戲動畫、米制尺寸或 GGD runtime 驗證。正式候選預設與中央 Git/S3 由主工作流整合。
''')
handoff={'schema':'ggd.intake-handoff@1','batchId':'fate-unlimited-codes-native-format-batch3','localRoot':str(ROOT),'status':'frozen-complete-independent-native-format-reserve','frozenAt':stamp,'sources':sources,'totals':{'completeArchives':2,'completeArchiveBytes':sum(s['acquisition']['bytes'] for s in sources),'verifiedAuthorGitBlobs':394,'nativeGmo':21,'nativeBoneChunks':totals['bones'],'nativeMotionRecords':totals['motions'],'fcurves':totals['curves'],'keys':totals['keys'],'gimTextures':116,'standardGlbCandidates':3,'standardGameAnimations':0,'characterLabelCandidates':19,'stageCandidates':2,'audioFiles':0,'voiceFiles':0,'fucNativePackages':0},'validation':validation,'gapReport':ref(C/'gaps-and-source-search.json',C),'firstBatchFpkToolPath':str(ROOT.parent/'fate-unlimited-codes-workflow-control-20260910/tooling/extract_fate_fpk.py'),'activeDownloads':[],'centralIndexChanged':False,'gitChanged':False,'s3Changed':False,'defaultChanged':False}
put(C/'handoff.json',handoff)
controlfiles=[ref(p,C) for p in sorted(C.rglob('*')) if p.is_file() and p.name!='files.sha256.json']
put(C/'files.sha256.json',{'schema':'ggd.file-manifest.intake@1','localRoot':str(C),'frozenAt':stamp,'files':controlfiles,'fileCount':len(controlfiles),'totalBytes':sum(x['bytes'] for x in controlfiles),'excludes':['files.sha256.json']})

# Full post-freeze readback, writing the result only outside the frozen intake.
count=0
for root in [G,P,C]:
    manifest=json.loads((root/'files.sha256.json').read_text())
    for f in manifest['files']:
        p=root/f['path']; assert p.is_file() and p.stat().st_size==f['bytes'] and sha(p)==f['sha256'],str(p)
        count+=1
report={**handoff,'handoffPath':str(C/'handoff.json'),'handoffSha256':sha(C/'handoff.json'),'controlFileManifest':ref(C/'files.sha256.json',C),'postFreezeReadback':{'filesVerified':count,'status':'pass'}}
put(Path('/private/tmp/ggd-fuc-native-batch3-report.json'),report)
print(json.dumps({'handoffPath':report['handoffPath'],'sha256':report['handoffSha256'],'filesVerified':count,'totals':handoff['totals']},ensure_ascii=False,indent=2))
