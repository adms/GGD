import json, pathlib, hashlib, struct, collections, re, datetime, mmap, argparse

parser=argparse.ArgumentParser(description='Read-only audit of acquired community model sources; requires the local raw intake and current GGD repository.')
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path.cwd(),help='GGD checkout to audit (default: current directory; never searches sibling checkouts)')
parser.add_argument('--workspace',type=pathlib.Path,default=None,help='Workspace containing GGD-Asset-Library and outputs (default: parent of --repo); does not choose the checkout')
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('/private/tmp/ggd-undesigned-community.json'))
parser.add_argument('--generated-at',default=None,help='Optional fixed ISO timestamp when reproducing a pinned snapshot')
parser.add_argument('--output-repo-path',type=pathlib.Path,default=None,help='Optional stable checkout path to write into evidence while inspecting --repo (useful from an isolated worktree)')
args=parser.parse_args()
REPO=args.repo.resolve()
if not (REPO/'content/champions').is_dir():
 parser.error('--repo must identify a GGD checkout containing content/champions: '+str(REPO))
BASE=(args.workspace if args.workspace is not None else REPO.parent).resolve()
LIB=REPO/'materials/hero-model-library'
def read(p): return json.loads(pathlib.Path(p).read_text())
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
sources=read(LIB/'download-sources.json')['publicSources']; bysrc={s['id']:s for s in sources}
inv=read(LIB/'inventory.json')['heroes']; invmap={h['id']:h for h in inv}
champs={}; abils={}
for p in (REPO/'content/champions').glob('*.json'):
 d=read(p)
 if isinstance(d,dict) and d.get('id'): champs[d['id']]=(p,d)
for p in (REPO/'content/abilities').glob('*.json'):
 d=read(p)
 if isinstance(d,dict) and d.get('id'): abils[d['id']]=(p,d)
rows={};excluded=[];issues=[];checked=[]
def file_evidence(p,expected=None):
 p=pathlib.Path(p); out={'path':str(p),'existsLocal':p.is_file()}
 if not out['existsLocal']: return out
 out['bytes']=p.stat().st_size
 if expected: out['sha256']=expected;out['sha256Status']='recorded-manifest; this audit checks local size/header'
 try:
  with p.open('rb') as f: head=f.read(12)
  out['magicHex']=head.hex()
  if p.suffix.lower()=='.glb' and head[:4]==b'glTF':
   with p.open('rb') as f:
    f.seek(12); n,t=struct.unpack('<II',f.read(8)); g=json.loads(f.read(n))
   out['modelProof']={'format':'glTF2-binary','meshes':len(g.get('meshes',[])),'primitives':sum(len(m.get('primitives',[])) for m in g.get('meshes',[])),'skins':len(g.get('skins',[])),'animationEntries':len(g.get('animations',[]))}
  elif p.suffix.lower()=='.blend' and head[:7]==b'BLENDER':
   end='<' if head[8:9]==b'v' else '>'; blocksize=24 if head[7:8]==b'-' else 20;counts=collections.Counter()
   with p.open('rb') as f, mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as data:
    pos=12
    while pos+blocksize<=out['bytes']:
     code=data[pos:pos+4].rstrip(b'\0').decode('ascii','replace'); n=struct.unpack_from(end+'I',data,pos+4)[0]
     counts[code]+=1;pos+=blocksize
     if code=='ENDB':break
     if pos+n>out['bytes']:raise ValueError('block bounds')
     pos+=n
   out['modelProof']={'format':'Blender','meshDatablocks':counts['ME'],'armatureDatablocks':counts['AR'],'actionDatablocks':counts['AC'],'note':'Datablocks establish stored mesh; animation usability and visual identity are not validated.'}
  elif p.suffix.lower()=='.json':
   j=read(p)
   if 'minecraft:geometry' in j:
    gs=j['minecraft:geometry'];out['modelProof']={'format':'Bedrock-geometry-json','bones':sum(len(g.get('bones',[])) for g in gs),'cubes':sum(len(b.get('cubes',[])) for g in gs for b in g.get('bones',[]))}
   elif 'm_VertexData' in j:out['modelProof']={'format':'Unity-native-Mesh-typetree','vertices':j['m_VertexData'].get('m_VertexCount'),'submeshes':len(j.get('m_SubMeshes',[])),'name':j.get('m_Name')}
   elif 'bones' in j:out['modelProof']={'format':'geometry-json','bones':len(j['bones'])}
  elif head[:4]==b'MDLX':
   blocks=[]
   with p.open('rb') as f:
    f.seek(4)
    while f.tell()+8<=out['bytes']:
     h=f.read(8);name=h[:4].decode('ascii','replace');n=struct.unpack('<I',h[4:])[0];blocks.append(name)
     if f.tell()+n>out['bytes']:break
     f.seek(n,1)
   out['modelProof']={'format':'Warcraft3-MDX','hasGeoset':'GEOS' in blocks,'hasBoneChunk':'BONE' in blocks,'hasSequenceChunk':'SEQS' in blocks}
  elif head[:4]==b'OMG.':out['modelProof']={'format':'PSP-GMO','nativeParseEvidence':'source candidate manifest bone/motion counts; no new parsing or visual identity inference'}
 except Exception as e:out['inspectionError']=str(e)
 return out

