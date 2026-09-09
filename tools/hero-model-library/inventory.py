import argparse,json,re,hashlib,datetime,subprocess
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--workspace',type=Path,default=repo.parent);args=parser.parse_args();ws=args.workspace.resolve();lib=ws/'GGD-Asset-Library'
def read(p):return json.loads(p.read_text())
context=read(repo/'materials/hero-model-library/inventory-context.json');main=context['main'];prod=context['production'];manifest=read(repo/'materials/hero-model-library/manifest.json');release=read(repo/'materials/hero-model-library/release.json');live=context['live-overlay'];community=context['live-community']
assert not live['docs'] and not live['deleted'] and not community['champions'], 'Live overlay requires explicit merge'
assert len(manifest['heroes'])==len({h['id'] for h in manifest['heroes']})
heroes={h['id']:dict(h) for h in manifest['heroes']};models={m['id']:m for m in manifest['models']};by_key={m['modelKey']:m for m in manifest['models']}
for id,c in main['champions'].items():heroes.setdefault(id,dict(id=id,name=c['name'],options=[],pending=[]))
white=set(prod['whitelist']['champions']);branches={}
for p in (repo/'content/champions').glob('*.json'):
 if not p.name.startswith('_'):branches[p.stem]=read(p)
pairs={x['id']:x for x in read(lib/'intake/batch2-37/visual-pairs.json')['characters']}
recipes={}
for p in (repo/'materials/community-hero-forge/recipes').glob('*.upload-recipe.json'):
 d=read(p);recipes[d['projectId']]=d
upgrades=read(lib/'intake/existing-hero-upgrades/upgrades.json')['entries']
works={};work_sources={}
for id,c in main['champions'].items():
 m=re.search(r'出自\s*[:：]\s*([^\n)）]+)',c.get('description',''))
 if m:works[id]=m.group(1).strip();work_sources[id]='既有角色故事'
for _ in range(3):
 for id,c in main['champions'].items():
  if id in works:continue
  related=c.get('transform',{}).get('counterpartId')
  same=next((j for j,v in main['champions'].items() if v['name']==c['name'] and j in works),None)
  if (related in works) or same:works[id]=works.get(related,works.get(same));work_sources[id]='同角色／變身對應'
for id,p in pairs.items():works[id]=p['work'];work_sources[id]='第二批角色規格'
for id,r in recipes.items():
 match=re.search(r'(?:作品(?:識別)?|來源)[：:]\s*([^\n]+)',r['identity']);assert match,id
 works[id]=match.group(1).strip().strip('《》');work_sources[id]='第一批 Owner 角色規格'
for e in upgrades:
 for b in e['old_bindings']:
  if b['id'] not in works:
   works[b['id']]=e['new_candidates'][0]['origin'];work_sources[b['id']]='既有同角色候選對照'
for id,work in {'godie-e00r':'新世紀福音戰士（由故事 EVANGELION 辨識）','godie-o02l':'神奇寶貝（同皮卡丘角色對應）','godie-zombiex':'去死團原創','sela':'GGD 原版佔位角色；未標外部作品','thorne':'GGD 原版佔位角色；未標外部作品'}.items():
 works.setdefault(id,work);work_sources.setdefault(id,'既有角色故事／模型設定')
for id,h in heroes.items():
 if h.get('work'):works[id]=h['work']
assert set(heroes)<=set(works),set(heroes)-set(works)
labels={'300heroes':'300英雄','mba':'魔法少女武鬥祭 MBA','original':'GGD 原版','w3x':'原 W3X 匯入／借用'}
kinds={'exact':'本尊','alternate':'同角色其他形態','style-proxy':'相似外觀代理','previous':'原有模型（身分未再驗）'}
known={'champ.sela':'Sela／方塊法師','champ.thorne':'Thorne／方塊騎士','champ.skin.barbarian':'方塊野蠻人','champ.godie-zombiex':'喪標麥可／方塊不死族','w3x.stock.satyrtrickster':'Satyr Trickster／薩特詭術師'}
def old(key):
 if key in by_key:
  m=by_key[key];tier='300heroes' if m['id'].startswith(('300heroes:','pet:')) else 'mba' if m['id'].startswith('mba:') else 'original'
  return dict(key=key,id=m['id'],name=m['sourceCharacter'],work=m['sourceWork'],tier=tier,kind='previous',ready=True,old=True)
 tier='w3x' if key.startswith(('imported.','w3x.')) else 'original'
 return dict(key=key,id=key,name=known.get(key,key.split('.')[-1]+'（模型檔名）'),work='原 W3X 地圖模型；原始角色作品未由該模型文件證實' if tier=='w3x' and not key.startswith('w3x.stock.') else '魔獸爭霸 III 原生單位' if key.startswith('w3x.stock.') else 'GGD 模型預設',tier=tier,kind='previous',ready=True,old=True)
