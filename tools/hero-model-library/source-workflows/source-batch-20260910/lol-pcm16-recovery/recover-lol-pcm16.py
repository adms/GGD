import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import argparse,array,datetime,hashlib,json,math,struct,subprocess
p=argparse.ArgumentParser();p.add_argument('--input-intake',type=Path,required=True);p.add_argument('--output-root',type=Path,required=True);p.add_argument('--decoder',type=Path,default=Path('/private/tmp/ggd-vgmstream-r2117/cli/vgmstream-cli'));a=p.parse_args();root=a.input_intake.resolve();out=a.output_root.resolve();out.mkdir(parents=True,exist_ok=True)
assert out!=root and not root.is_relative_to(out)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def chunks(b):
 assert b[:4]==b'RIFF' and b[8:12]==b'WAVE' and struct.unpack_from('<I',b,4)[0]+8==len(b)
 result={};offset=12
 while offset<len(b):
  tag,n=struct.unpack_from('<4sI',b,offset);start=offset+8;assert start+n<=len(b) and tag not in result;result[tag]=b[start:start+n];offset=start+n+(n%2 if start+n<len(b) else 0)
 assert offset==len(b) and b'fmt ' in result and b'data' in result;return result
def pcm16(b, native=False):
 c=chunks(b);codec,ch,rate,byte_rate,block,bits=struct.unpack_from('<HHIIHH',c[b'fmt ']);assert (codec==1 or (native and codec==65534)) and bits==16 and ch>0 and block==ch*2 and byte_rate==rate*block and len(c[b'data'])%block==0, 'PCM16 header layout differs from verified standard/Wwise little-endian sample layout'
 return c[b'data'],ch,rate,len(c[b'data'])//block
records=[];unrecovered=[]
for dp in sorted((root/'decoded').glob('*/decoding.json')):
 d=json.loads(dp.read_text());native_id=dp.parent.name;assert all(c.isalnum() or c in '._-' for c in native_id)
 for row in d['files']:
  if row.get('decoded'):continue
  original=(Path(d['inputDirectory'])/row['source']).resolve();existing=(dp.parent/'wav'/Path(row['source']).with_suffix('.wav')).resolve()
  assert original.is_relative_to(root) and existing.is_relative_to(root)
  if not original.is_file() or not existing.is_file():continue
  try:
   original_sha=sha(original);assert original_sha==row['sourceSha256'];existing_sha=sha(existing)
   native,ch,rate,n=pcm16(original.read_bytes(),native=True);decoded,c2,r2,n2=pcm16(existing.read_bytes());assert (ch,rate,n)==(c2,r2,n2) and native==decoded and n>0
   meta=json.loads(subprocess.check_output([str(a.decoder),'-m','-i','-I',str(original)],text=True,timeout=30))
   assert meta['encoding']=='16-bit Little Endian PCM', 'Native encoding is not signed PCM16LE'
   assert (meta['channels'],meta['sampleRate'],meta['numberOfSamples'],meta['playSamples'])==(ch,rate,n,n)
   sample=array.array('h',decoded)
   if sys.byteorder!='little':sample.byteswap()
   floating=array.array('f',(v/32768.0 for v in sample));assert all(math.isfinite(x) for x in floating)
   back=array.array('h',(int(x*32768.0) for x in floating))
   if sys.byteorder!='little':back.byteswap()
   assert back.tobytes()==decoded
   if sys.byteorder!='little':floating.byteswap()
   data=floating.tobytes();fmt=struct.pack('<HHIIHH',3,ch,rate,rate*ch*4,ch*4,32);wave=b'RIFF'+struct.pack('<I',36+len(data))+b'WAVEfmt '+struct.pack('<I',16)+fmt+b'data'+struct.pack('<I',len(data))+data
   dest=out/native_id/'wav'/Path(row['source']).with_suffix('.wav');receipt=out/native_id/'receipts'/Path(row['source']).with_suffix('.json');dest.parent.mkdir(parents=True,exist_ok=True);receipt.parent.mkdir(parents=True,exist_ok=True)
   result=dict(nativeId=native_id,source=row['source'],inputWemPath=str(original),inputWemSha256=original_sha,originalPcm16Path=str(existing),originalPcm16Sha256=existing_sha,originalDecodingReport=str(dp),originalDecodingReportSha256=sha(dp),path=dest.relative_to(out).as_posix(),outputPath=str(dest),bytes=len(wave),sha256=hashlib.sha256(wave).hexdigest(),seconds=n/rate,frames=n,channels=ch,sampleRate=rate,sampleFormat='float32',bitsPerSample=32,peakAbsFloat=max(abs(v)/32768 for v in sample),samplesAboveUnity=0,pcmPayloadSha256=hashlib.sha256(data).hexdigest(),pcm16PayloadSha256=hashlib.sha256(decoded).hexdigest(),nativePcm16EqualsExistingDecoderPayload=True,allSamplesRoundTripExactly=True,frameRateChannelsMatchNativeMetadata=True,scaleDivisor=32768.0,normalizationApplied=False,originalFilesChanged=False,recovered=True)
   if dest.exists() or receipt.exists():
    assert dest.is_file() and receipt.is_file() and sha(dest)==result['sha256'];assert json.loads(receipt.read_text())==result
   else:
    with dest.open('xb') as f:f.write(wave)
    with receipt.open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
   assert sha(original)==original_sha and sha(existing)==existing_sha;records.append(result)
  except (AssertionError,ValueError,OSError,KeyError,struct.error,subprocess.SubprocessError) as exc:unrecovered.append(dict(nativeId=native_id,source=row['source'],reason=str(exc) or 'Strict native PCM16/reconstruction checks did not all pass',originalDecoderError=row.get('error')))
now=datetime.datetime.now(datetime.timezone.utc);report=dict(schema='ggd-lossless-pcm16-float32-recovery@1',createdAt=now.isoformat(),inputIntake=str(root),localRoot=str(out),sourceReportsUnchanged=True,originalFilesUnchanged=True,files=records,recoveredCount=len(records),unrecovered=unrecovered,synthesisReady=False,perClipLanguageVerified=False,transformation='Exact signed int16 / 32768 to IEEE float32; each float scaled back exactly reproduces every input PCM16 sample')
reports=out/'reports';reports.mkdir(exist_ok=True);rp=reports/('recovery-'+now.strftime('%Y%m%dT%H%M%S%fZ')+'.json')
with rp.open('x') as f:f.write(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
last=dict(reportPath=str(rp),reportSha256=sha(rp),recoveredCount=len(records),unrecoveredCount=len(unrecovered),localRoot=str(out));(out/'latest-recovery-receipt.json').write_text(json.dumps(last,indent=2)+'\n');print(json.dumps(last,ensure_ascii=False,indent=2))
