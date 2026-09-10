#!/usr/bin/env python3
"""Reconcile already delivered main models without changing the frozen S3 release.

Uses local tracked model documents/GLBs plus the other workflow's source and
wiring ledgers. Does not infer identity from a matching filename.
"""
import argparse, hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'materials/hero-model-library'
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--main-commit',required=True)
 a=p.parse_args()
 original=read(OUT/'manifest.json'); prior={h['id']:h for h in original['heroes']}
 inventory={h['id']:h for h in read(OUT/'inventory.json')['heroes']}
 aliases={f'example:{n}':f'lol-{n}' for n in ['karthus','leesin','lux','missfortune','warwick','xerath','yasuo']}
 source=ROOT/'materials/ou99-access'; acquired=read(source/'ou99-acquired.json')['sources']
 model_paths={d['id']:p for p in (ROOT/'content/models').glob('*.json') if not p.name.startswith('_') for d in [read(p)]}
 standards={x['originalModelKey']:x for x in read(OUT/'workflow-standardization.json')['entries']} if (OUT/'workflow-standardization.json').exists() else {}
 candidates=[];models={};heroes={}
 def option(hero_id,sid,key,label,kind,tier,selection_class,reference,source_character,source_work,identity):
  if hero_id not in prior: return
  runtime_id=aliases.get(hero_id,hero_id)
  original_key=key; original_path=model_paths[key]; original_doc=read(original_path); original_glb=ROOT/'content'/original_doc['glbPath']
  standard=standards.get(key)
  if standard:key=standard['modelKey']
  model_path=model_paths[key];doc=read(model_path);glb=ROOT/'content'/doc['glbPath'];assert glb.is_file(),glb
  m=dict(id=sid,modelKey=key,glbPath=doc['glbPath'],sha256=sha(glb),bytes=glb.stat().st_size,
      documentSha256=sha(model_path),sourceCharacter=source_character,sourceWork=source_work,
      sourceAssetId=reference,clipMap=doc['clipMap'],limitations=['動作來源及共用片段以來源清單和 clipMap 為準；不代表六段獨立原生動作。'],
      validation='backend-prepare-passed' if standard else 'published-main-source; backend import assessed separately',fullCharacterPackage=False,
      storage='git',gitPath='content/'+doc['glbPath'],sourceCommit=a.main_commit,identityStatus=identity,
      originalDelivery=dict(modelKey=original_key,glbPath=original_doc['glbPath'],sha256=sha(original_glb),gitPath='content/'+original_doc['glbPath']),
      boundsRepaired=bool(standard))
  if standard:
   m['standardization']={k:standard[k] for k in ['geometryLod','textureLod','nativeAnimationChannelsTargetsAndTimeValuesUnchanged','visualAcceptance'] if k in standard}
   if standard.get('geometryLod'):m['limitations'].append('可用副本已減面；完整原生高面數模型與動作仍保留。')
   if standard.get('textureLod'):m['limitations'].append('可用副本貼圖已縮至模型预算；完整原圖仍保留。')
  if sid in models: assert models[sid]==m
  models[sid]=m
  h=heroes.setdefault(hero_id,dict(id=hero_id,runtimeHeroId=runtime_id,name=prior[hero_id]['name'],options=[],pending=[]))
  h['options'].append(dict(sourceId=sid,sourceModelKey=key,label=label,source=dict(kind=kind,tier=tier,
     selectionClass=selection_class,library='ou99' if sid.startswith('ou99:') else 'lol',character=source_character,work=source_work,reference=reference)))
  candidates.append(dict(candidateId=sid,heroId=hero_id,runtimeHeroId=runtime_id,modelKey=key,identityStatus=identity,sourceReference=reference,gitPath=m['gitPath'],sha256=m['sha256']))
 for s in acquired:
  key='ou99.'+s['id'].removeprefix('ou99-');sid='ou99:'+s['id'].removeprefix('ou99-')
  if key not in model_paths: raise ValueError('Missing delivered model '+key)
  assert sha(ROOT/'content'/read(model_paths[key])['glbPath'])==s['sha256']
  for hid in s['heroIds']:
   option(hid,sid,key,s['ou99Title']+'（論壇相似模型）','style-proxy','w3x','similar-proxy',s['threadUrl'],s['ou99Title'],'來源作品待核；論壇標題：'+s['ou99Title'],s['identityStatus'])
 for s in read(source/'wiring-ledger-prio8.json')['wired']:
  hid=s['heroId'];ref='https://www.ou99.com/thread-'+s['threadId']+'-1-1.html'
  option(hid,'ou99:'+s['threadId'],s['newModelKey'],s['name']+'（論壇模型）','exact','w3x','community-mod',ref,s['char'],inventory[hid]['work'],'character-labelled-by-delivering-workflow')
 for old,runtime in aliases.items():
  c=read(OUT/'current-production.json')['champions'][runtime];name=c['name']
  option(old,'lol:'+old.split(':')[1],c['modelKey'],name+'（LOL 原生模型）','exact','original','canonical-game',f'content/champions/{runtime}.json',name,'英雄聯盟 League of Legends','native-game-character')
 result=dict(schema='ggd-workflow-model-options@1',sourceCommit=a.main_commit,aliases=aliases,models=list(models.values()),heroes=list(heroes.values()),
   candidates=candidates,scope='Other workflow delivered models retained as independent candidates; original immutable S3 release unchanged. Backend readiness and current website are separate records.')
 (OUT/'workflow-model-options.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(dict(models=len(models),heroMappings=len(heroes),options=len(candidates))))
if __name__=='__main__':main()
