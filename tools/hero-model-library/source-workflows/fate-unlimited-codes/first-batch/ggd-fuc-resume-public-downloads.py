#!/usr/bin/env python3
"""Resume only the two already-authorized PS2 public packages after old downloads end."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, json, subprocess

BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-ps2-first-batch')
TARGETS={'saber':28132886,'shirou':32628057}
def run(slug):
 root=BASE/('spritedatabase-'+slug);p=root/'original'/(slug+'_sounds.rar');acq=root/'acquisition.json';old=json.loads(acq.read_text())
 url='https://spritedatabase.net/files/ps2/1446/Sound/'+slug+'_sounds.rar';assert old['downloadUrl']==url
 if (root/'files.sha256.json').exists():return {'slug':slug,'status':'already-frozen'}
 if p.exists() and p.stat().st_size==TARGETS[slug]:
  if not old.get('completeDownload'):
   old.update(completeDownload=True,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),resumeNote='Expected full byte count present; archive CRC/extraction verification still required.')
   acq.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
  return {'slug':slug,'status':'complete-needs-processing'}
 # An existing curl may still own this file. Never launch a competing writer.
 check=subprocess.run(['/usr/sbin/lsof','-t','--',str(p)],capture_output=True,text=True)
 if check.stdout.strip():return {'slug':slug,'status':'busy-existing-process','pids':check.stdout.split()}
 lock=root/'resume.lock'
 try:handle=lock.open('x')
 except FileExistsError:return {'slug':slug,'status':'resume-lock-exists'}
 try:
  attempts=[]
  for attempt in range(1,7):
   cmd=['curl','--fail','--location','--max-time','180','--silent','--show-error','--continue-at','-',url,'--output',str(p)]
   r=subprocess.run(cmd,capture_output=True,text=True);row={'attempt':attempt,'exitCode':r.returncode,'error':r.stderr,'bytes':p.stat().st_size};attempts.append(row)
   (root/'resume-progress.json').write_text(json.dumps({'attempts':attempts},indent=2)+'\n')
   if r.returncode==0 or 'returned error' in r.stderr or r.returncode not in (18,28,56,92):break
  old.update(exitCode=r.returncode,error=r.stderr,bytes=p.stat().st_size,resumeAttempts=attempts,completeDownload=False)
  if r.returncode==0 and p.stat().st_size==TARGETS[slug]:old.update(completeDownload=True,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
  acq.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n');return {'slug':slug,'completeDownload':old['completeDownload'],'bytes':old['bytes']}
 finally:handle.close();lock.unlink()
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('slugs',nargs='*',default=['saber','shirou'],choices=['saber','shirou']);a=p.parse_args()
 with ThreadPoolExecutor(max_workers=2) as pool:print(json.dumps(list(pool.map(run,a.slugs)),indent=2))
