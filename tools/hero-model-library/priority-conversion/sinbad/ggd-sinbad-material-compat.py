#!/usr/bin/env python3
import hashlib,importlib.util,json,shutil
from pathlib import Path
spec=importlib.util.spec_from_file_location('helper','/private/tmp/ggd-procedural-six-state.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
root=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/sinbad-baal-runtime-option-20260910')
source=root/'converted/compacted.glb';g,b=h.read_glb(source);changes=[]
for i,m in enumerate(g['materials']):
    e=m.get('extensions',{});ior=e.get('KHR_materials_ior');sp=e.get('KHR_materials_specular')
    assert ior=={'ior':1} and sp['specularColorFactor']==[0,0,0] and sp['specularFactor']==1
    e.pop('KHR_materials_ior');sp['specularFactor']=0
    changes.append({'material':i,'removed':{'KHR_materials_ior':ior},'specularFactor':{'before':1,'after':0},'reason':'GGD upload subset excludes KHR_materials_ior; source IOR 1 has no dielectric reflection. Disable specular with supported KHR_materials_specular; original material kept unchanged in original and compacted GLBs.'})
g['extensionsUsed']=[e for e in g['extensionsUsed'] if e!='KHR_materials_ior']
if 'extensionsRequired'in g:g['extensionsRequired']=[e for e in g['extensionsRequired'] if e!='KHR_materials_ior']
target=root/'converted/upload-compatible.glb';assert not target.exists();sha=h.write_glb(g,b,target)
report={'schema':'ggd-sinbad-upload-material-compatibility@1','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':str(target),'outputSha256':sha,'changes':changes,'binaryPayloadUnchanged':True,'limitation':'Material adaptation is explicit. Final in-game lighting acceptance remains pending.'}
(root/'control/material-compatibility.json').write_text(json.dumps(report,indent=2)+'\n')
shutil.copy2(__file__,root/'tools'/Path(__file__).name)
h.build(target,root/'control/procedural-config.json',root/'procedural-v2')
