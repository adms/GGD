import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pairs,unknown,heroPairs} from './curation.mjs';

export const system='你是 GGD 英雄設定與技能原意判讀助手。只根據輸入 source.text 判斷整個 claim，輸出 JSON {"verdict":"supported|contradicted|not-stated"}。supported=整段敘述有來源支持；contradicted=來源有明確相反內容；not-stated=來源未提供足夠資訊。不得把未提及當成明確禁止，也不得使用外部原作常識補答案。角色版本、主體、方向、條件、次序、數量和跨技能依賴不能偷換。引號可能包住狀態名稱或演出台詞；純台詞不增加機制，明示狀態名稱不可刪掉。此任務不判斷引擎是否支援、不推薦參數、不生成技能 JSON。';
const dir=path.dirname(fileURLToPath(import.meta.url));
export const sha=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const slots=['PASSIVE','Q','W','E','R','EX'];
const franchise=['yugioh','kof','kof','jojo','megaman','kirby','hunter','attack-on-titan','spice-wolf','code-geass','slime','fate','sao','assassination','wrestling-meme','fate','overlord','fate','sao','railgun','madoka','rezero','gintama','hunter','one-punch','conan','cardcaptor','mushoku','frieren','yanineko','shangrila','azazel','negima-uq','dandadan','kimetsu','rance','chiikawa'];

export function validate(cases, references){
 assert.equal(references.length,222);assert.equal(cases.length,555);
 const ids=new Set(),requests=new Set(),coverage=new Map();
 const sources=new Map();
 for(const r of references){assert(r.ownerOriginal);assert(r.identityOriginal);assert.equal(r.templateTrainingAdmitted,false);assert.equal(r.runtimeRebuilt,false);}
 for(const c of cases){
  assert(!ids.has(c.id));ids.add(c.id);assert(!requests.has(c.requestDigest));requests.add(c.requestDigest);
  assert.equal(c.messages.length,2);assert.equal(c.messages[0].role,'system');assert.equal(c.messages[1].role,'user');
  assert.equal(sha(c.messages),c.requestDigest);assert.equal(c.split,'train');
  assert(['hero-source','owner-mechanism'].includes(c.task));assert(['supported','contradicted','not-stated'].includes(c.target.verdict));
  assert.deepEqual(c.acceptedTargets,[c.target]);
  const input=JSON.parse(c.messages[1].content);assert.equal(input.task,c.task);
  assert.equal(sha(input.source.text),c.sourceSha256);assert.equal(input.source.snapshot,c.sourceSha256);
  for(const field of ['target','acceptedTargets','reviewReason','expected','verdict'])assert(!Object.hasOwn(input,field));
  assert(!Object.hasOwn(input.source,'verdict'));assert(!c.sourceId.includes(c.target.verdict));
  assert(!c.id.includes(c.target.verdict));assert.equal(c.runtimeCapabilityGold,false);assert.equal(c.ownerGold,false);
  if(sources.has(c.sourceId))assert.equal(sources.get(c.sourceId),c.sourceSha256);sources.set(c.sourceId,c.sourceSha256);
  const k=c.heroIndex+'.'+c.slot;(coverage.get(k)??coverage.set(k,new Set()).get(k)).add(c.target.verdict);
 }
 for(let i=1;i<=37;i++)for(const slot of ['HERO',...slots]){const k=String(i).padStart(2,'0')+'.'+slot;assert(coverage.get(k)?.has('supported'),k);assert(coverage.get(k)?.has('contradicted'),k);}
 assert.equal(cases.filter(c=>c.target.verdict==='not-stated').length,37);
 return {cases:cases.length,slotCoverage:222,heroCoverage:37,uniqueSources:sources.size,uniqueRequests:requests.size,trainOnly:true};
}

