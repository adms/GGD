#!/usr/bin/env python3
"""Verify the eight named acquired heroes and register only the complete Ryu fallback."""
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'materials/hero-model-library/priority-evidence/eight-missing-models-v1'
MODEL_ID='community.body.02b6e37dfb4f8a061e3244a48707a55a43c91d95c83f99c7'
RYU_SHA='c932402930880da55b3f79c1bdc47b955e9a3f048e46a74800bd39f5d9698b8c'
ROWS=[
 ('acquired-zero','Zero',['ssbu-zero-c00-static-skinned-v1'],0,'static-model-ready-actions-missing'),
 ('acquired-ram','拉姆',['rezero-ram-thunderstore-0.1.1-static-skinned-v1'],0,'static-model-ready-actions-missing'),
 ('acquired-beatrice','碧翠絲',['rezero-beatrice-thunderstore-0.1.1-static-skinned-v1'],0,'static-model-ready-actions-missing'),
 ('acquired-mario','Mario',['ssbu-mario-c00-static-skinned-v1','ssbu-mario-c00-static-skinned-v2','ssbu-mario-c00-ultimate14-motion-v1'],5,'native-mod-special-clips-incomplete'),
 ('acquired-mewtwo','Mewtwo',['ssbu-mewtwo-c00-static-skinned-v1'],0,'static-model-ready-actions-missing'),
 ('acquired-pokemon-trainer','Pokémon Trainer',['ssbu-ptrainer-male-c00-static-skinned-v1','ssbu-ptrainer-female-c01-static-skinned-v1'],0,'two-static-model-options-ready-actions-missing'),
 ('acquired-ryu','Ryu',['ssbu-ryu-c00-static-skinned-v1','ssbu-ryu-c00-procedural-six-state-decimated-v1'],6,'registered-non-default-procedural-six-state-option-current-policy-pass'),
 ('acquired-minecraft','Steve／Alex',['ssbu-pickel-steve-c00-static-skinned-v1','ssbu-pickel-alex-c01-static-skinned-v1'],0,'two-static-model-options-ready-actions-missing'),
]

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def pin(rel):
 p=ROOT/rel
 if not p.is_file(): raise ValueError('missing Git evidence: '+rel)
 return {'gitPath':rel,'bytes':p.stat().st_size,'sha256':sha(p)}
def glb_animations(p):
 raw=p.read_bytes(); assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
 n,t=struct.unpack_from('<II',raw,12); assert t==0x4e4f534a
 doc=json.loads(raw[20:20+n].decode().rstrip(' \0'))
 return [a.get('name','') for a in doc.get('animations',[])]
def component_map():
 data=json.loads((ROOT/'materials/asset-library/current-resources.json').read_text())
 return {r['id']:r for r in data['modelComponents']}
def render():
 components=component_map(); heroes=[]
 for hero_id,name,ids,motions,status in ROWS:
  found=[]
  for cid in ids:
   c=components.get(cid)
   if not c: raise ValueError('central component missing: '+cid)
   f=pin(c['gitPath'])
   if f['sha256']!=c['sha256'] or f['bytes']!=c['bytes']: raise ValueError('component Git pin differs: '+cid)
   found.append({'componentId':cid,'gitPath':f['gitPath'],'bytes':f['bytes'],'sha256':f['sha256'],'readiness':c['readiness'],'nativeAnimationCount':c.get('nativeAnimationCount',0),'proceduralAnimationCount':c.get('proceduralAnimationCount',0)})
  heroes.append({'heroId':hero_id,'name':name,'existingHeroForgeRecipe':True,'components':found,'sourceOrProceduralMotionCount':motions,'status':status,'runtimeDropdownRegistered':hero_id=='acquired-ryu','productionDeploymentVerified':False})
 model_rel=f'content/assets/models/community/{RYU_SHA}.glb'; model=pin(model_rel)
 names=glb_animations(ROOT/model_rel); expected=['GGD_procedural_'+x for x in ('idle','run','attack','cast','hurt','death')]
 if names!=expected: raise ValueError('Ryu procedural clip contract changed')
 doc_rel=f'content/models/{MODEL_ID}.json'; doc=pin(doc_rel)
 source=(ROOT/'packages/shared/src/content/heroForge/communityAcquired.ts').read_text()
 expected_option=f'"acquired-ryu": ["imported.herokyo", "{MODEL_ID}"]'
 if expected_option not in source: raise ValueError('Ryu option/default relationship changed')
 return {'schema':'ggd.eight-missing-models-audit@1','generatedFromGitTree':True,'summary':{'heroes':8,'acceptedIndependentComponents':sum(len(x[2]) for x in ROWS),'heroesWithAnySourceOrProceduralMotion':2,'newlyRegisteredNonDefaultOptions':1,'productionDeployed':0},'heroes':heroes,'registration':{'componentId':'ssbu-ryu-c00-procedural-six-state-v1','heroId':'acquired-ryu','modelKey':MODEL_ID,'label':'Ryu SSBU c00（GGD 程序化六狀態）','isDefault':False,'motionProvenance':'ggd-procedural-fallback-not-native-or-retargeted','modelGlb':model,'modelDocument':doc,'runtimeSelectable':True,'productionDeploymentVerified':False},'boundaries':['Mario 的 5 段 d01special* 是 Ultimate14 社群 MOD 原生特殊動作，未核准映射為 idle/run/attack/cast/hurt/death。','Zero、拉姆、碧翠絲、Mewtwo、Pokémon Trainer、Steve/Alex 的模型、貼圖及骨架已驗收，但來源沒有可用完整動作。','Ryu 六段為 GGD 程序化備援，明確不宣稱 SSBU 或 Street Fighter 原生動作。','本收據證明 Git 分支上的模型選項，不證明 Main 合併、正式站部署或正式站切換。']}

def payload(v): return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); a=ap.parse_args()
 audit=render(); registration={'schema':'ggd.eight-missing-model-option-registration@1','registrations':[audit['registration']],'blocked':[{'heroId':h['heroId'],'componentId':c['componentId'],'reason':h['status']} for h in audit['heroes'] if h['heroId']!='acquired-ryu' for c in h['components']]}
 outputs={OUT/'audit.json':payload(audit),OUT/'registration.json':payload(registration)}
 for p,b in outputs.items():
  if a.write: p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(b)
  elif not p.is_file() or p.read_bytes()!=b: raise ValueError('stale output: '+str(p.relative_to(ROOT)))
 print(json.dumps({'heroes':8,'components':audit['summary']['acceptedIndependentComponents'],'registered':1,'written':a.write},ensure_ascii=False))
if __name__=='__main__': main()
