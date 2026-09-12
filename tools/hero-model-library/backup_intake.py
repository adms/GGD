"""Archive a local intake with SHA-256, using only the authorized S3 profile."""
import argparse,gzip,hashlib,json,os,shutil,subprocess,tarfile
from pathlib import Path
BUCKET='ggd-390630837668-ap-east-2-an'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def inventory(root):
 rows=[]
 for p in sorted(root.rglob('*')):
  if p.is_symlink():raise ValueError('Symlink not allowed: '+str(p))
  if p.is_file():rows.append(dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,sha256=sha(p)))
 if not rows:raise ValueError('Empty intake')
 return rows
def aws(args,action,resource):
 env={**os.environ,'AWS_PROFILE':'vibe-coding','AWS_REGION':'ap-east-2','AWS_PAGER':''}
 r=subprocess.run(['aws',*args,'--profile','vibe-coding','--region','ap-east-2','--no-cli-pager'],env=env,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(action+' '+resource+': '+r.stderr.strip())
 return r.stdout
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--prefix',required=True);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args()
 root=a.source.resolve();out=a.output.resolve();assert not out.is_relative_to(root)
 prefix=Path(a.prefix);assert not prefix.is_absolute() and prefix.parts[0]=='legacy' and '..' not in prefix.parts
 rows=inventory(root);digest=hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest();dest=out/digest;dest.mkdir(parents=True,exist_ok=True)
 archive=dest/'source.tar.gz';mp=dest/'manifest.json'
 if archive.exists():
  if not mp.is_file():raise ValueError('Frozen backup has no manifest; preserve for inspection: '+str(dest))
  manifest=json.loads(mp.read_text())
  if (manifest.get('schema')!='ggd-intake-backup-manifest@1' or manifest.get('source')!=str(root)
      or manifest.get('files')!=rows or manifest.get('archiveBytes')!=archive.stat().st_size
      or manifest.get('archiveSha256')!=sha(archive)):
   raise ValueError('Frozen backup differs from current source; preserve for inspection: '+str(dest))
  archive_sha=manifest['archiveSha256'];uri=f's3://{BUCKET}/{a.prefix.strip("/")}/{archive_sha}.tar.gz'
  if manifest.get('s3Uri')!=uri:raise ValueError('Frozen backup has an unexpected destination: '+str(dest))
 else:
  with archive.open('xb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,filename='') as gz,tarfile.open(fileobj=gz,mode='w|') as tf:
   for row in rows:
    p=root/row['path'];info=tf.gettarinfo(str(p),arcname=row['path']);info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0
    with p.open('rb') as f:tf.addfile(info,f)
  assert inventory(root)==rows,'Local intake changed during archive'
  archive_sha=sha(archive);uri=f's3://{BUCKET}/{a.prefix.strip("/")}/{archive_sha}.tar.gz'
  manifest=dict(schema='ggd-intake-backup-manifest@1',source=str(root),files=rows,archiveSha256=archive_sha,archiveBytes=archive.stat().st_size,s3Uri=uri)
  mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 arn=aws(['sts','get-caller-identity','--query','Arn','--output','text'],'sts:GetCallerIdentity','configured role').strip()
 if 'assumed-role/vibe-coding-s3-role/' not in arn:raise RuntimeError('STOP identity mismatch: '+arn)
 aws(['s3','cp',str(archive),uri,'--only-show-errors'],'s3:PutObject',uri)
 back=dest/'readback.tar.gz';aws(['s3','cp',uri,str(back),'--only-show-errors'],'s3:GetObject',uri);assert sha(back)==archive_sha
 with tarfile.open(back,'r:gz') as tf:
  assert sorted(tf.getnames())==sorted(r['path'] for r in rows)
  for row in rows:
   b=tf.extractfile(row['path']).read();assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256']
 assert inventory(root)==rows,'Local intake changed during readback'
 m_uri=uri.removesuffix('.tar.gz')+'.files.json';aws(['s3','cp',str(mp),m_uri,'--only-show-errors'],'s3:PutObject',m_uri)
 mb=dest/'manifest-readback.json';aws(['s3','cp',m_uri,str(mb),'--only-show-errors'],'s3:GetObject',m_uri);assert mb.read_bytes()==mp.read_bytes()
 receipt=dict(schema='ggd-intake-backup-receipt@1',s3Uri=uri,manifestUri=m_uri,archiveSha256=archive_sha,archiveBytes=archive.stat().st_size,fileCount=len(rows),fullGetVerified=True,allMemberSha256Verified=True,localUnchanged=True,source=str(root),localArchive=str(archive),readback=str(back),manifest=str(mp))
 (dest/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');(out/'latest-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
