from pathlib import Path
import json,struct,hashlib,shutil,subprocess
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT'); REPO=ROOT/'GGD-hero-model-options'; P=ROOT/'GGD-Asset-Library/intake/public-models-20260910/parallel-community-lina-ggd-compatibility'
input=json.loads((P/'evidence/input.json').read_text()); b=Path(input['source']).read_bytes(); n=struct.unpack_from('<I',b,12)[0]; gltf=json.loads(b[20:20+n]); found=[]
def walk(x,ptr='$'):
 if isinstance(x,dict):
  for k,v in x.items():
   if k=='extensions':
    for name,payload in v.items(): found.append({'pointer':ptr+'.extensions.'+name,'name':name,'payload':payload})
   walk(v,ptr+'.'+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):walk(v,ptr+'['+str(i)+']')
walk(gltf)
payloadNames=set(x['name']for x in found)
extensions={'sourceSha256':hashlib.sha256(b).hexdigest(),'extensionsUsed':gltf.get('extensionsUsed',[]),'extensionsRequired':gltf.get('extensionsRequired',[]),'actualExtensionPayloads':found,'declarationOnly':[x for x in gltf.get('extensionsUsed',[])if x not in payloadNames],'futureNormalizationPlan':'Remove declaration-only entries in a distinct derivative only after confirming no referenced payloads. KHR_materials_specular is active on all 3 materials and cannot be called redundant. Evaluate core-PBR material conversion against original actual renders and preserve both before a new upload audit. Do not broaden the parser allowlist or silently discard effective material fields in this audit.','changedSource':False}
(P/'evidence/extension-inventory.json').write_text(json.dumps(extensions,indent=2)+'\n')
refs={
 'packages/shared/src/content/schema/model.ts':[(11,38)],
 'packages/shared/src/content/modelUpload/glb.ts':[(28,41),(65,101)],
 'packages/shared/src/content/modelUpload/budget.ts':[(1,180)],
 'packages/shared/src/content/modelUpload/heroModel.ts':[(1,200)],
 'packages/shared/src/content/modelUpload/inspect.ts':[(1,160)],
 'packages/shared/src/content/schema/championModelVersions.ts':[(1,250)],
 'apps/content-api/src/modelVersions.ts':[(70,165)],
 'apps/admin/src/ui/ChampionModelVersions.tsx':[(26,93)],
 'apps/client/src/render/AssetManager.ts':[(156,195),(240,285)],
 'apps/client/src/render/ClipAnimator.ts':[(90,107),(229,274),(302,335),(445,456),(475,510)],
 'apps/client/src/render/views/ChampionView.ts':[(1531,1560),(1788,1818),(1881,1948)],
 'apps/client/src/render/views/modelSizing.ts':[(1,110)],
 'apps/client/src/render/StorePreview.ts':[(146,205),(267,306)],
 'apps/client/src/render/views/championBody.ts':[(321,355)],
 'apps/client/src/render/CameraRig.ts':[(212,238)]
}
entries=[]
for name,ranges in refs.items():
 p=REPO/name; data=p.read_bytes(); lines=data.decode().splitlines();entries.append({'path':str(p),'repoRelativePath':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'excerpts':[{'start':start,'end':min(end,len(lines)),'lines':[{'number':j,'text':lines[j-1]}for j in range(start,min(end,len(lines))+1)]}for start,end in ranges]})
for name in ['albedo','normal','orm','macro']:
 p=REPO/f'content/assets/textures/ground/stone/{name}.png';data=p.read_bytes();entries.append({'path':str(p),'repoRelativePath':str(p.relative_to(REPO)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'purpose':'Actual GGD ground display dependency, no new acquisition or candidate.'})
head=subprocess.check_output(['git','-C',str(REPO),'rev-parse','HEAD'],text=True).strip();result={'repo':str(REPO),'commitAtFixtureSetup':input['repoCommit'],'commitAtSourceEvidence':head,'exactSourceFiles':entries,'sourceState':'Read-only snapshots of actual modules; central repo may be updated concurrently. Reproduction must match file SHA or report drift.'}
(P/'evidence/project-source-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');shutil.copyfile('/private/tmp/ggd-lina-compat-provenance.py',P/'scripts/ggd-lina-compat-provenance.py');print(json.dumps({'extensions':extensions,'sourceFiles':len(entries),'HEAD':head},ensure_ascii=False,indent=2))