def source(option):
 s=option['source'];return dict(key=option['sourceModelKey'],id=option['sourceId'],name=s['character'],work=s['work'],tier=s['tier'],kind=s['kind'],ready=True,old=False)
def text(v):return str(v).replace('|','／').replace('\n',' ').replace('\r',' ')
def model_label(o):return f"{text(o['name'])} `{o['id']}`"
def source_label(o):return f"{'英雄聯盟 LOL' if o['id'].startswith('lol:') else labels[o['tier']]}｜《{text(o['work'])}》"
def show(o):
 state=kinds.get(o['kind'],o['kind']) if o['ready'] else '未通過轉換；不可預設'
 return f"{model_label(o)} — {source_label(o)}；{state}"
rows=[];pending_rows=[]
for id,h in heroes.items():
 c=main['champions'].get(id);p=prod['champions'].get(id);options=[source(o) for o in h['options']];seen={o['key'] for o in options}
 # Retain every frozen alternative present in the prepared source branch.
 for v in branches.get(id,{}).get('modelVersions',[]):
  key=v['sourceModelKey']
  if key in seen:continue
  o=old(key);s=v['source'];o.update(name=s.get('character',o['name']) if s.get('kind')!='previous' else o['name'],tier=s.get('tier',o['tier']),kind=s['kind']);options.append(o);seen.add(key)
 existing=c.get('modelKey') if c else None
 if existing and existing not in seen:options.append(old(existing));seen.add(existing)
 # First-batch authoring placeholders are historical authoring choices, not live deployments.
 if id in recipes:
  key=recipes[id].get('presentation',{}).get('modelKey')
  if key and key not in seen:options.append(old(key));seen.add(key)
 options.sort(key=lambda o:(manifest['priority'].index(o['tier']),0 if o['id']==h.get('preferredDerivative') else 1,['exact','alternate','style-proxy','previous'].index(o['kind']) if o['kind'] in ['exact','alternate','style-proxy','previous'] else 9))
 default=options[0] if options else None
 current=old(p['modelKey']) if p else None
 pending=[]
 for miss in h.get('pending',[]):
  sid=miss['source'];lookup=None
  for x in [pairs.get(id,{}).get('primary',{}),*pairs.get(id,{}).get('alternates',[]),*pairs.get(id,{}).get('additional_components',[])]:
   cid='300heroes:'+str(int(x['id'])) if x.get('id','').isdigit() else ('existing:'+x.get('id','') if x.get('id') in ['cloud','lux','bulbasaur','tram'] else 'pet:'+x.get('id',''))
   if cid==sid:lookup=x
  for e in upgrades:
   for x in e['new_candidates']:
    if x['character_id']==sid:lookup=x
  o=dict(id=sid,key=sid,name=(lookup or {}).get('name',sid),work=(lookup or {}).get('origin','來源待核'),tier='300heroes' if sid.startswith(('300heroes:','pet:')) else 'w3x' if sid.startswith('existing:') else 'mba',kind='pending',ready=False)
  if sid.startswith('lol:'):o.update(name=h['name'],work='英雄聯盟 League of Legends',tier='original')
  pending.append(o);pending_rows.append((id,h['name'],o,miss['reason']))
 section='既有角色／形態' if c else '第一批 37 名' if id.startswith('community-review-') else '第二批 37 名' if id.startswith('b2-') else 'LOL 追加 7 名' if id.startswith('example:') else '歷史對應 4 筆'
 status='正式機白名單可選' if id in white else '原版佔位；不在白名單' if id in ['sela','thorne'] else '變身／替代形態；不在白名單' if c and c.get('transform',{}).get('role')=='alternate' else '目錄有定義；不在白名單' if c else '目錄未上架'
 rows.append(dict(id=id,name=c['name'] if c else h['name'],work=works[id],section=section,status=status,default=default,current=current,options=options,pending=pending))
