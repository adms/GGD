#!/usr/bin/env python3
"""Revalidate the seven local LoL bodies against the current shared model contract."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(exist_ok=False);repo=Path(__file__).resolve().parents[2];base=ws/'outputs/community-lol-models-20260907'
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def fp(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
names=dict(karthus='卡爾瑟斯',leesin='李星',lux='拉克絲',missfortune='好運姐',warwick='沃維克',xerath='齊勒斯',yasuo='犽宿');results=[]
for id,name in names.items():
 d=out/id;d.mkdir();r=dict(characterId='lol:'+id,heroId='example:'+id,sourceCharacter=name,sourceWork='英雄聯盟 League of Legends',stage='validation',directory=str(d));results.append(r)
 try:
  source=base/'ggd-runtime-candidate'/f'{id}.glb';doc=read(base/'forge-preview/model-docs'/f'community.lol.{id}.json');candidate=d/'normalized.glb'
  cmds=[['python3',str(repo/'tools/hero-model-library/normalize-existing-glb.py'),str(source),str(candidate)]]
  for cmd in cmds:subprocess.run(cmd,cwd=repo,check=True,stdout=subprocess.DEVNULL)
  receipt=dict(schema='ggd-library-model-preparation@1',asset='lol:'+id,source=fp(source),output=fp(candidate),stateClips=doc['clipMap'],yawOffsetDeg=doc.get('yawOffsetDeg',0),limitations=['原 LOL 模型；hurt 共用 idle。保留先前已驗證的六動作選段與無渲染子節點動畫裁剪。完整動作原檔另存備份。'])
  write(d/'preparation.json',receipt)
  for label,cmd in [('validation',['node','--import','tsx',str(repo/'tools/community-hero-forge/finalize-library-body.mts'),'--receipt',str(d/'preparation.json'),'--out',str(d/'runtime')]),('motion',['node',str(repo/'tools/community-hero-forge/inspect-library-motion.mjs'),str(d/'runtime'),str(d/'runtime/motion.json')])]:
   with (d/(label+'.log')).open('w') as f:ret=subprocess.run(cmd,cwd=repo,stdout=f,stderr=subprocess.STDOUT)
   if ret.returncode:raise ValueError((d/(label+'.log')).read_text()[-1800:])
  r.update(stage='prepared',runtime=str(d/'runtime'))
 except Exception as e:r['error']=str(e)
 write(out/'summary.json',results);print(json.dumps(r,ensure_ascii=False),flush=True)
raise SystemExit(1 if any('error' in r for r in results) else 0)
