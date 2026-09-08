/** Full-proposal + reverse-requirement diagnostics, never training or sealed Gold. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {buildFidelityPlan,validateFidelity} from './r3-fidelity-client.mjs';
import {revision} from './main-catalog-review.mjs';
export const reviewedRequirements=[
 {key:'hercules-historical',id:'godie-hapm.passive',version:'Owner TSV 2026-08-08 (historical)',req:[
  '這是被動技能，冷卻0秒。','初始有十二層試煉標記。','受到致命傷害時消耗一層試煉。','消耗後先無敵1.5秒，隨後才回復最大生命的50%。','擊退周圍敵人並使其暈眩0.5秒。','每失去一層試煉，永久增加10%攻擊力與10%最大生命。','十二次試煉跨回合共享。'],badIndex:3,bad:'消耗後立刻回復最大生命的50%，同格開始無敵1.5秒，不等無敵結束。'},
 {key:'link-historical',id:'godie-h00l.e',version:'Owner TSV 2026-08-08 (historical)',req:[
  '這是被動強化。','智慧、敏捷、力量各提高3/6/9/12點。','每三下普通攻擊額外造成33% AP傷害。'],badIndex:2,bad:'每兩下普通攻擊額外造成33% AP傷害。'},
 {key:'emfr-historical',id:'godie-emfr.ex',version:'Owner TSV 2026-08-08 (historical)',req:[
  '這是主動技能，冷卻60秒。','反彈100%魔法傷害。','把該傷害轉化為自己的魔力。','該傷害也短暫加成到自己的AP，且可以累加。','這項暫時AP加成持續5秒後歸零。'],badIndex:2,bad:'把該傷害轉化為敵人的魔力，自己不回復魔力。'},
 {key:'eva-ex-historical',id:'godie-e00r.ex',version:'Owner TSV 2026-08-08 (historical)',req:[
  '這是被動技能，冷卻150秒。','暴走門檻是低於自身最大生命20%。','攻擊速度提高到上限10。','吸血120%，迴避50%。','持續12秒。'],badIndex:1,bad:'暴走門檻是低於自身最大生命50%。'},
 {key:'eva-ex-main',id:'godie-e00r.ex',version:revision,req:[
  '這是被動技能。','暴走門檻是低於自身最大生命50%。','攻擊速度提高到上限10。','吸血400%，迴避50%。','持續12秒。','暴走期間免疫所有負面效果。'],badIndex:1,bad:'暴走門檻是低於自身最大生命20%。'},
 {key:'eva-at-main',id:'godie-e00r.e',version:revision,req:[
  '這是被動技能。','每8秒生成一個護盾。','護盾可抵擋150/250/350/450點魔法傷害。','護盾不會疊加。','有10/15/20/25%的機率格擋50%物理傷害。','真實傷害無法被這個格擋擋住。'],omitIndex:3,badIndex:1,bad:'每次護盾固定持續8秒，原文的8秒是護盾持續時間而非生成週期。'},
];

export function buildDiagnostic(snapshot,mainDocs){
 const plans=[],cases=[],requests=[];
 for(const spec of reviewedRequirements){
  const record=spec.version===revision?mainDocs[spec.id]:snapshot.sources.find(s=>s.id===spec.id);assert(record,'MISSING_SOURCE');
  const sourceText=spec.version===revision?record.description:record.ownerOriginal;
  const source={id:spec.id,name:record.name,version:spec.version,text:sourceText,sha256:digest(sourceText)};
  const requirements=spec.req.map((text,i)=>({id:'r'+i,text}));
  const omitIndex=spec.omitIndex??spec.req.length-1;
  for(const variant of ['complete','omitted','wrong']){
   const parts=spec.req.slice();if(variant==='omitted')parts.splice(omitIndex,1);if(variant==='wrong')parts[spec.badIndex]=spec.bad;
   const input={task:'owner-mechanism',source,requirements,requirementsSourceSha256:source.sha256,proposal:parts.join('\n'),requirementsCoverage:'partial'};
   // "partial" is deliberate: mechanical checklist, not all setting/prose/VFX.
   const plan=buildFidelityPlan(input),key=spec.key+'-'+variant;
   const expected=plan.requests.map((r,i)=>{
    const verdict=variant==='wrong'&&(i===0||i===spec.badIndex+1)?'contradicted':variant==='omitted'&&i===omitIndex+1?'not-stated':'supported';
    const id=key+'/'+r.id,request={...r,id};requests.push(request);
    cases.push({...request,task:'owner-mechanism',split:'dev',lineage:'fidelity-'+spec.key,target:{verdict},acceptedTargets:[{verdict}],trainingEligible:false,quality:'assistant-reviewed-bidirectional-diagnostic'});
    return {id:r.id,verdict};
   });
   plans.push({key,input,plan,expected,expectedChecklistPass:variant==='complete',sourceVersion:spec.version,trainingEligible:false});
  }
 }
 return {plans,cases,requests,manifest:{schema:'ggd-forge-bidirectional-diagnostic@1',createdAt:new Date().toISOString(),plans:plans.length,requests:requests.length,casesSha256:digest(cases),sourceGroups:reviewedRequirements.length,trainingEligible:false,sealedTest:false,releaseQualified:false,scope:'Mechanism checklist coverage only; original full source retained, history/current-version kept separate. Known source identities overlap R3 train/test: regression diagnostics only, not independent generalization.'}};
}
export function validateDiagnostic(bundle,raw){
 assert.equal(raw.complete,true);assert.equal(raw.results.length,bundle.requests.length);
 assert.equal(new Set(raw.results.map(r=>r.id)).size,raw.results.length);
 const byId=new Map(raw.results.map(r=>[r.id,r]));
 const results=bundle.plans.map(p=>{
  const local={...raw,results:p.plan.requests.map(r=>{const out=byId.get(p.key+'/'+r.id);assert(out,'MISSING_RESULT');return {...out,id:r.id};})};
  const actual=validateFidelity(p.plan,local);
  const verdicts=actual.rows.map((r,i)=>({id:r.id,expected:p.expected[i].verdict,actual:r.verdict,correct:r.verdict===p.expected[i].verdict}));
  return {key:p.key,expectedChecklistPass:p.expectedChecklistPass,actual,verdicts,correctGate:actual.modelChecklistPass===p.expectedChecklistPass};
 });
 return {results,counts:{plans:results.length,correctGates:results.filter(r=>r.correctGate).length,unsafeWholeProposalAccepts:results.filter(r=>!r.expectedChecklistPass&&r.actual.modelChecklistPass).length,correctClaims:results.flatMap(r=>r.verdicts).filter(r=>r.correct).length,totalClaims:bundle.requests.length},releaseQualified:false,trainingEligible:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2),read=p=>JSON.parse(fs.readFileSync(p));
 if(mode==='build'){
  const [snapshotPath,mainRepo,out]=args;assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const mainDocs=Object.fromEntries(['godie-e00r.ex','godie-e00r.e'].map(id=>[id,read(path.join(mainRepo,'content/abilities',id+'.json'))]));
  const bundle=buildDiagnostic(read(snapshotPath),mainDocs);fs.mkdirSync(out,{recursive:true});
  for(const [n,x] of [['bundle.private.json',bundle],['requests.json',bundle.requests],['cases.private.json',bundle.cases],['manifest.json',bundle.manifest]])fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(bundle.manifest));
 }else if(mode==='validate'){
  const [bundlePath,rawPath,out]=args,result=validateDiagnostic(read(bundlePath),read(rawPath));fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.counts));
 }else throw Error('usage: r3-fidelity-diagnostic.mjs build SNAPSHOT PINNED_MAIN NEW_DIR | validate BUNDLE RAW NEW_REPORT');
}
