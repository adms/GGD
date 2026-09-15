#!/usr/bin/env python3
"""Record an already read-back-verified fixed-library release in Git metadata."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--library',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]/'materials/hero-model-library';library=a.library.resolve()
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
release=read(library/'shared/current.json');receipt=read(library/'shared/publication-receipt.json')
assert receipt['status']=='published_and_read_back_verified' and receipt['release']==release['release']
assert receipt['archive_sha256']==release['archive_sha256']
manifest=read(library/'shared/releases'/release['release']/'hero-model-options.json')
catalog=read(library/'shared/releases'/release['release']/'catalog.json');entries={e['id']:e for e in catalog['entries']}
release['model_locations']={m['modelKey']:entries[m['bundleId']]['path']+'/content/'+m['glbPath'] for m in manifest['models']}
receipt.pop('local_release',None);receipt.pop('role_arn',None)
write(root/'manifest.json',manifest);write(root/'release.json',release);write(root/'s3-publication-receipt.json',receipt)
print(release['release'])
