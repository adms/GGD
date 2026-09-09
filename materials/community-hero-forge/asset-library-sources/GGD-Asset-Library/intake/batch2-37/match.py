#!/usr/bin/env python3
"""Read-only candidate matching; no downloads, imports, conversions or publication."""
import collections,hashlib,json,re,sqlite3,struct,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent;HERE=Path(__file__).resolve().parent
SOURCE=BASE/'GGD-hero-validation-batch2';BATCH=SOURCE/'tools/editor-acceptance/batch2-37';DATA=SOURCE/'docs/_reports/hero-validation-batch2-37/data'
REG=BASE/'outputs/asset-library-registry-20260907';GAME=BASE/'outputs/game-asset-library-20260907/300heroes'
EXACT={'b2-rem':['310'],'b2-zenitsu':['332'],'b2-rin':['160'],'b2-maple':['272','273','276']}
TERMS={
'popp':['何布','波普','popp'], 'rem':['蕾姆','レム','leimu'], 'zenitsu':['我妻善逸','zenitsu','woqishanyi'], 'rin':['遠坂凜','远坂凛','遠坂凛','tohsaka','yuanbanlin'],
'uncle':['異世界舅舅','异世界舅舅','おじさん','isekai ojisan'], 'boxxo':['阿箱','拉蜜絲','拉蜜丝','ハッコン','ラッミス','boxxo','lammis'], 'shadow':['闇影','希德','シド','shadow','cid kagenou'], 'bojji':['波吉','ボッジ','bojji'], 'maomao':['貓貓','猫猫','maomao'], 'elma':['艾爾瑪','艾尔玛','エルマ','elma'], 'albus':['阿爾巴斯','阿尔巴斯','アルバス','albus'], 'goblin':['哥布林殺手','哥布林杀手','ゴブリンスレイヤー','goblin slayer'], 'maple':['梅普露','メイプル','meipulu','maple'], 'naofumi':['岩谷尚文','naofumi'], 'makoto':['深澄真','misumi'], 'noor':['諾爾','诺尔','ノール','noor'], 'touka':['托卡','トウカ','touka scott'], 'haga':['羽賀','羽贺','ハガ','haga'], 'guts':['凱茲','凯兹','格斯','ガッツ','guts'], 'keyaru':['凱亞爾','凯亚尔','ケヤル','keyaru'], 'kaede':['楓','カエデ','kaede'], 'matthias':['馬提亞斯','马提亚斯','マティアス','matthias'], 'sinbad':['辛巴達','辛巴达','シンドバッド','sinbad'], 'kumoko':['蜘蛛子','kumoko'], 'yogiri':['高遠夜霧','高远夜雾','yogiri'], 'kaiji':['伊藤開司','伊藤开司','カイジ','kaiji'], 'fushi':['不死','フシ','fushi'], 'orphen':['歐菲','欧菲','オーフェン','orphen'], 'klaus':['克勞斯','克劳斯','クラウス','klaus'], 'takopi':['章魚嗶','章鱼哔','タコピー','takopi'], 'luckyman':['幸運超人','幸运超人','ラッキーマン','luckyman'], 'misery':['米瑟利','ミザリィ','misery'], 'nube':['鵺野鳴介','鵺野鸣介','神眉','nube'], 'shinchan':['野原新之助','蠟筆小新','蜡笔小新','しんのすけ','shinchan'], 'aladdin':['阿拉丁','アラジン','aladdin'], 'ned':['青蛙劍士','青蛙剑士','ネッド','ned','avarth'], 'kisaragi':['如月','電車','电车','kisaragi','tram']}
NEEDS={
'popp':'男性少年魔法師、法杖；火冰施法、撤退與救援動作', 'rem':'藍髮女僕、鐵球鎖鏈；連擊、投擲、鬼化另核對', 'zenitsu':'黃髮羽織少年、日輪刀；拔刀與雷閃位移', 'rin':'黑髮雙馬尾、紅衣、寶石；施法及八極拳', 'uncle':'中年眼鏡男性、異世界服裝；劍／魔法與精靈演出', 'boxxo':'阿箱販賣機＋拉蜜絲人形雙部件；背負／移動與出貨', 'shadow':'黑色兜帽劍士；拔劍與範圍爆發', 'bojji':'矮小王子、王冠、細劍；閃避與刺擊', 'maomao':'藥師少女、東方服飾、藥瓶；配藥與投擲', 'elma':'男性重騎士、重甲大劍；防禦與重擊，非小林家龍女僕艾爾瑪', 'albus':'少年勇者、劍與冒險服；速攻與位移', 'goblin':'封閉頭盔、輕中甲、短劍盾牌；工具投擲與近戰', 'maple':'大盾少女本體；機械神可另列形態，不能代替所有變身', 'naofumi':'男性盾之勇者、盾牌；護衛與盾擊', 'makoto':'男性少年商人／魔法師、弓；射擊及魔力場', 'noor':'成年男性大劍士；招架、格擋、重擊', 'touka':'男性農夫／勇者、劍；挖坑陷阱與拉扯', 'haga':'男性冒險者／除錯者；檢查、標記與施法', 'guts':'高大男性、黑色重甲、大劍與義手；大幅斬擊', 'keyaru':'男性回復術士；治療與施法', 'kaede':'轉移魔法劍士男性；附魔劍。與梅普露／本條楓不是同一人', 'matthias':'少年男性魔法劍士、紋章；劍術與魔法', 'sinbad':'少年辛巴達；魔裝需逐形態核對，非任意紫髮模型', 'kumoko':'蜘蛛魔物階段、八足；爬行／吐絲，不能以普通人形冒充', 'yogiri':'男性學生；指向／施法及撤退', 'kaiji':'成年男性、尖鼻角色特徵；賭局手勢', 'fushi':'早期不死少年本體；狼／其他形態逐個獨立配對', 'orphen':'男性黑髮魔術士、黑衣；手勢詠唱與近戰', 'klaus':'男性冒險者／射手；自動攻擊與撤退', 'takopi':'粉紅圓形章魚外星人；觸手、道具、非普通人形', 'luckyman':'幸運超人變身本體；不能以通用坦克當本尊', 'misery':'女性神秘異界案內人；服裝輪廓與贈品演出', 'nube':'男性教師、鬼手；左右手與鬼手掛點', 'shinchan':'五歲小新、兒童比例；日常動作，不以成人縮放冒充', 'aladdin':'少年阿拉丁、藍髮、笛子；烏戈召喚物需另配', 'ned':'青蛙劍士遊戲分身；青蛙頭身比例與持劍', 'kisaragi':'電車本體、輪組、滑門；車體動作而非人形骨架'}
proofs={}
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def proof(p):
 p=Path(p)
 if str(p) not in proofs:
  d=dict(path=str(p),exists_local=p.is_file())
  if p.is_file():d.update(bytes=p.stat().st_size,sha256=sha(p))
  proofs[str(p)]=d
 return proofs[str(p)]
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def norm(x):return unicodedata.normalize('NFKC',x).casefold()
def glb_info(p):
 b=p.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<I',b,8)[0]==len(b)
 n,typ=struct.unpack_from('<II',b,12);assert typ==0x4e4f534a;j=json.loads(b[20:20+n]);return dict(meshes=len(j.get('meshes',[])),skins=len(j.get('skins',[])),animations=[a.get('name','') for a in j.get('animations',[])],animation_channels=[len(a.get('channels',[])) for a in j.get('animations',[])])
