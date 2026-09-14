#!/usr/bin/env python3
"""Preserve OU99 native clips/geometry while preparing isolated standard candidates."""
import collections,copy,hashlib,importlib.util,io,json,math,shutil,struct,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('h','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');REPO=W/'GGD-hero-model-options';OUT=W/'outputs/priority-ou99-standards-v2-20260910'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def material_key(m,ignore_texture=False):
 d=copy.deepcopy(m);d.pop('name',None)
 # Preserve all runtime blend/filter metadata; only the source material ordinal differs.
 d.get('extras',{}).get('w3x',{}).pop('material',None)
 if ignore_texture:
  p=d.get('pbrMetallicRoughness',{});p.get('baseColorTexture',{}).pop('index',None)
 return json.dumps(d,sort_keys=True,separators=(',',':'))
def image_bytes(g,b,tid):
 im=g['images'][g['textures'][tid]['source']];v=g['bufferViews'][im['bufferView']];off=v.get('byteOffset',0);return bytes(b[off:off+v['byteLength']])
def sample(im,uv):
 a=np.asarray(im.convert('RGBA'),dtype=float)/255;hei,wid=a.shape[:2];p=uv*[wid,hei]-.5;i=np.floor(p).astype(int);f=p-i
 return ((a[i[:,1]%hei,i[:,0]%wid]*(1-f[:,0,None])+a[i[:,1]%hei,(i[:,0]+1)%wid]*f[:,0,None])*(1-f[:,1,None])+(a[(i[:,1]+1)%hei,i[:,0]%wid]*(1-f[:,0,None])+a[(i[:,1]+1)%hei,(i[:,0]+1)%wid]*f[:,0,None])*f[:,1,None])
def pack_atlas(g,b,prims,groups,dir):
 compatible=collections.defaultdict(list)
 for mid in groups:
  m=g['materials'][mid];p=m.get('pbrMetallicRoughness',{});t=p.get('baseColorTexture')
  if not t or t.get('texCoord',0)!=0 or t.get('extensions') or any(k in m for k in ['normalTexture','occlusionTexture','emissiveTexture']) or p.get('metallicRoughnessTexture'):continue
  if g['textures'][t['index']].get('sampler',0)!=0:continue
  im=Image.open(io.BytesIO(image_bytes(g,b,t['index']))).convert('RGBA')
  if any(np.min(h.accessor(g,b,prims[j]['attributes']['TEXCOORD_0']))<0 or np.max(h.accessor(g,b,prims[j]['attributes']['TEXCOORD_0']))>1 for j in groups[mid]):continue
  compatible[material_key(m,True)].append((im.width*im.height,mid,im))
 needed=len(groups)-4;choices=[sorted(v,key=lambda x:x[0])[:needed] for v in compatible.values() if len(v)>=needed]
 if not choices:raise ValueError('Cannot fit <=5 material groups without changing render semantics')
 choices.sort(key=lambda v:sum(t[0]for t in v));items=choices[0];pad=16;best=None
 for width in [128,256,512,1024]:
  positions={};x=y=rowh=0;ok=True
  for _,mid,im in sorted(items,key=lambda t:(-t[2].height,-t[2].width)):
   w,hei=im.width+pad*2,im.height+pad*2
   if w>width:ok=False;break
   if x+w>width:x=0;y+=rowh;rowh=0
   positions[mid]=(x,y);x+=w;rowh=max(rowh,hei)
  if not ok:continue
  height=2**math.ceil(math.log2(max(1,y+rowh)))
  if height<=1024 and (best is None or width*height<best[0]):best=(width*height,width,height,positions)
 if not best:raise ValueError('Native-resolution atlas cannot fit 1024 budget')
 _,width,height,positions=best;atlas=Image.new('RGBA',(width,height));uvmaps={};proof=[]
 for _,mid,im in items:
  x,y=positions[mid];tile=Image.fromarray(np.pad(np.asarray(im),((pad,pad),(pad,pad),(0,0)),mode='wrap'));atlas.paste(tile,(x,y))
  assert np.array_equal(np.asarray(atlas.crop((x+pad,y+pad,x+pad+im.width,y+pad+im.height))),np.asarray(im))
  uvmaps[mid]={'scale':[im.width/width,im.height/height],'offset':[(x+pad)/width,(y+pad)/height]}
  proof.append({'material':mid,'originalTexture':g['materials'][mid]['pbrMetallicRoughness']['baseColorTexture']['index'],'originalResolution':[im.width,im.height],'atlasRect':[x+pad,y+pad,im.width,im.height],'exactOriginalRgbaPixelsRetained':True,'paddingPixels':pad,'paddingMode':'source repeat wrap'})
 buf=io.BytesIO();atlas.save(buf,format='PNG');raw=buf.getvalue();(dir/'atlas.png').write_bytes(raw)
 while len(b)%4:b.append(0)
 vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(raw)});b.extend(raw)
 ii=len(g['images']);g['images'].append({'bufferView':vi,'mimeType':'image/png','name':'Full resolution source texture atlas'})
 ti=len(g['textures']);g['textures'].append({'source':ii,'sampler':0});representative=items[0][1];m=copy.deepcopy(g['materials'][representative]);m['name']='Merged exact material settings, full-resolution atlas';m['pbrMetallicRoughness']['baseColorTexture']['index']=ti;m.setdefault('extras',{})['ggdAtlasSourceMaterials']=[t[1]for t in items]
 newmid=len(g['materials']);g['materials'].append(m);merged=[]
 for _,mid,im in items:
  merged+=groups.pop(mid)
  for pi in merged:
   pass
 groups[newmid]=merged
 # Map every original primitive's material representative to its transformed UVs.
 errors=[]
 for _,mid,im in items:
  for pi,p in enumerate(prims):
   if p['_representative']!=mid:continue
   uv=h.accessor(g,b,p['attributes']['TEXCOORD_0']).astype(float);transform=uvmaps[mid];new=(uv*transform['scale']+transform['offset']).astype('<f4')
   err=float(np.max(np.abs(sample(im,uv)-sample(atlas,new.astype(float)))))
   if err>0.0002:raise ValueError('Atlas sampled base-level colors changed beyond float UV tolerance')
   errors.append(err);p['_atlasUv']=new
 return {'atlasResolution':[width,height],'atlasPngSha256':hashlib.sha256(raw).hexdigest(),'groups':proof,'maxVertexBilinearRgbaError':max(errors,default=0),'newMaterial':newmid,'limitation':'Full-resolution pixels and base-level bilinear samples verified; distant mip blending/transparent ordering require rendered acceptance.'}