def add(key,name,work,s,paths,heroes=None,unknown=False,evidence=None,aliases=None,cid=None,readiness=None,parts=None):
 sid=s['id']; row=rows.setdefault(key,{'id':key,'name':name,'work':work,'sourceIds':[],'modelCandidates':[],'mappedHeroIds':[],'designStatus':None,'evidence':[],'aliases':[],'identityAmbiguity':[]})
 if sid not in row['sourceIds']:row['sourceIds'].append(sid)
 for h in heroes or []:
  if h not in row['mappedHeroIds']:row['mappedHeroIds'].append(h)
 for a in aliases or []:
  if a!=row['name'] and a not in row['aliases']:row['aliases'].append(a)
 if unknown:row['identityAmbiguity'].append(evidence or 'Source identity is not established.')
 else:row['hasNamedIdentityEvidence']=True
 if evidence and evidence not in row['evidence']:row['evidence'].append(evidence)
 for n,item in enumerate(paths):
  if isinstance(item,str):item={'path':item}
  p=pathlib.Path(item['path'])
  if not p.is_absolute():p=BASE/s['localPath']/p
  e=file_evidence(p,item.get('sha256'))
  e.update({'id':item.get('id',(cid or key+':'+sid)+(f':{n}' if len(paths)>1 else '')),'library':'community' if not sid.startswith('ou99:') else 'ou99','sourceId':sid,'sourceUrl':s.get('url',s.get('canonicalUrl')),'readiness':item.get('readiness',readiness or s.get('readiness','native-source-reserve')),'converted':p.suffix.lower() in ['.glb','.gltf']})
  # Candidate roles are source evidence, not display-only labels. Preserve them
  # so downstream indexes can distinguish a complete body from a prop, a
  # shared bundle, or an independently accepted component.
  for field in ['resourceRole','variantSlot','nativeId','format','gitPath','componentReady','isStandaloneModelCandidate','sourceAnimationCount','nativeAnimationCount','unconvertedAnimationCount','proceduralAnimationCount','runtimeSelectable','defaultEligible','fullHeroModel','limitations','validationEvidence','visualEvidence','s3Uri','s3ArchiveMember','archiveSha256','readbackVerified']:
   if field in item:e[field]=item[field]
  e['identityReviewRequired']=unknown
  if parts:e['sourceScope']=parts
  if item.get('bytes') is not None:e['recordedBytes']=item['bytes'];e['sizeMatchesManifest']=e.get('bytes')==item['bytes']
  if not e['existsLocal']:issues.append({'type':'missing-candidate-path','id':e['id'],'path':str(p)})
  if (e['id'],str(p)) not in [(a['id'],a['path']) for a in row['modelCandidates']]:row['modelCandidates'].append(e)

def hero_group(h):
 i=invmap.get(h,{})
 return i.get('name',h),i.get('work','source work unverified')

# Explicit identity aliases; same model donor does not make its recipient that character.
identity={}
def ident(keys,key,name,work,heroids=None,unknown=False):
 for k in keys:identity[k]=(key,name,work,heroids or [],unknown)
ident(['Lina Inverse','Lina Inverse costume/likeness'],'lina-inverse','莉娜・因巴斯','Slayers',['godie-h020','godie-hjai'])
ident(['Gourry Gabriev'],'gourry','高里・加布列夫','Slayers')
ident(['Zelgadis Greywords'],'zelgadis','傑路剛帝士','Slayers')
ident(['Amelia'],'amelia','阿梅莉亞','Slayers')
ident(['Naga'],'naga','白蛇娜卡','Slayers')
ident(['Xellos'],'xellos','傑洛士','Slayers',['godie-o00l'])
ident(['Diarmuid Ua Duibhne / Zero Lancer','diarmuid_ua_duibhne_lancer'],'diarmuid','迪爾姆德・奧迪那','Fate/Zero')
ident(['Shirou Emiya / 衛宮士郎'],'shirou','衛宮士郎','Fate/stay night',['community-review-12-20260907'])
ident(['Rin Tohsaka / 遠坂凜'],'rin','遠坂凜','Fate/stay night',['b2-rin'])
ident(['Kotomine Kirei / 言峰綺禮'],'kirei','言峰綺禮','Fate/stay night')
ident(['Dark Sakura / 間桐櫻（黑櫻）'],'sakura-matou','間桐櫻（黑櫻）','Fate/stay night')
ident(['Ash Crimson'],'ash-crimson','阿修・克里門森','The King of Fighters')
ident(['Mai Shiranui'],'mai','不知火舞','The King of Fighters',['community-review-03-20260907'])
ident(['Iori Yagami'],'iori','八神庵','The King of Fighters',['community-review-02-20260907'])
fate={'artoria_pendragon_saber':('saber','阿爾托莉雅・潘德拉剛',['godie-e002','godie-e00l']),'cu_chulainn_lancer':('cu-chulainn','庫・丘林',[]),'emiya_archer':('emiya-archer','EMIYA／Archer',[]),'gilgamesh_archer':('gilgamesh','吉爾伽美什',['community-review-18-20260907']),'gilles_de_rais_caster':('gilles-de-rais','吉爾・德・雷',[]),'hassan-i-sabbah_assassin':('hassan','哈桑・薩巴赫',[]),'heracles_berserker':('heracles','海克力斯',['godie-hapm']),'iskander_rider':('iskander','伊斯坎達爾',[]),'lancelot_berserker':('lancelot','蘭斯洛特',[]),'medea_caster':('medea','美狄亞',[]),'medusa_rider':('medusa','梅杜莎',['godie-hvsh']),'nero_claudius_saber':('nero-claudius','尼祿・克勞狄烏斯',[]),'sasaki_kojiro_assassin':('sasaki-kojiro','佐佐木小次郎',[])}
for alias,(key,name,hh) in fate.items():ident([alias],key,name,'Fate',hh)
ident(['cloud','Cloud / 克勞德'],'cloud','克勞德','Final Fantasy VII',['godie-hart'])
ident(['sephiroth'],'sephiroth','賽菲洛斯','Final Fantasy VII',['godie-u00j'])