export function build(root,out=path.join(dir,'data')){
 assert(!fs.existsSync(out),'REFUSE_OVERWRITE_OUTPUT');
 const base=path.join(root,'GGD社群英雄上傳內容_37名');
 const old=path.join(root,'outputs/community37-static-review-20260907-v1');
 const audit=read(path.join(old,'STATIC_AUDIT.json'));
 for(const p of audit.sourceSnapshot)assert.equal(sha(fs.readFileSync(path.join(root,p.path))),p.sha256,'SOURCE_CHANGED_SINCE_REVIEW:'+p.path);
 const rows=fs.readFileSync(path.join(old,'SLOT_REFERENCE.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const recipes=new Map();for(let i=1;i<=37;i++){const id=String(i).padStart(2,'0');recipes.set(id,read(path.join(base,`recipes/${id}.upload-recipe.json`)));}
 for(const r of rows){
  const recipe=recipes.get(r.heroIndex),s=recipe?.slots.find(s=>s.slot===r.slot);assert(s,'UNKNOWN_REFERENCE_SOURCE');
  assert.equal(r.hero,recipe.displayName);assert.equal(r.identity,recipe.identity);
  assert.equal(r.ownerDescription,s.ownerDescription);assert.equal(r.name,s.name);
  assert.equal(r.currentBehavior,s.currentBehavior);assert.equal(r.requiredRefinement,s.requiredRefinement);
  assert.deepEqual(r.template,s.template);assert.deepEqual(r.effectiveRuntime,s.effectiveRuntime);
 }
 const corrected=[],log=[],cases=[],reviews=[];
 const byKey=new Map(rows.map(r=>[r.heroIndex+'.'+r.slot,r]));
 assert.equal(new Set(pairs.map(x=>x[0])).size,222);assert.equal(pairs.length,222);
 assert.equal(heroPairs.length,37);assert.equal(unknown.length,37);
 const billy={
  Q:'必須具備近身單目標抓取、配對動作與抓取時間上限；目前單體傷害未實現抓取。',
  W:'需氣勢消耗的短期防禦與無氣勢弱版；目前抓投不是此槽原意，不以摔角動畫補強冒充。',
  E:'需前向衝撞及命中第一名敵人停止；目前自身護盾不是此槽原意，原文沒有指定友軍保護要求。',
  EX:'需附近友軍護盾與短效韌性；目前自身攻速加盾不等價，不能加入原文未要求的氣勢消耗。',
 };
 for(const r of rows){
  const patch=[];let current=r.currentBehavior,gap=r.requiredRefinement;
  if(r.template.ref==='tpl-line-sweep'){
   const e=r.effectiveRuntime.damageAndMechanics.find(e=>e.kind==='delayed');assert.equal(e.hitOncePerTarget,true);
   current=`分段圓形區域沿面向推進，共 ${e.count} 段，每段間隔 ${e.intervalSec} 秒、半徑 ${e.radius} GGD 單位、步距 ${e.advance.stepDist} GGD 單位；同次排程對同一目標去重。它不是交疊段可對同人重複造成傷害的設定。精確傷害與 rank 依 effectiveRuntime。`;
   gap=`原設計：${r.ownerDescription}。目前分段圓形區域已設定同目標去重；尚須確認幾何、主體、起手、條件與原意是否完整相符，不能沿用「缺去重」作已確認缺口。`;
   patch.push('line-dedup-summary-and-gap');
  }
  if(r.template.ref==='tpl-traveling-wave'){
   const e=r.effectiveRuntime.damageAndMechanics.find(e=>e.kind==='delayed'),end=e.finalEffects.find(e=>e.kind==='damageArea');assert.equal(e.hitOncePerTarget,true);
   current=`沿面向推進 ${e.count} 段，間隔 ${e.intervalSec} 秒、每段半徑 ${e.radius} GGD 單位、步距 ${e.advance.stepDist} GGD 單位；主波同目標去重。終點另掛半徑 ${end.radius} GGD 單位 damageArea。不是遇首名目標即消失的單顆碰撞投射物；最終命中集合需另測。`;
   gap=`${gap} 另須審查繼承 terminalBurst 導致的終點範圍傷害是否符合原意；不能以未填參數當作沒有終點效果，也不能假設不合法的零值可關閉。`;
   patch.push('wave-inherited-terminal-effect');
  }
  if(r.template.ref==='tpl-lock-combo'){
   const d=r.effectiveRuntime.damageAndMechanics.find(e=>e.kind==='dot'),l=r.effectiveRuntime.damageAndMechanics.find(e=>e.kind==='leap');assert(d&&l);
   current=`hitCount 設為 ${r.template.params.hitCount}；實際為 intervalSec=${d.intervalSec}、durationSec=${d.durationSec} 的 DoT，加上原地 leap 結束時獨立收尾傷害。不是 N 段內最後一段自動替換成重擊；实际次數受 tick 量化、死亡及回合狀態影響，沒有逐段近戰距離／受控中止的驗收證據。`;
   gap=`原設計：${r.ownerDescription}。需核對逐擊條件、傷害預算與中斷語意。先調查現有 comboStrikes／tpl-combo-finisher 路徑，不從 tpl-lock-combo 的 20 段上限推論引擎不支援。`;
   patch.push('combo-dot-plus-independent-finisher');
  }
  if(r.heroIndex==='15'&&billy[r.slot]){gap=billy[r.slot];patch.push('billy-owner-slot-correction');}
  if(r.slot==='PASSIVE'){gap=`原設計：${r.ownerDescription}。目前被動僅替代底稿，尚未忠實實現該觸發、條件與效果，不作正向模板映射答案。`;patch.push('passive-placeholder-quarantine');}
  const row={id:`community37-${r.heroIndex}-${r.slot.toLowerCase()}`,heroIndex:r.heroIndex,hero:r.hero,franchise:franchise[Number(r.heroIndex)-1],slot:r.slot,name:r.name,identityOriginal:r.identity,ownerOriginal:r.ownerDescription,ownerSha256:sha(r.ownerDescription),source:r.source,originalTemplate:r.template,originalCurrentBehavior:r.currentBehavior,originalRequiredRefinement:r.requiredRefinement,currentBehavior:current,requiredRefinement:gap,effectiveRuntime:r.effectiveRuntime,corrections:patch,templateTrainingAdmitted:false,runtimeRebuilt:false,capabilityAssessment:'not-adjudicated; existing template mismatch is not engine unavailability',sourceEntailmentEligible:true,ownerGold:false};
  corrected.push(row);if(patch.length)log.push({id:row.id,changes:patch,before:{current:r.currentBehavior,gap:r.requiredRefinement},after:{current,gap},gameplayChanged:false});
 }
 function add(key,claim,verdict){
  const [heroIndex,slot]=key.split('.');assert(claim);const recipe=recipes.get(heroIndex);assert(recipe);
  const hero=slot==='HERO',r=hero?null:byKey.get(key);if(!hero)assert(r,key);
  const task=hero?'hero-source':'owner-mechanism';
  // Single-slot scope is deliberate. Sibling slots/spec supplements are not silently used as evidence.
  const original=hero?recipe.identity:r.ownerDescription;
  const text=hero?`角色：${recipe.displayName}\n本批 GGD 角色設定：\n${original}`:`角色：${recipe.displayName}\n本次技能：${slot} ${r.name}\n本槽 Owner 原文：\n${original}`;
  const sourceId=`community37-${heroIndex}-${slot.toLowerCase()}`,sourceSha256=sha(text);
  const input={task,source:{id:sourceId,name:hero?recipe.displayName:`${recipe.displayName} ${slot} ${r.name}`,snapshot:sourceSha256,text,sourceTier:'user-supplied GGD design; source entailment only, not canonical lore or runtime capability'},claim,instruction:'只根據這份來源判斷整個 claim。缺少證據與明確相反不同。輸出 {"verdict":"supported|contradicted|not-stated"}。'};
  const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],target={verdict},id='community37-'+sha([sourceId,claim]).slice(0,20);
  const reason=verdict==='supported'?'助理逐槽閱讀後改述：所選敘述由本份原文明示支持；不代表涵蓋整招全部需求。':verdict==='contradicted'?'助理逐槽建立反例：改動來源明示的身分、方向、主體、条件、數量、次序或限制；不是僅因未提及就判相反。':'此機制細節不由本次輸入來源確定；不借用相鄰技能、補強文件、模板預設或外部原作推斷。';
  const c={id,task,split:'train',lineage:`community37-franchise-${franchise[Number(heroIndex)-1]}`,heroIndex,heroId:`community37-${heroIndex}`,slot,sourceId,sourceSha256,sourceOriginalSha256:sha(original),messages,requestDigest:sha(messages),target,acceptedTargets:[target],reviewReason:reason,quality:'assistant-source-reviewed-not-independent-human-gold',cohort:'community37-corrected-v1',trainingEligible:true,selectionEligible:false,runtimeCapabilityGold:false,ownerGold:false};cases.push(c);
  reviews.push({id,key,sourceOriginal:original,sourceText:text,claim,target,reason,reviewer:'current assistant',reviewScope:'this source and claim only; no whole-skill/runtime acceptance',sourceOriginalSha256:sha(original)});
 }
 for(const [key,yes,no]of pairs){assert(byKey.has(key));add(key,yes,'supported');add(key,no,'contradicted');}
 for(const [key,claim]of unknown)add(key,claim,'not-stated');
 for(const [id,yes,no]of heroPairs){add(id+'.HERO',yes,'supported');add(id+'.HERO',no,'contradicted');}
 cases.sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));const validation=validate(cases,corrected);
 fs.mkdirSync(out,{recursive:true});const put=(file,v)=>fs.writeFileSync(path.join(out,file),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 const jsonl=(file,rows)=>fs.writeFileSync(path.join(out,file),rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
 put('corrected-reference.json',corrected);put('correction-ledger.json',log);put('cases.private.json',cases);put('claim-review.private.json',reviews);
 jsonl('train.jsonl',cases.map(({id,messages,target})=>({id,messages,target})));
 jsonl('train.chatml.jsonl',cases.map(c=>({messages:[...c.messages,{role:'assistant',content:JSON.stringify(c.target)}]})));
 put('requests.json',cases.map(({id,task,messages,requestDigest,sourceId,sourceSha256})=>({id,task,messages,requestDigest,sourceId,sourceSha256})));
 put('targets.private.json',cases.map(({id,target,acceptedTargets})=>({id,target,acceptedTargets})));
 put('hero-reference.json',[...recipes.values()].map(r=>({id:`community37-${r.index}`,name:r.displayName,identity:r.identity,sourceOwnerText:r.sourceOwnerText,sha256:sha(r.sourceOwnerText),split:'train',franchise:franchise[Number(r.index)-1]})));
 put('template-quarantine.json',corrected.map(r=>({id:r.id,template:r.originalTemplate,reason:'No original-design-equivalent runtime admission; not an Owner-to-template positive label.',requiredRefinement:r.requiredRefinement})));
 const manifest={schema:'ggd-community37-corrected-source-dataset@1',createdAt:new Date().toISOString(),counts:{heroes:37,slots:222,cases:cases.length,train:cases.length,dev:0,test:0,heroSource:cases.filter(c=>c.task==='hero-source').length,ownerMechanism:cases.filter(c=>c.task==='owner-mechanism').length,verdicts:Object.fromEntries(['supported','contradicted','not-stated'].map(v=>[v,cases.filter(c=>c.target.verdict===v).length])),correctedReferenceRows:log.length,templateMappingsAdmitted:0},casesSha256:sha(cases),sourcePins:audit.sourceSnapshot,buildPins:['build.mjs','curation.mjs'].map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(dir,n)))})),validation,sourceOnly:true,ownerGold:false,fullOriginalSkillsValidated:false,runtimeCapabilityGold:false,trainingStarted:false,gpuInferenceRun:false,existingDatasetsModified:false,unseenEvaluationEligible:false,splitPolicy:'New train-only supplement. No new held-out or unseen claim; all hero/franchise variants must remain together in future splits. Original frozen dev/test untouched. Cross-prior semantic overlap not independently excluded.',taskContract:'Existing source-predict owner-mechanism/hero-source verdict JSON; this dataset has its own pinned source-only system prompt.',limitations:['Assistant reviewed labels, not independent human Gold.','Pairs assess selected source assertions, not complete requirement coverage or hero generation.','37 not-stated cases; do not use this imbalanced supplement as a replacement for the full curriculum.','Template mappings remain quarantined; no invented support/refuse labels.','External lore, GPU inference, native tokenizer fit, compiler and gameplay acceptance not revalidated.','Do not use this train-only corpus as held-out evaluation.']};
 put('dataset-manifest.json',manifest);
 put('TRAINING_DISABLED.json',{trainingEnabled:false,reason:'User stopped training and GPU work. Dataset creation is not training authorization.',doNotRemovePreviousCancelMarkers:true});
 put('dataset-registration.json',{id:'community37-corrected-v1',kind:'source-entailment-training-supplement',status:'prepared-not-trained',paths:{researchTrain:'train.jsonl',chatmlTrain:'train.chatml.jsonl',cases:'cases.private.json',reference:'corrected-reference.json',manifest:'dataset-manifest.json'},trainingEnabled:false,automaticMerge:false,oldFrozenRunsModified:false,templateTrainingEnabled:false,requireBeforeNextRun:['explicit training authorization','new run and source pins','curriculum weighting and overlap review','native tokenizer context-budget check']});
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(build(path.resolve(process.argv[2]??process.cwd()),process.argv[3]?path.resolve(process.argv[3]):undefined).counts,null,2));
