"""Freeze Cattiva source intakes and verify authorized S3 PutObject via full GetObject.
Only vibe-coding profile; no credentials/IAM/profile file access or deletion.
"""
from pathlib import Path
import json,hashlib,tarfile,gzip,io,subprocess,datetime,os,shutil
BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT')
control=json.loads(Path('/private/tmp/ggd-cattiva-source-entries-local.json').read_text())
delivery=BASE/'GGD-Asset-Library/deliveries/palworld-cattiva-20260911';delivery.mkdir(parents=True,exist_ok=True)
archiveRoot=BASE/'GGD-Asset-Library/archives/palworld-cattiva-20260911';archiveRoot.mkdir(parents=True,exist_ok=True)
BUCKET='ggd-390630837668-ap-east-2-an'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def aws(*args):
 r=subprocess.run(['aws','--profile','vibe-coding','--region','ap-east-2',*args],capture_output=True,text=True)
 if r.returncode:
  # Exact action/resource in command only; never request or print credentials.
  raise RuntimeError('AWS denied/failed '+json.dumps(list(args))+' '+r.stderr)
 return json.loads(r.stdout) if r.stdout.strip() else {}
identity=aws('sts','get-caller-identity')
assert 'assumed-role/vibe-coding-s3-role/' in identity.get('Arn',''), 'STOP: unexpected AWS identity'
receipts=[]
for e in control['entries']:
 root=BASE/e['localPath'];shutil.copy2(__file__,root/'tools/backup.py')
 rows=[]
 for p in sorted(root.rglob('*')):
  assert not p.is_symlink(), 'No symlink in source archive'
  if p.is_file() and p.name!='files-sha256.json':rows.append({'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)})
 write(root/'files-sha256.json',{'schema':'ggd.source-files-sha256@1','sourceId':e['id'],'files':rows,'excludes':['files-sha256.json (self)']})
 allrows=rows+[{'path':'files-sha256.json','bytes':(root/'files-sha256.json').stat().st_size,'sha256':sha(root/'files-sha256.json')}]
 archive=archiveRoot/(e['id']+'.tar.gz');assert not archive.exists(), 'Archive already frozen: never overwrite'
 with archive.open('wb') as f,gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0) as z,tarfile.open(fileobj=z,mode='w',format=tarfile.PAX_FORMAT) as t:
  for r in sorted(allrows,key=lambda x:x['path']):
   b=(root/r['path']).read_bytes();assert hashlib.sha256(b).hexdigest()==r['sha256']
   info=tarfile.TarInfo(r['path']);info.size=len(b);info.mode=0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='';t.addfile(info,io.BytesIO(b))
 digest=sha(archive);key='legacy/character-models/'+e['id']+'-20260911/'+digest+'.tar.gz'
 print(json.dumps({'source':e['id'],'phase':'PutObject','archiveBytes':archive.stat().st_size,'members':len(allrows)}),flush=True)
 aws('s3api','put-object','--bucket',BUCKET,'--key',key,'--body',str(archive),'--content-type','application/gzip')
 readback=archiveRoot/(e['id']+'.readback.tar.gz');assert not readback.exists()
 aws('s3api','get-object','--bucket',BUCKET,'--key',key,str(readback));assert sha(readback)==digest
 expected={x['path']:x for x in allrows};memberRows=[]
 with tarfile.open(readback,'r:gz') as t:
  members=t.getmembers();assert len(members)==len(expected)
  for m in members:
   assert m.isfile() and m.name in expected and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
   b=t.extractfile(m).read();x=expected[m.name];assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256']
   assert sha(root/m.name)==x['sha256'];memberRows.append({'path':m.name,'bytes':len(b),'sha256':x['sha256'],'fullGetVerified':True,'localUnchanged':True})
 receipt={'schema':'ggd.source-legacy-backup@1','sourceId':e['id'],'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'profile':'vibe-coding','region':'ap-east-2','expectedRoleVerified':True,'s3Uri':'s3://'+BUCKET+'/'+key,'actions':['s3:PutObject','s3:GetObject'],'archivePath':str(archive),'readbackPath':str(readback),'archiveSha256':digest,'archiveBytes':archive.stat().st_size,'memberCount':len(memberRows),'fullGetAndMemberShaVerified':True,'files':memberRows,'policy':'legacy source reserve only; no automatic production selection; local all preserved'}
 rp=delivery/(e['id']+'.s3-backup.json');write(rp,receipt)
 e['publicationStatus']='s3-legacy-full-get-verified';e['backup']={'s3Uri':receipt['s3Uri'],'bytes':receipt['archiveBytes'],'sha256':digest,'readbackVerified':True,'archiveFormat':'tar-gzip','archiveMemberRoot':'','receiptPath':str(rp)};e['s3BackupReceiptPath']=str(rp);e['filesManifestPath']=str(root/'files-sha256.json');e['filesManifestSha256']=sha(root/'files-sha256.json')
 receipts.append({'path':str(rp),'sha256':sha(rp),'sourceId':e['id']})
 print(json.dumps({'source':e['id'],'phase':'full-Get-member-verified','sha256':digest,'receipt':str(rp)}),flush=True)
control.update(s3BackupReceipts=receipts,sourceRootsImmutable=True,centralFilesModified=False,gitMutation=False)
write(delivery/'source-entries.json',control);write(Path('/private/tmp/ggd-cattiva-final-delivery.json'),{'deliveryRoot':str(delivery),'sourceEntriesPath':str(delivery/'source-entries.json'),'sourceEntriesSha256':sha(delivery/'source-entries.json'),'receipts':receipts})
print(json.dumps({'delivery':str(delivery/'source-entries.json'),'sha256':sha(delivery/'source-entries.json')},ensure_ascii=False),flush=True)