handled=set()
palworld_source_identities={
 'opgg-palworld-astralym-2026081102':('opgg-palworld-astralym-2026081102:枯星龍 / Astralym','枯星龍 / Astralym','Palworld / 幻獸帕魯'),
 'palworld-cattiva-opgg':('palworld-cattiva-opgg:Cattiva','Cattiva','Palworld / 幻獸帕魯'),
 'opgg-palworld-jetragon':('opgg-palworld-jetragon:空渦龍 / Jetragon','空渦龍 / Jetragon','Palworld / 幻獸帕魯'),
}
for s in sources:
 cs=s.get('modelCandidates') or []
 if not cs:continue
 handled.add(s['id'])
 for c in cs:
  role=c.get('resourceRole',c.get('assetKind',''))
  if role in ['stage','weapon-accessory','accessory','character-texture-variant','copy-ability-accessory-part-only']:
   excluded.append({'sourceId':s['id'],'candidateId':c.get('candidateId'),'reason':'non-character-body: '+role});continue
  label=c.get('nativeCharacter') or c.get('character') or c.get('label') or c.get('candidateId') or c.get('id')
  if s['id']=='github-flemmli97-fateubw-07e9d79b' and '/servant/' not in c.get('sourceModel',''):
   excluded.append({'sourceId':s['id'],'candidateId':c['candidateId'],'reason':'non-servant summon/prop: '+label});continue
  if s['id'] in palworld_source_identities:
   key,name,work=palworld_source_identities[s['id']];hh=[];unknown=False
  elif label in identity:key,name,work,hh,unknown=identity[label]
  else:
   hh=c.get('heroIds',[]);key=(hh[0] if hh else s['id']+':'+label);name,work=hero_group(hh[0]) if hh else (label,c.get('sourceWork',c.get('sourceGame',s.get('sourceWork','unknown'))));unknown=not hh
  # filename-only PSP identity still requires visual confirmation, even for known Cloud alias.
  if c.get('identityReview')=='filename-only-pending-visual-verification':unknown=True
  paths=[]
  for k in ['path','model','convertedFile','file','convertedPath','localPath','nativeModel','sourceModel','sourceBundlePath']:
   val=c.get(k)
   if val and (isinstance(val,str) or isinstance(val,dict) and val.get('path')):
    item=val.copy() if isinstance(val,dict) else {'path':val}
    if pathlib.Path(item['path']).suffix.lower() in ['.glb','.gltf','.gmo','.fbx','.blend','.mdl','.json','.bundle']:
     item.setdefault('sha256', c.get('sourceModelSha256') if k=='sourceModel' else c.get('nativeModelSha256') if k=='nativeModel' else c.get('sha256'))
     item.setdefault('bytes',c.get('sourceModelBytes') if k=='sourceModel' else c.get('nativeModelBytes') if k=='nativeModel' else c.get('bytes'))
     for field in ['resourceRole','variantSlot','nativeId','format','gitPath','componentReady','isStandaloneModelCandidate','sourceAnimationCount','nativeAnimationCount','unconvertedAnimationCount','proceduralAnimationCount','runtimeSelectable','defaultEligible','fullHeroModel','limitations','validationEvidence','visualEvidence','s3Uri','s3ArchiveMember','archiveSha256','readbackVerified']:
      if field in c:item.setdefault(field,c[field])
     if str(pathlib.Path(item['path'])) not in {str(pathlib.Path(existing['path'])) for existing in paths}:paths.append(item)
  if not paths:
   if c.get('descriptorPath'): paths=[{'path':str(pathlib.Path(c['descriptorPath']).with_suffix('.numshb'))}]
   elif c.get('parts'):paths=[{'path':p} for p in c['parts']]
   elif c.get('sourceFiles'):paths=[p for p in c['sourceFiles'] if pathlib.Path(p['path']).suffix.lower() in ['.fbx','.blend']]
  if s['id']=='github-flemmli97-fateubw-07e9d79b':
   # The frozen source record is the durable authority for both the original
   # Bedrock geometry and later verified GLB reserves.  Keep the source model,
   # then attach only the exact standardization attempt IDs selected by the
   # candidate.  This prevents stale audits from discarding successful
   # conversions or accidentally reviving rejected/older attempts.
   for item in paths:
    item.setdefault('resourceRole','character-body-mesh-source')
    item.setdefault('isStandaloneModelCandidate',False)
    item.setdefault('sourceAnimationCount',c.get('sourceAnimation',{}).get('clipCount'))
    item.setdefault('nativeAnimationCount',0)
    item.setdefault('runtimeSelectable',False)
    item.setdefault('defaultEligible',False)
    item.setdefault('fullHeroModel',False)
   attempts={a['id']:a for a in s.get('conversionAttempts',[])}
   for standardization_key in ['bodyStandardization','nativeMotionStandardization']:
    standardization=c.get(standardization_key) or {};attempt_id=standardization.get('attemptId')
    attempt=attempts.get(attempt_id)
    if not attempt:continue
    body=attempt.get('body') or {};body_path=body.get('path')
    if not body_path:continue
    native=attempt.get('nativeAnimations') or {}
    backup=attempt.get('legacyBackup') or {}
    validation={k:attempt[k] for k in ['converterReport','structuralReadback','contractValidation','batchEvidence'] if k in attempt}
    visual={k:attempt[k] for k in ['webglPhaseReview','batchEvidence'] if k in attempt}
    paths.append({
     'id':attempt_id,
     'path':body_path,'bytes':body.get('bytes'),'sha256':body.get('sha256'),
     'format':'glTF Binary','resourceRole':'character-body',
     'isStandaloneModelCandidate':True,'componentReady':False,
     'sourceAnimationCount':native.get('sourceClipCount',c.get('sourceAnimation',{}).get('clipCount')),
     'nativeAnimationCount':native.get('convertedClipCount',0),
     'unconvertedAnimationCount':native.get('unconvertedClipCount',c.get('sourceAnimation',{}).get('clipCount',0)),
     'proceduralAnimationCount':0,'runtimeSelectable':False,
     'defaultEligible':False,'fullHeroModel':False,
     'readiness':attempt.get('status',standardization.get('status')),
     'limitations':attempt.get('missing',[]),
     'validationEvidence':validation,'visualEvidence':visual,
     's3Uri':backup.get('s3Uri'),'s3ArchiveMember':backup.get('s3ArchiveMember'),
     'archiveSha256':backup.get('archiveSha256'),'readbackVerified':backup.get('readbackVerified',False),
    })
  if not paths:issues.append({'sourceId':s['id'],'candidateId':c.get('candidateId',c.get('id')),'reason':'candidate has no explicit model path found'});continue
  add(key,name,work,s,paths,hh,unknown,c.get('identityEvidence',c.get('mappingEvidence',c.get('identityReview','Explicit acquired source candidate manifest'))),[label],c.get('candidateId',c.get('id')),c.get('readiness',c.get('readyStage',c.get('status',s.get('readiness')))),c.get('sourceBodyNodes'))

# Model collections whose first registered target covers only a subset of their characters.
for sid in ['hive-anime-team-survival','github-chiikawa','gtainside-anime-pack']:
 s=bysrc[sid];handled.add(sid)
 for c in s.get('characters',[]):
  hh=c.get('heroIds',[]);nm=c['name'];key=hh[0] if hh else nm
  if nm=='chiikawa':key='chiikawa'
  work='吉伊卡哇' if sid=='github-chiikawa' else (hero_group(hh[0])[1] if hh else '犬夜叉' if nm=='犬夜叉' else 'Sword Art Online' if nm=='亞絲娜' else 'unknown')
  add(key,nm,work,s,[{'path':c['modelPath'],'sha256':c.get('sha256')}],hh,False,c.get('evidence','Source characters[] with actual native geometry file'),cid=sid+':'+nm,readiness='native-parsed-pending-standardization')

