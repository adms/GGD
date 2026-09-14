"""Patch only active XPS material translations, preserving original GLB BIN prefix."""
import sys
sys.path=[p for p in sys.path if p!='/private/tmp']
from pathlib import Path
import json,struct,io,hashlib,copy,shutil,re
import numpy as np
from PIL import Image

root=Path(sys.argv[1]).resolve(); old=root.parent/'kof-open3dlab-ash-xv'
probe=json.loads((root/'analysis/native-materials.json').read_text())
native={m['name']:m for m in probe['materials']}
group=next(g for g in probe['nodeGroups'] if g['name']=='XPS Shader')
power=next(n for n in group['nodes'] if n['operation']=='POWER')['inputs'][1]['default']
assert power==2.0
config=Path('/private/tmp/ggd-kof-bpy-arm-venv/lib/python3.13/site-packages/bpy/5.2/datafiles/colormanagement/config.ocio')
# Cycles rgb_to_y is the second row of inverse configured XYZ-to-scene-RGB.
xyz_to_rgb=np.array([[3.2409699,-1.5373832,-.4986108],[-.9692436,1.8759675,.0415551],[.0556301,-.2039770,1.0569715]])
weights=np.linalg.inv(xyz_to_rgb)[1]
assert 'scene_linear: Linear Rec.709' in config.read_text()
derived=root/'derived-textures';derived.mkdir(exist_ok=True)
shutil.copy2(config,root/'analysis/blender-config.ocio')
file_map={}
for p in (root/'native-textures').iterdir():
 for im in probe['images']:
  name=im['name']
  if p.name.endswith(name+'.'+p.suffix.lstrip('.')) or p.name.endswith(name):file_map[name]=p
def sha(b):return hashlib.sha256(b).hexdigest()
def read_glb(p):
 b=p.read_bytes();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);off=20+jl;bl=struct.unpack_from('<I',b,off)[0];return j,b[off+8:off+8+bl]
def pixels(path):return np.asarray(Image.open(path).convert('RGBA'))
def to_linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def to_srgb(a):return np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)
def bilinear_repeat(a,w,h):
 # Texel-center sampling, wrap as the original Image Texture REPEAT setting.
 ih,iw=a.shape[:2];xx=(np.arange(w)+.5)*iw/w-.5;yy=(np.arange(h)+.5)*ih/h-.5
 x0=np.floor(xx).astype(int);y0=np.floor(yy).astype(int);fx=(xx-x0)[None,:,None];fy=(yy-y0)[:,None,None]
 rows=a[y0%ih][:,x0%iw]*(1-fx)+a[y0%ih][:,(x0+1)%iw]*fx
 rows2=a[(y0+1)%ih][:,x0%iw]*(1-fx)+a[(y0+1)%ih][:,(x0+1)%iw]*fx
 return rows*(1-fy)+rows2*fy
derived_stats=[]
def base_bake(diffuse,ao):
 p=derived/(diffuse.replace('.tga','')+'-times-lightmap.png')
 if p.exists():return p
 a=pixels(file_map[diffuse]);b=pixels(file_map[ao]);al=to_linear(a[:,:,:3].astype(float)/255);bl=to_linear(b[:,:,:3].astype(float)/255)
 bl=bilinear_repeat(bl,a.shape[1],a.shape[0]);v=np.clip(to_srgb(al*bl),0,1);rgb=np.rint(v*255).astype('uint8');rgba=np.dstack([rgb,a[:,:,3]])
 Image.fromarray(rgba).save(p);derived_stats.append(dict(path=p.relative_to(root).as_posix(),sources=[diffuse,ao],formula='sRGBEncode(sRGBDecode(diffuse) * bilinearRepeat(sRGBDecode(lightmap)))',maxQuantizationError=float(np.max(np.abs(rgb.astype(float)/255-v))),note='Exact graph at output texel centers; spatial interpolation of product is a standard finite-resolution approximation.'))
 return p
