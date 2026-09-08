import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {claims} from './community-claims-v1.mjs';import {digest} from './dataset.mjs';import {system,validateCases} from './r3-data.mjs';import {fileHash} from './precision-diagnostic.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
export function build(heroes){
 const cases=[],reviews=[];
 assert.deepEqual(Object.keys(claims).sort(),heroes.map(h=>h.id).sort());
 for(const h of heroes){
  const units=claims[h.id];assert.deepEqual(Object.keys(units),['HERO','PASSIVE','Q','W','E','R','EX']);
  for(const [slot,triplet] of Object.entries(units)){
   const hero=slot==='HERO',task=hero?'hero-source':'owner-mechanism',move=hero?null:h.recipe.moves[slot];assert.equal(triplet.length,3);
   // Skill prompts retain all adaptation caveats, but do not borrow other skill slots or hidden recipe parameters.
   const text=hero?h.sourceText:[`角色：${h.recipe.name}`,`出身：${h.recipe.origin}`,'GGD改編設定：',...h.recipe.adaptations,`本次技能：${slot} ${move.name}`,move.purpose].join('\n');
   const sourceId=`community-v1-${h.id}-${slot.toLowerCase()}`,sourceSha256=digest(text),name=hero?h.recipe.name:`${h.recipe.name} ${slot} ${move.name}`;
   for(const [index,verdict] of ['supported','contradicted','not-stated'].entries()){
    const [claim,reason]=triplet[index];assert(claim&&reason);const id=`${sourceId}-${index}`;
    const input={task,source:{id:sourceId,name,snapshot:sourceSha256,text,sourceTier:'user-nominated GGD branch adaptation; not Riot canonical or independently confirmed Owner Gold'},claim,instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'};
    const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],target={verdict};
    cases.push({id,task,split:h.split,lineage:`community-hero-${h.id}`,heroId:h.id,slot,sourceId,sourceSha256,messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:reason,quality:'assistant-personally-reviewed-branch-adaptation-not-human-gold',cohort:'community-seven-heroes-v1',trainingEligible:h.split==='train',selectionEligible:h.split==='dev'});
    reviews.push({id,heroId:h.id,slot,split:h.split,sourceText:text,claim,expected:target,reason,sourceAnchor:hero?{summary:h.recipe.summary,adaptations:h.recipe.adaptations}:{purpose:move.purpose,adaptations:h.recipe.adaptations},fullTextPersonallyRead:true,claimPersonallyReviewed:true,reviewer:'current assistant; not independent human review',runtimeCapabilityGold:false});
   }
  }
 }
 cases.sort((a,b)=>digest('community-v1:'+a.id).localeCompare(digest('community-v1:'+b.id)));validateCases(cases);
 const counts=Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.split===s).length]));assert.deepEqual(counts,{train:84,dev:21,test:42});
 const membership=new Map();for(const c of cases){if(membership.has(c.heroId))assert.equal(membership.get(c.heroId),c.split);membership.set(c.heroId,c.split);assert.equal(JSON.parse(c.messages[1].content).source.snapshot,c.sourceSha256);}
 assert.equal(new Set(cases.map(c=>c.requestDigest)).size,cases.length);
 return{cases,reviews,counts};
}
export function prepare(snapshot,out,priorFiles){
 assert(path.isAbsolute(snapshot)&&path.isAbsolute(out));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const sourceManifest=read(path.join(snapshot,'manifest.json')),heroes=read(path.join(snapshot,'heroes.json'));
 for(const p of sourceManifest.pins)assert.equal(fileHash(path.join(snapshot,'snapshots',p.path)),p.sha256,'SNAPSHOT_PIN_CHANGED');
 assert.deepEqual(Object.fromEntries(heroes.map(h=>[h.id,h.split])),Object.fromEntries(heroes.map(h=>[h.id,sourceManifest.split[h.id]])));
 const data=build(heroes),prior=priorFiles.flatMap(read),priorText=new Set(prior.flatMap(c=>c.messages??[]).flatMap(m=>{try{const i=JSON.parse(m.content);return i.source?.text?[i.source.text]:[];}catch{return[];}}));
 const overlaps=data.cases.filter(c=>priorText.has(JSON.parse(c.messages[1].content).source.text));assert.equal(overlaps.length,0,'PRIOR_EXACT_SOURCE_EXPOSURE');
 const capabilities=heroes.flatMap(h=>Object.entries(h.recipe.moves).map(([slot,m])=>({heroId:h.id,slot,templateId:m.ref,authorEffects:m.effects??[],hasExtraAuthorEffects:(m.effects?.length??0)>0,templateAloneSemanticsAdmitted:false,reason:'Source entailment only; overlays, template version and runtime behavior need a separate capability admission.'})));
 fs.mkdirSync(out,{recursive:true});const put=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',data.cases);put('personal-review.json',data.reviews);put('capability-separation.json',capabilities);
 for(const split of ['train','dev','test']){const rows=data.cases.filter(c=>c.split===split);put(split+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));}
 fs.writeFileSync(path.join(out,'train.jsonl'),data.cases.filter(c=>c.split==='train').map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});
 put('manifest.json',{schema:'ggd-community-source-claims@1',frozenAt:new Date().toISOString(),sourceSnapshot:snapshot,sourceRevision:sourceManifest.revision,sourceFileSha256:sourceManifest.sourceSha256,counts:data.counts,total:data.cases.length,heroes:7,skillSlots:42,sourceUnits:49,labels:{supported:49,contradicted:49,'not-stated':49},split:sourceManifest.split,splitFrozenBeforeClaimAuthoring:true,codePins:[self,path.join(dir,'community-claims-v1.mjs'),path.join(dir,'r3-data.mjs'),path.join(dir,'dataset.mjs')].map(p=>({path:p,sha256:fileHash(p)})),sourcePins:['manifest.json','heroes.json'].map(n=>({path:path.join(snapshot,n),sha256:fileHash(path.join(snapshot,n))})),priorAuditPins:priorFiles.map(p=>({path:p,sha256:fileHash(p)})),casesSha256:digest(data.cases),priorExactFullSourceOverlap:0,trainingStarted:false,tokenBudgetPending:true,releaseQualified:false,limitations:['Same template and semantic patterns occur across heroes; hero-disjoint is not entirely unseen-mechanism generalization.','147 claims cover all 49 source units, not every proposition in their full text.','Assistant-authored and assistant-reviewed labels; no independent human Gold.','Not an engine-template capability corpus: raw recipe overlays are not model input or training outputs.','Source working tree had uncommitted names and was hash-snapshotted; future branch edits are not silently included.']});
 const lines=['# 七角色第一版逐題來源審查','','已人工逐題核對：7個角色設定 + 42個技能槽，每來源單元3題，共147題。這是逐題審查，不宣稱每個描述中的每項命題皆已有測試。','','訓練84題（齊勒斯、好運姐、犽宿、卡爾瑟斯）；開發21題（李星）；保留測試42題（拉克絲、沃維克）。以角色分组，固定後不得依分數重分。','','只訓練文字來源是否支持敘述；不生成參數，不把authorEffects附加的控制／護盾／連鎖當作模板原生能力。來源未說的治療、選敵規則、地形穿越、狀態堆疊不能猜。','','## 個別疑義及處理','','- 沃維克R「汲傷」未明確提供回血公式，來源判讀題不承諾回血；實作是連擊傷害，待作者釐清用語。','- 拉克絲R「相交段落」不解讀為同人多次命中；目前只測四段方向與幾何文字。','- 犽宿E「接觸範圍」不擴寫成沿路傷害；本批不放行對應runtime能力。','- 好運姐EX「掩護換位」不等於技能自帶瞬移；護盾用途与實際位移效果分開。','- 好運姐／齊勒斯R用該支線perImpact版本，不能套用舊版random-barrage能力表。','- 所有來源判斷的未知皆以實際輸入文字為準，不把未提供的params拿來判正確。','','## 逐題記錄','',...data.reviews.flatMap(r=>[`### ${r.id} [${r.split}]`,'',`原文：${r.sourceAnchor.purpose??r.sourceText}`,`敘述：${r.claim}`,`判定：${r.expected.verdict}`,`理由：${r.reason}`,''])];
 fs.writeFileSync(path.join(out,'PERSONAL_REVIEW.md'),lines.join('\n'),{flag:'wx'});return{out,counts:data.counts,rows:data.cases.length,priorExactFullSourceOverlap:0,trainingStarted:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){const[snapshot,out,...prior]=process.argv.slice(2);console.log(JSON.stringify(prepare(snapshot,out,prior)));}
