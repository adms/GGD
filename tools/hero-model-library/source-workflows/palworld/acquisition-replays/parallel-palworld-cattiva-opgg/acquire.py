"""Download assets explicitly enumerated by public OP.GG Cattiva viewer config."""
from pathlib import Path,PurePosixPath
import json,re,subprocess,hashlib,concurrent.futures
root=Path(__file__).resolve().parents[1];html=(root/'evidence/cattiva-page.html').read_text().replace('\\"','"')
base=re.search(r'"baseUrl":"(https://s-stats-platform-cdn\.op\.gg/palworld/models/pals/PinkCat)"',html).group(1)
m=json.loads((root/'original/materials.json').read_text());assert m['palId']=='PinkCat'
paths={m['model']}
for x in m['materials'].values():
 for k,v in x.items():
  if k.endswith('Texture') and isinstance(v,str):paths.add(v)
assert len(paths)<=20

def get(rel):
 p=PurePosixPath(rel);assert not p.is_absolute() and '..' not in p.parts
 dst=root/'original'/rel;dst.parent.mkdir(parents=True,exist_ok=True)
 if not dst.exists():subprocess.run(['curl','-fsSL','--connect-timeout','15','--max-time','120','--max-filesize','200000000',base+'/'+rel,'-o',str(dst)],check=True)
 return {'url':base+'/'+rel,'path':'original/'+rel,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:rows=list(ex.map(get,sorted(paths)))
(root/'acquisition.json').write_text(json.dumps({'sourceUrl':'https://op.gg/palworld/pals/cattiva','baseUrl':base,'manifestVersion':m['version'],'claimedAnimations':m['animations'],'files':rows},indent=2)+'\n');print(json.dumps(rows,indent=2))
