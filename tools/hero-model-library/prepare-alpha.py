#!/usr/bin/env python3
"""Upgrade existing prepared receipts through the shared opaque-alpha normalization."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--only');a=p.parse_args()
repo=Path(__file__).resolve().parents[2];tools=repo/'tools/community-hero-forge';sys.path.insert(0,str(tools))
from normalize_opaque_alpha import normalize
ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
base=ws/'outputs/hero-model-options-20260909';locations=read(base/'runtime-locations.json');manifest=read(repo/'materials/hero-model-library/manifest.json');results=[]
for m in manifest['models']:
 if a.only and m['id'] not in a.only.split(','):continue
 runtime=Path(locations[m['id']]);raw=(runtime/'body.glb').read_bytes();_,changed=normalize(raw)
 if not changed:continue
 d=out/m['id'].replace(':','-');d.mkdir();receipt=read(runtime/'receipt.json');prep=receipt['preparation']
 prep['upstreamPreparationSource']=prep['source'];prep['source']=dict(path=str(runtime/'body.glb'),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
 prep.update(schema='ggd-library-model-preparation@1',output=dict(path=str(runtime/'body.glb'),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw)),stateClips=read(runtime/'model.json')['clipMap'],yawOffsetDeg=read(runtime/'model.json').get('yawOffsetDeg',0))
 write(d/'input.receipt.json',prep)
 for index,cmd in enumerate([['node','--import','tsx',str(tools/'finalize-library-body.mts'),'--receipt',str(d/'input.receipt.json'),'--out',str(d/'runtime')],['node',str(tools/'inspect-library-motion.mjs'),str(d/'runtime'),str(d/'runtime/motion.json')]]):
  with (d/f'{index}.log').open('w') as log:r=subprocess.run(cmd,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
  if r.returncode:raise RuntimeError((d/f'{index}.log').read_text()[-2000:])
 result=dict(characterId=m['id'],sourceCharacter=m['sourceCharacter'],sourceWork=m['sourceWork'],stage='prepared',runtime=str(d/'runtime'))
 results.append(result);write(out/'summary.json',results);print(json.dumps(result,ensure_ascii=False),flush=True)