assert len(rows)==156
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')
lines=['# 全角色模型盤點', '',f'更新時間：{now}（Asia/Taipei）。按角色／形態 ID 計數，不將同名變身態合併成一筆。','',
'## 盤點基準','',
f'- 全表 **{len(rows)} 個角色／形態 ID**：既有目錄 71、第一批 37、第二批 37、LOL 追加 7、歷史對應 4；新增共 **81 名**。',
f'- 正式機白名單可選 **{len(white)}** 名；靜態角色目錄 71 筆。正式站公開社群角色清單為 0 筆、內容覆寫 generation 為 {live["generation"]}。',
f'- 正式機觀測快照（2026-09-10 01:59）之 main：`{main["commit"]}`；正式機：`{prod["commit"]}`。兩者角色設定已逐一核對。',
f'- S3 固定成品版本：`{release["release"]}`；對應本次發布後讀回驗證的固定版本。',
'- [模型選項 PR #1152](https://github.com/adms/GGD/pull/1152) 目前仍未合併；素材庫預設不等於正式站目前採用。',
'- **預設模型**欄依指定順位 **300英雄 > MBA > 原版 > 借用 W3X**；同來源先 Owner 本次指定的獨立副本，其餘依本尊、同角色其他形態、相似代理、原有模型。既有原模型及第一批原稿佔位模型保留在候選群。',
'- 分支合併保留遠端對 15 名既有英雄的手動原模型選擇；下表的順位預設不會覆蓋手動選擇。',
'- **正式機目前模型**欄讀取正式機角色檔；已核對公開覆寫為空。白名單狀態與目錄有無定義分開標示，不能把目錄筆數当成可選人數。',
'- **角色出處**是目標角色的作品；**預設模型來源／候選来源**則是提供外觀的遊戲與其模型角色作品，兩者可能不同。',
'- 原 W3X 模型若只有檔名證據，保留檔名並標記未核實，不將它自動認定為目標角色本尊。',
'- 候選群包含該角色已記錄的全部可用選項與未通過轉換項目；未對應到任何 GGD 角色的全遊戲原生模型不在本表範圍。','',
'## 指定三名角色處理結果','',
'| 角色 | 結果 |','|---|---|',
'| 坂田銀時 | `300heroes:137` 本尊：選擇性修復骨節 54，保留其餘骨架／權重；123 動畫通道，240 個頂點／姿態比對最大誤差約 0.000001668 公尺。已列素材庫首選。 |',
'| 蜘蛛子 | `pet:spider`／`27_zhizhuzi`：寵物表 24034 → 怪物表 45029 → 原生模型路徑，確認為本尊蜘蛛／寵物形態；不是人型或完整戰鬥素材包。 |',
'| 海克力斯 | `300heroes:41` 本尊已轉換、移出轉換缺口；素材庫首選已更新，正式機仍使用下表列出的原模型。 |','']
lines+=['## 本次 11 個獨立模型副本','','每個副本的 GLB 完整內嵌模型、骨架、材質貼圖與標準動作，不引用上游 GLB／貼圖，也不使用符號連結。原模型仍在候選群。這些是借用來源衍生外觀，並非目標角色本尊。','','| 目標角色 | 複製來源／作品 | 本次處理 | modelKey |','|---|---|---|---|']
for e in read(repo/'materials/hero-model-library/derivatives.json')['entries']:
 m=models['derivative:'+e['id']]
 lines.append(f"| {e['name']} | {m['sourceCharacter']}／《{m['sourceWork']}》 | {e['changes']} | `{m['modelKey']}` |")
lines+=['','章魚嗶：原生 Bone099–Bone102 有非有限 TRS 取樣，本次只在副本內插修復；有效原生鍵值保留。該部分是重建動作，不能視為原始動作完全一致。','']
for section in ['既有角色／形態','第一批 37 名','第二批 37 名','LOL 追加 7 名','歷史對應 4 筆']:
 group=[r for r in rows if r['section']==section]
 lines += [f'## {section}（{len(group)} 筆）','', '| 角色 ID | 角色出處 | 名稱 | 目前狀態 | 正式機目前模型／來源 | 預設模型（依順位） | 預設模型來源 | 模型候選群及來源 |','|---|---|---|---|---|---|---|---|']
 for r in group:
  d=r['default'];cur=r['current']
  cols=[f'`{r["id"]}`',text(r['work']),text(r['name']),r['status'],show(cur) if cur else '—（未上架）',model_label(d) if d else '**缺口：尚無可用預設**',source_label(d) if d else '—','<br>'.join(f'{i+1}. {show(o)}' for i,o in enumerate(r['options']+r['pending'])) or '尚無候選']
  lines.append('| '+' | '.join(cols)+' |')
 lines.append('')
