from PIL import Image,ImageDraw
from pathlib import Path
import json,sys
for number in sys.argv[1:]:
 folder=Path('/private/tmp/ggd-community37-editor-publish')/number/'author-preview'
 proof=json.loads((folder/'capture.json').read_text());assert proof['status']=='captured' and len(proof['slots'])==6,proof['status']
 canvas=Image.new('RGB',(1600,1590),(22,26,34));draw=ImageDraw.Draw(canvas)
 for i,slot in enumerate(['PASSIVE','Q','W','E','R','EX']):
  im=Image.open(folder/f'{slot}.png');im.thumbnail((800,500));x=i%2*800;y=i//2*530;canvas.paste(im,(x,y+25));draw.text((x+8,y+5),slot,fill='white')
 canvas.save(folder/'sheet.png');print(number,proof['name'],'six frames composed')
