#!/usr/bin/env python3
"""Render all 11 approved derivatives, plus the proposed Mai decimation, in parallel."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from pathlib import Path
import argparse,json,subprocess
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
def digest(path): return sha256(path.read_bytes()).hexdigest()
def read(path): return json.loads(path.read_text())

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--mai-candidate',type=Path,required=True);parser.add_argument('--jobs',type=int,default=3);args=parser.parse_args()
 repo=args.repo.resolve();output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
 policy=read(repo/'materials/hero-model-library/priority-evidence/approved-derivatives-v1/current-policy.json')
 jobs=[dict(id=row['id'],label=row['name'],variant='current',source=repo/row['binaryPath']) for row in policy['rows']]
 jobs.append(dict(id='mai',label='不知火舞',variant='decimated-candidate',source=args.mai_candidate.resolve()))
 def render(job):
  folder=output/f"{job['id']}-{job['variant']}"
  if (folder/'run.json').is_file() and read(folder/'run.json').get('complete'):
   return job,folder
  if folder.exists():
   raise RuntimeError(f'incomplete output exists; inspect before retry: {folder}')
  subprocess.run(['python3',str(HERE/'render_static_glb.py'),str(job['source']),str(folder),'--repo',str(repo)],check=True)
  return job,folder
 records=[]
 with ThreadPoolExecutor(max_workers=max(1,min(args.jobs,4))) as pool:
  futures=[pool.submit(render,job) for job in jobs]
  for future in as_completed(futures):
   job,folder=future.result();run=read(folder/'run.json');proof=read(folder/'proof.json')
   records.append({**job,'source':str(job['source']),'sourceSha256':digest(job['source']),'output':str(folder),'run':str(folder/'run.json'),'proof':str(folder/'proof.json'),'babylonVersion':proof['babylonVersion'],'animationGroups':proof['animationGroups'],'skeletons':proof['skeletons'],'views':[{"name":name,"path":str(folder/f'{name}.png'),"sha256":digest(folder/f'{name}.png')} for name in ('front','back','isometric')],'complete':run['complete'] and run['proofExists'] and not run['errorExists']})
 records.sort(key=lambda x:(x['id'],x['variant']))
 font_path=Path('/System/Library/Fonts/PingFang.ttc')
 font=ImageFont.truetype(str(font_path),22) if font_path.is_file() else ImageFont.load_default(size=22);thumb=420;pad=18;rows=(len(records)+2)//3
 sheet=Image.new('RGB',(3*(thumb*2+pad)+pad,rows*(thumb+58+pad)+pad),(235,237,241));draw=ImageDraw.Draw(sheet)
 for i,row in enumerate(records):
  x=pad+(i%3)*(thumb*2+pad);y=pad+(i//3)*(thumb+58+pad)
  for j,name in enumerate(('front','isometric')):
   image=Image.open(Path(row['output'])/f'{name}.png').convert('RGB');image.thumbnail((thumb,thumb));sheet.paste(image,(x+j*thumb+(thumb-image.width)//2,y+(thumb-image.height)//2))
  draw.text((x,y+thumb+6),f"{row['label']} / {row['variant']}",font=font,fill=(20,20,24))
 sheet_path=output/'approved11-contact-sheet.jpg';sheet.save(sheet_path,quality=90,optimize=True)
 mai=[row for row in records if row['id']=='mai'];ab=Image.new('RGB',(3*420+4*pad,len(mai)*(420+58+pad)+pad),(235,237,241));draw=ImageDraw.Draw(ab)
 for i,row in enumerate(mai):
  y=pad+i*(420+58+pad)
  for j,name in enumerate(('front','back','isometric')):
   image=Image.open(Path(row['output'])/f'{name}.png').convert('RGB');image.thumbnail((420,420));ab.paste(image,(pad+j*(420+pad)+(420-image.width)//2,y+(420-image.height)//2))
  draw.text((pad,y+426),f"不知火舞 / {row['variant']}",font=font,fill=(20,20,24))
 ab_path=output/'mai-decimation-ab.jpg';ab.save(ab_path,quality=92,optimize=True)
 receipt={'schema':'ggd.approved-derivatives-visual-batch@1','records':records,'summary':{'requested':len(jobs),'complete':sum(r['complete'] for r in records),'failed':sum(not r['complete'] for r in records)},'contactSheet':{'path':str(sheet_path),'sha256':digest(sheet_path)},'maiDecimationAB':{'path':str(ab_path),'sha256':digest(ab_path)},'scope':'Actual Babylon WebGL static rest-pose evidence; no source-game shader parity, action semantic acceptance, gameplay acceptance or production deployment claim.'}
 (output/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(receipt['summary']))
if __name__=='__main__': main()
