#!/usr/bin/env python3
"""Create independent, embedded GLB copies; never edit or link upstream bodies."""
import argparse,copy,hashlib,json,math,struct,subprocess,sys
from pathlib import Path
import numpy as np
repo=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'tools/community-hero-forge'))
from convert_jumpx_body import encode_glb,rotation_matrix,decompose

def read(p):return json.loads(p.read_text())
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def fp(p):return dict(path=str(p.resolve()),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
def decode(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),bytearray(b[28+n:])
def run(cmd,log):
 with log.open('w') as f:r=subprocess.run(cmd,cwd=repo,stdout=f,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError(log.read_text()[-2200:])
def merge_body(doc,binary):
 nodes=[n for n in doc['nodes'] if 'mesh' in n]
 assert all(n.get('skin')==0 and not any(k in n for k in ['matrix','rotation','translation','scale']) for n in nodes)
 primitives=[doc['meshes'][n['mesh']]['primitives'][0] for n in nodes]
 def image_bytes(p):
  m=doc['materials'][p['material']];im=doc['images'][doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];v=doc['bufferViews'][im['bufferView']];return bytes(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
 assert len({hashlib.sha256(image_bytes(p)).hexdigest() for p in primitives})==1
 def array(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']];width={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]
  assert 'byteStride' not in v
  return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
 attrs={key:np.concatenate([array(p['attributes'][key]) for p in primitives]) for key in primitives[0]['attributes']};idx=[];offset=0
 for p in primitives:
  idx.extend((array(p['indices']).flatten()+offset).tolist());offset+=len(array(p['attributes']['POSITION']))
 def add(a,kind,component):
  while len(binary)%4:binary.append(0)
  v=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=a.nbytes));binary.extend(a.tobytes());i=len(doc['accessors']);doc['accessors'].append(dict(bufferView=v,componentType=component,count=len(a),type=kind,min=np.atleast_1d(a.min(axis=0)).tolist(),max=np.atleast_1d(a.max(axis=0)).tolist()));return i
 result={k:add(a,doc['accessors'][primitives[0]['attributes'][k]]['type'],doc['accessors'][primitives[0]['attributes'][k]]['componentType']) for k,a in attrs.items()}
 doc['meshes']=[dict(name='complete-copied-eugeo-body',primitives=[dict(attributes=result,indices=add(np.asarray(idx,dtype='<u2'),'SCALAR',5123),material=primitives[0]['material'])])]
 nodes[0]['mesh']=0
 for n in nodes[1:]:n.pop('mesh');n.pop('skin')

def attach(doc,binary):
 attachments=[]
 # Evaluate the same idle sample used by visual inspection, then orient each
 # accessory in its hand's local space. Parenting preserves all later motion.
 locals=copy.deepcopy(doc['nodes'])
 def sample_accessor(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
  return np.frombuffer(binary,dtype='<f4',count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
 clip=next(a for a in doc['animations'] if a['name']=='bat_idle')
 for channel in clip['channels']:
  sampler=clip['samplers'][channel['sampler']];times=sample_accessor(sampler['input']).flatten();values=sample_accessor(sampler['output']);t=times[0]+(times[-1]-times[0])*.2;right=min(len(times)-1,int(np.searchsorted(times,t)));left=max(0,right-1)
  factor=0 if times[right]==times[left] else (t-times[left])/(times[right]-times[left]);a,b=values[left],values[right]
  if channel['target']['path']=='rotation' and np.dot(a,b)<0:b=-b
  value=a+(b-a)*factor
  if channel['target']['path']=='rotation':value=value/np.linalg.norm(value)
  locals[channel['target']['node']][channel['target']['path']]=value.tolist()
 parents={child:i for i,n in enumerate(locals) for child in n.get('children',[])};world={}
 def matrix(i):
  if i not in world:
   n=locals[i];m=np.eye(4);m[:3,:3]=rotation_matrix(n.get('rotation',[0,0,0,1]))@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);world[i]=matrix(parents[i])@m if i in parents else m
  return world[i]
 def acc(values,kind):
  a=np.asarray(values,dtype='<f4');width={'VEC3':3,'VEC4':4}[kind]
  while len(binary)%4:binary.append(0)
  v=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=a.nbytes,target=34962));binary.extend(a.tobytes())
  i=len(doc['accessors']);doc['accessors'].append(dict(bufferView=v,componentType=5126,count=len(a),type=kind,min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist()));return i
 def box(lo,hi):
  pts=[];norm=[]
  for axis in range(3):
   for side in [0,1]:
    other=[i for i in range(3) if i!=axis];corners=[]
    for a,b in [(0,0),(1,0),(1,1),(0,1)]:
     p=[0.,0.,0.];p[axis]=[lo,hi][side][axis];p[other[0]]=[lo,hi][a][other[0]];p[other[1]]=[lo,hi][b][other[1]];corners.append(p)
    n=np.zeros(3);n[axis]=(-1,1)[side]
    ids=[0,1,2,0,2,3]
    if np.dot(np.cross(np.array(corners[1])-corners[0],np.array(corners[2])-corners[0]),n)<0:ids=[0,2,1,0,3,2]
    pts.extend(corners[i] for i in ids);norm.extend([n.tolist()]*6)
  return pts,norm
 def geometry(name,hand,parts):
  parent=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==hand)
  positions=[];normals=[];colors=[]
  for lo,hi,color in parts:
   pos,nor=box(lo,hi);positions.extend(pos);normals.extend(nor);colors.extend([color]*len(pos))
  mat=len(doc['materials']);doc['materials'].append(dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],metallicFactor=0.35,roughnessFactor=0.65)))
  primitives=[dict(attributes=dict(POSITION=acc(positions,'VEC3'),NORMAL=acc(normals,'VEC3'),COLOR_0=acc(colors,'VEC4')),material=mat,mode=4)]
  mesh=len(doc['meshes']);doc['meshes'].append(dict(name=name,primitives=primitives));node=len(doc['nodes']);desired=np.eye(4);desired[:3,:3]=rotation_matrix([0,0,-math.sqrt(.5),math.sqrt(.5)]) if 'sword' in name else np.eye(3)
  alignment=np.eye(4);alignment[:3,:3]=np.linalg.inv(matrix(parent)[:3,:3])@desired[:3,:3];_,q,_=decompose(alignment)
  doc['nodes'].append(dict(name=name,mesh=mesh,rotation=q.tolist()));doc['nodes'][parent].setdefault('children',[]).append(node)
  attachments.append(dict(name=name,parentNode=parent,parentName=hand,node=node))
 # Hand-local +X follows the fingers. Compact 0.42 m blade and 0.30 m shield.
 geometry('goblin-right-small-sword','Bip001 R Hand',[
  ([-.05,-.025,-.025],[.08,.025,.025],[.21,.11,.06,1]),
  ([.07,-.09,-.02],[.1,.09,.02],[.38,.4,.43,1]),
  ([.1,-.032,-.012],[.42,.032,.012],[.72,.76,.81,1])])
 geometry('goblin-left-small-shield','Bip001 L Hand',[
  ([-.1,-.15,-.065],[.2,.15,-.035],[.33,.19,.09,1]),
  ([.025,-.15,-.071],[.07,.15,-.03],[.55,.58,.62,1])])
 return attachments

