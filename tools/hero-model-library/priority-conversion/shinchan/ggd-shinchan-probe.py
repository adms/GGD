import sys,json,dataclasses,hashlib,traceback,zlib,struct
from pathlib import Path
sys.path.insert(0,'/private/tmp/ggd-shinchan-fivefury-source/fivefury-0.5.0')
import fivefury
root=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');base=root/'GGD-Asset-Library/intake/public-models-20260910/gta5mod-shinchan-sd2/extracted';out=root/'outputs/priority-shinchan-canonical-20260910/probe-v1';out.mkdir(parents=True,exist_ok=True)
def conv(x):
 if dataclasses.is_dataclass(x):return {f.name:conv(getattr(x,f.name)) for f in dataclasses.fields(x) if not f.name.startswith('_')}
 if isinstance(x,dict):return {str(k):conv(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [conv(v) for v in x]
 if isinstance(x,bytes):return {'bytes':len(x),'sha256':hashlib.sha256(x).hexdigest()}
 if x is None or isinstance(x,(int,float,str,bool)):return x
 return str(x)
def checked_bytes(path):
 raw=path.read_bytes();dc=zlib.decompressobj(-15);payload=dc.decompress(raw[16:]);tail=dc.unused_data
 assert dc.eof and not dc.unconsumed_tail
 if tail:
  assert len(tail)==4 and struct.unpack('>I',tail)[0]==zlib.adler32(payload)
  print('Verified Adler32 tail',path.name,tail.hex());return raw[:-4]
 return raw
ydd=fivefury.read_ydd(checked_bytes(base/'sd2.ydd'));yft=fivefury.read_yft(checked_bytes(base/'sd2.yft'));ytd=fivefury.read_ytd(checked_bytes(base/'sd2.ytd'))
(out/'ydd.json').write_text(json.dumps(conv(ydd)));(out/'yft.json').write_text(json.dumps(conv(yft)));(out/'ytd.json').write_text(json.dumps(conv(ytd)))
for entry in ydd.drawables:
 d=entry.drawable;print('DRAWABLE',entry.name,'bones',d.skeleton.bone_count if d.skeleton else 0,'bounds',d.bounding_box_min,d.bounding_box_max)
 for lod,models in d.lods.items():
  print('LOD',lod,[(len(m.meshes),sum(len(s.positions) for s in m.meshes),sum(len(s.indices)//3 for s in m.meshes)) for m in models])
  for m in models:
   for s in m.meshes:print('MESH',s.material_index,len(s.positions),len(s.normals),len(s.blend_weights),len(s.blend_indices),'ids',s.bone_ids,'textures',[(t.name,t.parameter_name) for t in s.material.textures] if s.material else [])
print('YFT',[(x.name,len(x.drawable.skeleton.bones) if x.drawable.skeleton else 0) for x in yft.iter_drawables()]);print('YTD',[(x.name,x.width,x.height,x.format_name) for x in ytd])
