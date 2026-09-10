#!/usr/bin/env python3
"""Audit committed Main audio without writing any repository content."""
import collections, hashlib, json, pathlib, subprocess, datetime, shutil
WS=pathlib.Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=WS/'GGD-hero-model-options';O=WS/'outputs/priority-81-handoff-20260911/audio-audit'
REV='b6686109a2946664827e8e59529de670b844d7c6'
def sha(b):return hashlib.sha256(b).hexdigest()
def get(path):return subprocess.check_output(['git','show',REV+':'+path],cwd=R)
def batch(paths):
 raw=subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(REV+':'+p for p in paths)+'\n').encode(),cwd=R);pos=0;out={}
 for path in paths:
  end=raw.index(b'\n',pos);head=raw[pos:end].decode();pos=end+1
  if head.endswith(' missing'):out[path]=None;continue
  oid,kind,size=head.split();size=int(size);assert kind=='blob';out[path]={'objectId':oid,'bytes':raw[pos:pos+size]};pos+=size+1
 return out
def put(name,data):
 p=O/name;assert not p.exists();p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
reg=json.loads((R/'materials/hero-model-library/priority-registration.json').read_text())['heroes']
paths=['content/assets/audio/voices/champions/MANIFEST.json','content/assets/audio/voices/lines/COMBAT_ORIGINALS.json','content/assets/audio/voices/lines/COMBAT_CASTING.json']
docs=batch(paths);manifest=json.loads(docs[paths[0]]['bytes']);originals=json.loads(docs[paths[1]]['bytes']);casting=json.loads(docs[paths[2]]['bytes'])
pins=[{'path':str(R/p),'gitPath':p,'revision':REV,'gitObjectId':docs[p]['objectId'],'sha256':sha(docs[p]['bytes']),'bytes':len(docs[p]['bytes'])} for p in paths]
statuspaths=['content/assets/audio/voices/lines/'+h['runtimeHeroId']+'/status.json' for h in reg if h['runtimeHeroId'] in manifest['champions']]
statusblobs=batch(statuspaths);statuses={}
for p,obj in statusblobs.items():
 assert obj is not None,p
 statuses[p.split('/')[-2]]=json.loads(obj['bytes']);pins.append({'path':str(R/p),'gitPath':p,'revision':REV,'gitObjectId':obj['objectId'],'sha256':sha(obj['bytes']),'bytes':len(obj['bytes'])})
cliprecords={}
for h in reg:
 rid=h['runtimeHeroId'];pack=manifest['champions'].get(rid)
 if not pack:continue
 for cat,rows in pack['lines'].items():
  for row in rows:
   path='content/'+row['clip'];entry=cliprecords.setdefault(path,{'heroId':h['heroId'],'runtimeHeroId':rid,'clip':row['clip'],'categories':[],'expectedManifestSha256':row.get('hash')});entry['categories'].append(cat)
clips=batch(list(cliprecords));issues=[];nativechecks={};perhero=[];sourcemappings=[]
for p,rec in cliprecords.items():
 obj=clips[p];rid=rec['runtimeHeroId'];st=statuses[rid];cat=pathlib.Path(rec['clip']).stem;line=st['lines'].get(cat,{});current=line.get('current',{});reference=st.get('reference',{});isoriginal=current.get('engine')=='original';issynthetic=current.get('engine') in {'cosyvoice3','cosyvoice','piper','edge-tts','say','tts'}
 classification='source-file-reused-not-speaker-verified' if isoriginal else 'synthetic-donor-reference' if issynthetic and reference.get('sourceKind')=='donor' else 'synthetic-own-reference-labelled' if issynthetic else 'unclassified'
 rec.update(classification=classification,textSource=line.get('textSource'),engine=current.get('engine'),referenceKind=reference.get('sourceKind'),donor=reference.get('donor'),reportedLanguage=line.get('lang'),speakerVerified=False,expectedStatusSha256=current.get('hash'),statusPointer={'gitPath':'content/assets/audio/voices/lines/'+rid+'/status.json','category':cat})
 if obj:
  digest=sha(obj['bytes']);rec.update(bytes=len(obj['bytes']),sha256=digest,gitObjectId=obj['objectId'],gitShaMatchesManifest=digest==rec['expectedManifestSha256'],gitShaMatchesStatus=digest==rec['expectedStatusSha256']);wp=R/p;rec['worktreePath']=str(wp);rec['worktreeMatchesCommitted']=wp.is_file() and sha(wp.read_bytes())==digest
  if not rec['gitShaMatchesManifest'] or not rec['gitShaMatchesStatus']:issues.append({'path':p,'problem':'committed-clip-sha-mismatch'})
 else:rec['gitShaMatchesManifest']=False;rec['gitShaMatchesStatus']=False;rec['worktreeMatchesCommitted']=False;issues.append({'path':p,'problem':'committed-clip-missing'})
 if isoriginal:
  origin=originals.get('champions',{}).get(rid,{}).get(cat)
  rec['originalSourceDeclared']=origin
  if origin:
   sp=WS/origin['src']
   if str(sp) not in nativechecks:nativechecks[str(sp)]={'path':str(sp),'sha256':sha(sp.read_bytes()) if sp.is_file() else None,'bytes':sp.stat().st_size if sp.is_file() else None}
   test=nativechecks[str(sp)];rec['originalSourceLocalShaPass']=test['sha256']==origin.get('sha256');sourcemappings.append({'heroId':rec['heroId'],'runtimeHeroId':rid,'category':cat,'groupId':origin.get('group'),'sourcePath':str(sp),'sourceSha256':origin.get('sha256'),'localShaPass':rec['originalSourceLocalShaPass'],'classification':'source-reused-voice-label-not-manual-speaker-proof','outputClip':rec['clip'],'outputSha256':rec.get('sha256')})
   if not rec['originalSourceLocalShaPass']:issues.append({'path':str(sp),'problem':'original-source-sha-mismatch'})
  else:issues.append({'path':p,'problem':'original-engine-missing-original-source-map'})
