#!/usr/bin/env python3
"""Build and publish only standardized catalog members. AWS uses the configured profile only."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile,zipfile
from pathlib import Path
from datetime import datetime
ROOT=Path(__file__).resolve().parent.parent
BUCKET='ggd-390630837668-ap-east-2-an';PREFIX='GGD-Asset-Library';URI=f's3://{BUCKET}/{PREFIX}'
PROFILE='vibe-coding';REGION='ap-east-2'
def read(p):return json.loads(p.read_text())
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def runaws(args,action,resource):
 env=os.environ.copy();env['AWS_PROFILE']=PROFILE;env['AWS_REGION']=REGION;env['AWS_PAGER']=''
 p=subprocess.run(['aws',*args,'--profile',PROFILE,'--region',REGION,'--no-cli-pager'],env=env,capture_output=True,text=True)
 if p.returncode:
  # No retry with alternate identities or permissions. AWS diagnostics include the rejected operation.
  raise RuntimeError(f'AWS operation stopped. Expected action: {action}; resource: {resource}\n{p.stderr.strip()}')
 return p.stdout

def build():
 catalog=read(ROOT/'catalog.json');manifest=[]
 # Verify the admitted bytes and gate revision before including anything.
 for entry in catalog['entries']:
  base=(ROOT/entry['path']).resolve();proof=read(ROOT/entry['validation'])
  if not base.is_relative_to(ROOT/'ready') or entry['status']!='standardized':raise ValueError('Unapproved catalog path/status')
  for key,rel in [('policy_sha256','policy.json'),('validator_sha256','tools/admit.py'),('schema_validator_sha256','tools/validate-schema.mts')]:
   if proof[key]!=sha(ROOT/rel):raise ValueError('Admission rules changed; re-admit before publication')
  for f in proof['files']:
   path=(base/f['path']).resolve()
   if not path.is_relative_to(base) or not path.is_file() or sha(path)!=f['sha256']:raise ValueError('Admitted file mismatch: '+str(path))
 stage=ROOT/'shared/build';stage.mkdir(parents=True,exist_ok=True)
 # Build in a new temporary directory; never sync intake/staging or the entire local tree.
 with tempfile.TemporaryDirectory(dir=stage) as t:
  payload=Path(t)
  for rel in ['catalog.json','policy.json','query.py','tools/admit.py','tools/validate-schema.mts','BACKUP_README.md','BACKUP_POLICY.json','AGENTS.md']:
   dest=payload/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/rel,dest)
  for entry in catalog['entries']:
   base=ROOT/entry['path'];proof=read(ROOT/entry['validation'])
   for rel in [*(f['path'] for f in proof['files']),'validation.json']:
    dest=payload/entry['path']/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(base/rel,dest)
  shutil.copyfile(ROOT/'SHARED_README.md',payload/'README.md')
  shutil.copyfile(ROOT/'DOWNLOAD.py',payload/'DOWNLOAD.py')
  # Portable reference list: all asset paths are relative to the downloaded root.
  resources=[]
  for entry in catalog['entries']:
   base=payload/entry['path'];resource=read(base/'resource.json')
   if entry['kind']=='vfx-library':
    for rel in resource['vfx']:
     doc=read(base/'content'/rel)
     resources.append(dict(id=doc['id'],kind='vfx',bundle_id=entry['id'],document=str(Path(entry['path'])/'content'/rel),
                           texture=str(Path(entry['path'])/'content'/doc['texture']) if doc.get('texture') else None))
   else:resources.append(dict(id=entry['id'],kind='character',bundle_id=entry['id'],path=entry['path']))
  write(payload/'resources.json',dict(schema='ggd-shared-resource-index@1',scope='standardized_only',resources=resources))
  for p in sorted(payload.rglob('*')):
   if p.is_file():manifest.append(dict(path=str(p.relative_to(payload)),bytes=p.stat().st_size,sha256=sha(p)))
  release=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:24]
  write(payload/'release-manifest.json',dict(schema='ggd-shared-resource-release@1',release=release,files=manifest,
      entry_count=len(catalog['entries']),resource_count=len(resources),scope='standardized_only'))
  dest=ROOT/'shared/releases'/release
  if dest.exists():
   for f in manifest:
    if sha(dest/f['path'])!=f['sha256']:raise ValueError('Existing local release changed')
  else:shutil.copytree(payload,dest)
 archive=dest/'GGD-Asset-Library.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for rel in sorted([f['path'] for f in manifest]+['release-manifest.json']):
   info=zipfile.ZipInfo('GGD-Asset-Library/'+rel,date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,(dest/rel).read_bytes())
 pointer=dict(schema='ggd-shared-resource-current@1',release=release,release_uri=f'{URI}/releases/{release}/',
              archive_uri=f'{URI}/releases/{release}/GGD-Asset-Library.zip',archive_sha256=sha(archive),archive_bytes=archive.stat().st_size,
              manifest_uri=f'{URI}/releases/{release}/release-manifest.json',resource_count=len(resources),entry_count=len(catalog['entries']))
 write(ROOT/'shared/prepared-current.json',pointer)
 return dest,pointer

def publish(dest,pointer):
 identity=json.loads(runaws(['sts','get-caller-identity','--output','json'],'sts:GetCallerIdentity','current configured role'))
 if 'assumed-role/vibe-coding-s3-role/' not in identity.get('Arn',''):raise RuntimeError('STOP: configured AWS role mismatch: '+identity.get('Arn','<missing>'))
 # Inspect this prefix only. No delete, ACL, bucket/IAM changes or alternative profile.
 runaws(['s3api','list-objects-v2','--bucket',BUCKET,'--prefix',PREFIX+'/','--max-keys','10','--output','json'],'s3:ListBucket',f'arn:aws:s3:::{BUCKET} (prefix {PREFIX}/)')
 release_uri=pointer['release_uri'];print('Uploading standardized release '+pointer['release'],flush=True)
 runaws(['s3','sync',str(dest),release_uri,'--only-show-errors'],'s3:PutObject / s3:ListBucket',release_uri)
 # Read back every uploaded file (including ZIP) and compare actual bytes.
 with tempfile.TemporaryDirectory() as t:
  verify=Path(t)
  runaws(['s3','sync',release_uri,str(verify),'--only-show-errors'],'s3:GetObject / s3:ListBucket',release_uri)
  checked=[]
  for f in sorted(dest.rglob('*')):
   if f.is_file():
    rel=f.relative_to(dest);copy=verify/rel
    if not copy.is_file() or sha(copy)!=sha(f):raise ValueError('S3 read-back mismatch: '+str(rel))
    checked.append(str(rel))
  with zipfile.ZipFile(verify/'GGD-Asset-Library.zip') as z:
   if z.testzip() is not None:raise ValueError('Read-back ZIP failed CRC')
 # Stable docs and catalog are updated only after the immutable release verifies.
 cloud_catalog=read(dest/'catalog.json');cloud_catalog.update(shared_root=URI+'/',release_uri=release_uri,archive_uri=pointer['archive_uri'],release=pointer['release'])
 for e in cloud_catalog['entries']:
  e['s3_uri']=release_uri+e['path']+'/';e['validation_uri']=release_uri+e['validation']
 control=ROOT/'shared/control';control.mkdir(exist_ok=True)
 write(control/'catalog.json',cloud_catalog)
 shutil.copyfile(ROOT/'SHARED_README.md',control/'README.md');shutil.copyfile(ROOT/'COPY_TO_WORKFLOW.txt',control/'COPY_TO_WORKFLOW.txt')
 shutil.copyfile(ROOT/'DOWNLOAD.py',control/'DOWNLOAD.py')
 for name in ['BACKUP_README.md','BACKUP_POLICY.json','AGENTS.md']:
  shutil.copyfile(ROOT/name,control/name)
 resources=read(dest/'resources.json');resources['release_uri']=release_uri
 for r in resources['resources']:
  for k in ['document','texture','path']:
   if r.get(k):r[k+'_uri']=release_uri+r[k]
 write(control/'resources.json',resources)
 for name in ['catalog.json','resources.json','README.md','COPY_TO_WORKFLOW.txt','DOWNLOAD.py','BACKUP_README.md','BACKUP_POLICY.json','AGENTS.md']:
  runaws(['s3','cp',str(control/name),URI+'/'+name,'--only-show-errors'],'s3:PutObject',URI+'/'+name)
 write(control/'current.json',pointer)
 runaws(['s3','cp',str(control/'current.json'),URI+'/current.json','--only-show-errors'],'s3:PutObject',URI+'/current.json')
 for name in ['current.json','catalog.json','resources.json','README.md','COPY_TO_WORKFLOW.txt','DOWNLOAD.py','BACKUP_README.md','BACKUP_POLICY.json','AGENTS.md']:
  with tempfile.TemporaryDirectory() as t:
   copy=Path(t)/name;runaws(['s3','cp',URI+'/'+name,str(copy),'--only-show-errors'],'s3:GetObject',URI+'/'+name)
   if sha(copy)!=sha(control/name):raise ValueError('Fixed index read-back mismatch: '+name)
 receipt=dict(status='published_and_read_back_verified',checked_at=datetime.now().astimezone().isoformat(),role_arn=identity['Arn'],
              bucket=BUCKET,profile=PROFILE,region=REGION,release=pointer['release'],shared_root=URI+'/',
              verified_release_files=len(checked),verified_control_files=9,archive_sha256=pointer['archive_sha256'],
              local_release=str(dest),deletions=0)
 write(ROOT/'shared/publication-receipt.json',receipt);write(ROOT/'shared/current.json',pointer)
 print(json.dumps(receipt,ensure_ascii=False,indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--publish',action='store_true');a=p.parse_args();dest,pointer=build()
 if a.publish:publish(dest,pointer)
 else:print(json.dumps(pointer,ensure_ascii=False,indent=2))
