#!/usr/bin/env python3
"""Make/recheck source-vs-candidate WebGL diagnostic images for JUMP Dai L4D2.

The comparison always uses the pre-existing material-rebuild v3 render and
this stage's three fixed-angle Babylon render.  It creates no model output and
never writes into either predecessor.  RGB pixel deltas are diagnostic evidence
only; they are not a substitute for an owner visual decision.
"""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
ASSETS=REPO.parent/'GGD-Asset-Library'
DEFAULT_STAGE=ASSETS/'conversions/jump-force-dai-l4d2-topology-preserving-v2'
VIEWS=('front','back','isometric')
def paths(stage: Path):
 run=stage/'run-a-wholemesh-preserve-boundaries'
 return run, ASSETS/'conversions/jump-force-dai-l4d2-material-rebuild-v3/visual-review-v1', run/'visual-review-v1', run/'visual-comparison-v1'

def sha(path:Path)->str:
 h=hashlib.sha256()
 with path.open('rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()

def build(stage: Path, check:bool)->dict:
 RUN,SOURCE,CANDIDATE,OUT=paths(stage.resolve())
 if check:
  data=json.loads((OUT/'comparison.json').read_text())
  if data.get('schema')!='ggd.jump-force-dai-l4d2-wholemesh-visual-comparison@1':raise ValueError('unexpected comparison schema')
  for row in data['views']:
   for root,key in ((SOURCE,'sourceSha256'),(CANDIDATE,'candidateSha256')):
    path=root/(row['view']+'.png')
    if sha(path)!=row[key]:raise ValueError('render SHA drift: '+str(path))
   for suffix in ('rgb-delta.png','comparison.png'):
    if not (OUT/(row['view']+'-'+suffix)).is_file():raise FileNotFoundError(row['view']+'-'+suffix)
  return {'check':True,'views':data['views']}
 if OUT.exists():raise FileExistsError('refusing to overwrite visual comparison: '+str(OUT))
 OUT.mkdir()
 rows=[]
 for view in VIEWS:
  source=Image.open(SOURCE/(view+'.png')).convert('RGBA');candidate=Image.open(CANDIDATE/(view+'.png')).convert('RGBA')
  if source.size!=candidate.size:raise ValueError('render dimensions differ')
  diff=ImageChops.difference(source,candidate).convert('RGB');diff.save(OUT/(view+'-rgb-delta.png'))
  background=source.getpixel((0,0));sp=source.convert('RGB').load();cp=candidate.convert('RGB').load();total=changed=0;sum_abs=0.0;max_abs=0.0
  for y in range(source.height):
   for x in range(source.width):
    va,vb=sp[x,y],cp[x,y]
    if max(max(abs(va[i]-background[i]) for i in range(3)),max(abs(vb[i]-background[i]) for i in range(3)))>4:
     total+=1;delta=sum(abs(va[i]-vb[i]) for i in range(3))/3;sum_abs+=delta;max_abs=max(max_abs,delta)
     if delta>20:changed+=1
  rows.append({'view':view,'sourceSha256':sha(SOURCE/(view+'.png')),'candidateSha256':sha(CANDIDATE/(view+'.png')),'foregroundPixels':total,'foregroundDeltaGt20Pixels':changed,'foregroundDeltaGt20Pct':round(changed*100/total,4),'meanForegroundRgbAbsDelta':round(sum_abs/total,4),'maxForegroundRgbAbsDelta':max_abs})
  panel=Image.new('RGB',(source.width*3,source.height+30),'white');panel.paste(source.convert('RGB'),(0,30));panel.paste(candidate.convert('RGB'),(source.width,30));panel.paste(diff,(source.width*2,30));label=ImageDraw.Draw(panel);label.text((8,8),'source 89,833 triangles',fill='black');label.text((source.width+8,8),'candidate 7,616 triangles',fill='black');label.text((source.width*2+8,8),'absolute RGB delta',fill='black');panel.save(OUT/(view+'-comparison.png'))
 result={'schema':'ggd.jump-force-dai-l4d2-wholemesh-visual-comparison@1','sourceRenderRoot':str(SOURCE.resolve()),'candidateRenderRoot':str(CANDIDATE.resolve()),'sourceTriangles':89833,'candidateTriangles':7616,'metricScope':'fixed Babylon WebGL front/back/isometric pixels; diagnostic only, not owner visual approval','views':rows}
 (OUT/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 return {'check':False,'views':rows}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--stage',type=Path,default=DEFAULT_STAGE);p.add_argument('--check',action='store_true');args=p.parse_args();print(json.dumps(build(args.stage,args.check),ensure_ascii=False,indent=2))
