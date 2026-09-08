/** Version-aware hero-setting diagnostic, not training material or independent Gold. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {buildHeroClaimRequest,resolveHeroSource} from './hero-source-client.mjs';
const newClaims=[
 ['godie-e007','本來是國中二年級學生，因母親項鍊來到三國時代。','他是因父親的戒指而來到三國時代，不是母親的項鍊。','原文提供了他穿越當天的公曆日期。'],
 ['godie-e00x','他是烏鴉族混血兒，因白色翅膀被逐出村莊，後來被木乃香的父親收養。','他長著黑色翅膀而不是白色翅膀。','原文確定他的翅膀展開寬度是三公尺。'],
 ['godie-h020','重破斬需要惡夢魔王碎片。','重破斬不需要惡夢魔王碎片。','原文提供重破斬消耗魔力的精確數值。'],
 ['godie-h02u','故事說草泥馬的具體起源尚不明確。','故事已經確認草泥馬的具體起源，並非尚不明確。','原文列出第一位創作草泥馬梗的網民真名。'],
 ['godie-n00p','他是魔界高級妖魔轉生寄宿為人類，支配魔界植物。','他從未是妖魔，也不是轉生寄宿為人類。','原文確定他恰好能控制七種魔界植物。'],
 ['godie-n01c','他是神、魔、人混血創造的龍騎士。','他完全只有人類血統，沒有神與魔的混血。','原文列出神、魔、人血統各自的精確百分比。'],
 ['godie-n01g','只有在夜晚才會自動回復生命值。','白天和夜晚都會自動回復生命值。','原文說她遇到陽光會立即死亡。'],
 ['godie-o00x','這是悟空的變身態，不能直接選，需透過09-03超級賽亞人進入。','這份超級賽亞人文件可當成獨立英雄直接選，不需要變身入口。','原文確定這個變身的冷卻是三十秒。'],
 ['godie-o030','來源設定中他的興趣包含偷窺，出自作品臭作。','來源設定明確說他並不喜歡偷窺。','原文有提供他出生的精確年份。'],
 ['godie-u00l','他是北斗神拳的唯一傳人。','北斗神拳同時有三名傳人，他不是唯一傳人。','原文說他每秒固定打出一百拳。'],
 ['godie-u00o','他誤食惡魔果實成了橡膠人，紅髮傑克救他時失去左手臂。','紅髮傑克救他時失去的是右手臂，不是左手臂。','原文確定魯夫可免疫所有種類的魔法傷害。'],
 ['godie-u010','他是用劍與邪王炎殺拳的高手，尋找的妹妹名叫雪菜。','他尋找的是哥哥雪菜，不是妹妹。','原文提供他找到妹妹時的確切年齡。'],
 ['godie-u01u','他夢想成為世界第一的大劍客，使用自創的三刀流。','他使用的是雙刀流，不是三刀流。','原文確定三刀流會使每次普攻固定判定三次傷害。'],
 ['godie-u034','他出身鯨魚島，正在尋找父親。','他出身的是另一座島，不是鯨魚島。','原文指出他父親目前所在的精確城市。'],
];
const origins=['坦克','砲手','鬥士','射手','法鬥','法師','狂戰','硬輔','法刺','軟輔'];
export function buildHeroDiagnostic(inventory){
 const cases=[],checks=[];
 function add(heroId,key,claim,verdict,category){
  const input={version:inventory.revision,purpose:'source-read',query:heroId,claim,id:'main-hero-'+heroId+'-'+key};
  const built=buildHeroClaimRequest(inventory,input);assert(built.request,'MISSING_REVIEWED_SOURCE:'+heroId);
  cases.push({...built.request,task:'hero-source',split:'dev',lineage:heroId,sourceVersion:inventory.revision,category,target:{verdict},acceptedTargets:[{verdict}],trainingEligible:false,quality:'assistant-reviewed-main-source-diagnostic'});
 }
 for(const row of inventory.rows){
  const resolution=resolveHeroSource(inventory,{version:inventory.revision,purpose:'source-read',query:row.id});
  assert.equal(resolution.status,row.description?'resolved':'missing-description');
  checks.push({id:row.id,status:resolution.status,declaredOriginPreserved:!row.setting.declaredOrigin||JSON.parse(resolution.source.text).currentSetting.origin===row.setting.declaredOrigin});
  if(!row.setting.declaredOrigin)continue;
  assert(row.description);const actual=row.setting.declaredOrigin;
  const other=row.setting.derivedWithoutOverride!==actual?row.setting.derivedWithoutOverride:origins[(origins.indexOf(actual)+1)%origins.length];assert.notEqual(other,actual);
  add(row.id,'origin-yes',`依這版明確指定的設定，這位英雄出身為${actual}。`,'supported','explicit-origin-control');
  add(row.id,'origin-no',`這位英雄目前出身是${other}，不是${actual}。`,'contradicted','explicit-origin-control');
 }
 for(const [id,yes,no,unknown] of newClaims){add(id,'setting-yes',yes,'supported','new-description-claim');add(id,'setting-no',no,'contradicted','new-description-claim');add(id,'setting-unknown',unknown,'not-stated','new-description-claim');}
 for(const gone of inventory.missingOld){const r=resolveHeroSource(inventory,{version:inventory.revision,purpose:'source-read',query:gone.id});assert.equal(r.status,'historical-only');checks.push({id:gone.id,status:r.status});}
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 return {cases,requests:cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})),sourceChecks:checks,manifest:{schema:'ggd-forge-main-hero-diagnostic@1',revision:inventory.revision,inventorySha256:digest(inventory),casesSha256:digest(cases),total:cases.length,categories:Object.fromEntries([...new Set(cases.map(c=>c.category))].map(k=>[k,cases.filter(c=>c.category===k).length])),trainingEligible:false,sealedTest:false,releaseQualified:false,scope:'Explicit origin precedence is a reading control, not evidence of creative hero design. New body IDs can share source setting with R3; these are diagnostics, not independent unseen heroes. Full source includes story, current pitch and playstyle; no numeric mechanics inferred from tags.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inventoryPath,out]=process.argv.slice(2);assert(inventoryPath&&out&&!fs.existsSync(out),'NEW_OUTPUT_REQUIRED');const data=buildHeroDiagnostic(JSON.parse(fs.readFileSync(inventoryPath)));fs.mkdirSync(out,{recursive:true});
 for(const [name,x] of [['cases.private.json',data.cases],['requests.json',data.requests],['source-checks.json',data.sourceChecks],['manifest.json',data.manifest]])fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(data.manifest));
}
