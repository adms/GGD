#!/usr/bin/env python3
"""Write seven-character lookup rows referencing an immutable PCM delivery."""
import argparse,datetime,hashlib,json
from pathlib import Path
from scope_guard import load_scope

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,d):
    text=json.dumps(d,ensure_ascii=False,indent=2)+'\n'
    if p.exists() and p.read_text()==text:return
    temporary=p.with_suffix(p.suffix+'.tmp');temporary.write_text(text);temporary.replace(p)
p=argparse.ArgumentParser();p.add_argument('--control',type=Path,required=True);p.add_argument('--metadata-root',type=Path,required=True);a=p.parse_args()
meta=a.metadata_root.resolve();scope=load_scope(a.control);pointer=meta/'latest-seven-delivery-receipt.json';receipt=json.loads(pointer.read_text());manifest=Path(receipt['manifestPath']);assert sha(manifest)==receipt['manifestSha256'];d=json.loads(manifest.read_text());root=Path(d['localRoot']);assert d['locale']=='ja_JP' and len(d['packages'])==7
sourceMeta=manifest.parent.parent;manifestRelative=manifest.relative_to(sourceMeta).as_posix()
reviewPath=meta/'listening-review-queue.json';review=json.loads(reviewPath.read_text());assert review['schema']=='ggd-lol-listening-review-queue@1' and review['sourceId']==d['sourceId']
registrationPath=meta/'runtime-registration.json';registration=json.loads(registrationPath.read_text());assert registration['schema']=='ggd-lol-approved-battle-runtime-registration@1' and registration['sourceId']==d['sourceId']
registeredByNative={native:0 for native in {h['nativeId'] for h in scope['heroes']}}
for row in registration['records']: registeredByNative[row['nativeId']]+=1
reviewByNative={r['nativeId']:r for r in review['summary']['byCharacter']};assert set(reviewByNative)=={h['nativeId'] for h in scope['heroes']}
pkgs={p['nativeId'].split('.')[0]:p for p in d['packages']};characters=[]
eventReports=[]
for path in sorted((meta/'event-bindings').glob('*.json')):
    event=json.loads(path.read_text());assert event['schema']=='ggd-lol-native-event-bindings@1'
    assert event['sourceId']==d['sourceId'] and event['nativeId'] in {h['nativeId'] for h in scope['heroes']}
    assert event['validation']['eventBindingsVerified'] is True
    assert event['validation']['speakerVerified'] is False and event['validation']['perClipLanguageVerified'] is False
    assert event['validation']['ggdSkillSemanticBindingsVerified'] is False
    eventReports.append(dict(path=path.relative_to(meta).as_posix(),sha256=sha(path),heroId=event['heroId'],
        nativeId=event['nativeId'],skinId=event['skinId'],mappedEvents=event['validation']['mappedEvents'],
        mappedWemIds=event['validation']['mappedWemIds'],eventBindingsVerified=True,speakerVerified=False,
        perClipLanguageVerified=False,ggdSkillSemanticBindingsVerified=False))
for h in scope['heroes']:
    name=h['nativeId'];native=name+'.ja_JP';p=pkgs[name];groups=[g for g in d['audioGroups'] if h['heroId'] in g['heroIds']];rows=[f for f in d['files'] if f['nativeId']==native]
    assert len(groups)==1 and len(rows)==p['pcmWavCount']
    bindings=[r for r in eventReports if r['nativeId']==name]
    rr=reviewByNative[name];assert rr['files']==sum(r['mappedWemIds'] for r in bindings)
    characters.append(dict(heroId=h['heroId'],name=h['name'],nativeId=native,work='League of Legends',sourceId=d['sourceId'],reportedLanguage='ja_JP',languageEvidence='Riot official release manifest ja_JP flag; approved battle clips additionally have per-clip owner listening decisions',groupIds=[g['id'] for g in groups],pathPrefixes=groups[0]['pathPrefixes'],pcmWavCount=len(rows),seconds=sum(f['seconds'] for f in rows),sourceWad=p['sourceWad'],sourceWadSha256=p['sha256'],nativeAudioBanks=p['nativeAudioBanks'],nativeWemCount=p['wemFiles'],nativeEventBindingReports=[r['path'] for r in bindings],nativeEventBoundFiles=sum(r['mappedWemIds'] for r in bindings),nativeEventMappedEvents=sum(r['mappedEvents'] for r in bindings),eventBindingCoverage='partial-by-skin' if bindings else 'not-started',nativeTargetCandidateFiles=rr['nativeTargetCandidates'],battleReviewCandidateFiles=rr['battleReviewCandidates'],listeningReviewApprovedFiles=rr['runtimeApproved'],runtimeRegisteredFiles=registeredByNative[name],listeningReviewComplete=rr['runtimeApproved']==rr['battleReviewCandidates'],modelDefaultChanged=False,languageVerified=False,speakerVerified=False,confirmedVoiceCount=None,transcriptStatus='not-transcribed',synthesisReady=False,runtimeSelectable=registeredByNative[name]>0,englishPackageAcquired=False))
