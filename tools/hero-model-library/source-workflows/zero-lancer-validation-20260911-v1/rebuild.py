#!/usr/bin/env python3
"""Rebuild existing Zero Lancer candidates using pinned project converters in a new stage."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--delivery',type=Path,required=True)
ap.add_argument('--python',type=Path,default=Path('/private/tmp/ggd-public-model-venv/bin/python'))
args=ap.parse_args();repo=args.repo.resolve();delivery=args.delivery.resolve();out=delivery/'rebuild'
cfg=json.loads(Path(__file__).with_name('source-config.json').read_text());assert not out.exists()
for spec in cfg['sourceToolPins']: assert sha(repo/spec['path'])==spec['sha256']
out.mkdir();(out/'tools').mkdir()
for rel in ['extracted/Zero Lancer/zero lancer.cbb','acquisition.json','source-api.json']:
    target=out/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(delivery/'raw/source'/rel,target)
tools=[]
for spec in cfg['sourceToolPins']:
    p=repo/spec['path'];dst=out/'tools'/p.name;shutil.copy2(p,dst);tools.append(dst)
# Only the original hard-coded task root is replaced. Its parsing/material logic is preserved.
material_source=tools[1].read_text()
adapted,count=re.subn(r'^ROOT = Path\(.+\)$',"ROOT = Path(__import__('sys').argv[1]).resolve()",material_source,flags=re.MULTILINE)
assert count==1
adapted_path=out/'tools/process-with-explicit-root.py';adapted_path.write_text(adapted)
version=subprocess.check_output([str(args.python),'-P','-c','import sys,UnityPy,numpy;print(sys.version);print(UnityPy.__version__);print(numpy.__version__)'],text=True)
assert version.splitlines()[-2]=='1.25.3'
commands=[
    [args.python,'-P',tools[0],out/'extracted/Zero Lancer/zero lancer.cbb',out/'converted/diarmuid-p1','--root-name','Diarmuid BRC_character','--height','1.8'],
    [args.python,'-P',adapted_path,out],
]
for i,command in enumerate(commands):
    p=subprocess.run([str(x) for x in command],capture_output=True,text=True)
    (out/f'stage-{i+1}.log').write_text(p.stdout+'\nSTDERR\n'+p.stderr)
    if p.returncode:raise RuntimeError(f'Rebuild stage {i+1} failed; preserve log and stage')
comparisons=[]
for v in cfg['variants']:
    p=out/v['path'];comparisons.append({'variant':v['variant'],'path':str(p),'sha256':sha(p),
        'expectedSourceSha256':v['sha256'],'byteIdentical':sha(p)==v['sha256'],'bytes':p.stat().st_size})
receipt={'schema':'ggd.zero-lancer-source-rebuild@1','tools':cfg['sourceToolPins'],'versionOutput':version,
    'commands':[[str(x) for x in c] for c in commands],'sourceRootParameterizationOnly':True,
    'variants':comparisons,'allModelBytesIdentical':all(x['byteIdentical'] for x in comparisons)}
(delivery/'evidence/source-rebuild.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False,indent=2))
assert receipt['allModelBytesIdentical'],'Rebuilt bytes differ; do not silently replace accepted source'
