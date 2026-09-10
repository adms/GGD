#!/usr/bin/env python3
"""Verify committed material receipts; --verify-git also reads pinned Git blobs."""
import argparse,hashlib,json,subprocess
from pathlib import Path,PurePosixPath
def sha(data):return hashlib.sha256(data).hexdigest()
def read(p):return json.loads(p.read_text())
def safe(path):
 p=PurePosixPath(path)
 assert path and not p.is_absolute() and '..' not in p.parts and '.git' not in p.parts and 'node_modules' not in p.parts,path
 return p
def verify(root,verify_git=False):
 frozen=root/'materials/hero74-handoff/frozen';index=read(frozen/'inventory.json');archives={}
 for a in index['existingArchives']:
  p=root/safe(a['committedManifest']);assert sha(p.read_bytes())==a['manifestSha256'],'OLD_MANIFEST_CHANGED'
  m=read(p);loc=read(p.with_name('s3-location.json'));assert loc['manifestSha256']==a['manifestSha256']
  archives[a['manifest']]={r['path']:r for r in m['files']}
 p=frozen/'archive/manifest.json';m=read(p);loc=read(p.with_name('s3-location.json'));assert sha(p.read_bytes())==loc['manifestSha256'],'NEW_MANIFEST_CHANGED'
 uploaded=read(p.with_name('s3-upload-receipt.json'));restored=read(p.with_name('s3-restore-receipt.json'))
 assert uploaded['manifestSha256']==restored['manifestSha256']==loc['manifestSha256']
 assert uploaded['prefix']==loc['prefix'] and uploaded['bucket']==loc['bucket']
 assert len(uploaded['objects'])==len(m['parts'])+1
 u={r['path']:r for r in uploaded['objects']}
 for row in m['parts']:assert u[row['path']]['sha256']==row['sha256'] and u[row['path']]['bytes']==row['bytes']
 assert restored['restoredFiles']==len(m['files']) and restored['verifiedParts']==len(m['parts'])
 assert restored['fileHashesVerified'] is True and restored['freshDownload'] is True
 new={r['path']:r for r in m['files']};seen=set();counts={}
 for row in index['files']:
  safe(row['path']);assert row['path'] not in seen,'DUPLICATE_SOURCE';seen.add(row['path'])
  d=row['delivery'];kind=d['kind'];counts[kind]=counts.get(kind,0)+1
  if kind=='git-snapshot':
   raw=(root/safe(d['path'])).read_bytes();assert sha(raw)==d['payloadSha256'],'SNAPSHOT_CHANGED'
   if not d.get('redaction'):assert sha(raw)==row['sha256']
  elif kind=='git-commit':
   safe(d['path']);assert len(d['commit'])==40 and len(d['blob'])==40
   if verify_git:
    oid=subprocess.check_output(['git','rev-parse',d['commit']+':'+d['path']],cwd=root).decode().strip();assert oid==d['blob'],'GIT_PATH_CHANGED'
    raw=subprocess.check_output(['git','cat-file','blob',d['blob']],cwd=root);assert sha(raw)==row['sha256'],'GIT_BYTES_CHANGED'
  elif kind=='existing-s3':
   a=archives[d['manifest']][d['member']];assert a['sha256']==d['payloadSha256']
   assert row['sha256'] in {a['sha256'],a.get('sourceSha256')},'OLD_ARCHIVE_SOURCE_CHANGED'
  elif kind=='new-s3':
   a=new[d['member']];assert a['sha256']==d['payloadSha256']==row['sha256'],'NEW_ARCHIVE_SOURCE_CHANGED'
  else:raise AssertionError('UNKNOWN_DELIVERY')
 assert counts==index['summary']['byDelivery'] and len(seen)==index['summary']['files']
 assert index['summary']['unclassified']==0
 assert len(new)==counts['new-s3']
 result={'files':len(seen),'byDelivery':counts,'newS3FilesRestored':len(new),'gitBlobsRead':verify_git,'trainEligible':False,'acceptance':'material-delivery-only; not hero runtime or model quality'}
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--verify-git',action='store_true');a=p.parse_args();root=Path(__file__).resolve().parents[2]
 print(json.dumps(verify(root,a.verify_git),ensure_ascii=False))
if __name__=='__main__':main()