index=dict(schema='ggd.project-seven-voice-subset@1',localRoot=str(root),metadataRoot=str(meta),sourceMetadataRoot=str(sourceMeta),scopeConfig='project-seven-config.json',sourceDelivery=dict(path=str(manifest),relativePath=manifestRelative,sha256=sha(manifest)),audioFileIndex=dict(reportPath=str(manifest),reportSha256=sha(manifest),rowsProperty='files',rowNativeIdProperty='nativeId'),listeningReview=dict(queuePath=reviewPath.relative_to(meta).as_posix(),queueSha256=sha(reviewPath),pagePath='listening-review.html',decisionsPath='listening-review-decisions.json',runtimeRegistrationPath='runtime-registration.json',runtimeRegistrationSha256=sha(registrationPath),uniqueWavFiles=review['summary']['uniqueWavFiles'],nativeTargetCandidates=review['summary']['nativeTargetCandidates'],battleReviewCandidates=review['summary']['battleReviewCandidates'],runtimeApproved=review['summary']['runtimeApproved'],runtimeRegistered=registration['summary']['runtimeRegistered'],runtimeConfigChanged=True,productionDeployed=False),characters=characters,audioGroups=d['audioGroups'],nativeEventBindingReports=eventReports,totals={**d['totals'],'nativeEventBindingReports':len(eventReports),'nativeEventBoundUniqueFiles':sum(r['mappedWemIds'] for r in eventReports),'nativeEventMappedEvents':sum(r['mappedEvents'] for r in eventReports),'nativeTargetCandidateFiles':review['summary']['nativeTargetCandidates'],'battleReviewCandidateFiles':review['summary']['battleReviewCandidates'],'listeningReviewApprovedFiles':review['summary']['runtimeApproved'],'runtimeRegisteredFiles':registration['summary']['runtimeRegistered']},scope=dict(fullRosterEnabled=False,englishEnabled=False,heroIds=[h['heroId'] for h in scope['heroes']]),notes=['Resolve every PCM path from sourceDelivery.files against localRoot.','This index references complete original native and PCM files; approved battle clips additionally have runtime MP3 derivatives.','Native event reports prove only the listed skin and WEM relationships; per-clip decisions are authoritative only for the reviewed battle subset.','Approved and runtime registered do not mean production deployed; deployment remains false until verified separately.','Seven Japanese source packages only; older full-roster files remain preserved outside this subset.'])
write(meta/'seven-voice-index.json',index)
gitPaths=[meta/'project-seven-config.json',*sorted((meta/'control').glob('*.json')),meta/'guard-validation.json',meta/'README.md',meta/'seven-voice-index.json',pointer,*sorted((meta/'event-bindings').glob('*.json')),meta/'listening-review-decisions.json',meta/'listening-review-queue.json',meta/'listening-review-queue.md',meta/'listening-review-receipt.json',meta/'listening-review.html',registrationPath,*sorted((meta/'tools').glob('*.py'))]
gitManifest=dict(schema='ggd.seven-voice-git-handoff@1',metadataRoot=str(meta),sourceLocalRoot=str(root),allowedContent='scripts, settings, immutable index manifests, SHA-256 and docs only',files=[dict(path=p.relative_to(meta).as_posix(),bytes=p.stat().st_size,sha256=sha(p)) for p in gitPaths],audioBinaryCount=0,nativeBinaryCount=0,largeNativeDeliveryIndex=dict(path=manifestRelative,absolutePath=str(manifest),bytes=manifest.stat().st_size,sha256=sha(manifest),storage='keep local; root may archive separately; compact Git index references this receipt'))
write(meta/'git-handoff-files.json',gitManifest)
final=dict(metadataRoot=str(meta),localRoot=str(root),manifestPath=str(manifest),manifestSha256=sha(manifest),voiceIndexPath=str(meta/'seven-voice-index.json'),voiceIndexSha256=sha(meta/'seven-voice-index.json'),gitHandoffPath=str(meta/'git-handoff-files.json'),gitHandoffSha256=sha(meta/'git-handoff-files.json'),scopeControlPath=str(a.control.resolve()),totals=index['totals'],characters=[{k:c[k] for k in ['heroId','name','nativeId','pcmWavCount','seconds','nativeEventBoundFiles','nativeEventMappedEvents','eventBindingCoverage']} for c in characters],defaultChanged=False,centralFilesChanged=True)
write(meta/'seven-character-handoff-receipt.json',final);print(json.dumps(final,ensure_ascii=False,indent=2))
