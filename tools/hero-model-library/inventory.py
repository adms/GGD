import argparse,json,re,hashlib,datetime
from pathlib import Path
from source_links import render_sources, plan_sources, acquired_sources, is_model_source
from default_policy import eligible, selection_class, selection_rank, source_release_rank
repo=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description='Rebuild the hero inventory using Git files only.')
parser.add_argument('--workspace',type=Path,help='Optionally mirror the generated Markdown into an existing workspace.')
parser.add_argument('--check',action='store_true',help='Check freshness without writing any files.')
args=parser.parse_args()
def read(p):return json.loads(p.read_text())
policy=read(repo/'materials/hero-model-library/default-policy.json')
channel_limit=read(repo/'content/config/model-lod.json')['championChannelLimit']
context=read(repo/'materials/hero-model-library/inventory-context.json');main=context['main'];prod=context['production'];manifest=read(repo/'materials/hero-model-library/manifest.json');release=read(repo/'materials/hero-model-library/release.json');live=context['live-overlay'];community=context['live-community']
assert not live['docs'] and not live['deleted'] and not community['champions'], 'Live overlay requires explicit merge'
assert len(manifest['heroes'])==len({h['id'] for h in manifest['heroes']})
heroes={h['id']:dict(h) for h in manifest['heroes']};models={m['id']:m for m in manifest['models']};by_key={m['modelKey']:m for m in manifest['models']}
workflow=read(repo/'materials/hero-model-library/workflow-model-options.json')
aliases=workflow['aliases'];logical={v:k for k,v in aliases.items()}
observation=read(repo/'materials/hero-model-library/current-production.json')
prod={'champions':{logical.get(k,k):v for k,v in observation['champions'].items()},'whitelist':observation['whitelist'],'commit':None}
prod['whitelist']={**prod['whitelist'],'champions':[logical.get(k,k) for k in prod['whitelist']['champions']]}
for extra in [workflow,*([read(repo/'materials/hero-model-library/priority-runtime-options.json')] if (repo/'materials/hero-model-library/priority-runtime-options.json').exists() else [])]:
 for m in extra['models']:models[m['id']]=m;by_key[m['modelKey']]=m
 for h in extra['heroes']:
  dst=heroes.setdefault(h['id'],dict(id=h['id'],name=h['name'],options=[],pending=[]))
  dst['options']=[*dst['options'],*h['options']]
  available={o['sourceId'] for o in dst['options']}
  dst['pending']=[p for p in dst['pending'] if p['source'] not in available]
for id,c in main['champions'].items():heroes.setdefault(id,dict(id=id,name=c['name'],options=[],pending=[]))
white=set(prod['whitelist']['champions']);branches={}
for p in (repo/'content/champions').glob('*.json'):
 if not p.name.startswith('_'):
  hid=logical.get(p.stem,p.stem);branches[hid]=read(p)
  heroes.setdefault(hid,dict(id=hid,name=branches[hid]['name'],options=[],pending=[]))
pairing_inputs=read(repo/'materials/hero-model-library/pairing-inputs.json')
pairs={x['id']:x for x in pairing_inputs['batch2']}
recipes={}
for p in (repo/'materials/community-hero-forge/recipes').glob('*.upload-recipe.json'):
 d=read(p);recipes[d['projectId']]=d
upgrades=pairing_inputs['existing_upgrades']
works={};work_sources={}
for id,c in main['champions'].items():
 m=re.search(r'出自\s*[:：]\s*([^\n)）]+)',c.get('description',''))
 if m:works[id]=m.group(1).strip();work_sources[id]='既有角色故事'
for id,c in branches.items():
 if id not in works:
  m=re.search(r'出自\s*[:：]\s*([^\n)）]+)',c.get('description',''))
  if m:works[id]=m.group(1).strip();work_sources[id]='出貨角色故事'