def rough_bake(spec):
 p=derived/(spec.replace('.tga','')+'-xps-roughness.png')
 if p.exists():return p
 a=pixels(file_map[spec])[:,:,:3].astype(float)/255;l=a[:,:,0]*weights[0]+a[:,:,1]*weights[1]+a[:,:,2]*weights[2];v=np.clip(1-l**power,0,1);q=np.rint(v*255).astype('uint8');pack=np.stack([np.full_like(q,255),q,np.zeros_like(q)],axis=2);Image.fromarray(pack).save(p)
 derived_stats.append(dict(path=p.relative_to(root).as_posix(),sources=[spec],formula='1 - RGBToBW(specular)^2',weights=weights.tolist(),maxQuantizationError=float(np.max(np.abs(q.astype(float)/255-v))),minimum=float(v.min()),maximum=float(v.max()),note='8-bit linear roughness in G; nonlinear evaluation before texture filtering is a finite-resolution approximation.'))
 return p
results=[]
for variant in ['left-hair','right-hair']:
 src=old/'converted'/variant/'body.glb';j,bin0=read_glb(src);before=copy.deepcopy(j);binary=bytearray(bin0);cache={};changes=[];normal_checks=[]
 def add_texture(p,old_info):
  key=(str(p),j['textures'][old_info['index']].get('sampler'))
  if key not in cache:
   raw=p.read_bytes();binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(raw)
   vi=len(j['bufferViews']);j['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(raw)))
   ii=len(j['images']);j['images'].append(dict(name=p.stem,mimeType='image/png',bufferView=vi))
   ti=len(j['textures']);tex=dict(source=ii)
   if key[1] is not None:tex['sampler']=key[1]
   j['textures'].append(tex);cache[key]=ti
  info=copy.deepcopy(old_info);info['index']=cache[key];return info
 def exported_pixels(texindex):
  im=j['images'][j['textures'][texindex]['source']];v=j['bufferViews'][im['bufferView']];off=v.get('byteOffset',0);return pixels(io.BytesIO(binary[off:off+v['byteLength']]))
 for m in j['materials']:
  nm=native[m['name']];nodes={n['name']:n for n in nm['tree']['nodes']};links=nm['tree']['links'];surface=next(l for l in links if l['toSocket']=='Surface' and nodes[l['toNode']]['type']=='ShaderNodeOutputMaterial')
  active=nodes[surface['fromNode']]
  if active['nodeTree']!='XPS Shader':
   changes.append(dict(material=m['name'],action='unchanged',reason='active Surface is direct Principled; disconnected XPS group ignored'));continue
  inputs={s['name']:s for s in active['inputs']}
  def source_input(name):
   ls=[l for l in links if l['toNode']==active['name'] and l['toSocket']==name]
   if not ls:return inputs[name]['default']
   n=nodes[ls[0]['fromNode']];assert n['image'],(m['name'],name,n['type']);return n['image']
  diff=source_input('Diffuse');light=source_input('Lightmap');spec=source_input('Specular');bump=source_input('Bump Map');env=source_input('Environment');emission=source_input('Emission')
  assert emission[:3]==[0,0,0]
  pbr=m['pbrMetallicRoughness'];rec=dict(material=m['name'],activeShader='XPS Shader',changed=[])
  if isinstance(light,str):
   assert isinstance(diff,str);p=base_bake(diff,light);pbr['baseColorTexture']=add_texture(p,pbr['baseColorTexture']);rec['changed'].append('baked active Diffuse * Lightmap in linear space')
  else:assert light[:3]==[1,1,1]
  if isinstance(spec,str):
   p=rough_bake(spec);pbr['metallicRoughnessTexture']=add_texture(p,pbr['metallicRoughnessTexture']);pbr['roughnessFactor']=1;rec['changed'].append('roughness = 1 - RGBToBW(specular)^2')
  else:
   l=sum(float(spec[i])*float(weights[i]) for i in range(3));pbr['roughnessFactor']=1-l**power;rec['changed'].append('roughness evaluated from original constant Specular')
  m.setdefault('extensions',{})['KHR_materials_ior']={'ior':1.4500000476837158};rec['changed'].append('source Principled IOR 1.45 retained')
  if isinstance(env,str):
   assert m.get('emissiveFactor')==[1,1,1] and 'emissiveTexture' not in m
   m['emissiveFactor']=[0,0,0];rec['changed'].append('removed false constant-white environment emission; true Emission input black')
   rec['unrepresentedSourceTerm']={'image':env,'term':'Reflection-vector TextureEnvironment -> additive Emission','reason':'view-dependent source shader cannot be represented by static glTF core UV emissive texture'}
  if isinstance(bump,str) and 'normalTexture' in m:
   a=exported_pixels(m['normalTexture']['index']);b=pixels(file_map[bump]);normal_checks.append(dict(material=m['name'],sourceImage=bump,pixelEqual=bool(a.shape==b.shape and np.array_equal(a,b)),sourceShape=list(b.shape),exportedShape=list(a.shape),action='preserved original exported normal bytes'))
  changes.append(rec)
 j.setdefault('extensionsUsed',[])
 if 'KHR_materials_ior' not in j['extensionsUsed']:j['extensionsUsed'].append('KHR_materials_ior')
 j['asset']['generator']='GGD Ash material repair v2; source graph translation; geometry BIN prefix retained'
 j['buffers'][0]['byteLength']=len(binary)
 binary.extend(b'\0'*((-len(binary))%4));jb=json.dumps(j,ensure_ascii=False,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4)
 out=root/'converted'/variant;out.mkdir(parents=True,exist_ok=True);dest=out/'body.glb'
 dest.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(jb)+8+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
 j2,b2=read_glb(dest);assert b2[:len(bin0)]==bin0
 immutable_fields=['accessors','meshes','nodes','skins','animations','scenes','scene']
 for field in immutable_fields:assert j2.get(field)==before.get(field),field
 for mi,material in enumerate(before['materials']):
  assert j2['materials'][mi].get('alphaMode')==material.get('alphaMode')
  assert j2['materials'][mi].get('normalTexture')==material.get('normalTexture')
 rec=dict(variant=variant,path=dest.relative_to(root).as_posix(),sha256=sha(dest.read_bytes()),bytes=dest.stat().st_size,upstreamPath=str(src),upstreamSha256=sha(src.read_bytes()),originalBinPrefixUnchanged=True,originalBinPrefixSha256=sha(bin0),unchangedJsonFields=immutable_fields,alphaModesUnchanged=True,normalTextureReferencesUnchanged=True,changes=changes,normalChecks=normal_checks,originalGameplayAnimations=0,ggdRuntimeAccepted=False)
 (out/'material-repair-validation.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');results.append(rec)
report=dict(schema='ggd-ash-material-repair@2',sourceSha256=probe['sourceSha256'],sourcePowerExponent=power,coefficientEvidence=dict(configSha256=sha(config.read_bytes()),matrix=xyz_to_rgb.tolist(),rgbToY=weights.tolist(),method='Second row of inverse of bundled OCIO XYZ D65 to Linear Rec.709 matrix; Cycles source init_xyz_transforms and linear_rgb_to_gray',officialSources=['https://raw.githubusercontent.com/blender/blender/main/intern/cycles/scene/shader.cpp','https://raw.githubusercontent.com/blender/blender/main/intern/cycles/kernel/util/colorspace.h']),initialProbeStatus='Initial noisy EXR coefficient estimates and sqrt audit are superseded; actual POWER input index 1 is 2.0.',derivedTextures=derived_stats,variants=results)
(root/'analysis/material-repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps([dict(variant=x['variant'],sha256=x['sha256'],bytes=x['bytes']) for x in results]))
