from PIL import Image
from pathlib import Path
import json,hashlib
root=Path('GGD-Asset-Library/intake/public-models-20260910/kof-author-models-round20').resolve()
for sid in ['mai-xv-raw','iori-xv-raw']:
 r=root/sid;rows=[]
 for p in sorted((r/'extracted-v1').rglob('*.tga')):
  with Image.open(p) as im:
   im.load();rows.append({'path':p.relative_to(r).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'width':im.width,'height':im.height,'mode':im.mode,'channelExtrema':im.getextrema()})
 p=r/'texture-validation.json'
 if p.exists():raise RuntimeError('refuse overwrite')
 p.write_text(json.dumps({'schema':'ggd.native-textures-verified@1','sourceId':sid,'files':rows,'decodedCount':len(rows),'mutatedSourceFiles':0},ensure_ascii=False,indent=2)+'\n');print(sid,[(x['width'],x['height'],x['mode']) for x in rows])
