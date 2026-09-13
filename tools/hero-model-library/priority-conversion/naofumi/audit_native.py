from pathlib import Path
from collections import Counter
import json,struct,hashlib,io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parents[1];SRC=BASE/'GGD-Asset-Library/intake/public-models-20260910/gtainside-naofumi'
out=ROOT/'native-audit';out.mkdir(exist_ok=False)
geom=json.loads((SRC/'renderware/Naofumi-b8cd4c49ba/native.json').read_text())['clumps'][0]['geometry_list'][0]
rw=geom['triangles'];binmesh=geom['extensions']['mat_split']
tri=lambda t:tuple(sorted([t['a'],t['b'],t['c']]))
report={'rwMaterialCounts':dict(Counter(t['material'] for t in rw)),'binMeshMaterialCounts':dict(Counter(t['material'] for t in binmesh)),'sameTriangleVertexMultiset':Counter(map(tri,rw))==Counter(map(tri,binmesh)),'materialAssignmentsAgree':Counter((tri(t),t['material']) for t in rw)==Counter((tri(t),t['material']) for t in binmesh),'expectedUseMatSplit':'True required: Geometry triangle material indices are all0, BinMesh carries four real material groups','materials':[{'name':m['textures'][0]['name'],'nativeRGBA':m['color'],'plugins':m['plugins']} for m in geom['materials']],'uvLayerCount':len(geom['uv_layers']),'uvAnimationCount':0}
raw=(SRC/'extracted/Naofumi.txd').read_bytes()
def chunks(start,end):
 while start<end:
  kind,n,version=struct.unpack_from('<III',raw,start);finish=start+12+n;assert finish<=end;yield kind,start+12,finish;start=finish
native=[]
for kind,start,end in chunks(0,len(raw)):
 assert kind==0x16
 for child,cs,ce in chunks(start,end):
  if child!=0x15:continue
  structs=list(chunks(cs,ce));k,ds,de=structs[0];assert k==1;data=raw[ds:de]
  platform,flt,uv,_=struct.unpack_from('<IBBH',data,0);name=data[8:40].split(b'\0')[0].decode();rf,fourcc,w,h,depth,levels,rtype,flags=struct.unpack_from('<IIHHBBBB',data,72)
  assert platform==9 and fourcc==int.from_bytes(b'DXT1','little') and levels==1
  n=struct.unpack_from('<I',data,88)[0];pixels=data[92:92+n];assert len(pixels)==n==w*h//2
  header=[124,0x81007,h,w,n,0,1]+[0]*11+[32,4,fourcc,0,0,0,0,0]+[0x1000,0,0,0,0]
  dds=b'DDS '+struct.pack('<31I',*header)+pixels;(out/(name+'-native-bc1.dds')).write_bytes(dds)
  independent=Image.open(io.BytesIO(dds)).convert('RGBA');independent.save(out/(name+'-pillow-bc1.png'))
  existingrow=next(t for t in json.loads((SRC/'renderware-inspection.json').read_text())['textureDictionaries'][0]['textures'] if t['name']==name);existing=Image.open(SRC/existingrow['png']).convert('RGBA')
  a=np.asarray(independent).astype(int);b=np.asarray(existing).astype(int);delta=np.abs(a-b)
  native.append({'name':name,'rawNativeStructOffset':ds,'rawPixelOffset':ds+92,'encodedPixelSha256':hashlib.sha256(pixels).hexdigest(),'width':w,'height':h,'rawD3D9AlphaFlag':bool(flags&1),'independentDecoder':'Pillow DDS/BC1 from manually parsed raw TXD payload; no DragonFF decode reused','independentRGBAAlphaExtrema':independent.getchannel('A').getextrema(),'sameRGBAAsDragonFF':bool((delta==0).all()),'maxChannelDifference':int(delta.max()),'differingChannels':int((delta!=0).sum()),'independentRGBASha256':hashlib.sha256(independent.tobytes()).hexdigest()})
report['txdIndependentDecode']=native
report['inputHashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [SRC/'extracted/Naofumi.dff',SRC/'extracted/Naofumi.txd']}
(out/'native-structure-and-decoder.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
