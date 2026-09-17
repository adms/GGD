#!/usr/bin/env python3
"""Reconcile existing fixed Ultimate14 motion inventory and archived Windows scan.
Read-only source access. Writes only beside this script. No payload extraction or code execution.
"""
from pathlib import Path
import argparse,collections,csv,hashlib,io,json,re,subprocess,zipfile,datetime
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace',type=Path,required=True,help='ABxVFX_EDIT containing GGD-Asset-Library')
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[4])
parser.add_argument('--output-dir',type=Path,required=True,help='New local directory outside the Git checkout; large evidence stays local')
args=parser.parse_args()
WORK=args.workspace.resolve();REPO=args.repo.resolve();OUT=args.output_dir.resolve()
if OUT==REPO or REPO in OUT.parents:
    parser.error('--output-dir must be outside the Git checkout')
OUT.mkdir(parents=True,exist_ok=False)
SRC=WORK/'GGD-Asset-Library/intake/public-models-20260910/parallel-ns-ultimate14'
SCAN=WORK/'GGD-Asset-Library/intake/remote-game-libraries/windows-scan-20260912-030625'
INPUTS={}
def read(p):
 p=Path(p);b=p.read_bytes();INPUTS[str(p)]={'absolutePath':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};return b
def js(p):return json.loads(read(p))
def write(n,d):
 (OUT/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
nativepath=REPO/'materials/hero-model-library/source-inventories/ultimate14-native-motions.json';native=js(nativepath)
download=js(REPO/'materials/hero-model-library/download-sources.json');source=next(s for s in download['publicSources'] if s['id']=='parallel-ns-ultimate14')
assert INPUTS[str(nativepath)]['sha256']==source['nativeMotionIndex']['sha256']
manifest=[json.loads(s) for s in read(SRC/'extracted-files.jsonl').decode().splitlines()]
validation=js(SRC/'native-format-validation.json')
verified=[]
for row in manifest:
 p=SRC/row['path'];b=p.read_bytes();sha=hashlib.sha256(b).hexdigest()
 verified.append({**row,'absolutePath':str(p),'actualBytes':len(b),'actualSha256':sha,'matchesManifest':len(b)==row['bytes'] and sha==row['sha256']})
assert all(r['matchesManifest'] for r in verified)
archive=source['files'][0];read(SRC/archive['path']);assert INPUTS[str(SRC/archive['path'])]['sha256']==archive['sha256']
byrel={r['path'].split('extracted/Ultimate14/Ultimate14/',1)[1]:r for r in verified if 'extracted/Ultimate14/Ultimate14/' in r['path']}
for alias in native['aliases']:
 r=byrel[alias['relativePath']];assert r['sha256']==alias['sha256'] and r['bytes']==alias['bytes']
# All paths are kept; identity/form names are display labels, never new GGD hero IDs.
names={'chrom':('庫洛姆','Chrom'),'daisy':('黛西','Daisy'),'ganon':('加儂多夫','Ganondorf'),'kirby':('卡比','Kirby'),'link':('林克','Link'),'lucas':('路卡斯','Lucas'),'lucina':('露琪娜','Lucina'),'mario':('瑪利歐','Mario'),'peach':('碧姬公主','Peach'),'pitb':('黑暗彼特','Dark Pit'),'richter':('里希達・貝爾蒙多','Richter Belmont'),'samusd':('黑暗薩姆斯','Dark Samus'),'shizue':('西施惠','Isabelle'),'simon':('西蒙・貝爾蒙多','Simon Belmont'),'sonic':('索尼克','Sonic'),'toonlink':('卡通林克','Toon Link')}
LFS=WORK/'GGD-Asset-Library/intake/public-models-20260910/gitlab-ssbu-models';lfs=js(LFS/'source-lfs-manifest.json')
rows=[]
for fighter,counts in sorted(native['fighters'].items()):
 aliases=[a for a in native['aliases'] if a['fighterId']==fighter]
 combinations=collections.defaultdict(list)
 for a in aliases:combinations[(a['directoryClass'],a['target'],a['costume'])].append(a)
 forms=[{'directoryClass':kind,'targetId':target,'costumeId':costume,'fileCount':len(items),'uniqueSha256Count':len({a['sha256'] for a in items}),'clipNames':[a['clipName'] for a in items]} for (kind,target,costume),items in sorted(combinations.items())]
 parts=[r for r in verified if f'/fighter/{fighter}/model/' in r['path'] and r['path'].endswith('.numdlb')]
 textures=[r for r in verified if f'/fighter/{fighter}/' in r['path'] and r['path'].endswith('.nutexb')]
 banks=[r for r in validation['nativeAudioBanks'] if re.search(r'/se_'+re.escape(fighter)+r'_c\d+\.patch3audio$',r['path'])]
 candidate=[]
 for f in lfs:
  if f['name'].startswith(f'fighter/{fighter}/model/body/') and f['name'].endswith('.blend'):
   p=LFS/'source-repository'/f['name'];exists=p.is_file();size=p.stat().st_size if exists else None
   candidate.append({'sourceId':'gitlab-ssbu-models','nativePath':f['name'],'absolutePath':str(p),'costumeId':Path(f['name']).parent.name,'expectedLfsSha256':f['oid'],'expectedBytes':f['size'],'existsLocal':exists,'actualBytes':size,'freshSizeVerified':size==f['size'],'freshShaVerified':False,'readiness':'existing-community-exported-body-candidate; skeleton pairing and conversion acceptance separate'})
 rows.append({'nativeFighterId':fighter,'nameZh':names[fighter][0],'originalName':names[fighter][1],'workZh':'任天堂明星大亂鬥 特別版／Ultimate14 MOD','sourceId':'parallel-ns-ultimate14','platform':'Nintendo Switch','counts':counts,'formsAndCostumes':forms,'motionPaths':aliases,'modelParts':parts,'textureFileCount':len(textures),'nativeAudioBankAliases':banks,'bodyModelsInThisSource':0,'otherSourceBodyCandidates':candidate,'gap':'MOD supplementary motions only; complete original motions, per-character compatible skeleton playback, VFX reconstruction and game-event bindings are not established.','runtimeSelectable':False})
# Authoritative remote scan is metadata-only; inspect archive bytes and member consistency.
scan_zip=SCAN/'source/GGD-Game-Inventory-20260912-030625.zip';zb=read(scan_zip);zipmembers=[]
with zipfile.ZipFile(io.BytesIO(zb)) as z:
 for item in z.infolist():
  b=z.read(item.filename);p=SCAN/'extracted'/item.filename
  disk=read(p);assert b==disk
  zipmembers.append({'name':item.filename,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'matchesExtracted':True})
scanreceipt=js(SCAN/'extracted/scan-receipt.json')
rom=list(csv.DictReader(io.StringIO(read(SCAN/'extracted/rom-files.csv').decode('utf-8-sig'))))
selected=[r for r in rom if 'NSandNS2' in r['FullPath']] if rom and 'FullPath' in rom[0] else [r for r in rom if any('NSandNS2' in str(v) for v in r.values())]
mounts=subprocess.run(['mount'],text=True,capture_output=True,check=True).stdout
mountlines=[s for s in mounts.splitlines() if 'smbfs' in s and ('/common ' in s or '/game ' in s or 'ggd-game' in s)]
allrom=[]
for r in selected:
 path=r.get('SourcePath',r.get('FullPath',r.get('Path')))
 if path is None:path=next(v for v in r.values() if str(v).startswith('E:\\'))
 is_smash='smash' in path.lower()
 allrom.append({'rawScanRecord':r,'windowsAbsolutePath':path,'matchingGame':'Super Smash Bros. Ultimate' if is_smash else 'different-game-preserve-separately','containerBytesReadByOriginalScan':0,'payloadSha256':None,'headerVerified':False,'memberInventoryVerified':False,'extracted':False,'converted':False,'runtimeSelectable':False,'fileNameLabelsUnverified':{'titleId':'01006A800016E000','region':'US','version':'v0'} if is_smash and path.endswith('.nsp') else None})
audio_source=next(s for s in download['publicSources'] if s['id']=='parallel-ns-ultimate14-audio-decoded-v1')
audioindex=WORK/audio_source['localPath']/audio_source['audioFileIndex']['reportPath'];read(audioindex)
assert INPUTS[str(audioindex)]['sha256']==audio_source['audioFileIndex']['reportSha256']
# Existing Mario conversion is a separate partial experiment, not a complete 16-character delivery.
mario=WORK/'GGD-Asset-Library/conversions/ssbu-mario-ultimate14-motion-v1'
experiments=[]
for rel in ['normalized-01/validation.json','visual-07/run.json','visual-07/proof.json']:
 p=mario/rel
 if p.exists():
  d=js(p);experiments.append({'path':str(p),'sha256':INPUTS[str(p)]['sha256'],'schema':d.get('schema'),'source':d.get('glb',d.get('source')),'complete':d.get('complete'),'animationGroups':d.get('animationGroups'),'limitations':d.get('limitations'),'note':'Existing partial local experiment; no 16-character completion or native base-game full moveset claimed.'})
# Keep other fighter path groups and audio-only fighter separate from the exact 16 motion groups.
other=[]
for fid in ['common','mariod','samus']:
 fs=[r for r in verified if f'/fighter/{fid}/' in r['path']];other.append({'nativeId':fid,'role':'parameter-or-motion-list-only','files':fs,'hasNuanmb':False})
luigi=[r for r in validation['nativeAudioBanks'] if '/se_luigi_' in r['path']]
write('ultimate14-files-reverified.json',{'scope':'exact 1,071 files in existing extracted-files.jsonl; not a whole-library audit','files':verified})
report={'schema':'ggd-ultimate16-nsandns2-reconciliation@1','auditedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authoritativeMotionInventory':INPUTS[str(nativepath)],'authoritativeMotionSummary':native['summary'],'definitionOfSixteen':'Exactly 16 fighter IDs with NUANMB paths in Ultimate14 community MOD; 435 total NUANMB paths = 411 transform motion paths plus 24 model metadata paths, not 16 complete original-game heroes.','sourceArchive':INPUTS[str(SRC/archive['path'])],'sourceFilesReverified':{'files':len(verified),'bytes':sum(r['bytes'] for r in verified),'shaMismatches':0,'aliasCountVerifiedAgainstFixedInventory':len(native['aliases'])},'fighters':rows,'additionalFighterPathGroups':other,'audioOnlyFighter':{'nativeId':'luigi','files':luigi,'notOneOfSixteenMotionFighters':True},'audioDecodedRevision':{'sourceId':audio_source['id'],'index':INPUTS[str(audioindex)],'counts':audio_source['audioAcquisition'],'status':audio_source['readiness']},'existingPartialMarioExperiments':experiments,'nsandns2':{'archive':INPUTS[str(scan_zip)],'archiveMembers':zipmembers,'originalScanReceipt':scanreceipt,'records':allrom,'smashRecordCount':sum(x['matchingGame']=='Super Smash Bros. Ultimate' for x in allrom),'mountSnapshot':{'gameVolumePresent':Path('/Volumes/game').exists(),'mountedRelevantSmbVolumes':mountlines},'gap':'Windows metadata snapshot exists but game share is not mounted. NSP/ZIP magic, members, content hash, title/version, base/update/DLC composition and any extracted assets are unverified.'},'centralMutationPerformed':False,'centralMutationReason':'Existing fixed inventory already matches 435 local files. Main workflow will integrate this evidence into the current checkout; stale GGD-hero-model-options checkout is not modified.','inputs':list(INPUTS.values())}
write('reconciliation.json',report)
# Small parent integration note, not a replacement central source catalog.
write('central-integration-proposal.json',{'sourceId':'parallel-ns-ultimate14','existingFixedMotionIndex':'materials/hero-model-library/source-inventories/ultimate14-native-motions.json','preserveExistingIndex':True,'verifiedMotionIndexSha256':INPUTS[str(nativepath)]['sha256'],'suggestedSummaryClarification':'Ultimate14 的 16 個動作角色路徑群，435 NUANMB 中 411 為變換動作、24 為模型中繼資料；不是 16 份完整角色本體。已另有 19 WAV 解碼版，56 原生配色 bank 關係保留。','scopeClarifications':{'nativeIds':'existing 19 fighter directory IDs, including common/mariod/samus; audio-only luigi recorded separately','motionFighterIds':list(native['fighters']),'audioBankFighterIds':['link','lucas','lucina','luigi','samusd','sonic','toonlink']},'remoteInventoryReference':'materials/hero-model-library/source-inventories/windows-game-library.json','remoteUpdate':{'newSourceAcquisition':False,'sourceMountAvailable':False,'requiresFreshFileMetadataAndHeaderInspection':True,'payloadSha256':None,'extracted':False},'doNotOverwriteGeneratedMd':True})
md=['# Ultimate「16 名」與 NSandNS2 核對','',report['definitionOfSixteen'],'','固定動作入口：`'+str(nativepath)+'`。本次重新 SHA 驗證原包與其清單內全部 1,071 檔，0 不一致；435 個 NUANMB aliases 逐筆對上固定盤點。','', '| 中文角色 | 原生 ID | NUANMB 路徑 | 身體動作 | 部件／複製動作 | 模型中繼資料 | 變換動作 SHA 種數 |','|---|---|---:|---:|---:|---:|---:|']
for row in rows:
 c=row['counts'];md.append(f"| {row['nameZh']} | {row['nativeFighterId']} | {c['pathCount']} | {c['bodyMotionPathCount']} | {c['accessoryMotionPathCount']} | {c['modelAnimationMetadataPathCount']} | {c['uniqueTransformMotionPayloadCount']} |")
md += ['','每角色的 target／costume／clip 名稱、逐檔 SHA、全絕對路徑與來源外 body 候選都在 `reconciliation.json`，不是新中央索引。','', 'Ultimate14 是公開 MOD 補丁原包，不含角色完整本體。Worldblender 另一來源的 body Blender 候選已列絕對路徑與 LFS SHA，這次只查存在與大小，未重新 SHA 或驗收整個模型。Kirby 的 daisybody／samusdbody／sonicbody／richterbody 是來源複製動作 target，不新增人物。common、mariod、samus 僅參數／motion_list；Luigi 僅音訊，均不灌入 16 名。','', '音訊已有獨立解碼版：7 種 bank 內容→19 WAV，保留56個配色別名／152個容器條目；不是152個獨立語音。未聽審、未核實說話者與技能事件。Mario另有5個body動作本機GLB實驗，不能推論16名全完成。','', 'NSandNS2 既有盤點來自 LV99 的 Windows metadata scan，原掃描 payload read = 0。以下均只表示檔案 metadata 曾存在；容器真實格式、版本、DLC、hash、解包與轉換尚未證實：','']
for row in allrom:
 if row['matchingGame']=='Super Smash Bros. Ultimate':md.append('- `'+row['windowsAbsolutePath']+'`')
md += ['','目前 `/Volumes/game` 缺席；已有 `//ggd-read@lv99/common` 是 Steam common 分享，不是 NSandNS2 所在的 Game share。若原 game share 已存在，Finder Cmd-K 使用 `smb://lv99/game` 重新掛載既有分享；沿用既有登入，不在聊天提供密碼。若分享名稱／路徑不符，先在 Windows 執行 `Get-SmbShare -Name game | Select-Object Name,Path` 只讀確認，不建立分享、不改 ACL。','', '最小本機核對：執行同目錄 `inspect_nsandns2_readonly.ps1`（不需系統管理員，不變更ACL、不執行來源內容）。輸出來源 metadata；加 `-InspectContainers` 可只讀 NSP PFS0 表頭/檔案表及 ZIP 成員表，加 `-HashPayload` 才逐檔完整 SHA。輸出預設寫新 Desktop 資料夾，遊戲原件不變。','', '本次無中央修改、下載、S3操作、commit、push或部署。']
(OUT/'README.md').write_text('\n'.join(md)+'\n')
print(json.dumps({'sourceFilesReverified':report['sourceFilesReverified'],'fighters':[(x['nativeFighterId'],x['counts']['pathCount']) for x in rows],'sourceBodyCandidateCount':sum(len(x['otherSourceBodyCandidates']) for x in rows),'nsandns2Records':len(allrom),'smashRecords':report['nsandns2']['smashRecordCount'],'gameMounted':Path('/Volumes/game').exists()},indent=2))