works['b2-maple']='怕痛的我，把防禦力點滿就對了';work_sources['b2-maple']='主線新增替代形態'
for id in branches:
 if id.startswith('b2-maple-alt-'):works[id]=works['b2-maple'];work_sources[id]='同角色替代形態'
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
  m=by_key[key];tier='300heroes' if m['id'].startswith(('300heroes:','pet:')) else 'mba' if m['id'].startswith('mba:') else 'w3x' if m['id'].startswith('ou99:') else 'original'
  return dict(key=key,id=m['id'],name=m['sourceCharacter'],work=m['sourceWork'],tier=tier,kind='previous',ready=True,old=True)
 raw=next((m for m in models.values() if m.get('originalDelivery',{}).get('modelKey')==key),None)
 if raw:return dict(key=key,id=raw['id']+':original',name=raw['sourceCharacter']+'（原交付版本）',work=raw['sourceWork'],tier='w3x',kind='previous',ready=True,old=True)
 tier='w3x' if key.startswith(('imported.','w3x.')) else 'original'
 return dict(key=key,id=key,name=known.get(key,key.split('.')[-1]+'（模型檔名）'),work='原 W3X 地圖模型；原始角色作品未由該模型文件證實' if tier=='w3x' and not key.startswith('w3x.stock.') else '魔獸爭霸 III 原生單位' if key.startswith('w3x.stock.') else 'GGD 模型預設',tier=tier,kind='previous',ready=True,old=True)
def source(option):
 s=option['source'];return dict(key=option['sourceModelKey'],id=option['sourceId'],name=s['character'],work=s['work'],tier=s['tier'],**{k:s[k] for k in ['library','selectionClass','sourceGame','sourcePlatform','sourceGameReleasedAt','sourceGameReleaseReference'] if k in s},kind=s['kind'],ready=True,old=False)
def text(v):return str(v).replace('|','／').replace('\n',' ').replace('\r',' ')
def model_label(o):return f"{text(o['name'])} `{o['id']}`"
def source_label(o):return f"{'英雄聯盟 LOL' if o['id'].startswith('lol:') else 'OU99 論壇' if o['id'].startswith('ou99:') else o.get('library',labels[o['tier']]) if o['id'].startswith('runtime:') else labels[o['tier']]}｜《{text(o['work'])}》"
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
  o=old(key);s=v['source'];o.update(name=s.get('character',o['name']) if s.get('kind')!='previous' else o['name'],tier=s.get('tier',o['tier']),**{k:s[k] for k in ['library','selectionClass','sourceGame','sourcePlatform','sourceGameReleasedAt','sourceGameReleaseReference'] if k in s},kind=s['kind']);options.append(o);seen.add(key)
 existing=branches.get(id,{}).get('modelKey') or (c.get('modelKey') if c else None)
 if existing and branches.get(id,{}).get('modelVersions'):
  existing=next((v['sourceModelKey'] for v in branches[id]['modelVersions'] if v['modelKey']==existing),existing)
 if existing and existing not in seen:options.append(old(existing));seen.add(existing)
 # First-batch authoring placeholders are historical authoring choices, not live deployments.
 if id in recipes:
  key=recipes[id].get('presentation',{}).get('modelKey')
  if key and key not in seen:options.append(old(key));seen.add(key)
 options.sort(key=lambda o:(selection_rank(policy,id,o['id'],o['key'],o),source_release_rank(o),['exact','alternate','style-proxy','previous'].index(o['kind']) if o['kind'] in ['exact','alternate','style-proxy','previous'] else 9))
 for o in options:
  o['defaultEligible']=eligible(policy,id,o['id'],o['key'],o['kind'])
  o['selectionClass']=selection_class(policy,id,o['id'],o['key'],o)
 automatic_default=next((o for o in options if o['defaultEligible']),None)
 default=automatic_default
 chosen=branches.get(id,{})
 manual=chosen.get('modelSelectionMode')=='manual'
 if manual:
  selected=next((v['sourceModelKey'] for v in chosen.get('modelVersions',[]) if v['modelKey']==chosen.get('modelKey')),chosen.get('modelKey'))
  default=next((o for o in options if o['key']==selected),None)
  if default is None:raise ValueError('Manual model missing from retained candidates: '+id)
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
  reason=miss['reason']
  historical=re.search(r'通道\s*(\d+)\s*超過[^0-9]*?(\d+)',reason)
  if historical and int(historical.group(2))<channel_limit and int(historical.group(1))<=channel_limit:
   reason=f'歷史上限 {historical.group(2)} 已更新為 {channel_limit}；此候選原量測 {historical.group(1)} 通道。舊拒收理由失效，本項尚未重新轉換及驗收，先保留來源。原紀錄见 manifest.json。'
  pending.append(o);pending_rows.append((id,h['name'],o,reason))
 section='主線追加形態' if id.startswith('b2-maple-alt-') else '既有角色／形態' if c else '第一批 37 名' if id.startswith('community-review-') else '第二批 37 名' if id.startswith('b2-') else 'LOL 追加 7 名' if id.startswith('example:') else '歷史對應 4 筆'
 status='正式機白名單可選' if id in white else '原版佔位；不在白名單' if id in ['sela','thorne'] else '變身／替代形態；不在白名單' if c and c.get('transform',{}).get('role')=='alternate' else '目錄有定義；不在白名單' if c else '目錄未上架'
 rows.append(dict(id=id,runtimeHeroId=aliases.get(id,id),name=c['name'] if c else h['name'],work=works[id],section=section,status=status,default=default,automaticDefault=automatic_default,defaultSelectionMode='manual' if manual else 'automatic',current=current,options=options,pending=pending))
