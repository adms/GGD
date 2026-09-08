"""Extract complete ZIP members as the official archive downloads, then unpack JMP.
No game executables are launched. Every ZIP member gets CRC/size verification.
"""
import argparse
import collections
import hashlib
import json
import re
import struct
import time
import zlib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / '300heroes'
EVIDENCE = ROOT / 'evidence'
DOWNLOAD = GAME/'downloads/300hero_v202609021.zip.part'
CLIENT = GAME/'client'
RAW = GAME/'raw'
LOG = EVIDENCE/'300-extraction-events.jsonl'

def event(kind, **kwargs):
    data = dict(time=time.strftime('%Y-%m-%dT%H:%M:%S%z'),event=kind,**kwargs)
    with LOG.open('a') as f:f.write(json.dumps(data,ensure_ascii=False)+'\n')
    print(json.dumps(data,ensure_ascii=False),flush=True)

def decode(value):
    try:return value.decode('utf-8')
    except UnicodeDecodeError:return value.decode('gb18030')

def safe_path(name):
    name=name.replace('\\','/').removeprefix('#')
    if name.startswith('../'):name=name[3:]
    path=PurePosixPath(name)
    if path.is_absolute() or any(p in ('..','') for p in path.parts):
        raise ValueError(f'Unsafe archive path: {name!r}')
    return str(path).lower()

def category(name):
    n=name.lower();ext=Path(n).suffix
    if '/audio/' in n or ext in ('.bank','.fsb','.wav','.ogg','.mp3'):return 'audio'
    if '/character/' in n:
        if ext=='.x':return 'character_model_animation'
        if ext in ('.dds','.tga','.png','.bmp'):return 'character_texture'
        return 'character_support'
    if '/effect/' in n or '/magic/' in n or ext in ('.fx','.psh','.vsh'):return 'vfx'
    if ext in ('.ani','.mtn'):return 'animation_other'
    return 'other_support'

def unpack_jmp(path):
    done=EVIDENCE/(path.name+'.extracted.json')
    if done.exists():return
    counts=collections.Counter();failures=[];total=0;duplicates=0;md5_bad=0
    manifest=EVIDENCE/(path.name+'.assets.jsonl')
    RAW.mkdir(parents=True,exist_ok=True)
    with path.open('rb') as src, manifest.open('w') as inventory:
        src.seek(50);count=struct.unpack('<i',src.read(4))[0]
        if not 0<count<100000:raise ValueError(f'Invalid JMP entry count {count}')
        event('jmp_start',package=path.name,entries=count)
        src.seek(54);index=src.read(count*304)
        for i in range(count):
            rec=index[i*304:(i+1)*304]
            name=rec[:260].split(b'\0')[0]
            if not name or name==b'_INVALID_BLOCK_':continue
            try:
                name=decode(name);rel=safe_path(name)
                offset,packed,size=struct.unpack_from('<iii',rec,260)
                if offset<54+count*304 or packed<0 or offset+packed>path.stat().st_size:
                    raise ValueError('Invalid JMP payload bounds')
                src.seek(offset);blob=src.read(packed)
                data=zlib.decompress(blob) if size>0 else blob
                if size>0 and len(data)!=size:raise ValueError('JMP uncompressed size mismatch')
                digest=hashlib.md5(data).hexdigest()
                expected=rec[272:304].split(b'\0')[0].decode('ascii',errors='replace').lower()
                match=(digest==expected) if re.fullmatch('[a-f0-9]{32}',expected) else None
                if match is False:md5_bad+=1
                dest=RAW/rel
                dest.parent.mkdir(parents=True,exist_ok=True)
                stored=rel
                if dest.exists():
                    if hashlib.md5(dest.read_bytes()).hexdigest()==digest:
                        duplicates+=1
                    else:
                        # Retain differing versions without replacing an existing payload.
                        stored=f'_alternates/{path.stem}/{i}/{rel}'
                        dest=RAW/stored;dest.parent.mkdir(parents=True,exist_ok=True)
                        dest.write_bytes(data)
                else:dest.write_bytes(data)
                kind=category(rel);counts[kind]+=1;total+=len(data)
                inventory.write(json.dumps(dict(path=stored,original_path=name,package=path.name,
                    entry=i,bytes=len(data),md5=digest,source_md5=expected,source_md5_match=match,
                    category=kind),ensure_ascii=False)+'\n')
            except Exception as error:
                failures.append(dict(entry=i,path=str(name),error=str(error)))
        summary=dict(package=path.name,entries=count,extracted=sum(counts.values()),bytes=total,
                     categories=dict(counts),identical_duplicates=duplicates,md5_mismatches=md5_bad,failures=failures)
    done.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    event('jmp_done',**{k:v for k,v in summary.items() if k!='failures'},failed=len(failures))

def extract_member(info):
    dest=CLIENT/info['name']
    if dest.exists() and dest.stat().st_size==info['raw']:return dest
    srcpath=DOWNLOAD if DOWNLOAD.exists() else DOWNLOAD.with_suffix('')
    if srcpath.stat().st_size<info['offset']+30:return None
    with srcpath.open('rb') as src:
        src.seek(info['offset']);hdr=src.read(30)
        signature,version,flags,method,mt,md,crc,comp,uncomp,nlen,xlen=struct.unpack('<4s5H3L2H',hdr)
        if signature!=b'PK\x03\x04' or flags&1:raise ValueError('Invalid or encrypted ZIP member')
        start=info['offset']+30+nlen+xlen
        if srcpath.stat().st_size<start+info['packed']:return None
        src.seek(start);remaining=info['packed'];outcrc=0;written=0
        inflater=zlib.decompressobj(-15) if method==8 else None
        if method not in (0,8):raise ValueError(f'Unsupported ZIP method {method}')
        dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix(dest.suffix+'.part')
        event('zip_member_start',member=info['name'])
        with temp.open('wb') as out:
            while remaining:
                block=src.read(min(2**20,remaining));remaining-=len(block)
                if not block:raise ValueError('Unexpected ZIP EOF')
                data=inflater.decompress(block) if inflater else block
                out.write(data);written+=len(data);outcrc=zlib.crc32(data,outcrc)
            if inflater:
                data=inflater.flush();out.write(data);written+=len(data);outcrc=zlib.crc32(data,outcrc)
                if not inflater.eof:raise ValueError('Incomplete deflate stream')
        if written!=info['raw'] or outcrc!=info['crc32']:raise ValueError('ZIP CRC/size mismatch')
        temp.replace(dest)
        event('zip_member_done',member=info['name'],bytes=written,crc32=outcrc)
    return dest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');args=parser.parse_args()
    index=json.loads((EVIDENCE/'300heroes-zip-index.json').read_text())
    packages=[x for x in index if re.fullmatch(r'Data\d*\.jmp',x['name'])]
    while True:
        pending=[]
        for item in packages:
            path=extract_member(item)
            if path:unpack_jmp(path)
            else:pending.append(item['name'])
        if not pending:
            event('all_jmp_packages_done',packages=len(packages));return
        if not args.watch:
            event('awaiting_download',packages=pending);return
        time.sleep(15)

if __name__=='__main__':main()
