import json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-ou99-standards-v3-20260910');vis=R/'visual-audit';report=[]
for id in ['458777','473324','491448']:
 key='ou99-'+id;sheet=Image.new('RGB',(1000,1060),(32,39,49));draw=ImageDraw.Draw(sheet);draw.text((14,8),key+' prior v2 (left) / alpha-repaired v3 (right)',fill='white');stats=[]
 for y,state in enumerate(['idle','run']):
  for x,var in enumerate(['source','candidate']):
   p=vis/f'{key}-{var}-{state}.png';im=Image.open(p).convert('RGB');sheet.paste(im.resize((500,500)),(x*500,30+y*515));draw.text((12+x*500,32+y*515),var+' '+state,fill='white')
  a=np.asarray(Image.open(vis/f'{key}-source-{state}.png').convert('RGBA'),dtype=np.int16);b=np.asarray(Image.open(vis/f'{key}-candidate-{state}.png').convert('RGBA'),dtype=np.int16);delta=np.abs(a-b);stats.append({'state':state,'rgbaPixelExact':bool(np.array_equal(a,b)),'maxRgbaCodeDifference':int(delta.max()),'meanAbsoluteRgbaCodeDifference':float(delta.mean()),'changedPixels':int(np.any(delta!=0,axis=2).sum())})
 sheet.save(vis/f'{key}-comparison.png');report.append({'originalModelKey':'ou99.'+id,'source':'prior v2 runtime','candidate':'alpha-repaired v3 runtime','images':stats})
(vis/'image-comparison.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
