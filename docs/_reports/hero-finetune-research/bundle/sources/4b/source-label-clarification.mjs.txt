/** Diagnostic source-label clarification. No training or rewriting old scores. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {system,validateCases} from './r3-data.mjs';
export const reviewed=[
 ['e00s.w','每次普通攻擊都有小範圍擴散傷害，原文列出的比例為30%、40%、50%、60%。','每次普通攻擊完全沒有範圍傷害，只會傷害單一目標。','大怒石的擴散傷害會使命中的敵人暈眩。','Old claims replace 擴散 with 分裂; positive also broadens 普通攻擊 to 攻擊. No explicit synonym definition found in supplied source. New positive names the literal list, not an added level convention. This is not a score-equivalent rewrite.'],
 ['e00r.q','吞噬原文所列剩餘生命比例的敵方英雄，使其立即死亡，並回復等同其剩餘生命的生命值。','吞噬只能對非英雄使用，不能吞噬敵方英雄。','吞噬成功後會把受害者的全部技能加入施法者的技能組。','Old positive introduces 低於門檻; exact inequality is not explicit in source. New claim avoids inventing < versus <= or exact-equality boundaries.'],
 ['h00l.passive','普通攻擊時有額外3%最大生命傷害，並附带淨化效果。','普通攻擊沒有任何額外傷害。','額外3%傷害的百分比基準確定是施法者自身的最大生命。','Missing percentage owner remains not-stated. New positive preserves 淨化 instead of requiring the unsupported-in-input synonym mapping to 驅散.'],
 ['emns.passive','魔力所形成的護盾可抵擋全部傷害，每點魔力抵免三點傷害。','這個護盾只能抵擋魔法傷害，完全不能抵擋物理傷害。','沒有受到攻擊時，這個護盾也會在六秒後自然消失。','Old 魔法護盾 is a reasonable general paraphrase, not a claim of magic-only immunity; original supported label retained. New wording probes vocabulary sensitivity. Cooldown does not establish lifetime.'],
 ['h00l.r','反彈物理與魔法傷害的狀態持續三秒，期間成功反彈敵方技能AP傷害會立即回復生命並擊退敵人。','海拉爾之盾完全不能反彈物理傷害。','成功反彈普通攻擊的物理傷害，也一定會觸發同一個生命回復效果。','Keep open-world implication policy: AP-skill success is sufficient, but no exclusive rule for all other events is stated. Unknown does not mean approve the added behavior.'],
];
export function build(snapshot,prior){
 const cases=[],review=[];
 for(const [short,...rest] of reviewed){const sourceId='godie-'+short,s=snapshot.sources.find(s=>s.id===sourceId);assert(s);const parent=prior.find(c=>c.sourceId===sourceId&&c.task==='owner-mechanism');assert(parent&&parent.split!=='train');
  for(const [i,verdict] of ['supported','contradicted','not-stated'].entries()){
   const input={task:'owner-mechanism',source:{id:sourceId,name:s.name,snapshot:digest(s.ownerOriginal),text:mechanicsText(s.ownerOriginal)},claim:rest[i],instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'};
   const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],target={verdict};
   const c={id:'source-clarification-'+short+'-'+i,task:'owner-mechanism',split:parent.split,lineage:parent.lineage,sourceId,sourceSha256:digest(s.ownerOriginal),messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:rest[3],trainingEligible:false,selectionEligible:false,cohort:'known-source-label-clarification'};
   assert(!prior.some(p=>p.requestDigest===c.requestDigest),'EXACT_OLD_REQUEST');cases.push(c);review.push({id:c.id,sourceOriginal:s.ownerOriginal,sourceSha256:c.sourceSha256,sourceTier:'historical Owner TSV 2026-08-08',claim:input.claim,verdict,reason:rest[3],fullTextPersonallyRead:true,originalCases:prior.filter(p=>p.sourceId===sourceId).map(p=>p.id),ownerGold:false});
  }
 }
 cases.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));validateCases(cases);return{cases,review};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [r3,r5,out]=process.argv.slice(2);for(const p of [r3,r5,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=p=>JSON.parse(fs.readFileSync(p)),snapshot=read(path.join(r3,'source-snapshot.json')),prior=read(path.join(r5,'cases.private.json')),data=build(snapshot,prior);fs.mkdirSync(out);
 const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});put('cases.private.json',data.cases);put('personal-review.json',data.review);put('requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 put('manifest.json',{schema:'ggd-source-label-clarification@1',frozenAt:new Date().toISOString(),casesSha256:digest(data.cases),rows:data.cases.length,sources:reviewed.length,trainingEligible:false,selectionEligible:false,oldScoresRewritten:false,releaseQualified:false,limitations:['Known sources and error patterns; not new generalization.','New claims deliberately remove ambiguous terminology or unspoken conventions; not semantic-equivalent rewrites in all cases.','Do not count easier clarified claims as a fixed old failure or replace denominators.','Old R5 dev and test remain immutable; evidence informs future label curation, not current checkpoint selection.']});console.log(JSON.stringify({out,rows:data.cases.length,trainingStarted:false}));
}