# GTA San Andreas complete anime pack: native parser proves mesh and skin for each DFF.
s=bysrc['gtainside-anime-pack'];root=BASE/s['localPath'];d=read(root/'renderware-inspection.json')
for m in d['models']:
 stem=pathlib.Path(m['path']).stem.lower()
 if stem in ['gun_para','katana']:excluded.append({'sourceId':s['id'],'path':m['path'],'reason':'weapon-only DFF'});continue
 defs=[('erza','erza','艾爾莎・史卡雷特','Fairy Tail',[]),('gray','gray','格雷・佛爾帕斯塔','Fairy Tail',[]),('lucy','lucy-heartfilia','露西・哈特菲利亞','Fairy Tail',[]),('natsu','natsu','納茲・多拉格尼爾','Fairy Tail',[]),('sango','sango','珊瑚','犬夜叉',[]),('kamiya','kaoru-kamiya','神谷薰','神劍闖江湖',[]),('kenshin','kenshin','緋村劍心','神劍闖江湖',[]),('kikyo','godie-hvwd','桔梗','犬夜叉',['godie-hvwd']),('miroku','miroku','彌勒','犬夜叉',[]),('zelda','zelda','薩爾達','The Legend of Zelda',[]),('link','link','林克','The Legend of Zelda',['godie-h00l'])]
 match=next((x for x in defs if x[0] in stem),None)
 if match:_,key,name,work,hh=match
 else:key=name=stem;work='unknown';hh=[]
 add(key,name,work,s,[{'path':m['path'],'sha256':m['sha256']}],hh,match is None,'renderware-inspection.json: '+str({k:m[k] for k in ['frames','vertices','triangles','skins'] if k in m}),[stem],cid=s['id']+':'+stem,readiness='native-mesh-and-skin-parsed')

# Unity collections: exact mesh names / avatar names and real typed mesh JSON, retaining the bundle.
def unity_meshes(s):
 p=BASE/s['localPath']/'extraction.json'
 if not p.exists():return []
 d=read(p);out=[]
 for u in d.get('unity',[]):
  for o in u.get('objects',[]):
   if o['type']=='Mesh':out.append((u,o,{'path':'unity-extracted/'+u['resource']+'/'+str(o['pathId'])+'.json'}))
 return out
s=bysrc['thunderstore-rezero'];handled.add(s['id'])
for u,o,p in unity_meshes(s):
 nm=o.get('name',''); mm={'felix':('felix','菲利克斯／菲莉絲',[]),'emiliashuiyi':('emilia','愛蜜莉雅',[]),'ram':('ram','拉姆',[]),'beatrice':('beatrice','碧翠絲',[]),'rem':('rem','蕾姆',['b2-rem']),'ZHS002_Natsuki_Subaru':('subaru','菜月昴',['community-review-22-20260907'])}.get(nm)
 if not mm:continue
 key,name,hh=mm
 p.update(resourceRole='character-body-mesh-source')
 bundle={'path':u['bundle'],'resourceRole':'shared-source-container'}
 add(key,name,'Re:Zero',s,[p,bundle],hh,False,'Exact named Mesh + Avatar in extraction.json; bundle contains full rig; 0 AnimationClip.',[nm],cid=s['id']+':'+nm,readiness='native-mesh-and-rig-parsed')
s=bysrc['thunderstore-hokuto-lr'];handled.add(s['id'])
pref={'HYM':('hanayama','花山薰','刃牙',[]),'YUJ':('yujiro','範馬勇次郎','刃牙',[]),'BAK':('baki','範馬刃牙','刃牙',[]),'FUDa':('fudoh','山之不動','北斗神拳',[]),'YURe':('yuria','尤莉亞','北斗神拳',[]),'JYU':('juza','雲之修烏','北斗神拳',[]),'AMIi':('amiba','阿米巴','北斗神拳',[]),'SAUm':('souther','沙烏剎','北斗神拳',[]),'KEN':('kenshiro','拳四郎','北斗神拳',['godie-umal','godie-u00l']),'SHUnr':('shu','舒烏','北斗神拳',[]),'RAYnr':('rei-hokuto','雷伊','北斗神拳',[]),'KYS':('kuroyasha','黑夜叉','北斗神拳',[]),'YUD':('yuda','猶大','北斗神拳',[]),'SIN':('shin-hokuto','希恩','北斗神拳',[]),'AKI_vf1':('akira-yuki','結城晶','Virtua Fighter',[]),'TOK':('toki','托席','北斗神拳',[])}
for u,o,p in unity_meshes(s):
 pre=(o.get('name') or '').split(':')[0]
 if pre not in pref:continue
 key,name,work,hh=pref[pre];add(key,name,work,s,[p],hh,False,'Mesh prefix '+pre+' matches source avatar/playermodel names retained in extraction.json; individual parts are one character candidate group.',[o['name']],cid=s['id']+':'+str(o['pathId']),readiness='native-mesh-components-parsed')

