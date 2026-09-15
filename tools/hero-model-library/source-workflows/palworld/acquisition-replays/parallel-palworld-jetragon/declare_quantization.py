"""Declare required KHR_mesh_quantization for retained normalized int16 normals.
This corrects a missing extension declaration; geometry and animation bytes unchanged.
"""
from pathlib import Path
import json,struct,hashlib
root=Path(__file__).resolve().parents[1];src=root/'decoded/jetragon-meshopt-decoded.glb';b=src.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);tail=b[20+n:]
fixes=[]
for m in g['meshes']:
 for p in m['primitives']:
  a=g['accessors'][p['attributes']['NORMAL']]
  if a['componentType']==5122 and a.get('normalized'):fixes.append(p['attributes']['NORMAL'])
assert len(fixes)==3
for k in ['extensionsUsed','extensionsRequired']:
 g.setdefault(k,[])
 if 'KHR_mesh_quantization' not in g[k]:g[k].append('KHR_mesh_quantization')
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);data=struct.pack('<4sII',b'glTF',2,20+len(j)+len(tail))+struct.pack('<II',len(j),0x4e4f534a)+j+tail
out=root/'decoded/jetragon-quantization-declared.glb';assert not out.exists() or out.read_bytes()==data;out.write_bytes(data)
report={'schema':'ggd.jetragon.quantization-declaration@1','before':{'path':str(src),'sha256':hashlib.sha256(b).hexdigest()},'after':{'path':str(out),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},'normalAccessors':fixes,'binaryChunksIdentical':True,'change':'Added missing KHR_mesh_quantization declaration for retained normalized SHORT normals; no geometry, rig, animation sample or texture changes.'}
(root/'analysis/quantization-declaration.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