lines+=['## 尚未通過轉換的候選','', '| 目標角色 | 候選 | 原因 |','|---|---|---|']
for id,name,o,reason in pending_rows:lines.append(f'| {text(name)} `{id}` | {model_label(o)}／{source_label(o)} | {text(reason)} |')
lines+=['','這些候選不會排入可用預設。阿箱的 POD 本體與拉蜜絲候選是分開的元件，不能視為已完成複合角色。模型／動作元件的可用狀態，也不代表專屬特效、音效或技能已全部驗收。','',
'## 標準化模型 ID 對照','',f'以下 {len(models)} 個來源選項對應 {len({m["modelKey"] for m in models.values()})} 個不同標準化模型。完整 GLB 路徑、SHA-256 與不可變 S3 位置分別見同目錄 `manifest.json`、`release.json`；以下 ID 不使用模糊姓名比對。','',
'| 來源選項 ID | 模型角色／作品 | 標準化 modelKey |','|---|---|---|']
for m in models.values():lines.append(f'| `{m["id"]}` | {text(m["sourceCharacter"])}／《{text(m["sourceWork"])}》 | `{m["modelKey"]}` |')
lines+=['','## 查詢入口與來源','',
'- 固定資源庫：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`；依 `current.json` 取得不可變成品版本。',
'- Git 角色對應與來源：[manifest.json](manifest.json)；S3 版本與模型位置：[release.json](release.json)；蜘蛛子證據：[spider-identity.json](spider-identity.json)。',
'- 正式站即時核對：[內容覆寫](https://ggd.adms.ai/api/v1/content-overlay/bundle)、[社群清單](https://ggd.adms.ai/api/v1/content-overlay/community)。',
'- 角色出處：既有 `content/champions/*.json` 故事與變身對照；第一批 `materials/community-hero-forge/recipes/*.upload-recipe.json` 的 Owner 作品欄；第二批固定庫 `intake/batch2-37/visual-pairs.json` 的目標 `work`。',
'- 歷史模型候選參考 `intake/existing-hero-upgrades/upgrades.json`；其舊 `production_ready:false` 不覆蓋已通過標準化的新版來源索引。',
'- 本文件保留待轉換項目供人查詢；其他程序的自動取用只准讀標準化成品清單，不可從 `legacy/` 或 intake 當作可用預設。',
'', '```sh', '# 在 GGD 原始專案根目錄執行', 'python3 ../GGD-Asset-Library/query.py 莉娜 --kind model', 'python3 tools/hero-model-library/sync.py --verify-only', '```','']
report='\n'.join(lines).replace('当成','當成').replace('候選来源','候選來源')
assert report.count('| `godie-')+report.count('| `b2-')+report.count('| `community-review-')+report.count('| `sela`')+report.count('| `thorne`')+report.count('| `example:')==156
assert all(r['default'] is None or r['default']['ready'] for r in rows)
assert all(heroes[id]['options'][0]['sourceId']==sid for id,sid in [('community-review-23-20260907','300heroes:137'),('b2-kumoko','pet:spider'),('godie-hapm','300heroes:41')])
assert set(main['champions'])==set(prod['champions'])
assert all(c['modelKey']==prod['champions'][id]['modelKey'] for id,c in main['champions'].items())
for file in ['manifest.json','release.json','spider-identity.json']:
 report=report.replace(f']({file})',f'](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/{file})')
path=repo/'materials/hero-model-library/全角色模型盤點.md';path.write_text(report)
(repo/'materials/hero-model-library/inventory-validation.json').write_text(json.dumps({'time':now,'rows':len(rows),'missing_works':[],'source_options':len(models),'s3_release':release['release'],'live_selectable':len(white),'pending':len(pending_rows),'main_production_models_equal':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))
for copy_path in [ws/'全角色模型盤點.md',lib/'全角色模型盤點.md']:copy_path.write_text(report)
print(path);print('rows',len(rows),'pending',len(pending_rows),'bytes',path.stat().st_size)
