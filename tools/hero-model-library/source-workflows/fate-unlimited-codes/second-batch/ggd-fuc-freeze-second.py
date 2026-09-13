from pathlib import Path
import json,hashlib,shutil,datetime
BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-psp-second-batch')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
now=datetime.datetime.now(datetime.timezone.utc).isoformat();report=[]
for name in ['shirou','rin']:
 root=BASE/('gamebanana-'+name);assert not (root/'files.sha256.json').exists()
 validation=json.load(open(root/'validation.json'));kv=json.load(open(root/'analysis/khronos-validation.json'));assert all(r['report']['issues']['numErrors']==0 and r['report']['issues']['numWarnings']==0 for r in kv['results'])
 validation.update(khronosValidation='pass-zero-errors-zero-warnings',textureByteValidation='pass-embedded-PNG-SHA256-matches-native-extracted-PNG',skinCoordinateConversion='pass-within-1e-6',freezeStatus='complete-frozen',frozenAt=now)
 save(root/'validation.json',validation)
 ai=json.load(open(root/'audioFileIndex.json'));cm=json.load(open(root/'candidate-manifest.json'));ac=json.load(open(root/'acquisition.json'));src=json.load(open(root/'source-page.json'))
 root.joinpath('README.md').write_text(f'''# {src['_sName']} 素材交付

此目錄已凍結，禁止原地重新轉換或改寫；更新時另建版本目錄。

- 來源：{ac['sourceUrl']}；作者 MEKMKII（完整協作者名單見 source-page.json）。
- 取得完整 ZIP：{ac['originalArchive']}，{ac['bytes']} bytes；公布 MD5 比對通過，逐檔 SHA-256 見 files.sha256.json。
- 所有 MOD 原件與 UnityFS bundle 保留在 extracted/，未執行遊戲、MOD 或其中程式。
- 模型候選：candidate-manifest.json，共 {len(cm['candidates'])} 個服裝 GLB；保留作者設定的 renderer/material 配對與 MOD 蒙皮骨架。
- 音訊：audioFileIndex.json，共 {ai['fileCount']} 個 PCM WAV、{ai['totalSeconds']:.9f} 秒；作者與 MOD 欄位標為語音，尚未人工聆聽認定說話角色或轉錄。
- 來源遊戲為 Fate/unlimited codes；作者未註明 PSP 或 PS2，sourcePlatform 維持 unknown。本目錄的工作流名稱不能當作平台證據。
- 無原作 AnimationClip 或 ParticleSystem；MOD 骨架、動態頭髮或裙擺的設定資料不能當作原作動作或完整 VFX。
- GLB 通過 Khronos Validator 0 errors / 0 warnings；貼圖 SHA 與擷取 PNG 一致，座標轉換蒙皮誤差小於 1e-6。
- 尚未完成 GGD 實機、後台選單、人工外觀驗收；runtimeReady=false。中央工作流可將所有候選登記待用，不改預設。
- 原生 PSP FPK/GMO 模型與全動作/VFX庫的缺口仍保留。
''')
 source={'schema':'ggd.public-source.intake@1','sourceId':validation['sourceId'],'sourceUrl':ac['sourceUrl'],'downloadUrl':ac['downloadUrl'],'author':'MEKMKII','sourceGame':'Fate/unlimited codes','sourcePlatform':'unknown','targetModGame':'Bomb Rush Cyberfunk','targetModPlatform':'PC','sourceClass':'mod-community-port','localRoot':str(root),'status':'acquired-standardized-candidate-frozen','acquisition':ac,'candidateManifest':{'path':'candidate-manifest.json','sha256':sha(root/'candidate-manifest.json')},'audioFileIndex':{'path':'audioFileIndex.json','sha256':sha(root/'audioFileIndex.json')},'fileManifest':'files.sha256.json','audioCount':ai['fileCount'],'audioSeconds':ai['totalSeconds'],'modelCandidates':len(cm['candidates']),'distinctMeshes':validation['distinctSourceMeshes'],'nativeGameAnimations':0,'nativeGameVFX':0,'rightsStatus':'Author publicly distributes this MOD; no additional commercial/republication permission inferred.','frozenAt':now}
 save(root/'source-manifest.json',source)
 seconds={x['path']:x['seconds'] for x in ai['files']};files=[]
 for p in sorted(root.rglob('*')):
  if p.is_file() and p.name!='files.sha256.json':
   rel=str(p.relative_to(root));r={'path':rel,'bytes':p.stat().st_size,'sha256':sha(p)}
   if rel in seconds:r['seconds']=seconds[rel]
   files.append(r)
 save(root/'files.sha256.json',{'schema':'ggd.source-files.intake@1','localRoot':str(root),'files':files,'fileCount':len(files),'frozenAt':now,'freezeStatus':'complete-frozen'})
 report.append({**source,'fileManifest':{'path':str(root/'files.sha256.json'),'sha256':sha(root/'files.sha256.json')},'sourceManifest':{'path':str(root/'source-manifest.json'),'sha256':sha(root/'source-manifest.json')},'validation':validation})
control=BASE/'control';assert not control.exists();control.mkdir()
for fname in ['ggd-fuc-process-second-models.py','ggd-fuc-convert-unity-outfit.py','ggd-fuc-validate-second-models.cjs','ggd-fuc-freeze-second.py']:
 p=Path('/private/tmp')/fname;(control/'tooling').mkdir(exist_ok=True);shutil.copyfile(p,control/'tooling'/fname)
