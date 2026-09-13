from pathlib import Path
import array, collections, datetime, hashlib, importlib.util, json, math, shutil, struct, subprocess, sys

BASE = Path.cwd() / 'GGD-Asset-Library/intake/public-models-20260910'
ROOT = BASE / 'kof-mai-iori-audio-motion-round21/iori-xv-audio'
SOURCE_ID = 'kof-xv-iori-audio-float32-v1'
HERO = 'community-review-02-20260907'
FFMPEG = Path('/usr/local/bin/ffmpeg')
FFPROBE = '/usr/local/bin/ffprobe'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('x') as f: json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
def row(p): return dict(path=p.relative_to(ROOT).as_posix(), bytes=p.stat().st_size, sha256=sha(p))

receipt = json.loads((ROOT/'download-receipt.json').read_text())
archive = ROOT/'original'/receipt['filename']
assert archive.stat().st_size == receipt['expectedBytes'] and sha(archive)==receipt['expectedSha256']
assert archive.read_bytes()[:6] == b'7z\xbc\xaf\x27\x1c'
extractor = Path('GGD-hero-model-options/tools/hero-model-library/extract_public_sources.py').resolve()
spec = importlib.util.spec_from_file_location('source_extract', extractor)
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
dest = ROOT/'extracted'; assert not dest.exists()
mod.unpack_native_archive(archive, dest)
native = [row(p) for p in sorted(dest.rglob('*')) if p.is_file()]
save(ROOT/'extraction-validation.json', dict(schema='ggd.safe-archive-extraction@1', archive=row(archive),
    method='system libarchive full read and CRC validation; path/type/link/duplicate/size checks before writes', files=native,
    fileCount=len(native), formatCounts=dict(collections.Counter(Path(x['path']).suffix for x in native))))
files=[]
for item in native:
    source=ROOT/item['path']; assert source.suffix.lower()=='.ogg', item['path']
    probe=json.loads(subprocess.check_output([FFPROBE,'-v','error','-show_streams','-of','json',str(source)],timeout=30))
    audio=[s for s in probe['streams'] if s.get('codec_type')=='audio']; assert len(audio)==1
    stream=audio[0]; assert stream['codec_name']=='vorbis'
    rate=int(stream['sample_rate']); channels=int(stream['channels'])
    result=subprocess.run([str(FFMPEG),'-v','error','-nostdin','-i',str(source),'-map','0:a:0','-c:a','pcm_f32le','-f','f32le','-'],capture_output=True,timeout=45)
    assert result.returncode==0 and not result.stderr, result.stderr
    raw=result.stdout; assert len(raw)>0 and len(raw)%(channels*4)==0
    samples=array.array('f',raw)
    if sys.byteorder!='little': samples.byteswap()
    assert all(math.isfinite(s) for s in samples)
    frames=len(raw)//(channels*4); peak=max(map(abs,samples)); above=sum(abs(s)>1 for s in samples)
    fmt=struct.pack('<HHIIHH',3,channels,rate,rate*channels*4,channels*4,32)
    wav=b'RIFF'+struct.pack('<I',36+len(raw))+b'WAVEfmt '+struct.pack('<I',16)+fmt+b'data'+struct.pack('<I',len(raw))+raw
    output=(ROOT/'decoded-audio'/source.relative_to(dest)).with_suffix('.wav'); output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as f:f.write(wav)
    final=json.loads(subprocess.check_output([FFPROBE,'-v','error','-show_streams','-of','json',str(output)],timeout=30))['streams'][0]
    assert final['codec_name']=='pcm_f32le' and int(final['sample_rate'])==rate and final['channels']==channels
    assert int(final['duration_ts'])==frames
    files.append(dict(**row(output), seconds=frames/rate, frames=frames, sampleRate=rate, channels=channels,
        bitsPerSample=32, sampleFormat='float32', format='WAV', pcmPayloadVerified=True,
        pcmPayloadSha256=hashlib.sha256(raw).hexdigest(), sourcePath=item['path'], sourceSha256=item['sha256'],
        sourceFormat='vorbis', nativeId=source.stem, sourceCategory='voice-label-unreviewed',
        categoryEvidence='miner600 source post describes character packages as voicefiles; individual contents not listened',
        confirmedVoice=False, reportedLanguage=None, perClipLanguageVerified=False, speakerVerified=False,
        peakAbsFloat=peak, samplesAboveUnity=above, gainDecisionRequired=above>0,
        normalizationApplied=False, clippingApplied=False, resamplingApplied=False))

groups=[dict(id='XV_Iori-voice-label-unreviewed',name='The King of Fighters XV / Iori Yagami / source-labelled voice',
    heroIds=[HERO], pathPrefixes=['decoded-audio/XV_Iori/'], reportedLanguage=None,
    languageEvidence='The source post does not explicitly label KOF XV language. Individual clip language unreviewed.',
    speakerVerified=False, audioCategory='voice-label-unreviewed')]
assert all(any(f['path'].startswith(p) for p in groups[0]['pathPrefixes']) for f in files)
totals=dict(sourceAudioCount=len(native), pcmWavCount=len(files), audioSeconds=sum(f['seconds'] for f in files),
    audioBytes=sum(f['bytes'] for f in files), nativeFormats={'vorbis':len(files)},
    filesWithSamplesAboveUnity=sum(f['gainDecisionRequired'] for f in files), maxPeakAbsFloat=max(f['peakAbsFloat'] for f in files),
    confirmedVoiceCount=None, synthesisReadyGroups=0, nativeAnimationCount=0, uniqueCharacterSfxCount=0)
