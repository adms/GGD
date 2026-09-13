import sys,json,dataclasses,hashlib,zlib,struct,math,io
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,'/private/tmp/ggd-shinchan-fivefury-source/fivefury-0.5.0')
from fivefury import read_ydd,read_yft,read_ytd
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');OUT=ROOT/'outputs/priority-shinchan-canonical-20260910';SRC=ROOT/'GGD-Asset-Library/intake/public-models-20260910'
V1=OUT/'conversion-v1';V1.mkdir(exist_ok=False)
def record(p):return dict(path=str(p.resolve()),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
def checked(p):
 raw=p.read_bytes();dc=zlib.decompressobj(-15);data=dc.decompress(raw[16:]);tail=dc.unused_data
 assert dc.eof and not dc.unconsumed_tail
 if tail:assert len(tail)==4 and tail==struct.pack('>I',zlib.adler32(data))
 return raw[:-4] if tail else raw,dict(**record(p),deflateBytes=len(data),validatedAdler32Tail=tail.hex() or None)
def vec(v):return list(v)
def qm(q):
 q=np.asarray(q,dtype=float);q/=np.linalg.norm(q);x,y,z,w=q
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def trs(b):
 m=np.eye(4);m[:3,:3]=qm(vec(b.rotation))*np.array(vec(b.scale));m[:3,3]=vec(b.translation);return m
sources=[]
yddraw,rec=checked(SRC/'gta5mod-shinchan-sd2/extracted/sd2.ydd');sources.append(rec);ydd=read_ydd(yddraw)
yftraw,rec=checked(SRC/'gta5mod-shinchan-sd2/extracted/sd2.yft');sources.append(rec);yft=read_yft(yftraw)
skel=next(e.drawable.skeleton for e in ydd.drawables if e.drawable.skeleton);bones=skel.bones
assert [b.index for b in bones]==list(range(len(bones)))
assert [b.name for b in bones]==[b.name for b in yft.main_drawable.skeleton.bones]
assert [b.parent_index for b in bones]==[b.parent_index for b in yft.main_drawable.skeleton.bones]
world=[];invResidual=[]
for b in bones:
 world.append((world[b.parent_index] if b.parent_index>=0 else np.eye(4))@trs(b));ib=np.array(b.inverse_bind_transform,dtype=float).T;ib[3,3]=1;invResidual.append(float(np.max(np.abs(world[-1]@ib-np.eye(4)))))
assert max(invResidual)<0.0001
allmeshes=[(e,m,s) for e in ydd.drawables for m in e.drawable.iter_models(lod='high') for s in m.meshes]
pts=np.concatenate([np.array([vec(v) for v in s.positions]) for e,m,s in allmeshes]);C=np.array([[1,0,0,0],[0,0,1,-pts[:,2].min()],[0,-1,0,0],[0,0,0,1]],dtype=float)
G=[C@w for w in world]
sourceRestProof=dict(maxStoredInverseBindResidual=max(invResidual),yddYftBoneNamesAndHierarchyEqual=True,yddYftMaxTranslationDelta=float(max(np.max(np.abs(np.array(vec(a.translation))-vec(b.translation))) for a,b in zip(bones,yft.main_drawable.skeleton.bones))),sourceBoneCount=len(bones),coordinateTransform=C.tolist())
(V1/'source-rig-proof.json').write_text(json.dumps(sourceRestProof,indent=2)+'\n')
allreports=[]
for variant,ytdpath in [('sd2',SRC/'gta5mod-shinchan-sd2/extracted/sd2.ytd'),('kstamil',SRC/'gta5mod-shinchan-kstamil/extracted/shinchan ped mod by KS PLAY TAMIL/shinchan1.ytd')]:
 vr=V1/variant;vr.mkdir();td=vr/'textures';td.mkdir();raw,rec=checked(ytdpath);yt=read_ytd(raw)
 tex={};texrecords=[]
 for t in yt:
  dds=t.to_dds_bytes();dp=td/(t.name+'.dds');dp.write_bytes(dds);im=Image.open(io.BytesIO(dds));im.load();im=im.convert('RGBA');pp=td/(t.name+'.png');im.save(pp)
  tex[t.name]=pp;texrecords.append(dict(name=t.name,width=t.width,height=t.height,nativeFormat=t.format_name,mips=t.mip_count,alphaRange=im.getchannel('A').getextrema(),dds=record(dp),png=record(pp)))
 for rigmode in ['source-rig','canonical-rig']:
  g={'asset':{'version':'2.0','generator':'GGD audited loose RSC7 FiveFury 0.5.0 converter'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'skins':[],'bufferViews':[],'accessors':[],'extras':{'heroId':'b2-shinchan','sourceKind':'GTA V community addon ped','variant':variant,'nativeAnimationCount':0,'rigMode':rigmode,'sourceRigNormalization':rigmode=='canonical-rig','licenseStatus':'source restrictions recorded; no clearance inferred','sourceNativeShader':'ped_default.sps','materialTranslation':'Diffuse texture; opaque per source render bucket 0; rough nonmetallic PBR approximation; native shader values retained in parsed source'}};binary=bytearray()
  def view(data,target=None):
   while len(binary)%4:binary.append(0)
   v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
   if target:v['target']=target
   binary.extend(data);i=len(g['bufferViews']);g['bufferViews'].append(v);return i
  def acc(a,typ,ctype=5126,target=None,bounds=False):
   a=np.asarray(a,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[ctype]);vi=view(a.tobytes(),target);v={'bufferView':vi,'componentType':ctype,'count':len(a),'type':typ}
   if bounds:v.update(min=a.min(0).tolist(),max=a.max(0).tolist())
   i=len(g['accessors']);g['accessors'].append(v);return i
  frames=[]
  if rigmode=='canonical-rig':
   # Rigid change of every bone's local coordinate frame: bind positions and skin weights unchanged.
   # Global rest axes become glTF X/Y/Z; original full rig exists separately in source-rig.glb.
   for w in G:
    f=np.eye(4);f[:3,3]=w[:3,3];frames.append(f)
   for i,b in enumerate(bones):
    f=(np.linalg.inv(frames[b.parent_index]) if b.parent_index>=0 else np.eye(4))@frames[i]
    g['nodes'].append({'name':b.name,'translation':f[:3,3].tolist(),'rotation':[0,0,0,1],'scale':[1,1,1],'extras':{'nativeBoneIndex':i,'nativeTag':b.tag}})
  else:
   frames=G
   for i,b in enumerate(bones):
    f=(np.linalg.inv(G[b.parent_index]) if b.parent_index>=0 else np.eye(4))@G[i]
    g['nodes'].append({'name':b.name,'matrix':f.T.ravel().tolist(),'extras':{'nativeBoneIndex':i,'nativeTag':b.tag}})
  for i,b in enumerate(bones):
   if b.parent_index>=0:g['nodes'][b.parent_index].setdefault('children',[]).append(i)
   else:g['scenes'][0]['nodes'].append(i)
  ibms=np.array([np.linalg.inv(x).T.ravel() for x in frames]);g['skins'].append({'name':'Shinchan_native_98_bone_weights','joints':list(range(len(bones))),'inverseBindMatrices':acc(ibms,'MAT4'),'skeleton':0})
  for name,pp in tex.items():
   imageidx=len(g['images']);g['images'].append({'name':name,'bufferView':view(pp.read_bytes()),'mimeType':'image/png'});g['textures'].append({'source':imageidx,'sampler':0})
  tid={n:i for i,n in enumerate(tex)};meshreports=[];weighted=set();maxnorm=0
  for e,m,s in allmeshes:
   positions=np.array([vec(v) for v in s.positions]);normals=np.array([vec(v) for v in s.normals]);uv=np.array([[v.x,v.y] for v in s.texcoords[0]])
   # DirectX UV origins at top-left, matching glTF image convention; preserve raw U,V.
   p=positions@C[:3,:3].T+C[:3,3];n=normals@C[:3,:3].T;n/=np.linalg.norm(n,axis=1)[:,None]
   ix=np.array(s.indices);assert len(ix)%3==0 and ix.min()>=0 and ix.max()<len(p)
   joints=np.array(s.bone_ids)[np.array(s.blend_indices)];weights=np.array(s.blend_weights,dtype=float);assert np.isfinite(p).all() and np.isfinite(weights).all() and (weights>=0).all()
   sumw=weights.sum(1);assert (sumw>0).all();maxnorm=max(maxnorm,float(np.max(abs(sumw-1))));weights/=sumw[:,None];weighted.update(joints[weights>0].tolist());joints[weights==0]=0
   name=next(t.name for t in s.material.textures if t.parameter_name=='DiffuseSampler');matidx=len(g['materials']);g['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorTexture':{'index':tid[name]},'metallicFactor':0,'roughnessFactor':.85},'alphaMode':'OPAQUE','doubleSided':False,'extras':{'nativeShader':s.material.shader_name,'nativeRenderBucket':s.material.render_bucket}})
   attrs={'POSITION':acc(p,'VEC3',target=34962,bounds=True),'NORMAL':acc(n,'VEC3',target=34962),'TEXCOORD_0':acc(uv,'VEC2',target=34962),'JOINTS_0':acc(joints,'VEC4',5123,34962),'WEIGHTS_0':acc(weights,'VEC4',target=34962)}
   mi=len(g['meshes']);g['meshes'].append({'name':e.name+'_'+str(mi),'primitives':[{'attributes':attrs,'indices':acc(ix,'SCALAR',5123 if ix.max()<65536 else 5125,34963),'material':matidx,'mode':4}]});ni=len(g['nodes']);g['nodes'].append({'name':'mesh_'+e.name+'_'+str(mi),'mesh':mi,'skin':0});g['scenes'][0]['nodes'].append(ni)
   meshreports.append(dict(nativeId=e.name,vertices=len(p),triangles=len(ix)//3,texture=name,bounds=[p.min(0).tolist(),p.max(0).tolist()],nativeUVRange=[uv.min(0).tolist(),uv.max(0).tolist()]))
  while len(binary)%4:binary.append(0)
  g['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(g,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);glb=struct.pack('<5I',0x46546c67,2,28+len(jb)+len(binary),len(jb),0x4e4f534a)+jb+struct.pack('<II',len(binary),0x004e4942)+binary;p=vr/(rigmode+'.glb');p.write_bytes(glb)
  report=dict(schema='ggd-rsc7-shinchan-conversion@1',variant=variant,rigMode=rigmode,output=record(p),sources=sources+[rec],bones=len(bones),weightedBones=len(weighted),weightedBoneNames=[bones[i].name for i in sorted(weighted)],meshes=meshreports,vertices=sum(x['vertices'] for x in meshreports),triangles=sum(x['triangles'] for x in meshreports),nativeAnimationCount=0,audioCount=0,vfxCount=0,textures=texrecords,maxOriginalWeightSumDeviation=maxnorm,sourceRestProof=sourceRestProof,bindPoseRestResidual=float(max(np.max(abs(frames[i]@np.linalg.inv(frames[i])-np.eye(4))) for i in range(len(bones)))),rigNormalization='Bone frame reparameterization with preserved names, hierarchy, joint positions and source weights; identity glTF world axes; original rest matrices preserved in source-rig.glb and source JSON.' if rigmode=='canonical-rig' else 'Source local matrices, reexpressed in glTF Y-up, source inverse bind checked; IBM recomputed from matching TRS.',limitations=['Source model comes from public GTA5 mod page, source notice restricts derivative/shared use; distribution permission not inferred.','Native GTA ped material translated to simple nonmetallic PBR diffuse; not exact GTA engine shader.','0 original animations, audio or VFX.','GGD in-game visual acceptance pending.'])
  (vr/(rigmode+'-receipt.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');allreports.append(report)
print(json.dumps([dict(variant=x['variant'],mode=x['rigMode'],vertices=x['vertices'],triangles=x['triangles'],weightedBones=x['weightedBones'],glb=x['output']['path']) for x in allreports],indent=2))
