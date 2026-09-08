/** Prospective expanded DEV only; original tests and source-family split stay fixed. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {validateCases} from './r3-data.mjs';
// Full 18 original dev source texts were reread. e00s.w excluded because it is
// already part of the frozen, selection-ineligible clarification diagnostic.
export const seeds=[
 ['e00s.e','被束縛的敵人仍能施展技能與攻擊，但是不能移動。','木靈束縛使敵人不能施展技能，也不能攻擊。','木靈束縛的有效半徑明確為六。','正文直接區分移動與施法／攻擊；歷史override的半徑不能補進Owner輸入。'],
 ['e00s.ex','千年練成追加500%AP傷害，並回復周圍自己與友方隊伍生命。','樹海降臨完全不回復任何生命，只增加傷害。','10%的回復量明確以每一位受益者的最大生命計算。','追加傷害與回復對象均明寫；10%未明示當前／最大生命基準。'],
 ['e00s.passive','紮根時無法移動；切回行走模式後回到原本能力與狀態。','紮根時仍可移動，切回行走模式也不會恢復原本能力。','紮根狀態的最長持續時間明確為十五秒。','紮根／解除行為直接寫明；15秒是冷卻，不是已知形態上限。'],
 ['e00s.q','這份說明給出六十秒冷卻、施法距離十一，以及力量乘三的傷害加成。','這份說明給出的技能冷卻是三十五秒。','傷害範圍的半徑固定為六。','依完整Owner的60秒與距離11；不用older override的35秒／半徑6。'],
 ['e00s.r','列出的樹精數量是4、6、8，每棵的範圍傷害含30%AP加成。','只能召喚一棵樹精，而且樹精的傷害完全沒有AP加成。','召出的樹精最多能存活九十秒。','直接詢問数列而不暗加等級慣例；90秒是冷卻，樹精存活時間未交代。'],
 ['ewar.e','每次攻擊的暴擊觸發機率為10%，列出的倍率為1.1、2.2、3.3、4.4。','暴擊在每次攻擊都必定發動，觸發機率是100%。','敵人沒有混亂標記時，也必定發生這裡描述的100%AP額外傷害。','10%機率與倍數明寫；只寫混亂條件足以追加，不把未交代情形改成明確禁止或保證。'],
 ['ewar.ex','先吟唱兩秒，造成1800加600%AP傷害，並擊退敵方單位。','仙氣發勁不會擊退敵人。','擊退的固定距離為十二。','吟唱、數值及擊退均明寫；距離2是施法距離，沒有給擊退距離。'],
 ['ewar.passive','物理攻擊迴避機率是20%。','物理攻擊迴避機率是80%。','成功迴避後會回復施法者最大生命的10%。','物理迴避20%有正文；回復觸發與生命基準均未提供。'],
 ['ewar.q','命中使目標混亂一秒，傷害另有60%AP加成。','目標的混亂狀態會持續十二秒。','此技能的傷害類型明確是真實傷害。','混亂1秒不是冷卻12秒；AP加成不等於原文已指定傷害類型。'],
 ['ewar.r','吟唱兩秒後對周圍大範圍敵人造成傷害，並附帶淨化效果。','龍氣爆發不會對敵人附帶淨化效果。','傷害範圍的半徑精確為四。','吟唱／敵方範圍／淨化都明寫；不自行把大範圍換成精確半徑。'],
 ['ewar.w','吟唱三秒後治療自己，並除去自己身上的附加法術狀態。','仙氣採藥只治療別人，完全不治療施法者自己。','仙氣採藥也會回復周圍所有友軍的生命。','自身治療與除去狀態有正文；沒有額外友軍治療的肯定或明確否定。'],
 ['h01n.e','斬擊會讓一條直線上的敵方部隊受到傷害。','基礎傷害只列900，沒有列450、600或750。','普通物理攻擊也享有這裡描述的兩種AP追加。','直線及四個基礎值明寫；這段技能斬擊的追加不自動擴展到普攻。'],
 ['h01n.ex','卍解狀態下額外提升100%攻擊力，並獲得60%吸血。','卍解狀態下完全沒有攻擊力提升，也沒有吸血。','物理格擋成功後會額外治療自己最大生命的10%。','兩項卍解增益明寫；物理格擋與吸血不證明受擊格擋會另觸發治療。'],
 ['h01n.passive','小範圍內敵人的攻擊速度會減半。','小範圍內敵人的攻擊速度會提高到兩倍。','這個小範圍的有效半徑明確為六。','攻速方向與幅度明寫；目前runtimeDescription的半徑6不在本份Owner文字內。'],
 ['h01n.q','施法者直線衝刺至對方身旁，讓範圍敵人魔抗減半三秒。','敵人的魔抗減半會持續三十秒。','這次衝刺可以穿越任何牆壁。','衝刺主體／魔抗與3秒有正文；30秒是冷卻，穿牆能力未明示。'],
 ['h01n.r','八秒內提升攻速，並讓瞬步冷卻縮短50%。','瞬步的冷卻時間會加長50%，而不是縮短。','進入卍解的當下會把瞬步剩餘冷卻立即重置為零。','8秒與縮短50%明寫；縮短不直接等同施放當下歸零。'],
 ['h01n.w','攻擊敵人的同時，給予目標額外200、350、500或650傷害。','月牙斬擊完全不存在任何AP追加效果。','月牙斬擊的傷害類型明確是真實傷害。','基礎額外值及兩種有條件AP追加明寫；傷害類型未提供，不從AP或招式名稱推論。'],
];
const normalize=s=>s.replace(/\s+/g,'');
export function build(snapshot,original,diagnostics=[]){
 const old=original.filter(c=>c.split==='dev'&&c.task==='owner-mechanism'),sourceIds=[...new Set(old.map(c=>c.sourceId))];assert.equal(sourceIds.length,18);
 assert.deepEqual(seeds.map(s=>'godie-'+s[0]).sort(),sourceIds.filter(id=>id!=='godie-e00s.w').sort(),'SOURCE_COVERAGE');
 const cases=[],review=[];
 for(const [short,...claims] of seeds){
  const id='godie-'+short,parent=old.find(c=>c.sourceId===id),source=snapshot.sources.find(s=>s.id===id);assert(parent&&source);
  assert(!original.some(c=>c.sourceId===id&&c.split!=='dev'),'SOURCE_SPLIT_LEAK');assert(!diagnostics.some(c=>c.sourceId===id),'DIAGNOSTIC_SOURCE_IN_DEV');
  const originalInput=JSON.parse(parent.messages.at(-1).content);assert.equal(originalInput.source.text,mechanicsText(source.ownerOriginal));assert.equal(parent.sourceSha256,digest(source.ownerOriginal));
  for(const [i,verdict] of ['supported','contradicted','not-stated'].entries()){
   assert(!original.some(c=>c.sourceId===id&&normalize(JSON.parse(c.messages.at(-1).content).claim??'')===normalize(claims[i])),'EXACT_OLD_CLAIM');
   const input={...originalInput,claim:claims[i]},messages=[structuredClone(parent.messages[0]),{role:'user',content:JSON.stringify(input)}],target={verdict};
   const c={id:'r6-expanded-dev-'+short+'-'+i,task:'owner-mechanism',split:'dev',lineage:parent.lineage,sourceId:id,sourceSha256:parent.sourceSha256,messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:claims[3],quality:'personally-reviewed-historical-owner-not-human-gold',cohort:'prospective-expanded-source-dev',trainingEligible:false};cases.push(c);
   review.push({id:c.id,sourceId:id,sourceOriginal:source.ownerOriginal,sourceSha256:c.sourceSha256,modelVisibleSource:input.source.text,claim:claims[i],target,reason:claims[3],fullSourcePersonallyRead:true,claimPersonallyReviewed:true,sourceTier:'historical-owner-tsv-20260808-not-latest-main',trainingEligible:false,selectionScope:'future R6 preregistration only',independentNewSource:false});
  }
 }
 assert.equal(cases.length,51);validateCases(cases);return{cases,review,sourceIds:seeds.map(s=>'godie-'+s[0])};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [r3,clarification,out]=process.argv.slice(2);for(const p of [r3,clarification,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const read=p=>JSON.parse(fs.readFileSync(p));
 const original=read(path.join(r3,'cases.private.json')),data=build(read(path.join(r3,'source-snapshot.json')),original,read(path.join(clarification,'cases.private.json')));fs.mkdirSync(out);
 const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});put('cases.private.json',data.cases);put('personal-review.json',data.review);put('requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 put('manifest.json',{schema:'ggd-prospective-expanded-source-dev@1',createdAt:new Date().toISOString(),casesSha256:digest(data.cases),reviewSha256:digest(data.review),sourceIds:data.sourceIds,counts:{sources:17,cases:51,supported:17,contradicted:17,notStated:17},originalOwnerDev:{sources:18,cases:38,supported:18,contradicted:18,notStated:2},excludedSource:'godie-e00s.w',exclusionReason:'Already in a frozen selection-ineligible clarification diagnostic. Do not repurpose that diagnostic for selection.',status:'HOLD_FOR_R6_PREREGISTRATION',trainingApproved:false,selectionAllowed:true,selectionScope:'future R6 only; not used for R3/R4/R5 selection',originalDevReplaced:false,originalTestsModified:false,modelResultsExist:false,releaseQualified:false,scope:'Expanded dev on existing dev-only source families, not independent new-source generalization. All 18 source texts reread; 17 selected, three claims each. Does not establish that imbalance alone caused prior failures.'});
 const lines=['# 下一輪Owner原文判讀：擴充驗證候選','','原R3 Owner dev只有2/38題是not-stated；此候選補17來源／51題，三類各17。來源全來自原dev的三個家族，沒有搬入train/test；舊83dev、所有舊test及分數不變。','','大怒石e00s.w已在凍結的不可選模澄清診斷內，因此不加入本候選。其餘17份完整歷史Owner原文及51題已親自閱讀核對；正文、台詞、舊override與runtime説明分開，不能借別版本補答案。','','尚未推論或用於選模，狀態HOLD_FOR_R6_PREREGISTRATION。若下一輪採用，先登錄比較與選模規則，再對所有對照模型使用同一輸入。不是新來源泛化Gold，也不能推論類別比例是R5失敗唯一原因。','','| 來源 | 支持 | 矛盾 | 未說明 |','| --- | --- | --- | --- |'];for(const [id,yes,no,unknown] of seeds)lines.push(`| ${id} | ${yes} | ${no} | ${unknown} |`);fs.writeFileSync(path.join(out,'REVIEW.md'),lines.join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({out,cases:51,sources:17,trainingStarted:false,modelInferenceStarted:false}));
}
