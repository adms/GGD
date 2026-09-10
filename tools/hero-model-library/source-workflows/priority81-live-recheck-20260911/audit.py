#!/usr/bin/env python3
"""Read-only central audit; outputs scoped evidence and never changes registry files."""
import concurrent.futures,datetime,gzip,hashlib,json,subprocess
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; REPO=ROOT/'GGD-hero-model-options'; M=REPO/'materials/hero-model-library'; OUT=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text())
h=read(M/'priority-81-handoff.json');v=read(M/'voice-index.json');s=read(M/'lol-project-seven/seven-voice-index.json');d=read(s['sourceDelivery']['path']);assert sha(s['sourceDelivery']['path'])==s['sourceDelivery']['sha256']
manifest=M/v['sourceFileManifest'];assert sha(manifest)==v['sourceFileManifestSha256'];blob=gzip.decompress(manifest.read_bytes());assert hashlib.sha256(blob).hexdigest()==v['uncompressedFileManifestSha256']
selected_groups={'gamevault-palworld-jetragon-cries:jetragon-cries','gamevault-palworld-astralym-audio:astralym-cries','palworld-cattiva-gamevault:cattiva-cries','parallel-ps-jumpforce-audio:JForce_Dai'}
seven_by_path={str(Path(d['localRoot'])/r['path']):r for r in d['files']}; coverage=Counter(); selected=[]
for line in blob.splitlines():
 r=json.loads(line);p=str(ROOT/r['path'])
 if p in seven_by_path:coverage[seven_by_path[p]['nativeId']]+=1
 if r['groupId'] in selected_groups:selected.append(dict(r,absolutePath=p,indexOrigin='central-voice-index'))
for r in d['files']:
 selected.append(dict(r,absolutePath=str(Path(d['localRoot'])/r['path']),groupId='lol-project-seven:'+r['nativeId'],indexOrigin='project-seven-fixed-index',category='source-ja-package-unreviewed',synthesisReady=False))
popp=next(r for r in h['heroes'] if r['heroId']=='b2-popp')
for r in popp['audio']['mainCommittedFiles']:selected.append(dict(r,absolutePath=r['localPath'],groupId='ggd-synthetic:b2-popp',indexOrigin='priority-81-handoff',category=r['classification'],synthesisReady=False))
def verify(r):
 p=Path(r['absolutePath']);out=dict(r,exists=p.is_file());out['currentSha256']=sha(p) if p.is_file() else None;out['sha256Matches']=out['currentSha256']==r['sha256'];out['currentBytes']=p.stat().st_size if p.is_file() else None;return out
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as e:rows=list(e.map(verify,selected))
by_group=defaultdict(list)
for r in rows:by_group[r['groupId']].append(r)
# Decode all Palworld clips plus one each from Dai, LOL seven, Popp. This is structural audio verification only.
decode=[]
for group,rs in by_group.items():
 examples=rs if 'palworld' in group else rs[:1]
 for r in examples:
  cp=subprocess.run(['ffmpeg','-v','error','-nostdin','-i',r['absolutePath'],'-f','null','-'],capture_output=True,text=True,timeout=30)
  decode.append({'groupId':group,'absolutePath':r['absolutePath'],'sha256':r['currentSha256'],'decoderExitCode':cp.returncode,'stderr':cp.stderr[-2000:],'listened':False})
active=[next(m for m in r['candidateModels'] if m['modelKey']==r['activeModelKey']) for r in h['heroes']]
model_files=[]
for hero,m in zip(h['heroes'],active):
 for key in ['document','glb']:
  f=m[key];model_files.append({'heroId':hero['heroId'],'kind':key,'path':f['localPath'],'expectedSha256':f['sha256'],'actualSha256':sha(f['localPath'])})
reg=read(M/'priority-registration.json');dl=read(M/'download-sources.json');sources={r['id'] for r in dl['publicSources']+dl.get('paidSources',[])}
# VFX here only proves authoritative ability documents and referenced VFX documents exist.
ability_rows=[];vfxpaths=set();ability_missing=[]
for hero in h['heroes']:
 c=read(hero['champion']['localPath']);ids=[a['id'] if isinstance(a,dict) else a for a in c.get('abilities',{}).values()]+[c.get('passiveAbility'),c.get('exAbility')]
 for aid in ids:
  if not aid:continue
  ap=REPO/'content/abilities'/f'{aid}.json'
  if not ap.exists():ability_missing.append(str(ap));continue
  a=read(ap);keys={a['vfxKey']} if a.get('vfxKey') else set();keys.update(x['vfxKey'] for x in a.get('vfxLayers',[]) if x.get('vfxKey'))
  vfxpaths.update(keys);ability_rows.append({'heroId':hero['heroId'],'abilityId':aid,'path':str(ap),'sha256':sha(ap),'vfxKeys':sorted(keys)})
