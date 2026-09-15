#!/usr/bin/env python3
"""Prepare locally indexed model options; retain source bytes and per-source failures.
Usage: prepare.py --workspace PATH --out NEW_DIRECTORY
"""
import argparse, hashlib, json, sqlite3, subprocess, sys
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--only', help='Comma-separated native character numbers')
a=parser.parse_args(); ws=a.workspace.resolve(); out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
repo=Path(__file__).resolve().parents[2]; converter=repo/'tools/community-hero-forge'
sys.path.insert(0,str(converter))
from convert_jumpx_body import native,unpack,text
con=sqlite3.connect(f'file:{ws}/outputs/asset-library-registry-20260907/catalog.sqlite?mode=ro',uri=True)
characters={r[0]:json.loads(r[1]) for r in con.execute('select id,data from characters')}
assets={r[0]:json.loads(r[1]) for r in con.execute('select id,data from assets where exists_local=1')}
for cid,aid,confidence in con.execute('select character_id,asset_id,confidence from links'):
 if aid in assets:assets[aid].setdefault('character_links',[]).append(dict(character_id=cid,confidence=confidence))
for v in assets.values():v.setdefault('character_links',[])
by_path={v['path']:v for v in assets.values() if v['kind']=='model'}; textures={}
for v in assets.values():
 if v['kind']=='texture':textures.setdefault(Path(v['path']).stem.casefold(),[]).append(v)
upgrades=json.loads((ws/'GGD-Asset-Library/intake/existing-hero-upgrades/upgrades.json').read_text())['entries']
pairs=json.loads((ws/'GGD-Asset-Library/intake/batch2-37/visual-pairs.json').read_text())['characters']
ids=set(c['character_id'] for e in upgrades for c in e['new_candidates'] if c['character_id'].startswith('300heroes:'))
for e in pairs:
 for c in [e['primary'],*e.get('alternates',[])]:
  if c['id'].isdigit():ids.add('300heroes:'+str(int(c['id'])))
# Reuse explicit reviewed selections where available.
known={}
for p in (converter/'library-bodies').glob('*.selection.json'):
 for e in json.loads(p.read_text()).get('entries',[]):known[e['characterId']]=e
if a.only:ids &= {'300heroes:'+str(int(n)) for n in a.only.split(',')}
results=[]
def save(): (out/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
def run(args,path):
 with path.open('w') as log:r=subprocess.run(args,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError(path.name+': '+path.read_text()[-1500:])
for cid in sorted(ids,key=lambda v:int(v.split(':')[1])):
 c=characters[cid];d=out/cid.replace(':','-');d.mkdir();r=dict(characterId=cid,sourceCharacter=c['name'],sourceWork=c['origin'],stage='selection',directory=str(d));results.append(r)
 try:
  source=Path(c['base_model']); row=by_path[str(source)];v,f,h,data=native(source.read_bytes())
  texnames=[text(h,unpack('<2I',h,f['atex']+8*i)[1]) for i in range(f['ntex'])]
  meshes=[]; selected={}
  for i in range(f['ngeo']):
   g=unpack('<24I',h,f['ageo']+124*i); tid=unpack('<i',h,f['amtl']+48*g[4]+12)[0];name=texnames[tid] if 0<=tid<len(texnames) else ''
   if not name or Path(name).stem.lower().startswith('tx_') or g[7]<50:continue
   meshes.append((i,g[7],g[4],name))
  # Maple's Object001/Object010 are two independent companion bodies, not
  # her humanoid body or shield. Keep them in the native source; this release
  # selects mesh 5 (body), 1 (shield) and 3 (body accessory) only.
  explicit={'300heroes:53':[0,5],'300heroes:113':[4,0],'300heroes:137':[0,1],'300heroes:253':[1,0],'300heroes:272':[5,1,3]}
  if cid in explicit:meshes=[m for m in meshes if m[0] in explicit[cid]]
  meshes=sorted(meshes,key=lambda v:-v[1])[:5]
  config=known.get(cid)
  if config is None:
   clips=[text(unpack('<80s5h',h,f['aact']+90*i)[0],0) for i in range(f['nact'])]
   def choose(*names):return next((n for n in names if n in clips),None)
   state=dict(idle=choose('bat_idle','single_idle'),run=choose('single_run','bat_run'),attack=choose('single_attack_attcom_1','single_attack_attcom','bat_attack_attcom_1','single_attack_attcom_a'),cast=choose('single_skill_01','single_skill_1','single_attack_attcom_1'),hurt=choose('hurt','hit','bat_idle','single_idle'),death=choose('dead','death'))
   if not all(state.values()):raise ValueError('Missing standard state mapping: '+str(state)+'; available='+str(clips))
   for i,n,mid,name in meshes:
    options=textures.get(Path(name).stem.casefold(),[]); options=sorted(options,key=lambda x:(Path(x['path']).parent!=source.parent,x['readiness']!='native',x['path']))
    if not options:raise ValueError('Missing diffuse '+name)
    selected[str(mid)]=options[0]['id']
   config=dict(asset=row['id'],characterId=cid,sourceName=c['name'],sourceOrigin=c['origin'],meshes=[m[0] for m in meshes],textures=selected,fps=32,clips=state,limitations=['Body and native motion only; VFX and SFX remain separate.','Hurt uses idle when no native hit clip exists.'])
  if cid=='300heroes:137':config['flattenHierarchy']='repair'
  for name,value in [('selection',config),('models',{'results':[row]}),('characters',{'results':[c]}),('textures',{'results':[assets[x] for x in config['textures'].values()]})]:
   (d/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
  r['stage']='conversion'
  run([sys.executable,str(converter/'convert_jumpx_body.py'),'--model-query',str(d/'models.json'),'--character-query',str(d/'characters.json'),'--texture-query',str(d/'textures.json'),'--selection',str(d/'selection.json'),'--out',str(d/'body.glb')],d/'conversion.log')
  r['stage']='validation'
  run(['node','--import','tsx',str(converter/'finalize-library-body.mts'),'--receipt',str(d/'body.receipt.json'),'--out',str(d/'runtime')],d/'validation.log')
  run(['node',str(converter/'inspect-library-motion.mjs'),str(d/'runtime'),str(d/'runtime/motion.json')],d/'motion.log')
  r['stage']='prepared';r['runtime']=str(d/'runtime')
 except Exception as e:r['error']=str(e)
 save();print(json.dumps({k:r[k] for k in ['characterId','stage','error'] if k in r},ensure_ascii=False),flush=True)
sys.exit(1 if any('error' in r for r in results) else 0)
