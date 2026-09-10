/** Prospective new skill texts, post-selection only; not latest Owner Gold. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {system,sourceGroup,validateCases} from './r3-data.mjs';import {fileHash} from './precision-diagnostic.mjs';
export const seeds=[
 ['huth.w','吃下餅乾可以回復500點體力。','吃下餅乾只能回復50點體力。','把敵人變餅乾時造成的固定傷害為500。','500是吃下後的回復量，不是尚未解開的傷害placeholder。'],
 ['huth.e','分身技能創造兩個具30%攻擊力的普烏實體，可持續十秒。','分身技能創造四個普烏實體，不是兩個。','每個分身都能施放普烏本體的全部主動技能。','數量、攻擊力、時長直接提供；完整技能繼承未知。'],
 ['ogrh.w','瞬間移動以傳送方式移到指定位置。','瞬間移動不能到指定位置，只能停留施法前原位。','此傳送的最大距離明確為500。','原文指定位置與未解travel分開；不對引擎實作作承諾。'],
 ['ogrh.e','變身維持八秒；變回本體時攻速、移速與變身專屬25%攻擊力被動一起消失。','變回本體後，變身專屬的25%攻擊力被動永久保留。','本次變身會消耗100點魔力。','正文明示三者同時消失；魔力成本未說明。'],
 ['ogrh.ex','超級賽亞人三狀態有額外25%攻擊力，該攻擊力加成不能與其他靈氣加疊。','額外25%攻擊力可以與其他靈氣加成直接疊加。','要獲得這個能力，角色力量必須達到150點。','不能疊加有明文；能力門檻沒有定量。'],
 ['hvwd.q','破魔之箭使敵人受到25點傷害，同時流失法力，並屬法球效應。','破魔之箭使敵人回復法力，並不會令敵人流失法力。','敵人每次流失的法力恰好為25點。','25屬傷害數值，流失魔力量沒有給出。'],
 ['hvwd.w','明鏡止水使桔梗弓箭的遠距攻擊傷害加成7%。','明鏡止水完全不增加桔梗的弓箭遠距攻擊傷害。','此靈氣會讓附近所有友軍也得到相同7%傷害加成。','正文只肯定桔梗弓箭加成，靈氣標籤不提供完整受益者規則。'],
 ['osam.passive','靈魂吞噬每秒吸取200點生命，持續五秒，用於恢復殺生丸自身生命。','靈魂吞噬每秒只吸取20點生命。','靈魂吞噬的有效距離固定為1000。','頻率、量、時長與自我回復有正文，距離沒有。'],
 ['osam.q','毒華爪會讓這一擊的10%傷害擊穿對方並傷害附近敵人。','毒華爪會把這一擊100%的傷害擊穿並擴散，而不是10%。','毒華爪傷及附近敵人的有效半徑為400。','比例10%直接明確；附近範圍未定量。'],
 ['osam.w','閃光鞭在攻擊時有10%機率造成1.5倍傷害。','閃光鞭的1.5倍傷害在每次攻擊都必定觸發。','閃光鞭每次觸發後有三秒內部冷卻。','機率不等於必定，沒有內置冷卻值。'],
 ['o02p.r','舞蹈期間不受魔法傷害，持續四秒，並每兩秒對附近小範圍部隊施展最初的聲音。','這個舞蹈總共只持續兩秒，而不是四秒。','舞蹈期間也完全免疫物理傷害。','兩秒是附加技能頻率，不是總時長；未明示物理免疫或其否定。'],
 ['o02p.ex','選中的部隊獲得20點額外裝甲及100%血量與瑪那回復，額外裝甲維持十五秒。','選中的部隊只獲得2點額外裝甲，不是20點。','攻擊受強化者所造成的移速與攻速減緩，都維持十五秒。','15秒綁裝甲，不借給反應減速；額外有條件護盾也不能覆蓋此缺失。'],
 ['u00n.e','槍亂打影響範圍400內敵人，造成傷害並暈眩1.5秒。','槍亂打的暈眩持續十五秒。','槍亂打的固定傷害明確為500點。','範圍與暈眩已定量，dmg仍為placeholder。'],
 ['u00n.r','巨人迴旋彈對周圍敵人造成600加50%AP傷害，並使其難以行動兩秒。','巨人迴旋彈的AP加成為500%，不是50%。','難以行動的兩秒內，敵人完全不能施放技能。','難以行動未具體定義為沉默／禁止施法。'],
 ['u00n.ex','霸王色造成500點範圍傷害，暈眩英雄五秒、非英雄十秒。','霸王色對英雄及非英雄一律只暈眩五秒。','降低範圍部隊50%血量時，以各受害者最大生命為基準。','兩類暈眩時長明寫，降低血量的最大／現存基準未明示。'],
 ['udre.passive','三刀流提升自身攻速75%，每秒損失12點生命，持續十五秒。','三刀流每秒損失12點魔力，完全不損失生命。','再次施放三刀流會把剩餘持續時間直接加十五秒。','資源種類不能替換，重施刷新／相加規則未知。'],
 ['udre.q','燒鬼斬在攻擊敵人時附加10點火焰擴散傷害。','燒鬼斬附加的是100點火焰擴散傷害，不是10點。','燒鬼斬的火焰擴散半徑固定為450。','傷害值直接提供，半徑未提供。'],
 ['udre.w','虎狩獵給多個對手250傷害，並擊暈1.25秒。','虎狩獵的暈眩會持續12.5秒。','虎狩獵一次最多影響五個對手。','多個不等於明示五個上限。'],
 ['u00v.w','地走龍牙破突襲目標區域，造成傷害並暈眩0.1秒。','地走龍牙破造成的暈眩持續一秒。','地走龍牙破的固定傷害明確為500點。','0.1直接明寫，不能用dmg占位猜傷害。'],
 ['u00v.e','廬山昇龍破會傷害附近敵方單位。','廬山昇龍破只治療友軍，不會傷害敵方。','廬山昇龍破的固定基礎傷害是400點。','敵人傷害方向明確，但傷害值未解。'],
 ['u00v.ex','加速爆體可抵擋50%法術和穿刺傷害，並有機率提高攻速與移速。','加速爆體完全抵擋100%法術與穿刺傷害。','加速爆體提高攻速與移速的觸發機率明確為20%。','50%不是口語接近無敵的100%；加速機率沒有數值。'],
];
const read=p=>JSON.parse(fs.readFileSync(p)),self=fileURLToPath(import.meta.url);
export function build(sources,prior,splits){
 assert.equal(sources.length,21);const cases=[],reviews=[];
 for(const [short,...claim] of seeds){const id='godie-'+short,s=sources.find(s=>s.id===id);assert(s);const group=sourceGroup(id);assert.equal(splits[group],'test');const text=mechanicsText(s.description);
  assert(!prior.some(c=>c.sourceId===id||c.messages?.some(m=>m.content.includes(id)||m.content.includes(text))),'PRIOR_SOURCE_EXPOSURE:'+id);
  for(const [i,verdict] of ['supported','contradicted','not-stated'].entries()){
   const input={task:'owner-mechanism',source:{id,name:s.name,snapshot:digest(s.description),text,sourceTier:'pinned-repository-description; not verified latest Owner'},claim:claim[i],instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'},messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],target={verdict};
   const c={id:'r6-fresh-'+short+'-'+i,task:'owner-mechanism',split:'test',lineage:'source-'+group,sourceId:id,sourceSha256:digest(s.description),messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:claim[3],cohort:'r6-new-skill-text-post-selection',trainingEligible:false,selectionEligible:false};cases.push(c);reviews.push({id:c.id,source:s,input,expected:target,reason:claim[3],fullTextPersonallyRead:true,claimPersonallyReviewed:true,ownerGold:false});
  }
 }
 cases.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));validateCases(cases);return{cases,reviews};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){
 const [main,root]=process.argv.slice(2);assert(path.isAbsolute(main)&&path.isAbsolute(root));const out=path.join(root,'fresh-source-v1');assert(!fs.existsSync(out));const outputs=path.dirname(root),r3=path.join(outputs,'forge-mechanism-priority-r3-20260906'),ext=path.join(outputs,'forge-additional-four-hours-20260906');
 const priorFiles=['forge-classification-reviewed-r2-20260906','forge-mechanism-priority-r3-20260906','forge-source-calibration-r4-20260906','forge-contrastive-r5-20260906'].map(n=>path.join(outputs,n,'cases.private.json'));priorFiles.push(path.join(root,'cases.private.json'),path.join(outputs,'forge-contrastive-r5-20260906/fresh-source-diagnostic-v1/cases.private.json'),...['main-hero-diagnostic-v1','fidelity-diagnostic-v2','main-diagnostic-v4'].map(n=>path.join(r3,n,'cases.private.json')),...['composition-diagnostic-v2','source-label-clarification-v1'].map(n=>path.join(ext,n,'cases.private.json')));
 const sources=seeds.map(([short])=>{const p=path.join(main,'content/abilities/godie-'+short+'.json'),doc=read(p);return{id:doc.id,name:doc.name,description:doc.description,provenance:doc.provenance,sourcePath:p,fileSha256:fileHash(p)};}),data=build(sources,priorFiles.flatMap(read),read(path.join(r3,'source-family-splits.json')));
 fs.mkdirSync(out);const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});put('cases.private.json',data.cases);put('requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));put('personal-review.json',data.reviews);put('source-snapshot.json',sources);
 put('manifest.json',{schema:'ggd-r6-new-skill-text-diagnostic@1',frozenAt:new Date().toISOString(),casesSha256:digest(data.cases),sources:21,rows:63,labels:{supported:21,contradicted:21,'not-stated':21},sourceFiles:[{path:self,sha256:fileHash(self)},...sources.map(s=>({path:s.sourcePath,sha256:s.fileSha256}))],priorAuditFiles:priorFiles.map(p=>({path:p,sha256:fileHash(p)})),exactSourceIdOrTextExposure:0,trainingAllowed:false,selectionAllowed:false,oldScoresRewritten:false,ownerGold:false,releaseQualified:false,excluded:[{id:'godie-huth.ex',reason:'Very thin final-form narrative with mechanics still awaiting source accounting; do not inflate mechanism coverage.'},{id:'godie-o02p.passive',reason:'Long embedded historical bug-and-correction narrative; avoid mixing historical and revised recipient semantics in a simple entailment test.'}],limitations:['New skill IDs/full texts only relative to explicitly audited corpus files, not pretraining or all historical experiments.','Same held-out franchises and familiar semantic patterns; not entirely new families.','Repository w3x-import descriptions, not latest Owner truth or runtime implementation guarantees.','Labels authored and reviewed by this assistant, not independent human Gold.','Frozen before post-selection inference; never used for R6 training or selection.']});console.log(JSON.stringify({out,sources:21,rows:63,trainingAllowed:false}));
}
