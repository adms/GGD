from pathlib import Path
import argparse, collections, concurrent.futures, hashlib, json, subprocess, sys, wave

BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-ps2-first-batch')
# Resolve shared repository independently of intake nesting.
sys.path.insert(0,'/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-hero-model-options/tools/hero-model-library')
from extract_public_sources import unpack_native_archive
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def process(slug):
 root=BASE/('spritedatabase-'+slug)
 if (root/'files.sha256.json').exists():raise RuntimeError('Already frozen; never overwrite')
 acq=json.loads((root/'acquisition.json').read_text());assert acq.get('completeDownload') and acq['sha256']==sha(Path(acq['path']))
 if not (root/'extracted').exists():unpack_native_archive(Path(acq['path']),root/'extracted')
 source=[p for p in sorted((root/'extracted').rglob('*')) if p.is_file()]
 assert source and all(p.suffix.lower()=='.wav' for p in source),'unexpected formats require explicit classification'
 def inspect(p):
  with wave.open(str(p),'rb') as w:
   assert w.getcomptype()=='NONE' and w.getnframes()>0
   channels,rate,width,frames=w.getnchannels(),w.getframerate(),w.getsampwidth(),w.getnframes()
   actual=w.readframes(frames);assert len(actual)==frames*channels*width
  r=subprocess.run(['/usr/local/bin/ffmpeg','-v','error','-nostdin','-i',str(p),'-f','null','-'],capture_output=True,text=True)
  assert r.returncode==0 and not r.stderr,(p,r.stderr)
  return {'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p),'seconds':frames/rate,'frames':frames,'sampleRate':rate,'channels':channels,'sampleWidthBytes':width,'format':'wav-pcm','classification':'voice-source-labelled' if p.name.startswith('VOICE_') else 'character-audio-unclassified','sourceLabel':p.name,'normalization':'source-already-PCM-preserved-byte-for-byte','ffmpegFullDecode':'pass','voiceIdentityReview':'author-labelled-character; not manually auditioned'}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:audio=list(pool.map(inspect,source))
 character={'archer':'Archer / EMIYA','shirou':'Emiya Shirou','saber':'Saber / Artoria Pendragon'}[slug]
 prefixes=sorted(set(str(p.relative_to(root).parent)+'/' for p in source))
 counts=collections.Counter(a['classification'] for a in audio)
 index={'schema':'ggd.audio-file-index.intake@1','localRoot':str(root),'sourceId':'spritedatabase-fate-ps2-'+slug,'sourceGame':'Fate/unlimited codes','sourcePlatform':'PS2','sourcePage':acq['sourcePage'],'author':'Nightmare','sourceTerms':'Site states private or non-commercial use; original creators retain rights. No broader rights inferred.','audioGroups':[{'id':slug+'-character-audio','character':character,'heroIds':[],'pathPrefixes':prefixes,'manualReview':'pending','classification':'mixed-source-voice-labels-and-unclassified-data'}],'files':audio,'fileCount':len(audio),'totalSeconds':sum(a['seconds'] for a in audio),'classificationCounts':dict(counts),'validation':'All WAV headers, complete frame payloads and FFmpeg full decodes passed.','synthesisReady':False}
 save(root/'audioFileIndex.json',index)
 save(root/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(root),'candidates':[],'reason':'Archive contains character audio only; no mesh, rig, animation or VFX.'})
 save(root/'validation.json',{'schema':'ggd.source-validation.intake@1','sourceId':index['sourceId'],'sourcePlatform':'PS2','archiveSha256':acq['sha256'],'archiveBytes':acq['bytes'],'safeExtraction':'libarchive complete read; path/link/size checks before extraction','fileCount':len(source),'extractedBytes':sum(p.stat().st_size for p in source),'sourceFormats':dict(collections.Counter(p.suffix.lower() for p in source)),'fullDecodeAllFiles':True,'decodeErrors':0,'normalization':'All source files are PCM WAV, no lossy or redundant conversion.','models':0,'animations':0,'vfx':0,'classificationCounts':dict(counts),'manualReview':'pending','freezeStatus':'complete-frozen'})
 files=[]
 bypath={a['path']:a for a in audio}
 for p in sorted(root.rglob('*')):
  if p.is_file() and p.name!='files.sha256.json':
   rel=str(p.relative_to(root));row={'path':rel,'bytes':p.stat().st_size,'sha256':sha(p)}
   if rel in bypath:row['seconds']=bypath[rel]['seconds']
   files.append(row)
 save(root/'files.sha256.json',{'schema':'ggd.source-files.intake@1','localRoot':str(root),'freezeStatus':'complete-frozen','files':files})
 result={'sourceId':index['sourceId'],'localRoot':str(root),'audioFileIndex':str(root/'audioFileIndex.json'),'audioIndexSha256':sha(root/'audioFileIndex.json'),'fileManifest':str(root/'files.sha256.json'),'fileManifestSha256':sha(root/'files.sha256.json'),'audioFiles':len(audio),'seconds':index['totalSeconds'],'classificationCounts':dict(counts)}
 print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
 return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('slugs',nargs='+',choices=['archer','shirou','saber']);args=parser.parse_args()
 for slug in args.slugs:process(slug)
