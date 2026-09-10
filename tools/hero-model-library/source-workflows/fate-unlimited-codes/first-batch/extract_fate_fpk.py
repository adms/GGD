#!/usr/bin/env python3
"""Read-only FPK inventory/extraction for Fate/unlimited codes research.

PRS decoding is adapted from shadow-nero/FPKCodes (GPL-3.0), commit
2b18af9390ca80eddee47ab7c4affbaf82a873c8, PRSUncompressor.cs.
https://github.com/shadow-nero/FPKCodes
Retain that project's LICENSE and attribution when distributing this file.

This does not patch EBOOT, rebuild ISOs, decode DRM or execute any game code.
Only synthetic fixtures have been verified; a real native FPK is still needed.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, struct

LIMIT_FILE=256_000_000
LIMIT_TOTAL=1_000_000_000

def prs_decode(data, expected):
    if not 0 <= expected <= LIMIT_FILE:raise ValueError('Uncompressed size exceeds limit')
    pos=0;bits=0;flag=0;out=bytearray()
    def byte():
        nonlocal pos
        if pos>=len(data):raise ValueError('Truncated PRS stream')
        v=data[pos];pos+=1;return v
    def flags(n):
        nonlocal flag,bits
        result=0
        for _ in range(n):
            if not bits:flag=byte();bits=8
            result=(result<<1)|((flag>>7)&1);flag=(flag<<1)&255;bits-=1
        return result
    while pos<len(data):
        if len(out)>=expected:raise ValueError('Trailing encoded bytes beyond declared output')
        if flags(1):out.append(byte())
        else:
            if flags(1)==0:length=flags(2)+2;distance=byte()-256
            else:
                value=(byte()<<8)|byte();value-=65536
                length=value&7;distance=value>>3
                length=byte()+1 if length==0 else length+2
            start=len(out)+distance
            if start<0 or start>=len(out) or len(out)+length>expected:raise ValueError('Invalid PRS back-reference')
            for i in range(length):out.append(out[start+i])
    if len(out)!=expected:raise ValueError('Declared PRS output length mismatch')
    return bytes(out)

def parse(blob):
    if len(blob)<16:raise ValueError('Truncated FPK header')
    integrity,count,padding,length=struct.unpack_from('<4I',blob)
    if not 0<count<=10000 or 16+48*count>len(blob):raise ValueError('Invalid FPK entry count')
    if length!=len(blob):raise ValueError('Declared file length mismatch; do not guess format variant')
    entries=[];seen=set();total=0
    for i in range(count):
        raw,offset,csize,usize=struct.unpack_from('<36sIII',blob,16+48*i)
        raw=raw.split(b'\0',1)[0];name=raw.decode('ascii');path=PurePosixPath(name)
        if not name or path.is_absolute() or '..' in path.parts or '\\' in name or name.casefold() in seen:raise ValueError('Unsafe or case-colliding entry path')
        seen.add(name.casefold());total+=usize
        if offset<16+48*count or csize<1 or offset+csize>len(blob) or usize>LIMIT_FILE or total>LIMIT_TOTAL:raise ValueError('FPK bounds or expansion limit violated')
        entries.append({'path':name,'offset':offset,'compressedBytes':csize,'bytes':usize})
    spans=sorted((e['offset'],e['offset']+e['compressedBytes']) for e in entries)
    if any(a[1]>b[0] for a,b in zip(spans,spans[1:])):raise ValueError('Overlapping FPK entries')
    return {'format':'Fate FPK candidate / 36-byte filenames','opaqueIntegrityWord':integrity,'entryCount':count,'paddingWord':padding,'declaredFileBytes':length,'entries':entries}

def extract(path,dest,write):
    blob=path.read_bytes();report=parse(blob);report.update(source=str(path.resolve()),sourceSha256=hashlib.sha256(blob).hexdigest(),nativeGameValidation='pending-real-FPK-sample',mode='extract' if write else 'inventory')
    if write:
        if dest.exists():raise ValueError('Output must be a new directory, never overwrite source material')
        decoded=[]
        for e in report['entries']:
            data=prs_decode(blob[e['offset']:e['offset']+e['compressedBytes']],e['bytes']);e['sha256']=hashlib.sha256(data).hexdigest();e['magicHex']=data[:16].hex();decoded.append((e,data))
        dest.mkdir(parents=True)
        for e,data in decoded:
            out=dest/e['path'];out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
        (dest/'extraction.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--extract-to',type=Path);a=p.parse_args()
    print(json.dumps(extract(a.source,a.extract_to,bool(a.extract_to)),ensure_ascii=False,indent=2))
