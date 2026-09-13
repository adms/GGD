from pathlib import Path
import struct,json,hashlib,shutil,math
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-native-format-batch3/gmoloader')
for n in ['cloud','sephiroth','squall']:
 out=ROOT/'converted'/n;p=out/'body.glb'
 if not (out/'assimp-unvalidated.glb').exists():shutil.copyfile(p,out/'assimp-unvalidated.glb')
 b=(out/'assimp-unvalidated.glb').read_bytes();jl=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+jl]);bl=struct.unpack_from('<I',b,20+jl)[0];data=bytearray(b[28+jl:28+jl+bl]);changes={'inverseBindMatrices':0,'weightVectors':0,'maximumWeightComponentChange':0.,'maximumAffineComponentChange':0.}
 def values(index,size):
  a=d['accessors'][index];assert a['componentType']==5126 and not a.get('sparse');v=d['bufferViews'][a['bufferView']];stride=v.get('byteStride',size*4);base=v.get('byteOffset',0)+a.get('byteOffset',0)
  for i in range(a['count']):yield base+i*stride,list(struct.unpack_from('<'+'f'*size,data,base+i*stride))
 for skin in d['skins']:
  for off,v in values(skin['inverseBindMatrices'],16):
   for idx,target in [(3,0.),(7,0.),(11,0.),(15,1.)]:
    delta=abs(v[idx]-target);assert delta<2e-6;changes['maximumAffineComponentChange']=max(changes['maximumAffineComponentChange'],delta);v[idx]=target
   struct.pack_into('<16f',data,off,*v);changes['inverseBindMatrices']+=1
 ids={pr['attributes']['WEIGHTS_0'] for mesh in d['meshes'] for pr in mesh['primitives']}
 for idx in ids:
  for off,v in values(idx,4):
   total=sum(v);assert all(math.isfinite(x) and x>=0 for x in v) and abs(total-1)<2e-5
   normalized=[x/total for x in v];changes['maximumWeightComponentChange']=max(changes['maximumWeightComponentChange'],max(abs(x-y) for x,y in zip(v,normalized)));struct.pack_into('<4f',data,off,*normalized);changes['weightVectors']+=1
 for idx in ids|{s['inverseBindMatrices'] for s in d['skins']}:
  size=16 if d['accessors'][idx]['type']=='MAT4' else 4
  rows=[v for off,v in values(idx,size)]
  if 'min' in d['accessors'][idx]:d['accessors'][idx]['min']=[min(row[k] for row in rows) for k in range(size)]
  if 'max' in d['accessors'][idx]:d['accessors'][idx]['max']=[max(row[k] for row in rows) for k in range(size)]
 for anim in d.get('animations',[]):
  assert all(d['accessors'][s['input']]['count']==1 for s in anim['samplers']);anim['name']='bind_pose_one_key';anim['extras']={'classification':'single-key-reference-pose','nativeGmoGameAnimation':False}
 header=json.dumps(d,separators=(',',':')).encode();header+=b' '*(-len(header)%4);p.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(header)+len(data),len(header),0x4e4f534a)+header+struct.pack('<2I',len(data),0x004e4942)+data)
 r=json.load(open(out/'conversion.json'));r.update(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size,gameAnimationCount=0,singleKeyPoseTracks=len(d.get('animations',[])),numericCanonicalization=changes,priorAssimpOutput='assimp-unvalidated.glb');(out/'conversion.json').write_text(json.dumps(r,indent=2)+'\n');print(n,changes)
