from pathlib import Path
import collections, hashlib, io, json, struct
import numpy as np
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/psp-cloud-native-motion-batch4')
b=(ROOT/'converted/cloud-native-13-motions.glb').read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);binary=b[28+jl:]
def get(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],dim),dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*dim),dt.itemsize)).copy()
textures={hashlib.sha256(p.read_bytes()).hexdigest():p.name for p in (ROOT/'original/cloud-source').glob('*.png')}
source=collections.defaultdict(list);lines=(ROOT/'original/cloud-source/cloud.smd').read_text().splitlines();i=lines.index('triangles')+1
while lines[i]!='end':
 name=lines[i].strip();i+=1
 for _ in range(3):
  fields=lines[i].split();source[name].append([*[float(x) for x in fields[1:4]],*[float(x) for x in fields[7:9]]]);i+=1
proof=[]
for p in g['meshes'][0]['primitives']:
 image=g['textures'][g['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];v=g['bufferViews'][g['images'][image]['bufferView']];off=v.get('byteOffset',0);pixels=binary[off:off+v['byteLength']];h=hashlib.sha256(pixels).hexdigest();name=textures[h]
 pos=get(p['attributes']['POSITION']);uv=get(p['attributes']['TEXCOORD_0']);ix=get(p['indices']).reshape(-1);output=np.concatenate([pos[ix],uv[ix]],axis=1);original=np.array(source[name]);assert output.shape==original.shape
 # Assimp preserves the source triangle-corner order within each material.
 max_pos=float(np.abs(output[:,:3]-original[:,:3]).max());max_uv=float(np.abs(output[:,3:]-original[:,3:]).max())
 assert max_pos<1e-4 and max_uv<1e-6,(name,max_pos,max_uv)
 proof.append({'sourceTexture':name,'textureSha256':h,'embeddedTextureByteIdentity':'pass','triangleCornersChecked':len(output),'maximumPositionDifference':max_pos,'maximumUvDifference':max_uv,'sourceTriangleCornerOrder':'pass'})
(ROOT/'analysis/source-uv-and-texture-proof.json').write_text(json.dumps({'status':'pass','method':'Every output triangle corner checked against corresponding source SMD position/UV and original PNG hash','modelSha256':hashlib.sha256(b).hexdigest(),'proof':proof,'triangleCornersChecked':sum(x['triangleCornersChecked'] for x in proof)},indent=2)+'\n')
print(json.dumps({'status':'pass','corners':sum(x['triangleCornersChecked'] for x in proof),'maxUv':max(x['maximumUvDifference'] for x in proof)},indent=2))
