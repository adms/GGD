from pathlib import Path
import datetime,hashlib,json,shutil
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-texture-recovery-batch6');B=R.parent/'fate-unlimited-codes-source-audit-batch5';assert not (R/'control/handoff.json').exists()
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ref(p):return {'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':sha(p)}
a=json.loads((R/'acquisition.json').read_text());idx=json.loads((R/'texture-index.json').read_text());mapping=json.loads((R/'texture-mapping-audit.json').read_text())
assert a['completePackage'] and a['allGitBlobsVerified']==104 and len(idx['files'])==103
assert len(mapping['missingTargets'])==1 and mapping['missingTargets'][0]['target']=='main/inputtext.png'
a.update({'originalPackageIntegrity':'complete and matches pinned source tree','sourceConfigurationComplete':False,'missingSourceConfigTargets':mapping['missingTargets'],'newPlayableVfx':0,'characterTextureCaveat':'Original portrait texture atlases/fragments; not individually cropped finished hero icons.'})
put(R/'acquisition.json',a)
opts=json.loads((R/'resource-options.json').read_text());opts['options'][0].update({'runtimeReady':False,'sourceConfigurationComplete':False,'missingTargets':['main/inputtext.png'],'usage':'Texture reserve; use original mapping and review image regions before importing.'});put(R/'resource-options.json',opts)
put(R/'control/visual-inspection.json',{'status':'inspected-by-assistant','preview':ref(R/'preview/texture-contact-sheet.png'),'sampledPngFiles':21,'observation':'18 character-label samples are colored portrait atlas/fragments; three magic-circle samples are static interface graphics. No 3D geometry or animated behavior is represented.','limitations':'Only 21 images visually inspected; all 103 PNG files decoded programmatically. Character labels come from source filenames; no central hero mapping assigned.'})
oldFiles=json.loads((B/'files.sha256.json').read_text())['files']
for f in oldFiles:
 p=B/f['path'];assert p.stat().st_size==f['bytes'] and sha(p)==f['sha256']
partial=R/'Fate-UC-HD-c8c2d52b60856913d6d81ee0cba5533cc1a098a6.zip.partial'
assert sha(partial)=='87694b076c9ae951dec6435109a74e13f3d84805a11d2f57be409810216674c2'
put(R/'control/previous-batch-integrity.json',{'root':str(B),'manifestSha256':sha(B/'files.sha256.json'),'verifiedFileCount':len(oldFiles),'status':'all-existing-frozen-files-unchanged','copiedPartial':ref(partial),'partialReplaced':False})
for filename in ['ggd-fuc-batch6-freeze.py']:
 shutil.copyfile(Path('/private/tmp')/filename,R/'control/tooling'/filename)