# Other initial public MODs: one named target, retain native/converted files and parsed bundle evidence.
simple={
'itch-kmiliz-doraemon':('doraemon','哆啦A夢','哆啦A夢',['godie-n00b']),
'hive-megaman-x':('megaman-x','洛克人 X','Mega Man X',[]),
'hive-sephiroth':('sephiroth','賽菲洛斯','Final Fantasy VII',['godie-u00j']),
'thunderstore-hisoka':('hisoka','西索','HUNTER×HUNTER',['community-review-07-20260907']),
'thunderstore-maomao':('maomao','貓貓','藥師少女的獨語',['b2-maomao']),
'thunderstore-holo':('community-review-09-20260907','赫蘿','狼與辛香料',['community-review-09-20260907']),
'thunderstore-guts':('guts','凱茲','烙印勇士',['b2-guts']),
'thunderstore-gon':('gon','小傑','HUNTER×HUNTER',['godie-ucrl','godie-u034']),
'thunderstore-rimuru-ror2':('rimuru','利姆路','關於我轉生變成史萊姆這檔事',['community-review-11-20260907']),
'thunderstore-iori':('iori','八神庵','The King of Fighters',['community-review-02-20260907']),
'thunderstore-eva01':('eva01','初號機','新世紀福音戰士',['godie-e00r']),
'thunderstore-kenshiro':('kenshiro','拳四郎','北斗神拳',['godie-umal','godie-u00l']),
'steam-korosensei':('korosensei','殺老師','暗殺教室',['community-review-14-20260907']),
'steam-billy-herrington':('billy-herrington','比利海靈頓','Wrestling / meme',['community-review-15-20260907']),
'thunderstore-pikachu-tiny':('pikachu','皮卡丘','Pokémon',['godie-ofar','godie-o02l']),
'thunderstore-pikachu-frankzin':('pikachu','皮卡丘','Pokémon',['godie-ofar','godie-o02l']),
'gtainside-naofumi':('naofumi','岩谷尚文','盾之勇者成名錄',['b2-naofumi']),
'gtainside-light-yagami-kw':('light-yagami','夜神月','Death Note',['godie-emns']),
'gtainside-kenshin':('kenshin','緋村劍心','神劍闖江湖',[]),
'gamebanana-shadow':('cid-kagenou','席德・卡蓋諾／闇影','我想成為影之強者',['b2-shadow']),
'thunderstore-sadako':('sadako','山村貞子','七夜怪談 / Dead by Daylight',[]),
'thunderstore-turbo-granny':('turbo-granny','高速婆婆（招財貓形態）','膽大黨',['community-review-34-20260907']),
'gtainside-lubu':('lubu','呂布','Warriors Orochi',['godie-h01u']),
'thunderstore-goku':('goku','孫悟空','七龍珠',['godie-ogrh','godie-o00x']),
'gta5mod-shinchan-sd2':('shinchan','野原新之助','蠟筆小新',['b2-shinchan']),
'gta5mod-shinchan-kstamil':('shinchan','野原新之助','蠟筆小新',['b2-shinchan']),
'tmr-sinbad-baal':('sinbad','辛巴達（巴力魔裝）','Magi',['b2-sinbad']),
'parallel-ns-alucard-ssbu':('alucard-castlevania','阿魯卡多','Castlevania',[]),
'parallel-community-goblin-slayer-ssbu':('goblin-slayer','哥布林殺手','Goblin Slayer',['b2-goblin'])}
pf=read(LIB/'public-source-files.json')['sources'];filemaps=collections.defaultdict(list)
for s in pf:filemaps[s['id']]+=s.get('files',[])
for sid,(key,name,work,hh) in simple.items():
 s=bysrc[sid];handled.add(sid);root=BASE/s['localPath'];paths=[]
 if sid.startswith('thunderstore-'):
  paths=[p for u,o,p in unity_meshes(s)]
  paths += [{'path':str(p)} for p in root.glob('**/*.glb')]
 else:
  paths=[f for f in filemaps[sid] if pathlib.Path(f['path']).suffix.lower() in ['.glb','.fbx','.dff','.mdl','.mdx','.dae','.ydd','.numshb'] and 'physics' not in f['path'] and 'particle' not in f['path']]
  if not paths:
   for ext in ['*.glb','*.dff','*.mdl','*.dae','*.ydd','*.numshb']:
    paths.extend({'path':str(p)} for p in root.rglob(ext) if '/model/body/' in str(p) or ext not in ['*.numshb'])
 if not paths:issues.append({'sourceId':sid,'reason':'no model path found'});continue
 uncertain=False
 ev=s.get('verification','Public source model')
 if sid=='hive-megaman-x':ev+=' content/champions/community-review-05-20260907.json explicitly says 初代洛克人，不混入 X 或 EXE; acquired X is a distinct character without this hero mapping.'
 add(key,name,work,s,paths,hh,uncertain,ev,cid=sid)

# Any unnamed MDX meshes from the acquired map are separate identity review rows;
# obvious particles/environment are excluded, not invented heroes.
s=bysrc['hive-anime-team-survival'];root=BASE/s['localPath']
mdxnames={'Ace':('ace','波特卡斯・D・艾斯','One Piece',[]),'Aqua-BBS RTG and Dm':('aqua-kh','Aqua','Kingdom Hearts',[]),'Asuna':('亞絲娜','亞絲娜','Sword Art Online',[]),'Cloud Strife':('cloud','克勞德','Final Fantasy VII',['godie-hart']),'HastuneMiku_Ebony':('godie-o02p','初音未來','Vocaloid',['godie-o02p']),'Holo':('community-review-09-20260907','赫蘿','狼與辛香料',['community-review-09-20260907']),'Inuyasha':('犬夜叉','犬夜叉','犬夜叉',[]),'Ichigo':('ichigo','黑崎一護','BLEACH',['godie-h01n','godie-h01o']),'VastoLordeIchigo':('ichigo','黑崎一護','BLEACH',['godie-h01n','godie-h01o']),'KiritoHQ':('kirito','桐谷和人','Sword Art Online',['community-review-19-20260907']),'NeroSaber':('nero-claudius','尼祿・克勞狄烏斯','Fate',[]),'Sango':('sango','珊瑚','犬夜叉',[]),'Shana':('shana','夏娜','灼眼的夏娜',['godie-e008']),'natsu':('natsu','納茲・多拉格尼爾','Fairy Tail',[]),'Wendy (boned) MC':('wendy','溫蒂・瑪貝爾','Fairy Tail',[]),'hero_misaka':('misaka','御坂美琴','科學超電磁砲',['community-review-20-20260907']),'mikoto fixed':('misaka','御坂美琴','科學超電磁砲',['community-review-20-20260907'])}
for p in root.rglob('*.mdx'):
 if p.stem in mdxnames:key,name,work,hh=mdxnames[p.stem];unknown=False
 elif p.stem.startswith('Erza'):key,name,work,hh,unknown='erza','艾爾莎・史卡雷特','Fairy Tail',[],False
 elif p.stem in ['B3_KL','Guild2','LS shiqikuangsan','LS whql','LS ydssx','LS you','Shinobu','sugou','newBRS_flame','whiterockshooter','yaya']:
  key,name,work,hh,unknown='map-native:'+p.stem,p.stem,'unverified source identity',[],True
 else:excluded.append({'sourceId':s['id'],'path':str(p),'reason':'particle / weapon / environment MDX path; not claimed character'});continue
 add(key,name,work,s,[{'path':str(p)}],hh,unknown,'Actual MDX GEOS/BONE/SEQS chunks checked. Native name identity remains visual-unreviewed; unit name evidence exists for four registered characters.',[p.stem],cid=s['id']+':'+p.stem,readiness='native-MDX-reserve')

