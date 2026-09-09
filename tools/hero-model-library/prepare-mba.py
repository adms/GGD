#!/usr/bin/env python3
"""Normalize every MBA option in the local upgrade ledger, preserving source rigs."""
import argparse,json,sqlite3,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
repo=Path(__file__).resolve().parents[2];tools=repo/'tools/community-hero-forge'
con=sqlite3.connect(f'file:{ws}/outputs/asset-library-registry-20260907/catalog.sqlite?mode=ro',uri=True)
rows={json.loads(r[0])['path']:json.loads(r[0]) for r in con.execute("select data from assets where kind='model' and format='glb' and library='mba'")}
results=[]
for e in json.loads((ws/'GGD-Asset-Library/intake/existing-hero-upgrades/upgrades.json').read_text())['entries']:
 for c in e['new_candidates']:
  if not c['character_id'].startswith('mba:'):continue
  d=out/c['character_id'].replace(':','-');d.mkdir();r=dict(characterId=c['character_id'],sourceCharacter=c['name'],sourceWork=c['origin'],directory=str(d),stage='preparation');results.append(r)
  try:
   row=rows[c['glb']['path']];row['character_links']=[dict(character_id=x,confidence=y) for x,y in con.execute('select character_id,confidence from links where asset_id=?',(row['id'],))]
   (d/'query.json').write_text(json.dumps({'results':[row]},ensure_ascii=False))
   clips=dict(idle='wait',run='F-Move',attack='attack_01',cast='SP-1' if c['character_id']=='mba:Chara01' else 'sp01_01',hurt='Damage-1',death='lose' if c['character_id']=='mba:Chara01' else 'D-Down')
   (d/'clips.json').write_text(json.dumps(clips))
   commands=[[sys.executable,str(tools/'prepare_mba_body.py'),'--query',str(d/'query.json'),'--asset',row['id'],'--out',str(d/'body.glb')],['node','--import','tsx',str(tools/'finalize-library-body.mts'),'--receipt',str(d/'body.receipt.json'),'--clips',str(d/'clips.json'),'--out',str(d/'runtime')],['node',str(tools/'inspect-library-motion.mjs'),str(d/'runtime'),str(d/'runtime/motion.json')]]
   for i,cmd in enumerate(commands):
    with (d/f'{i}.log').open('w') as log:ret=subprocess.run(cmd,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
    if ret.returncode:raise RuntimeError((d/f'{i}.log').read_text()[-1800:])
   r['stage']='prepared';r['runtime']=str(d/'runtime')
  except Exception as error:r['error']=str(error)
  (out/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['characterId','stage','error'] if k in r},ensure_ascii=False),flush=True)
sys.exit(1 if any('error' in r for r in results) else 0)
