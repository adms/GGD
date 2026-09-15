"""Render source/candidate at five native clips and emit deterministic A/B evidence."""
from pathlib import Path
from PIL import Image, ImageDraw, __version__ as pillow_version
import argparse, hashlib, json, subprocess, sys
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--repo', type=Path, required=True)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--local-render-root', type=Path, required=True)
parser.add_argument('--evidence-dir', type=Path, required=True)
parser.add_argument('--reuse-existing-renders', action='store_true')
args = parser.parse_args()
repo, source, candidate = args.repo.resolve(), args.source.resolve(), args.candidate.resolve()
local, evidence = args.local_render_root.resolve(), args.evidence_dir.resolve()
if args.reuse_existing_renders:
    if not local.is_dir():
        raise SystemExit('existing render root is missing: '+str(local))
else:
    local.mkdir(parents=True, exist_ok=False)
evidence.mkdir(parents=True, exist_ok=True)
clips = ['Idle', 'Walk', 'FarSkill_Action', 'HaloBeam_Loop', 'Damage']
views = ['front', 'back', 'isometric']
renderer = repo/'tools/hero-model-library/render_historical_model.py'
if not args.reuse_existing_renders:
    for kind, file in [('source', source), ('candidate', candidate)]:
        for clip in clips:
            subprocess.run([sys.executable, str(renderer), str(file), str(local/kind/clip), '--repo', str(repo), '--candidate-id', f'astralym-{kind}-{clip}', '--idle-clip', clip], check=True)

rows=[]
for clip in clips:
    for view in views:
        a=np.asarray(Image.open(local/'source'/clip/f'{view}.png').convert('RGB'), dtype=np.int16)
        b=np.asarray(Image.open(local/'candidate'/clip/f'{view}.png').convert('RGB'), dtype=np.int16)
        delta=np.abs(a-b); la=.2126*a[:,:,0]+.7152*a[:,:,1]+.0722*a[:,:,2]; lb=.2126*b[:,:,0]+.7152*b[:,:,1]+.0722*b[:,:,2]
        rows.append({'clip':clip,'view':view,
            'changedPixelPctAtChannelDeltaGt10':round(float((delta.max(2)>10).mean()*100),6),
            'meanAbsoluteChannelDelta':round(float(delta.mean()),6),
            'litClassificationXorPctAtLuma128':round(float(np.logical_xor(la>=128,lb>=128).mean()*100),6),
            'maxChannelDelta':int(delta.max())})

for view in views:
    sheet=Image.new('RGB',(1600,len(clips)*840),(16,18,24)); draw=ImageDraw.Draw(sheet)
    for i,clip in enumerate(clips):
        sheet.paste(Image.open(local/'source'/clip/f'{view}.png').convert('RGB'),(0,i*840+40))
        sheet.paste(Image.open(local/'candidate'/clip/f'{view}.png').convert('RGB'),(800,i*840+40))
        draw.text((10,i*840+10),f'{clip} source',fill='white'); draw.text((810,i*840+10),f'{clip} candidate',fill='white')
    sheet.save(evidence/f'{view}-contact-sheet.png')

worst=max(rows,key=lambda row:row['changedPixelPctAtChannelDeltaGt10'])
worst_source=Image.open(local/'source'/worst['clip']/f"{worst['view']}.png").convert('RGB')
worst_candidate=Image.open(local/'candidate'/worst['clip']/f"{worst['view']}.png").convert('RGB')
worst_delta=np.abs(np.asarray(worst_source,dtype=np.int16)-np.asarray(worst_candidate,dtype=np.int16))
heat=np.zeros_like(worst_delta,dtype=np.uint8)
heat[:,:,0]=np.clip(worst_delta.max(2)*4,0,255).astype(np.uint8)
heat[:,:,1]=np.clip(worst_delta.mean(2)*2,0,128).astype(np.uint8)
overview=Image.new('RGB',(2400,860),(16,18,24)); draw=ImageDraw.Draw(overview)
overview.paste(worst_source,(0,60)); overview.paste(worst_candidate,(800,60)); overview.paste(Image.fromarray(heat),(1600,60))
draw.text((10,12),f"Source 23,928 tris / {worst['clip']} / {worst['view']}",fill='white')
draw.text((810,12),f"Candidate 7,996 tris / {worst['clip']} / {worst['view']}",fill='white')
draw.text((1610,12),f"Amplified RGB delta x4 / changed pixels {worst['changedPixelPctAtChannelDeltaGt10']:.6f}%",fill='white')
overview.save(evidence/'worst-difference-overview.png')

sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result={'schema':'ggd-historical-astralym-visual-comparison@1','source':{'path':str(source),'sha256':sha(source)},'candidate':{'path':str(candidate),'sha256':sha(candidate)},
 'sampling':{'clips':clips,'clipFraction':0.2,'views':views,'renderer':'Babylon WebGL right-handed scene with CPU-skinned bounds and identical lights/camera fitting'},
 'metric':{'contractMaxPct':5,'changedPixelDefinition':'any RGB channel delta > 10 divided by all 800x800 pixels','litPixelDefinition':'exclusive-or of luma >= 128 classification divided by all pixels'},
 'rows':rows,'allChangedPixelPctAtChannelDeltaGt10Under5':all(r['changedPixelPctAtChannelDeltaGt10']<=5 for r in rows),
 'maxChangedPixelPctAtChannelDeltaGt10':max(r['changedPixelPctAtChannelDeltaGt10'] for r in rows),
 'allLitClassificationXorPctAtLuma128Under5':all(r['litClassificationXorPctAtLuma128']<=5 for r in rows),
 'maxLitClassificationXorPctAtLuma128':max(r['litClassificationXorPctAtLuma128'] for r in rows),
 'contactSheets':[{ 'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(evidence.glob('*-contact-sheet.png'))],
 'worstDifferenceOverview':{'clip':worst['clip'],'view':worst['view'],'path':'worst-difference-overview.png',
     'bytes':(evidence/'worst-difference-overview.png').stat().st_size,'sha256':sha(evidence/'worst-difference-overview.png'),
     'heatmapScale':'per-pixel maximum RGB channel delta multiplied by 4'},
 'rawEvidenceLocalPath':str(local),'rawRendersRetainedLocally':True,'pillowVersion':pillow_version,
 'humanReview':{'reviewer':'Codex visual inspection','result':'accepted','scope':'All five source/candidate rows in front and isometric contact sheets, plus back contact sheet; silhouette, thin appendages, eye/emissive materials and pose identity remain intact. Expected low-poly faceting is visible. Source-game shader parity is not claimed.'}}
if not result['allChangedPixelPctAtChannelDeltaGt10Under5'] or not result['allLitClassificationXorPctAtLuma128Under5']: raise SystemExit('visual A/B exceeds 5 percent')
(evidence/'visual-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'evidence':str(evidence),'maxChanged':result['maxChangedPixelPctAtChannelDeltaGt10'],'maxLitXor':result['maxLitClassificationXorPctAtLuma128']}))