# OU99 already delivered: exact identity and intentional proxies remain separate.
w=read(LIB/'workflow-model-options.json'); wc=collections.defaultdict(list)
for c in w['candidates']:wc[c['candidateId']].append(c)
for m in w['models']:
 if not m['id'].startswith('ou99:'):continue
 cs=wc[m['id']];exact=[c for c in cs if c.get('identityStatus') not in ['intentional-similar-proxy','source-identity-unverified']]
 hh=sorted({c.get('heroId') for c in exact if c.get('heroId')})
 key=hh[0] if hh else 'ou99-donor:'+m['id']
 s={'id':m['id'],'localPath':str(REPO/'content'),'url':m.get('sourceAssetId'),'readiness':'standardized-runtime-candidate'}
 paths=[{'path':str(REPO/'content'/m['glbPath']),'bytes':m.get('bytes'),'sha256':m.get('sha256')}]
 add(key,m.get('sourceCharacter',m['id']),m.get('sourceWork','unknown'),s,paths,hh,not bool(hh),'workflow-model-options candidate identity status: '+str([(c.get('heroId'),c.get('identityStatus')) for c in cs]),cid=m.get('modelKey'))
 rows[key]['borrowedByHeroIds']=sorted({c['heroId'] for c in cs if c.get('identityStatus')=='intentional-similar-proxy'})

# Keep historical paid staging paths alongside standardized replacements;
# the old size/SHA is checked below because those staging paths are mutable.
paid_manifest=LIB.parent/'ou99-access/glb-manifest.json'
for f in read(paid_manifest)['files']:
 sid='ou99:'+pathlib.Path(f['path']).stem.removeprefix('ou99_')
 match=next((r for r in rows.values() if sid in r['sourceIds']),None)
 if not match:issues.append({'sourceId':sid,'reason':'paid original GLB has no workflow candidate association'});continue
 ss={'id':sid,'localPath':str(REPO/'content'),'url':next((m.get('sourceAssetId') for m in w['models'] if m['id']==sid),None)}
 add(match['id'],match['name'],match['work'],ss,[f],match['mappedHeroIds'],not match.get('hasNamedIdentityEvidence',False),'Historical paid staging GLB path from materials/ou99-access/glb-manifest.json; current bytes are checked against that receipt, not assumed immutable.',cid=sid+':historical-mutable-path-current-glb',readiness='historical-staging-path; current GLB readable; frozen runtime variant separately retained')

# Current ready options are additional versions, without inventing a new source identity.
runtime=read(LIB/'priority-runtime-options.json')
for m in runtime['models']:
 assoc=[(h,o) for h in runtime['heroes'] for o in h.get('options',[]) if o['sourceId']==m['id']]
 hh=[h['id'] for h,o in assoc if o.get('source',{}).get('kind') in ['exact','alternate']]
 if hh: match=next((r for r in rows.values() if set(r['mappedHeroIds']) & set(hh)),None)
 elif m['id']=='runtime:haga-native-visibility-v1':match=rows.get('ou99-donor:ou99:495015')
 else:match=None
 if not match:issues.append({'sourceId':m['id'],'reason':'current ready model identity has no acquired-source association'});continue
 ss={'id':m['id'],'localPath':str(REPO/'content'),'url':m.get('sourceAssetId'),'readiness':'backend-standardized-option; procedural motion provenance preserved'}
 add(match['id'],match['name'],match['work'],ss,[{'path':m['glbPath'],'bytes':m.get('bytes'),'sha256':m.get('sha256')}],hh,not match.get('hasNamedIdentityEvidence',False),'priority-runtime-options.json explicit source.kind '+str([o['source'].get('kind') for h,o in assoc]),cid=m.get('modelKey',m['id']))

# SSBU complete local Blender collection: retain every variant under its native group.
# Only known fighter identifiers receive resolved display names. Unknown groups cannot be called undesigned heroes.
s=bysrc['gitlab-ssbu-models'];handled.add(s['id']);root=BASE/s['localPath'];lfs=read(root/'source-lfs-manifest.json')
fighter_names='bayonetta:Bayonetta;brave:勇者（DQ III／IV／VIII／XI）;buddy:Banjo & Kazooie;captain:Captain Falcon;chrom:Chrom;cloud:克勞德;daisy:Daisy;dedede:King Dedede;demon:三島一八;diddy:Diddy Kong;dolly:Terry Bogard;donkey:Donkey Kong;duckhunt:Duck Hunt;edge:賽菲洛斯;eflame:Pyra;elight:Mythra;falco:Falco Lombardi;fox:Fox McCloud;gamewatch:Mr. Game & Watch;ganon:Ganondorf;gaogaen:Incineroar;gekkouga:Greninja;ike:Ike;inkling:Inkling;jack:Joker（Persona 5）;kamui:Corrin;ken:Ken Masters;kirby:卡比;koopa:Bowser;koopag:Bowser（Giga形態）;koopajr:Bowser Jr.;krool:King K. Rool;link:林克;littlemac:Little Mac;lucario:Lucario;lucas:Lucas;lucina:Lucina;luigi:Luigi;mario:Mario;mariod:Mario（Dr. Mario）;marth:Marth;master:Byleth;metaknight:Meta Knight;mewtwo:Mewtwo;miifighter:Mii Brawler;miigunner:Mii Gunner;miiswordsman:Mii Swordfighter;murabito:Villager;nana:Nana;ness:Ness;packun:Piranha Plant;pacman:Pac-Man;palutena:Palutena;peach:Peach;pfushigisou:Ivysaur;pichu:Pichu;pickel:Steve／Alex等Minecraft服裝;pikachu:皮卡丘;pikmin:Olimar／Alph;pit:Pit;pitb:Dark Pit;plizardon:Charizard;popo:Popo;ptrainer:Pokémon Trainer;purin:Jigglypuff;pzenigame:Squirtle;reflet:Robin;richter:Richter Belmont;ridley:Ridley;robot:R.O.B.;rockman:洛克人;rosetta:Rosalina;roy:Roy;ryu:Ryu;samus:Samus Aran;samusd:Dark Samus;sheik:Sheik;shizue:Isabelle;shulk:Shulk;simon:Simon Belmont;snake:Solid Snake;sonic:Sonic;szerosuit:Samus Aran（Zero Suit）;tantan:Min Min;toonlink:林克（Toon Link）;trail:Sora;wario:Wario;wiifit:Wii Fit Trainer;wolf:Wolf O’Donnell;yoshi:Yoshi;younglink:林克（Young Link）;zelda:薩爾達'
fn=dict(x.split(':',1) for x in fighter_names.split(';'))
fmap={'cloud':('cloud',['godie-hart']),'edge':('sephiroth',['godie-u00j']),'link':('link',['godie-h00l']),'toonlink':('link',['godie-h00l']),'younglink':('link',['godie-h00l']),'pikachu':('pikachu',['godie-ofar','godie-o02l']),'kirby':('kirby',['community-review-06-20260907']),'rockman':('megaman',['community-review-05-20260907']),'zelda':('zelda',[]),'szerosuit':('ssbu-samus',[]),'mariod':('ssbu-mario',[]),'koopag':('ssbu-koopa',[])}
assist_names={'alucard':('alucard-castlevania','阿魯卡多','Castlevania'),'akira':('akira-yuki','結城晶','Virtua Fighter'),'shadow':('shadow-hedgehog','Shadow the Hedgehog','Sonic the Hedgehog'),'zero':('zero-megaman','Zero','Mega Man X'),'guile':('guile','Guile','Street Fighter'),'knuckles':('knuckles','Knuckles','Sonic the Hedgehog'),'waluigi':('waluigi','Waluigi','Mario'),'bomberman':('bomberman','Bomberman','Bomberman'),'shovelknight':('shovel-knight','Shovel Knight','Shovel Knight')}
groups=collections.defaultdict(list)
for f in lfs:
 if f['name'].endswith('.blend'):groups['/'.join(f['name'].split('/')[:2])].append(f)
