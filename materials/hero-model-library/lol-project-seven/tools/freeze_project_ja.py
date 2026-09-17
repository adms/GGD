import sys

from pathlib import Path
import argparse,datetime,hashlib,json,subprocess
from scope_guard import load_scope
p=argparse.ArgumentParser();p.add_argument('--control',type=Path,required=True);p.add_argument('--source-root',type=Path);p.add_argument('--metadata-root',type=Path,required=True);p.add_argument('--decoder',type=Path,required=True);a=p.parse_args();scope=load_scope(a.control);root=(a.source_root or Path(scope['sourceLocalRoot'])).resolve();metadata=a.metadata_root.resolve();by_hero={h['nativeId']:h for h in scope['heroes']};cat=json.loads((root/'sources/ja_JP-character-wads.json').read_text());by_name={x['name'].rsplit('/',1)[1]:x for x in cat['files']}
if cat['releaseId'] != scope['releaseId']: raise ValueError('Unexpected official source release')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
recovery_root=root/'audio/pcm16-recovery-project-seven'
subprocess.run([sys.executable,str(Path(__file__).with_name('recover_project_ja.py')),'--control',str(a.control),'--decoder',str(a.decoder),'--input-intake',str(root/'audio'),'--output-root',str(recovery_root)],check=True,capture_output=True,text=True)
recovery_pointer=json.loads((recovery_root/'latest-recovery-receipt.json').read_text());recovery_report=Path(recovery_pointer['reportPath']);recovery=json.loads(recovery_report.read_text());recoveries={(x['nativeId'],x['source']):x for x in recovery['files']}
files=[];packages=[];groups=[];frozen_paths=set();non_audio=[];skipped=[]
for dp in sorted(root/'audio/decoded'/(n+'.ja_JP')/'decoding.json' for n in scope['allowedFreezeNames']):
 d=json.loads(dp.read_text());native_id=dp.parent.name;er=root/'audio/packages'/native_id/'extraction.json';e=json.loads(er.read_text());name=native_id+'.wad.client';ap=root/'receipts'/(name+'.json')
 recovered=[]
 for x in d['files']:
  if x.get('decoded'):continue
  r=recoveries.get((native_id,x['source']))
  if r is None:continue
  recovered.append(r)
  x.update(decoded=True,output=r['outputPath'],bytes=r['bytes'],sha256=r['sha256'],sampleFormat='float32',pcm={k:r[k] for k in ['seconds','frames','channels','sampleRate','peakAbsFloat','samplesAboveUnity']},recoveredNativePcm16=True)
 if any(not x.get('decoded') for x in d['files']) or e['errors'] or not ap.exists():
  skipped.append(dict(nativeId=native_id,rawDecoderFailedCount=d['failedCount'],effectiveFailedCount=sum(not x.get('decoded') for x in d['files']),extractionErrors=e['errors']));continue
 acquisition=json.loads(ap.read_text());assert acquisition['locale']=='ja_JP' and acquisition['manifestSha256']==cat['manifestSha256'];assert e['originalSha256']==acquisition['sha256']
 package_files=[]
 for x in d['files']:
  assert x['decoded'];p=dp.parent/x['output'];assert p.stat().st_size==x['bytes'] and sha(p)==x['sha256'];pcm=x['pcm']
  f=dict(path=p.relative_to(root).as_posix(),bytes=x['bytes'],sha256=x['sha256'],seconds=pcm['seconds'],frames=pcm['frames'],channels=pcm['channels'],sampleRate=pcm['sampleRate'],sampleFormat=x['sampleFormat'],bitsPerSample=32 if x['sampleFormat']=='float32' else 16,format='WAV',sourcePath=(er.parent/'media'/x['source']).relative_to(root).as_posix(),sourceSha256=x['sourceSha256'],nativeId=native_id,reportedLocale='ja_JP',sourceManifestLocale='ja_JP',perClipLanguageVerified=False,confirmedVoice=False,pcmPayloadVerified=True,peakAbsFloat=pcm.get('peakAbsFloat'),samplesAboveUnity=pcm.get('samplesAboveUnity',0),gainDecisionRequired=pcm.get('samplesAboveUnity',0)>0,eventBindingsVerified=False)
  files.append(f);package_files.append(f)
 packages.append(dict(nativeId=native_id,sourceWad=acquisition['path'],bytes=acquisition['bytes'],sha256=acquisition['sha256'],officialManifestFlags=by_name[name]['flags'],manifestFileSizeVerified=True,manifestChunkOrderAndTargetSizesVerified=True,extractionReport=er.relative_to(root).as_posix(),extractionReportSha256=sha(er),decodingReport=dp.relative_to(root).as_posix(),decodingReportSha256=sha(dp),nativeAudioBanks=len(e['nativeAudioBanks']),wemFiles=len(e['media']),pcmWavCount=len(package_files),audioSeconds=sum(f['seconds'] for f in package_files),errors=[],rawDecoderFailedCount=d['failedCount'],exactPcm16RecoveryCount=len(recovered),effectiveFailedCount=0,validation='WAD/WPK/RIFF bounds plus vgmstream source and output frame/rate/channel agreement'))
 groups.append(dict(id='lol-'+native_id.lower().replace('.','-').replace('_','-')+'-16-18-8159717',name='League of Legends / '+native_id.split('.')[0]+' / ja_JP / 16.18.8159717',heroIds=[by_hero[native_id.split('.')[0]]['heroId']],pathPrefixes=[(dp.parent/'wav').relative_to(root).as_posix()+'/'],reportedLanguage='ja_JP',languageEvidence='Riot official manifest flag ja_JP; per-clip listening pending',speakerVerified=False,languageVerified=False))
 if recovered:
  groups[-1]['pathPrefixes'].append((recovery_root/native_id/'wav').relative_to(root).as_posix()+'/')
  frozen_paths.update(p for p in (recovery_root/native_id).rglob('*') if p.is_file())
  frozen_paths.add(recovery_report)
 frozen_paths.update(p for p in er.parent.rglob('*') if p.is_file());frozen_paths.update(p for p in dp.parent.rglob('*') if p.is_file());frozen_paths.add(ap);frozen_paths.add(root/acquisition['path'])
 for c in by_name[name]['chunks']:
  frozen_paths.add(root/'original-chunks'/c['bundleId']/(c['chunkId']+'.zstd'));frozen_paths.add(root/'receipts'/(c['chunkId']+'.json'))