def content_asset(rel):
 declared=proof(SOURCE/'content'/rel)
 expected=next((e for e in read(SOURCE/'content/assets-manifest.json')['entries'] if e['path']==rel),None)
 candidates=[]
 for repo in ['GGD-community-hero-forge','GGD-hero-auto-forge','GGD-asset-library-management']:
  p=BASE/repo/'content'/rel
  if p.is_file():
   record=proof(p)
   if expected and record['sha256']==expected['sha256'] and record['bytes']==expected['bytes']:candidates.append(record);break
 selected=declared if declared['exists_local'] else (candidates[0] if candidates else None)
 return dict(declared_worktree_path=declared,expected_manifest_entry=expected,selected_local_copy=selected,selection='manifest_sha256_and_size' if candidates else 'declared_path' if selected else 'unresolved')

def main():
 identity=read(BATCH/'identity-sources.json');assert len(identity['heroes'])==37
 db=sqlite3.connect((REG/'catalog.sqlite').as_uri()+'?mode=ro',uri=True)
 chars=[json.loads(r[0]) for r in db.execute('select data from characters')];byid={r['id']:r for r in chars}
 ready={}
 for e in read(ROOT/'catalog.json')['entries']:
  if e['kind']=='vfx-library':
   folder=ROOT/e['path'];res=read(folder/'resource.json')
   for rel in res['vfx']:
    p=folder/'content'/rel;ready[read(p)['id']]=p
 allpairs=[]; source_checks={str(BATCH/'identity-sources.json'):sha(BATCH/'identity-sources.json')}
 def native(n):
  c=byid['300heroes:'+n];folder=GAME/'models/data/character/roleaction'/n;p=folder/'model.json'
  if not p.exists():return dict(source_character_id=c['id'],status='catalog_entry_no_local_body',model=None)
  m=read(p);mat=read(folder/'materials.json');clips=m['clips'];names=[x['name'] for x in clips]
  states={'idle':[x for x in names if x=='bat_idle'],'run':[x for x in names if x in ['bat_run','single_run']],'attack':[x for x in names if 'attack_attcom' in x],'cast':[x for x in names if x.startswith('single_skill')],'hurt':[],'death':[x for x in names if x=='dead']}
  texture_rows={}
  for t in mat['textures']:
   name=t['original'];resolved=t.get('resolved');candidates=[]
   if not resolved:
    candidates=[proof(path) for path, in db.execute("select distinct path from assets where library='300heroes' and lower(name)=? and kind='texture'",(name.lower(),))]
   texture_rows[name]=dict(original=name,resolution_method=t['method'],file=proof(GAME/'raw'/resolved) if resolved else None,unresolved_name_candidates=candidates)
  assets=[(json.loads(d),confidence) for d,confidence in db.execute('select a.data,l.confidence from assets a join links l on a.id=l.asset_id where l.character_id=?',(c['id'],))]
  audio=[]
  for a,conf in assets:
   if a['kind']!='audio':continue
   s=a.get('source_record',{});bank=s.get('source_bank','');audio.append(dict(file=proof(a['path']),name=s.get('original_name',a['name']),bank=bank,scope='base_bank' if bank==f'data/audio/hero/{n}.bank' else 'variant_bank_candidate',confidence=conf,auditioned=False))
  magic={}
  for d, in db.execute("select data from assets where library='300heroes' and path like '%/raw/data/magic/%' and instr(path,?)>0",(n,)):
   a=json.loads(d);ap=a['path'];rel=ap.split('/raw/data/magic/',1)[-1]
   # Require a character-id namespace in a skill directory; omit generic numeric texture collisions.
   if not re.match('skill/'+re.escape(n)+r'(?:_|/)',rel):continue
   magic.setdefault(ap,dict(file=proof(ap),relationship='character_id_skill_directory_candidate',requires_effect_graph_and_timing_review=True))
  return dict(source_character_id=c['id'],source_character=c['name'],source_work=c['origin'],identity_status='existing_registry_identity_cross_reference',version_verified=False,origin_evidence=c['origin_sources'],model=dict(native=proof(c['base_model']),static_preview=proof(folder/'mesh.obj'),metadata=proof(p),materials=proof(folder/'materials.json'),format=m['format'],bones=m['bone_count'],meshes=m['geometry_count'],rigged_gltf_available=False),textures=list(texture_rows.values()),animations=dict(count=len(clips),clips=clips,key_data=proof(folder/'animation-data.bin'),state_candidates=states,missing_states=['hurt'],timing='Native frames; FPS unverified',retargeted=False),native_vfx=dict(embedded_particles=m['particle_count'],embedded_ribbons=m['ribbon_count'],unique_skill_files=len(magic),files=list(magic.values()),converted_to_ggd=False),audio=dict(unique_files=len(audio),base_bank_files=sum(x['scope']=='base_bank' for x in audio),files=audio),variants=dict(model_candidates=sum(a['kind']=='model' and a['format']=='x' and cf=='numeric_prefix_candidate' for a,cf in assets),basis='numeric prefix; not approved as base body',files=[dict(file=proof(a['path']),relationship=cf) for a,cf in assets if a['kind']=='model' and a['format']=='x' and cf=='numeric_prefix_candidate']),status='native_candidate_requires_conversion')
 native_cache={n:native(n) for nums in EXACT.values() for n in nums}
 for h in identity['heroes']:
  hid=h['id'];slug=hid[3:];terms=TERMS[slug];search=[]
  for c in chars:
   values=[c['name'],*c.get('aliases',[])];hits=[t for t in terms if any(norm(t)==norm(v) or (len(t)>=3 and norm(t) in norm(v)) for v in values)]
   if hits:search.append(dict(id=c['id'],name=c['name'],origin=c.get('origin'),matched_terms=hits,accepted=c['id'].split(':')[-1] in EXACT.get(hid,[]) and c['library']=='300heroes'))
  project_path=DATA/'private/teachers'/f'{hid}.project.json';project=read(project_path);source_checks[str(project_path)]=sha(project_path);presentation=project['presentation'];proxy_key=presentation['modelKey']
  compiled_path=DATA/'private/compiled'/f'{hid}.json';compiled=read(compiled_path);source_checks[str(compiled_path)]=sha(compiled_path)
  slots=[]
  for slot,spec in presentation['slots'].items():
   fx=[]
   for layer in spec['vfxLayers']:
    key=layer['vfxKey'];p=SOURCE/'content/vfx'/f'{key}.json';d=read(p);rp=ready.get(key);same=bool(rp and sha(rp)==sha(p));texture=SOURCE/'content'/d['texture'] if d.get('texture') else None
    fx.append(dict(id=key,attach_to=layer.get('attachTo'),definition=proof(p),texture=content_asset(d['texture']) if texture else None,standardized_library_copy=proof(rp) if same else None,readiness='standardized_library_component' if same else 'existing_engine_vfx_definition',relationship='GGD generic component; not original anime VFX'))
   ability=compiled['champion'].get('abilities',{}).get(slot,{})
   slots.append(dict(slot=slot,name=ability.get('name'),vfx=fx,sfx_key=spec.get('sfxKey'),audio_fallback=spec.get('fallback',{}).get('missingSfx'),original_character_sfx_bound=False))
  proxy=None
  if hid!='b2-kisaragi':
   mp=SOURCE/'content/models'/f'{proxy_key}.json';md=read(mp);gp=SOURCE/'content'/md['glbPath'];proxy=dict(key=proxy_key,definition=proof(mp),model=content_asset(md['glbPath']),clip_map=md.get('clipMap',{}),inspection=glb_info(Path(content_asset(md['glbPath'])['selected_local_copy']['path'])) if content_asset(md['glbPath'])['selected_local_copy'] else None,relationship='existing_design_proxy_only',character_identity_match=False,bindable_to_original_model_without_retarget=False)
  originals=[native_cache[n] for n in EXACT.get(hid,[])];tram=None
  if hid=='b2-kisaragi':
   meta=read(BATCH/'assets/kisaragi-tram.json');gp=SOURCE/meta['normalized']['path'];fp=proof(gp);assert fp['sha256']==meta['normalized']['sha256'];info=glb_info(gp);assert set(['idle','run','attack','cast','hurt','death'])<=set(info['animations']);tram=dict(metadata=proof(BATCH/'assets/kisaragi-tram.json'),model=fp,inspection=info,clip_map=meta['document']['clipMap'],relationship='GGD_original_tram_for_this_character',skeleton_type='node_animation_not_humanoid_skin',shared_library_admitted=False,game_import_verified=False)
  state='native_identity_candidate' if originals else 'GGD_original_body_available' if tram else 'original_body_not_found_in_current_registry'
  gaps=[]
  if originals:gaps=['原生 JUMPX 骨架／權重與動畫轉換、材質修復','hurt 動作未找到可確認對應','原生 VFX 事件／貼圖／時序轉為 GGD 定義','音效尚未試聽與綁定六槽','來源版本、外觀與遊戲驗收']
  elif tram:gaps=['音效尚未配對','碰撞與實機演出驗收','正式共享庫入庫驗證']
  else:gaps=['本尊模型與角色專屬動作未找到','本尊音效未找到','原作特效需另找來源或重製','若換用本尊模型，需重新綁定動作／掛點與驗收']
  pair=dict(number=h['number'],id=hid,name=h['lockedDisplayName'],work=h['canonicalWork'],canonical_name=h['canonicalName'],version_scope=h['versionScope'],model_requirements=NEEDS[slug],pairing_status=state,identity_sources=h['sources'],search=dict(terms=terms,registry_characters_scanned=len(chars),name_hits=search,scope='300heroes, MBA, LoL seven-character snapshot, community37 registry; existing batch2 models checked separately'),original_model_candidates=originals,original_tram=tram,current_design_proxy=proxy,slots=slots,gaps=gaps,production_ready=False,automatically_import=False,source_project=proof(project_path),source_compiled=proof(compiled_path))
  if hid=='b2-kaede':pair['identity_exclusion']='梅普露／本條楓 is b2-maple, not the male magic swordsman b2-kaede; do not match by 楓.'
  if hid=='b2-elma':pair['identity_exclusion']='重騎士艾爾瑪 is not the dragon maid Elma; reject cross-work homonyms.'
  if hid=='b2-maple':pair['form_note']='272 base; 273 mechanical-god form only; 276 catalog entry has no local body.'
  allpairs.append(pair);write(HERE/'characters'/f'{hid}.json',pair)
 changed=[p for p,v in source_checks.items() if sha(Path(p))!=v];assert not changed,('Source changed during matching',changed)
 counts=dict(collections.Counter(x['pairing_status'] for x in allpairs));sources={str(BATCH/'identity-sources.json'):sha(BATCH/'identity-sources.json'),str(REG/'characters.json'):sha(REG/'characters.json'),**source_checks}
 result=dict(schema='ggd-batch2-asset-pairing@1',scope='local_candidate_matching_only',count=len(allpairs),summary=counts,production_ready_characters=0,automatic_import_allowed=False,source_fingerprints=sources,characters=allpairs)
 write(HERE/'pairs.json',result);write(HERE/'file-proofs.json',dict(files=list(proofs.values())))
 md=['# 第二批 37 名角色素材配對','', '範圍：現有本機素材與第二批設計。這是候選配對清單，不是已綁定／可上架角色庫。未下載、上傳或修改素材。','',f'原生本尊候選 {counts.get("native_identity_candidate",0)} 名；GGD 原創電車 1 名；其餘 {counts.get("original_body_not_found_in_current_registry",0)} 名未在本次來源範圍找到本尊。','', '| # | 角色／作品 | 模型配對 | 本尊動作 | 原生特效／音效 | 缺漏 |','|---:|---|---|---|---|---|']
 for p in allpairs:
  o=p['original_model_candidates'];base=o[0] if o else None
  model=('300英雄 '+base['source_character_id'].split(':')[1]+'：原生模型＋靜態 OBJ') if base else 'GGD 原創電車 GLB' if p['original_tram'] else '本尊未找到；現有代理 '+p['current_design_proxy']['key']
  anim=(str(base['animations']['count'])+' 原生片段；未轉換；缺 hurt') if base else '6 個節點動畫' if p['original_tram'] else '未找到；代理動作不算本尊'
  media=(f"VFX {base['native_vfx']['unique_skill_files']} 個檔案候選；音效 {base['audio']['unique_files']} 檔候選（含皮膚）") if base else '本尊未找到；GGD 通用特效另列'
  md.append(f"| {p['number']} | [{p['name']}](characters/{p['id']}.json)／{p['work']} | {model} | {anim} | {media} | {'；'.join(p['gaps'][:2])} |")
 md+=['','每名 JSON 包含完整路徑、SHA-256、貼圖缺件、原生動作名稱／候選狀態對照、音效 bank、特效檔案、六槽 GGD 特效及身分判定依據。','', '梅普露 273 僅列機械神形態；276 雖有角色條目但沒有本機模型。楓（魔法劍士）與本條楓（梅普露）分開。阿箱＋拉蜜絲、蜘蛛子、不死各形態、章魚嗶、青蛙劍士需按其非通用人形需求補資源。','', '音效與數字命名 VFX 仍是來源關聯候選，尚未試聽／目視或完成時序綁定。原生片段計數不等於獨立檔案數。OBJ 只有靜態預覽，不含可用骨架動畫。','', '查詢：`python3 query.py --identity b2-rem`；外觀近似配對另見 README.md。']
 (HERE/'IDENTITY_MATCHES.md').write_text('\n'.join(md)+'\n');print(json.dumps(counts,ensure_ascii=False));print('file proofs',len(proofs),'missing',sum(not x['exists_local'] for x in proofs.values()))
if __name__=='__main__':main()
