from pathlib import Path
import collections,hashlib,io,json,struct
import numpy as np
from PIL import Image
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7/kotomine-kirei');assert not (R.parent/'control/handoff.json').exists()
source=R/'extracted/Models/Player/FKotomine/FKotomine.mdl';b=source.read_bytes()
def read(fmt,off):
 assert 0<=off and off+struct.calcsize(fmt)<=len(b)
 return struct.unpack_from(fmt,b,off)
def name(off,n=32):return b[off:off+n].split(b'\0')[0].decode('utf8','replace')
def put(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert b[:4]==b'IDST' and read('<i',4)[0]==10 and read('<i',72)[0]==len(b)
keys=['numbones','boneindex','numbonecontrollers','bonecontrollerindex','numhitboxes','hitboxindex','numseq','seqindex','numseqgroups','seqgroupindex','numtextures','textureindex','texturedataindex','numskinref','numskinfamilies','skinindex','numbodyparts','bodypartindex','numattachments','attachmentindex'];h=dict(zip(keys,read('<20i',140)));assert 0<h['numbones']<256 and h['numseqgroups']==1
bones=[]
for i in range(h['numbones']):
 off=h['boneindex']+112*i;bones.append({'index':i,'name':name(off),'parent':read('<i',off+32)[0],'flags':read('<i',off+36)[0],'controller':read('<6i',off+40),'value':read('<6f',off+64),'scale':read('<6f',off+88)})
assert all(-1<=x['parent']<x['index'] for x in bones)
v=np.asarray([x['value'] for x in bones]);sc=np.asarray([x['scale'] for x in bones]);groupBase=read('<i',h['seqgroupindex']+100)[0]
g=(R/'converted/kotomine-kirei-assimp.glb').read_bytes();jn=struct.unpack_from('<I',g,12)[0];doc=json.loads(g[20:20+jn]);bn=struct.unpack_from('<I',g,20+jn)[0];data=bytearray(g[28+jn:28+jn+bn])
def accessor(i):
 a=doc['accessors'][i];view=doc['bufferViews'][a['bufferView']];types={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'};width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype(types[a['componentType']]);start=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',width*dt.itemsize)
 return np.ndarray((a['count'],width),dtype=dt,buffer=data,offset=start,strides=(stride,dt.itemsize)).copy()
def quat(e):
 x,y,z=np.moveaxis(e/2,-1,0);cx,cy,cz=np.cos(x),np.cos(y),np.cos(z);sx,sy,sz=np.sin(x),np.sin(y),np.sin(z)
 return np.stack([sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz],-1)
nodeByName={n['name']:i for i,n in enumerate(doc['nodes']) if 'name'in n};assert all(x['name'] in nodeByName for x in bones)
parents={ch:i for i,n in enumerate(doc['nodes']) for ch in n.get('children',[])}
for bone in bones:
 if bone['parent']>=0:assert parents[nodeByName[bone['name']]]==nodeByName[bones[bone['parent']]['name']]
rawArrays={};seqs=[];clips=[];gi=0;maxPosError=0.;maxQError=0.;maxTimeError=0.;nativeChannels=0
for si in range(h['numseq']):
 off=h['seqindex']+si*176;fps=read('<f',off+32)[0];flags=read('<i',off+36)[0];nf=read('<i',off+56)[0];numblends=read('<i',off+120)[0];animindex=read('<i',off+124)[0];sg=read('<i',off+156)[0]
 assert 0<fps<=240 and 0<nf<=4096 and 0<numblends<=4 and sg==0
 seq={'index':si,'name':name(off),'byteOffset':off,'fps':fps,'flags':flags,'loop':bool(flags&1),'frames':nf,'frameDomain':[0,nf-1],'sampleDurationSeconds':(nf-1)/fps,'blends':numblends,'animIndex':animindex,'seqgroup':sg,'motionType':read('<i',off+68)[0],'motionBone':read('<i',off+72)[0],'linearMovement':read('<3f',off+76),'blendTypes':read('<2i',off+128),'blendStart':read('<2f',off+136),'blendEnd':read('<2f',off+144),'nextSequence':read('<i',off+172)[0],'events':[]}
 ec,eo=read('<2i',off+48)
 for ei in range(ec):
  ep=eo+ei*76;seq['events'].append({'frame':read('<i',ep)[0],'event':read('<i',ep+4)[0],'type':read('<i',ep+8)[0],'options':name(ep+12,64)})
 seqs.append(seq)
 for blend in range(numblends):
  raw=np.zeros((nf,h['numbones'],6),dtype=np.int16);offsets=[];encodedChannels=0
  for bi in range(h['numbones']):
   base=groupBase+animindex+(blend*h['numbones']+bi)*12;ofs=read('<6H',base);offsets.append(list(ofs))
   for ch,o in enumerate(ofs):
    if not o:continue
    encodedChannels+=1;frame=0;pos=base+o
    while frame<nf:
     valid,total=read('<2B',pos);assert 0<valid<=total and total>0
     values=np.asarray(read('<'+str(valid)+'h',pos+2),dtype=np.int16)
     for k in range(min(total,nf-frame)):raw[frame+k,bi,ch]=values[min(k,valid-1)]
     frame+=total;pos+=2*(valid+1)
  nativeChannels+=encodedChannels;dof=v[None,:,:]+raw*sc[None,:,:];q=quat(dof[:,:,3:]);q/=np.linalg.norm(q,axis=2,keepdims=True)
  rawArrays[f's{si:03d}_b{blend}_int16']=raw
  activePos=int(np.count_nonzero(np.any(np.ptp(dof[:,:,:3],axis=0)>1e-7,axis=1)))
  activeRot=int(np.count_nonzero(np.any(1-np.abs(np.sum(q*q[0:1],axis=2))>1e-9,axis=0)))
  moving=nf>1 and (activePos>0 or activeRot>0)
  a=doc['animations'][gi];assert a['name']==seq['name'];bound=[];posErr=qErr=timeErr=0.
  for c in a['channels']:
   s=a['samplers'][c['sampler']];times=accessor(s['input'])[:,0];vals=accessor(s['output']);path=c['target']['path'];node=c['target']['node'];bnm=doc['nodes'][node]['name'];bi=next(x['index'] for x in bones if x['name']==bnm)
   if path=='scale':
    scaleError=float(np.max(np.abs(vals-1)));assert scaleError<1e-5,scaleError;continue
   assert len(times)==len(vals)==nf
   timeErr=max(timeErr,float(np.max(np.abs(times-np.arange(nf)/fps))))
   if path=='translation':posErr=max(posErr,float(np.max(np.abs(vals-dof[:,bi,:3]))))
   elif path=='rotation':
    vals/=np.linalg.norm(vals,axis=1,keepdims=True);dot=np.sum(vals*q[:,bi],axis=1);qErr=max(qErr,float(np.max(np.linalg.norm(vals-q[:,bi]*np.where(dot<0,-1,1)[:,None],axis=1))))
   else:raise ValueError(path)
   bound.append((bi,path))
  assert len(set(bound))==h['numbones']*2
  assert posErr<0.0001 and qErr<0.0001 and timeErr<0.00001,(si,blend,posErr,qErr,timeErr)
  maxPosError=max(maxPosError,posErr);maxQError=max(maxQError,qErr);maxTimeError=max(maxTimeError,timeErr)
  detail={'glbAnimationIndex':gi,'sourceSequence':si,'sourceLabel':seq['name'],'blendIndex':blend,'fps':fps,'frames':nf,'loop':seq['loop'],'sampleDurationSeconds':seq['sampleDurationSeconds'],'singleFramePose':nf==1,'hasTimeVaryingTransform':bool(moving),'movingPositionBones':activePos,'movingRotationBones':activeRot,'sourceEncodedDofChannels':encodedChannels,'sourceOffsets':offsets,'boundBoneCount':h['numbones'],'glbTranslationRotationChannels':len(bound),'maxPositionKeyError':posErr,'maxQuaternionKeyError':qErr,'maxTimeErrorSeconds':timeErr,'sourceRawKeyArray':f's{si:03d}_b{blend}_int16','motionOrigin':'GoldSrc/Sven Co-op MOD; not Fate native'}
  clips.append(detail);a['name']=seq['name']+(f' [blend {blend}]' if numblends>1 else '');a['extras']={'sourceSequenceIndex':si,'sourceBlendIndex':blend,'sourceLabel':seq['name'],'sourceFPS':fps,'sourceFrames':nf,'sourceLoop':seq['loop'],'singleFramePose':nf==1,'timeVarying':bool(moving),'motionOrigin':'Sven Co-op / GoldSrc MOD','sourcePlatform':'unknown'};gi+=1
assert gi==len(doc['animations'])
np.savez_compressed(R/'analysis/source-motion-keys.npz',boneValues=v,boneScales=sc,**rawArrays)
put(R/'analysis/native-mdl-sequences.json',{'header':h,'sourceMdlSha256':sha(source),'boneCount':len(bones),'bones':bones,'sequences':seqs,'sequenceCount':len(seqs),'blendAnimationEntries':gi,'singleFrameSequences':sum(s['frames']==1 for s in seqs),'multiFrameSequences':sum(s['frames']>1 for s in seqs),'fpsHistogram':dict(collections.Counter(str(s['fps']) for s in seqs)),'loopSequences':sum(s['loop'] for s in seqs),'rawKeys':'analysis/source-motion-keys.npz','formatEvidence':'../control/specs/studio.h and ../control/specs/HL1MDLLoader.cpp','nativeFateMotion':False})
put(R/'motion-index.json',{'schema':'ggd.motion-index.intake@1','localRoot':str(R),'sourceId':'gamebanana-fuc-kotomine-kirei-291438','motionOrigin':'Sven Co-op / GoldSrc MOD','sourcePlatform':'unknown','fateOriginalMotionCount':0,'glbAnimationEntries':gi,'movingClipEntries':sum(c['hasTimeVaryingTransform'] for c in clips),'singleFramePoseEntries':sum(c['singleFramePose'] for c in clips),'staticMultiFrameEntries':sum(not c['singleFramePose'] and not c['hasTimeVaryingTransform'] for c in clips),'clips':clips,'maxPositionKeyError':maxPosError,'maxQuaternionKeyError':maxQError,'maxTimeErrorSeconds':maxTimeError,'validation':'Every source RLE frame/bone channel independently decoded and compared to glTF time/TR keys; playback/render sampling separate.'})
textures=[];(R/'converted/textures').mkdir(exist_ok=True)
for i,img in enumerate(doc['images']):
 off=h['textureindex']+i*80;n=name(off,64);flags,w,hei,pix=read('<4i',off+64);assert n==img['name'] and 0<w<=4096 and 0<hei<=4096
 indexed=np.frombuffer(b,dtype=np.uint8,count=w*hei,offset=pix).reshape(hei,w);pal=np.frombuffer(b,dtype=np.uint8,count=768,offset=pix+w*hei).reshape(256,3);rgb=pal[indexed];rgba=np.concatenate([rgb,np.full((hei,w,1),255,np.uint8)],axis=2)
 view=doc['bufferViews'][img['bufferView']];raw=bytes(data[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]);sourceBgra=rgba[:,:,[2,1,0,3]].tobytes();assert len(raw)<=len(sourceBgra) and raw==sourceBgra[:len(raw)],'Assimp BGRA prefix mismatch'
 if flags&64:rgba[indexed==255,3]=0
 png=R/'converted/textures'/(Path(n).stem+'.png');Image.fromarray(rgba,'RGBA').save(png);payload=png.read_bytes()
 while len(data)%4:data.append(0)
 viewIdx=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(payload)});data.extend(payload);img['bufferView']=viewIdx;img['mimeType']='image/png';img['name']=png.name
 textures.append({'sourceName':n,'path':str(png.relative_to(R)),'bytes':len(payload),'sha256':sha(png),'width':w,'height':hei,'sourceFlags':flags,'originalPaletteBytes':768,'originalExpectedRgbaBytes':w*hei*4,'assimpEmbeddedBytes':len(raw),'assimpEmbeddedPixelsTruncated':len(raw)<w*hei*4,'retainedAssimpBgraPrefixExactMatch':True,'alphaTreatment':'palette index 255 transparent if source masked flag set','pixelSource':'original MDL indexed pixels + RGB palette'})
