#!/usr/bin/env python3
"""Canonicalize existing GLB normals and accessor bounds without changing geometry."""
import argparse,json,struct,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
b=a.source.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);bl,bt=struct.unpack_from('<I4s',b,20+n);data=bytearray(b[28+n:28+n+bl]);assert bt==b'BIN\0'
formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};normals=set()
for m in g.get('meshes',[]):
 for p in m['primitives']:
  if 'NORMAL' in p['attributes']:normals.add(p['attributes']['NORMAL'])
fallback_normals={}
def read_rows(index):
 ac=g['accessors'][index];view=g['bufferViews'][ac['bufferView']];fmt,size=formats[ac['componentType']];width=widths[ac['type']];offset=view.get('byteOffset',0)+ac.get('byteOffset',0);stride=view.get('byteStride',size*width)
 return [struct.unpack_from('<'+fmt*width,data,offset+j*stride) for j in range(ac['count'])]
for mesh in g.get('meshes',[]):
 for primitive in mesh['primitives']:
  if 'NORMAL' not in primitive['attributes']:continue
  normal_id=primitive['attributes']['NORMAL'];positions=read_rows(primitive['attributes']['POSITION'])
  indices=[r[0] for r in read_rows(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
  sums=fallback_normals.setdefault(normal_id,[[0.,0.,0.] for _ in positions])
  if primitive.get('mode',4)!=4:raise ValueError('Normal repair supports triangles')
  for i in range(0,len(indices),3):
   ids=indices[i:i+3];x,y,z=[positions[j] for j in ids];u=[y[k]-x[k] for k in range(3)];v=[z[k]-x[k] for k in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
   for vertex in ids:
    for k in range(3):sums[vertex][k]+=cross[k]
for i,accessor in enumerate(g.get('accessors',[])):
 assert 'sparse' not in accessor
 v=g['bufferViews'][accessor['bufferView']];fmt,size=formats[accessor['componentType']];w=widths[accessor['type']];off=v.get('byteOffset',0)+accessor.get('byteOffset',0);stride=v.get('byteStride',size*w)
 for j in range(accessor['count']):
  at=off+j*stride;row=struct.unpack_from('<'+fmt*w,data,at)
  if not all(math.isfinite(x) for x in row):raise ValueError('Nonfinite source accessor')
  if i in normals:
   assert fmt=='f' and w==3
   length=math.sqrt(sum(x*x for x in row))
   if length<1e-8:
    row=fallback_normals[i][j];length=math.sqrt(sum(x*x for x in row))
    if length<1e-8:row=(0.,1.,0.);length=1.
   struct.pack_into('<3f',data,at,*(x/length for x in row))
 rows=[struct.unpack_from('<'+fmt*w,data,off+j*stride) for j in range(accessor['count'])]
 for key,fn in [('min',min),('max',max)]:
  if key in accessor:accessor[key]=[fn(row[k] for row in rows) for k in range(w)]
# Remove channels whose values equal the node default in every animation.
# Missing channels are safe because the unchanged node default is already used.
constant={};defaults={'translation':[0.,0.,0.],'rotation':[0.,0.,0.,1.],'scale':[1.,1.,1.]}
for animation in g.get('animations',[]):
 for channel in animation.get('channels',[]):
  target=channel['target'];key=(target['node'],target['path']);sampler=animation['samplers'][channel['sampler']]
  if target['path'] not in defaults or sampler.get('interpolation','LINEAR') not in ('LINEAR','STEP'):
   constant[key]=False;continue
  expected=g['nodes'][key[0]].get(key[1],defaults[key[1]]);values=read_rows(sampler['output'])
  matches=all(len(row)==len(expected) and all(abs(x-y)<1e-7 for x,y in zip(row,expected)) for row in values)
  constant[key]=constant.get(key,True) and matches
for animation in g.get('animations',[]):
 animation['channels']=[c for c in animation.get('channels',[]) if not constant.get((c['target']['node'],c['target']['path']),False)]
g['buffers'][0]['byteLength']=len(data);js=json.dumps(g,separators=(',',':')).encode();js+=b' '*(-len(js)%4);data+=bytes(-len(data)%4)
a.output.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(js)+len(data),len(js),0x4e4f534a)+js+struct.pack('<I4s',len(data),b'BIN\0')+data)
