"""Bind documented OP.GG Jetragon materials without changing native motion/rig.
Usage: ggd-public-model-venv/bin/python -P tools/bind_materials.py
Existing outputs must match byte-for-byte; frozen source intake is read-only.
"""
from pathlib import Path
import json,struct,hashlib,copy,io,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT.parents[1]/'public-models-20260911/parallel-palworld-jetragon'
def digest(b):return hashlib.sha256(b).hexdigest()
def write(p,b):
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==b, f'Immutable output differs: {p}'
 else:p.write_bytes(b)
def save(p,x):write(p,(json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode())
def load(b):
 n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
source=SRC/'decoded/jetragon-quantization-declared.glb';raw=source.read_bytes();original,original_bin=load(raw)
assert digest(raw)=='146be6696634db536dcbeb5481f0f7a775ec602e01800f184f6d08b314253203'
meta=json.loads((SRC/'original/opgg/materials.json').read_text());assert meta['palId']=='JetDragon'
assert [m['name'] for m in original['materials']]==list(meta['materials'])
assert len(original['animations'])==29 and meta['animations']==[a['name'] for a in original['animations']]
write(ROOT/'inputs/source.glb',raw);write(ROOT/'inputs/materials.json',(SRC/'original/opgg/materials.json').read_bytes())
image_keys=sorted({v for m in meta['materials'].values() for k,v in m.items() if k.endswith('Texture') and isinstance(v,str)})
assert len(image_keys)==8
input_images={};image_evidence=[]
for key in image_keys:
 p=SRC/'original/opgg'/key;b=p.read_bytes();write(ROOT/'inputs'/key,b)
 with Image.open(io.BytesIO(b)) as im:
  im.load();im=im.convert('RGBA');input_images[key]=im.copy();stream=io.BytesIO();im.save(stream,format='PNG',compress_level=6);write(ROOT/'textures/source-png'/Path(key).with_suffix('.png').name,stream.getvalue())
  image_evidence.append({'source':key,'sourceSha256':digest(b),'sourceBytes':len(b),'pngDecodedPixelsMatchWebp':True,'rgbaPixelSha256':digest(im.tobytes()),'size':list(im.size)})
materials_evidence=[]
for i,m in enumerate(original['materials']):
 name=m['name'];entry=meta['materials'][name];primitive_ids=[{'mesh':mi,'primitive':pi,'triangles':original['accessors'][p['indices']]['count']//3} for mi,mesh in enumerate(original['meshes']) for pi,p in enumerate(mesh['primitives']) if p['material']==i]
 materials_evidence.append({'materialIndex':i,'name':name,'primitives':primitive_ids,'sourceParameters':entry})
reports=[]
for cap,label in [(None,'native-res'),(256,'256')]:
 g=copy.deepcopy(original);blob=bytearray(original_bin[:original['buffers'][0]['byteLength']]);normal_changes=[]
 def view(data):
  blob.extend(b'\0'*((-len(blob))%4));i=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)});blob.extend(data);return i
 for ai in sorted({p['attributes']['NORMAL'] for m in g['meshes'] for p in m['primitives']}):
  a=g['accessors'][ai];assert a['componentType']==5122 and a['normalized'] and a['type']=='VEC3' and not a.get('sparse')
  v=g['bufferViews'][a['bufferView']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',6)
  q=np.ndarray((a['count'],3),dtype='<i2',buffer=original_bin,offset=start,strides=(stride,2));decoded=np.maximum(q.astype(np.float32)/32767.0,-1.0).astype('<f4')
  old=copy.deepcopy(a);a['bufferView']=view(decoded.tobytes());a.pop('byteOffset',None);a.pop('normalized',None);a['componentType']=5126
  normal_changes.append({'accessor':ai,'old':old,'new':copy.deepcopy(a),'decodedFloat32Sha256':digest(decoded.tobytes()),'maxSemanticDelta':0.0})
 for key in ['extensionsUsed','extensionsRequired']:
  g[key]=[x for x in g.get(key,[]) if x!='KHR_mesh_quantization']
  if not g[key]:g.pop(key)
 g['images']=[];g['textures']=[];g['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
 textures={};processed=[]
 def emit_image(key,im,details):
  im=im.copy();originalSize=list(im.size)
  if cap and max(im.size)>cap:
   scale=cap/max(im.size);im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
  stream=io.BytesIO();im.save(stream,format='PNG',compress_level=6);data=stream.getvalue();p=ROOT/'textures'/label/(Path(key).stem+'.png');write(p,data)
  ix=len(g['images']);g['images'].append({'name':Path(key).stem,'bufferView':view(data),'mimeType':'image/png'});tx=len(g['textures']);g['textures'].append({'source':ix,'sampler':0});textures[key]=tx
  processed.append({'key':key,'textureIndex':tx,'imageIndex':ix,'path':str(p),'bytes':len(data),'sha256':digest(data),'originalSize':originalSize,'outputSize':list(im.size),'rgbaPixelSha256':digest(im.tobytes()),**details})
 for key in image_keys:
  im=input_images[key];extra={'method':'WebP decoded to PNG; pixels unchanged before optional LANCZOS downscale'}
  # Source transparent eye/jewel material discards alpha<.01 as well as blending.
  if key in [meta['materials']['MI_JetDragon_Eye']['baseColorTexture'],meta['materials']['MI_JetDragon_Extra']['baseColorTexture']]:
   ar=np.array(im);mask=(ar[:,:,3]>0)&(ar[:,:,3]/255.0<.01);ar[:,:,3][mask]=0;im=Image.fromarray(ar);extra['sourceDiscardAlphaBelow']=.01;extra['discardedLowAlphaPixels']=int(mask.sum())
  emit_image(key,im,extra)
 spec_key='derived/Jetragon_Body_SpecularColor_sRGB.png';alpha=np.array(input_images[meta['materials']['MI_JetDragon_Body']['specularTexture']])[:,:,3].astype(np.float64)/255
 encoded=np.where(alpha<=.0031308,alpha*12.92,1.055*np.power(alpha,1/2.4)-.055);u8=np.round(np.clip(encoded,0,1)*255).astype(np.uint8);linear=np.where(u8/255<=.04045,(u8/255)/12.92,np.power((u8/255+.055)/1.055,2.4));rgba=np.stack([u8,u8,u8,np.full_like(u8,255)],axis=-1)
 emit_image(spec_key,Image.fromarray(rgba),{'method':'Source MROS alpha linear scalar -> sRGB gray RGB for KHR_materials_specular.specularColorTexture. Source alpha retained separately.','maxLinearRoundtripErrorBeforeDownscale':float(np.max(np.abs(linear-alpha)))})
 new_mats=[]
 for mi,old in enumerate(original['materials']):
  name=old['name'];s=meta['materials'][name];is_face=('eye' in name.lower() or 'mouth' in name.lower());blend=s.get('blendMode','opaque');transparent=is_face or blend=='translucent'
  m={'name':name,'doubleSided':bool(s.get('twoSided') or transparent),'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':textures[s['baseColorTexture']]},'metallicFactor':s.get('metalness',0),'roughnessFactor':s.get('roughness',.8)},'alphaMode':'BLEND' if transparent else ('MASK' if blend=='masked' else 'OPAQUE'),'extras':{'opggSourceMaterial':s,'sourceViewerAlphaTest':.01 if transparent else (.3333 if blend=='masked' else 0),'sourceViewerDepthWrite':not transparent,'sourceViewerPolygonOffset':-4 if is_face else 0,'sourceColorCorrectionApplied':False}}
  if m['alphaMode']=='MASK':m['alphaCutoff']=.3333
  if 'normalTexture' in s:m['normalTexture']={'index':textures[s['normalTexture']],'scale':1}
  if 'metallicRoughnessTexture' in s:m['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':textures[s['metallicRoughnessTexture']]}
  if name=='MI_JetDragon_Body':
   factor=2*s['specular'];m['extensions']={'KHR_materials_specular':{'specularFactor':1,'specularColorFactor':[factor]*3,'specularColorTexture':{'index':textures[spec_key]}}}
   m['extras']['sourceSubsurfaceBinding']={'textureIndex':textures[s['subsurfaceTexture']],'semantic':'source SSS RGB edge-scatter map','renderedByStandardGltf':False,'reason':'OP.GG custom view-dependent indirectDiffuse shader term; no equivalent standard glTF material field. Original map and parameters retained, not misbound to AO/transmission.'}
  if 'emissiveTexture' in s:m['emissiveTexture']={'index':textures[s['emissiveTexture']]}
  emission=s.get('emissiveColor',[0,0,0]);strength=s.get('emissiveIntensity',0)
  m['emissiveFactor']=[float(x)*min(strength,1) for x in emission]
  if strength>1:m.setdefault('extensions',{})['KHR_materials_emissive_strength']={'emissiveStrength':strength}
  new_mats.append(m)
 g['materials']=new_mats;g['extensionsUsed']=['KHR_materials_specular','KHR_materials_emissive_strength']
 g.setdefault('extras',{})['ggdMaterialBinding']={'schema':'ggd.opgg-material-binding@1','sourcePalId':'JetDragon','sourceNativeAnimationEntries':29,'sourceUniqueDecodedAnimationContents':28,'sourceProceduralAnimations':0,'allSourceTexturesRetained':8,'additionalDerivedSpecularTexture':1,'textureCap':cap,'SSSRuntimeSupport':False,'sourceViewerParityLimitations':['View-dependent SSS edge scatter retained as extras, not rendered by standard glTF.','Polygon offset/depthWrite/alpha-to-coverage from source viewer are not glTF core fields.','Unreal clearcoat/colorCorrection metadata were not implemented by the source MeshStandardMaterial viewer; retained without speculative mapping.']}
 assert g['nodes']==original['nodes'] and g['skins']==original['skins'] and g['animations']==original['animations'] and g['meshes']==original['meshes']
 assert bytes(blob[:len(original_bin)])==original_bin
 g['buffers']=[{'byteLength':len(blob)}];js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob.extend(b'\0'*((-len(blob))%4));out=struct.pack('<4sII',b'glTF',2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 path=ROOT/'models'/('jetragon-materials-'+label+'.glb');write(path,out)
 reports.append({'variant':label,'path':str(path),'bytes':len(out),'sha256':digest(out),'sourceBinPreservedAsIdenticalPrefix':True,'nodesSkinsMeshesAnimationsJsonUnchanged':True,'nativeClips':29,'uniqueMotionContents':28,'proceduralClips':0,'boneCount':75,'triangleCount':8468,'originalTextureCount':8,'embeddedPngCount':9,'standardMaterialActiveSourceTextureCount':7,'SSSRetainedInExtras':True,'normalConversions':normal_changes,'textures':processed,'materials':new_mats})
save(ROOT/'evidence/material-mapping.json',{'schema':'ggd.opgg-material-mapping@1','sourceModelSha256':digest(raw),'sourceMaterialsSha256':digest((SRC/'original/opgg/materials.json').read_bytes()),'viewerCodeSha256':'b5af5cb6636397d9a9dd01d3c60c5cbf4f53af6b955848e5bda09471ae82b4dc','viewerCodeEvidence':'evidence/viewer-scripts/3wek8qob4owgm.js','sourceTextures':image_evidence,'mapping':materials_evidence,'specularTranslation':'F0(.04)*specularColorFactor(2*sourceScalar)*linear(gray-from-source-alpha), specularFactor1 retains F90. Alpha to RGB sRGB requires rounding recorded per variant.','normalY':'No flip; viewer normalScale(1,1), flipY false.','variants':reports})
print(json.dumps([{k:r[k] for k in ['variant','path','bytes','sha256','nativeClips','boneCount','embeddedPngCount']} for r in reports],indent=2))
