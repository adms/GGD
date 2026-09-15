"""Make labelled review sheets from actual rendered frames; do not change assets."""
import argparse,json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('render',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
a.output.mkdir(exist_ok=False)
proof=json.loads((a.render/'render-proof.json').read_bytes())
font=ImageFont.load_default(size=16)
for start in range(0,len(proof['shots']),24):
 shots=proof['shots'][start:start+24];sheet=Image.new('RGB',(6*300,math.ceil(len(shots)/6)*322),(25,29,35));draw=ImageDraw.Draw(sheet)
 for i,shot in enumerate(shots):
  im=Image.open(a.render/shot['file']).convert('RGB');im.thumbnail((300,300));x=(i%6)*300;y=(i//6)*322;sheet.paste(im,(x,y));draw.text((x+5,y+302),shot['clip']+' '+str(shot['fraction']),fill='white',font=font)
 sheet.save(a.output/('sheet-'+str(start//24+1)+'.jpg'),quality=92)
