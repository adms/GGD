from pathlib import Path,PurePosixPath
from PIL import Image,ImageDraw
import collections,datetime,hashlib,json,re,shutil,stat,zipfile
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-texture-recovery-batch6')
B=R.parent/'fate-unlimited-codes-source-audit-batch5'
assert not (R/'control/handoff.json').exists()
commit='c8c2d52b60856913d6d81ee0cba5533cc1a098a6'
archive=R/'original'/('Fate-UC-HD-'+commit+'.zip')
assert json.loads((R/'full-download-result.json').read_text())['curlExitCode']==0
out=R/'extracted';out.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ref(p):return {'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':sha(p)}
with zipfile.ZipFile(archive) as z:
 infos=z.infolist();names=[x.filename.casefold() for x in infos]
 assert len(names)==len(set(names)) and len(infos)<1000 and sum(x.file_size for x in infos)<64*1024*1024
 for x in infos:
  p=PurePosixPath(x.filename);assert not p.is_absolute() and '..' not in p.parts and '\\' not in x.filename
  assert not stat.S_ISLNK(x.external_attr>>16)
 assert z.testzip() is None
 for x in infos:
  p=out/x.filename
  if x.is_dir():p.mkdir(parents=True,exist_ok=True)
  else:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(x))
for kind in ['repo','commit','tree']:shutil.copyfile(B/'github-udienzebeer-fate-uc-hd'/('source-'+kind+'.json'),R/('source-'+kind+'.json'))
tree=json.loads((R/'source-tree.json').read_text());blobs=[x for x in tree['tree'] if x['type']=='blob'];src=out/('Fate-UC-HD-'+commit)
actualFiles=sorted(p for p in src.rglob('*') if p.is_file())
assert len(actualFiles)==len(blobs)==104 and not tree.get('truncated',False)
assert {str(p.relative_to(src)) for p in actualFiles}=={x['path'] for x in blobs}
blobRefs=[]
for b in blobs:
 p=src/b['path'];data=p.read_bytes();assert len(data)==b['size']
 gitsha=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert gitsha==b['sha']
 blobRefs.append({**ref(p),'sourcePath':b['path'],'gitBlobSha1':gitsha,'verification':'size-and-git-blob-sha1-pass'})
textures=[]
for p in actualFiles:
 if p.suffix!='.png':continue
 with Image.open(p) as im:im.verify()
 with Image.open(p) as im:im.load();size=im.size;mode=im.mode
 rel=str(p.relative_to(src));cat='character-portrait' if rel.startswith('chara/') else 'mission-portrait-unmapped' if rel.startswith('missionchara/') else 'logo' if rel.startswith('logos/') else 'interface-texture'
 if p.stem.startswith('magic_circle'):cat='static-magic-circle-interface-texture'
 label=re.sub(r'_\d+$','',p.stem) if cat=='character-portrait' else None
 textures.append({**ref(p),'sourcePath':rel,'width':size[0],'height':size[1],'mode':mode,'category':cat,'sourceCharacterLabel':label,'heroIds':[],'nativeVfxBehavior':False,'decoded':'pass','conversion':'none-standard-PNG-original-bytes-preserved'})
assert len(textures)==103
ini=(src/'textures.ini').read_text();maps=[];sections=[];section=None
for i,line in enumerate(ini.splitlines(),1):
 line=line.strip()
 if not line or line.startswith(('#',';')):continue
 if line.startswith('['):section=line.strip('[]');sections.append(section);continue
 if '=' in line:
  key,value=line.split('=',1);value=value.strip()
  if value.lower().endswith('.png'):
   normalized=value.replace('\\','/');p=PurePosixPath(normalized);assert not p.is_absolute() and '..' not in p.parts
   maps.append({'line':i,'section':section,'sourceKey':key.strip(),'target':normalized,'targetExists':(src/normalized).is_file()})