put(R/'analysis/texture-conversion.json',{'textures':textures,'standardization':'Replaced unsupported Assimp image/rgba8888 payload with standard PNG using original MDL pixels/palette; source byte evidence retained.'})
# Canonicalize affine inverse-bind rows after float32 importer roundoff.
ibmRepairs=[]
for skin in doc['skins']:
 ai=skin['inverseBindMatrices'];ac=doc['accessors'][ai];bv=doc['bufferViews'][ac['bufferView']];start=bv.get('byteOffset',0)+ac.get('byteOffset',0);stride=bv.get('byteStride',64)
 for row in range(ac['count']):
  for comp,wanted in [(3,0.),(7,0.),(11,0.),(15,1.)]:
   at=start+row*stride+comp*4;old=struct.unpack_from('<f',data,at)[0];assert abs(old-wanted)<1e-5
   if old!=wanted:ibmRepairs.append({'matrix':row,'component':comp,'from':old,'to':wanted});struct.pack_into('<f',data,at,wanted)
for skin in doc['skins']:
 ac=doc['accessors'][skin['inverseBindMatrices']];values=accessor(skin['inverseBindMatrices'])
 if 'min' in ac:ac['min']=values.min(axis=0).tolist()
 if 'max' in ac:ac['max']=values.max(axis=0).tolist()
