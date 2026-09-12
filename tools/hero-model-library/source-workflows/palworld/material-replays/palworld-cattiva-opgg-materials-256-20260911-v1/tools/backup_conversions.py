"""Back up two frozen conversion folders; only STS identity, S3 Put/Get.

No credential files, IAM, profile changes, deletion, central indexes or Git.
All backup artifacts/receipts are outside the frozen conversion directories.
"""
import argparse,datetime,gzip,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path

BUCKET='ggd-390630837668-ap-east-2-an'
PROFILE='vibe-coding'
REGION='ap-east-2'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def ref(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)}
def save(p,v):
 with p.open('x') as f:f.write(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def aws(action,resource,*args):
 r=subprocess.run(['aws','--profile',PROFILE,'--region',REGION,*args],capture_output=True,text=True)
 if r.returncode:
  match=re.search(r'An error occurred \(([^)]+)\)',r.stderr)
  code=match.group(1) if match else 'CLI-operation-failed'
  # Do not dump environment, credential provider internals or arbitrary stderr.
  raise RuntimeError(json.dumps({'action':action,'resource':resource,'errorCode':code,'exitCode':r.returncode,'intentionalBoundary':code=='AccessDenied','noPermissionExpansionAttempted':True}))
 return json.loads(r.stdout) if r.stdout.strip() else {}
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',action='append',type=Path,required=True);p.add_argument('--archive-dir',type=Path,required=True);p.add_argument('--receipt-dir',type=Path,required=True);a=p.parse_args()
 assert len(a.source)==2,'This bounded delivery contains exactly two conversion versions'
 archive_dir=a.archive_dir.resolve();receipt_dir=a.receipt_dir.resolve();archive_dir.mkdir(parents=True,exist_ok=True);receipt_dir.mkdir(parents=True,exist_ok=True)
 identity=aws('sts:GetCallerIdentity','current vibe-coding profile','sts','get-caller-identity')
 if 'assumed-role/vibe-coding-s3-role/' not in identity.get('Arn',''):raise RuntimeError('STOP: active ARN does not match required assumed-role/vibe-coding-s3-role/')
 receipts=[]
 for source in a.source:
  root=source.resolve();mp=root/'files-sha256.json';frozen=json.loads(mp.read_bytes());rows=frozen['files']+[{'path':'files-sha256.json','bytes':mp.stat().st_size,'sha256':sha(mp)}]
  expected={x['path']:x for x in rows};assert len(expected)==len(rows)
  all_files=[];directories=[]
  for f in sorted(root.rglob('*')):
   assert not f.is_symlink(),'Symlinks are not archived'
   if f.is_dir():directories.append(str(f.relative_to(root)))
   elif f.is_file():all_files.append(str(f.relative_to(root)))
   else:raise RuntimeError('Unsupported filesystem entry '+str(f))
  assert set(all_files)==set(expected),'Frozen file membership changed'
  for x in rows:
   f=(root/x['path']).resolve();assert f.is_relative_to(root);assert f.stat().st_size==x['bytes'] and sha(f)==x['sha256']
  archive=archive_dir/(root.name+'.tar.gz')
  if not archive.exists():
   with archive.open('xb') as f,gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0) as z,tarfile.open(fileobj=z,mode='w',format=tarfile.PAX_FORMAT) as t:
    for d in ['']+directories:
     info=tarfile.TarInfo(root.name+('/'+d if d else ''));info.type=tarfile.DIRTYPE;info.mode=0o755;info.mtime=0;t.addfile(info)
    for x in sorted(rows,key=lambda x:x['path']):
     raw=(root/x['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==x['sha256'];info=tarfile.TarInfo(root.name+'/'+x['path']);info.mode=0o644;info.size=len(raw);info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='';t.addfile(info,io.BytesIO(raw))
  def verify_archive(file):
   verified=[]
   with tarfile.open(file,'r:gz') as t:
    members=t.getmembers();names=[m.name for m in members];assert len(names)==len(set(names))
    got_dirs=set();got_files=set()
    for m in members:
     parts=Path(m.name).parts;assert not Path(m.name).is_absolute() and '..' not in parts and parts[0]==root.name
     rel='/'.join(parts[1:])
     if m.isdir():got_dirs.add(rel);continue
     assert m.isfile() and rel in expected
     raw=t.extractfile(m).read();x=expected[rel];assert len(raw)==x['bytes'] and hashlib.sha256(raw).hexdigest()==x['sha256'];got_files.add(rel)
     verified.append({'path':rel,'bytes':len(raw),'sha256':x['sha256']})
    assert got_files==set(expected) and got_dirs==set(['']+directories)
   return verified
  verify_archive(archive)
  digest=sha(archive);key='legacy/character-model-conversions/'+root.name+'/'+digest+'.tar.gz';resource='arn:aws:s3:::'+BUCKET+'/'+key
  print(json.dumps({'source':root.name,'phase':'PutObject','archiveBytes':archive.stat().st_size,'fileCount':len(rows)}),flush=True)
  aws('s3:PutObject',resource,'s3api','put-object','--bucket',BUCKET,'--key',key,'--body',str(archive),'--content-type','application/gzip')
  readback=archive_dir/(root.name+'.readback.tar.gz')
  if readback.exists():assert sha(readback)==digest,'Existing readback differs; preserved and stopped'
  else:aws('s3:GetObject',resource,'s3api','get-object','--bucket',BUCKET,'--key',key,str(readback))
  assert sha(readback)==digest;verified=verify_archive(readback)
  for x in rows:assert sha(root/x['path'])==x['sha256'],'Frozen local changed during backup'
  receipt={'schema':'ggd.conversion-legacy-backup@1','sourceId':root.name,'localRoot':str(root),'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'profile':PROFILE,'region':REGION,'roleArnMatched':True,'roleName':'vibe-coding-s3-role','s3Uri':'s3://'+BUCKET+'/'+key,'actions':['sts:GetCallerIdentity','s3:PutObject','s3:GetObject'],'archive':ref(archive),'readback':ref(readback),'fileManifest':ref(mp),'archiveMemberRoot':root.name,'verifiedFileCount':len(verified),'verifiedDirectoryCount':len(directories)+1,'fullGetAndEveryFileShaVerified':True,'localAllPreserved':True,'sourceDirectoryUnchanged':True,'deleteUsed':False,'credentialFilesAccessed':False,'files':verified,'purpose':'Legacy reserve backup; no automatic production selection or central publication.'}
  path=receipt_dir/(root.name+'.s3-readback.json');save(path,receipt);receipts.append(ref(path))
  print(json.dumps({'source':root.name,'phase':'full-Get-verified','files':len(verified),'receipt':str(path),'receiptSha256':sha(path)}),flush=True)
 delivery={'schema':'ggd.cattiva.two-conversion-backups@1','receipts':receipts,'centralFilesChanged':False,'gitChanged':False,'sourceDirectoriesUnchanged':True,'allFullGetVerified':True,'profile':PROFILE,'region':REGION,'bucket':BUCKET}
 save(receipt_dir/'delivery.json',delivery);print(json.dumps({'delivery':ref(receipt_dir/'delivery.json')}),flush=True)
if __name__=='__main__':main()
