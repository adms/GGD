from pathlib import Path
from PIL import Image,ImageDraw
import json,sys
r=Path('/private/tmp/ggd-community37-editor-publish');nums=[f'{int(x):02}'for x in sys.argv[1:]];out=Image.new('RGB',(1920,640*((len(nums)+1)//2)),(15,17,21));d=ImageDraw.Draw(out)
for i,n in enumerate(nums):
 p=r/n;v=json.loads((p/'review.json').read_text());assert v['status']=='captured'and len(v['freshSmoke'])==1;nslot=v['freshSmoke'][0]['slot'];im=Image.open(p/f'review-{nslot}.png').convert('RGB').resize((960,600));x=i%2*960;y=i//2*640;out.paste(im,(x,y+35));d.text((x+10,y+8),f'{n} {nslot} — current fixed version',fill='white')
file=r/f'smoke-{nums[0]}-{nums[-1]}.png';out.save(file);print(file)
