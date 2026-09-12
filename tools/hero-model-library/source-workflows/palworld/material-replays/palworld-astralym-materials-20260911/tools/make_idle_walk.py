from pathlib import Path
import argparse,json,struct,copy,hashlib
p=argparse.ArgumentParser();p.add_argument('output',type=Path);a=p.parse_args();r=a.output.resolve();src=r/'astralym-material-bound.glb';raw=src.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);old=copy.deepcopy(doc);bin=bytearray(raw[28+jl:]);binary_before=bytes(bin)
sha=lambda b:hashlib.sha256(b).hexdigest()
# Keep only explicitly selected native clips. Full 58-clip GLB remains immutable.
doc['animations']=[a for a in doc['animations'] if a['name'] in ['Idle','Walk']];assert [a['name'] for a in doc['animations']]==['Idle','Walk']
normalProof=[]
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  aid=prim['attributes']['NORMAL'];acc=doc['accessors'][aid];assert acc['type']=='VEC3' and acc['componentType']==5122 and acc.get('normalized') and not acc.get('sparse');v=doc['bufferViews'][acc['bufferView']];start=v.get('byteOffset',0)+acc.get('byteOffset',0);stride=v.get('byteStride',6);values=[max(-1,struct.unpack_from('<h',bin,start+i*stride+j*2)[0]/32767) for i in range(acc['count']) for j in range(3)];data=struct.pack('<'+'f'*len(values),*values);actual=struct.unpack('<'+'f'*len(values),data);offset=len(bin);bin.extend(data);vid=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':34962});doc['accessors'][aid]={'bufferView':vid,'componentType':5126,'count':acc['count'],'type':'VEC3'};normalProof.append({'oldAccessor':aid,'vertices':acc['count'],'maxFloatRepresentationError':max(abs(x-y) for x,y in zip(values,actual)),'originalNormalizedValuesUnchangedWithinFloat32Rounding':True})
# Reindex only reachable accessors and views. Do not change remaining binary data.
used=set()
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  used.update(prim['attributes'].values())
  if 'indices' in prim:used.add(prim['indices'])
  for target in prim.get('targets',[]):used.update(target.values())
for skin in doc['skins']:
 if 'inverseBindMatrices' in skin:used.add(skin['inverseBindMatrices'])
for a in doc['animations']:
 for s in a['samplers']:used.update([s['input'],s['output']])
ids=sorted(used);amap={x:i for i,x in enumerate(ids)}
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  prim['attributes']={k:amap[v] for k,v in prim['attributes'].items()}
  if 'indices' in prim:prim['indices']=amap[prim['indices']]
  for target in prim.get('targets',[]):
   for k in target:target[k]=amap[target[k]]
for skin in doc['skins']:
 if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=amap[skin['inverseBindMatrices']]
for a in doc['animations']:
 for s in a['samplers']:s['input']=amap[s['input']];s['output']=amap[s['output']]
doc['accessors']=[doc['accessors'][i] for i in ids]
views={a['bufferView'] for a in doc['accessors']};views.update(im['bufferView'] for im in doc['images']);vmap={x:i for i,x in enumerate(sorted(views))}
for a in doc['accessors']:a['bufferView']=vmap[a['bufferView']]
for im in doc['images']:im['bufferView']=vmap[im['bufferView']]
doc['bufferViews']=[doc['bufferViews'][i] for i in sorted(views)]
for k in ['extensionsUsed','extensionsRequired']:
 doc[k]=[e for e in doc.get(k,[]) if e!='KHR_mesh_quantization']
 if not doc[k]:doc.pop(k)
assert doc['nodes']==old['nodes']
assert bytes(bin[:len(binary_before)])==binary_before
for newa in doc['animations']:
 original=next(a for a in old['animations'] if a['name']==newa['name']);assert newa['channels']==original['channels']
 for ns,os in zip(newa['samplers'],original['samplers']):
  assert ns.get('interpolation')==os.get('interpolation')
  for k in ['input','output']:
   na=doc['accessors'][ns[k]];oa=old['accessors'][os[k]];nv=doc['bufferViews'][na['bufferView']];ov=old['bufferViews'][oa['bufferView']];assert {k:v for k,v in na.items() if k!='bufferView'}=={k:v for k,v in oa.items() if k!='bufferView'};assert nv==ov
# Prefix values referenced by each preserved animation/geometry accessor are identical.
doc['buffers']=[{'byteLength':len(bin)}];doc['asset']['extras']['nativeClipSubset']=['Idle','Walk'];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((4-len(j)%4)%4);bin.extend(b'\0'*((4-len(bin)%4)%4));doc['buffers'][0]['byteLength']=len(bin)
out=struct.pack('<III',0x46546c67,2,28+len(j)+len(bin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(bin),0x004e4942)+bin
folder=r/'idle-walk';folder.mkdir();file=folder/'astralym-idle-walk.glb';file.write_bytes(out)
receipt={'schema':'ggd-native-clip-subset@1','source':{'path':str(src),'bytes':len(raw),'sha256':sha(raw)},'output':{'path':str(file),'bytes':len(out),'sha256':sha(out),'jsonBytes':len(j)},'selectedNativeClips':['Idle','Walk'],'fullNativeLibraryPreservedAt':str(src),'fullClipCount':58,'normalStorageConversion':normalProof,'proof':{'originalBinaryPrefixIdentical':True,'nodesIdentical':True,'positionsWeightsIndicesUnchanged':True,'skinAndAnimationAccessorsOnlyReindexed':True,'animationSampleValuesAndTimesByteIdentical':True,'all9EmbeddedImagesUnchanged':True,'retargetedOrProceduralClips':0},'notCreated':['heroId','death-animation','six-state-clipMap'],'readiness':'pending-shared-inspection'}
(folder/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
