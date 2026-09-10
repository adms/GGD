#!/usr/bin/env python3
"""Local immutable Sinbad Baal source copy and material-preserving GLB compaction."""
import collections,copy,hashlib,importlib.util,json,shutil,sys,zipfile
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('ggd_fallback','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
workspace=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT')
source=workspace/'GGD-Asset-Library/intake/public-models-20260910/tmr-sinbad-baal'
out=workspace/'GGD-Asset-Library/intake/public-models-20260910/sinbad-baal-runtime-option-20260910'
out.mkdir(exist_ok=False);(out/'tools').mkdir();(out/'control').mkdir();(out/'converted').mkdir()
shutil.copytree(source,out/'original')
for p in ['/private/tmp/ggd-procedural-six-state.py','/private/tmp/ggd-prepare-sinbad-baal.py']:shutil.copy2(p,out/'tools'/Path(p).name)
with zipfile.ZipFile(out/'original/source.zip') as z:
    assert z.testzip() is None
    ziprows=[{'path':i.filename,'bytes':i.file_size,'crc32':format(i.CRC,'08x')} for i in z.infolist()]
(out/'control/zip-integrity.json').write_text(json.dumps({'crc':'passed','entries':ziprows},indent=2)+'\n')
original=out/'original/converted-collada/body.glb';g,b=h.read_glb(original)
assert not g.get('animations') and len(g['skins'])==1
render=[i for i,n in enumerate(g['nodes']) if 'mesh'in n]
assert render==list(range(52,66))
groups=collections.defaultdict(list);geometry=[]
for ni in render:
    node=g['nodes'][ni];assert node['skin']==0 and np.max(np.abs(h.node_matrix(node)-np.eye(4)))<1e-7
    for p in g['meshes'][node['mesh']]['primitives']:
        assert not p.get('targets') and p.get('mode',4)==4
        assert set(p['attributes'])=={'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}
        attrs={key:h.accessor(g,b,ai) for key,ai in p['attributes'].items()};ids=h.accessor(g,b,p['indices']).reshape(-1)
        groups[p['material']].append((attrs,ids))
        geometry.append({'node':ni,'name':node['name'],'material':p['material'],'vertices':len(attrs['POSITION']),'triangles':len(ids)//3})
primitives=[];proof=[]
for mat,parts in sorted(groups.items()):
    keys=parts[0][0].keys();merged={k:np.concatenate([p[0][k] for p in parts]) for k in keys};indices=[];offset=0
    for attrs,ids in parts:
        for k in keys:assert np.array_equal(merged[k][offset:offset+len(attrs[k])],attrs[k])
        indices.append(ids.astype(np.uint32)+offset);offset+=len(attrs['POSITION'])
    ids=np.concatenate(indices);ai={}
    for k,a in merged.items():ai[k]=h.add_accessor(g,b,a,{'POSITION':'VEC3','NORMAL':'VEC3','TEXCOORD_0':'VEC2','JOINTS_0':'VEC4','WEIGHTS_0':'VEC4'}[k],5123 if k=='JOINTS_0' else 5126,bounds=k=='POSITION',target=34962)
    p={'attributes':ai,'indices':h.add_accessor(g,b,ids,'SCALAR',5125,target=34963),'material':mat,'mode':4};primitives.append(p)
    proof.append({'material':mat,'sourcePrimitives':len(parts),'vertices':offset,'triangles':len(ids)//3,'allVertexAttributesByteEquivalent':True,'indicesOnlyRebased':True})
original_skins=copy.deepcopy(g['skins']);original_materials=copy.deepcopy(g['materials'])
g['meshes']=[{'name':'Sinbad Baal complete source geometry grouped by identical material','primitives':primitives}]
for i in render:g['nodes'][i].pop('mesh',None);g['nodes'][i].pop('skin',None)
g['nodes'][52].update(mesh=0,skin=0,name='Sinbad Baal preserved full skinned renderer')
# Root placement conforms to skinning: the skin's world-space joint matrices and
# inverse bind matrices determine vertex positions; renderer transforms cancel.
for n in g['nodes']:
    if 'children'in n:n['children']=[c for c in n['children'] if c not in render]
g['scenes'][g.get('scene',0)]['nodes'].append(52)
assert g['skins']==original_skins and g['materials']==original_materials
compacted=out/'converted/compacted.glb';sha=h.write_glb(g,b,compacted)
images=[]
for image in g['images']:
    v=g['bufferViews'][image['bufferView']];raw=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    images.append({'name':image.get('name'),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
report={'schema':'ggd-sinbad-material-compaction@1','source':str(original),'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'output':str(compacted),'outputSha256':sha,'originalGeometry':geometry,'materialGroups':proof,'trianglesBefore':sum(r['triangles'] for r in geometry),'trianglesAfter':sum(r['triangles'] for r in proof),'drawPrimitivesBefore':len(geometry),'drawPrimitivesAfter':len(primitives),'weightedJoints':len(g['skins'][0]['joints']),'nativeAnimationCount':0,'skinsInverseBindsMaterialsAndTexturesPreserved':True,'embeddedImages':images,'rendererPlacement':'Identity renderer moved to scene root; joint world matrices and inverse binds unchanged.','limitation':'CPU runtime pose sampling and visual acceptance are separate checks.'}
(out/'control/compaction.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
config={'asset':'tmr-sinbad-baal','bones':{'pelvis':'Armature_pelvis','spine':'Armature_spine','head':'Armature_head','upperArmL':'Armature_biceps_L','upperArmR':'Armature_biceps_R','forearmL':'Armature_forearm_L','forearmR':'Armature_forearm_R','thighL':'Armature_thigh_L','thighR':'Armature_thigh_R','shinL':'Armature_shin_L','shinR':'Armature_shin_R'},'basePoseDegrees':{'Armature_biceps_L':[0,0,-65],'Armature_biceps_R':[0,0,-65]},'roleSigns':{'thighR':[-1,1,1],'shinR':[-1,1,1],'upperArmR':[-1,1,1]},'unitsPerMeter':10,'yawOffsetDeg':0}
(out/'control/procedural-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
h.build(compacted,out/'control/procedural-config.json',out/'procedural-v1')
print(out)
