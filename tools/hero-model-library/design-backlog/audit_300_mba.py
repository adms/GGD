import collections,datetime,hashlib,json,re,sqlite3,unicodedata,os
from pathlib import Path
R=Path.cwd();B=R.parent;M=R/'materials/hero-model-library';registry=B/'outputs/asset-library-registry-20260907';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text())
chars=[x for x in read(registry/'characters.json') if x['library'] in ['300heroes','mba']];charsby={x['id']:x for x in chars};roster={str(x['id']):x for x in read(B/'GGD-Asset-Library/outputs/game-asset-library-20260907/300heroes-roster.json')['characters']};native300={str(x['id']):x for x in read(B/'outputs/game-asset-library-20260907/300heroes/character-candidates.json')};herochecks=read(Path(os.environ.get('GGD_DESIGN_SOURCE_ABILITY_CHECKS','/private/tmp/ggd-undesigned-hero-ability-checks.json')))['heroes'];heroes={h['id']:h for h in herochecks};champdocs={h['id']:read(Path(h['path'])) for h in herochecks}
materials={p:read(p) for p in sorted(p for p in M.rglob('*.json') if 'design-backlog' not in p.parts and p.name!='已取得模型待設計英雄.json')};inventory=materials[M/'inventory.json'];heroNames=collections.defaultdict(set);heroWorks=collections.defaultdict(set)
for h in heroes.values():heroNames[h['id']].add(h['name'])
for h in inventory['heroes']:
 if h['id'] in heroes:heroNames[h['id']].add(h['name']);heroWorks[h['id']].add(h.get('work',''))
allheroids=set(heroes)|{h['id'] for h in inventory['heroes']};aliases=inventory.get('aliases',{});allheroids.update(aliases)
# Only source-character identifiers and registry relationships, not free-text guesses.
con=sqlite3.connect('file:'+str(registry/'catalog.sqlite')+'?mode=ro',uri=True);assetmap=collections.defaultdict(set);assetconf=collections.defaultdict(set)
for cid,aid,conf in con.execute("select l.character_id,l.asset_id,l.confidence from links l join assets a on a.id=l.asset_id where a.kind='model' and a.library in ('300heroes','mba')"):
 assetmap[aid].add(cid);assetconf[aid].add(conf)
# The historic registry omitted relationships when the official model's numeric
# basename differs from the character ID (104 Gilgamesh uses 099.x). Join exact
# source-defined paths, never infer identity from a numeric prefix alone.
officialpaths=collections.defaultdict(set)
for c in chars:
 for key in ['base_model','glb']:
  if c.get(key):officialpaths[str(Path(c[key]))].add(c['id'])
pathjoin=[]
for aid,path in con.execute("select id,path from assets where kind='model' and library in ('300heroes','mba')"):
 for cid in officialpaths.get(path,[]):
  if cid not in assetmap[aid]:pathjoin.append({'sourceId':cid,'assetId':aid,'path':path,'confidence':'exact-official-body-path'})
  assetmap[aid].add(cid);assetconf[aid].add('exact-official-body-path')
def sourceids(s):
 if not isinstance(s,str):return set()
 if s in charsby:return {s}
 if s in assetmap:return assetmap[s]
 return {x for x in re.findall(r'(300heroes:\d{1,3}|mba:Chara\d{2}(?:_[A-Za-z0-9]+)?)(?![A-Za-z0-9_])',s) if x in charsby}
# Guard against a numeric-looking prefix of a hashed asset id.
assert sourceids('300heroes:7bdfoo')==set()
model_sources=collections.defaultdict(set);converted=collections.defaultdict(list)
for p,d in materials.items():
 if isinstance(d,dict):
  for model in d.get('models',[]) if isinstance(d.get('models'),list) else []:
   if not isinstance(model,dict):continue
   ids=set()
   for key in ['id','sourceId','sourceAssetId','sourceCharacterId']:ids|=sourceids(model.get(key))
   if ids and model.get('modelKey'):
    model_sources[model['modelKey']]|=ids
    if model.get('glbPath'):
     for cid in ids:converted[cid].append((model,p))
mappings=collections.defaultdict(list);seen=set()
def record(cid,hid,kind,p,pointer,via):
 hid=aliases.get(hid,hid);key=(cid,hid,kind,str(p),pointer,via)
 if key in seen:return
 seen.add(key);mappings[cid].append({'heroId':hid,'kind':kind,'file':str(p),'pointer':pointer,'via':via})
