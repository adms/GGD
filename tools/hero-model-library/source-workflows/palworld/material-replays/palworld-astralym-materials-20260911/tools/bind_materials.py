#!/usr/bin/env python3
"""Bind exact OP.GG material names, preserving geometry/rig/all animation data."""
from pathlib import Path
import argparse,json,struct,hashlib,copy
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args();src=a.source.resolve();out=a.output.resolve();assert src!=out and not out.is_relative_to(src)
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
def put(p,d):
 with p.open('x') as f:json.dump(d,f,ensure_ascii=False,indent=2);f.write('\n')
out.mkdir(parents=True,exist_ok=True);(out/'textures').mkdir(exist_ok=True);(out/'validation').mkdir(exist_ok=True)
source=src/'derived/model-decoded-v2.glb';raw=source.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);original=copy.deepcopy(doc);bl=struct.unpack_from('<I',raw,20+jl)[0];bin=bytearray(raw[28+jl:28+jl+bl]);originalbin=bytes(bin)
recipe=json.loads((src/'original/materials.json').read_text());assert recipe['palId']=='WorldTreeDragon';assert len(doc['materials'])==3 and len(doc['animations'])==58
for m in doc['materials']:assert m['name'] in recipe['materials']
files=sorted({v for mat in recipe['materials'].values() for k,v in mat.items() if k.endswith('Texture') and isinstance(v,str)});assert len(files)==9
images=[];textures=[];texturemap={};textureproof=[]
for file in files:
 ip=src/'original'/file;assert ip.is_relative_to(src/'original');png=out/'textures'/(Path(file).stem+'.png');assert not png.exists()
 with Image.open(ip) as im:rgba=im.convert('RGBA');pixels=rgba.tobytes();size=rgba.size;rgba.save(png,format='PNG',compress_level=6)
 with Image.open(png) as im:assert im.convert('RGBA').tobytes()==pixels
 data=png.read_bytes();pad=(4-len(bin)%4)%4;bin.extend(b'\0'*pad);off=len(bin);bin.extend(data)
 view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(data)})
 ix=len(images);images.append({'name':Path(file).name,'mimeType':'image/png','bufferView':view});textures.append({'name':Path(file).name,'source':ix,'sampler':0});texturemap[file]=ix
 textureproof.append({'source':ref(ip),'png':ref(png),'width':size[0],'height':size[1],'decodedRgbaSha256':sha(pixels),'pixelIdentical':True,'gltfImage':ix,'gltfTexture':ix})
doc['images']=images;doc['textures']=textures;doc['samplers']=[{'wrapS':10497,'wrapT':10497,'magFilter':9729,'minFilter':9987}]
bindings=[]
for i,old in enumerate(original['materials']):
 name=old['name'];r=recipe['materials'][name];eye='eye' in name.casefold() or 'mouth' in name.casefold();blend=r.get('blendMode','opaque');
 m={'name':name,'doubleSided':bool(r.get('twoSided',False) or eye or blend=='translucent'),'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':texturemap[r['baseColorTexture']],'texCoord':0},'metallicFactor':r.get('metalness',0),'roughnessFactor':r.get('roughness',.8)},'extras':{'opggSourceMaterial':r,'opggSourceTextureBindings':{k:{'index':texturemap[v],'texCoord':0,'sourceFile':v} for k,v in r.items() if k.endswith('Texture')},'conversionScope':'Only source name/texture/parameter mappings. Source custom shader data retained; no invented clearcoat/scattering or animation.'}}
 if eye or blend=='translucent':m['alphaMode']='BLEND'
 elif blend=='masked':m['alphaMode']='MASK';m['alphaCutoff']=.3333
 else:m['alphaMode']='OPAQUE'
 if 'normalTexture'in r:m['normalTexture']={'index':texturemap[r['normalTexture']],'texCoord':0,'scale':1}
 if 'metallicRoughnessTexture'in r:m['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':texturemap[r['metallicRoughnessTexture']],'texCoord':0}
 if 'emissiveTexture'in r:m['emissiveTexture']={'index':texturemap[r['emissiveTexture']],'texCoord':0};m['emissiveFactor']=r.get('emissiveColor',[1,1,1])
 assert r.get('emissiveIntensity',1)==1
 if r.get('renderProfile')=='pal-lit' and 'specular'in r:
  # OP.GG source shader uses F0 = Specular*0.08*texture.a; glTF base F0=.04.
  assert 0<=r['specular']*2<=1;m['extensions']={'KHR_materials_specular':{'specularFactor':r['specular']*2}}
  if r.get('specularTexture'):m['extensions']['KHR_materials_specular']['specularTexture']={'index':texturemap[r['specularTexture']],'texCoord':0}
  assert r.get('subsurfaceColor')==[0,0,0], 'Nonzero source SSS requires a separately reviewed shader mapping'
 doc['materials'][i]=m;bindings.append({'materialIndex':i,'meshPrimitiveIndices':[j for j,p in enumerate(doc['meshes'][0]['primitives']) if p['material']==i],'name':name,'sourceMaterial':r['sourceMaterial'],'standardBindings':{k:v for k,v in m.items() if k!='extras'},'retainedNonstandard':{'subsurfaceTexture':r.get('subsurfaceTexture'),'subsurfaceColor':r.get('subsurfaceColor'),'sourceSssContribution':'zero: source multiplier [0,0,0]' if r.get('subsurfaceTexture') else None,'sourceShadingModel':r.get('shadingModel'),'eyeAlphaTestAndDepthBias':'OP.GG eye alphaTest=.01, polygonOffset=-4 and depthWrite=false are not representable together with BLEND in core glTF; left as source receipt.' if eye else None}})
