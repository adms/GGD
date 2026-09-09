#!/usr/bin/env python3
"""Build an intake-only visual donor ledger from reviewed choices and local evidence."""
import collections,hashlib,html,json,sqlite3
from pathlib import Path
from urllib.parse import quote
HERE=Path(__file__).resolve().parent;BASE=HERE.parents[2];VIS=HERE/'visual'
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def proof(p):
 p=Path(p);assert p.is_file(),p
 return dict(path=str(p),workspace_relative_path=str(p.relative_to(BASE)),exists_local=True,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
source=read(HERE/'pairs.json');original={h['id']:h for h in source['characters']};choices=read(HERE/'visual-choices.json')
reviews={r['id']:r for f in ['render-proof.json','extra-proof.json'] for r in read(VIS/f)}
conn=sqlite3.connect(f'file:{BASE}/outputs/asset-library-registry-20260907/catalog.sqlite?mode=ro',uri=True)
registry={i.split(':')[-1]:(n,o) for i,n,o in conn.execute("select id,name,origin from characters where library='300heroes'")};conn.close()
custom={'tiny-kirito':('小桐人寵物','刀劍神域；依檔名與外觀推定'),'spider':('白色蜘蛛寵物 27_zhizhuzi','來源遊戲 300英雄；檔名含蜘蛛子，尚未獨立確認授權角色身分'),'octopus':('八爪魚寵物 11_bazhuayu','來源遊戲 300英雄；其他作品出處未確認'),'pod':('POD 機械寵物 06_pod','来源遊戲 300英雄；外觀近 NieR POD，出處未獨立確認'),'lux':('Lux 拉克絲','League of Legends'),'bulbasaur':('妙蛙種子模型','Pokémon；現有匯入模型'),'cloud':('Cloud 克勞德模型','Final Fantasy VII；現有匯入模型')}
cache={}
def donor(k):
 if k in cache:return cache[k]
 if k=='tram':
  t=original['b2-kisaragi']['original_tram'];d=dict(id=k,name='GGD 原創如月電車',origin='GGD 原創',model=proof(t['model']['path']),preview=proof(BASE/'GGD-hero-validation-batch2/tools/editor-acceptance/batch2-37/assets/kisaragi-tram-preview.png'),format='GLB',animations=dict(clips=t['inspection']['animations'],clip_count=6,skeleton_type='node_animation',retargeted=False),readiness='existing_original_candidate_not_shared_release')
 else:
  r=reviews[k];p=Path(r['source']);name,origin=registry[k] if k in registry else custom[k]
  assert hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256'],p
  d=dict(id=k,name=name,origin=origin,model=proof(p),preview=proof(r['preview']),format='JUMPX' if p.suffix=='.x' else 'GLB',static_preview_reviewed=True,review_method=r['method'],animation_playback_verified=False,readiness='intake_candidate_not_standardized_release')
  if p.suffix=='.x':
   rel=p.relative_to(BASE/'outputs/game-asset-library-20260907/300heroes/raw');mp=BASE/'outputs/game-asset-library-20260907/300heroes/models'/rel.with_suffix('')/'model.json';m=read(mp)
   d['metadata']=proof(mp);d['animations']=dict(clip_count=m['clip_count'],bone_count=m['bone_count'],clips=m['clips'],storage='embedded in native JUMPX source',retargeted=False)
   d['textures']=[proof(t) for t in r['textures']];d['native_character_registry_id']='300heroes:'+k if k in registry else None
  else:d['animations']=dict(clips=r['clips'],clip_count=len(r['clips']),skin_count=r['skins'],retargeted_to_target=False)
 cache[k]=d;return d
labels={'identity_candidate':'本尊候選','original':'GGD 原創','visual_proxy':'外觀代理','partial_components':'部分零件'}
rows=[]
for id,k,status,fit,traits,changes in choices['choices']:
 h=original[id];main=donor(k)
 row=dict(number=h['number'],id=id,name=h['name'],work=h['work'],version_scope=h['version_scope'],visual_match_status=status,visual_fit=fit,fit_is_human_judgment=True,shared_visual_traits=traits,required_changes=changes,primary=main,additional_components=[donor(x) for x in choices.get('additional_components',{}).get(id,[])],alternates=[donor(x) for x in choices.get('alternates',{}).get(id,[])],identity_record='characters/'+id+'.json',identity_status=h['pairing_status'],identity_assumed_from_visual_similarity=False,animation_binding_completed=False,production_ready=False,automatic_import_allowed=False,vfx_sfx=dict(policy='保留原先逐槽 GGD 特效與來源音效候選；不因換外觀自動換語音或把來源動畫綁到目標角色',details='characters/'+id+'.json',slots=[dict(slot=s['slot'],vfx_keys=[v['id'] for v in s['vfx']],sfx_key=s['sfx_key']) for s in h['slots']]))
 rows.append(row)
counts=dict(collections.Counter(r['visual_match_status'] for r in rows))
result=dict(schema='ggd-batch2-visual-pairing@1',scope='intake review only; not approved runtime catalog',selection_policy=choices['policy'],count=len(rows),summary=counts,automatic_import_allowed=False,source_proofs=[proof(HERE/'pairs.json'),proof(HERE/'visual-choices.json'),proof(VIS/'render-proof.json'),proof(VIS/'extra-proof.json')],characters=rows)
write(HERE/'visual-pairs.json',result)
(VIS/'characters').mkdir(exist_ok=True)
for r in rows:write(VIS/'characters'/f"{r['id']}.json",r)
lines=['# 第二批 37 名：依大視覺特徵配對','',choices['policy'],'','37 名已逐名列候選：4 名本尊候選、1 名 GGD 原創、30 名外觀代理、2 名部分零件。這是配對成果；尚未改造、重綁動畫或納入正式共用成品。','','- [可搜尋模型圖卡](visual/gallery.html)（圖片是來源模型原貌，沒有先替換成目標外觀）','- 模型總覽：[第 1–20 名](visual/matches-1.jpg)／[第 21–37 名](visual/matches-2.jpg)','- [可複製給工作流的說明](COPY_TO_WORKFLOW.txt)','- [機器清單](visual-pairs.json)；[原先本尊／六槽特效與音效明細](IDENTITY_MATCHES.md)','','| # | 目標角色 | 主選模型／出處 | 配對依據 | 貼近程度 | 需要修改 |','|---:|---|---|---|---|---|']
for r in rows:
 d=r['primary'];extra=' ＋ '+ '、'.join(x['name'] for x in r['additional_components']) if r['additional_components'] else ''
 lines.append(f"| {r['number']} | [{r['name']}](visual/characters/{r['id']}.json) | {d['name']}{extra}／{d['origin']} | {r['shared_visual_traits']} | {r['visual_fit']}・{labels[r['visual_match_status']]} | {r['required_changes']} |")
lines+=['','同一模型可以對應多名角色；配對並非要求每人使用不同素材。阿箱＋拉蜜絲及 Ned 目前僅配到部分可借用零件。白色蜘蛛是新增的非角色名冊候選，原先本尊身分記錄仍保留。','','每列附本機模型、SHA-256、來源作品、原生動作名稱、預覽、改造項目及六槽特效索引。GLB／JUMPX 的存在不表示已完成目標角色動作綁定；原生特效、語音不因外觀相似自動套用。','','查詢：`python3 query.py b2-shadow`；`python3 query.py --summary`；`python3 query.py --identity b2-rem`。','','重建：先執行 `match.py` 更新本尊與設計證據，再執行 `build_visual_matches.py` 套用人工維護的 `visual-choices.json`。僅重建清單不需重繪模型。']
(HERE/'README.md').write_text('\n'.join(lines)+'\n')
# An inspectable local gallery; source previews are not fabricated target renders.
cards=[]
for r in rows:
 d=r['primary'];pics=''.join(f'<figure><img loading="lazy" src="{html.escape(quote(str(Path(x["preview"]["path"]).relative_to(BASE)),safe="/"))}"/><figcaption>{html.escape(x["name"])}</figcaption></figure>' for x in [d,*r['additional_components']])
 # Images referenced relative to workspace, with base pointing to workspace root.
 cards.append(f'<article data-search="{html.escape(r["name"]+r["work"]+d["name"]+r["shared_visual_traits"])}"><h2>{r["number"]}. {html.escape(r["name"])}</h2><small>{html.escape(r["work"])}</small><div class="pictures">{pics}</div><h3>→ {html.escape(d["name"])} <em>{r["visual_fit"]}・{labels[r["visual_match_status"]]}</em></h3><p>{html.escape(r["shared_visual_traits"])}</p><p class="change">需改：{html.escape(r["required_changes"])}</p><small>來源：{html.escape(d["origin"])} · 動作片段 {d["animations"]["clip_count"]}</small><p><a href="GGD-Asset-Library/intake/batch2-37/visual/characters/{r["id"]}.json">路徑、SHA-256、動作與特效索引</a></p></article>')
page='''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../../../../"><title>第二批 37 名素材外觀配對</title><style>body{font:16px/1.6 system-ui;margin:32px;background:#f1f4f7;color:#1a2738}header{max-width:1000px}input{padding:12px;width:min(85%,600px);font:inherit;border:1px solid #adbaca;border-radius:8px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:20px;margin-top:24px}article{background:white;padding:20px;border-radius:12px;border:1px solid #dce2eb}h2,h3{margin:0 0 8px}small{color:#536275}figure{margin:8px 0;flex:1;min-width:0}img{width:100%;height:290px;object-fit:contain;background:#e9eef3}figcaption{font-size:13px}.pictures{display:flex;gap:8px}em{display:block;font-size:13px;font-style:normal;color:#245b8b}.change{border-left:3px solid #dd9a42;padding-left:10px}a{color:#1265a3}</style><header><h1>第二批 37 名：依大視覺特徵配對</h1><p>以輪廓、體型、武器、髮型、衣裝配色挑選現有模型。圖片顯示來源原貌；改造、動畫綁定與正式入庫尚未完成。</p><p>4 本尊候選 · 1 GGD 原創 · 30 外觀代理 · 2 部分零件。高／中／低是人工相似度判斷。</p><input id="q" placeholder="搜尋目標、作品、來源模型或特徵…"><span id="count"> 37 名</span></header><main>'''+''.join(cards)+'''</main><script>document.querySelector('#q').addEventListener('input',e=>{let n=0;document.querySelectorAll('article').forEach(a=>{a.hidden=!a.dataset.search.toLowerCase().includes(e.target.value.toLowerCase());if(!a.hidden)n++});document.querySelector('#count').textContent=' '+n+' 名'})</script></html>'''
(VIS/'gallery.html').write_text(page)
# Static overview sheets, generated from the same unmodified donor previews.
from PIL import Image,ImageDraw,ImageFont
font=ImageFont.truetype('/System/Library/Fonts/STHeiti Light.ttc',18)
small=ImageFont.truetype('/System/Library/Fonts/STHeiti Light.ttc',14)
for start in range(0,len(rows),20):
 subset=rows[start:start+20];sheet=Image.new('RGB',(1400,355*((len(subset)+4)//5)),(246,248,251));draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(subset):
  x=(i%5)*280;y=(i//5)*355;im=Image.open(r['primary']['preview']['path']).convert('RGB');im.thumbnail((260,270));sheet.paste(im,(x+10+(260-im.width)//2,y+(270-im.height)//2))
  draw.text((x+10,y+275),str(r['number'])+'. '+r['name'],font=font,fill='#152943')
  name=r['primary']['name'];draw.text((x+10,y+302),'→ '+name[:19],font=small,fill='#315a78')
  draw.text((x+10,y+326),r['visual_fit']+' / '+labels[r['visual_match_status']],font=small,fill='#775630')
 sheet.save(VIS/f'matches-{start//20+1}.jpg',quality=93)

# Validate actual files and repeatable references, not merely the generated count.
assert len(rows)==37 and set(r['id'] for r in rows)==set(original)
files={}
def walk(x):
 if isinstance(x,dict):
  if x.get('exists_local') is True and 'sha256' in x:files[x['path']]=x
  for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
walk(result)
for path,p in files.items():assert proof(path)['sha256']==p['sha256'],path
assert all(len(r['vfx_sfx']['slots'])==6 and r['primary']['animations']['clip_count']>0 for r in rows)
validation=dict(status='passed',characters=len(rows),unique_primary_models=len(set(r['primary']['model']['sha256'] for r in rows)),unique_all_donor_models=len(cache),file_hashes_verified=len(files),summary=counts,visual_choice_source_sha256=proof(HERE/'visual-choices.json')['sha256'],source_animation_playback_or_target_binding_tested=False,production_admission_performed=False)
write(HERE/'visual-validation.json',validation);print(json.dumps(validation,ensure_ascii=False,indent=2))