for native,fs in sorted(groups.items()):
 kind,nm=native.split('/'); hh=[];unknown=True;key='ssbu-native:'+native;name=native;work='Super Smash Bros. Ultimate; original series pending identifier review'
 if kind=='fighter' and nm in fn:
  key,hh=fmap.get(nm,('ssbu-'+nm,[]));name=fn[nm];unknown=False;work='Super Smash Bros. Ultimate'
 elif kind=='assist' and nm in assist_names:key,name,work=assist_names[nm];unknown=False
 # Body path alone is not enough to identify an unknown native group; keep those separate.
 paths=[]
 for f in fs:
  rel=f['name'];segments=rel.split('/')
  body=('/model/body/' in '/'+rel) or (native=='fighter/ptrainer' and '/model/ptrainer/' in '/'+rel)
  item={'path':str(root/'source-repository'/rel),'bytes':f['size'],'sha256':f['oid'],
      'resourceRole':'character-body-costume' if body else 'model-component-or-prop'}
  if body and len(segments)>4 and re.fullmatch(r'c\d+',segments[4]):item['variantSlot']=segments[4]
  paths.append(item)
 add(key,name,work,s,paths,hh,unknown,'Pinned SSBU exported repository '+s['commit']+'; Blender ME datablock checks establish mesh. nativeGroup='+native+'. Names from native roster IDs; no new visual review. Group may contain accessories or multiple costume identities; not a unique-character count.',[native],cid=s['id']+':'+native,readiness='native-Blender-source-reserve')
 rows[key].setdefault('nativeGroups',[]).append(native)

# Converted SSBU components are stored on the source record by the conversion
# workflow. Re-attach them from that durable source metadata so regenerating the
# audit never discards a validated delivery.
for c in s.get('componentCandidates',[]):
 for identity_id in c.get('identityIds',[]):
  row=rows.get(identity_id)
  if row is None:continue
  item={field:c[field] for field in ['path','bytes','sha256','resourceRole','nativeId','gitPath','componentReady','nativeAnimationCount','proceduralAnimationCount','runtimeSelectable','defaultEligible','fullHeroModel','limitations','validationEvidence','visualEvidence'] if field in c}
  item['format']='glTF Binary' if pathlib.Path(c['path']).suffix.lower()=='.glb' else c.get('format')
  add(identity_id,row['name'],row['work'],s,[item],row.get('mappedHeroIds',[]),False,
      c.get('auditEvidence') or 'Converted component retained from download-sources componentCandidates; validation and limitations remain attached to the candidate.',
      cid=c['id'],readiness=c.get('readiness'))

# Source coverage is explicit: audio/texture/tool-only and unparsed containers are not models.
for s in sources:
 if s['id'] in handled:continue
 reason='no actual body-model candidate in source; audio/texture/tool/component-only or unparsed container'
 excluded.append({'sourceId':s['id'],'assetKinds':s.get('assetKinds',[]),'reason':reason,'verification':s.get('verification','')})

def design(hid):
 h=invmap.get(hid,{});rid=h.get('runtimeHeroId',hid); hit=champs.get(rid) or champs.get(hid)
 if not hit:return {'heroId':hid,'runtimeHeroId':rid,'status':'not-defined','reason':'No content/champions JSON with this id'}
 p,d=hit;refs=[];missing=[];placeholder=[]
 slots=dict(d.get('abilities',{}))
 if d.get('exAbility'):slots['EX']=d['exAbility']
 if d.get('passiveAbility'):slots['PASSIVE']=d['passiveAbility']
 for slot,a in slots.items():
  aid=a.get('id') if isinstance(a,dict) else a;hitA=abils.get(aid)
  evidence={'slot':slot,'id':aid,'name':(hitA[1].get('name') if hitA else a.get('name') if isinstance(a,dict) else None),'standaloneExists':bool(hitA)}
  if hitA:evidence.update(path=str(hitA[0]),sha256=sha(hitA[0]),provenance=hitA[1].get('provenance'));aa=hitA[1]
  else:missing.append(aid);aa=a if isinstance(a,dict) else {}
  # Only explicit metadata/prose markers are reported; template usage does not imply placeholder.
  fields={k:aa.get(k) for k in ['status','provenance','placeholder','isPlaceholder','implementationStatus'] if k in aa}
  markers=[k for k,v in fields.items() if v is True and 'placeholder' in k.lower() or isinstance(v,str) and ('placeholder' in v.lower() or v in ['generic','unimplemented','not-implemented'])]
  if markers:placeholder.append({'id':aid,'metadata':fields})
  evidence['effectKinds']=sorted({e.get('kind') for e in aa.get('effects',[]) if isinstance(e,dict) and e.get('kind')})
  refs.append(evidence)
 status='definitions-incomplete' if missing or not refs or placeholder else 'designed'
 return {'heroId':hid,'runtimeHeroId':rid,'status':status,'championPath':str(p),'championSha256':sha(p),'name':d.get('name'),'skillCount':len(refs),'skills':refs,'missingStandaloneSkillIds':missing,'explicitPlaceholderEvidence':placeholder,'selectedModelKey':d.get('modelKey'),'inventoryDefault':h.get('default'),'note':'Definition/file completeness only; no new mechanics or runtime E2E validation. Generic effect kinds or template references are not treated as placeholder evidence.'}