missing_vfx=[x for x in sorted(vfxpaths) if not (REPO/'content/vfx'/f'{x}.json').exists()]
summary={'schema':'ggd.priority-audio-live-recheck@1','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repoHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'centralFilesChanged':False,'awsAccessed':False,'downloadedNewAssets':False,
 'inputs':[{'absolutePath':str(p),'sha256':sha(p)} for p in [M/'priority-81-handoff.json',M/'priority-registration.json',M/'voice-index.json',manifest,M/'lol-project-seven/seven-voice-index.json',Path(s['sourceDelivery']['path'])]],
 'model':{'priorityHeroCount':len(h['heroes']),'activeModelHashesChecked':len(model_files),'activeModelHashMismatches':sum(r['expectedSha256']!=r['actualSha256'] for r in model_files),'activeModelFilesAndMappingsPassRecorded':h['summary']['activeModelFilesAndMappingsPass'],'registeredCandidateCount':h['summary']['registeredCandidateCount'],'registrationStatusCounts':dict(Counter(x.get('status') for x in reg['heroes'])),'visualAndGameplayAcceptanceByThisAudit':False,'deploymentVerified':False},
 'motion':{'activeAnimationRows':sum(m.get('actualAnimationCount',0) for m in active),'activeUniqueBinaries':len({m['glb']['sha256'] for m in active}),'mappedStateCounts':dict(Counter(m.get('mappedStateCount') for m in active)),'distinctMappedClipCountDistribution':dict(Counter(m.get('distinctMappedClipCount') for m in active)),'sourceExplicitNativeCountHeroes':sum(m.get('nativeAnimationCountDeclaredBySourceIndex') is not None for m in active),'sourceExplicitNativeCounts':[{'heroId':r['heroId'],'name':r['name'],'nativeCount':m.get('nativeAnimationCountDeclaredBySourceIndex'),'proceduralCount':m.get('proceduralAnimationCountDeclaredBySourceIndex')} for r,m in zip(h['heroes'],active) if m.get('nativeAnimationCountDeclaredBySourceIndex') is not None],'warning':'Animation rows/state mappings are not a native or original-character animation completeness claim.'},
 'vfx':{'abilityDocumentsChecked':len(ability_rows),'uniqueVfxKeysReferenced':len(vfxpaths),'missingAbilityDocuments':ability_missing,'missingReferencedVfxDocuments':missing_vfx,'sourceNativeVfxCompletionCount':None,'visualOrGameplayVerificationPerformed':False},
 'voiceAndSfx':{'baselineAudioSummaryRecorded':h['summary'],'mainCommittedClassificationCountsRecorded':h['audioSummary']['mainCommittedVoice']['classificationCounts'],'heroesWithExplicitAbilitySfxRecorded':h['audioSummary']['heroesWithExplicitAbilitySfx'],'selectedAudioRows':len(rows),'selectedUniquePaths':len({r['absolutePath'] for r in rows}),'hashVerifiedFiles':sum(r['sha256Matches'] for r in rows),'hashMismatches':[r['absolutePath'] for r in rows if not r['sha256Matches']],'bytes':sum(r['currentBytes'] or 0 for r in rows),'decodeChecked':len(decode),'decodeFailed':sum(r['decoderExitCode']!=0 for r in decode),'listeningPerformed':False,'languageOrSpeakerVerifiedByThisAudit':False,'groups':{g:{'files':len(rs),'shaVerified':sum(r['sha256Matches'] for r in rs),'bytes':sum(r['currentBytes'] or 0 for r in rs),'exampleAbsolutePath':rs[0]['absolutePath'],'exampleSha256':rs[0]['currentSha256']} for g,rs in by_group.items()}},
 'lolSeven':{'totalsRecorded':s['totals'],'sourceIdRegisteredInDownloadSources':'lol-project-seven-ja-jp-16.18.8159717' in sources,'centralIndexedRowsByNativeId':dict(coverage),'scopedDeliveryFilesByNativeId':dict(Counter(r['nativeId'] for r in d['files'])),'scopeExpanded':False},
 'gaps':['Popp native/original source audio is not explicitly mapped; existing 12-clip GGD pack is synthetic-own-reference-labelled.','Dai 261 OGG source-labelled files are from JUMP FORCE, not Infinity Strash. No new Infinity Strash native audio was established.','Vearn audio source audit has zero acquired files; do not substitute Baran or W3X proxy audio.','Palworld 18 selected files are nonverbal sound effects; central source groups remain pending-character-mapping and unreviewed.','LOL seven 4,927 files are float32 decode reserves; 2,264 report samples above unity, pending gain decision/listening/event binding.','Priority handoff records all 81 local model mappings but does not establish all-native animation completeness, visual gameplay acceptance, backend switching or deployment.']}
for name,data in [('audit-summary.json',summary),('verified-audio-files.json',rows),('audio-decode-evidence.json',decode),('active-model-hash-check.json',model_files),('ability-vfx-document-check.json',ability_rows)]:
 (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(OUT/'verified-audio-files.sha256').write_text(''.join(f"{r['currentSha256']}  {r['absolutePath']}\n" for r in rows))
print(json.dumps({k:summary[k] for k in ['model','motion','vfx','lolSeven']},ensure_ascii=False,indent=2));print(json.dumps({'audioRows':len(rows),'hashMismatches':len(summary['voiceAndSfx']['hashMismatches']),'decodeChecked':len(decode),'decodeFailures':summary['voiceAndSfx']['decodeFailed'],'output':str(OUT)},ensure_ascii=False))
