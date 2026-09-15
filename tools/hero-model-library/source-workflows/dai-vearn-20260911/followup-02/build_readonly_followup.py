import datetime,hashlib,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
WS=ROOT.parents[3]
R=WS/'GGD-hero-model-options'
def meta(p):
 b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def write(name,x):
 p=ROOT/name;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');return meta(p)
steam=pathlib.Path.home()/'Library/Application Support/Steam';apps=steam/'steamapps'
installed=[]
for p in sorted(apps.glob('appmanifest_*.acf')):
 t=p.read_text();row={'metadataPath':str(p)}
 for k in ['appid','name','installdir']:
  m=re.search('"'+k+'"\\s+"([^"]+)"',t)
  if m:row[k]=m.group(1)
 installed.append(row)
lf=apps/'libraryfolders.vdf'
library_paths=re.findall(r'"path"\s+"([^"]+)"',lf.read_text()) if lf.exists() else []
local={'libraryMetadataPath':str(lf),'registeredLibraryPaths':library_paths,'installedGames':installed,'targetAppIds':['1895810','816020'],'targetInstalledManifests':[x for x in installed if x.get('appid') in ['1895810','816020']],'commonGameFolders':[p.name for p in (apps/'common').iterdir() if p.is_dir()],'downloadingEntryCount':len(list((apps/'downloading').iterdir())),'depotcacheEntryCount':len(list((steam/'depotcache').iterdir())),'limitation':'Depot cache metadata is not a downloaded game; no target installed manifest or readable target resource bundle resolved. Only Steam game library metadata/folder names inspected, no account/config/login/credential files. No claim about every unidentified hashed file elsewhere on disk.'}
known=R/'materials/hero-model-library/download-sources.json';d=json.loads(known.read_text())
existing=[]
def walk(x):
 if isinstance(x,dict):
  if x.get('id') in ['patreon-shinteo-dai-daz-v2','parallel-vearn-priority-source-audit-20260911','parallel-infinity-strash-sorcerer-popp'] and x.get('verification'):
   existing.append({k:x.get(k) for k in ['id','target','localRoot','acquisitionStatus','verification']})
  for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
walk(d)
report={'schema':'ggd.dai-vearn-bounded-local-source-followup@1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'localRoot':str(ROOT),'centralReadOnly':True,'newAcquiredCharacterAssetCount':0,'modelCandidates':[],'audioFiles':[],'localGameSourceCheck':local,'knownCentralSources':existing,'newSpecificSourceRoutes':[
 {'id':'franky3dworld-fly-dai-2025','character':'小呆／達伊','author':'Franky3DWorld','urls':['https://cults3d.com/en/3d-model/game/fly-dragon-quest-version-original-en-pose-de-lucha','https://franky3dworld.com'],'advertisedAttachment':'Fly Figura.zip: Fly figura.stl + info.txt','observedPrice':'US$3.50','published':'2025-09-02','status':'not-acquired-paid-sculpt','evidence':'Cults author listing provides a single posed printable figure. Author advertises one rotating free catalog item daily on own website, but nothing establishes Dai is currently free. Normal website open returned HTTP400 Timeout fetching; bounded round stopped, no bypass/account/purchase. No rig, animation, sound or texture package verified.'},
 {'id':'cgtrader-vearn-5504550','character':'巴恩大魔王，形態未驗','author':'billkaketo','url':'https://www.cgtrader.com/3d-print-models/art/sculpture/vearn-dragon-quest-the-adventure-of-dai-3d-print','advertisedAttachment':'STL 147MB','observedPrice':'US$11.00','published':'2024-09-03','status':'not-acquired-paid-sculpt','evidence':'Actual public product page states model5504550, STL and purchase price. Similar title/date to previously inspected DuongKhuong/Cults listing, so no independent asset/version asserted without bytes. No purchase or download. Not original-game rig/motion evidence.'}
 ],'alreadyKnownRouteExcluded':{'url':'https://www.gildor.org/smf/index.php?topic=8730.0','localEvidence':str(WS/'GGD-Asset-Library/intake/public-models-20260910/parallel-infinity-strash-sorcerer-popp/other-source-leads.json'),'result':'Already recorded previously. Public one-post thread still lists UE4.26 specific UModel build plus one Clipboard01.jpg screenshot, not a character sample archive. Effects outline/aura sections export note is useful when actual game data becomes available. No tool/game download performed.'},'routeLimit':{'maximumNewSources':3,'specificNewSourcesInspected':2,'additionalSearchResults':'Other targeted MOD/author searches yielded unrelated characters or already registered blocked/deleted routes; no third qualified new attachment source established. Stopped rather than broadening.'},'outcome':'No new complete standalone Dai body, no old/young Vearn body, motion or audio obtained this bounded round. Existing Dai Daz package still requires external G8/G8.1 male base; old Vearn inclusion evidence remains valid but not asset bytes.','storage':{'localPreserved':True,'s3Status':'pending-backup-research-only','newCharacterAssetsAwaitingBackup':0},'inputs':[meta(known)],'noAccessBypass':True,'noPurchase':True,'noGameImageDownload':True}
write('source-report.json',report)
files=[dict(meta(p),path=p.relative_to(ROOT).as_posix()) for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name not in ['file-manifest.json','delivery-receipt.json']]
fm=write('file-manifest.json',{'schema':'ggd.source-file-manifest@1','localRoot':str(ROOT),'files':files,'fileCount':len(files),'bytes':sum(x['bytes'] for x in files),'containsCharacterAssets':False})
receipt={'schema':'ggd.frozen-research-followup@1','localRoot':str(ROOT),'sourceReport':meta(ROOT/'source-report.json'),'fileManifest':fm,'newAcquiredCharacterAssetCount':0,'frozen':True,'s3Status':'pending-research-backup'}
write('delivery-receipt.json',receipt)
pathlib.Path('/private/tmp/ggd-dai-vearn-local-followup-02.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False,indent=2))
