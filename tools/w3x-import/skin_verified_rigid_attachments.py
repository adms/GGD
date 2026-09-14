#!/usr/bin/env python3
"""Convert verified hand-child accessory meshes into fully skinned primitives.

The source GLB is immutable.  New POSITION/NORMAL/JOINTS_0/WEIGHTS_0 payloads
are appended, and the complete original BIN remains an exact prefix.
"""
import argparse,copy,hashlib,json,struct,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/community-hero-forge'))
from prepare_mba_body import encode_glb
from convert_jumpx_body import rotation_matrix

def sha(data):return hashlib.sha256(data).hexdigest()
def decode(data):
 n=struct.unpack_from('<I',data,12)[0]
 return json.loads(data[20:20+n]),bytearray(data[28+n:])
def node_matrix(node):
 if 'matrix' in node:return np.asarray(node['matrix'],dtype=np.float64).reshape(4,4).T
 m=np.eye(4);m[:3,:3]=rotation_matrix(node.get('rotation',[0,0,0,1]))@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
def world_matrices(nodes):
 parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])};memo={}
 def at(i):
  if i not in memo:memo[i]=at(parents[i])@node_matrix(nodes[i]) if i in parents else node_matrix(nodes[i])
  return memo[i]
 return at,parents
def main():
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--expected-sha256',required=True);p.add_argument('--bind',action='append',required=True,metavar='MESH_NODE=JOINT_NODE');p.add_argument('--receipt',type=Path);a=p.parse_args()
 raw=a.source.read_bytes();assert sha(raw)==a.expected_sha256,'Source SHA-256 mismatch';doc,binary=decode(raw);original_binary=bytes(binary);nodes=copy.deepcopy(doc['nodes']);world,parents=world_matrices(nodes);bindings=[]
 def values(index):
  acc=doc['accessors'][index];view=doc['bufferViews'][acc['bufferView']];assert 'byteStride' not in view and acc.get('sparse') is None
  width={'VEC3':3,'VEC4':4}[acc['type']];dtype={5126:'<f4'}[acc['componentType']]
  offset=view.get('byteOffset',0)+acc.get('byteOffset',0);return np.frombuffer(binary,dtype=dtype,count=acc['count']*width,offset=offset).reshape(acc['count'],width).copy()
 def append(array,kind,component=5126,bounds=False):
  array=np.asarray(array,dtype='<u2' if component==5123 else '<f4');binary.extend(bytes(-len(binary)%4));view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':array.nbytes,'target':34962});binary.extend(array.tobytes());acc={'bufferView':view,'componentType':component,'count':len(array),'type':kind}
  if bounds:acc.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
  index=len(doc['accessors']);doc['accessors'].append(acc);return index
 scene_roots=doc['scenes'][doc.get('scene',0)]['nodes']
 for spec in a.bind:
  mesh_name,joint_name=spec.split('=',1);mesh_node=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==mesh_name);joint_node=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==joint_name)
  assert parents.get(mesh_node)==joint_node,f'{mesh_name} is not an immediate child of {joint_name}'
  node=doc['nodes'][mesh_node];mesh=doc['meshes'][node['mesh']];assert len(mesh['primitives'])==1
  primitive=mesh['primitives'][0];assert set(primitive['attributes'])=={'POSITION','NORMAL','COLOR_0'} and node.get('skin') is None
  matches=[(i,s['joints'].index(joint_node)) for i,s in enumerate(doc['skins']) if joint_node in s['joints']];assert len(matches)==1
  skin,joint_slot=matches[0];transform=world(joint_node)@node_matrix(node);positions=values(primitive['attributes']['POSITION']);normals=values(primitive['attributes']['NORMAL'])
  baked_positions=(positions@transform[:3,:3].T+transform[:3,3]).astype('<f4');baked_normals=normals@np.linalg.inv(transform[:3,:3]);baked_normals/=np.linalg.norm(baked_normals,axis=1,keepdims=True)
  joints=np.zeros((len(positions),4),dtype='<u2');joints[:,0]=joint_slot;weights=np.zeros((len(positions),4),dtype='<f4');weights[:,0]=1
  primitive['attributes'].update(POSITION=append(baked_positions,'VEC3',bounds=True),NORMAL=append(baked_normals,'VEC3'),JOINTS_0=append(joints,'VEC4',5123),WEIGHTS_0=append(weights,'VEC4'))
  doc['nodes'][joint_node]['children'].remove(mesh_node);node.pop('rotation',None);node.pop('translation',None);node.pop('scale',None);node.pop('matrix',None);node['skin']=skin;scene_roots.append(mesh_node)
  bindings.append({'meshNode':mesh_node,'meshName':mesh_name,'jointNode':joint_node,'jointName':joint_name,'skin':skin,'jointSlot':joint_slot,'vertices':len(positions),'binding':'100%-rigid-to-joint'})
 doc['buffers'][0]['byteLength']=len(binary);out=encode_glb(doc,bytes(binary));assert bytes(binary[:len(original_binary)])==original_binary
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(out)
 receipt={'schema':'ggd-verified-rigid-attachment-skin@1','source':{'path':str(a.source.resolve()),'bytes':len(raw),'sha256':sha(raw)},'output':{'path':str(a.output.resolve()),'bytes':len(out),'sha256':sha(out)},'bindings':bindings,'originalBinaryPreservedAsExactPrefix':True,'sourceModified':False}
 if a.receipt:a.receipt.parent.mkdir(parents=True,exist_ok=True);a.receipt.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
