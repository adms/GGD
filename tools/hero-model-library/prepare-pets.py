#!/usr/bin/env python3
"""Convert explicitly paired pet bodies; retain non-combat motion labels and limitations."""
import argparse,json,sqlite3,subprocess,sys,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--only');p.add_argument('--repair-octopus',action='store_true');a=p.parse_args();ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
repo=Path(__file__).resolve().parents[2];tools=repo/'tools/community-hero-forge';sys.path.insert(0,str(tools))
from convert_jumpx_body import native,unpack,text,convert,encode_glb
con=sqlite3.connect(f'file:{ws}/outputs/asset-library-registry-20260907/catalog.sqlite?mode=ro',uri=True)
rows=[json.loads(r[0]) for r in con.execute("select data from assets where exists_local=1 and library='300heroes'")];textures={Path(r['path']).stem.casefold():r for r in rows if r['kind']=='texture'}
choices=json.loads((ws/'GGD-Asset-Library/intake/batch2-37/visual-pairs.json').read_text())['characters'];sources={c['primary']['id']:c['primary'] for c in choices if c['primary']['id'] in ['pod','spider','octopus','tiny-kirito']};results=[]
for key,c in sources.items():
 if a.only and key != a.only:continue
 d=out/key;d.mkdir();r=dict(characterId='pet:'+key,sourceCharacter=c['name'],sourceWork=c.get('origin','300英雄寵物'),directory=str(d),stage='conversion');results.append(r)
 try:
  source=Path(c['model']['path']);raw=source.read_bytes();row=next(r for r in rows if r['path']==str(source) and r['kind']=='model');v,f,h,data=native(raw)
  names=[text(h,unpack('<2I',h,f['atex']+8*i)[1]) for i in range(f['ntex'])];meshes=[];tex={}
  for i in range(f['ngeo']):
   g=unpack('<24I',h,f['ageo']+i*124);tid=unpack('<i',h,f['amtl']+48*g[4]+12)[0]
   if not 0<=tid<len(names) or names[tid].lower().startswith('tx_') or g[7]<30:continue
   meshes.append(i);tex[str(g[4])]=textures[Path(names[tid]).stem.casefold()]
  clips=dict(idle='bat_idle',run='bat_run',attack='bat_dance1',cast='bat_dance2',hurt='bat_hit' if key=='octopus' else 'bat_idle',death='dead' if key=='octopus' else 'bat_dead')
  doc,binary,report=convert(raw,meshes,list(dict.fromkeys(clips.values())),tex,32,repair_key_bones=('Bone099','Bone100','Bone101','Bone102') if key=='octopus' and a.repair_octopus else ());body=encode_glb(doc,binary);(d/'body.glb').write_bytes(body)
  def fp(path,b):return dict(path=str(path),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
  if key=='octopus' and a.repair_octopus:report['derivativeRepair']=dict(bones=['Bone099','Bone100','Bone101','Bone102'],method='Interpolate non-finite TRS within each selected clip; preserve finite keys and source bytes',nativeMotionFidelity='Reconstructed samples are not native animation proof')
  receipt=dict(schema='ggd-library-model-preparation@1',asset=row['id'],source=fp(source,raw),output=fp(d/'body.glb',body),stateClips=clips,limitations=['Pet dance clips adapt attack/cast; no native combat or separate hurt reaction.','Visual proxy only; character-specific remodeling and composite bodies are not included.'],**report)
  (d/'body.receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
  for i,cmd in enumerate([['node','--import','tsx',str(tools/'finalize-library-body.mts'),'--receipt',str(d/'body.receipt.json'),'--out',str(d/'runtime')],['node',str(tools/'inspect-library-motion.mjs'),str(d/'runtime'),str(d/'runtime/motion.json')]]):
   with (d/f'{i}.log').open('w') as log:ret=subprocess.run(cmd,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
   if ret.returncode:raise RuntimeError((d/f'{i}.log').read_text()[-1300:])
  r['stage']='prepared';r['runtime']=str(d/'runtime')
 except Exception as error:r['error']=str(error)
 (out/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False),flush=True)
sys.exit(1 if any('error' in r for r in results) else 0)