assert len(rows)==len(set(heroes))
download_plan=plan_sources(read(repo/'materials/hero-model-library/download-sources.json'),{**manifest,'heroes':list(heroes.values())},policy)
input_paths=[repo/'materials/hero-model-library'/name for name in ['manifest.json','release.json','inventory-context.json','pairing-inputs.json','download-sources.json','derivatives.json','default-policy.json']]
input_paths += list((repo/'content/champions').glob('*.json')) + list((repo/'materials/community-hero-forge/recipes').glob('*.upload-recipe.json'))
input_paths += [Path(__file__).resolve(),Path(__file__).resolve().with_name('source_links.py'),Path(__file__).resolve().with_name('default_policy.py')]
input_paths += [repo/'materials/hero-model-library'/name for name in ['workflow-model-options.json','priority-runtime-options.json','current-production.json'] if (repo/'materials/hero-model-library'/name).exists()]
input_paths.append(repo/'content/config/model-lod.json')
review_path=repo/'materials/hero-model-library/post-registration-review.json'
quality_review=read(review_path) if review_path.exists() else {}
if review_path.exists():input_paths.append(review_path)
input_digest=hashlib.sha256(b''.join(str(p.relative_to(repo)).encode()+b'\0'+p.read_bytes()+b'\0' for p in sorted(input_paths))).hexdigest()
validation_path=repo/'materials/hero-model-library/inventory-validation.json'
previous=read(validation_path) if validation_path.exists() else {}
now=previous.get('time') if previous.get('inputs_sha256')==input_digest else datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')
new_rows=[r for r in rows if r['section'] in ['第一批 37 名','第二批 37 名','LOL 追加 7 名']]
no_default=[r for r in rows if r['default'] is None]
placeholders=[r for r in new_rows if (r['default'] or {}).get('kind')=='previous']
progress=[f'**已納入其他工作流交付，完成本次 81 名的本機模型選項登記。** 全表 {len(rows)} 個角色／形態（含新增 81 名及主線另增形態）。正式站快照白名單 {len(white)} 名，角色文件 {len(prod["champions"])} 筆；本分支新版本尚未部署。模型、動作、特效與語音分別記錄，不以取得來源代替完成。','',
'| 新增 81 名：目前素材庫預設狀態 | 數量 |','|---|---|']
for kind,label in [('exact','已登記本尊／專用原創模型預設'),('style-proxy','使用者核准加工副本或其他工作流指定相似模型'),('alternate','同角色其他形態模型'),('previous','保留原有模型；不一律等同方塊佔位'),(None,'尚無合格預設模型')]:
 progress.append(f"| {label} | {sum((r['default'] or {}).get('kind')==kind for r in new_rows)} |")