# Skin transforms use joint worlds; detach identity mesh nodes from metadata parents.
detached=[]
for i,node in enumerate(doc['nodes']):
 if 'skin' not in node or 'mesh' not in node:continue
 assert not any(k in node for k in ['matrix','translation','rotation','scale'])
 for parentIndex,parentNode in enumerate(doc['nodes']):
  if i in parentNode.get('children',[]):parentNode['children'].remove(i);detached.append({'node':i,'previousParent':parentIndex})
 if i not in doc['scenes'][doc.get('scene',0)]['nodes']:doc['scenes'][doc.get('scene',0)]['nodes'].append(i)
for node in doc['nodes']:
 if node.get('children')==[]:del node['children']
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  for ai in prim['attributes'].values():doc['bufferViews'][doc['accessors'][ai]['bufferView']]['target']=34962
  if 'indices' in prim:doc['bufferViews'][doc['accessors'][prim['indices']]['bufferView']]['target']=34963
put(R/'analysis/gltf-standardization.json',{'inverseBindAffineRowRepairs':ibmRepairs,'maxIbmRepair':max(abs(x['from']-x['to']) for x in ibmRepairs),'identitySkinnedNodesDetached':detached,'sourceAnimationDataAltered':False,'textureFix':'Recovered entire indexed textures from original MDL; Assimp GLB raw texture payloads were truncated to width bytes.'})
while len(data)%4:data.append(0)
doc['buffers'][0]['byteLength']=len(data);doc['asset']['extras']={'originalGame':'Fate/unlimited codes author-labelled','originalPlatform':'unknown','motionOrigin':'Sven Co-op / GoldSrc MOD','units':'unverified native GoldSrc units','runtimeReady':False};js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4);out=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(data))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(data),b'BIN\0')+data;(R/'converted/kotomine-kirei-standard.glb').write_bytes(out)
print(json.dumps({'sequenceCount':len(seqs),'blendEntries':gi,'movingBlendEntries':sum(c['hasTimeVaryingTransform'] for c in clips),'singleFrameEntries':sum(c['singleFramePose'] for c in clips),'staticMultiFrameEntries':sum(not c['singleFramePose'] and not c['hasTimeVaryingTransform'] for c in clips),'bones':len(bones),'frameFPS':dict(collections.Counter(str(s['fps']) for s in seqs)),'maxPositionKeyError':maxPosError,'maxQuaternionKeyError':maxQError,'maxTimeErrorSeconds':maxTimeError,'textures':len(textures),'glbBytes':len(out)},indent=2))
