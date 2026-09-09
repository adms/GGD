#!/usr/bin/env python3
"""Build a portable, hash-addressed model option release from local conversion receipts."""
import argparse,json,hashlib,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();ws=a.workspace.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=False);repo=Path(__file__).resolve().parents[2]
def read(p):return json.loads(p.read_text())
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
base=ws/'outputs/hero-model-options-20260909';sources={};failures={}
for name in ['native-v2','native-v3','mba-v4','pets-v2','existing-v3','gintoki-v6','alpha-v2','alpha-v3','orientation-v1','maple-v1']:
 for r in read(base/name/'summary.json'):
  if r['stage']=='prepared':sources[r['characterId']]=dict(runtime=Path(r['runtime']),name=r['sourceCharacter'],work=r['sourceWork'])
  elif 'error' in r:failures[r['characterId']]=r['error'].splitlines()[-1]
models={};local={}
def add(key,source):
 if key in models:return key
 runtime=source['runtime'];receipt=read(runtime/'receipt.json');doc=read(runtime/'model.json');body=runtime/'body.glb';digest=sha(body)
 if digest!=receipt['model']['sha256']:raise ValueError('Changed normalized GLB '+key)
 dest=out/doc['glbPath'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(body,dest)
 write(out/'models'/f"{doc['id']}.json",doc)
 prep=receipt.get('preparation',{});native=prep.get('source',{})
 models[key]=dict(id=key,modelKey=doc['id'],glbPath=doc['glbPath'],sha256=digest,bytes=body.stat().st_size,documentSha256=sha(out/'models'/f"{doc['id']}.json"),sourceCharacter=source['name'],sourceWork=source['work'],sourceAssetId=prep.get('asset',key),sourceSha256=native.get('sha256'),clipMap=doc['clipMap'],limitations=prep.get('limitations',[]),validation='shared-upload-and-runtime-motion',fullCharacterPackage=False)
 if len(set(doc['clipMap'].values()))<6:models[key]['limitations'].append('部分狀態共用原生動作，非六段獨立的專屬角色動作。')
 local[key]=str(runtime)
 return key
for key,s in sources.items():add(key,s)
identity=read(repo/'materials/hero-model-library/spider-identity.json')
spider=models['pet:spider']
if spider['sourceSha256']!=identity['model']['sha256']:raise ValueError('Spider identity proof does not match the converted source')
spider.update(sourceCharacter=identity['character']+'（300英雄寵物版）',sourceWork=identity['work'],identityProof='spider-identity.json')
spider['limitations']=[x for x in spider['limitations'] if not x.startswith('Visual proxy only')]+[identity['boundary']]
write(out/'spider-identity.json',identity)
heroes={}
def hero(id,name):return heroes.setdefault(id,dict(id=id,name=name,options=[],pending=[]))
def option(h,key,kind,tier,label=None):
 if key not in models:

  if not any(x['source']==key for x in h['pending']):h['pending'].append(dict(source=key,reason=failures.get(key,'尚未完成可用模型轉換')))
  return
 m=models[key]
 if any(x['sourceId']==key for x in h['options']):return
 h['options'].append(dict(sourceId=key,sourceModelKey=m['modelKey'],label=label or m['sourceCharacter'],source=dict(kind=kind,character=m['sourceCharacter'],work=m['sourceWork'],library=tier,tier=tier,reference=m['sourceAssetId'])))
for path in sorted((repo/'content/champions').glob('*.json')):
 if path.name.startswith('_'):continue
 c=read(path);h=hero(c['id'],c['name']);h['existingModelKey']=c['modelKey'];h['preserveExisting']=True
bindings=read(repo/'tools/community-hero-forge/library-bodies/community37.bindings.json')['entries']
for b in bindings:
 prov=b['provenance'];key='community:'+b['projectId'];d=ws/'outputs/community-hero-asset-integration'/b['directory']
 add(key,dict(runtime=d,name=prov['sourceCharacter'],work=prov['sourceWork']))
 tier='300heroes' if prov['sourceAssetId'].startswith('300heroes:') else 'mba' if prov['sourceAssetId'].startswith('mba:') else 'original'
 option(hero(b['projectId'],b['name']),key,prov['relationship'],tier)
for e in read(ws/'GGD-Asset-Library/intake/existing-hero-upgrades/upgrades.json')['entries']:
 targets=[b['id'] for b in e['old_bindings']]
 if e['hero']=='坂田銀時':targets+=['community-review-23-20260907']
 for target in targets:
  h=hero(target,e['hero'])
  for c in e['new_candidates']:option(h,c['character_id'],'exact','mba' if c['character_id'].startswith('mba:') else '300heroes')
pairs=read(ws/'GGD-Asset-Library/intake/batch2-37/visual-pairs.json')['characters']
for e in pairs:
 h=hero(e['id'],e['name'])
 for c in [e['primary'],*e.get('alternates',[]),*e.get('additional_components',[])]:
  key='300heroes:'+str(int(c['id'])) if c['id'].isdigit() else 'pet:'+c['id']
  if c['id'] in ['cloud','lux','bulbasaur','tram']:
   option(h,'existing:'+c['id'],'exact' if c['id']=='tram' else 'style-proxy','original' if c['id']=='tram' else 'w3x');continue
  option(h,key,'exact' if e['visual_match_status']=='identity_candidate' or (e['id']=='b2-kumoko' and key=='pet:spider') else 'style-proxy','300heroes')
order=['300heroes','mba','original','w3x']
for h in heroes.values():h['options'].sort(key=lambda o:(order.index(o['source']['tier']), ['exact','alternate','style-proxy','previous'].index(o['source']['kind'])))
manifest=dict(schema='ggd-hero-model-library@1',priority=order,policy='300>MBA>原版>借用w3x',models=list(models.values()),heroes=list(heroes.values()),scope='模型與動作綁定選項；不代表完整角色專屬特效、音效或技能驗收。')
manifest['withinTierPolicy']='本尊優先，其次同角色其他形態，再其次視覺代理；同類依清單順序。'
manifest['resolved']=[dict(sourceId=k,character=n,status='converted',removedFromConversionGaps=True,sha256=models[k]['sha256']) for k,n in [('300heroes:137','坂田銀時'),('300heroes:41','海克力斯')]]
manifest['resolved'].append(dict(sourceId='pet:spider',character='蜘蛛子',status='identity-confirmed-pet-form',proof='spider-identity.json',sha256=models['pet:spider']['sha256']))
write(out/'manifest.json',manifest);write(base/'runtime-locations.json',local)
print(json.dumps(dict(models=len(models),heroes=len(heroes),options=sum(len(h['options']) for h in heroes.values()),pending=sum(len(h['pending']) for h in heroes.values())),ensure_ascii=False))
