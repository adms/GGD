#!/usr/bin/env python3
"""Freeze a NEW intake and build deterministic tar.gz outside it; no AWS calls."""
import argparse,json,hashlib,tarfile,gzip,io
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('output',type=Path);a=p.parse_args();r=a.root.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True);assert not out.is_relative_to(r)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for p in sorted(r.rglob('*')):
 assert not p.is_symlink(),p
 if p.is_file():rows.append({'path':p.relative_to(r).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
manifest={'schema':'ggd.frozen-source-file-manifest@1','localRoot':str(r),'files':rows,'fileCount':len(rows),'bytes':sum(x['bytes'] for x in rows),'policy':'Immutable intake; manifest lists all other files; no automatic source/default use.'}
mp=r/'file-manifest.json'
with mp.open('x') as f:json.dump(manifest,f,ensure_ascii=False,indent=2);f.write('\n')
mpref={'path':mp.name,'bytes':mp.stat().st_size,'sha256':sha(mp)};archive=out/'source.tar.gz';assert not archive.exists()
with archive.open('xb') as raw:
 with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as gz:
  with tarfile.open(fileobj=gz,mode='w',format=tarfile.PAX_FORMAT) as tf:
   for f in sorted(rows+[mpref],key=lambda f:f['path']):
    path=r/f['path'];data=path.read_bytes();assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256'];t=tarfile.TarInfo(r.name+'/'+f['path']);t.size=len(data);t.uid=t.gid=0;t.uname=t.gname='';t.mtime=0;t.mode=0o644;tf.addfile(t,io.BytesIO(data))
archiveSha=sha(archive);dest=out/(archiveSha+'.tar.gz');archive.rename(dest)
with tarfile.open(dest,'r:gz') as tf:
 members=tf.getmembers();assert len(members)==len(rows)+1
 for f in rows+[mpref]:
  name=r.name+'/'+f['path'];info=tf.getmember(name);assert info.isfile();data=tf.extractfile(info).read();assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256']
receipt={'schema':'ggd-source-deterministic-backup@1','localRoot':str(r),'localArchive':str(dest),'bytes':dest.stat().st_size,'sha256':archiveSha,'archiveFormat':'tar-gzip','archiveMemberRoot':r.name,'fileManifest':{'path':str(mp),'bytes':mpref['bytes'],'sha256':mpref['sha256']},'archiveFiles':len(rows)+1,'fileContentVerified':True,'frozen':True,'files':rows+[mpref]}
(out/'local-backup-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='files'},ensure_ascii=False,indent=2))
