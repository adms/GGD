#!/usr/bin/env python3
"""Download current standardized S3 release using the preconfigured profile. Keep local copies."""
import hashlib,json,os,subprocess,tempfile,zipfile,argparse
from pathlib import Path
URI='s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/'
def aws(args):
 env=os.environ.copy();env['AWS_PROFILE']='vibe-coding';env['AWS_REGION']='ap-east-2';env['AWS_PAGER']=''
 p=subprocess.run(['aws',*args,'--profile','vibe-coding','--region','ap-east-2','--no-cli-pager'],env=env,capture_output=True,text=True)
 if p.returncode:raise RuntimeError('AWS operation stopped: '+str(args)+'\n'+p.stderr)
 return p.stdout
p=argparse.ArgumentParser();p.add_argument('--destination',type=Path,default=Path('downloaded-releases'));a=p.parse_args()
identity=json.loads(aws(['sts','get-caller-identity','--output','json']))
if 'assumed-role/vibe-coding-s3-role/' not in identity.get('Arn',''):raise RuntimeError('STOP: unexpected AWS role '+identity.get('Arn','<missing>'))
with tempfile.TemporaryDirectory() as t:
 temp=Path(t);aws(['s3','cp',URI+'current.json',str(temp/'current.json'),'--only-show-errors']);current=json.loads((temp/'current.json').read_text())
 if not current['archive_uri'].startswith(URI+'releases/'):raise ValueError('Archive outside authorized resource prefix')
 archive=temp/'library.zip';aws(['s3','cp',current['archive_uri'],str(archive),'--only-show-errors'])
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=current['archive_sha256']:raise ValueError('Downloaded ZIP hash mismatch')
 dest=a.destination/current['release'];dest.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(archive) as z:
  if z.testzip():raise ValueError('ZIP CRC mismatch')
  for i in z.infolist():
   out=(dest/i.filename).resolve()
   if not out.is_relative_to(dest.resolve()):raise ValueError('Unsafe ZIP path')
   if i.is_dir():out.mkdir(parents=True,exist_ok=True);continue
   data=z.read(i)
   if out.exists() and out.read_bytes()!=data:raise ValueError('Existing local file differs; preserving it: '+str(out))
   out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
 root=dest/'GGD-Asset-Library';manifest=json.loads((root/'release-manifest.json').read_text())
 for f in manifest['files']:
  source=(root/f['path']).resolve()
  if not source.is_relative_to(root.resolve()) or hashlib.sha256(source.read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Manifest mismatch: '+f['path'])
 print(root.resolve())
