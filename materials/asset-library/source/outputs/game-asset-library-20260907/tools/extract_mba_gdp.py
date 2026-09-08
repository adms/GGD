"""Unpack MBA GDP archives. Layout reference: Acewell, ZenHAX topic 7163.
u32 count; count records of char name[260], u32 size, u32 absolute offset.
"""
import argparse,collections,hashlib,json,struct
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parent.parent
GAME=ROOT/'magical-battle-arena'

def decode(b):
    try:return b.decode('cp932')
    except UnicodeDecodeError:return b.decode('utf-8')

def extract(source):
    raw=GAME/'raw';raw.mkdir(exist_ok=True);records=[];errors=[]
    for p in sorted(source.rglob('*.gdp')):
        b=p.read_bytes();count=struct.unpack_from('<I',b,0)[0]
        if count>100000 or 4+count*268>len(b):raise ValueError('Invalid GDP index size')
        for i in range(count):
            off=4+i*268;name=decode(b[off:off+260].split(b'\0')[0]).replace('\\','/')
            safe=PurePosixPath(name)
            if safe.is_absolute() or '..' in safe.parts or ':' in name:raise ValueError('Unsafe GDP path')
            size,offset=struct.unpack_from('<II',b,off+260)
            if offset<4+count*268 or offset+size>len(b):raise ValueError(f'GDP payload out of bounds: {p.name}/{name}')
            data=b[offset:offset+size];sha=hashlib.sha256(data).hexdigest();dest=raw/name
            if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=sha:dest=raw/'_variants'/p.stem/name
            dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            records.append(dict(path=str(dest.relative_to(raw)),archive=p.name,entry=i,bytes=size,sha256=sha,extension=dest.suffix.lower()))
        print(json.dumps(dict(archive=p.name,files=count,bytes=len(b))),flush=True)
    for p in sorted(source.rglob('*.chr')):
        data=p.read_bytes();dest=raw/'CharacterDefinitions'/p.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
        records.append(dict(path=str(dest.relative_to(raw)),archive='loose_file',bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),extension='.chr'))
    (GAME/'asset-index.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records))
    summary=dict(source=str(source),files=len(records),bytes=sum(r['bytes'] for r in records),extensions=dict(collections.Counter(r['extension'] for r in records)),errors=errors)
    (ROOT/'evidence/mba-gdp-extraction.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);extract(p.parse_args().source)
