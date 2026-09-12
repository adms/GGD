#!/usr/bin/env python3
"""Recompute declared accessor bounds from stored bytes; preserve the BIN payload."""
import argparse,hashlib,json,struct
from pathlib import Path

def repair(raw):
 assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
 size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);tail=raw[20+size:]
 n,kind=struct.unpack_from('<I4s',tail);assert kind==b'BIN\0' and n+8==len(tail);data=tail[8:]
 fmts={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
 widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 changed=[]
 for i,a in enumerate(g.get('accessors',[])):
  if not ('min' in a or 'max' in a):continue
  if 'sparse' in a:raise ValueError('Sparse bounds require explicit sparse expansion')
  v=g['bufferViews'][a['bufferView']];fmt,width=fmts[a['componentType']];dims=widths[a['type']];stride=v.get('byteStride',width*dims);start=v.get('byteOffset',0)+a.get('byteOffset',0)
  vals=[struct.unpack_from('<'+fmt*dims,data,start+j*stride) for j in range(a['count'])]
  for key,fn in [('min',min),('max',max)]:
   if key not in a:continue
   fixed=[fn(x[k] for x in vals) for k in range(dims)]
   if a[key]!=fixed:changed.append(dict(accessor=i,field=key,before=a[key],after=fixed));a[key]=fixed
 out=json.dumps(g,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode();out+=b' '*(-len(out)%4)
 result=struct.pack('<5I',0x46546c67,2,20+len(out)+len(tail),len(out),0x4e4f534a)+out+tail
 return result,dict(changedBounds=changed,binaryUnchanged=True,binarySha256=hashlib.sha256(data).hexdigest(),geometryAndAnimationAccessorsUnchanged=True)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
 original=a.source.read_bytes();result,proof=repair(original);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(result)
 a.report.write_text(json.dumps(dict(proof,source=str(a.source),sourceSha256=hashlib.sha256(original).hexdigest(),output=str(a.output),sha256=hashlib.sha256(result).hexdigest()),ensure_ascii=False,indent=2)+'\n')