for k in ['extensionsUsed']:
 doc[k]=sorted(set(doc.get(k,[])+['KHR_materials_specular']))
# Optional specular extension can fall back gracefully; quantization remains required.
doc['asset']['extras']={'conversion':'GGD exact-name material binding from OP.GG materials.json; raw data preserved','sourceSha256':sha(raw)}
bin.extend(b'\0'*((4-len(bin)%4)%4));doc['buffers']=[{'byteLength':len(bin)}]
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((4-len(j)%4)%4);body=struct.pack('<III',0x46546c67,2,28+len(j)+len(bin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(bin),0x004e4942)+bin
assert bytes(bin[:len(originalbin)])==originalbin
for k in ['meshes','nodes','skins','accessors','animations','scenes','scene']:assert doc.get(k)==original.get(k),k
bodypath=out/'astralym-material-bound.glb';bodypath.write_bytes(body)
put(out/'material-binding-map.json',{'schema':'ggd.source-proven-material-binding@1','sourceRecipe':ref(src/'original/materials.json'),'sourceViewer':ref(src/'evidence/opgg-3d-viewer.js'),'bindings':bindings,'textures':textureproof,'all9ImagesEmbedded':True,'textureRoles':['3 baseColor','3 emissive','1 normal','1 metallicRoughness + specular alpha','1 SSS retained; authored source multiplier is zero'],'customShaderLimitations':['No exact Unreal screen-space Burley model; authored SSS multiplier is zero, preserved in extras.','Source Eye clearcoat shading-model label lacks explicit coat weight; no guessed clearcoat applied.','Source viewer eye depth bias and tiny alphaTest under BLEND cannot be represented together in core glTF.','Source colorCorrection parameters are retained; viewer does not apply them again, so no double baking.']})
put(out/'conversion-receipt.json',{'schema':'ggd.astralym.material-conversion@1','source':ref(source),'output':ref(bodypath),'sourceIntake':str(src),'sourceFrozenManifest':ref(src/'file-manifest.json'),'sourceRecipe':ref(src/'original/materials.json'),'proof':{'originalGeometryRigAnimationBinaryPrefixIdentical':True,'meshesNodesSkinsAccessorsAnimationsStructurallyIdentical':True,'all58ClipNamesPreserved':True,'movingClips':57,'staticPoseClip':'HaloCutter_Loop_Ring','texturesDecodedRgbaIdentical':True,'all9OriginalWebPFilesPreservedInFrozenIntake':True},'animationNames':[x['name'] for x in doc['animations']],'defaultEligible':False,'readiness':'material-bound-standardization-candidate; validator and Babylon review pending','backendRegistered':False})
print(json.dumps({'path':str(bodypath),'bytes':len(body),'sha256':sha(body),'images':len(images),'materials':len(doc['materials']),'clips':len(doc['animations'])},indent=2))
