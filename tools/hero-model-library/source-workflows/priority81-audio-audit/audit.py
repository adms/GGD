#!/usr/bin/env python3
"""Read-only bounded audit; all outputs isolated, no source conversion/publication."""
import collections, concurrent.futures, datetime, gzip, hashlib, json, pathlib, re, shutil, subprocess
WS=pathlib.Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT')
REPO=WS/'GGD-hero-model-options'
OUT=WS/'outputs/priority-81-handoff-20260911/audio-audit'
OUT.mkdir(parents=True,exist_ok=True)
assert not (OUT/'summary.json').exists()
REV='b6686109a2946664827e8e59529de670b844d7c6'
inputs={};issues=[]
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def pin(p):
 p=p.resolve();r={'path':str(p),'bytes':p.stat().st_size,'sha256':digest(p)};inputs[str(p)]=r;return r
def read(p):
 if p.is_relative_to(REPO/'content'):
  rel=p.relative_to(REPO).as_posix();b=subprocess.check_output(['git','show',REV+':'+rel],cwd=REPO)
  inputs['git:'+REV+':'+rel]={'path':str(p),'revision':REV,'gitPath':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
  return json.loads(b)
 pin(p);return json.loads(p.read_text())
def put(n,d):
 p=OUT/n;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');return {'path':str(p),'bytes':p.stat().st_size,'sha256':digest(p)}
REG=REPO/'materials/hero-model-library/priority-registration.json'
VI=REPO/'materials/hero-model-library/voice-index.json'
registration=read(REG)['heroes'];assert len(registration)==81
index=read(VI);groupmap={g['id']:g for g in index['groups']}
scopeids={h['heroId'] for h in registration}|{h['runtimeHeroId'] for h in registration}
downloads=read(REPO/'materials/hero-model-library/download-sources.json')
sources={s['id']:s for s in downloads.get('publicSources',[])+downloads.get('paidSources',[])}
sevenp=REPO/'materials/hero-model-library/lol-project-seven/seven-voice-index.json'
seven=read(sevenp);sevencfg=read(sevenp.parent/'project-seven-config.json')
sevenbyhero={c['heroId']:c for c in seven['characters']}
nativebyhero={c['heroId']:c['nativeId'] for c in sevencfg['characters']}
deliveryp=pathlib.Path(seven['audioFileIndex']['reportPath']);delivery=read(deliveryp)
assert digest(deliveryp)==seven['audioFileIndex']['reportSha256']
matches={h['heroId']:[] for h in registration}
for h in registration:
 ids={h['heroId'],h['runtimeHeroId']}
 for g in index['groups']:
  if ids&set(g.get('heroIds',[])):matches[h['heroId']].append((g['id'],'direct-heroId-or-runtimeHeroId'))
 # Only the independently pinned seven-character config establishes this alias.
 if h['heroId'] in nativebyhero:
  native=nativebyhero[h['heroId']]
  exactids={f'local-lol-decoded-audio:{native}',f'local-lol-decoded-audio:{native}.zh_TW'}
  exactids|={g['id'] for g in index['groups'] if g['id'].endswith(':lol-'+native.lower()+'-ja-jp-16-18-8159717')}
  for gid in sorted(exactids):
   if gid in groupmap and gid not in {x[0] for x in matches[h['heroId']]}:matches[h['heroId']].append((gid,'explicit-project-seven-nativeId-alias'))
selectedgroups={g for m in matches.values() for g,_ in m}
vf=VI.parent/index['sourceFileManifest'];vfp=pin(vf)
assert vfp['sha256']==index['sourceFileManifestSha256']
rowsbygroup=collections.defaultdict(list);linecounts=collections.defaultdict(list);rawhash=hashlib.sha256();allrows=0
with gzip.open(vf,'rb') as f:
 for lineno,line in enumerate(f,1):
  rawhash.update(line);allrows+=1;r=json.loads(line)
  if r['groupId'] in selectedgroups:rowsbygroup[r['groupId']].append(r);linecounts[r['groupId']].append(lineno)
assert rawhash.hexdigest()==index['uncompressedFileManifestSha256']
secondary={}
for hero,c in sevenbyhero.items():
 rows=[dict(x,path=str(pathlib.Path(seven['localRoot'])/x['path']),category='unclassified',sourceId=c['sourceId']) for x in delivery['files'] if x.get('nativeId')==c['nativeId']]
 assert len(rows)==c['pcmWavCount'];secondary[hero]=rows

# Original per-file classification labels supplement, but never rewrite, the main index.
metadata={};sourceindexrefs={}
for sid in {groupmap[g]['sourceId'] for g in selectedgroups}:
 s=sources.get(sid,{})
 spec=s.get('audioFileIndex') or s.get('audioConversion') or {}
 rel=spec.get('reportPath') or spec.get('indexPath');expect=spec.get('reportSha256') or spec.get('indexSha256')
 if not rel or not s.get('localPath'):continue
 p=(WS/s['localPath']/rel).resolve()
 if not p.is_file():issues.append({'sourceId':sid,'missingSourceAudioIndex':str(p)});continue
 d=read(p)
 if expect and digest(p)!=expect:issues.append({'sourceId':sid,'sourceAudioIndexShaMismatch':str(p)});continue
 sourceindexrefs[sid]=inputs[str(p)]
 for x in d.get('files',[]):
  if 'path' in x:metadata[str(WS/s['localPath']/x['path'])]=x

def abspath(row):
 p=pathlib.Path(row['path']);return p if p.is_absolute() else WS/p
expected={}
for row in [r for rows in rowsbygroup.values() for r in rows]+[r for rows in secondary.values() for r in rows]:
 p=str(abspath(row));spec=(row.get('bytes'),row.get('sha256'))
 if p in expected and expected[p]!=spec:issues.append({'conflictingFileExpectations':p})
 expected[p]=spec
def check(item):
 path,(size,sh)=item;p=pathlib.Path(path)
 try:
  actualsize=p.stat().st_size;actualsha=digest(p);ok=actualsize==size and actualsha==sh
  return path,{'bytes':actualsize,'sha256':actualsha,'pass':ok,'reason':None if ok else 'size-or-sha-mismatch'}
 except OSError as e:return path,{'pass':False,'reason':type(e).__name__}
print(json.dumps({'phase':'verify-local-assets','uniqueFiles':len(expected),'bytes':sum(v[0] or 0 for v in expected.values()),'groups':len(selectedgroups)}),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:verified=dict(pool.map(check,expected.items()))
for p,v in verified.items():
 if not v['pass']:issues.append({'audioPath':p,**v})
print(json.dumps({'phase':'audio-sha-complete','verified':sum(v['pass'] for v in verified.values()),'issues':len(issues)}),flush=True)
def category(row):
 c=row.get('category','unclassified');md=metadata.get(str(abspath(row)),{})
 label=md.get('classification') or md.get('sourceCategory') or ''
 if c=='sound-effect' or label in {'sfx-label-unreviewed','sound-effect','sfx'}:return 'sfx-source-labelled'
 if c in {'voice-label-unreviewed','voice-filename-candidate'} or label in {'voice-source-labelled','voice-label-unreviewed'}:return 'voice-source-labelled-unreviewed'
 if c=='music' or 'music' in label:return 'music-source-labelled'
 return 'unclassified'
def summarise(rows):
 paths={str(abspath(r)):r for r in rows};classes=collections.Counter();indexclasses=collections.Counter();valid=0;totalbytes=0;secs=0;sethash=hashlib.sha256();examples={}
 for p,r in sorted(paths.items()):
  c=category(r);classes[c]+=1;indexclasses[r.get('category','unclassified')]+=1
  if verified[p]['pass']:valid+=1;totalbytes+=r.get('bytes',0)
  secs+=r.get('seconds',0) or 0
  sethash.update((p+'\0'+str(r.get('sha256'))+'\n').encode())
  examples.setdefault(c,{'path':p,'bytes':r.get('bytes'),'sha256':r.get('sha256'),'localShaVerified':verified[p]['pass']})
 return {'indexedRows':len(rows),'uniquePaths':len(paths),'localShaVerifiedFiles':valid,'localUnavailableOrMismatch':len(paths)-valid,'bytes':totalbytes,'knownSeconds':round(secs,6),'classificationCounts':dict(classes),'originalIndexCategoryCounts':dict(indexclasses),'verifiedFileSetSha256':sethash.hexdigest(),'examplesByClass':examples}

content=REPO/'content'
audio_map=read(content/'config/audio-map.json');cues=read(content/'audio-manifests/ability-sfx-cues.json')
voicecfg=read(content/'config/champion-voices.json')
names=read(content/'assets/audio/voices/names/MANIFEST.json');quotes=read(content/'assets/audio/voices/quotes/quotes.json')
voicepack=read(content/'assets/audio/voices/champions/MANIFEST.json');taunts=read(content/'config/victory-taunts.json')
read(content/'audio-manifests/champ-names.ja-JP.json');read(content/'audio-manifests/taunts.json');read(content/'audio-manifests/sfx-preload.json')
client=REPO/'apps/client/src/audio/combatSfx.ts';pin(client);text=client.read_text()
block=re.search(r'const ELEMENT_SFX[^=]*=\s*\{([^}]+)\}',text).group(1)
elements=dict(re.findall(r'(\w+):\s*"([^"]+)"',block))
for f in ['abilitySfxCues.ts','nameVoice.ts','selectVoiceLadder.ts','championVoice.ts']:pin(client.parent/f)
contentfiles={}
def content_file(rel):
 p=(content/rel).resolve();key=str(p)
 if key not in contentfiles:
  contentfiles[key]={'path':key,'contentPath':rel,'existsLocal':p.is_file()}
  if p.is_file():contentfiles[key].update(bytes=p.stat().st_size,sha256=digest(p))
 return contentfiles[key]
def cliprefs(x):
 out=[]
 if isinstance(x,dict):
  for k,v in x.items():
   if k in {'file','clip','out'} and isinstance(v,str) and re.search(r'\.(wav|mp3|ogg|flac)$',v,re.I):out.append(v)
   else:out+=cliprefs(v)
 elif isinstance(x,list):
  for v in x:out+=cliprefs(v)
 return list(dict.fromkeys(out))
def walk(x,path=''):
 if isinstance(x,dict):
  for k,v in x.items():yield path+'/'+k,k,v;yield from walk(v,path+'/'+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from walk(v,path+'/'+str(i))
herorows=[];group_receipts={};allheroaudiopaths=set();primarydirectheroes=0
for h in registration:
 hid=h['heroId'];rid=h['runtimeHeroId'];aliases={hid,rid};champ=read(content/'champions'/f'{rid}.json')
 gids=matches[hid];allr=[];gr=[]
 for gid,basis in gids:
  g=groupmap[gid];rs=rowsbygroup[gid];allr+=rs
  if gid not in group_receipts:
   group_receipts[gid]={'groupId':gid,'name':g['name'],'sourceId':g['sourceId'],'sourceUrl':g.get('sourceUrl'),'library':g['library'],'sourceWork':g.get('work'),'indexHeroIds':g.get('heroIds',[]),'mappingEvidence':g.get('mappingEvidence'),'reportedLanguage':g.get('reportedLanguage',g.get('language')),'languageEvidence':g.get('languageEvidence'),'speakerVerified':g.get('speakerVerified',False),'listeningReviewComplete':g.get('listeningReviewComplete',False),'confirmedVoiceCount':g.get('confirmedVoiceCount'),'synthesisReady':False,'mainIndexPointer':{'path':str(VI),'groupId':gid},'fileIndexPointer':{'path':str(vf),'sha256':vfp['sha256'],'filter':{'groupId':gid},'firstJsonlLine':min(linecounts[gid]) if linecounts[gid] else None,'lastJsonlLine':max(linecounts[gid]) if linecounts[gid] else None},'sourceAudioIndex':sourceindexrefs.get(g['sourceId']),**summarise(rs)}
  gr.append({'groupId':gid,'mappingBasis':basis,'requiresCentralHeroIdMappingUpdate':basis!='direct-heroId-or-runtimeHeroId'})
 if any(b=='direct-heroId-or-runtimeHeroId' for _,b in gids):primarydirectheroes+=1
 supplement=None
 if hid in secondary:
  rs=secondary[hid];allr+=rs;c=sevenbyhero[hid]
  supplement={'sourceId':c['sourceId'],'nativeId':c['nativeId'],'reportedLanguage':c['reportedLanguage'],'languageEvidence':c['languageEvidence'],'speakerVerified':False,'languageVerified':False,'sourceIndex':inputs[str(sevenp.resolve())],'fileIndex':{**inputs[str(deliveryp.resolve())],'rowsProperty':'files','filter':{'nativeId':c['nativeId']},'localRoot':seven['localRoot']},'pathPrefixes':c['pathPrefixes'],**summarise(rs)}
 allheroaudiopaths.update(str(abspath(r)) for r in allr)
 vc=voicecfg.get('champions',{}).get(rid);nc=names.get('champions',{}).get(rid);qc=quotes.get('quotes',{}).get(rid);pc=voicepack.get('champions',{}).get(rid);tc=taunts.get('roundWin',{}).get(rid)
 nameclips=cliprefs(nc);quoteclips=cliprefs(qc);packclips=cliprefs(pc);authoredclips=cliprefs(vc)
 if vc:authoredclips+=vc.get('select',[])
 for rel in nameclips+quoteclips+packclips+authoredclips+cliprefs(tc):content_file(rel)
 abilities=[];missingdocs=[];audiofields=[];vfxpaths=set()
 for slot,item in champ.get('abilities',{}).items():
  if isinstance(item,dict) and item.get('id'):abilities.append((slot,item['id']))
 for field in ['exAbility','passiveAbility']:
  item=champ.get(field)
  if isinstance(item,dict) and item.get('id'):abilities.append((field,item['id']))
  elif isinstance(item,str):abilities.append((field,item))
 casts=[]
 for slot,aid in abilities:
  ap=content/'abilities'/f'{aid}.json'
  if not ap.exists():missingdocs.append(str(ap));continue
  doc=read(ap);explicit=doc.get('sfxKey');overlay=cues.get('bindings',{}).get(aid);key=overlay if overlay in cues['cues'] else explicit if explicit in cues['cues'] else None
  if key:basis='explicit-ability-cue'
  else:
   parts=str(doc.get('vfxKey','')).split('.')
   key=elements.get(parts[2]) if len(parts)>2 and parts[:2]==['fx','prim'] else None
   basis='shared-element-sfx' if key else 'shared-generic-cast-sfx';key=key or 'abilityCast'
  filepaths=audio_map['sfx'].get(key,{}).get('files',[])
  for rel in filepaths:content_file(rel)
  casts.append({'slot':slot,'abilityId':aid,'cue':key,'basis':basis,'configuredSfxKey':explicit,'overlaySfxKey':overlay,'contentFiles':filepaths})
  for jp,k,v in walk(doc):
   if re.search(r'audio|voice|sound|sfx',k,re.I):audiofields.append({'document':str(ap),'jsonPointer':jp,'value':v})
   if k in {'vfxKey','vfxId'} and isinstance(v,str):vfxpaths.add(v)
 vfxaudio=[]
 for vid in sorted(vfxpaths):
  vp=content/'vfx'/f'{vid}.json'
  if not vp.is_file():continue
  vd=read(vp)
  for jp,k,v in walk(vd):
   if re.search(r'audio|voice|sound|sfx',k,re.I):vfxaudio.append({'vfxId':vid,'jsonPointer':jp,'value':v})
 proxies=[]
 for version in champ.get('modelVersions',[]):
  src=version.get('source',{})
  if src.get('kind') in {'style-proxy','similar','proxy'} or src.get('selectionClass') in {'similar-proxy','similar-texture-modified'}:
   proxies.append({'modelKey':version.get('modelKey'),'character':src.get('character'),'work':src.get('work'),'sourceKind':src.get('kind'),'audioInherited':False})
 stats=summarise(allr)
 herorows.append({'heroId':hid,'runtimeHeroId':rid,'name':champ['name'],'characterAudioStatus':'local-indexed-reserve-unbound' if stats['localShaVerifiedFiles'] else 'no-explicitly-mapped-acquired-audio','mainIndexGroups':gr,'projectSevenJapaneseSupplement':supplement,'characterAudio':stats,'notClaimedAsOriginalSpeaker':True,'synthesisReady':False,'runtimeVoice':{'configPath':'content/config/champion-voices.json','configEntry':vc,'generatedCharacterPackPresent':pc is not None,'characterPackFileCount':len(packclips),'syntheticNamePresent':nc is not None,'syntheticNameFiles':nameclips,'syntheticNameEngine':(nc or {}).get('voice'),'syntheticQuotePresent':qc is not None,'syntheticQuoteFiles':quoteclips,'syntheticQuoteEngine':(qc or {}).get('voice'),'quoteRealFlagDoesNotProveOriginalAudio':bool(qc and qc.get('real')),'authoredSelectFiles':authoredclips,'tauntFiles':cliprefs(tc),'originalSourceAudioAutoBound':False},'runtimeSfx':{'abilityCount':len(abilities),'casts':casts,'explicitAudioFields':audiofields,'vfxAudioFields':vfxaudio,'missingAbilityDocs':missingdocs,'defaultSoundProvenance':'shared GGD audio-map cues, not acquired character-specific recordings'},'modelProxyAudioNotInherited':proxies})

# The generic cues are shared runtime configuration, never a claim of original character SFX.
sharedkeys=['attackWindup','basicAttack','basicAttackHit','abilityCast','castEnd','castInterrupt','projectileHit']
shared={k:audio_map['sfx'][k] for k in sharedkeys if k in audio_map['sfx']}
for ent in shared.values():
 for rel in ent.get('files',[]):content_file(rel)
inputdrift=[p for p,r in inputs.items() if not p.startswith('git:') and digest(pathlib.Path(p))!=r['sha256']]
knownpaths={p for p in allheroaudiopaths if verified[p]['pass']}
summary={'schema':'ggd.priority81.audio-handoff-audit@1','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':str(WS),'repo':str(REPO),'heroCount':81,'directMainIndexHeroCount':primarydirectheroes,'heroesWithMappedLocalAudio':sum(h['characterAudio']['localShaVerifiedFiles']>0 for h in herorows),'heroesWithoutExplicitAudioMapping':sum(h['characterAudio']['localShaVerifiedFiles']==0 for h in herorows),'mainIndexGroups':len(selectedgroups),'sevenJapaneseHeroCount':7,'sevenJapaneseFileRows':len(delivery['files']),'selectedUniqueAudioPaths':len(allheroaudiopaths),'localShaVerifiedAudioFiles':len(knownpaths),'localShaVerifiedAudioBytes':sum(verified[p]['bytes'] for p in knownpaths),'sourceIndexGlobalRowsScanned':allrows,'sourceIndexGzipShaVerified':True,'sourceIndexUncompressedShaVerified':True,'runtimeHeroesWithAuthoredSelectAudio':sum(bool(h['runtimeVoice']['authoredSelectFiles']) for h in herorows),'runtimeHeroesWithGeneratedCharacterPack':sum(h['runtimeVoice']['generatedCharacterPackPresent'] for h in herorows),'runtimeHeroesWithSyntheticName':sum(h['runtimeVoice']['syntheticNamePresent'] for h in herorows),'runtimeHeroesWithSyntheticQuote':sum(h['runtimeVoice']['syntheticQuotePresent'] for h in herorows),'heroesWithExplicitAbilitySfx':sum(any(c['basis']=='explicit-ability-cue' for c in h['runtimeSfx']['casts']) for h in herorows),'contentAudioFilesChecked':len(contentfiles),'contentMissingAudioFiles':[v['contentPath'] for v in contentfiles.values() if not v['existsLocal']],'inputDrift':inputdrift,'issues':issues,'limits':['Source-labelled voices and source-folder character IDs are not per-clip speaker/language verification.','Files verified by current SHA; this audit does not decode/listen or prove production playback.','No model proxy audio inherited. No name-only cross-character matches applied.','A missing explicit mapping does not mean the entire reserve has no possible matching audio.','Synthetic name and quote cues do not count as original game voices.','Source audio reserve is not automatically bound by runtime champion-voices config.'],'centralWrites':False,'newAcquisition':False,'conversion':False}
put('per-hero.json',{'schema':'ggd.priority81.per-hero-audio@1','heroes':herorows})
put('group-audit.json',{'schema':'ggd.priority81.audio-groups@1','groups':list(group_receipts.values())})
put('content-audio-files.json',{'schema':'ggd.priority81.content-audio-files@1','files':list(contentfiles.values()),'sharedRuntimeCues':shared})
put('input-index-pins.json',{'schema':'ggd.priority81.audio-inputs@1','files':list(inputs.values()),'sourceFileIndexGzip':vfp,'uncompressedSha256':rawhash.hexdigest(),'doNotCopyLargeSourceManifests':True})
put('summary.json',summary)
shutil.copyfile(__file__,OUT/'audit.py')
print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