leads=[
 {'id':'blender-models-fuc-gilgamesh','sourceUrl':'https://www.blender-models.com/model-downloads/humans/id/gilgamesh-fateunlimited-codes/','author':'Syahriel Muhammad Ibnu Irfansyah','advertisedFormats':['blend'],'advertisedBytesApprox':432000,'sourcePlatform':'unknown','status':'human-verification-required-not-downloaded','evidence':'Normal Download Now leads to /download-verification/ requiring security code. No gate bypass attempted. Page says model based on FUC, not proven native original.'},
 {'id':'dissidia-destvol-illya-gmo','sourceUrl':'https://dissidia012mods.blogspot.com/2022/06/','author':'Dest VoL (mod), Braylovsky (community archive)','publicFolderUrl':'https://mega.nz/folder/1v5XSLBb#oJ3oP5zoFldslZElOkRReQ','collectionUrl':'https://www.mediafire.com/file/6rpo9ru5994v4li/DestvoL_Mod_Collection.zip/file','advertisedFormats':['gmo','gim'],'sourcePlatform':'unknown','targetPlatform':'PSP','status':'catalog-lead-not-acquired','evidence':'Community page explicitly identifies Illyasviel and original GMO/GIM. Source game not proven. MediaFire collection page tool rejected URL as not safe; stopped that route. Public MEGA folder not attempted; no acquired GMO counted.'},
 {'id':'steam-arcueid-fateextra-2865369935','sourceUrl':'https://steamcommunity.com/sharedfiles/filedetails/?id=2865369935','author':'likeful doer','sourceGame':'Fate/Extra','sourcePlatform':'PSP','targetModGame':"Garry\'s Mod",'status':'workshop-catalog-only-not-acquired','evidence':'Author explicitly says ripped from PSP Fate/Extra; page offers subscription and shows removed/incompatible banner. No archive or direct download obtained; no source assets counted.'},
 {'id':'dissidia-mods-native-gmo-catalog','sourceUrl':'https://dissidia012mods.blogspot.com/','author':'Braylovsky (community archive)','status':'catalog-lead-not-acquired','evidence':'Public posts distinguish plain GMO/GIM models from DLC packages. Could supply later native-format samples, but retargeted MODs are not proof of FUC original skeleton or animations.'},
 {'id':'fuc-fpk-zenhax-sample','sourceUrl':'https://zenhax.com/viewtopic.php@t=8190.html','author':'BloodRaynare / aluigi','status':'public-format-discussion-with-missing-sample-link','evidence':'Firsthand post describes FUC FPK samples, but archived page has no working sample attachment. Earlier control package contains parser and synthetic tests, not actual native file validation.'}
]
save(control/'search-leads.json',{'schema':'ggd.source-leads@1','recordedAt':now,'leads':leads,'sourceRowsAreAcquisitions':False})
result={'schema':'ggd-fate-source-workflow-handoff@2','createdAt':now,'batchRoot':str(BASE),'sources':report,'totals':{'completeArchives':len(report),'archiveBytes':sum(x['acquisition']['bytes'] for x in report),'standardGlbCandidates':sum(x['modelCandidates'] for x in report),'distinctNativeModMeshes':sum(x['distinctMeshes'] for x in report),'audioFiles':sum(x['audioCount'] for x in report),'audioSeconds':sum(x['audioSeconds'] for x in report),'originalPspFpkGmoPackages':0,'originalAnimationClips':0,'originalVfxPackages':0},'searchLeadsPath':str(control/'search-leads.json'),'activeDownloads':[],'gaps':['No acquired original FUC PSP FPK/GMO package.','Source platform PSP/PS2 unproven for both MODs.','Original game rig, all animation, VFX and full voice library not acquired.','Manual visual/listening and GGD backend/runtime review pending.'],'previousFirstBatchReport':'/private/tmp/ggd-fate-unlimited-codes-report.json','freezeStatus':'complete-frozen','centralRepoChanged':False,'gitChanged':False,'awsUsed':False}
save(control/'handoff.json',result)
control.joinpath('README.md').write_text('''# Fate 第二批交付

主入口 handoff.json；兩個 source 根目錄各有 source-manifest、files.sha256、candidate-manifest、audioFileIndex。兩包原包、解包、骨架與音訊已保存並標準化；共 8 個 GLB、28 段 PCM 音訊。來源平台未知，原生 PSP FPK/GMO 與動作缺口未關閉。

所有已列入 files.sha256.json 的來源已凍結。未來轉換請建新版本。tooling/ 保留這批使用的本機工具，中央 repo 未修改，無 Git/S3 操作。沒有仍在下載的程序，兩個 normal download 都已成功；不需續傳。

公開候選／受阻來源記於 search-leads.json，未取得檔案的網址不可當成素材庫條目或可選模型。
''')
files=[{'path':str(p.relative_to(control)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(control.rglob('*')) if p.is_file()]
save(control/'files.sha256.json',{'schema':'ggd.source-files.intake@1','localRoot':str(control),'files':files,'freezeStatus':'complete-frozen','frozenAt':now})
save(Path('/private/tmp/ggd-fuc-second-report.json'),result)
print(json.dumps({'report':str(control/'handoff.json'),'reportSha256':sha(control/'handoff.json'),'controlManifest':str(control/'files.sha256.json'),'controlManifestSha256':sha(control/'files.sha256.json'),'totals':result['totals'],'sources':[{k:x[k] for k in ['sourceId','localRoot','fileManifest','sourceManifest','audioFileIndex']} for x in report]},ensure_ascii=False,indent=2))
