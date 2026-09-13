from pathlib import Path
import sys,json,copy,hashlib,struct,shutil
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');base=ROOT/'GGD-Asset-Library/intake/public-models-20260910';dst=base/'parallel-community-slayers-lina-hand-review';src=base/'parallel-community-slayers-tales-of-rays';sys.path.insert(0,str(dst/'scripts'));import glb_io as glb
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
results=[]
for actor in ('lina00','lina01'):
 source=src/'conversion/characters'/(actor+'.glb');g=glb.read(str(source));hands=[(i,n) for i,n in enumerate(g.gltf['nodes']) if 'mesh' in n and n.get('name','').startswith(('HandL','HandR'))];assert len(hands)==8
 for letter in 'abcd':
  j=copy.deepcopy(g.gltf);active=[];inactive=[]
  for i,n in hands:
   if n['name'].startswith(('HandL'+letter,'HandR'+letter)):active.append({'node':i,'name':n['name'],'sourceMesh':n['mesh']})
   else:inactive.append({'node':i,'name':n['name'],'sourceMesh':n['mesh']});j['nodes'][i].pop('mesh')
  assert len(active)==2 and active[0]['name'].startswith('HandL') and active[1]['name'].startswith('HandR')
  meshes=sorted({n['mesh'] for n in j['nodes'] if 'mesh' in n});mm={old:new for new,old in enumerate(meshes)}
  for n in j['nodes']:
   if 'mesh' in n:n['mesh']=mm[n['mesh']]
  j['meshes']=[j['meshes'][i] for i in meshes]
  accessors=set(s['inverseBindMatrices'] for s in j.get('skins',[]));targets={}
  for m in j['meshes']:
   for pr in m['primitives']:
    for ai in pr['attributes'].values():accessors.add(ai);targets[j['accessors'][ai]['bufferView']]=34962
    if 'indices' in pr:accessors.add(pr['indices']);targets[j['accessors'][pr['indices']]['bufferView']]=34963
  amap={old:new for new,old in enumerate(sorted(accessors))}
  for m in j['meshes']:
   for pr in m['primitives']:
    pr['attributes']={k:amap[v] for k,v in pr['attributes'].items()}
    if 'indices' in pr:pr['indices']=amap[pr['indices']]
  for s in j['skins']:s['inverseBindMatrices']=amap[s['inverseBindMatrices']]
  j['accessors']=[j['accessors'][i] for i in sorted(accessors)];views={a['bufferView'] for a in j['accessors']};views.update(i['bufferView'] for i in j['images']);builder=glb.BufferBuilder();vmap={}
  for vi in sorted(views):
   v=g.gltf['bufferViews'][vi];vmap[vi]=builder.add_view(g.view_bytes(vi),targets.get(vi,v.get('target')))
   if 'byteStride'in v:builder.views[-1]['byteStride']=v['byteStride']
  for a in j['accessors']:a['bufferView']=vmap[a['bufferView']]
  for im in j['images']:im['bufferView']=vmap[im['bufferView']]
  j['bufferViews']=builder.views;j['buffers']=[{'byteLength':len(builder.data())}];j['asset']['generator']='GGD explicit hand alternative selection; source attributes/binds unchanged';out=dst/'candidates'/(actor+'-hands-'+letter+'.glb');glb.write(str(out),j,builder.data());again=glb.read(str(out))
  for old,new in amap.items():assert g.accessor_values(old)==again.accessor_values(new)
  assert g.gltf['skins'][0]['joints']==again.gltf['skins'][0]['joints'];assert len([n for n in again.gltf['nodes'] if 'mesh'in n and n.get('name','').startswith('HandL')])==1;assert len([n for n in again.gltf['nodes'] if 'mesh'in n and n.get('name','').startswith('HandR')])==1
  results.append({'id':actor+'-hands-'+letter,'actor':actor,'handVariantLetter':letter,'sourcePath':str(source),'sourceSha256':sha(source),'outputPath':str(out),'outputSha256':sha(out),'bytes':out.stat().st_size,'activeHandNodes':active,'removedHandGeometryNodes':inactive,'allRetainedAccessorsIdentical':True,'sourceSkinJointsAndInverseBindMatricesIdentical':True,'visibleLeftHands':1,'visibleRightHands':1,'nativeAnimationClips':0,'meshes':len(j['meshes']),'primitives':sum(len(m['primitives']) for m in j['meshes']),'triangles':again.triangles(),'joints':len(j['skins'][0]['joints']),'runtimeReady':False})
(dst/'hand-selection-index.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-hand-variants.py',dst/'scripts/ggd-lina-hand-variants.py');print(json.dumps({'variants':len(results),'bytes':sum(x['bytes'] for x in results),'handsPerVariant':'1 left + 1 right','allRetainedAccessorsIdentical':True}))
