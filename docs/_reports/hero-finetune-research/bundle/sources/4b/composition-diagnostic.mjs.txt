/** Classification over reviewed single cards and bounded, verified compositions.
 * Diagnostic only. Not a free-form stack generator or production activation.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';import {validateCases} from './r3-data.mjs';
const self=fileURLToPath(import.meta.url),read=p=>JSON.parse(fs.readFileSync(p));
export const system='你是 GGD 既有機制計畫分類助手。只輸出指定 JSON，不寫推理或 Markdown。不生成參數、不編造模板、不創造未列出的組合。先確認所有必要機制、對象、事件、時序均被完整涵蓋，再从 allowedPlans 選一個計畫。單卡與已核對的多卡都可以選，但不可省略不支援的要求。未列出的組合沒有推薦資格，即使每張卡各自 enabled。沒有完整符合的計畫就 refuse；沒有明確批准時，不做近似降級。onConflict 永遠為 reject。只建議模板，參數由人工設定並重新驗證；不承諾目前模板預設值就等於需求。';
export const compositionPlans=[
 {id:'composition-self-buff-restore',templateIds:['tpl-buff-self','tpl-life-manipulate'],equivalentOrders:[['tpl-life-manipulate','tpl-buff-self']],description:'一次主動對自己施放：臨時數值增益，同次施法立即按自身最大生命比例加法回復自身生命，受上限封頂。兩者同時生效，不等增益結束後回血。不治療另一名隊友、不改成護盾、不替換技能組。',requiredChoices:['生命操作的對象設為自身，兩卡使用相容施法時間；不能沿用友方指定目標的預設。','只承諾數值增益與同時的生命回復；人工調整數值後仍需編譯及行為檢查。']},
 {id:'composition-independent-hooks',templateIds:['tpl-on-attack','tpl-on-hit-react'],equivalentOrders:[['tpl-on-hit-react','tpl-on-attack']],description:'常駐被動內有兩條獨立事件：普通攻擊命中追加傷害給普攻目標；自己實際受傷後，只傷害造成該次傷害的攻擊者。可各有獨立機率及獨立內部冷卻。不是共享一次抽籤或共享冷卻，不取消原傷害、不反擊周圍所有人，也不是按鍵開啟幾秒的暫時形態。',requiredChoices:['攻擊觸發設為普通攻擊事件；若需求無額外條件，要清除模板預填的條件。','兩條hook是獨立的。不能將獨立的機率或冷卻說成共享；參數仍由人工確認。']},
 {id:'composition-two-immediate-strikes',templateIds:['tpl-single-strike','tpl-single-strike'],equivalentOrders:[],description:'一次指定敵人施法，在同次結算中對同一敵人產生兩筆單體傷害。不合併成一筆、不去重、不自帶兩擊間隔或第二段按鍵。兩卡需相容施法時間；只能推薦已有這個需求的兩擊。',requiredChoices:['重複卡片是有意的兩筆效果，不是無害冗餘。','這不是一擊附帶相同傷害標籤，也不承諾延時或共享判定。']},
];
const yes=(ids)=>({decision:'accept',templateIds:ids,onConflict:'reject'}),no={decision:'refuse',templateIds:[],onConflict:'reject'};
export const questions=[
 ['buff-restore','train-pattern-a','同一次主動施法，立刻回復我自己的一部分最大生命，並暫時增加我自己的攻擊力；不要等增益到期才回血。','composition-self-buff-restore','兩條self效果同次施法，來源為真實cast測試。'],
 ['buff-restore','train-pattern-b','我需要一個自用的恢復加強化技能：數值增益有期限，生命回復在施法時直接增加自己目前生命且不超上限。','composition-self-buff-restore','同一已測語意的另一措辭，不是獨立機制家族。'],
 ['buff-restore','ally-instead','同一次施法把增益給我自己，生命回復給我選中的另一位隊友。兩者缺一不可。',null,'已核對组合是self/self，不提供self/target跨瞄準模式合併。'],
 ['buff-restore','wait-for-expiry','先對自己上數值增益，必須等這個增益自然結束之後才回復自己的生命，不能提前回血。',null,'並列效果沒有等待buff到期的相依排程。'],
 ['buff-restore','shield-not-hp','我自己暫時增加攻擊力，同時取得一面可吸收傷害的護盾；不要把護盾換成生命回復。',null,'restore是生命加法，不是吸收護盾；沒有已核對的增益加護盾計畫。'],
 ['buff-restore','replace-kit','同時回復自己生命並把我的整套技能替換成另一套，只有數值提升不算完成。',null,'buff-self不更換技能組。'],
 ['independent-hooks','train-pattern-a','常駐被動：普攻命中追加一段傷害給該目標；我受傷之後回擊當次攻擊者。這兩條機率與冷卻各自獨立，不免除原本受的傷。','composition-independent-hooks','真實普攻與受傷管線、分離ICD及單一攻擊者都有實測。'],
 ['independent-hooks','train-pattern-b','一個不需按鍵的被動，同時保有普攻附傷與受擊後只反擊來源敵人的能力；兩種事件分開處理即可。','composition-independent-hooks','允許同一被動內的兩條獨立hook，不要求共享條件。'],
 ['independent-hooks','shared-cooldown','普攻附傷與受傷反擊必須共用同一個內部冷卻：任一觸發後，另一個也必須一起進入冷卻。',null,'每條hook各自記帳，不是共享冷卻。'],
 ['independent-hooks','temporary-button','按下按鍵後，才在接下來八秒內同時獲得普攻附傷和受傷反擊；八秒後兩種效果都消失。',null,'核對的是常駐被動，不是有hook的短時主動狀態；buff-self不載入這兩條hook。'],
 ['independent-hooks','cancel-damage','普攻附傷之外，我受到攻擊時還必須取消那一發原傷害，並把它反彈給來源；事後追加傷害不算。',null,'on-hit-react是原傷害後追加傷害，不具有取消原傷害語意。'],
 ['independent-hooks','area-counter','我普攻時追加傷害；我受傷時反擊周圍所有敵人，不只是打我的那個人。',null,'反擊範圍欄位不改變只打事件來源的語意。'],
 ['two-immediate-strikes','train-pattern-a','一次對單一敵人施法，立刻分別結算兩筆單體傷害；需要兩次命中結算，不要求中間有間隔。','composition-two-immediate-strikes','實測重複卡產生兩個damage事件及控制組兩倍掉血。'],
 ['two-immediate-strikes','train-pattern-b','對我選的敵人連續給兩筆同次施法的傷害，不等第二次按鍵，也不延遲第二筆。','composition-two-immediate-strikes','同次施法兩筆的另一措辭，不當作新機制家族。'],
 ['two-immediate-strikes','delay-second','指定敵人施法的當下立即打第一下，整整一秒後才打第二下；期間施法者仍能自由移動，不進入原地演出。不能在同次結算中立刻打兩筆。',null,'重複single-strike没有延時；lock-combo首筆等一個間隔且施法者有原地演出，不符合第一筆即時與自由移動。本集合未列出精確計畫。'],
 ['two-immediate-strikes','second-key','第一次按鍵只打第一下，玩家再按第二次按鍵才打第二下；不能自動打完。',null,'重複卡與預定時間表都不是玩家按鍵確認第二擊。'],
 ['single-card-controls','single-hit','我只要指定一名敵人造成一次即時傷害，不能無故多打第二次，也不需要其他效果。',['tpl-single-strike','tpl-instant-blast','tpl-proxy-cast'],'多卡不是愈多愈好；保留已核對單卡等價選項。'],
 ['single-card-controls','single-buff','只暫時提高我自己的攻擊力，不要額外治療、反擊或改技能組。',['tpl-buff-self'],'單卡已完整涵蓋，不加第二張卡引入副作用。'],
 ['single-card-controls','single-restore','立即按我自身最大生命的一部分回復我自己的生命，受上限封頂；沒有額外增益。',['tpl-life-manipulate'],'單卡restore可設為self，沒有數值增益要求。'],
 ['single-card-controls','single-react','受到傷害之後，只回擊造成該次傷害的敵人；不免傷，不需要普攻附傷。',['tpl-on-hit-react'],'不要為反擊單一用途多塞on-attack。'],
];

export function makeCatalog(review,probe){
 assert.equal(probe.passed,11);assert.equal(probe.total,11);assert(probe.checks.every(c=>c.pass));assert.equal(probe.revision,review.revision);
 assert.deepEqual(probe.checks.map(c=>c.name).sort(),[... [20260906,20260907].flatMap(seed=>[false,true].flatMap(reverse=>[`self-buff-restore-${seed}-${reverse}`,`independent-hooks-${seed}-${reverse}`])),'conflicting-cast-shapes-rejected','active-payload-in-passive-not-castable','duplicate-strike-really-doubles-hit'].sort());
 const singles=review.rows.filter(r=>r.status==='enabled').map(r=>({id:r.templateId,templateIds:[r.templateId],equivalentOrders:[],description:r.description,requiredChoices:[]}));
 for(const p of compositionPlans)for(const id of p.templateIds)assert(singles.some(s=>s.id===id));
 return{schema:'ggd-reviewed-composition-catalog@1',revision:review.revision,reviewSha256:digest(review),runtimeProbeSha256:digest(probe),allowedPlans:[...singles,...compositionPlans],unavailable:review.rows.filter(r=>r.status!=='enabled').map(({templateId,status})=>({templateId,status})),system,releaseQualified:false,scope:'All 29 enabled single-card families plus three explicitly reviewed compositions. This is a bounded research vocabulary, not all valid stacks or all requested hero mechanisms.'};
}
export function validateSelection(catalog,value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!=='decision,onConflict,templateIds')return{pass:false,error:'OUTPUT_CONTRACT'};
 if(!['accept','refuse'].includes(value.decision)||value.onConflict!=='reject'||!Array.isArray(value.templateIds)||!value.templateIds.every(id=>typeof id==='string'))return{pass:false,error:'OUTPUT_CONTRACT'};
 if(value.decision==='refuse')return{pass:value.templateIds.length===0,error:value.templateIds.length?'REFUSAL_WITH_CARDS':null};
 const matches=catalog.allowedPlans.filter(p=>[p.templateIds,...p.equivalentOrders].some(ids=>JSON.stringify(ids)===JSON.stringify(value.templateIds)));
 return matches.length?{pass:true,error:null,plans:matches.map(p=>({id:p.id,requiredChoices:p.requiredChoices})),semanticQualified:false,activation:false}:{pass:false,error:'UNREVIEWED_COMPOSITION'};
}
export function build(review,probe){
 const catalog=makeCatalog(review,probe),cases=[],personalReview=[];
 for(const [family,variant,request,answer,reason] of questions){
  let targets;
  if(answer===null)targets=[no];else if(Array.isArray(answer))targets=answer.map(id=>yes([id]));else{const plan=catalog.allowedPlans.find(p=>p.id===answer);assert(plan);targets=[plan.templateIds,...plan.equivalentOrders].map(yes);}
  for(const t of targets)assert.equal(validateSelection(catalog,t).pass,true);
  const id=`composition-${family}-${variant}`,allowedPlans=catalog.allowedPlans.slice().sort((a,b)=>digest(id+a.id).localeCompare(digest(id+b.id)));
  const input={task:'mechanism-stack',sourceVersion:catalog.revision,request:mechanicsText(request),allowedPlans,unavailable:catalog.unavailable,instruction:'只輸出 {"decision":"accept|refuse","templateIds":[...],"onConflict":"reject"}。只能選allowedPlans的一個既有單卡或多卡計畫及明列的等價順序；拒絕時templateIds=[]。不得任意追加、移除或去重卡片，不生成參數。'};
  const messages=[{role:'system',content:catalog.system},{role:'user',content:JSON.stringify(input)}];
  cases.push({id,task:'mechanism-stack',split:'test',lineage:'known-composition-'+family,messages,requestDigest:digest(messages),target:targets[0],acceptedTargets:targets,reviewReason:reason,trainingEligible:false,selectionEligible:false,cohort:'known-template-composition-diagnostic'});
  personalReview.push({id,request,acceptedTargets:targets,reason,personallyReviewed:true,sourceTier:'Pinned main template/runtime behavior, not Owner original or fresh independent semantic families',trainingEligible:false});
 }
 validateCases(cases);return{catalog,cases,personalReview};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){
 const [reviewPath,probePath,repo,out]=process.argv.slice(2);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const review=read(reviewPath),probe=read(probePath);
 assert.equal(fileHash(path.join(path.dirname(self),'main-composition-runtime-probe.ts')),probe.scriptSha256,'PROBE_SCRIPT_CHANGED');for(const p of probe.pins)assert.equal(fileHash(path.join(repo,p.path)),p.sha256,'SOURCE_CHANGED:'+p.path);
 const data=build(review,probe);fs.mkdirSync(out);const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('catalog.json',data.catalog);put('cases.private.json',data.cases);put('personal-review.json',data.personalReview);put('requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 put('manifest.json',{schema:'ggd-composition-classification-diagnostic@1',frozenAt:new Date().toISOString(),casesSha256:digest(data.cases),rows:data.cases.length,trainingEligible:false,selectionEligible:false,oldScoresRewritten:false,releaseQualified:false,sourceFiles:[reviewPath,probePath,self].map(p=>({path:path.resolve(p),sha256:fileHash(p)})),counts:{singleCardPlans:data.catalog.allowedPlans.length-compositionPlans.length,compositionPlans:compositionPlans.length,accept:data.cases.filter(c=>c.target.decision==='accept').length,refuse:data.cases.filter(c=>c.target.decision==='refuse').length},limitations:['Known template semantics and assistant-authored needs; not independent source generalization.','Only enumerated plans can be recommended; valid unlisted compositions remain unproven, not asserted impossible in the engine.','Runtime verification used explicit test parameters, not every legal parameter setting or latest main.','New task-specific input/output contract differs from prior one-card benchmark. Do not attribute gains solely to finetuning or combine denominators.','Never silently promote a partial plan that drops a required condition.']});
 console.log(JSON.stringify({out,rows:data.cases.length,plans:data.catalog.allowedPlans.length,trainingStarted:false}));
}