progress+=['',f'81 名新角色共 {sum(len(branches.get(r["id"],{}).get("modelVersions",[])) for r in new_rows)} 個不可變版本；逐筆登記結果見 `priority-registration.json`，固定成品入口見 `../asset-library/current-resources.json`。','', '上述數字是分支素材庫狀態，**不是正式站上架數**。新取得來源尚需標準化／後台切換驗收；尚未配對的整庫儲備另外保留，未擅自填入角色。','',
f'**尚無合格預設的 {len(no_default)} 筆：**','',
'| 角色／形態 ID | 已登記角色模型來源 | 尚待處理 |','|---|---|---|']
for r in no_default:
 sources=[s for s in acquired_sources(download_plan) if r['id'] in s['heroIds'] and is_model_source(s)]
 source_names='、'.join(f"`{s['id']}`" for s in sources) or '未登記新的完整角色模型來源'
 state='已取得來源；依下方逐來源證據完成形態確認、轉換與驗收' if sources else '既有候選轉換失敗；見下方失敗原因' if r['pending'] else '只有未核准相似候選；本尊來源仍待補／配對'
 progress.append(f"| {text(r['name'])} `{r['id']}` | {source_names} | {state} |")
placeholder_message=(f"**另有 {len(placeholders)} 名新增角色仍使用原有佔位：** "+'、'.join(text(r['name']) for r in placeholders)+'。其中已取得本尊來源者見下方來源表，不能把取得等同切換完成。') if placeholders else '**目前無新增角色使用原有佔位。** 原生動作、特效與語音缺口仍依各自證據記錄。'
progress+=['',placeholder_message,'',
f'「尚未通過轉換」的 {len(pending_rows)} 筆只統計既有轉換失敗，不是全部待補角色。既有 W3X 若只證實檔名，仍須確認本尊／形態；已取得整庫但未配對者不能說成不存在。','']
if quality_review.get('affectedSources'):
 progress+=['**全庫發布檢查仍未通過。** 幾何普查標出 '+ '、'.join(next((r['name'] for r in rows if r['id']==x['heroId']),x['heroId']) for x in quality_review['affectedSources'])+' 的原件／副本部件，保留全部原件並待確認；不以登記成功代替完整視覺驗收。精確來源與狀態見 `post-registration-review.json`，其他未解發布檢查見 `priority-release.md`。','']
