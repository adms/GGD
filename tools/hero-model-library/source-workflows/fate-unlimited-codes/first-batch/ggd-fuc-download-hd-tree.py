#!/usr/bin/env python3
"""Public author tree download; source files only, no game or MOD code execution.

Use --limit 64 for a bounded prioritized subset; --all for the full 701-blob tree.
Incomplete downloads remain .part files and never count as acquired.
The original ZIP interruption remains preserved independently.
"""
from pathlib import Path
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import argparse, collections, hashlib, json, subprocess, threading

ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-psp-first-batch/github-unlimitedcodes-hd')
COMMIT='e1e6846ffbb4aa97b1510ac69712980f3b68fce2'
tree=json.loads((ROOT/'source-tree.json').read_text());assert tree['sha']==COMMIT and tree.get('truncated')==False
blobs=[x for x in tree['tree'] if x['type']=='blob'];assert len(blobs)==701
prefixes=collections.defaultdict(set)
for e in blobs:
 parts=e['path'].split('/')
 for i in range(1,len(parts)+1):prefix='/'.join(parts[:i]);prefixes[prefix.casefold()].add(prefix)
def local(path):
 parts=path.split('/');out=[]
 for i,part in enumerate(parts):
  prefix='/'.join(parts[:i+1]);out.append(part+'__case_'+hashlib.sha256(prefix.encode()).hexdigest()[:8] if len(prefixes[prefix.casefold()])>1 else part)
 return ROOT/'source-files'/Path(*out)
def valid(p,e):
 if not p.exists() or p.stat().st_size!=e['size']:return False
 b=p.read_bytes();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['sha']
stop=threading.Event()
def run(e):
 p=local(e['path']);r={'sourcePath':e['path'],'path':str(p.relative_to(ROOT)),'expectedBytes':e['size'],'gitBlobSha1':e['sha']}
 if stop.is_set():return dict(r,status='not-started-source-blocked')
 if not valid(p,e):
  p.parent.mkdir(parents=True,exist_ok=True);part=p.with_name(p.name+'.part')
  check=subprocess.run(['/usr/sbin/lsof','-t','--',str(part)],capture_output=True,text=True)
  if check.stdout.strip():return dict(r,status='busy-existing-download')
  url='https://raw.githubusercontent.com/Fate-AI-HD-Team/UnlimitedCodes-HD/'+COMMIT+'/'+quote(e['path'],safe='/');r['downloadUrl']=url
  for attempt in range(3):
   cmd=['curl','--fail','--location','--max-time','120','--silent','--show-error']
   if part.exists():cmd+=['--continue-at','-']
   result=subprocess.run(cmd+[url,'--output',str(part)],capture_output=True,text=True)
   if '403' in result.stderr or '401' in result.stderr:stop.set();return dict(r,status='access-blocked-stop-source',error=result.stderr)
   if result.returncode==0:break
   if 'returned error' in result.stderr or result.returncode not in (18,28,56,92):return dict(r,status='download-blocked',error=result.stderr)
  if result.returncode or not valid(part,e):return dict(r,status='incomplete',error=result.stderr,partialBytes=part.stat().st_size if part.exists() else 0)
  part.rename(p)
 return dict(r,status='complete',bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--all',action='store_true');parser.add_argument('--limit',type=int,default=64);a=parser.parse_args()
 ordered=sorted(blobs,key=lambda e:(0 if e['path'] in ['README.md','textures.ini'] else 1 if e['path'].startswith(('Models/','models/')) else 2,e['size'],e['path']))
 selected=ordered if a.all else ordered[:a.limit]
 with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(run,selected))
 allComplete=all(valid(local(e['path']),e) for e in blobs)
 report={'sourcePage':'https://github.com/Fate-AI-HD-Team/UnlimitedCodes-HD','commit':COMMIT,'sourcePlatform':'PSP','expectedFullTreeFiles':len(blobs),'expectedFullTreeBytes':sum(e['size'] for e in blobs),'selectedFiles':len(selected),'fullTreeComplete':allComplete,'meshCount':0,'animationCount':0,'audioCount':0,'files':results,'caseCollisionHandling':'Stable hash suffix on every case-colliding path component; original virtual paths retained.'}
 (ROOT/'tree-download-progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'selected':len(selected),'complete':sum(r['status']=='complete' for r in results),'fullTreeComplete':allComplete},indent=2))