def one(row,control,metadata):
 key=control['originalModelKey'];d=OUT/key;d.mkdir();(d/'original').mkdir();(d/'converted').mkdir();(d/'control').mkdir()
 original=REPO/'content'/control['sourceGlbPath'];bounded=Path(control['runtime'])/'body.glb'
 assert sha(original)==control['sourceSha256'] and sha(bounded)==control['sha256']
 shutil.copy2(original,d/'original/source.glb');shutil.copy2(bounded,d/'original/bounds-v1.glb');shutil.copy2(REPO/'content/models'/f'{key}.json',d/'original/model.json');shutil.copy2(Path(control['runtime'])/'bounds-repair.json',d/'original/bounds-repair.json')
 sid=key[5:].split('-')[0];archive=Path('/Users/Takuro/GGD-assets/models')/(sid+'.zip');archiveInfo=None
 if archive.is_file():
  shutil.copy2(archive,d/'original/source.zip')
  with zipfile.ZipFile(archive)as z:
   assert z.testzip() is None
   archiveInfo={'sourcePath':str(archive),'copy':'original/source.zip','bytes':archive.stat().st_size,'sha256':sha(archive),'zipCrc':'passed','entries':[{'path':i.filename,'bytes':i.file_size,'crc32':f'{i.CRC:08x}'}for i in z.infolist()]}
 put(d/'control/source.json',{'sourceId':row['sourceId'],'nativeZip':archiveInfo,'sourceGlb':{'path':str(original),'sha256':sha(original)},'boundsControl':{'path':str(bounded),'sha256':sha(bounded)},'metadata':metadata})
 g,b=h.read_glb(bounded);assert len(g['meshes'])==1 and len(g['skins'])==1;sourceg=copy.deepcopy(g);sourceb=bytes(b)
 doc=json.loads((d/'original/model.json').read_text());needed=set(doc['clipMap'].values());retained=[a for a in g.get('animations',[])if a['name']in needed]
 assert {a['name']for a in retained}==needed
 discarded=[a['name']for a in g['animations']if a['name']not in needed];g['animations']=retained
 prims=copy.deepcopy(g['meshes'][0]['primitives']);normalstats=[]
 # Normalize vertex normals only, not motion channels, weights, rig or tangents.
 seen=set()
 for p in prims:
  assert p.get('mode',4)==4 and not p.get('targets')
  ni=p['attributes'].get('NORMAL')
  if ni is None or ni in seen:continue
  seen.add(ni);norm=h.accessor(g,b,ni).astype(float);length=np.linalg.norm(norm,axis=1);bad=np.abs(length-1)>1e-5
  if not np.any(bad):continue
  zero=length<1e-8;fallback=np.zeros_like(norm)
  if zero.any():
   for q in prims:
    if q['attributes'].get('NORMAL')!=ni:continue
    pos=h.accessor(g,b,q['attributes']['POSITION']).astype(float);ids=h.accessor(g,b,q['indices']).reshape(-1,3);tri=np.cross(pos[ids[:,1]]-pos[ids[:,0]],pos[ids[:,2]]-pos[ids[:,0]])
    for col in range(3):np.add.at(fallback,ids[:,col],tri)
   norm[zero]=fallback[zero];length=np.linalg.norm(norm,axis=1);unresolved=length<1e-8;norm[unresolved]=[0,1,0];length[unresolved]=1
  else:unresolved=np.zeros(len(norm),bool)
  norm[bad]/=length[bad,None];norm=norm.astype('<f4');a=g['accessors'][ni];v=g['bufferViews'][a['bufferView']];assert a['componentType']==5126 and a['type']=='VEC3'
  off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
  for i in np.flatnonzero(bad):b[off+i*stride:off+i*stride+12]=norm[i].tobytes()
  if 'min'in a:a['min']=norm.min(axis=0).tolist()
  if 'max'in a:a['max']=norm.max(axis=0).tolist()
  normalstats.append({'accessor':ni,'normalizedNormals':int(bad.sum()),'zeroNormalsRebuiltFromFaces':int(zero.sum()),'unresolvedDegenerateNormalsSetUp':int(unresolved.sum())})
 canonical={};rep={}
 for i,m in enumerate(g['materials']):rep[i]=canonical.setdefault(material_key(m),i)
 groups=collections.defaultdict(list)
 for pi,p in enumerate(prims):p['_representative']=rep[p['material']];groups[p['_representative']].append(pi)
 atlas=pack_atlas(g,b,prims,groups,d/'converted')if len(groups)>5 else None
 outputprims=[];geom=[]
 for mid,pids in groups.items():
  arrays=collections.defaultdict(list);indices=[];count=0
  for pi in pids:
   p=prims[pi];attrs={k:h.accessor(g,b,i)for k,i in p['attributes'].items()};assert set(attrs)=={'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}
   if '_atlasUv'in p:attrs['TEXCOORD_0']=p['_atlasUv']
   ids=h.accessor(g,b,p['indices']).reshape(-1);indices.append(ids.astype(np.uint32)+count);n=len(attrs['POSITION'])
   geom.append({'sourcePrimitive':pi,'outputPrimitive':len(outputprims),'outputVertexStart':count,'vertices':n,'sourceMaterial':p['material'],'outputMaterial':mid,'triangles':len(ids)//3})
   for k,a in attrs.items():arrays[k].append(a)
   count+=n
  attrs={}
  for k,items in arrays.items():
   a=np.concatenate(items);component=g['accessors'][prims[pids[0]]['attributes'][k]]['componentType'];attrs[k]=h.add_accessor(g,b,a,{'POSITION':'VEC3','NORMAL':'VEC3','TEXCOORD_0':'VEC2','JOINTS_0':'VEC4','WEIGHTS_0':'VEC4'}[k],component,bounds=k=='POSITION',target=34962)
  outputprims.append({'attributes':attrs,'indices':h.add_accessor(g,b,np.concatenate(indices),'SCALAR',5125,target=34963),'material':mid,'mode':4,'extras':{'ggdSourcePrimitives':[{'index':pi,'material':prims[pi]['material'],'extras':prims[pi].get('extras')}for pi in pids]}})
 g['meshes'][0]['primitives']=outputprims
 # Evidence: all retained native samples/channels and inverse binds remain byte exact.
 clipProof=[]
 for a in retained:
  old=next(x for x in sourceg['animations']if x['name']==a['name']);assert old==a;hashes=[]
  for s in a['samplers']:
   for key2 in ['input','output']:
    before=h.accessor(sourceg,sourceb,s[key2]);after=h.accessor(g,b,s[key2]);assert np.array_equal(before,after);hashes.append(hashlib.sha256(before.tobytes()).hexdigest())
  times=np.concatenate([h.accessor(g,b,s['input']).reshape(-1)for s in a['samplers']]);clipProof.append({'name':a['name'],'channels':len(a['channels']),'samplers':len(a['samplers']),'start':float(times.min()),'end':float(times.max()),'duration':float(times.max()-times.min()),'samplerAccessorSha256':hashes,'allSampleBytesAndChannelsUnchanged':True})
 assert sourceg['nodes']==g['nodes'] and sourceg['skins']==g['skins']
 for skin in g['skins']:assert np.array_equal(h.accessor(sourceg,sourceb,skin['inverseBindMatrices']),h.accessor(g,b,skin['inverseBindMatrices']))
 target=d/'converted/body.glb';h.write_glb(g,b,target)
 report={'schema':'ggd-ou99-standardization@2','sourceId':row['sourceId'],'modelKey':key,'sourceGlbSha256':sha(original),'boundsV1Sha256':sha(bounded),'outputSha256':sha(target),'retainedNativeClips':clipProof,'removedFromRuntimeOnly':discarded,'sourceClipCount':len(sourceg['animations']),'runtimeClipCount':len(retained),'normalRepairs':normalstats,'geometryMap':geom,'triangles':sum(x['triangles']for x in geom),'drawPrimitivesBefore':len(prims),'drawPrimitivesAfter':len(outputprims),'atlas':atlas,'nodeHierarchySkinsAndInverseBindsUnchanged':True,'positionsJointsWeightsUnchanged':True,'originalImageBytesRetained':True,'materialEquivalence':'name and W3X original material ordinal ignored for semantic grouping; blend/filter/alpha/double-sided settings preserved','limitations':['Merged transparent primitives can alter per-primitive depth-sort granularity; no triangles or alpha pixels discarded.','Only existing clipMap-referenced native clips are in runtime; all source clips retained in original/source.glb.','No animation channel was removed or resampled.']}
 put(d/'control/standardization.json',report)
 prep={'schema':'ggd-library-model-preparation@1','asset':row['sourceId'],'source':{'path':str(original),'bytes':original.stat().st_size,'sha256':sha(original)},'output':{'path':str(target),'bytes':target.stat().st_size,'sha256':sha(target)},'stateClips':doc['clipMap'],'yawOffsetDeg':doc.get('yawOffsetDeg',0),'nativeAnimation':True,'nativeClipProof':'../control/standardization.json','limitations':report['limitations']}
 put(d/'converted/preparation.receipt.json',prep)
 return {**row,'status':'conversion-ready','sourceModelKey':key,'modelKey':key+'-standard-v2','directory':str(d),'runtime':str(d/'runtime'),'clipMap':doc['clipMap'],'normalRepairCount':sum(x['normalizedNormals']for x in normalstats),'drawPrimitives':len(outputprims),'atlas':atlas is not None,'originalClipCount':len(sourceg['animations']),'retainedClipCount':len(retained)}

def main():
 OUT.mkdir(exist_ok=False);(OUT/'tools').mkdir();shutil.copy2(__file__,OUT/'tools'/Path(__file__).name);shutil.copy2('/private/tmp/ggd-procedural-six-state.py',OUT/'tools/ggd-glb-io-helper.py')
 inspection=json.loads(Path('/private/tmp/ggd-workflow-backend-inspection.json').read_text());controls=json.loads((W/'outputs/priority-ou99-standards-20260910/manifest.json').read_text());by={r['modelKey']:r for r in controls};metadata=json.loads((REPO/'materials/ou99-access/ou99-acquired.json').read_text())['sources'];results=[]
 put(OUT/'inspection-input.json',inspection)
 for row in inspection['results']:
  if row['status']!='blocked':continue
  meta=next((m for m in metadata if m['id']=='ou99-'+row['sourceId'].split(':')[1]),None)
  try:r=one(row,by[row['modelKey']],meta)
  except Exception as e:r={**row,'status':'conversion-blocked','error':repr(e)}
  results.append(r);print(json.dumps({k:r[k]for k in ['modelKey','status','drawPrimitives','atlas','normalRepairCount','error']if k in r}),flush=True)
 put(OUT/'conversion-manifest.json',{'schema':'ggd-ou99-conversion-manifest@2','localRoot':str(OUT),'sourceCommit':inspection['sourceCommit'],'models':results})
if __name__=='__main__':main()
