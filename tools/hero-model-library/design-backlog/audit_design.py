from pathlib import Path
import json,hashlib,datetime,subprocess,re,collections,argparse
parser=argparse.ArgumentParser();parser.add_argument('--analysis',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--compact',type=Path,required=True);args=parser.parse_args()
ROOT=Path.cwd();B=ROOT/'materials/hero-model-library';OUT=args.output
OUT.parent.mkdir(parents=True,exist_ok=True);args.compact.parent.mkdir(parents=True,exist_ok=True)
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def ev(p):
 p=Path(p);return dict(path=p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p),sha256=sha(p),bytes=p.stat().st_size)
def verify_pins(pins,stage):
 changed=[]
 for pin in pins:
  p=Path(pin['path']);p=p if p.is_absolute() else ROOT/p
  if not p.is_file() or sha(p)!=pin['sha256']:changed.append(pin['path'])
 if changed:raise ValueError('Analysis inputs changed '+stage+'; rerun Node analysis: '+', '.join(changed[:12]))
def verify_analysis_snapshot(analysis,stage):
 pins=analysis.get('inputFiles',[])
 if not pins or not analysis.get('inputSnapshotVerified') or not analysis.get('inputScopes'):
  raise ValueError('Node analysis must include verified inputFiles and inputScopes; rerun analyze_abilities.mts.')
 if Path(analysis['repo']).resolve()!=ROOT.resolve():raise ValueError('Analysis belongs to a different checkout; rerun Node analysis in '+str(ROOT))
 verify_pins(pins,stage)
 current=set(analysis.get('inputExtraFiles',[]))
 for scope in analysis['inputScopes']:
  directory=ROOT/scope['path'];paths=directory.rglob('*') if scope['recursive'] else directory.glob('*')
  for p in paths:
   if p.is_file() and (not scope.get('excludeUnderscore') or not p.name.startswith('_')) and any(p.name.endswith(ext) for ext in scope['extensions']):current.add(p.relative_to(ROOT).as_posix())
 if current!={pin['path'] for pin in pins}:raise ValueError('Analysis input file membership changed '+stage+'; rerun Node analysis.')
