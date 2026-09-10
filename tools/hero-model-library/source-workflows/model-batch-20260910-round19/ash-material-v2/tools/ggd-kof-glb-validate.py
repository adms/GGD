from pathlib import Path
import argparse,collections,hashlib,json,math,struct
p=argparse.ArgumentParser();p.add_argument('glb');p.add_argument('--out',required=True);a=p.parse_args();src=Path(a.glb);b=src.read_bytes()
magic,version,length=struct.unpack_from('<III',b);assert magic==0x46546c67 and version==2 and length==len(b)
o=12;chunks=[]
while o<len(b):
 n,t=struct.unpack_from('<II',b,o);o+=8;assert o+n<=len(b);chunks.append((t,b[o:o+n]));o+=n
assert o==len(b) and chunks[0][0]==0x4e4f534a
d=json.loads(chunks[0][1]);binary=next((x for t,x in chunks if t==0x004e4942),b'')
assert all('uri' not in x for x in d.get('buffers',[]));assert len(d.get('buffers',[]))==1
assert len(binary)>=d['buffers'][0]['byteLength']
for v in d.get('bufferViews',[]):assert v.get('buffer',0)==0 and v.get('byteOffset',0)+v['byteLength']<=len(binary)
types={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)};width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
def accessor(i):
 ac=d['accessors'][i];assert 'sparse' not in ac;v=d['bufferViews'][ac['bufferView']];fmt,n=types[ac['componentType']];c=width[ac['type']];stride=v.get('byteStride',n*c);start=v.get('byteOffset',0)+ac.get('byteOffset',0);end=start+stride*(ac['count']-1)+n*c
 assert end<=v.get('byteOffset',0)+v['byteLength']
 vals=[struct.unpack_from('<'+fmt*c,binary,start+k*stride) for k in range(ac['count'])]
 assert all(all(math.isfinite(z) for z in x) for x in vals)
 return vals
for i in range(len(d.get('accessors',[]))):accessor(i)
mesh_nodes=[(i,n) for i,n in enumerate(d.get('nodes',[])) if 'mesh' in n];skin_meshes=[];triangles=0;max_influences=0
for i,n in mesh_nodes:
 mesh=d['meshes'][n['mesh']];skin=d['skins'][n['skin']] if 'skin' in n else None
 for pr in mesh['primitives']:
  assert pr.get('mode',4)==4;atts=pr['attributes'];positions=accessor(atts['POSITION']);indices=accessor(pr['indices']) if 'indices' in pr else [(i,) for i in range(len(positions))]
  assert len(indices)%3==0 and max(i[0] for i in indices)<len(positions);triangles+=len(indices)//3
  if skin:
   assert 'JOINTS_0' in atts and 'WEIGHTS_0' in atts
   sets=sorted(int(k.split('_')[1]) for k in atts if k.startswith('JOINTS_'))
   js=[accessor(atts['JOINTS_'+str(k)]) for k in sets];ws=[accessor(atts['WEIGHTS_'+str(k)]) for k in sets]
   assert all(len(x)==len(positions) for x in js+ws)
   assert all(0<=j<len(skin['joints']) for x in js for row in x for j in row)
   for k in range(len(positions)):
    weights=[v for x in ws for v in x[k]];assert all(w>=0 for w in weights)
    s=sum(weights);assert abs(s-1)<0.002 or s==0
    max_influences=max(max_influences,sum(w>0 for w in weights))
   skin_meshes.append(i)
for skin in d.get('skins',[]):
 assert all(0<=j<len(d['nodes']) for j in skin['joints'])
 if 'inverseBindMatrices' in skin:assert len(accessor(skin['inverseBindMatrices']))==len(skin['joints'])
images=[]
for im in d.get('images',[]):
 assert 'uri' not in im and 'bufferView' in im
 v=d['bufferViews'][im['bufferView']];blob=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 assert blob.startswith(b'\x89PNG\r\n\x1a\n') or blob.startswith(b'\xff\xd8\xff') or blob.startswith(b'RIFF')
 images.append(dict(name=im.get('name'),mimeType=im.get('mimeType'),bytes=len(blob),sha256=hashlib.sha256(blob).hexdigest()))
for tx in d.get('textures',[]):assert 0<=tx.get('source',-1)<len(images)
for mat in d.get('materials',[]):
 for key in ('baseColorTexture','metallicRoughnessTexture'):
  tex=mat.get('pbrMetallicRoughness',{}).get(key)
  if tex:assert 0<=tex['index']<len(d['textures'])
r=dict(schema='ggd-glb-structural-validation@1',path=str(src.resolve()),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),glb2=True,externalDependencies=False,meshes=len(d.get('meshes',[])),meshNodes=len(mesh_nodes),skinMeshNodes=len(set(skin_meshes)),skins=len(d.get('skins',[])),skinJointCounts=[len(s['joints']) for s in d.get('skins',[])],triangles=triangles,materials=len(d.get('materials',[])),embeddedImages=images,animations=[dict(name=x.get('name'),channels=len(x.get('channels',[])),samplers=len(x.get('samplers',[]))) for x in d.get('animations',[])],maxVertexInfluences=max_influences,allAccessorsFiniteAndWithinBuffers=True,jointAndWeightReferencesValidated=True,notes=['Structural validation is not visual, gameplay, retargeting or performance acceptance.'])
Path(a.out).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k!='embeddedImages'}))
