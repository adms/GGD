"""Decode the six acquired Cattiva cries to PCM Float32; preserve source MP3s."""
import json,struct,subprocess,hashlib,math
from pathlib import Path
root=Path(__file__).resolve().parents[1];acq=json.loads((root/'acquisition.json').read_text());rows=[]
for item in acq['files']:
 source=root/item['path'];out=root/'decoded'/f"{source.stem}.wav"
 if not out.exists():subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(source),'-map','0:a:0','-c:a','pcm_f32le',str(out)],check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)],text=True));stream=probe['streams'][0]
 assert stream['codec_name']=='pcm_f32le'
 b=out.read_bytes();assert b[:4]==b'RIFF' and b[8:12]==b'WAVE';at=12;pcm=None
 while at+8<=len(b):
  kind=b[at:at+4];size=struct.unpack_from('<I',b,at+4)[0];at+=8;data=b[at:at+size];assert len(data)==size
  if kind==b'data':pcm=data
  at+=size+(size%2)
 assert pcm is not None and len(pcm)%(4*stream['channels'])==0
 vals=[x[0] for x in struct.iter_unpack('<f',pcm)];assert all(math.isfinite(x) for x in vals)
 frames=len(pcm)//(4*stream['channels']);seconds=frames/int(stream['sample_rate'])
 row={**item,'decodedPath':str(out),'decodedRelativePath':str(out.relative_to(root)),'decodedSha256':hashlib.sha256(b).hexdigest(),'decodedBytes':len(b),'pcmDataSha256':hashlib.sha256(pcm).hexdigest(),'codec':'pcm_f32le','sampleRate':int(stream['sample_rate']),'channels':stream['channels'],'frames':frames,'seconds':seconds,'peak':max(map(abs,vals)),'eventEvidence':'Source HTML soundboard label; semantics/identity not individually listening-reviewed','classification':'creature-cry-source-labelled-unreviewed','reportedLanguage':None,'nativeContainerAcquired':False}
 rows.append(row)
report={'schema':'ggd.cattiva.audio-analysis@1','sourceUrl':acq['sourceUrl'],'audioFileCount':len(rows),'seconds':sum(r['seconds'] for r in rows),'originalMP3Count':len(rows),'decodedPCMCount':len(rows),'countingNote':'MP3+PCM are two representations of 6 cries, not 12 unique sounds. Not a spoken dialogue or synthesis dataset.','nativeWwiseBankAcquired':False,'files':rows}
(root/'analysis/audio-analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'count':len(rows),'seconds':report['seconds'],'events':[{k:r[k] for k in ['event','seconds','sampleRate','channels']} for r in rows]},indent=2))
