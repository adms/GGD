import sys

from pathlib import Path
from urllib.parse import urlsplit
import argparse,concurrent.futures,hashlib,json,re,shutil,subprocess
import pyzstd
from scope_guard import load_scope
p=argparse.ArgumentParser();p.add_argument('--control',type=Path,required=True);p.add_argument('--source-root',type=Path);p.add_argument('--names',nargs='+',required=True);p.add_argument('--batch-id',required=True);a=p.parse_args()
scope=load_scope(a.control)
if not set(a.names)<=set(scope['allowedDownloadNames']): raise ValueError('Unlisted download refused')

root=(a.source_root or Path(scope['sourceLocalRoot'])).resolve();assert root.is_dir()
cat=json.loads((root/'sources/ja_JP-character-wads.json').read_text());wanted=set(a.names);rows=[f for f in cat['files'] if f['name'].rsplit('/',1)[1].split('.')[0] in wanted];assert len(rows)==len(wanted)
assert cat['releaseId']==scope['releaseId']
assert sum(f['compressedChunkBytes'] for f in rows)<=scope['maxCompressedBatchBytes']
cdn='https://'+urlsplit(cat['sourceUrl']).netloc+'/channels/public/bundles/';assert cdn.startswith('https://lol.secure.dyn.riotcdn.net/')
for f in rows:assert f['flags']==['ja_JP'] and f['link'] is None and re.fullmatch(r'[A-Za-z0-9_-]+\.ja_JP\.wad\.client',f['name'].rsplit('/',1)[1])
chunks={c['chunkId']:c for f in rows for c in f['chunks']};receipts=root/'receipts';receipts.mkdir(exist_ok=True);originals=root/'original-wads';originals.mkdir(exist_ok=True)
plan=dict(schema='ggd-riot-ja-wad-batch@1',batchId=a.batch_id,releaseId=cat['releaseId'],patchVersion=cat['patchVersion'],locale='ja_JP',manifestSha256=cat['manifestSha256'],files=rows,uniqueChunks=len(chunks),compressedBytes=sum(c['compressedBytes'] for c in chunks.values()),expectedWadBytes=sum(f['bytes'] for f in rows))
planpath=receipts/(a.batch_id+'-plan.json')
if planpath.exists():assert json.loads(planpath.read_text())==plan
else:planpath.write_text(json.dumps(plan,indent=2)+'\n')
def get(c):
 for k in ('chunkId','bundleId'):assert re.fullmatch('[0-9A-F]{16}',c[k])
 dest=root/'original-chunks'/c['bundleId']/(c['chunkId']+'.zstd');dest.parent.mkdir(parents=True,exist_ok=True);rp=receipts/(c['chunkId']+'.json')
 if rp.exists():
  rr=json.loads(rp.read_text())
  if rr.get('verified'):
   b=dest.read_bytes();assert len(b)==rr['bytes'] and hashlib.sha256(b).hexdigest()==rr['sha256'];return rr
  if rr.get('exitCode')==22:return rr  # Preserve HTTP refusal; no automatic retry of denied resources.
 attempt=1
 while dest.with_suffix('.attempt'+str(attempt)+'.partial').exists():attempt+=1
 part=dest.with_suffix('.attempt'+str(attempt)+'.partial');header=dest.with_suffix('.attempt'+str(attempt)+'.headers.txt');url=cdn+c['bundleId']+'.bundle';start=c['offset'];end=start+c['compressedBytes']-1
 rc=subprocess.run(['curl','--fail','--location','--range',str(start)+'-'+str(end),'--max-time','120','--max-filesize',str(c['compressedBytes']+1),'--silent','--show-error','--dump-header',str(header),'--output',str(part),url],capture_output=True,text=True)
 rr=dict(**c,sourceUrl=url,requestedRange=[start,end],attempt=attempt,exitCode=rc.returncode,error=rc.stderr,verified=False)
 try:
  assert rc.returncode==0,rc.stderr
  ranges=re.findall(r'content-range:\s*bytes (\d+)-(\d+)/(\d+)',header.read_text(),re.I);assert ranges and tuple(map(int,ranges[-1][:2]))==(start,end)
  b=part.read_bytes();assert len(b)==c['compressedBytes'];raw=pyzstd.decompress(b);assert len(raw)==c['targetBytes']
  assert not dest.exists();part.rename(dest)
  rr.update(path=dest.relative_to(root).as_posix(),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),decompressedBytes=len(raw),decompressedSha256=hashlib.sha256(raw).hexdigest(),normalHttpRangeVerified=True,zstdAndTargetSizeVerified=True,verified=True)
 except Exception as exc:rr['validationError']=str(exc)
 rp.write_text(json.dumps(rr,indent=2)+'\n');return rr
with concurrent.futures.ThreadPoolExecutor(max_workers=min(3,scope["maxParallelDownloads"])) as ex:results=list(ex.map(get,chunks.values()))
errors=[x for x in results if not x['verified']];packages=[]
verified_ids={x['chunkId'] for x in results if x['verified']}
for f in rows:
 if any(c['chunkId'] not in verified_ids for c in f['chunks']):continue
 name=f['name'].rsplit('/',1)[1];dest=originals/name;rp=receipts/(name+'.json')
 if rp.exists():
  rr=json.loads(rp.read_text());assert dest.stat().st_size==rr['bytes'] and hashlib.sha256(dest.read_bytes()).hexdigest()==rr['sha256'];packages.append(rr);continue
 partial=dest.with_suffix(dest.suffix+'.partial');assert not dest.exists() and not partial.exists()
 with partial.open('xb') as out:
  for c in f['chunks']:
   blob=(root/'original-chunks'/c['bundleId']/(c['chunkId']+'.zstd')).read_bytes();data=pyzstd.decompress(blob);assert len(data)==c['targetBytes'];out.write(data)
 b=partial.read_bytes();assert len(b)==f['bytes'] and b[:2]==b'RW';partial.rename(dest)
 rr=dict(sourcePath=f['name'],path=dest.relative_to(root).as_posix(),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),wadMagic=b[:4].hex(),locale='ja_JP',languageEvidence='Official Riot manifest file flags and WAD filename explicitly declare ja_JP; per-clip listening not done',releaseId=cat['releaseId'],patchVersion=cat['patchVersion'],manifestSha256=cat['manifestSha256'],manifestFileSizeVerified=True,manifestChunkOrderAndTargetSizesVerified=True,publisherWadDigestAvailable=False,chunkCount=len(f['chunks']),frozen=True)
 rp.write_text(json.dumps(rr,indent=2)+'\n');packages.append(rr)
report=dict(schema='ggd-riot-wad-acquisition-report@1',localRoot=str(root),batchId=a.batch_id,locale='ja_JP',manifestSha256=cat['manifestSha256'],sourceUrl=cat['sourceUrl'],patchVersion=cat['patchVersion'],requestedWads=len(rows),completeWads=len(packages),packages=packages,errors=errors,originalChunkBytes=sum(x.get('bytes',0) for x in results if x['verified']))
reportpath=receipts/(a.batch_id+'-acquisition.json');reportpath.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