lines=['# 全角色模型盤點', '',f'更新時間：{now}（Asia/Taipei）。按角色／形態 ID 計數，不將同名變身態合併成一筆。','',
'**Main 優先合併 81 名新英雄：** [81英雄優先合併清單.md](81英雄優先合併清單.md) 對應逐角色模型、動作、音訊成品與缺口；程序讀 `priority-81-handoff.json`。全表其餘角色與未轉換來源繼續保留。','',
'如月列車音訊補件：關門廣播作「嘲諷」、JR 發車旋律作「勝利」，原有九類保留。[成品、來源與 SHA 收據](priority-evidence/kisaragi-train-audio/conversion.json)；[角色語音索引](角色語音索引.md)。目前為分支交付，合併／部署狀態依最新交付清單。','',
*progress,
*render_sources(download_plan,policy),
'## 盤點基準','',
f'- 全表 **{len(rows)} 個角色／形態 ID**：既有 71、第一批 37、第二批 37、LOL 追加 7、歷史對應 4、主線追加形態。LOL `example:*` 是規格 ID，`runtimeHeroId` 是出貨 `lol-*`；不重複計數。',
f'- 正式站白名單 **{len(white)}** 名；角色文件 **{len(prod["champions"])}** 筆。快照 `{observation["observedAt"]}`，內容版本 `{observation["contentVersion"]}`。',
f'- 已整合主線 `{observation["sourceMainCommit"]}` 的論壇與 LOL 交付；正式站觀測不宣稱可由內容版本反推 Git commit。舊快照留在 `inventory-context.json`。',
f'- S3 固定成品版本：`{release["release"]}`；屬既有歷史版本；本次新增成品依 Git `current-resources.json`，不能把舊 S3 收據套用到新檔。',
'- [模型選項 PR #1152](https://github.com/adms/GGD/pull/1152) 目前仍未合併；素材庫預設不等於正式站目前採用。',
'- **預設模型**欄依第二守則，已記錄的手動選擇優先；指定 11 組副本列手動指定。其他未核准相似代理只保留候選；既有原模型保留作回退。',
'- 分支合併保留遠端對 15 名既有英雄的手動原模型選擇；下表優先顯示手動選擇，`automaticDefault` 另保留切回自動模式後的首選。',
'- 正式機目前模型與本分支手動選擇請用查詢工具讀取；主表顯示本分支手動選擇或素材庫順位預設，均不代表正式站已部署。',
'- **角色出處**是目標角色的作品；**預設模型來源／候選来源**則是提供外觀的遊戲與其模型角色作品，兩者可能不同。',
'- 原 W3X 模型若只有檔名證據，保留檔名並標記未核實，不將它自動認定為目標角色本尊。',
'- 候選群包含該角色已記錄的全部可用選項與未通過轉換項目；未對應到 GGD 角色的素材仍完整保留在上方來源表與機器索引，標記待配對；主表按現有角色 ID 展開，不代表擷取範圍受名單限制。','',
'**11 組加工副本仍獨立保留。** 本次另保留使用者確認由其他工作流交付的指定相似模型，逐筆綁定角色、來源、modelKey 與 SHA-256；不能由一筆核准擴大成所有相似模型自動預設。來源身分保持相似代理，不改標本尊。','',
'## 指定三名角色處理結果','',
'| 角色 | 結果 |','|---|---|',
'| 坂田銀時 | `300heroes:137` 本尊：選擇性修復骨節 54，保留其餘骨架／權重；123 動畫通道，240 個頂點／姿態比對最大誤差約 0.000001668 公尺。已列素材庫首選。 |',
'| 蜘蛛子 | `pet:spider`／`27_zhizhuzi`：寵物表 24034 → 怪物表 45029 → 原生模型路徑，確認為本尊蜘蛛／寵物形態；不是人型或完整戰鬥素材包。 |',
'| 海克力斯 | `300heroes:41` 本尊已轉換、移出轉換缺口；素材庫首選已更新，正式機快照仍使用原模型，詳見查詢工具。 |','']
lines+=['## 本次 11 個獨立模型副本','','每個副本的 GLB 完整內嵌模型、骨架、材質貼圖與標準動作，不引用上游 GLB／貼圖，也不使用符號連結。原模型仍在候選群。這些是借用來源衍生外觀，並非目標角色本尊。','','| 目標角色 | 複製來源／作品 | 本次處理 | modelKey |','|---|---|---|---|']
for e in read(repo/'materials/hero-model-library/derivatives.json')['entries']:
 m=models['derivative:'+e['id']]
 lines.append(f"| {e['name']} | {m['sourceCharacter']}／《{m['sourceWork']}》 | {e['changes']} | `{m['modelKey']}` |")