def walk(x,path=''):
 if isinstance(x,dict):
  yield path,x
  for k,v in x.items():yield from walk(v,(path+'.' if path else '')+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from walk(v,(path+'.' if path else '')+str(i))
def placeholder_evidence(d):
 found=[]
 for k in ['placeholder','isPlaceholder','isStub','todo']:
  if d.get(k) is True:found.append({'field':k,'value':True,'basis':'explicit marker'})
 pattern=r'(?i)(?:\bplaceholder\b|\bstub\b|\bTODO\b|\bTBD\b|待設計|待實作|待實現|通用技能占位|通用技能佔位|^占位$|^佔位$)'
 for k in ['name','description','provenance']:
  if isinstance(d.get(k),str) and re.search(pattern,d[k]):found.append({'field':k,'value':d[k],'basis':'explicit wording; text interpolation such as {{radius}} is excluded'})
 return found
analysis_bytes=args.analysis.read_bytes();ana=json.loads(analysis_bytes)
analysis_file_pin=dict(path=str(args.analysis.resolve()),sha256=hashlib.sha256(analysis_bytes).hexdigest(),bytes=len(analysis_bytes))
verify_analysis_snapshot(ana,'before Python coverage')
python_input_files=[ev(p) for p in [Path(__file__).resolve(),B/'inventory.json',B/'current-production.json',ROOT/'tools/skill-remake/form_counterparts.py']]
analyses={r['id']:r for r in ana['abilities']};champchecks={r['id']:r for r in ana['champions']};inv=read(B/'inventory.json');ih={r['runtimeHeroId']:r for r in inv['heroes']};prod=read(B/'current-production.json');white=set(prod['whitelist']['champions']);rawabs={p.stem:read(p) for p in (ROOT/'content/abilities').glob('*.json') if not p.name.startswith('_')};heroes=[];allrefs=[];allpaths=set();ignored_format_mentions=[]
for cp in sorted((ROOT/'content/champions').glob('*.json')):
 if cp.name.startswith('_'):continue
 c=read(cp);id=c['id'];meta=ih.get(id);slots={s:c.get('abilities',{}).get(s,{}).get('id') for s in ['Q','W','E','R']};slots.update(PASSIVE=c.get('passiveAbility'),EX=c.get('exAbility'))
 learned={};
 for slot,aid in slots.items():
  if aid not in rawabs:continue
  raw=rawabs[aid]
  for p,node in walk({k:v for k,v in raw.items() if k!='template'}):
   if node.get('kind')=='learned' and node.get('subject')=='self' and node.get('slot') in slots:
    target=slots[node['slot']]
    if target:learned.setdefault(target,[]).append({'abilityId':aid,'path':'content/abilities/'+aid+'.json','jsonPath':p,'condition':node,'runtimeCode':'packages/shared/src/sim/content/condition.ts:1386'})
 skills=[];missing=[];explicit=[];uncertain=[];refs=[]
 for slot in ['PASSIVE','Q','W','E','R','EX']:
  aid=slots[slot];field='abilities.'+slot+'.id' if slot in ['Q','W','E','R'] else 'passiveAbility' if slot=='PASSIVE' else 'exAbility'
  row={'slot':slot,'referenceField':field,'abilityId':aid,'path':'content/abilities/'+aid+'.json' if aid else None}
  if not aid:
   if id=='godie-ogld' and slot=='PASSIVE':reason='原地圖無72-00；schema/champion.ts:434-439已明載，非待設計';evidence='packages/shared/src/content/schema/champion.ts:434'
   elif id=='godie-e010' and slot=='EX':reason='樹精變身態無70-002；原型有EX不代表此形態應自動新增';evidence='tools/skill-remake/form_counterparts.py:95'
   elif id in ['thorne','sela']:reason='GGD內建四槽原型，PASSIVE/EX為schema可選欄位；未提供新增槽位設計要求';evidence='packages/shared/src/content/schema/champion.ts:416'
   else:reason='可選欄位未宣告；是否需另行設計未有證據';evidence='packages/shared/src/content/schema/champion.ts:416';uncertain.append(slot+' optional absence not explained')
   row.update(status='optional-not-declared',exists=False,declared=False,intentionalAbsenceEvidence={'reason':reason,'path':evidence},implemented=None,placeholder=False);skills.append(row);continue
  ref={'field':field,'abilityId':aid,'path':row['path'],'exists':aid in analyses};refs.append(ref);allrefs.append(ref)
  if aid not in analyses:row.update(status='missing-ability-file',exists=False,declared=True,implemented=False,placeholder=False);missing.append(ref);skills.append(row);continue
  a=analyses[aid];raw=rawabs[aid];allpaths.add(a['path']);ph=placeholder_evidence(raw);explicit += [dict(slot=slot,**p) for p in ph];mechanics=a['actualMechanics'];payload=mechanics['hasMechanicDefinition'];key_evidence=learned.get(aid,[]) if not payload else [];implemented=(payload or bool(key_evidence)) and a['schemaPass'] and a['templateExpansion']['ok'];cross=[]
  seen=set()
  for p,n in walk({k:v for k,v in raw.items() if k!='template'}):
   if isinstance(n.get('abilityId'),str) and (p,n['abilityId']) not in seen:
    target=n['abilityId'];seen.add((p,target));cross.append({'field':p+'.abilityId','abilityId':target,'path':'content/abilities/'+target+'.json','exists':target in rawabs})
  for edge in a['abilityRefs']:
   if (edge['field'],edge['targetId']) not in seen:cross.append({'field':edge['field'],'abilityId':edge['targetId'],'path':edge['path'],'exists':edge['exists']});seen.add((edge['field'],edge['targetId']))
  missing.extend(dict(slot=slot,**r) for r in cross if not r['exists'])
  mismatch=[]
  if slot in ['Q','W','E','R']:
   embedded=c['abilities'][slot];mismatch=[k for k,v in embedded.items() if k not in ['schema','icon'] and raw.get(k)!=v]
  if mismatch:uncertain.append(slot+' embedded/standalone mismatch: '+','.join(mismatch))
  if raw['slot']!=slot:uncertain.append(slot+' resolved standalone slot mismatch '+str(raw['slot']))
  if not implemented:uncertain.append(slot+' lacks resolved mechanics or schema/expansion failed')
  compact={'effectKinds':sorted({n['kind'] for n in mechanics['effectNodes'] if '.condition' not in n['path']}),'effectNodes':[n for n in mechanics['effectNodes'] if '.condition' not in n['path']],'hookEvents':mechanics['hookEvents'],'statModifierCount':len(mechanics['statModifiers']),'passivePayloadFields':sorted({r['field'] for r in mechanics.get('passivePayloads',[])}),'passivePayloadEvidence':[{'path':r['path'],'field':r['field']} for r in mechanics.get('passivePayloads',[])],'marks':mechanics['marks'],'augmentTargets':mechanics['augmentTargets'],'toggleDeclared':mechanics['toggle'] is not None,'directMechanicPayload':payload,'learnedKeyUsedBy':key_evidence}
  row.update(exists=True,declared=True,name=a['name'],sha256=a['sha256'],provenance=a['provenance'],status='explicit-placeholder' if ph else 'mechanics-defined' if payload and implemented else 'learned-unlock-key' if implemented else 'uncertain-empty-or-invalid',implemented=implemented,placeholder=bool(ph),explicitPlaceholderEvidence=ph,actualMechanics=compact,templateExpansion=a['templateExpansion'],templateRefs=a['templateRefs'],schemaPass=a['schemaPass'],schemaErrors=a['schemaErrors'],abilityRefs=cross,embeddedSemanticFieldsMatch=not mismatch,emptyName=not bool(str(raw.get('name','')).strip()),emptyDescription=not bool(str(raw.get('description','')).strip()))
  if '佔位符' in raw.get('description',''):ignored_format_mentions.append({'heroId':id,'abilityId':aid,'reason':'description refers to radius interpolation, not an unimplemented skill'})
  skills.append(row)
 declared=[s for s in skills if s.get('declared')];allmechanics=all(s['implemented'] for s in declared);implemented=allmechanics and not missing and not explicit and champchecks[id]['schemaPass'];status='explicit-placeholder' if explicit else 'content-gap' if missing else 'mechanics-defined-with-uncertainty' if uncertain else 'mechanics-defined'
 heroes.append({'heroId':id,'runtimeHeroId':id,'logicalInventoryId':meta['id'] if meta else None,'name':c['name'],'work':meta.get('work') if meta else None,'workEvidence':'materials/hero-model-library/inventory.json#heroes/runtimeHeroId='+id if meta else 'unmatched-metadata-not-design-gap','championFile':ev(cp),'schemaPass':champchecks[id]['schemaPass'],'status':status,'implemented':implemented,'implementationDefinition':'All declared ability references resolve to schema-valid expanded mechanic payloads or an evidenced learned-unlock key. This is content implementation evidence, not balance/source-fidelity/gameplay acceptance.','designComplete':None,'designCompletionStatus':'not-assessed-without-design-spec-and-runtime-acceptance','skills':skills,'abilityRefs':refs,'missingRefs':missing,'explicitPlaceholderEvidence':explicit,'uncertain':uncertain,'genericBaseCharacter':id in ['sela','thorne'],'genericBaseCharacterNote':'內建角色本身有實際QWER機制；原型／占位模型標籤不等於技能未設計' if id in ['sela','thorne'] else None,'legacyChampionPassive':{'present':bool(c.get('passive')),'field':'passive','keys':sorted(c.get('passive',{}))},'additionalHeroMechanics':{k:c[k] for k in ['transform','immobile','healthDrainPctOfMax'] if k in c},'availability':{'status':'whitelisted-at-recorded-snapshot' if id in white else 'not-whitelisted-at-recorded-snapshot','observedAt':prod['observedAt'],'contentVersion':prod['contentVersion'],'sourceMainCommit':prod['sourceMainCommit'],'snapshotPath':'materials/hero-model-library/current-production.json','currentLiveStatus':'not-rechecked','whitelistIsDesignCompletionProof':False}})
# Retain the hashes captured by Node, rather than stamping old results with the
# current template/schema bytes. Python-only metadata is pinned before it is read.
files=sorted({p['path']:p for p in [*ana['inputFiles'],*python_input_files]}.values(),key=lambda p:p['path']);stable=True
report={'schema':'ggd.hero-design-coverage@1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repo':str(ROOT),'revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'scope':'All current champion documents, including alternates and original prototypes; no acquisition/source-matching assumptions and no network deployment check.','method':['Resolve actual ability references from QWER embedded IDs plus optional PASSIVE/EX; inspect standalone content/abilities and embedded mirrors.','Use repository resolveTemplateExpansion and zAbilityDoc/zChampionDoc; count effects, hooks, passive grants (attributes/vision/flight/block etc), marks, augments and toggles.','Empty effects alone is not a gap. Empty learned-key passive is meaningful only with same-hero learned(slot) condition evidence.','Generic templates are mechanics building blocks, not placeholder proof. Interpolation tokens and notes about radius placeholders are not TODO evidence.','No design-completion or native/source-fidelity/E2E claim inferred from six slots, schema success, whitelist or model coverage.'],'summary':{'heroes':len(heroes),'abilityDocumentsAnalyzed':len(analyses),'declaredHeroAbilityReferences':len(allrefs),'uniqueDirectHeroAbilityPaths':len(allpaths),'abilityDocumentsNotDirectlyReferencedByCurrentHeroes':sorted(set(rawabs)-{s['abilityId'] for h in heroes for s in h['skills'] if s.get('declared')}),'heroesWithAllDeclaredMechanics':sum(h['implemented'] for h in heroes),'heroesWithMissingRefs':sum(bool(h['missingRefs']) for h in heroes),'heroesWithExplicitSkillPlaceholderEvidence':sum(bool(h['explicitPlaceholderEvidence']) for h in heroes),'heroesWithUncertainty':sum(bool(h['uncertain']) for h in heroes),'statusCounts':dict(collections.Counter(h['status'] for h in heroes)),'schemaFailedAbilities':sum(not a['schemaPass'] for a in analyses.values()),'templateExpansionFailedAbilities':sum(not a['templateExpansion']['ok'] for a in analyses.values()),'snapshotWhitelistedHeroes':sum(h['availability']['status']=='whitelisted-at-recorded-snapshot' for h in heroes),'snapshotNotWhitelistedHeroes':sum(h['availability']['status']!='whitelisted-at-recorded-snapshot' for h in heroes),'builtinFourSlotCharacters':['sela','thorne'],'designCompletionVerified':False,'sourceFilesStableDuringAudit':stable},'availabilitySnapshot':{k:prod[k] for k in ['observedAt','url','contentVersion','sourceMainCommit','bundleSha256']}|{'sha256':sha(B/'current-production.json'),'limitation':'Historical observation only; not proof of current deployment or hero design completion.'},'heroes':heroes,'ignoredTextInterpolationMentions':ignored_format_mentions,'inputFiles':files,'analysisArtifacts':[ev(Path(__file__).with_name('analyze_abilities.mts')),ev(args.analysis),ev(Path(__file__).resolve())],'remainingUncertainty':['No full gameplay, balance, Owner design-spec completeness, animation/VFX/audio alignment or deployed state acceptance was run.','Characters absent from a model-source matching table cannot be classified as undesigned from that absence.']}
verify_analysis_snapshot(ana,'before writing Python coverage')
verify_pins([*python_input_files,analysis_file_pin],'during Python coverage')
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'out':str(OUT),'sha256':sha(OUT),'summary':report['summary'],'uncertainHeroes':[{'id':h['heroId'],'why':h['uncertain'],'missing':h['missingRefs']} for h in heroes if h['uncertain'] or h['missingRefs']]},ensure_ascii=False))

