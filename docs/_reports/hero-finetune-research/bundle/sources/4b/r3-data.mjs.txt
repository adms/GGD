import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest, mechanicsText} from './dataset.mjs';
import {effective} from './reviewed-curriculum.mjs';
import {ownerReview} from './r3-owner-review.mjs';
import {heroReview, ownerUnknown} from './r3-hero-review.mjs';
import {mechanismPairs} from './r3-mechanism-seeds.mjs';
export const system = '你是 GGD 來源忠實度與現行模板分類助手。只輸出指定 JSON，不寫推理或 Markdown。英雄來源與版本由輸入鎖定，不可套用外部作品記憶或混合其他版本。來源判讀：supported=原文能支持整個待判斷敘述；contradicted=原文明確有相反內容；not-stated=未提供足夠資訊，不能猜。數字、主體、方向、條件、先後順序均不能偷換。技能原文的「」台詞已剔除，不能當機制。模板選擇：只選輸入 catalog 中 enabled 的卡；一張卡必須完整承擔全部必要條件，只有使用者明確批准的近似才可接受。沒有符合卡就 refuse；不要編造 ID，不自行組合多卡。VFX 僅推薦既有視覺模板，不承諾傷害或治療。所有任務都不生成參數。';
export const effectiveR3 = {...effective,
 'tpl-mark-stacks':effective['tpl-mark-stacks']+' 標記可配置跨回合共享剩餘層數（resetOn=match）；不代表跨新對戰或帳號保存。',
 'tpl-teleport':'自己短程 leap 到地點或敵人，或把一名友軍移到自己腳邊；友軍不是移到任意遠方點。至少0.067秒，不是同幀瞬間換座標。可選落地傷害，不填 damage 則無傷害；無治療。',
 'tpl-proxy-cast':'單一錨點：指定敵人一次傷害，或指定地點圓形傷害；可附定身/暈眩/減速。沒有代理單位或多錨點。self 錨點不能承諾傷害周圍敵人。',
 'tpl-lock-combo':effective['tpl-lock-combo']+' 可由主動施放或反彈成功/擊殺/普攻/受傷事件觸發；包含固定節奏連擊與原地演出排程，不能當成即時零附帶效果的一次反擊。',
};
export const sourceGroups = {
 fate:['e002','hapm','hvsh'],eva:['e00r'],tree:['e00s'],negima:['e00w','emfr','etyr','n003'],naruto:['edem'],hunter:['efur','ucrl'],deathnote:['emns'],dragonwolf:['ewar'],zelda:['h00l'],bleach:['h01n'],lubu:['h01u'],panda:['h02k'],alpaca:['h02v'],
 higurashi:['e001'],shana:['e008'],azumi:['e00k'],ff7:['hart','u00j'],gash:['hblm'],pokemon:['hgam','ofar'],slayers:['hjai','o00l'],sazan:['hpal'],ushio:['hpb1'],dragonball:['huth','ogrh'],inuyasha:['hvwd','osam'],doraemon:['n00b'],dai:['nbbc','ubal'],shaman:['nplh'],yuyu:['nsjs','uvng'],satopica:['o00k'],miku:['o02p'],original:['ogld','u00k','udea'],adultgame:['orkn'],kyo:['u00h'],onepiece:['u00n','udre'],usavich:['u00v'],hokuto:['umal'],zombie:['zombiex'],
};
const explicit={fate:'train',eva:'test',tree:'dev',negima:'train',naruto:'train',hunter:'train',deathnote:'test',dragonwolf:'dev',zelda:'test',bleach:'dev',lubu:'train',panda:'train',alpaca:'train'};
export function splitFor(key){const n=parseInt(digest('r3-source-v1:'+key).slice(0,8),16)%10;return n<6?'train':n<8?'dev':'test';}
export function sourceGroup(id){const hero=id.split('.')[0].replace('godie-','');const match=Object.entries(sourceGroups).filter(([,ids])=>ids.includes(hero));assert.equal(match.length,1,'SOURCE_GROUP:'+id);return match[0][0];}
const order=(xs,key)=>xs.slice().sort((a,b)=>digest(key+JSON.stringify(a)).localeCompare(digest(key+JSON.stringify(b))));
export function buildCases(snapshot,old){
 const sources=new Map(snapshot.sources.map(s=>[s.id,s])),heroes=new Map(snapshot.heroes.map(h=>[h.id,h]));
 assert.equal(ownerReview.length,90);assert.equal(new Set(ownerReview.map(x=>x[0])).size,90);
 assert.equal(heroReview.length,53);assert.equal(new Set(heroReview.map(x=>x[0])).size,53);
 assert.deepEqual([...sources.keys()].sort(),ownerReview.map(x=>x[0]).sort());assert.deepEqual([...heroes.keys()].sort(),heroReview.map(x=>x[0]).sort());
 const catalog=Object.entries(effectiveR3).map(([templateId,description])=>({templateId,status:'enabled',description}));
 const cases=[],review=[];const add=(c,input)=>{c.messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}];c.requestDigest=digest(c.messages);c.quality='personally-source-reviewed-assistant-label-not-owner-gold';cases.push(c);};
 function claim(id,kind,text,verdict,variant,reason){
  const s=(kind==='hero-source'?heroes:sources).get(id);assert(s,'UNKNOWN_SOURCE');const original=kind==='hero-source'?s.descriptionOriginal:s.ownerOriginal;const group=sourceGroup(id);const split=explicit[group]??splitFor(group);
  const sourceText=kind==='hero-source'?original:mechanicsText(original);
  const input={task:kind,source:{id:s.id,name:s.name,snapshot:digest(original),text:sourceText},claim:text,instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'};
  const target={verdict};const key=`${kind}-${id}-${variant}`;
  add({id:key,task:kind,split,lineage:`source-${group}`,sourceId:id,sourceSha256:digest(original),target,acceptedTargets:[target],reviewReason:reason??(verdict==='supported'?'Full claim entailed by reviewed source, not merely same tags.':'Explicit contrary value, direction, condition, identity or ordering in source.')},input);
 }
 for(const [id,yes,no,note] of ownerReview){claim(id,'owner-mechanism',yes,'supported','yes');claim(id,'owner-mechanism',no,'contradicted','no');review.push({id,scope:'reviewed-claims-only; not whole-template-realizability',fullTextPersonallyRead:true,sourceSha256:digest(sources.get(id).ownerOriginal),supported:yes,contradicted:no,caution:note??null});}
 for(const [id,yes,no,unknown] of heroReview){claim(id,'hero-source',yes,'supported','yes');claim(id,'hero-source',no,'contradicted','no');claim(id,'hero-source',unknown,'not-stated','unknown','Locked repository setting does not establish this additional identity/version/ability assertion.');review.push({id,scope:'repository-setting-only; no external-lore or derived-role Gold',fullTextPersonallyRead:true,sourceSha256:digest(heroes.get(id).descriptionOriginal),supported:yes,contradicted:no,notStated:unknown});}
 for(const [id,text,reason] of ownerUnknown)claim(id,'owner-mechanism',text,'not-stated','unknown',reason);
 function mechanism(id,lineage,split,request,ids,origin){
  // A target-anchor proxy with optional status cleared is also a one-shot hit.
  if(ids.includes('tpl-single-strike')&&!ids.includes('tpl-proxy-cast'))ids=[...ids,'tpl-proxy-cast'];
  const targets=(ids.length?ids:[null]).map(templateId=>({decision:templateId?'accept':'refuse',templateId}));
  for(const t of targets)if(t.templateId)assert(catalog.some(c=>c.templateId===t.templateId));
  add({id,task:'mechanism-template',split,lineage,originalInput:{request},target:targets[0],acceptedTargets:targets,reviewReason:origin},{task:'mechanism-template',request:mechanicsText(request),catalog:order(catalog,id),instruction:'輸出 {decision,templateId}。decision=accept/refuse；拒絕時 templateId=null。僅選一張能完整滿足必要機制的卡，不輸出參數。'});
 }
 // Reuse TRAIN only; R2 dev/test remain regression and are never training exports.
 for(const c of old.filter(c=>c.split==='train'&&c.task==='mechanism-template'&&!c.id.startsWith('mechanism-aoe-react-')))mechanism('retained-'+c.id,'retained-'+c.lineage,'train',c.originalInput.request,c.acceptedTargets.map(t=>t.templateId).filter(Boolean),'Retained personally reviewed R2 TRAIN intent; refreshed effective catalog.');
 for(const [family,yes,ids,no] of mechanismPairs){const split=splitFor('scenario:'+family);const lineage='scenario-'+family;mechanism(`r3-${family}-yes`,lineage,split,yes,ids,'Personally authored positive scenario; full constraints reviewed.');mechanism(`r3-${family}-no`,lineage,split,no,[],'Personally authored counterfactual unsupported constraint; no implicit approximation.');
  // Same family stays in one split. These variants are not counted as independent sources.
  if(split==='train')for(const [label,req,targets] of [['yes',yes,ids],['no',no,[]]])mechanism(`r3-${family}-${label}-brief`,lineage,split,'請只推薦符合這段需求的機制卡，不能自行刪改條件：'+req,targets,'Train-only wording variant of reviewed scenario, not additional independent evidence.');
 }
 const kept=new Set();for(const c of old.filter(c=>c.split==='train'&&c.task==='vfx-semantic')){if(kept.has(c.lineage))continue;kept.add(c.lineage);const input=JSON.parse(c.messages[1].content);add({...c,id:'retention-'+c.id,lineage:'retention-'+c.lineage},input);}
 cases.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));validateCases(cases);
 return{cases,review,catalog};
}
export function validateCases(cases){
 const ids=new Set(),digests=new Set(),lineage=new Map(),sources=new Map();
 for(const c of cases){assert(!ids.has(c.id));ids.add(c.id);assert(!digests.has(c.requestDigest),'DUPLICATE_REQUEST');digests.add(c.requestDigest);assert.equal(digest(c.messages),c.requestDigest);assert(['train','dev','test'].includes(c.split));
  for(const [map,key] of [[lineage,c.lineage],[sources,c.sourceId]])if(key){if(map.has(key))assert.equal(map.get(key),c.split,'SPLIT_LEAK:'+key);map.set(key,c.split);}
  const input=JSON.parse(c.messages[1].content);assert(!Object.hasOwn(input,'target'));assert(!Object.hasOwn(input,'acceptedTargets'));assert(!Object.hasOwn(input,'reviewReason'));
 }
}
export function generate(root,oldRoot){
 if(fs.existsSync(path.join(root,'cases.private.json')))throw Error('REFUSE_DATA_OVERWRITE');
 const snapshot=JSON.parse(fs.readFileSync(path.join(root,'source-snapshot.json'))),old=JSON.parse(fs.readFileSync(path.join(oldRoot,'cases.private.json')));
 const data=buildCases(snapshot,old);const put=(name,value)=>fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',data.cases);put('personal-source-review.json',data.review);put('catalog.json',{system,mechanism:data.catalog,scope:'17 effective enabled cards; no parameter tuning',sourceVersion:'R3'});
 const manifest={schema:'ggd-forge-source-priority-curriculum@3',createdAt:new Date().toISOString(),casesSha256:digest(data.cases),sourceSnapshotSha256:digest(fs.readFileSync(path.join(root,'source-snapshot.json'),'utf8')),counts:Object.fromEntries(['train','dev','test'].map(s=>[s,data.cases.filter(c=>c.split===s).length])),tasks:Object.fromEntries([...new Set(data.cases.map(c=>c.task))].map(t=>[t,Object.fromEntries(['train','dev','test'].map(s=>[s,data.cases.filter(c=>c.task===t&&c.split===s).length]))])),ownerGold:false,fullOriginalSkillsValidated:false,releaseQualified:false,limitations:['Source claim entailment is not automatic full-hero generation or complete source-atom coverage.','All source claims assistant authored and personally reviewed, no independent human Gold.','Entire hero/franchise source groups separated; new mechanism scenario pairs separated, but template taxonomy shared.','R2 TRAIN intents retained; original R2 dev/test kept regression only.','VFX retained training subset only; no visual validation or parameter generation.']};put('dataset-manifest.json',manifest);
 for(const split of ['train','dev','test']){const rows=data.cases.filter(c=>c.split===split);put(split+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));if(split==='train')fs.writeFileSync(path.join(root,'train.jsonl'),rows.map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});}
 const ledger=data.cases.map(c=>({id:c.id,split:c.split,task:c.task,input:JSON.parse(c.messages[1].content),acceptedTargets:c.acceptedTargets,reason:c.reviewReason??c.proof}));put('question-review.json',ledger);
 put('source-family-splits.json',Object.fromEntries(Object.keys(sourceGroups).map(g=>[g,explicit[g]??splitFor(g)])));
 const dir=path.dirname(fileURLToPath(import.meta.url));put('curriculum-pins.json',['r3-data.mjs','r3-owner-review.mjs','r3-hero-review.mjs','r3-mechanism-seeds.mjs','reviewed-curriculum.mjs','dataset.mjs'].map(n=>({path:path.join(dir,n),sha256:digest(fs.readFileSync(path.join(dir,n),'utf8'))})));
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(generate(path.resolve(process.argv[2]),path.resolve(process.argv[3])),null,2));
