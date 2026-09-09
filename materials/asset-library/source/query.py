#!/usr/bin/env python3
"""Default: standardized, verified local resources. --pending explicitly opts into intake."""
import argparse,hashlib,json,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def norm(x):return unicodedata.normalize('NFKC',x).casefold()
def read(p):return json.loads(p.read_text())
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('query',nargs='?',default='');p.add_argument('--pending',action='store_true');p.add_argument('--kind',choices=['character','vfx','model']);p.add_argument('--limit',type=int,default=20);p.add_argument('--offset',type=int,default=0);a=p.parse_args()
 if not 1<=a.limit<=1000 or a.offset<0:p.error('limit: 1..1000; offset: >= 0')
 records=[];rejected=[]
 if a.pending:
  records=read(ROOT/'intake/catalog.json')['entries']
 else:
  for entry in read(ROOT/'catalog.json')['entries']:
   base=(ROOT/entry['path']).resolve();proof=read(ROOT/entry['validation']);bad=[]
   if not base.is_relative_to(ROOT/'ready'):raise ValueError('Invalid catalog path')
   for key, rel in [('policy_sha256','policy.json'),('validator_sha256','tools/admit.py'),('schema_validator_sha256','tools/validate-schema.mts')]:
    if hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()!=proof.get(key):bad.append('admission_rules_changed:'+rel)
   for f in proof['files']:
    path=(base/f['path']).resolve()
    if not path.is_relative_to(base) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=f['sha256']:bad.append(f['path'])
   if bad:rejected.append(dict(id=entry['id'],reason='missing_or_modified_files',files=bad));continue
   resource=read(base/'resource.json')
   if entry['kind']=='vfx-library':
    for rel in resource['vfx']:
     path=base/'content'/rel;d=read(path)
     records.append(dict(id=d['id'],kind='vfx',title=d['id'],status='standardized',document=str(path),texture=str(base/'content'/d['texture']) if d.get('texture') else None,bundle=entry['id'],content_root=str(base/'content'),validation=str(ROOT/entry['validation']),source=resource['provenance']))
   else:records.append(dict(entry,kind='model' if entry['kind']=='model-body' else 'character',content_root=str(base/'content')))
 q=norm(a.query);records=[r for r in records if (not a.kind or r.get('kind')==a.kind) and (not q or q in norm(json.dumps(r,ensure_ascii=False)))]
 print(json.dumps(dict(scope='pending_not_standardized' if a.pending else 'standardized_only',total=len(records),offset=a.offset,results=records[a.offset:a.offset+a.limit],rejected_bundles=rejected),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
