from PIL import Image,ImageDraw
from pathlib import Path
import sys
for n in sys.argv[1:]:
 p=Path('/private/tmp/ggd-community37-editor-publish')/n
 a=Image.new('RGB',(1600,1560));d=ImageDraw.Draw(a)
 for i,s in enumerate(['PASSIVE','Q','W','E','R','EX']):
  im=Image.open(p/f'review-{s}.png');im.thumbnail((800,500));x=i%2*800;y=i//2*520;a.paste(im,(x,y+20));d.text((x+10,y+3),s,fill='white')
 a.save(p/'review-sheet.png')
