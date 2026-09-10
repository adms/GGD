import json
from pathlib import Path
from PIL import Image,ImageDraw
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-ou99-residual-geometry-audit-20260910');vis=R/'render'
for r in json.loads((R/'input-manifest.json').read_text()):
 key=r['originalModelKey'].replace('.','-');sheet=Image.new('RGB',(1000,2110),(32,39,49));draw=ImageDraw.Draw(sheet);draw.text((12,8),key+' full (left) / diagnostic target-only (right)',fill='white')
 for y,state in enumerate(['idle','run','cast','death']):
  for x,var in enumerate(['full','target']):
   p=vis/f'{key}-{var}-{state}.png';im=Image.open(p).convert('RGB');sheet.paste(im.resize((500,500)),(x*500,30+y*520));draw.text((12+x*500,32+y*520),var+' '+state+' native clip @60%',fill='white')
 sheet.save(vis/f'{key}-contact.png')