def scan(node,p,pointer='',context=(),kind='unspecified'):
 if isinstance(node,dict):
  local=[node.get(k) for k in ['heroId','runtimeHeroId','championId','id'] if node.get(k) in allheroids]
  if isinstance(node.get('heroIds'),list):local += [v for v in node['heroIds'] if v in allheroids]
  if local:context=tuple(sorted(set(local)))
  src=node.get('source');newkind=src.get('kind') if isinstance(src,dict) else None
  if newkind in ['exact','alternate','style-proxy','previous','borrowed','procedural']:kind=newkind
  elif node.get('kind') in ['exact','alternate','style-proxy','previous','borrowed','procedural']:kind=node['kind']
  if context:
   for k,v in node.items():
    if not isinstance(v,str):continue
    ids=sourceids(v) if k in ['id','sourceId','sourceAssetId','sourceCharacterId','character_id','reference'] else set()
    if k in ['key','modelKey','sourceModelKey','existingModelKey']:ids|=model_sources.get(v,set())
    for cid in ids:
     for hid in context:record(cid,hid,kind,p,pointer+'/'+k,k)
  for k,v in node.items():scan(v,p,pointer+'/'+str(k),((k,) if k in allheroids else context),kind)
 elif isinstance(node,list):
  for i,x in enumerate(node):scan(x,p,pointer+'/'+str(i),context,kind)
for p,d in materials.items():scan(d,p)
for hid,d in champdocs.items():scan(d,Path(heroes[hid]['path']))
pairs=materials[M/'pairing-inputs.json']
for h in pairs.get('batch2',[]):
 for key in ['primary','alternates']:
  xs=h.get(key,[]);xs=xs if isinstance(xs,list) else [xs]
  for x in xs:
   cid='300heroes:'+str(x.get('id'))
   if cid in charsby:record(cid,h['id'],'style-proxy',M/'pairing-inputs.json','/batch2/'+h['id']+'/'+key,'explicit visual pairing')
# Approved derivative entries explicitly copy another character, not an identity.
for i,d in enumerate(materials[M/'derivatives.json']['entries']):
 for cid in sourceids(d.get('sourceId')):
  record(cid,d['heroId'],'style-proxy',M/'derivatives.json','/entries/'+str(i),'approved copied/edited proxy source')
# Local name + work review resolves spelling and age-form aliases without
# modifying central registration. These are design-identity joins, not claims
# that the corresponding model option has already been wired into that hero.
reviewedidentities={
 '300heroes:35':(['godie-hvwd'],'Source canonical 桔梗 / 犬夜叉 equals GGD 除魔巫女 - 桔梗 / 犬夜叉.'),
 '300heroes:112':(['godie-o00x','godie-ogrh'],'Source explicitly identifies 孫悟空 childhood appearance / Dragon Ball; GGD 悟空 / 七龍珠 designs cover the same character. No claim of a separate child-Goku design or model option.'),
 '300heroes:113':(['godie-u00j'],'Source 賽菲羅斯／薩菲羅斯 / Final Fantasy VII and GGD 賽菲洛斯 / 最終幻想7 are the same Sephiroth identity; this is a reviewed spelling alias, not fuzzy absence.')
}
for cid,(hids,note) in reviewedidentities.items():
 for hid in hids:
  ix=next(i for i,h in enumerate(inventory['heroes']) if h['id']==hid)
  record(cid,hid,'reviewed-identity',M/'inventory.json','/heroes/'+str(ix),note)
# Group only documented same-character forms; Alter remains separate from Ruler.
groupmap={}
for c in chars:
 key=c['id']
 if c['library']=='300heroes':
  n=c['id'].split(':')[1]
  if n in ['219','220']:key='300heroes:220'
  if n in ['250','259']:key='300heroes:250'
  if n in ['272','273','276']:key='300heroes:272'
  if n in ['197','329']:key='300heroes:197'
 else:
  n=c['id'].split(':')[1]
  if n in ['Chara01','Chara12_01','Chara12_02']:key='300heroes:165'
  elif n in ['Chara04_01','Chara04_02','Chara15_01','Chara15_02']:key='300heroes:169'
  elif n=='Chara02':key='300heroes:46'
  elif n=='Chara03':key='300heroes:292'
  elif n=='Chara10':key='300heroes:208'
  elif n in ['Chara07_01','Chara07_02']:key='mba:Chara07'
 groupmap[c['id']]=key
