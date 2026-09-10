import collections,hashlib,importlib.util,io,json,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');REPO=W/'GGD-hero-model-options';OUT=W/'outputs/priority-ou99-residual-geometry-audit-20260910'
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
h=load('h','/private/tmp/ggd-procedural-six-state.py');census=load('census',REPO/'tools/model-census/gore_geoset.py')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for key,pi,hero in [('ou99.458777-standard-v3',0,'凱亞爾'),('ou99.474258-standard',3,'楓'),('ou99.495015-standard',2,'羽賀')]:
 doc=REPO/'content/models'/f'{key}.json';d=json.loads(doc.read_text());p=REPO/'content'/d['glbPath'];g,b=h.read_glb(p);out=OUT/key;out.mkdir();parents={c:i for i,n in enumerate(g['nodes'])for c in n.get('children',[])};prims=[]
 for i,prim in enumerate(g['meshes'][0]['primitives']):
  a=prim['attributes'];pos=h.accessor(g,b,a['POSITION']);j=h.accessor(g,b,a['JOINTS_0']);w=h.accessor(g,b,a['WEIGHTS_0']);weights=collections.defaultdict(float)
  for js,ws in zip(j,w):
   for jj,ww in zip(js,ws):
    if ww>1e-6:weights[int(jj)]+=float(ww)
  influence=[]
  for ji,total in sorted(weights.items(),key=lambda x:-x[1]):
   ni=g['skins'][0]['joints'][ji];chain=[];cur=ni
   while cur in parents:chain.append({'index':cur,'name':g['nodes'][cur].get('name')});cur=parents[cur]
   chain.append({'index':cur,'name':g['nodes'][cur].get('name')});influence.append({'jointIndex':ji,'node':ni,'name':g['nodes'][ni].get('name'),'weightShare':total/len(pos),'ancestorChain':chain})
  mat=g['materials'][prim['material']];prims.append({'primitive':i,'vertices':len(pos),'triangles':len(h.accessor(g,b,prim['indices']).reshape(-1))//3,'bbox':[pos.min(axis=0).tolist(),pos.max(axis=0).tolist()],'materialIndex':prim['material'],'material':mat,'extras':prim.get('extras'),'influences':influence})
  if i==pi:
   ti=mat.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')
   if ti is not None:
    im=g['images'][g['textures'][ti]['source']];view=g['bufferViews'][im['bufferView']];start=view.get('byteOffset',0);raw=bytes(b[start:start+view['byteLength']]);(out/'suspect-material-original-image.png').write_bytes(raw)
 sourceid=key.split('.')[1].split('-')[0];archive=Path('/Users/Takuro/GGD-assets/models')/(sourceid+'.zip');arc=None
 if archive.exists():
  with zipfile.ZipFile(archive)as z:
   arc={'path':str(archive),'sha256':sha(archive),'entries':[{'name':i.filename,'bytes':i.file_size,'crc32':f'{i.CRC:08x}'}for i in z.infolist()]}
 r={'originalModelKey':key,'targetName':hero,'suspectPrimitive':pi,'glb':str(p),'sha256':sha(p),'modelDocument':str(doc),'modelDocumentSha256':sha(doc),'clipMap':d['clipMap'],'skinCount':len(g['skins']),'gltfExtras':g.get('extras'),'nodeCount':len(g['nodes']),'primitives':prims,'census':census.census_one(str(p)),'nativeArchive':arc,'allAnimationNames':[a['name']for a in g.get('animations',[])]};(out/'structure.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');rows.append(r)
 print(json.dumps({'model':key,'census':r['census'],'prim':{k:prims[pi][k]for k in ['vertices','triangles','bbox','materialIndex','extras']},'topJoints':[(j['name'],round(j['weightShare'],3),j['ancestorChain'][-3:])for j in prims[pi]['influences'][:8]],'archive':arc['entries']if arc else None,'extras':list(g.get('extras',{}))},ensure_ascii=False))
(OUT/'input-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