for er in sorted(root/'audio/packages'/(n+'.ja_JP')/'extraction.json' for n in scope['allowedFreezeNames']):
 e=json.loads(er.read_text());native_id=er.parent.name;name=native_id+'.wad.client';ap=root/'receipts'/(name+'.json')
 if e['errors'] or e['media'] or e['nativeAudioBanks'] or not ap.exists():continue
 acquisition=json.loads(ap.read_text());assert acquisition['sha256']==e['originalSha256']
 non_audio.append(dict(nativeId=native_id,sourceWad=acquisition['path'],bytes=acquisition['bytes'],sha256=acquisition['sha256'],nativeAudioBanks=0,wemFiles=0,pcmWavCount=0,status='complete-wad-no-audio-entries',confirmedVoicedCharacter=False))
 frozen_paths.update(p for p in er.parent.rglob('*') if p.is_file());frozen_paths.add(ap);frozen_paths.add(root/acquisition['path'])
 for c in by_name[name]['chunks']:
  frozen_paths.add(root/'original-chunks'/c['bundleId']/(c['chunkId']+'.zstd'));frozen_paths.add(root/'receipts'/(c['chunkId']+'.json'))
assert len(packages)==7 and not skipped and not non_audio and {p['nativeId'].split('.')[0] for p in packages}==set(scope['allowedFreezeNames'])
assert packages and len(files)==len({f['path'] for f in files})
assert all(sum(any(f['path'].startswith(p) for p in g['pathPrefixes']) for g in groups)==1 for f in files)
frozen_paths.update(p for p in (root/'sources').glob('*') if p.is_file())
allfiles=[dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(frozen_paths)]
now=datetime.datetime.now(datetime.timezone.utc);totals=dict(completeWads=len(packages)+len(non_audio),completeAudioWads=len(packages),nonAudioWads=len(non_audio),pcmWavCount=len(files),audioSeconds=sum(f['seconds'] for f in files),audioBytes=sum(f['bytes'] for f in files),nativeWemFiles=sum(p['wemFiles'] for p in packages),nativeBanks=sum(p['nativeAudioBanks'] for p in packages),filesWithSamplesAboveUnity=sum(f['gainDecisionRequired'] for f in files),confirmedVoiceCount=None,synthesisReadyGroups=0,exactPcm16Recoveries=sum(p['exactPcm16RecoveryCount'] for p in packages),packagesWithUnresolvedErrors=len(skipped))
d=dict(schema='ggd-immutable-local-audio-delivery@1',createdAt=now.isoformat(),sourceId='lol-project-seven-ja-jp-16.18.8159717',localRoot=str(root),sourceGame='League of Legends',sourcePlatform='macOS / Windows shared official content release',sourceUrl=cat['sourceUrl'],sourceVersionApi='https://sieve.services.riotcdn.net/api/v1/products/lol/version-sets/EUW1?q[platform]=windows&q[published]=true',patchVersion=cat['patchVersion'],releaseId=cat['releaseId'],manifestSha256=cat['manifestSha256'],locale='ja_JP',author='Riot Games; official public patch CDN',channel='official-game-resource-cdn',deliveryFrozen=True,scope='Only the seven project heroes; all earlier full-roster source files remain but are outside this subset.',packages=packages,nonAudioPackages=non_audio,incompletePackages=skipped,files=files,allFiles=allfiles,audioGroups=groups,totals=totals,synthesisReady=False,validation=dict(allReferencedFilesRehashed=True,manifestSizeAndChunkOrderVerified=True,wadWpkRiffBoundsVerified=True,decodedFrameRateChannelsMatchNativeMetadata=True,perClipSpeakerVerified=False,perClipLanguageVerified=False,eventBindingsVerified=False),notes=['Official manifest flags establish source-package locale; internal en_us paths do not establish language.','All original compressed CDN chunks, WADs, native banks and WEM media remain; this manifest indexes float32 WAV derivatives once per media stream.','Float32 preserves source peaks above unity; gain decisions are required before playback or integer encoding for flagged clips. No normalization, fade, loops or resampling was added.','This delivery is restricted to Karthus, LeeSin, Lux, MissFortune, Warwick, Xerath, Yasuo. English and full-roster acquisition are disabled.','No installed game files or user credentials were read or changed by the acquisition.'])
out=metadata/'deliveries'/('local-audio-delivery-'+now.strftime('%Y%m%dT%H%M%S%fZ')+'.json');out.parent.mkdir(exist_ok=True)
with out.open('x') as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
r=dict(localRoot=str(root),manifestPath=str(out),manifestSha256=sha(out),**totals);(metadata/'latest-seven-delivery-receipt.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False,indent=2))