required=manifest.get('shipGate',{}).get('required',[]);extended=list(dict.fromkeys(required+['taunt','victory']))
for h in reg:
 rid=h['runtimeHeroId'];pack=manifest['champions'].get(rid);rs=[r for r in cliprecords.values() if r['runtimeHeroId']==rid];cc=collections.Counter(x['classification'] for x in rs)
 if pack:
  missing=[c for c in required if not pack['lines'].get(c)];missing11=[c for c in extended if not pack['lines'].get(c)];statpath='content/assets/audio/voices/lines/'+rid+'/status.json';sp=next(x for x in pins if x['gitPath']==statpath)
 else:missing=required;missing11=extended;sp=None
 perhero.append({'heroId':h['heroId'],'runtimeHeroId':rid,'revision':REV,'packPresent':pack is not None,'uniqueClipCount':len(rs),'originalSourceLabelledCount':cc['source-file-reused-not-speaker-verified'],'syntheticCount':sum(v for k,v in cc.items() if k.startswith('synthetic')),'donorSyntheticCount':cc['synthetic-donor-reference'],'ownReferenceSyntheticCount':cc['synthetic-own-reference-labelled'],'unclassifiedCount':cc['unclassified'],'categoryCounts':{c:len(v) for c,v in (pack or {}).get('lines',{}).items()},'missingCategories':(pack or {}).get('missingCategories',[]),'missingCoreCategories':missing,'missingExtended11Categories':missing11,'allGitHashesVerified':bool(rs) and all(r['gitShaMatchesManifest'] and r['gitShaMatchesStatus'] for r in rs),'allWorktreeFilesMatchMain':bool(rs) and all(r['worktreeMatchesCommitted'] for r in rs),'manifestPin':pins[0],'statusPin':sp,'originalSourceGroupIds':sorted({x.get('originalSourceDeclared',{}).get('group') for x in rs if x.get('originalSourceDeclared',{}).get('group')}),'sourceSpeakerVerified':False,'note':'Mixed native-source reuse and synthesis; engine at pack level does not classify individual clips. No inference from proxy model.'})
counts=collections.Counter(x['classification'] for x in cliprecords.values())
summary={'schema':'ggd.priority81.main-committed-audio@1','revision':REV,'sourceCommit':'dcbd136a3','mergedPr':'https://github.com/adms/GGD/pull/1182','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'heroCount':81,'heroesWithCommittedCharacterPack':sum(h['packPresent'] for h in perhero),'heroesWithoutCommittedCharacterPack':[h['runtimeHeroId'] for h in perhero if not h['packPresent']],'uniqueClipPaths':len(cliprecords),'classificationCounts':dict(counts),'allCommittedClipHashesPass':not any('committed-clip' in x['problem'] for x in issues),'worktreeClipFilesMatch':sum(r['worktreeMatchesCommitted'] for r in cliprecords.values()),'requiredCoreCategories':required,'heroesCompleteCore':sum(h['packPresent'] and not h['missingCoreCategories'] for h in perhero),'extended11Categories':extended,'heroesCompleteExtended11':sum(h['packPresent'] and not h['missingExtended11Categories'] for h in perhero),'originalSourceUniquePathsVerified':len(nativechecks),'originalSourceReuseRows':len(sourcemappings),'issues':issues,'limitations':['Main committed assets verified independently from the moving worktree.','Original means transformed source-file reuse, not verified original actor/character identity.','Synthetic own-reference label is recorded from status metadata; no speaker audit performed.','No runtime playback or generation performed.']}
put('main-committed-summary.json',summary);put('main-committed-per-hero.json',{'schema':'ggd.priority81.main-per-hero-audio@1','heroes':perhero});put('main-committed-clip-audit.json',{'schema':'ggd.priority81.main-audio-clips@1','revision':REV,'files':list(cliprecords.values())});put('main-original-source-mappings.json',{'schema':'ggd.priority81.explicit-original-audio-mapping@1','revision':REV,'mappings':sourcemappings});put('main-committed-index-pins.json',{'files':pins})
shutil.copyfile(__file__,O/'audit-main-committed.py');print(json.dumps(summary,ensure_ascii=False,indent=2))