def norm(s):return ''.join(c.lower() for c in unicodedata.normalize('NFKC',str(s)) if c.isalnum())
def nameparts(s):
 result={s};result.update(re.split(r'\s+-\s+|[／/]|[（(]',s));return {norm(x) for x in result if len(norm(x))>=2}
heroaliases={hid:set().union(*(nameparts(n) for n in ns)) for hid,ns in heroNames.items()}
unknown_words=re.compile('未核|待核|不明|待確認|未知|未明')
rows=collections.defaultdict(list);exclusions=[]
for c in chars:
 if c['id'] in ['300heroes:390','300heroes:391','300heroes:392']:
  exclusions.append({'sourceId':c['id'],'name':c['name'],'reason':'documented skill prop/summon, not an independent character body','actualPath':c['base_model'],'existsLocal':Path(c['base_model']).is_file(),'sourceEvidence':roster[c['id'].split(':')[1]]['origin_note']});continue
 rows[groupmap[c['id']]].append(c)
output=[]
for gid,members in rows.items():
 first=next((c for c in members if c['id']==gid),members[0]);official=roster.get(first['id'].split(':')[1],{}) if first['library']=='300heroes' else {};name=official.get('canonical_character',first['name']);work=first['origin'];names=set();works=set();models=[];supplemental=[];primarymissing=[];allmaps=[];inputevidence=[]
 for c in members:
  names.update(c.get('aliases',[]));names.add(c['name']);works.add(c['origin']);o=roster.get(c['id'].split(':')[1],{}) if c['library']=='300heroes' else {};names.add(o.get('canonical_character',c['name']));allmaps+=mappings[c['id']];base=Path(c['base_model']);paths=[(base,'official-base-body' if c['library']=='300heroes' else 'character-definition-body','native')]
  if c['library']=='300heroes':
   nc=native300[c['id'].split(':')[1]]
   for rel in nc['native_model_paths']:
    native=B/'outputs/game-asset-library-20260907/300heroes/raw'/rel
    if native==base:continue
    if c['id']=='300heroes:334' and native.stem=='334' and native.suffix=='.model':paths.append((native,'official-base-body-alternate-native-extension','native'))
    elif re.fullmatch(r'\d{3}_skin\d+(?:_\d+)?\.(?:x|model)',native.name,re.I):paths.append((native,'skin-body-candidate','native-body-identity-unreviewed'))
    else:
     if native.is_file():supplemental.append({'sourceId':c['id'],'path':str(native),'bytes':native.stat().st_size,'existsLocal':True,'resourceRole':'unverified-variant-or-component','notCountedAsFullBody':True})
  if c.get('glb'):paths.append((Path(c['glb']),'converted-character-body',c['readiness']))
  for p,role,ready in paths:
   exists=p.is_file();size=p.stat().st_size if exists else 0
   if not exists:
    if p==base:primarymissing.append({'sourceId':c['id'],'path':str(p),'reason':'declared source path does not exist'})
    continue
   models.append({'id':c['id']+':'+p.name,'sourceCharacterId':c['id'],'library':c['library'],'path':str(p),'bytes':size,'readiness':ready,'existsLocal':True,'resourceRole':role,'identityConfidence':'character_definition' if c['library']=='mba' else 'numeric_prefix_candidate' if role=='skin-body-candidate' else 'official_base_model','sourceIndex':c['source_index']})
  for m,p in converted[c['id']]:
   path=R/'content'/m['glbPath'];exists=path.is_file()
   if exists:models.append({'id':m['id']+':'+m['modelKey'],'sourceCharacterId':c['id'],'library':c['library'],'path':str(path),'bytes':path.stat().st_size,'sha256':m.get('sha256'),'readiness':m.get('validation','converted-candidate'),'existsLocal':True,'resourceRole':'ggd-converted-body','modelKey':m['modelKey'],'identityConfidence':'explicit-source-model-registration','sourceIndex':str(p)})
  inputevidence.append({'sourceId':c['id'],'sourceIndex':c['source_index'],'officialDefinition':c.get('definition',o.get('model_path')),'originStatus':c.get('origin_status'),'canonicalName':o.get('canonical_character',c['name']),'canonicalWork':o.get('origin_work',c['origin']),'originNote':o.get('origin_note'),'bodyQualification':'character_definition' if c['library']=='mba' else 'official_base_model'})
 models=list({m['path']:m for m in models}.values())
 for m in models:
  m['format']=Path(m['path']).suffix.lstrip('.').lower()
  if m.get('sha256'):m['sha256Evidence']='declared in sourceIndex; file existence/size checked by this audit, not rehashed'
 primary=[m for m in models if m['resourceRole'] in ['official-base-body','official-base-body-alternate-native-extension','character-definition-body']]
 if not primary:
  exclusions.append({'sourceIds':[c['id'] for c in members],'name':name,'work':work,'reason':'no existing source-defined full body; numeric-prefix variants alone are insufficient','missingPrimary':primarymissing,'unverifiedCandidates':models});continue
 an=set().union(*(nameparts(n) for n in names if not re.fullmatch(r'\d+|Name_\w+|Chara\w+',n)))
 candidate={hid for hid,nn in heroaliases.items() if an&nn or any(a in b or b in a for a in an for b in nn if min(len(a),len(b))>=3)}
 rejected=[]
 if gid=='300heroes:198' and 'godie-hvsh' in candidate:
  candidate.remove('godie-hvsh');rejected.append({'heroId':'godie-hvsh','reason':'Rider is a shared servant class, not character identity. Source explicitly 伊斯坎達爾 / Fate/Zero; GGD explicitly 梅杜莎 / Fate/stay night. Canonical people and source works differ.'})
 identity={e['heroId'] for e in allmaps if e['kind'] in ['exact','alternate','reviewed-identity']};proxy={e['heroId'] for e in allmaps if e['kind']=='style-proxy'};mapped={e['heroId'] for e in allmaps};unclassified=mapped-identity-proxy;presentidentity=identity&set(heroes);missingidentity=identity-set(heroes)
 # An exact written name is evidence for review, not enough to prove same character across works.
 evidence_review=candidate-identity-proxy
 ambiguous=bool(unknown_words.search(name+' '+work+' '+str(official.get('origin_status',''))))
 if presentidentity:
  status='designed' if any(heroes[h]['validAbilityRefs'] and heroes[h]['championSchemaValid'] for h in presentidentity) else 'definitions-incomplete'
 elif missingidentity:status='definitions-incomplete'
 elif ambiguous or evidence_review or unclassified:status='identity-review'
 else:status='not-defined'
 reason={'designed':'Explicit exact/alternate source mapping or reviewed canonical name+work identity resolves to a champion with valid standalone ability references. Model option wiring is a separate status.','definitions-incomplete':'Explicit identity mapping exists but champion or required valid ability references are missing.','identity-review':'Identity/name evidence is ambiguous or an untyped existing mapping needs review; not claimed absent.','not-defined':'No exact/alternate hero identity mapping or plausible unmatched name/alias counterpart after scanning all library mappings and all champion names/works; proxy reuse does not implement the source character.'}[status]
 output.append({'id':gid,'name':name,'work':work,'works':sorted(works),'sourceIds':[c['id'] for c in members],'aliases':sorted(names),'modelCandidates':models,'mappedHeroIds':sorted(mapped),'identityHeroIds':sorted(identity),'proxyUseHeroIds':sorted(proxy),'possibleIdentityHeroIds':sorted(evidence_review|unclassified),'designStatus':status,'noDesignReason':reason,'convertedReadiness':{'nativeBodyPresent':True,'convertedCandidateCount':sum(m['resourceRole'] in ['ggd-converted-body','converted-character-body'] for m in models),'hasGgdConvertedBody':any(m['resourceRole']=='ggd-converted-body' for m in models),'renderAcceptancePerformedByThisAudit':False},'abilityChecks':[{'heroId':hid,**{k:v for k,v in heroes[hid].items() if k not in ['id','name','path']}} for hid in sorted(mapped|candidate) if hid in heroes],'evidence':{'source':inputevidence,'explicitMappings':list({(e['heroId'],e['kind'],e['file'],e['pointer']):e for e in allmaps}.values()),'nameCandidates':[{'heroId':h,'names':sorted(heroNames[h]),'works':sorted(heroWorks[h])} for h in sorted(candidate)],'rejectedNameCandidates':rejected,'nameAndWorkCatalogChecked':True,'identityUncertain':ambiguous,'scope':'current checkout definitions and mappings; not all possible unrecorded offline designs'},'missingFormModels':primarymissing,'supplementalModelsNotCountedAsBodies':supplemental})
