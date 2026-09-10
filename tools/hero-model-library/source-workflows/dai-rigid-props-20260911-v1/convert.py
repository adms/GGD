#!/usr/bin/env python3
"""Convert only the two frozen Dai DSON rigid sword props, never a character body.

DSON 0.6.1: centimeters, right-handed Y-up; UV overrides address source vertex IDs.
Fails closed on unsupported geometry, missing dependencies, material transforms,
transparency/refraction, source transforms, or a changed original archive.
"""
import argparse, collections, gzip, hashlib, io, json, math, pathlib, shutil, struct, sys, urllib.parse
import numpy as np
from PIL import Image
import PIL

SOURCE_ID='patreon-shinteo-dai-daz-v2'
ZIP_SHA='b2f64413b3abe50773bc57b08ff19f7dbf28d76257801edd13524f9e0cb44434'
PROPS=[('handheld','People/@Cosplay/Dragon Quest/The Adventure of Dai/Dai/Jump Force/Weapon/Sword of Dai.duf'),('back','People/@Cosplay/Dragon Quest/The Adventure of Dai/Dai/Jump Force/Outfit/Papnican Clothes/Sword of Dai Back.duf')]
DOCS=['https://docs.daz3d.com/public/dson_spec/format_description/units_coordinate_systems/start','https://docs.daz3d.com/public/dson_spec/object_definitions/geometry/start','https://docs.daz3d.com/public/dson_spec/object_definitions/polygon/start','https://docs.daz3d.com/public/dson_spec/object_definitions/uv_set/start']
def sha(b):return hashlib.sha256(b).hexdigest()
def meta(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
def dump(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def dson(p):
 b=p.read_bytes();return json.loads(gzip.decompress(b) if b[:2]==b'\x1f\x8b' else b)
def vec(channels,default):return np.array([next((c.get('current_value',c.get('value',default)) for c in channels if c['id']==ax),default) for ax in ['x','y','z']],dtype=np.float64)
def channel_dict(m):return {c['channel']['id']:c['channel'] for x in m.get('extra',[]) for c in x.get('channels',[])}
def value(c):return c.get('current_value',c.get('value'))

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--output',type=pathlib.Path,required=True);a=ap.parse_args()
 source=a.source.resolve();out=a.output.resolve();assert sha((source/'original/Dai V2.zip').read_bytes())==ZIP_SHA
 out.mkdir(parents=True,exist_ok=False)
 for n in ['raw','intermediate','evidence']: (out/n).mkdir()
 # The whole acquired original package remains reproducibly available in this conversion.
 shutil.copy2(source/'original/Dai V2.zip',out/'raw/Dai V2.zip')
 root=source/'extracted';inputs={};reports=[]
 def source_file(ref):
  part=urllib.parse.unquote(ref.split('#')[0]).lstrip('/');p=(root/part).resolve();assert p.is_relative_to(root) and p.is_file(),part
  if part not in inputs:
   dest=out/'raw/extracted'/part;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert p.read_bytes()==dest.read_bytes();inputs[part]=dict(meta(p),rawCopy=str(dest))
  return p
 for prop,entry in PROPS:
  propout=out/'intermediate'/prop;propout.mkdir();duf=dson(source_file(entry));scene=duf['scene'];assert len(scene['nodes'])==1
  sn=scene['nodes'][0];gp=source_file(sn['geometries'][0]['url']);dsf=dson(gp);assert 'modifier_library' not in dsf and len(dsf['geometry_library'])==1 and len(dsf['node_library'])==1
  g=dsf['geometry_library'][0];native_node=dsf['node_library'][0];assert native_node['type']=='node'
  for attr,default in [('translation',0),('rotation',0),('orientation',0),('scale',1)]:assert np.all(vec(native_node.get(attr,[]),default)==default),(prop,attr)
  assert value(native_node['general_scale'])==1
  verts=np.asarray(g['vertices']['values'],np.float64);assert len(verts)==g['vertices']['count'] and np.isfinite(verts).all()
  pivot=vec(native_node['center_point'],0);positions=(verts-pivot)*.01
  uvdoc=dson(source_file(g['default_uv_set']))['uv_set_library'][0];assert uvdoc['vertex_count']==len(verts)
  uvs=np.asarray(uvdoc['uvs']['values'],np.float64);assert len(uvs)==uvdoc['uvs']['count'] and np.isfinite(uvs).all();uvs[:,1]=1-uvs[:,1]
  polys=g['polylist']['values'];assert len(polys)==g['polylist']['count'];assert all(len(p)==5 for p in polys),'Only the frozen triangular source topology supported'
  faces=np.asarray([p[2:] for p in polys],int);assert faces.min()>=0 and faces.max()<len(verts)
  overrides={}
  for fi,vi,ui in uvdoc.get('polygon_vertex_indices',[]):
   assert 0<=fi<len(faces) and vi in faces[fi] and 0<=ui<len(uvs);assert (fi,vi) not in overrides;overrides[fi,vi]=ui
  fn=np.cross(positions[faces[:,1]]-positions[faces[:,0]],positions[faces[:,2]]-positions[faces[:,0]])
  lengths=np.linalg.norm(fn,axis=1);assert np.all(lengths>1e-14),'Degenerate source face requires explicit repair';unit_fn=fn/lengths[:,None]
  incident=collections.defaultdict(list)
  for fi,face in enumerate(faces):
   for vi in face:incident[int(vi)].append(fi)
  doc={'asset':{'version':'2.0','generator':'GGD bounded DSON rigid prop converter v1'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Dai '+prop+' sword — standalone prop','mesh':0}],'meshes':[{'name':'Dai '+prop+' sword','primitives':[]}],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'materials':[],'extensionsUsed':['KHR_materials_specular'],'extras':{'sourceId':SOURCE_ID,'assetRole':'independent-weapon-component','nativeAnimationCount':0,'notACharacterBody':True}}
  binary=bytearray();texture_cache={};mapping=[]
  def blob(b,target=None):
   binary.extend(b'\0'*((-len(binary))%4));v={'buffer':0,'byteOffset':len(binary),'byteLength':len(b)}
   if target:v['target']=target
   doc['bufferViews'].append(v);binary.extend(b);return len(doc['bufferViews'])-1
  def accessor(ar,typ):
   ar=np.asarray(ar,dtype='<f4');assert np.isfinite(ar).all();idx=blob(ar.tobytes(),34962);ac={'bufferView':idx,'componentType':5126,'count':len(ar),'type':typ}
   if typ=='VEC3':ac.update(min=ar.min(0).astype(float).tolist(),max=ar.max(0).astype(float).tolist())
   doc['accessors'].append(ac);return len(doc['accessors'])-1
  def texture(b,name,mime):
   key=sha(b)
   if key in texture_cache:return texture_cache[key]
   im=Image.open(io.BytesIO(b));im.load();idx=blob(b);doc['images'].append({'name':name,'bufferView':idx,'mimeType':mime});doc['textures'].append({'source':len(doc['images'])-1,'sampler':0});tid=len(doc['textures'])-1;texture_cache[key]=tid
   ext='.png' if mime=='image/png' else '.jpg';(propout/(name+ext)).write_bytes(b);return tid
  material_lookup={m['id']:m for m in duf['material_library']}
  groups=g['polygon_material_groups']['values']
  assert len(groups)==2
  for mi,group in enumerate(groups):
   sm=next(m for m in scene['materials'] if m['groups']==[group]);base=material_lookup[urllib.parse.unquote(sm['url'][1:])];ch=channel_dict(base);ch.update(channel_dict(sm))
   assert value(ch['Cutout Opacity'])==1 and value(ch['Refraction Weight'])==0 and value(ch['Translucency Weight'])==0
   assert value(ch['Horizontal Tiles'])==value(ch['Vertical Tiles'])==1 and value(ch['Horizontal Offset'])==value(ch['Vertical Offset'])==0
   diff=sm['diffuse']['channel'];color=value(diff);basep=source_file(diff['image_file']);mp=source_file(ch['Metallic Weight']['image_file']);rp=source_file(ch['Glossy Roughness']['image_file']);np_=source_file(ch['Normal Map']['image_file'])
   metal=np.asarray(Image.open(mp).convert('RGB'));rough=np.asarray(Image.open(rp).convert('RGB'));assert metal.shape==rough.shape and np.all(metal[:,:,0]==metal[:,:,1]) and np.all(metal[:,:,0]==metal[:,:,2]) and np.all(rough[:,:,0]==rough[:,:,1]) and np.all(rough[:,:,0]==rough[:,:,2]),'Ambiguous colored scalar map'
   packed=np.stack([np.full_like(metal[:,:,0],255),rough[:,:,0],metal[:,:,0]],axis=2);buf=io.BytesIO();Image.fromarray(packed).save(buf,format='PNG',compress_level=9)
   baseid=texture(basep.read_bytes(),f'm{mi}-base','image/jpeg');mrid=texture(buf.getvalue(),f'm{mi}-metallic-roughness','image/png');nid=texture(np_.read_bytes(),f'm{mi}-normal','image/jpeg')
   mat={'name':group,'pbrMetallicRoughness':{'baseColorFactor':color+[1],'baseColorTexture':{'index':baseid},'metallicFactor':value(ch['Metallic Weight']),'roughnessFactor':value(ch['Glossy Roughness']),'metallicRoughnessTexture':{'index':mrid}},'normalTexture':{'index':nid,'scale':value(ch['Normal Map'])},'alphaMode':'OPAQUE','doubleSided':False,'extensions':{'KHR_materials_specular':{'specularFactor':value(ch['Glossy Layered Weight'])}}}
   if ch['Glossy Layered Weight'].get('image_file'):
    sp=source_file(ch['Glossy Layered Weight']['image_file']);sim=Image.open(sp).convert('L');rgba=Image.new('RGBA',sim.size,(255,255,255,255));rgba.putalpha(sim);sbuf=io.BytesIO();rgba.save(sbuf,format='PNG',compress_level=9);sid=texture(sbuf.getvalue(),f'm{mi}-specular','image/png');mat['extensions']['KHR_materials_specular']['specularTexture']={'index':sid}
   doc['materials'].append(mat)
   smooth=value(ch['Smooth On']);angle=float(value(ch['Smooth Angle']));cosine=math.cos(math.radians(angle));pp=[];nn=[];tt=[];tex=[];errors=[]
   for fi,face in enumerate(faces):
    if polys[fi][1]!=mi:continue
    fuv=np.array([uvs[overrides.get((fi,int(vi)),int(vi))] for vi in face]);dp1=positions[face[1]]-positions[face[0]];dp2=positions[face[2]]-positions[face[0]];du1=fuv[1]-fuv[0];du2=fuv[2]-fuv[0];det=du1[0]*du2[1]-du1[1]*du2[0]
    for corner,vi in enumerate(face):
     valid=[j for j in incident[int(vi)] if unit_fn[j]@unit_fn[fi]>=cosine-1e-12] if smooth else [fi];normal=fn[valid].sum(0);normal/=np.linalg.norm(normal)
     if abs(det)>1e-12:
      tangent=(dp1*du2[1]-dp2*du1[1])/det;bitangent=(dp2*du1[0]-dp1*du2[0])/det;tangent-=normal*(normal@tangent)
     else:
      errors.append(fi);axis=np.array([1.,0,0]) if abs(normal[0])<.9 else np.array([0.,1,0]);tangent=axis-normal*(axis@normal);bitangent=np.cross(normal,tangent)
     if np.linalg.norm(tangent)<1e-12:raise ValueError('Invalid tangent')
     tangent/=np.linalg.norm(tangent);handedness=-1 if np.dot(np.cross(normal,tangent),bitangent)<0 else 1
     pp.append(positions[vi]);nn.append(normal);tex.append(fuv[corner]);tt.append([*tangent,handedness])
   assert not errors,'Degenerate UV triangle requires explicit normal-map decision'
   prim={'attributes':{'POSITION':accessor(pp,'VEC3'),'NORMAL':accessor(nn,'VEC3'),'TEXCOORD_0':accessor(tex,'VEC2'),'TANGENT':accessor(tt,'VEC4')},'material':mi,'mode':4};doc['meshes'][0]['primitives'].append(prim)
   mapping.append({'sourceMaterialGroup':group,'sourceSceneMaterial':sm,'sourceBaseMaterial':base,'outputMaterial':mat,'polygonCount':len(pp)//3,'normalGeneration':{'method':'area-weighted source-vertex adjacency, source Smooth Angle threshold; UV seam duplication preserves vertex normals','sourceSmooth':smooth,'angleDegrees':angle},'sourceTextures':[meta(x) for x in [basep,mp,rp,np_]],'scalarPacking':'source grayscale metallic into B, roughness into G, R=255; no gloss-to-rough inversion because source channel is Glossy Roughness','uvPolicy':'u unchanged; v=1-v for glTF texture coordinate origin; REPEAT preserves tiled source coordinates; per-face source-vertex UV overrides honored'})
  doc['buffers'][0]['byteLength']=len(binary);rawj=json.dumps(doc,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode();rawj+=b' '*((-len(rawj))%4);binary+=b'\0'*((-len(binary))%4);b=struct.pack('<III',0x46546c67,2,28+len(rawj)+len(binary))+struct.pack('<II',len(rawj),0x4e4f534a)+rawj+struct.pack('<II',len(binary),0x004e4942)+binary
  glb=propout/'source-materials.glb';glb.write_bytes(b)
  report={'prop':prop,'assetRole':'independent-weapon-component','sourceEntry':str(source/ 'extracted'/entry),'sourceGeometry':meta(gp),'sourceVertexCount':len(verts),'sourceTriangleCount':len(faces),'outputTriangleCount':sum(x['polygonCount'] for x in mapping),'uvOverrideCount':len(overrides),'sourceCenterPointCm':pivot.tolist(),'sourceBoundsCm':{'min':verts.min(0).tolist(),'max':verts.max(0).tolist()},'outputBoundsMeters':{'min':positions.min(0).tolist(),'max':positions.max(0).tolist()},'conversion':'outputPosition=(sourcePosition-sourceNodeCenterPoint)*0.01; right-handed Y-up unchanged; no arbitrary hero scaling; no game attachment placement','retainedScenePlacementForFutureAttachment':sn,'sourceNativeNode':native_node,'materials':mapping,'output':meta(glb),'skins':0,'animations':0,'defaultEligible':False,'heroRegistrationPerformed':False,'materialParity':'Portable PBR approximation, not a Daz Iray renderer parity claim. Source layered gloss is mapped to supported KHR_materials_specular factor. Tangent-space normal parity needs a Daz source render comparison.','limitations':['No source explicit normals; area-weighted angle-threshold normals reconstructed.','Native source textures exceed current GGD 256px cap; this stage is intermediate only, run normalize_validate.mts.','No complete Dai body, bones, native animation or attachment fit is supplied.','Body/scene attachment transforms are retained as evidence but deliberately not applied without their external parent.']}
  dump(propout/'conversion.json',report);reports.append(report)
 dump(out/'evidence/source-inputs.json',{'sourceId':SOURCE_ID,'sourceArchive':meta(source/'original/Dai V2.zip'),'inputFiles':list(inputs.values())})
 dump(out/'evidence/conversion.json',{'schema':'ggd.dai-rigid-props-conversion@1','python':sys.version,'numpy':np.__version__,'pillow':PIL.__version__,'converter':meta(pathlib.Path(__file__).resolve()),'officialFormatReferences':DOCS,'props':[{'prop':x['prop'],'output':x['output'],'triangles':x['outputTriangleCount'],'uvOverrides':x['uvOverrideCount']} for x in reports],'fullBodyModels':0,'backendRegistration':False,'visualAcceptance':False})
 print(json.dumps({'output':str(out),'props':[{k:r[k] for k in ['prop','sourceVertexCount','sourceTriangleCount','outputTriangleCount','uvOverrideCount','outputBoundsMeters']} for r in reports]},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
