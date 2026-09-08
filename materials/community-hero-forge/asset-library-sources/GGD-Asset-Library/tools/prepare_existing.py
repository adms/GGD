"""Refresh intake inventory and stage existing GGD VFX with complete dependencies."""
import json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;WORKSPACE=ROOT.parent
REPO=(ROOT/json.loads((ROOT/'policy.json').read_text())['contract_repo']).resolve()
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
legacy=WORKSPACE/'outputs/asset-library-registry-20260907'
reasons={
 '300heroes':['JUMPX/EG3D 尚未轉成含骨架的 GLB','原生動作尚未完成六狀態綁定','原生特效尚未轉為 GGD VFX'],
 'mba':['需完成比例、朝向與六狀態動作對應','原生特效尚未轉為 GGD VFX','需完成角色特效事件綁定'],
 'lol':['受擊仍替代為待機，需真實受擊動作','尚無完整角色特效與事件綁定'],
 'community37':['目前使用 GGD 代理造型與動作','角色專屬模型與特效尚未整包驗證']}
chars=[]
for c in read(legacy/'characters.json'):
 r=dict(c,status='pending_standardization',candidate_readiness=c['readiness'],remaining=reasons[c['library']]);r.pop('readiness')
 if c.get('base_model_present')==False:r['remaining']=['原生模型仍缺件']+r['remaining']
 if c.get('readiness')=='native_model_conversion_failed':r['remaining']=['原生模型已取得但 GLB 轉換失敗']+r['remaining']
 chars.append(r)
write(ROOT/'intake/catalog.json',dict(schema='ggd-resource-intake@1',notice='候選與原始資料，禁止視為正式入庫',source_registry=str(legacy/'catalog.json'),entries=chars))
write(ROOT/'intake/sources.json',dict(source_roots=read(legacy/'catalog.json')['libraries'],historical_registry=str(legacy),refresh_command='python3 tools/prepare_existing.py'))
ids=set();recipes=WORKSPACE/'GGD社群英雄上傳內容_37名/recipes'
for p in recipes.glob('*.json'):
 for s in read(p)['slots']:
  for seg in (s.get('vfx',{}).get('script') or {}).get('segments',[]):
   if seg.get('vfxId'):ids.add(seg['vfxId'])
bundle=ROOT/'staging/ggd-vfx-community37';content=bundle/'content';content.mkdir(parents=True,exist_ok=True)
for ident in sorted(ids):
 src=REPO/'content/vfx'/(ident+'.json');doc=read(src);dest=content/'vfx'/src.name;dest.parent.mkdir(exist_ok=True);shutil.copyfile(src,dest)
 if doc.get('texture'):
  src=REPO/'content'/doc['texture'];dest=content/doc['texture'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
write(bundle/'resource.json',dict(id='ggd.vfx.community37',title='GGD 社群英雄使用的標準特效元件',kind='vfx-library',
 provenance={'source':'GGD authored primitive VFX; used by the 37-hero workflow','repo':str(REPO),'not_game_rips':True},
 vfx=['vfx/'+i+'.json' for i in sorted(ids)]))
print(json.dumps({'intake_characters':len(chars),'staged_vfx':len(ids)},ensure_ascii=False))
