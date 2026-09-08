/** Prospective source-text diagnostics. Never training, selection, or Owner Gold. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {system,sourceGroup,validateCases} from './r3-data.mjs';
// Each full source was personally read before authoring this balanced triple.
// Explicit contradictions and unspecified details must not be conflated.
export const seeds=[
 ['huth.passive','每秒回覆12點生命',
  '魔人普烏的肉體再生每秒回復12點生命。','肉體再生的回復量是每秒24點生命。','此再生在受到傷害後會暫停三秒。',
  '12/s is explicit; 24/s conflicts; interruption behavior is absent.'],
 ['huth.q','每吃掉6隻增加1點力量',
  '每吃掉六個單位就增加一點力量。','每吃掉六個單位只增加敏捷，不增加力量。','吃掉單位累積的力量會保留到下一場全新的對戰。',
  'Strength and count are explicit; cross-match persistence is not.'],
 ['huth.r','持續5秒',
  '能量彈影響指定區域，使區域單位的行動速度降低35%，並持續五秒造成每秒傷害。','能量彈讓該區域單位的行動速度提高35%。','每秒造成的固定傷害為500點。',
  'Direction and five-second duration are explicit; {{dmg}} remains unresolved.'],
 ['ogrh.passive','每殺死15個部隊增加1點力量',
  '每擊殺一個部隊增加兩點生命，每擊殺十五個部隊增加一點力量。','每擊殺一個部隊立即增加兩點力量。','自己召喚的分身所造成的擊殺也一定計入這個累積。',
  'Do not exchange health and strength; summon credit is unspecified.'],
 ['ogrh.q','每秒消耗生命10點',
  '界王拳增加55點額外傷害，同時每秒消耗10點生命，持續十秒。','界王拳每秒消耗10點法力而不消耗生命。','額外的55點傷害全部屬於真實傷害。',
  'Resource and duration are explicit; damage type is not.'],
 ['ogrh.r','超級賽亞人狀態，可增加威力',
  '龜派氣功傷害直線上的敵方部隊，且超級賽亞人狀態能提高此招威力。','龜派氣功只治療直線上的友軍，不傷害敵人。','龜派氣功的固定基礎傷害為500點。',
  'Target direction is explicit; unresolved {{dmg}} cannot supply 500. No assumption about coefficient stacking.'],
 ['hvwd.ex','暈眩2秒',
  '神通眼讓淨化之箭追蹤敵人，造成1750點傷害並暈眩兩秒，冷卻三十秒。','神通眼造成的暈眩持續三十秒。','神通眼的箭能穿過所有牆壁而不被阻擋。',
  'Cooldown must not become stun duration; wall collision is absent.'],
 ['hvwd.passive','燃燒50點瑪那',
  '淨化可以移除所有異常狀態，緩慢對手四秒並燃燒50點瑪那。','淨化會替對手回復50點瑪那，而不是燃燒瑪那。','淨化的緩慢幅度固定為40%。',
  'Mana direction is explicit; slow duration does not supply its magnitude.'],
 ['hvwd.r','放出6隻死魂蟲',
  '死魂蟲共有六隻，吸取附近敵軍生命能量，返回身邊時用吸取的能量補充生命值；持續八秒。','這個技能一次放出十二隻死魂蟲。','每一隻死魂蟲每次返回都固定回復200點生命。',
  'Count, return timing and duration are explicit; per-return amount is absent.'],
 ['osam.e','有15%的機會',
  '爆碎牙有15%的機會對目標敵人追加90點傷害，並擊昏敵人半秒。','爆碎牙追加傷害的觸發機率為100%。','所有法術命中事件都可以觸發爆碎牙。',
  'Do not infer the triggering event from a passive tag; chance is explicitly 15%.'],
 ['osam.ex','不分敵我',
  '冥道殘月破將範圍內敵我單位一起送往冥界，六秒後現身並受到1300點傷害。','冥道殘月破只會送走敵人，範圍內友軍不受影響。','送往冥界的單位在六秒期間具有無敵狀態。',
  'Explicit all-sides targeting contradicts enemy-only; realm invulnerability is not stated.'],
 ['osam.r','每人只吃一次',
  '蒼龍破沿面向逐段向前推進，掃過直線敵人，每名敵人只受一次傷害。','蒼龍破的每一段都能再次傷害同一名敵人。','蒼龍破到達末端時會再產生一次半徑400的爆炸。',
  'Per-target hit-once is explicit; terminal burst is absent.'],
 ['o02p.q','每彈跳一個敵人傷害將降低10%',
  '甩蔥歌以閃電攻擊最多六名敵人，傷害起始為200點，之後每彈跳一名敵人就降低10%。','甩蔥歌只對友軍提供治療，不會傷害敵人。','甩蔥歌兩個彈跳目標之間的最大距離為600。',
  'Damage, side, cap and decay are explicit; jump distance is not.'],
 ['o02p.w','每彈跳一個友方治療效果將降低10%',
  '最初的聲音治療最多六名友軍，起始治療200點，之後每彈跳一名友軍治療降低10%。','最初的聲音每一跳都固定治療200點，完全不衰減。','最初的聲音可以復活已死亡的友方英雄。',
  'Decay is explicit; healing does not establish resurrection.'],
 ['o02p.e','持續15秒',
  '初音未來的消失讓周遭部隊獲得10%攻擊力加成及三點防禦，持續十五秒。','初音未來的消失只強化初音自己，周遭部隊不會獲得加成。','初音未來的消失最多能強化六個單位。',
  'Nearby recipients are explicit; six-target cap from other songs is not transferable.'],
 ['u00n.passive','但每秒減少生命10點',
  '二檔增加攻擊速度100%及移動速度100點，持續二十秒，期間每秒減少十點生命。','二檔不會消耗生命，而且會永久持續到對戰結束。','重複施放二檔會把剩餘持續時間相加。',
  'Explicit cost and duration contradict no-cost permanence; refresh semantics are absent.'],
 ['u00n.q','目標落下處範圍250',
  '橡膠戰斧打擊敵人，並在目標落下處範圍250內對周遭部隊追加225點傷害。','橡膠戰斧的225點追加範圍傷害以施法者腳下為中心，不以目標落下處為中心。','橡膠戰斧最初重擊的固定傷害是300點。',
  'Center and secondary damage are explicit; initial {{dmg}} is unresolved.'],
 ['u00n.w','擊昏1秒',
  '橡膠火箭砲從長距離傷害敵人，並將敵人擊退及击昏一秒。','橡膠火箭砲只擊昏施法者一秒，不擊昏敵人。','橡膠火箭砲的擊退距離固定為800。',
  'Target of stun is explicit; knockback distance must not be borrowed from another skill.'],
 ['udre.e','並可與三刀流效果疊加',
  '阿修羅壹霧銀只對英雄施放，造成300點傷害和一秒暈眩；三刀流與武裝霸王色的增威效果可以疊加。','阿修羅壹霧銀的三刀流與武裝霸王色增威效果互斥，不能疊加。','阿修羅壹霧銀的施法距離固定為700。',
  'Hero restriction and stacking are explicit; range is absent.'],
 ['udre.ex','裝備上的攻擊力也一起乘',
  '武裝色霸氣的1.5倍攻擊力包含裝備攻擊力，十五秒結束或中途倒地時會退出變身。','武裝色霸氣只乘角色裸裝攻擊力，裝備上的攻擊力不參與倍率。','武裝色霸氣每次消耗50點法力。',
  'Gear inclusion and termination are explicit; {{mp}} cannot establish 50.'],
 ['udre.r','給予直線單位333傷害',
  '三千世界對直線單位造成333點傷害，三刀流與武裝霸王色的增威可以疊加。','三千世界只傷害施法者周圍環形區域，不會傷害直線上的單位。','三千世界對同一名敵人固定造成三次傷害。',
  'Shape and stacking are explicit; blade count or name does not imply hit count.'],
 ['u00v.passive','面板上那個最終攻擊力',
  '銅皮鐵骨依自身面板最終攻擊力的50%增加防禦，攻擊力升高或降低都會立即影響防禦。','銅皮鐵骨只讀取英雄初始裸裝攻擊力，買裝改變攻擊力也不會更新防禦。','銅皮鐵骨帶來的防禦最低會被限制在零點。',
  'Dynamic final-stat dependency is explicit; lower-bound clamping is absent.'],
 ['u00v.q','並有機會將敵人震昏1秒',
  '斬鐵拳在攻擊時有10%機率增加75點破壞力，並有機會震昏敵人一秒。','斬鐵拳造成的震昏持續十秒。','斬鐵拳對同一目標觸發過震昏後，必須等待三秒才能再次震昏。',
  'Stun duration is explicit; a per-target internal cooldown is absent. Avoid an ambiguous shared-chance reading.'],
 ['u00v.r','若受到撞擊停止',
  '死亡噴射肘擊奔向敵人，將目標擊退800並暈眩一秒；若受到撞擊停止，周圍敵人會受到80% AP的追加傷害。','死亡噴射肘擊的撞擊停止效果會治療周圍敵人，而不是傷害他們。','此技能只有撞到牆壁才會停止，撞到其他單位絕對不會停止。',
  'Conditional area damage is explicit; precise collision categories are not.'],
];
export function buildFresh(sources,prior,familySplits){
 const cases=[],review=[];assert.equal(sources.length,seeds.length);
 for(const [short,anchor,...rest] of seeds){
  const id='godie-'+short,s=sources.find(s=>s.id===id);assert(s,'MISSING_SOURCE:'+id);assert(s.description.includes(anchor),'SOURCE_DRIFT:'+id);
  const group=sourceGroup(id);assert.equal(familySplits[group],'test','FAMILY_NOT_HELD_OUT');
  const text=mechanicsText(s.description);
  assert(!prior.some(c=>c.sourceId===id||c.messages?.some(m=>m.content.includes(id)||m.content.includes(text))),'PREVIOUS_SOURCE_EXPOSURE:'+id);
  const claims=rest.slice(0,3),reason=rest[3];
  for(const [i,verdict] of ['supported','contradicted','not-stated'].entries()){
   const input={task:'owner-mechanism',source:{id,name:s.name,snapshot:digest(s.description),text,sourceTier:'pinned-repository-description; not verified latest Owner'},claim:claims[i],instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'};
   const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],target={verdict};
   const c={id:'r5-fresh-'+short+'-'+i,task:'owner-mechanism',split:'test',lineage:'source-'+group,sourceId:id,sourceSha256:digest(s.description),messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:reason,cohort:'prospective-new-repository-source',sourceTier:input.source.sourceTier,trainingApproved:false};
   assert(!prior.some(p=>p.requestDigest===c.requestDigest),'EXACT_REQUEST_LEAK');cases.push(c);
   review.push({id:c.id,source:s,fullTextPersonallyRead:true,input,expected:target,reason,ownerGold:false});
  }
 }
 cases.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));validateCases(cases);return{cases,review};
}
export function generateFresh(main,r5,out){
 for(const p of [main,r5,out])assert(path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=p=>JSON.parse(fs.readFileSync(p)),manifest=read(path.join(r5,'dataset-manifest.json')),r3=manifest.parent,r4=manifest.rejectedIteration,r2=path.resolve(r3,'../forge-classification-reviewed-r2-20260906');
 const priorFiles=[r2,r3,r4,r5].map(p=>path.join(p,'cases.private.json'));
 priorFiles.push(...['main-hero-diagnostic-v1','fidelity-diagnostic-v2','main-diagnostic-v4'].map(n=>path.join(r3,n,'cases.private.json')));
 const prior=priorFiles.flatMap(read),sources=seeds.map(([short])=>{const file=path.join(main,'content/abilities/godie-'+short+'.json'),raw=fs.readFileSync(file,'utf8'),doc=JSON.parse(raw);return{id:doc.id,name:doc.name,description:doc.description,provenance:doc.provenance,sourcePath:file,fileSha256:digest(raw)};});
 const {cases,review}=buildFresh(sources,prior,read(path.join(r3,'source-family-splits.json')));
 fs.mkdirSync(out);const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',cases);put('requests.json',cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));put('personal-review.json',review);put('source-snapshot.json',sources);
 put('manifest.json',{schema:'ggd-r5-fresh-repository-source-diagnostic@1',frozenAt:new Date().toISOString(),casesSha256:digest(cases),sources: sources.length,rows:cases.length,sourceGroups:[...new Set(cases.map(c=>c.lineage))],labels:Object.fromEntries(['supported','contradicted','not-stated'].map(v=>[v,cases.filter(c=>c.target.verdict===v).length])),priorAuditFiles:priorFiles.map(p=>({path:p,sha256:digest(fs.readFileSync(p,'utf8'))})),exactSourceIdOrTextExposure:0,trainingApproved:false,selectionAllowed:false,ownerGold:false,releaseQualified:false,limitations:['Pinned repository descriptions carry w3x-import provenance; not promoted to latest Owner authority.','Full text is supplied, unresolved placeholders stay unresolved. No game behavior asserted.','New skills relative to audited R2-R5 and named diagnostics; model pretraining and all historical experiments are not audited.','Hero settings for these franchises were already evaluated; source families and semantic patterns are not entirely new.','Assistant authored and personally reviewed, not an independent annotator or complete-source coverage.']});
 return{out,rows:cases.length,sources:sources.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(generateFresh(...process.argv.slice(2))));