(R/'README.md').write_text('''# Fate/unlimited codes PSP 貼圖補充：第六批完整取得

本批已凍結，請使用 source-file-manifest.json／texture-index.json 讀取本機材料，不直接覆寫。UdienZebeer/Fate-UC-HD 固定 commit c8c2d52b60856913d6d81ee0cba5533cc1a098a6 的完整原包已取得：104 個真實檔案，共 30,741,074 bytes；103 PNG、1 textures.ini。原 ZIP 為 30,560,970 bytes，SHA-256 57ba4a76de840b8c68a592218591dbe0962107f1fe02e05cd390a4d4b9c09450。

ZIP CRC、安全解包、104/104 大小與 Git blob SHA-1、103/103 PNG 解碼全部通過。原 PNG 是標準格式，維持原始位元組，不重壓縮。

| 可查詢類型 | 檔案數 | 範圍 |
| --- | ---: | --- |
| 角色肖像圖集／片段 | 71 | 18 個來源角色標籤；不是已裁好的完整英雄圖示 |
| 任務肖像 | 18 | 雜湊檔名保留，對應角色待核 |
| 商標 | 7 | 來源 PNG |
| 其他介面 | 4 | 箭頭、背景、邊框及光暈 |
| 靜態魔法陣 | 3 | PNG 介面圖，不是可播放原生 VFX |
| PPSSPP 設定 | 1 | 原始 textures.ini |

source-file-manifest.json 包含全部 104 檔的相對路徑、bytes、SHA-256、Git blob SHA-1。texture-index.json 保留尺寸、色彩模式、類型與來源角色標籤；heroIds 留空。resource-options.json 提供已取得的貼圖儲備選項。candidate-manifest.json 和 audioFileIndex.json 為空：沒有 mesh、骨架、動作、音效或語音，不可將此包列為可選 3D 模型或完整 Fate 原生素材庫。

來源設定共有 88 個 PNG 映射，其中 main/inputtext.png 未包含在固定版本原包。這是原包自身缺件，104 個已宣告檔案則全部取得。原設定保持不變；不得宣稱直接套用已驗收。部分肖像是圖集片段，需要配合原映射與區域裁切檢查。

同一 URL 不支援 Range（curl 33），本批以一次普通完整 GET 成功。前批 27,394,501-byte partial 與其本批副本皆保留；前批 34 個凍結檔案重新核對完全未改。

作者追查見 author-native-source-followup.json。master、初版與 patch-1 都只有貼圖；patch-1 額外的 P 是 1-byte 檔案。公開發佈項目為 0。PPSSPP 作者說明只提供角色肖像、商標及靜態魔法陣貼圖，沒有同版原生模型或動畫包。歷史下載失效與先前拒絕入口沒有重試；不同帳號之間不推定身分相同。Fate PSP 原生 FPK／GMO／骨架／動作／音訊缺口保留。

所有檔案供主工作流整合 Git/S3/盤點；本批未改中央、Git、S3 或預設。完整來源沒有 LICENSE，授權欄位維持未確認。preview/texture-contact-sheet.png 是檢視用預覽，原始 PNG 未修改。
''')
put(R/'source-manifest.json',{'schema':'ggd.source-manifest.intake@1','localRoot':str(R),'sources':[{'sourceId':a['sourceId'],'sourceUrl':a['sourceUrl'],'downloadUrl':a['downloadUrl'],'sourceAccount':a['sourceAccount'],'game':'Fate/unlimited codes','platform':'PSP','sourceClass':'community-texture-replacement','commit':a['commit'],'treeSha':a['treeSha'],'acquisitionStatus':'complete-verified-texture-package','archive':a['archive'],'fileManifest':'source-file-manifest.json','textureIndex':'texture-index.json','resourceOptions':'resource-options.json','candidateManifest':'candidate-manifest.json','audioFileIndex':'audioFileIndex.json','runtimeReady':False,'sourceConfigurationComplete':False,'licenseStatus':'unconfirmed','heroIds':[]}],'nativeFucAcquisitionCount':0})
handoff={'schema':'ggd.source-handoff@1','frozen':True,'frozenAt':now,'localRoot':str(R),'sourceId':a['sourceId'],'status':'complete-texture-reserve-verified','sourceManifest':'source-manifest.json','sourceFileManifest':'source-file-manifest.json','fileManifest':'files.sha256.json','textureIndex':'texture-index.json','resourceOptions':'resource-options.json','candidateManifest':'candidate-manifest.json','audioFileIndex':'audioFileIndex.json','authorFollowup':'author-native-source-followup.json','archive':a['archive'],'completePackageCount':1,'declaredAndVerifiedSourceFiles':104,'pngFilesDecoded':103,'sourceFileBytes':a['extractedBytes'],'textureGroups':idx['groups'],'verifiedModels':0,'verifiedMotionClips':0,'verifiedNativeVfx':0,'verifiedAudioFiles':0,'nativeFucPackages':0,'mappingCount':mapping['mappingCount'],'missingSourceConfigTargets':mapping['missingTargets'],'runtimeReady':False,'priorFrozenFilesVerifiedUnchanged':len(oldFiles),'knownGaps':['Source textures.ini references absent main/inputtext.png.','Portrait texture regions need usage mapping; mission character identity pending.','No same-version native FPK/GMO/model/rig/motion/audio acquired.'],'centralWrites':False,'gitWrites':False,'s3Writes':False,'priorBatchWrites':False}
put(R/'control/handoff.json',handoff)
files=[ref(p) for p in sorted(R.rglob('*')) if p.is_file() and p!=R/'files.sha256.json']
put(R/'files.sha256.json',{'schema':'ggd.file-sha256-manifest@1','localRoot':str(R),'frozenAt':now,'files':files,'fileCount':len(files),'totalBytes':sum(f['bytes'] for f in files),'selfExcluded':True})
for f in files:
 p=R/f['path'];assert p.stat().st_size==f['bytes'] and sha(p)==f['sha256']
report={'status':'frozen-full-readback-pass','localRoot':str(R),'handoff':ref(R/'control/handoff.json'),'fileManifest':ref(R/'files.sha256.json'),'archive':a['archive'],'verifiedFiles':len(files),'filesIncludingManifest':len(files)+1,'totalBytesExcludingManifest':sum(f['bytes'] for f in files),'verifiedSourceFiles':104,'pngDecoded':103,'newCompleteTexturePackages':1,'newNativeFucPackages':0,'sourceConfigurationComplete':False,'missingSourceConfigTargets':['main/inputtext.png'],'previousBatchIntegrity':'34/34 frozen files unchanged','runningSessions':[]}
put(Path('/private/tmp/ggd-fuc-texture-recovery-batch6-report.json'),report);print(json.dumps(report,ensure_ascii=False,indent=2))