proof=dict(schema='ggd.kof-float32-audio-validation@1',sourceId=SOURCE_ID, nativeFiles=native, files=files, totals=totals,
    allFinite=True, sourceRateChannelsPreserved=True, wavFramesVerified=True,
    ffmpegVersion=subprocess.check_output([str(FFMPEG),'-version'],text=True).splitlines()[0],ffmpegSha256=sha(FFMPEG),
    normalizationApplied=False,clippingApplied=False,perClipLanguageVerified=False,perClipSpeakerVerified=False,synthesisReady=False)
save(ROOT/'audio-validation.json',proof)
tools=ROOT/'tools'; tools.mkdir()
for src, filename in [(Path(__file__), 'validate-iori.py'), (Path('/private/tmp/ggd-kof-round21-acquire-iori.py'),'acquire-iori.py'),(extractor,'extract_public_sources.py')]: shutil.copyfile(src,tools/filename)
now=datetime.datetime.now(datetime.timezone.utc)
out=ROOT/'deliveries'/('local-audio-delivery-'+now.strftime('%Y%m%dT%H%M%S%fZ')+'.json')
delivery=dict(schema='ggd-immutable-local-audio-delivery@1',sourceId=SOURCE_ID,createdAt=now.isoformat(),localRoot=str(ROOT),deliveryFrozen=True,
    name='Iori Yagami', nativeId='XV_Iori', sourceGame='The King of Fighters XV', sourcePlatform='author does not identify platform or game patch',
    sourceUrl='https://mugenfreeforall.com/topic/47510-some-game-soundrips/',author='miner600',channel='community-forum-author-share',
    declaredLanguage=None,sourceFormat='OGG', audioProvenance='Author-described original game voice rip; numeric native clip IDs retained.',
    packages=[dict(filename=archive.name,sourceArchive=archive.relative_to(ROOT).as_posix(),bytes=archive.stat().st_size,sha256=sha(archive),
        publisherSha256Verified=True,validationReport='audio-validation.json',validationReportSha256=sha(ROOT/'audio-validation.json'),allFilesVerified=True)],
    files=files,allFiles=[row(p) for p in sorted(ROOT.rglob('*')) if p.is_file()],audioGroups=groups,totals=totals,
    validation=dict(allReferencedFileSizesAndSha256Rechecked=True,pcmPayloadLengthVerified=True,perClipLanguageVerified=False,
        perClipSpeakerVerified=False,transcriptStatus='not-transcribed'),synthesisReady=False,
    notes=['The supplied archive contains source-labelled voice audio, not native animations or isolated character SFX.',
        'Original OGG and 7z preserved; Float32 retains peaks with no normalization or clipping.',
        'Acquisition counts are not verified speaker/voice/language counts. No synthesis performed.',
        'No S3 upload or backend/default change performed by this workflow.'])
for x in delivery['allFiles']:
    p=ROOT/x['path']; assert p.stat().st_size==x['bytes'] and sha(p)==x['sha256']
save(out,delivery)
entry=dict(id=SOURCE_ID,target='KOF XV／八神庵原包音訊／Float32',heroIds=[HERO],ownerEntryIds=[],
    url=delivery['sourceUrl'],uploader='miner600',format='Original 7z / OGG Vorbis / Float32 WAV',accessStatus='public-direct-download',
    acquisitionStatus='downloaded-verified',readiness='audio-intake-pending-listening-review',purchaseDecision='free-source-acquired-do-not-buy-duplicate',
    defaultEligible=False,resourceRole='audio-supplement',localPath=str(ROOT),sourceGame=delivery['sourceGame'],
    platform='Unknown; source post does not identify platform or patch',selectionClass='canonical-game',discoveryChannel='community-forum-public-soundrip',
    assetKinds=['audio'],publicationStatus='local-only-not-uploaded',files=[],packages=delivery['packages'],
    backendIntegration=dict(required=True,state='pending-audio-review',selectionVerified=False),
    audioFileIndex=dict(reportPath=out.relative_to(ROOT).as_posix(),reportSha256=sha(out)),audioGroups=groups,
    audioAcquisition=totals,primaryAudioFormats=['.wav'],reportedLanguage=None,languageEvidence=groups[0]['languageEvidence'],
    verification='Complete source archive, all extracted OGG and all Float32 WAV SHA checked. Every WAV payload, frame count, sample rate and channel count checked; per-clip language and speaker pending review.',
    mappingEvidence='Author archive XV_Iori mapped to Iori Yagami; not per-clip speaker confirmation.',
    originalDownload=dict(page=receipt['downloadPage'],url=receipt['downloadUrl'],bytes=receipt['bytes'],sha256=receipt['sha256']))
save(ROOT/'public-source-entry.json',entry)
handoff=dict(localRoot=str(ROOT),manifestPath=str(out),manifestSha256=sha(out),entryPath=str(ROOT/'public-source-entry.json'),
    entrySha256=sha(ROOT/'public-source-entry.json'),**totals,
    gitEligible=['public-source-entry.json','tools/acquire-iori.py','tools/validate-iori.py','tools/extract_public_sources.py'])
save(Path('/private/tmp/ggd-kof-round21-iori-receipt.json'),handoff)
print(json.dumps(handoff,ensure_ascii=False,indent=2))
