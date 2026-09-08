#!/usr/bin/env python3
"""Copy already-sanitized historical source files from a verified local archive."""
import argparse,gzip,hashlib,importlib.util,io,json,tarfile
from pathlib import Path
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);a=p.parse_args()
 root=Path(__file__).resolve().parents[2];frozen=root/'materials/hero74-handoff/frozen';index=frozen/'inventory.json';x=json.loads(index.read_text())
 wanted={r['path']:r for r in x['files'] if r['delivery']['kind']=='existing-s3' and r['delivery'].get('redaction')}
 if not wanted:print('No sanitized source copies pending');return
 source=a.workspace/'GGD-community-hero-forge/materials/community-hero-forge';m=json.loads((source/'manifest.json').read_text());parts=[]
 for r in m['parts']:
  f=source/r['path']
  if f.stat().st_size!=r['bytes'] or sha(f.read_bytes())!=r['sha256']:raise ValueError('Local archive part differs')
  parts.append(f)
 spec=importlib.util.spec_from_file_location('restore_helpers',Path(__file__).with_name('restore.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
 copied=[];payloads={};manifest_rows={r['path']:r for r in m['files']};wanted_hashes={r['delivery']['payloadSha256'] for r in wanted.values()}
 with io.BufferedReader(h.JoinedParts(parts)) as joined,gzip.GzipFile(fileobj=joined) as gz:
  with tarfile.open(fileobj=gz,mode='r|') as tar:
   for item in tar:
    entry=manifest_rows.get(item.name)
    if entry and entry['sha256'] in wanted_hashes and item.isfile():
     data=tar.extractfile(item).read()
     if sha(data)!=entry['sha256']:raise ValueError('Archive member mismatch')
     payloads[entry['sha256']]=data
    if item.name not in wanted:continue
    row=wanted[item.name];d=row['delivery']
    raw=payloads[d['payloadSha256']]
    if sha(raw)!=d['payloadSha256']:raise ValueError('Sanitized payload mismatch')
    target=frozen/'snapshots'/row['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    row['delivery']={'kind':'git-snapshot','path':str(target.relative_to(root)),'payloadSha256':sha(raw),'redaction':d['redaction'],'sanitizedArchive':d['manifest'],'sanitizedMember':d['member']}
    row['note']='Sanitized historical source copied byte-for-byte from the verified existing archive; source workspace unchanged.'
    copied.append(item.name)
 if set(copied)!=set(wanted):raise ValueError('Missing sanitized source')
 counts={}
 for row in x['files']:counts[row['delivery']['kind']]=counts.get(row['delivery']['kind'],0)+1
 x['summary']['byDelivery']=counts;x['summary']['snapshots']=counts.get('git-snapshot',0)
 index.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'sanitizedSourceFilesCopied':len(copied),'sourceWorkspaceUnchanged':True}))
if __name__=='__main__':main()
