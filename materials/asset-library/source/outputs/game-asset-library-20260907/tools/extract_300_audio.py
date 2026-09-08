"""Export every valid FSB5 container in unpacked BANK files to OGG/WAV."""
import argparse
import concurrent.futures
import ctypes
import hashlib
import io
import json
import re
import struct
import sys
import wave
from pathlib import Path
from enum import IntEnum

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/python-fsb5'))
import fsb5

class ExtendedFormat(IntEnum):
    NONE=0;PCM8=1;PCM16=2;PCM24=3;PCM32=4;PCMFLOAT=5;GCADPCM=6;IMAADPCM=7
    VAG=8;HEVAG=9;XMA=10;MPEG=11;CELT=12;AT9=13;XWMA=14;VORBIS=15;FADPCM=16;OPUS=17
    @property
    def is_pcm(self):return self in (self.PCM8,self.PCM16,self.PCM32)
    @property
    def file_extension(self):
        return 'ogg' if self==self.VORBIS else 'mp3' if self==self.MPEG else 'wav' if self.is_pcm or self==self.FADPCM else 'bin'

fsb5.SoundFormat=ExtendedFormat
RAW=ROOT/'300heroes/raw'
OUT=ROOT/'300heroes/audio'
LIB=ctypes.CDLL(str(ROOT/'tools/libfadpcm_local.dylib'))
LIB.decode_fadpcm_buffer.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int,ctypes.c_int,ctypes.c_void_p]
LIB.decode_fadpcm_buffer.restype=ctypes.c_int

def rebuild(bank,sample):
    if bank.header.mode!=ExtendedFormat.FADPCM:return bank.rebuild_sample(sample)
    buf=(ctypes.c_int16*(sample.samples*sample.channels))()
    raw=ctypes.create_string_buffer(sample.data)
    code=LIB.decode_fadpcm_buffer(raw,len(sample.data),sample.channels,sample.samples,buf)
    if code:raise ValueError(f'FADPCM layout error {code}')
    target=io.BytesIO()
    with wave.open(target,'wb') as f:
        f.setnchannels(sample.channels);f.setsampwidth(2);f.setframerate(sample.frequency)
        f.writeframes(bytes(buf))
    return target.getvalue()

def extract(path):
    path=Path(path);rel=path.relative_to(RAW)
    target=OUT/rel.with_suffix('');manifest=target/'samples.json'
    if manifest.exists():
        saved=json.loads(manifest.read_text())
        if saved['source_bytes']==path.stat().st_size and manifest.stat().st_mtime_ns>=path.stat().st_mtime_ns and not saved['errors']:
            return dict(bank=str(rel),samples=len(saved['samples']),errors=0,skipped=True)
    target.mkdir(parents=True,exist_ok=True)
    data=path.read_bytes();cursor=0;number=0;records=[];errors=[]
    while True:
        offset=data.find(b'FSB5',cursor)
        if offset<0:break
        try:
            if offset+60>len(data):break
            version,n,hs,ns,ds,mode=struct.unpack_from('<6I',data,offset+4)
            if version>1 or n>100000 or mode>17:
                cursor=offset+4;continue
            # The last FSB sample extends to the parser's input end. A BANK may
            # hold multiple FSB containers, so never pass following containers.
            container_size=(60 if version==1 else 64)+hs+ns+ds
            if offset+container_size>len(data):raise ValueError('FSB payload extends past bank end')
            bank=fsb5.FSB5(data[offset:offset+container_size])
            if offset+bank.raw_size>len(data):raise ValueError('FSB payload extends past bank end')
            for i,sample in enumerate(bank.samples):
                try:
                    clean=re.sub(r'[\\/:*?"<>|\x00-\x1f]','_',sample.name).strip(' .')[:130] or 'unnamed'
                    ext=bank.get_sample_extension();name=f'{number:02d}-{i:04d}-{clean}.{ext}'
                    decoded=rebuild(bank,sample)
                    (target/name).write_bytes(decoded)
                    records.append(dict(file=name,original_name=sample.name,container_offset=offset,
                        container_index=number,sample_index=i,codec=bank.header.mode.name,
                        sample_rate=sample.frequency,channels=sample.channels,sample_count=sample.samples,
                        seconds=round(sample.samples/sample.frequency,6),bytes=len(decoded),
                        sha256=hashlib.sha256(decoded).hexdigest()))
                except Exception as e:
                    preserved=f'{number:02d}-{i:04d}-undecoded.bin'
                    (target/preserved).write_bytes(sample.data)
                    errors.append(dict(container=number,sample=i,name=sample.name,error=str(e),
                        encoded_file=preserved,encoded_bytes=len(sample.data),codec=bank.header.mode.name))
            cursor=offset+bank.raw_size;number+=1
        except Exception as e:
            errors.append(dict(offset=offset,error=str(e)));cursor=offset+4
    manifest.write_text(json.dumps(dict(source=str(rel),source_bytes=len(data),containers=number,
        samples=records,errors=errors),ensure_ascii=False,indent=2)+'\n')
    return dict(bank=str(rel),samples=len(records),errors=len(errors),containers=number)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--bank');p.add_argument('--workers',type=int,default=3);a=p.parse_args()
    banks=[RAW/a.bank] if a.bank else sorted(RAW.rglob('*.bank'))
    results=[]
    with concurrent.futures.ProcessPoolExecutor(max_workers=a.workers) as pool:
        for i,r in enumerate(pool.map(extract,banks)):
            results.append(r)
            if r['errors'] or i%100==0:print(json.dumps(dict(done=i+1,total=len(banks),**r),ensure_ascii=False),flush=True)
    report=dict(banks=len(results),samples=sum(r['samples'] for r in results),errors=sum(r['errors'] for r in results),details=results)
    (ROOT/'evidence/300-audio-extraction.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='details'}),flush=True)
