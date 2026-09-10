"""Convert only proven fully opaque materials from BLEND to OPAQUE, new file only."""
import json,struct,hashlib,sys,io
from pathlib import Path
from PIL import Image
src=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(exist_ok=False)
raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];changes=[]
for i,mat in enumerate(g['materials']):
 p=mat['pbrMetallicRoughness'];assert p.get('baseColorFactor',[1,1,1,1])[3]==1
 im=g['images'][g['textures'][p['baseColorTexture']['index']]['source']];view=g['bufferViews'][im['bufferView']];image=Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGBA');assert image.getchannel('A').getextrema()==(255,255)
 assert mat['alphaMode']=='BLEND';mat['alphaMode']='OPAQUE';changes.append({'path':'/materials/'+str(i)+'/alphaMode','before':'BLEND','after':'OPAQUE'})
j=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*((-len(j))%4);result=struct.pack('<5I',0x46546c67,2,28+len(j)+len(binary),len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
(out/'body.glb').write_bytes(result);(out/'alpha-only-correction.json').write_text(json.dumps({'source':str(src),'sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(result).hexdigest(),'binaryUnchanged':True,'changes':changes},indent=2)+'\n')