lines+=['','章魚嗶：原生 Bone099–Bone102 有非有限 TRS 取樣，本次只在副本內插修復；有效原生鍵值保留。該部分是重建動作，不能視為原始動作完全一致。','']
for section in ['既有角色／形態','第一批 37 名','第二批 37 名','LOL 追加 7 名','歷史對應 4 筆','主線追加形態']:
 group=[r for r in rows if r['section']==section]
 lines += [f'## {section}（{len(group)} 筆）','', '| 角色出處 | 角色名稱 | 預設模型（依順位） | 預設模型來源 | 候選模型及來源 | 下載安排 |','|---|---|---|---|---|---|']
 for r in group:
  d=r['default']
  requests=[e for e in download_plan['entries'] if r['id'] in e['heroIds']]
  download='已有 300，暫緩付費下載' if requests and all(e['downloadPriority']=='defer-existing-300' for e in requests) else '使用者來源優先下載' if requests else '未列新增下載來源'
  acquired=[s for s in acquired_sources(download_plan) if r['id'] in s['heroIds']]
  if any(r['id'] in e.get('purchaseHoldFor',[]) for e in requests):download='**免費來源已取得，暫緩購買**；先完成轉換／動作驗收'
  if any(e.get('acquiredPaidSources') for e in requests):download='**來源已取得（含論壇付費），全部保留整合**；先完成轉換／後台切換驗收'
  leads=[s for s in download_plan.get('publicSourceLeads',[]) if r['id'] in s['heroIds']]
  if leads:download+='；其他來源線索（未取得模型）：'+'、'.join(f'[{s["id"]}]({s["url"]})' for s in leads)
  options='<br>'.join(f"{i+1}. {text(o['name'])}／{source_label(o)}（{policy['priorityLabels'].get(o.get('selectionClass'),'待轉換')}；{kinds.get(o['kind'],'待轉換')}{'；未核准預設' if not o.get('defaultEligible',False) and o['kind']=='style-proxy' else ''}）" for i,o in enumerate(r['options']+r['pending'])) or '尚無可用候選'
  for s in acquired:
   bindings=[c for c in s.get('characters',[]) if r['id'] in c['heroIds']]
   label='、'.join(c['name'] for c in bindings) or s['target']
   model_paths='；'+'、'.join(c['modelPath'] for c in bindings) if bindings else ''
   storage='；僅本機保存，S3 尚未上傳' if s.get('pendingBackup',{}).get('status')=='not-uploaded' else ''
   prefix='新取得模型' if is_model_source(s) else '補充素材（非角色模型本體）'
   runtime_ready=any(o['source'].get('reference')==s['url'] and o['sourceId'].startswith('runtime:') for o in heroes[r['id']]['options'])
   stage='已完成模型選項；動作為 GGD 程序化六態' if runtime_ready else '待標準化，不自動預設'
   options+=f'<br>{prefix}：[{text(label)}]({s["url"]})／{text(s["uploader"])}（{text(s["format"])}{text(model_paths)}{storage}；{stage}）'
  selected=branches.get(r['id'],{}).get('modelKey')
  key=selected if d and selected and any(v['sourceModelKey']==d['key'] and v['modelKey']==selected for v in branches.get(r['id'],{}).get('modelVersions',[])) else d['key'] if d else None
  cols=[text(r['work']),f"{text(r['name'])}<br>`{r['id']}`",text(d['name'])+('（手動指定）' if r['defaultSelectionMode']=='manual' else '')+f'<br>`{key}`' if d else '**待取得核准模型**',source_label(d) if d else '—',options,download]
  lines.append('| '+' | '.join(cols)+' |')
 lines.append('')
lines+=['## 尚未通過轉換的候選','', '| 目標角色 | 候選 | 原因 |','|---|---|---|']
for id,name,o,reason in pending_rows:lines.append(f'| {text(name)} `{id}` | {model_label(o)}／{source_label(o)} | {text(reason)} |')
lines+=['','這些候選不會排入可用預設。阿箱的 POD 本體與拉蜜絲候選是分開的元件，不能視為已完成複合角色。模型／動作元件的可用狀態，也不代表專屬特效、音效或技能已全部驗收。','',
'## 標準化模型 ID 對照','',f'以下 {len(models)} 個來源選項對應 {len({m["modelKey"] for m in models.values()})} 個不同標準化模型。完整 GLB 路徑與 SHA-256 見 `../asset-library/current-resources.json`；來源包含 `manifest.json`、`workflow-model-options.json`、`priority-runtime-options.json`，舊 S3 位置仍見 `release.json`；以下 ID 不使用模糊姓名比對。','',
'| 來源選項 ID | 模型角色／作品 | 標準化 modelKey |','|---|---|---|']
for m in models.values():lines.append(f'| `{m["id"]}` | {text(m["sourceCharacter"])}／《{text(m["sourceWork"])}》 | `{m["modelKey"]}` |')
lines+=['','## 查詢入口與共編來源','',
'- [共編入口](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/asset-library/README.md)：先看這一份。',
'- 本盤點由 Git 來源生成。`inventory.json` 提供逐角色預設、全部候選、modelKey、GLB SHA-256、S3 URI 與觀測快照；不需從 Markdown 表格取值。',
'- `download-sources.json` 編輯使用者下載來源與改造備註；`pairing-inputs.json` 編輯第二批與舊英雄配對；`derivatives.json` 編輯獨立副本需求。',
'- 最新實際正式機快照在 `current-production.json`，舊快照保留於 `inventory-context.json`；不隨文件重建時間冒充最新部署結果。查詢工具另列本分支實際選擇與當時正式機選擇。',
'- 本機或 S3 的 `legacy/` 與 intake 不可當成自動取用的成品。',
'', '```sh', '# 在 GGD repo 根目錄執行，只讀 Git 檔案', 'python3 tools/hero-model-library/query.py 莉娜', 'python3 tools/hero-model-library/query.py b2-popp --json', 'python3 tools/hero-model-library/inventory.py --check', '```','']
report='\n'.join(lines).replace('当成','當成').replace('候選来源','候選來源')
assert len(rows)==len({r['id'] for r in rows})
assert all(r['default'] is None or r['default']['ready'] for r in rows)
assert all(heroes[id]['options'][0]['sourceId']==sid for id,sid in [('community-review-23-20260907','300heroes:137'),('b2-kumoko','pet:spider'),('godie-hapm','300heroes:41')])
for file in ['manifest.json','release.json','spider-identity.json']:
 report=report.replace(f']({file})',f'](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/{file})')