# Merge aliases by explicit same-character hero identity (never by proxy recipient).
while True:
 pair=None;rr=list(rows.values())
 for i,a in enumerate(rr):
  for b in rr[i+1:]:
   if set(a['mappedHeroIds']) & set(b['mappedHeroIds']):pair=(a,b);break
  if pair:break
 if not pair:break
 a,b=pair
 for field in ['sourceIds','modelCandidates','mappedHeroIds','evidence','aliases','identityAmbiguity','nativeGroups']:
  if field in b:
   a.setdefault(field,[])
   for value in b[field]:
    if value not in a[field]:a[field].append(value)
 a['aliases']+= [b['name'],b['id']]
 a['hasNamedIdentityEvidence']=a.get('hasNamedIdentityEvidence',False) or b.get('hasNamedIdentityEvidence',False)
 del rows[b['id']]
for r in rows.values():
 r['mappedHeroIds']=sorted(set(r['mappedHeroIds']));r['heroDefinitions']=[design(h) for h in r['mappedHeroIds']]
 actual=any(c['existsLocal'] and c.get('bytes',0)>0 for c in r['modelCandidates'])
 r['hasActualModelFiles']=actual
 if r['identityAmbiguity'] and not r.get('hasNamedIdentityEvidence'):r['designStatus']='identity-review'
 elif not r['mappedHeroIds']:r['designStatus']='not-defined'
 elif all(h['status']=='designed' for h in r['heroDefinitions']):r['designStatus']='designed'
 else:r['designStatus']='definitions-incomplete'
 if not actual:r['designStatus']='identity-review';r['identityAmbiguity'].append('No actual model file verified locally; excluded from confirmed acquired-model gaps.')
 r['skillsCheckedAgainst']={'championDirectory':str(REPO/'content/champions'),'standaloneAbilityDirectory':str(REPO/'content/abilities'),'nameSearchUniverseCount':len(champs),'policy':'Exact identity mapping against all inventory + champion names; same-name/donor-proxy is not automatically equivalent.'}
 r['sourceIds']=sorted(r['sourceIds']);r['identityAmbiguity']=sorted(set(r['identityAmbiguity']))

pins=[]
for p in [LIB/'download-sources.json',LIB/'inventory.json',LIB/'workflow-model-options.json',LIB/'public-source-files.json',LIB/'priority-runtime-options.json']:
 pins.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size})
out={'schema':'ggd-undesigned-community-audit@1','generatedAt':args.generated_at or datetime.datetime.now(datetime.timezone.utc).isoformat(),'repo':str(REPO),'scope':'READONLY acquired public/community/paid-OU99/console/MOD model candidates excluding primary 300/MBA models. Retargets using those animations remain as community-body versions. Original local LoL corpus is audited by the root workflow separately.','policy':{'not-defined':'Known character identity, actual local model and no exact champion definition mapping in current roster.','definitions-incomplete':'Exact hero mapping exists but referenced ability file absent, zero skills, or explicit placeholder metadata.','identity-review':'Source native name/generic donor/component identity unverified; never counts as confirmed undesigned character.','designed':'Exact hero mapping and concrete standalone ability files exist; quality/runtime readiness not asserted.'},'inputPins':pins,'championDefinitionCount':len(champs),'standaloneAbilityCount':len(abils),'characters':sorted(rows.values(),key=lambda r:(r['designStatus'],r['work'],r['name'])),'excludedSourcesOrParts':excluded,'issues':issues,'summary':dict(collections.Counter(r['designStatus'] for r in rows.values()))}
out['summary'].update(characterGroups=len(rows),actualModelCandidateFiles=sum(c['existsLocal'] for r in rows.values() for c in r['modelCandidates']),missingCandidatePaths=sum(not c['existsLocal'] for r in rows.values() for c in r['modelCandidates']),publicSourcesInspected=len(sources),nativeSSBUGroups=len(groups),ssbuBlendFiles=sum(len(x) for x in groups.values()))
out['summary']['uniqueExistingModelPaths']=len({c['path'] for r in rows.values() for c in r['modelCandidates'] if c['existsLocal']})
out['summary']['knownNotDefinedGroups']=sum(r['designStatus']=='not-defined' for r in rows.values())
out['countingNote']='All totals are candidate/identity groups, not an asserted unique franchise-character count: e.g. DQ Hero, Minecraft costumes, Olimar/Alph and Pokémon Trainer still group multiple costumes/persons. Identity-review groups include unnamed mesh components and must not be added to new-hero totals.'
out['scopeLimits']=['No human visual review in this audit. Source names and existing parsed manifests are preserved.','GMO filename-only character identities remain review-required.','Unknown SSBU native identifier groups (including projectiles, bosses, Pokémon and assistants) remain review-required, not confirmed undesigned heroes.','OU99 intentional proxy donor identities remain review-required; borrowedByHeroIds is not an exact mapping.','No design quality or runtime combat assertion is inferred from complete definition files.','Original local LoL corpora and 300/MBA are outside this subagent scope.']
out['inputPins'].append({'path':str(paid_manifest),'sha256':sha(paid_manifest),'bytes':paid_manifest.stat().st_size})
historical_mismatches=[]
for r in out['characters']:
 for c in r['modelCandidates']:
  if c.get('sizeMatchesManifest') is False:
   c['recordedSha256']=c.get('sha256');c['sha256']=sha(c['path']);c['sha256Status']='freshly-hashed-current-file; differs from historical mutable-path manifest size'
   historical_mismatches.append({'id':c['id'],'path':c['path'],'actualBytes':c['bytes'],'recordedBytes':c['recordedBytes'],'actualSha256':c['sha256'],'recordedSha256':c['recordedSha256'],'classification':'historical mutable-path manifest mismatch; actual GLB header and mesh valid; no central edit'})
out['historicalManifestMismatches']=historical_mismatches
out['summary']['historicalMutableManifestMismatchCount']=len(historical_mismatches)
if args.output_repo_path:
 source_prefix=str(REPO);output_prefix=str(args.output_repo_path.resolve())
 def rewrite_repo_paths(value):
  if isinstance(value,str) and (value==source_prefix or value.startswith(source_prefix+'/')):return output_prefix+value[len(source_prefix):]
  if isinstance(value,list):return [rewrite_repo_paths(item) for item in value]
  if isinstance(value,dict):return {key:rewrite_repo_paths(item) for key,item in value.items()}
  return value
 out=rewrite_repo_paths(out)
path=args.output;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(path),'sha256':sha(path),'bytes':path.stat().st_size,'summary':out['summary'],'issues':issues},ensure_ascii=False))
