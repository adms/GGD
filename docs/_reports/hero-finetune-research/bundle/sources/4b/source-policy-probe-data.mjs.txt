/** Error-informed prompt intervention, NOT new fine-tuning or sealed testing. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {digest} from './dataset.mjs';
export const clarification = '\n判讀補充規則（不新增來源事實）：\n'
 +'1. 沒寫到一件事不表示明確否定它。contradicted需要原文明確不相容的值、方向、條件或排除語句；否則額外細節是not-stated。\n'
 +'2. 原文若只說「若A則B」，不自動等於「只有A才B」。詢問另一條件是否也必定B而原文未交代，屬not-stated；但不能否定原文明說的A會B。\n'
 +'3. 冷卻、持續、吟唱、間隔是不同欄位。已知冷卻不能補出效果持續時間。\n'
 +'4. 百分比的基準與受擊對象是兩回事。即使傷害打到敵人，未寫誰的生命就不能把「最大生命」擅自補成敵人的或自己的最大生命。泛稱生命百分比傷害而不指定基準擁有者，可以得到原文支持。\n'
 +'5. 「現存、目前剩餘、當前生命」屬同一概念；「最大生命、生命上限」屬另一概念。兩者不可互換。\n'
 +'6. 本遊戲技能的數值A/B/C列式表示依技能等級列出的各階數值。值不同不能判成各等級固定一樣。\n'
 +'7. 判斷的是整句效果含義，不要求逐字照抄；等義的自然改寫不因換詞便成為相反。效果名稱本身不自動新增伤害類型限制。\n'
 +'8. 複合敘述全部得到支持才是supported；有明確矛盾則contradicted；沒有矛盾但有未交代的必要細節則not-stated。仍只輸出原本JSON，不輸出分析。';
export function prepare(cases){
 const selected=cases.filter(c=>c.split!=='train');assert.equal(selected.length,245);
 const out=selected.map(c=>{
  const messages=structuredClone(c.messages);if(['hero-source','owner-mechanism'].includes(c.task))messages[0].content+=clarification;
  return {...c,id:'policy-probe-'+c.id,messages,requestDigest:digest(messages),priorCaseId:c.id,priorRequestDigest:c.requestDigest,intervention:'source-policy-clarification-only; no examples, changed source, changed labels or weight update',exposed:true,trainingEligible:false};
 });
 assert.equal(new Set(out.map(c=>c.id)).size,out.length);return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,out]=process.argv.slice(2);assert(root&&out);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const cases=prepare(JSON.parse(fs.readFileSync(path.join(root,'cases.private.json'))));fs.mkdirSync(out);
 const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',cases);put('manifest.json',{schema:'ggd-source-policy-probe@1',createdAt:new Date().toISOString(),sourceRoot:path.resolve(root),casesSha256:digest(cases),clarificationSha256:digest(clarification),counts:{dev:83,exposedRegression:162},trainRows:0,weightUpdate:false,checkpointSelection:false,releaseQualified:false,scope:'Error-informed prompt experiment. New policy applies equally to base and adapter controls; never credit its gains to fine-tuning alone.'});
 for(const split of ['dev','test'])put(split+'-requests.json',cases.filter(c=>c.split===split).map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 console.log(JSON.stringify({out,dev:83,exposedRegression:162,trainingStarted:false}));
}
