import concurrent.futures,json,re,shutil,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'magical-battle-arena/downloads/Magical-Battle-Arena_Complete-Edition-ISO.zip'
URL='https://d2.xp.myabandonware.com/t/e6d46999-7904-41df-ab78-44dab9a4b76b/Magical-Battle-Arena_Win_JA_Complete-Edition-ISO.zip'
TOTAL=199651336
initial=OUT.stat().st_size
chunks=OUT.parent/'ranges';chunks.mkdir(exist_ok=True)
def fetch(start):
    end=min(start+16*1024*1024,TOTAL)-1
    dest=chunks/f'{start}-{end}.bin';head=dest.with_suffix('.headers')
    if dest.exists() and dest.stat().st_size==end-start+1 and head.exists():
        ranges=re.findall(r'(?im)^content-range:\s*bytes (\d+)-(\d+)/(\d+)',head.read_text())
        if ranges and tuple(map(int,ranges[-1]))==(start,end,TOTAL):return start,end,dest
    subprocess.run(['curl','-fLsS','--connect-timeout','15','--max-time','180','--retry','3',
        '--speed-limit','1024','--speed-time','20','-r',f'{start}-{end}',URL,
        '-H','If-Match: "68d3209c-be67008"','-D',str(head),'-o',str(dest)],check=True)
    ranges=re.findall(r'(?im)^content-range:\s*bytes (\d+)-(\d+)/(\d+)',head.read_text())
    if not ranges or tuple(map(int,ranges[-1]))!=(start,end,TOTAL) or dest.stat().st_size!=end-start+1:raise ValueError('Range mismatch')
    return start,end,dest
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for start,end,path in pool.map(fetch,range(initial,TOTAL,16*1024*1024)):
        if OUT.stat().st_size!=start:raise ValueError('Unexpected archive size')
        with OUT.open('ab') as out,path.open('rb') as src:shutil.copyfileobj(src,out)
        path.unlink();print(json.dumps(dict(bytes=end+1,total=TOTAL)),flush=True)
print('DOWNLOAD COMPLETE',flush=True)