output.sort(key=lambda x:(x['designStatus'],x['id']))
r={'schema':'ggd.undesigned-source-audit@1','scope':['300heroes','mba'],'readOnly':True,'characters':output,'exclusions':exclusions,'counts':{'sourceDefinitionEntries':len(chars),'uniqueCharacterGroupsWithActualBody':len(output),'sourceFamilies':dict(collections.Counter(c['library'] for c in chars)),'designStatus':dict(collections.Counter(x['designStatus'] for x in output)),'ggdChampionsChecked':len(heroes),'allChampionAbilityRefsValid':all(h['validAbilityRefs'] for h in heroes.values()),'mappingJsonFilesScanned':len(materials)},'mappingScan':{'root':str(M),'allJsonFilesRead':len(materials),'explicitSourceIdAndAssetIdAndModelKeyJoins':True,'aliasesAreReviewEvidenceOnly':True,'proxyUseDoesNotCountAsSourceDesign':True},'inputFingerprints':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in [registry/'characters.json',registry/'catalog.sqlite',B/'GGD-Asset-Library/outputs/game-asset-library-20260907/300heroes-roster.json']]+[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in materials],'limitations':['No rendering/new conversion/download was performed. Existing native bodies qualify from official base-model or character-definition relationships and live file stats; skin numeric prefix candidates remain unreviewed.','All153 champion schemas and their referenced standalone ability documents parsed with current Zod schemas; this is implementation-data presence, not runtime/skill-balance acceptance.','MBA21form definitions now have actual native bodies;20GLB exist. Earlier6missing-mainmodel snapshot is superseded by live files.','Appearance forms are grouped from explicit source notes and MBA definitions; different Fate Ruler/Alter identities remain separate.','Cross-library same-character unions are limited to known300/MBA Nana/Fate/Lina/Sakura/Hayate matches; no global fuzzy merging.']}
r['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
r['mappingScan']['exactOfficialBodyPathJoins']=pathjoin
r['mappingScan']['reviewedCanonicalIdentityJoins']={cid:{'heroIds':v[0],'reason':v[1]} for cid,v in reviewedidentities.items()}
r['mappingScan']['aliasesAreReviewEvidenceOnly']=True
r['mappingScan']['manuallyReviewedNameAndWorkJoinsSeparatelyIdentified']=True
r['mappingScan']['definitionIndex']=str(Path(os.environ.get('GGD_DESIGN_SOURCE_ABILITY_CHECKS','/private/tmp/ggd-undesigned-hero-ability-checks.json')))
r['counts']['nativeSourceBodyCandidates']=sum(m['resourceRole'] in ['official-base-body','official-base-body-alternate-native-extension','character-definition-body'] for x in output for m in x['modelCandidates'])
r['counts']['localModelCandidates']=sum(len(x['modelCandidates']) for x in output)
r['counts']['noDesignByFamily']={lib:sum(x['designStatus']=='not-defined' and any(s.startswith(lib+':') for s in x['sourceIds']) for x in output) for lib in ['300heroes','mba']}
r['inputFingerprints'] += [{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in [Path(os.environ.get('GGD_DESIGN_SOURCE_ABILITY_CHECKS','/private/tmp/ggd-undesigned-hero-ability-checks.json')),Path(__file__),B/'outputs/game-asset-library-20260907/300heroes/character-candidates.json',B/'outputs/game-asset-library-20260907/magical-battle-arena/character-candidates.json']]
r['limitations'].append('Model files total several GB; SHA on converted candidates is retained source-manifest evidence, not a new full native-byte hash pass. Every listed file was checked with live stat.')
r['limitations'].append('300197/329 Timi and malfunction form are grouped by explicit source origin note. Duo entries 282 Kazuma+Megumin and295 Satori+Koishi remain source compound-character entries; no unsupported body split is claimed.')
r['limitations']=[s.replace('Nana/Fate/Lina/Sakura/Hayate','Nanoha/Fate Testarossa/Lina/Sakura/Hayate') for s in r['limitations']]
p=Path(os.environ.get('GGD_DESIGN_SOURCE_OUTPUT','/private/tmp/ggd-undesigned-300-mba.json'));p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r['counts'],ensure_ascii=False));print('REVIEW',[(x['id'],x['name'],x['possibleIdentityHeroIds']) for x in output if x['designStatus']=='identity-review']);print('INCOMPLETE',[(x['id'],x['name'],x['identityHeroIds']) for x in output if x['designStatus']=='definitions-incomplete']);print('EXCLUDED',[(x.get('sourceIds',x.get('sourceId')),x['name']) for x in exclusions])
