#!/usr/bin/env python3
"""Turn animated rigid mesh nodes into a conventional glTF skin without drift.

Existing node animation channels remain byte-for-byte described by the same JSON
accessors.  The former mesh nodes become joints; model-space copies of their
geometry are rigidly weighted back to those joints.
"""
import argparse,copy,hashlib,json,struct,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/community-hero-forge'))
from prepare_mba_body import encode_glb
from convert_jumpx_body import rotation_matrix

def digest(data):return hashlib.sha256(data).hexdigest()
def decode(data):
 n=struct.unpack_from('<I',data,12)[0];return json.loads(data[20:20+n]),bytearray(data[28+n:])
def local(node):
 if 'matrix' in node:return np.asarray(node['matrix'],dtype=np.float64).reshape(4,4).T
 m=np.eye(4);m[:3,:3]=rotation_matrix(node.get('rotation',[0,0,0,1]))@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
def main():
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--expected-sha256',required=True);p.add_argument('--receipt',type=Path);a=p.parse_args()
 raw=a.source.read_bytes();assert digest(raw)==a.expected_sha256,'Source SHA-256 mismatch';doc,binary=decode(raw);original_binary=bytes(binary)
 assert not doc.get('skins'),'Source already has skins';assert doc.get('animations'),'Source has no node animation to preserve'
 nodes=copy.deepcopy(doc['nodes']);parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])};memo={}
 def world(i):
  if i not in memo:memo[i]=world(parents[i])@local(nodes[i]) if i in parents else local(nodes[i])
  return memo[i]
 animated={channel['target']['node'] for clip in doc['animations'] for channel in clip['channels']};mesh_nodes=[i for i,n in enumerate(nodes) if 'mesh' in n]
 assert mesh_nodes and animated;root=doc['scenes'][doc.get('scene',0)]['nodes'][0]
 # Preserve the animated hierarchy as joints, including ancestors of meshes.
 joints=[]
 for i in range(len(nodes)):
  if i in mesh_nodes or i in animated or any(j in parents and parents[j]==i for j in mesh_nodes):joints.append(i)
 # All ancestors are required for a connected skeleton.
 for i in list(joints):
  while i in parents:
   i=parents[i]
   if i not in joints:joints.append(i)
 joints=sorted(joints);joint_slot={node:i for i,node in enumerate(joints)}
 def read(index):
  acc=doc['accessors'][index];view=doc['bufferViews'][acc['bufferView']];assert not acc.get('sparse') and not view.get('byteStride');width={'VEC3':3}[acc['type']];assert acc['componentType']==5126
  at=view.get('byteOffset',0)+acc.get('byteOffset',0);return np.frombuffer(binary,dtype='<f4',count=acc['count']*width,offset=at).reshape(acc['count'],width).copy()
 def append(array,kind,component=5126,target=34962,bounds=False):
  array=np.asarray(array,dtype='<u2' if component==5123 else '<f4');binary.extend(bytes(-len(binary)%4));view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':array.nbytes,**({'target':target} if target else {})});binary.extend(array.tobytes());acc={'bufferView':view,'componentType':component,'count':len(array),'type':kind}
  if bounds:acc.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
  index=len(doc['accessors']);doc['accessors'].append(acc);return index
 # glTF MAT4 accessor bytes are column-major.
 inverse=np.asarray([np.linalg.inv(world(i)).T.reshape(-1) for i in joints],dtype='<f4');ibm=append(inverse,'MAT4',target=None)
 doc['skins']=[{'name':'RigidAnimatedHierarchy','inverseBindMatrices':ibm,'skeleton':root,'joints':joints}]
 scene_roots=doc['scenes'][doc.get('scene',0)]['nodes'];converted=[]
 for node_index in mesh_nodes:
  source_node=doc['nodes'][node_index];mesh_index=source_node.pop('mesh');name=source_node.get('name',doc['meshes'][mesh_index].get('name',f'mesh-{mesh_index}'));source_node['name']=name+'.joint';transform=world(node_index)
  for primitive in doc['meshes'][mesh_index]['primitives']:
   attrs=primitive['attributes'];assert 'POSITION' in attrs and 'NORMAL' in attrs and 'JOINTS_0' not in attrs and 'WEIGHTS_0' not in attrs
   positions=read(attrs['POSITION']);normals=read(attrs['NORMAL']);linear=transform[:3,:3]
   positions=(np.einsum('ij,kj->ki',linear,positions)+transform[:3,3]).astype('<f4')
   normals=np.einsum('ij,kj->ki',np.linalg.inv(linear).T,normals);lengths=np.linalg.norm(normals,axis=1,keepdims=True);assert np.all(lengths>1e-8);normals/=lengths
   assert np.all(np.isfinite(positions)) and np.all(np.isfinite(normals))
   ids=np.zeros((len(positions),4),dtype='<u2');ids[:,0]=joint_slot[node_index];weights=np.zeros((len(positions),4),dtype='<f4');weights[:,0]=1
   attrs.update(POSITION=append(positions,'VEC3',bounds=True),NORMAL=append(normals,'VEC3'),JOINTS_0=append(ids,'VEC4',5123),WEIGHTS_0=append(weights,'VEC4'))
  new_node=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mesh_index,'skin':0});scene_roots.append(new_node);converted.append({'sourceNode':node_index,'jointSlot':joint_slot[node_index],'meshNode':new_node,'name':name,'mesh':mesh_index,'primitives':len(doc['meshes'][mesh_index]['primitives'])})
 doc['buffers'][0]['byteLength']=len(binary);out=encode_glb(doc,bytes(binary));assert bytes(binary[:len(original_binary)])==original_binary
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(out)
 receipt={'schema':'ggd-verified-rigid-hierarchy-skin@1','source':{'path':str(a.source.resolve()),'bytes':len(raw),'sha256':digest(raw)},'output':{'path':str(a.output.resolve()),'bytes':len(out),'sha256':digest(out)},'animations':len(doc['animations']),'animationDefinitionsUnchanged':doc['animations']==json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])['animations'],'skin':{'joints':joints,'jointCount':len(joints),'inverseBindMatrices':ibm},'convertedMeshes':converted,'allVerticesRigidWeightOne':True,'originalBinaryPreservedAsExactPrefix':True,'sourceModified':False}
 if a.receipt:a.receipt.parent.mkdir(parents=True,exist_ok=True);a.receipt.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