put(R/'texture-mapping-audit.json',{'schema':'ggd.texture-mapping-audit@1','source':ref(src/'textures.ini'),'sections':sections,'pngMappings':maps,'mappingCount':len(maps),'missingTargets':[x for x in maps if not x['targetExists']],'interpretation':'Static text parsing only; emulator mapping not exercised.'})
put(R/'source-file-manifest.json',{'schema':'ggd.source-files@1','localRoot':str(R),'commit':commit,'treeSha':tree['sha'],'files':blobRefs,'fileCount':len(blobRefs),'allGitBlobsVerified':True})
put(R/'texture-index.json',{'schema':'ggd.texture-index.intake@1','localRoot':str(R),'sourceId':'github-udienzebeer-fate-uc-hd-c8c2d52b','files':textures,'fileCount':len(textures),'groups':dict(collections.Counter(x['category'] for x in textures)),'sourceCharacterGroups':{k:[x['path'] for x in textures if x['sourceCharacterLabel']==k] for k in sorted({x['sourceCharacterLabel'] for x in textures if x['sourceCharacterLabel']})}})
put(R/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(R),'candidates':[],'status':'no-3d-model-in-package'})
put(R/'audioFileIndex.json',{'schema':'ggd.audio-file-index.intake@1','localRoot':str(R),'files':[],'audioGroups':[],'fileCount':0,'totalSeconds':0,'status':'no-audio-in-package'})
put(R/'resource-options.json',{'schema':'ggd.resource-options.intake@1','localRoot':str(R),'sourceId':'github-udienzebeer-fate-uc-hd-c8c2d52b','options':[{'resourceId':'fuc-psp-community-textures-c8c2d52b','kind':'texture-supplement','index':'texture-index.json','modelOption':False,'runtimeVfxOption':False,'defaultChanged':False,'fileVerified':True,'integrationStatus':'ready-for-index-integration; hero/UI mapping remains reviewable'}]})
priorTree=json.loads((R.parent/'fate-unlimited-codes-psp-first-batch/github-unlimitedcodes-hd/source-tree.json').read_text());oldHashes={x['sha'] for x in priorTree['tree'] if x['type']=='blob'};overlap=sum(b['sha'] in oldHashes for b in blobs)
put(R/'acquisition.json',{'schema':'ggd.source-acquisition@1','sourceId':'github-udienzebeer-fate-uc-hd-c8c2d52b','sourceUrl':'https://github.com/UdienZebeer/Fate-UC-HD','sourceAccount':'UdienZebeer','downloadUrl':'https://codeload.github.com/UdienZebeer/Fate-UC-HD/zip/'+commit,'commit':commit,'treeSha':tree['sha'],'archive':ref(archive),'zipCRC':'pass','completePackage':True,'safeExtraction':'pass','allGitBlobsVerified':104,'extractedBytes':sum(b['size'] for b in blobs),'formats':{'.png':103,'.ini':1},'pngFilesDecoded':103,'sourcePlatform':'PSP','sourceClass':'community-texture-replacement','platformEvidence':'PPSSPP texture mapping file format and same texture package forum context; raw PSP game files absent.','priorPartialRetained':True,'duplicateBlobCountAgainstPriorHdDeclaredTree':overlap,'originalPackagePreserved':True,'newModels':0,'nativeMotionFiles':0,'audioFiles':0,'nativeFucPackages':0,'nativeVfx':0,'redistributionLicense':'not established; no LICENSE in snapshot'})
preview=R/'preview';preview.mkdir(exist_ok=True)
selected=[x for x in textures if x['category']=='character-portrait' and x['sourcePath'].endswith('_1.png')]
selected+=[x for x in textures if x['category']=='static-magic-circle-interface-texture']
W=1000;cellw=200;cellh=240;H=((len(selected)+4)//5)*cellh
sheet=Image.new('RGB',(W,H),(238,238,240));draw=ImageDraw.Draw(sheet)
for i,x in enumerate(selected):
 with Image.open(R/x['path']) as im:
  im=im.convert('RGBA');im.thumbnail((190,210));dx=(i%5)*cellw+(cellw-im.width)//2;dy=(i//5)*cellh+5;sheet.paste(im,(dx,dy),im)
 draw.text(((i%5)*cellw+4,(i//5)*cellh+218),Path(x['sourcePath']).stem,fill=(15,15,15))
sheet.save(preview/'texture-contact-sheet.png')
print(json.dumps({'archive':ref(archive),'allBlobsVerified':104,'pngDecoded':103,'sourceGroups':dict(collections.Counter(x['category'] for x in textures)),'iniMappingCount':len(maps),'missingIniTargets':[x for x in maps if not x['targetExists']],'preview':str(preview/'texture-contact-sheet.png'),'oldTreeOverlap':overlap},ensure_ascii=False,indent=2))
