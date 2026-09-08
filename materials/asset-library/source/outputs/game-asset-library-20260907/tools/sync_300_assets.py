"""Compare unpacked assets with official main/async manifests; fetch missing versions."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import struct
import subprocess
import urllib.parse
import zlib
from pathlib import Path
from extract_300_packages import safe_path,decode,category

ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT/'300heroes/raw'
EVIDENCE=ROOT/'evidence'
TEMP=ROOT/'300heroes/downloads/patch-assets'

def manifest():
    result={}
    for group,name in [('main','300heroes-clientfilelist.xml'),('async','300heroes-asyncclientfilelist.xml')]:
        b=(EVIDENCE/name).read_bytes()
        for n,md5,size,rawsize in re.findall(rb'FileName="(.*?)" MD5="(.*?)" Size="(.*?)" RawSize="(.*?)"',b):
            name=html.unescape(decode(n));path=safe_path(name)
            if not path.startswith('data/'):continue
            result[path]=dict(path=path,original=name,md5=md5.decode().lower(),
                packed_bytes=int(size),bytes=int(rawsize),manifest=group,category=category(path))
    return result

def fetch(record):
    name=record['original'].removeprefix('#').replace('\\','/').removeprefix('../')
    url='https://update.300hero.jumpwgame.com/xclient_unpack/'+urllib.parse.quote(name,safe='/')+'.gz'
    temp=TEMP/(record['md5']+'.gz')
    try:
        result=subprocess.run(['curl','-fLsS','--connect-timeout','15','--max-time','180',
            '--retry','3',url,'-o',str(temp)],capture_output=True,text=True)
        if result.returncode:raise ValueError(result.stderr.strip())
        b=temp.read_bytes()
        if len(b)!=record['packed_bytes']:raise ValueError('Packed size mismatch')
        size=struct.unpack_from('<i',b,0)[0];data=b[4:] if size==-1 else zlib.decompress(b[4:])
        if len(data)!=record['bytes'] or hashlib.md5(data).hexdigest()!=record['md5']:
            raise ValueError('Official manifest size/MD5 mismatch')
        target=RAW/record['path'];target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            old=ROOT/'300heroes/snapshot-originals'/record['path'];old.parent.mkdir(parents=True,exist_ok=True)
            if not old.exists():target.replace(old)
        target.write_bytes(data);temp.unlink()
        return dict(**record,status='downloaded',url=url)
    except Exception as e:return dict(**record,status='failed',url=url,error=str(e))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--fetch',action='store_true');a=p.parse_args()
    expected=manifest();known={}
    for p in sorted(EVIDENCE.glob('Data*.jmp.assets.jsonl')):
        for line in p.read_text().splitlines():
            r=json.loads(line);known[r['path']]=r['md5']
    patch_log=EVIDENCE/'300-patch-assets.jsonl'
    if patch_log.exists():
        for line in patch_log.read_text().splitlines():
            r=json.loads(line)
            if r['status']=='downloaded':known[r['path']]=r['md5']
    pending=[];matched=0
    for path,r in expected.items():
        file=RAW/path
        if file.exists() and known.get(path)==r['md5'] and file.stat().st_size==r['bytes']:matched+=1
        else:pending.append(r)
    report=dict(expected=len(expected),matched=matched,pending=len(pending),
        pending_packed_bytes=sum(x['packed_bytes'] for x in pending),pending_assets=pending)
    (EVIDENCE/'300-manifest-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='pending_assets'}),flush=True)
    if a.fetch and pending:
        TEMP.mkdir(parents=True,exist_ok=True);results=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool,patch_log.open('a') as out:
            for i,r in enumerate(pool.map(fetch,pending)):
                results.append(r);out.write(json.dumps(r,ensure_ascii=False)+'\n');out.flush()
                if i%100==0 or r['status']=='failed':print(json.dumps(dict(done=i+1,total=len(pending),path=r['path'],status=r['status'],error=r.get('error'))),flush=True)
        print(json.dumps(dict(downloaded=sum(r['status']=='downloaded' for r in results),failed=sum(r['status']=='failed' for r in results))),flush=True)
