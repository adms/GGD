import sys,json,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image
import importlib.util
spec=importlib.util.spec_from_file_location('g','/private/tmp/ggd-procedural-six-state.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/priority-shinchan-canonical-20260910');out=ROOT/'optimized-v3';out.mkdir(exist_ok=False)
for variant in ['sd2','kstamil']:
 d=out/variant;d.mkdir();src=ROOT/'conversion-v1'/variant/'canonical-rig.glb';g,b=m.read_glb(src);material_names=[x['name'] for x in g['materials']];report=[];atlas=Image.new('RGBA',(1024,1024),(0,0,0,255));placements={};names=[x['name'] for x in g['images'] if x['name'] in material_names];other=0
 for name in names:
  ims=Image.open(ROOT/'conversion-v1'/variant/'textures'/(name+'.png')).convert('RGBA')
  if name.startswith('head_'):x,y,size=0,0,512
  else:x,y,size=512+256*(other%2),256*(other//2),256;other+=1
  entries=[]
  for mesh in g['meshes']:
   for prim in mesh['primitives']:
    if material_names[g['meshes'].index(mesh)]==name:entries.append(prim)
  uv=np.concatenate([m.accessor(g,b,p['attributes']['TEXCOORD_0']) for p in entries]);lo=np.floor(uv.min(0));hi=np.ceil(uv.max(0));hi=np.maximum(hi,lo+1);repeat=(hi-lo).astype(int);assert 1<=repeat.min()<=repeat.max()<=2
  tiled=Image.new('RGBA',(ims.width*repeat[0],ims.height*repeat[1]))
  for u in range(repeat[0]):
   for v in range(repeat[1]):tiled.paste(ims,(u*ims.width,v*ims.height))
  pad=4;inner=tiled.resize((size-2*pad,size-2*pad),Image.Resampling.LANCZOS);tile=inner.resize((size,size),Image.Resampling.NEAREST)
  tile.paste(inner,(pad,pad));tile.paste(inner.crop((0,0,1,inner.height)).resize((pad,inner.height)),(0,pad));tile.paste(inner.crop((inner.width-1,0,inner.width,inner.height)).resize((pad,inner.height)),(size-pad,pad));tile.paste(tile.crop((0,pad,size,pad+1)).resize((size,pad)),(0,0));tile.paste(tile.crop((0,size-pad-1,size,size-pad)).resize((size,pad)),(0,size-pad));atlas.paste(tile,(x,y))
  for p in entries:
   ai=p['attributes']['TEXCOORD_0'];uv0=m.accessor(g,b,ai);uv1=((uv0-lo)/(hi-lo)*(size-2*pad)+np.array([x+pad,y+pad]))/1024;p['attributes']['TEXCOORD_0']=m.add_accessor(g,b,uv1,'VEC2',target=34962);p['material']=0
  report.append(dict(name=name,tile=[x,y,size,size],pad=pad,sourceUVMin=lo.tolist(),sourceUVMax=hi.tolist(),repeat=repeat.tolist(),originalDimensions=ims.size,atlasResizedDimensions=inner.size))
 atlaspath=d/'atlas.png';atlas.save(atlaspath)
 while len(b)%4:b.append(0)
 vi=len(g['bufferViews']);g['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=atlaspath.stat().st_size));b.extend(atlaspath.read_bytes());g['images']=[dict(name='Shinchan_'+variant+'_atlas',mimeType='image/png',bufferView=vi)];g['textures']=[dict(source=0,sampler=0)];g['materials']=[dict(name='Shinchan_'+variant+'_atlas',pbrMetallicRoughness=dict(baseColorTexture=dict(index=0),metallicFactor=0,roughnessFactor=.85),alphaMode='OPAQUE',doubleSided=False)];g.setdefault('extras',{})['ggdAtlas']={'sourceTexturesPreservedElsewhere':True,'resampled':True,'dimensions':[1024,1024]};m.write_glb(g,b,d/'atlas-static.glb');(d/'atlas-receipt.json').write_text(json.dumps(dict(source=str(src),atlasSha256=hashlib.sha256(atlaspath.read_bytes()).hexdigest(),sourceMaterials=8,outputMaterials=1,tiles=report),indent=2)+'\n')
 print(variant,'atlas complete')