compact={k:report[k] for k in ['schema','generatedAt','repo','revision','summary','availabilitySnapshot','method','remainingUncertainty']}
compact['schema']='ggd.hero-design-coverage-compact@1'
compact['inputFiles']=report['inputFiles']
compact['sourceReport']=dict(path=str(OUT.resolve()),sha256=sha(OUT))
compact['heroes']=[]
for h in report['heroes']:
 row={k:h[k] for k in ['runtimeHeroId','name','work','implemented','designComplete','status','missingRefs','explicitPlaceholderEvidence','uncertain','championFile','availability','genericBaseCharacter']}
 row.update(id=h['heroId'],aliases=[],skillCount=sum(s.get('declared',False) for s in h['skills']),skills=[])
 for s in h['skills']:
  row['skills'].append(dict(slot=s['slot'],id=s.get('abilityId'),path=s.get('path'),sha256=s.get('sha256'),status=s['status'],implemented=s.get('implemented'),mechanicKinds=s.get('actualMechanics',{}).get('effectKinds',[]),schemaPass=s.get('schemaPass'),templateExpansionPass=s.get('templateExpansion',{}).get('ok'),intentionalAbsenceEvidence=s.get('intentionalAbsenceEvidence')))
 compact['heroes'].append(row)
args.compact.write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n')
