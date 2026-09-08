"""Resume the official ZIP with bounded parallel HTTP ranges, append in order."""
import concurrent.futures
import json
import re
import shutil
import subprocess
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'300heroes/downloads/300hero_v202609021.zip.part'
CHUNKS=DEST.parent/'ranges'
TOTAL=13375436801
ETAG='8B86629EEE06F8C40C7E9FF40BAA352B'
URL='https://dl3.jumpw.com/300hero_v202609021.zip'
BLOCK=128*1024*1024
CHUNKS.mkdir(exist_ok=True)
initial=DEST.stat().st_size
tasks=[(i,start,min(TOTAL,start+BLOCK)-1) for i,start in enumerate(range(initial,TOTAL,BLOCK))]
(ROOT/'evidence/300-range-plan.json').write_text(json.dumps(dict(url=URL,total=TOTAL,initial=initial,block=BLOCK,workers=6,tasks=tasks),indent=2))

def fetch(task):
    i,start,end=task
    out=CHUNKS/f'{start}-{end}.bin';header=out.with_suffix('.headers')
    expected=end-start+1
    if out.exists() and out.stat().st_size==expected:return task,out
    temp=out.with_suffix('.part')
    result=subprocess.run(['curl','-fLsS','--connect-timeout','20','--max-time','360',
        '--retry','5','--retry-delay','2','-r',f'{start}-{end}',URL,
        '-H',f'If-Match: "{ETAG}"','-D',str(header),'-o',str(temp)],capture_output=True,text=True)
    if result.returncode:raise RuntimeError(f'Chunk {i}: {result.stderr}')
    h=header.read_text();ranges=re.findall(r'(?im)^content-range:\s*bytes (\d+)-(\d+)/(\d+)',h)
    tags=re.findall(r'(?im)^etag:\s*"([^"\r\n]+)"',h)
    if not ranges or tuple(map(int,ranges[-1]))!=(start,end,TOTAL):raise ValueError(f'Range response mismatch: {i}')
    if not tags or tags[-1].upper()!=ETAG:raise ValueError(f'Archive version mismatch: {i}')
    if temp.stat().st_size!=expected:raise ValueError(f'Chunk size mismatch: {i}')
    temp.replace(out)
    return task,out

started=time.monotonic();pending={};next_i=0
print(json.dumps(dict(event='range_start',initial=initial,remaining=TOTAL-initial,workers=6)),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    jobs=[pool.submit(fetch,t) for t in tasks]
    for future in concurrent.futures.as_completed(jobs):
        task,path=future.result();pending[task[0]]=(task,path)
        while next_i in pending:
            (i,start,end),chunk=pending.pop(next_i)
            if DEST.stat().st_size!=start:raise ValueError('Another writer changed the ZIP; refusing to append')
            with DEST.open('ab') as out,chunk.open('rb') as src:shutil.copyfileobj(src,out,2**20)
            if DEST.stat().st_size!=end+1:raise ValueError('Append size mismatch')
            next_i+=1
            print(json.dumps(dict(event='range_appended',bytes=end+1,total=TOTAL,
                percent=round(100*(end+1)/TOTAL,2),elapsed=round(time.monotonic()-started))),flush=True)
            chunk.unlink()
if DEST.stat().st_size!=TOTAL:raise ValueError('Incomplete ZIP')
DEST.replace(DEST.with_suffix(''))
print(json.dumps(dict(event='download_complete',bytes=TOTAL,elapsed=round(time.monotonic()-started))),flush=True)