def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--only');a=p.parse_args();ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
 cfg=read(repo/'materials/hero-model-library/derivatives.json');locations=read(ws/'outputs/hero-model-options-20260909/runtime-locations.json');results=[]
 for e in cfg['entries']:
  if a.only and e['id'] not in a.only.split(','):continue
  target=out/e['id'];target.mkdir(exist_ok=False);result=dict(characterId='derivative:'+e['id'],heroId=e['heroId'],sourceCharacter=e['name']+'（獨立衍生副本）',sourceWork=e['work'],stage='copy',directory=str(target));results.append(result)
  try:
   source=Path(locations[e['sourceId']]) if 'sourceRuntime' not in e else ws/e['sourceRuntime'];body=source/'body.glb';receipt=read(source/'receipt.json');doc,binary=decode(body)
   # Preserve the complete embedded rig/geometry/motion. Distinct provenance is
   # part of the GLB so even a no-recolor copy gets its own content address.
   original=fp(body);doc.setdefault('extras',{})['ggdDerivative']=dict(id=e['id'],heroId=e['heroId'],sourceId=e['sourceId'],sourceSha256=original['sha256'],copyMode='independent-embedded-copy',changes=e['changes'])
   texture_receipts=[]
   for index,im in enumerate(doc.get('images',[])):
    v=doc['bufferViews'][im['bufferView']];data=bytes(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);old=target/'source-textures'/f'{index}.png';old.parent.mkdir(exist_ok=True);old.write_bytes(data)
    edited=e.get('textures',{}).get(str(index));new=ws/edited if edited else old
    if edited:
     if not new.is_file():raise ValueError('Edited texture not ready: '+str(new))
     data=new.read_bytes()
     while len(binary)%4:binary.append(0)
     im['bufferView']=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(data)));binary.extend(data);im['mimeType']='image/png';im.pop('uri',None)
    final=target/'textures'/f'{index}.png';final.parent.mkdir(exist_ok=True);final.write_bytes(data);texture_receipts.append(dict(index=index,source=fp(old),copy=fp(final),edited=bool(edited)))
   if e.get('accessories'):merge_body(doc,binary)
   accessories=attach(doc,binary) if e.get('accessories') else []
   doc['buffers'][0]['byteLength']=len(binary);candidate=target/'copy.glb';candidate.write_bytes(encode_glb(doc,binary))
   assert original==fp(body),'Source modified'
   assert all(not i.get('uri') for i in doc.get('images',[])) and all(not b.get('uri') for b in doc['buffers'])
   prep=dict(schema='ggd-library-model-preparation@1',asset='derivative:'+e['id'],source=original,output=fp(candidate),stateClips=receipt.get('selectedClips',read(source/'model.json')['clipMap']),yawOffsetDeg=read(source/'model.json').get('yawOffsetDeg',0),limitations=receipt.get('preparation',{}).get('limitations',[])+['衍生外觀代理；完整複製來源已標準化的骨架、幾何、材質與動作。來源原始素材不變。'],derivative=doc['extras']['ggdDerivative'],textures=texture_receipts,attachments=accessories)
   write(target/'preparation.json',prep);result['stage']='validation'
   run(['node','--import','tsx',str(repo/'tools/community-hero-forge/finalize-library-body.mts'),'--receipt',str(target/'preparation.json'),'--out',str(target/'runtime')],target/'validation.log')
   run(['node',str(repo/'tools/community-hero-forge/inspect-library-motion.mjs'),str(target/'runtime'),str(target/'runtime/motion.json')],target/'motion.log')
   result.update(stage='prepared',runtime=str(target/'runtime'),sourceSha256=original['sha256'],outputSha256=fp(target/'runtime/body.glb')['sha256'])
  except Exception as err:result['error']=str(err)
  write(out/'summary.json',results);print(json.dumps(result,ensure_ascii=False),flush=True)
 if any('error' in r for r in results):sys.exit(1)
if __name__=='__main__':main()