for r in rows:
 chosen=branches.get(r['id'],{})
 r['checkoutSelection']={'modelKey':chosen.get('modelKey'),'mode':chosen.get('modelSelectionMode','auto')} if chosen else None
 r['downloadSources']=[e['id'] for e in download_plan['entries'] if r['id'] in e['heroIds']]
 r['publicCandidates']=[s for s in download_plan.get('publicSources',[]) if r['id'] in s['heroIds'] and is_model_source(s)]
 r['paidCandidates']=[s for s in download_plan.get('paidSources',[]) if r['id'] in s['heroIds'] and is_model_source(s)]
 r['supplementSources']=[s for s in acquired_sources(download_plan) if r['id'] in s['heroIds'] and not is_model_source(s)]
 r['audioSources']=[s for s in r['supplementSources'] if s.get('resourceRole')=='audio-supplement']
 for option in r['options']:
  m=by_key.get(option['key'])
  if m:
   location=release['model_locations'].get(m['modelKey'])
   option['asset']={'modelKey':m['modelKey'],'glbPath':m['glbPath'],'sha256':m['sha256'],'s3Uri':release['release_uri']+location if location else None,'gitPath':m.get('gitPath') or 'materials/asset-library/releases/'+release['release']+'/'+location,'limitations':m['limitations']}
  else:option['asset']={'modelKey':option['key'],'location':'existing-project-model','s3Uri':None}
path=repo/'materials/hero-model-library/全角色模型盤點.md'
inventory={'schema':'ggd-hero-model-inventory@1','generatedAt':now,'inputsSha256':input_digest,'release':release['release'],'aliases':aliases,'productionSnapshot':{'observedAt':observation['observedAt'],'contentVersion':observation['contentVersion'],'commit':None},'heroes':rows,'downloadPlan':download_plan}
validation={'time':now,'inputs_sha256':input_digest,'rows':len(rows),'missing_works':[],'source_options':len(models),'s3_release':release['release'],'live_selectable':len(white),'pending':len(pending_rows),'productionContentVersion':observation['contentVersion'],'sha256':hashlib.sha256(report.encode()).hexdigest()}
artifacts={path:report,validation_path:json.dumps(validation,ensure_ascii=False,indent=2)+'\n',path.with_name('inventory.json'):json.dumps(inventory,ensure_ascii=False,indent=2)+'\n'}
if args.check:
 stale=[str(p.relative_to(repo)) for p,value in artifacts.items() if not p.is_file() or p.read_text()!=value]
 if stale:raise SystemExit('Stale inventory: '+', '.join(stale)+'; run python3 tools/hero-model-library/inventory.py')
 print(f'Inventory current: {len(rows)} unique heroes, owner links, priorities and source hashes verified')
else:
 for p,value in artifacts.items():p.write_text(value)
 if args.workspace:
  ws=args.workspace.resolve();lib=ws/'GGD-Asset-Library';lib.mkdir(parents=True,exist_ok=True)
  for copy_path in [ws/'全角色模型盤點.md',lib/'全角色模型盤點.md']:copy_path.write_text(report)
 print(path);print('rows',len(rows),'pending',len(pending_rows),'bytes',path.stat().st_size)
