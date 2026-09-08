/** Full reread of the 54 historical Owner training sources / 120 existing claims.
 * Candidate wording corrections only. Never mutates R3/R5 or trains a model.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {validateCases} from './r3-data.mjs';
export const sourceNotes={
 'e002.e':'吟唱一秒與前方直線傷害都有正文依據；不把對白的補魔當技能效果。',
 'e002.ex':'反彈成功後七次斬擊再接直線終結傷害；名稱不決定次數。',
 'e002.passive':'30%觸發機率和格擋100%魔法傷害是兩個不同百分比。',
 'e002.q':'物理迴避列出6/12/18/24%；舊問句依賴未在正文明寫的等級排列慣例，候選改為直接詢問數列。未提到成功後瞬移。',
 'e002.r':'反彈窗口兩秒，不是冷卻60秒；三個反彈倍數不等於持續時間。',
 'e002.w':'切換、每次攻擊耗魔、魔力不足關閉、關閉釋放風能皆為正文；現有兩題只判斷其中的開關條件。',
 'e00w.e':'飛行無視碰撞並增加攻速；形態持續時間和冷卻分開。',
 'e00w.ex':'御雷劍道具是前提；50%雷鳴機率與30秒形態都明寫，不推論其他道具。',
 'e00w.passive':'迴避成功後抓取拋摔，暈眩2秒；30秒是冷卻。',
 'e00w.q':'周圍範圍、由內往外、擊退；與向中心拉近相反。',
 'e00w.r':'施展2秒、小範圍傷害；烏鴉種族設定不等於額外召喚。',
 'e00w.w':'普攻時的10%機率、1.5倍暴擊、附帶範圍落雷；候選保留普通攻擊限制。',
 'emfr.e':'12秒火焰形態，普通攻擊附傷、每次技能命中爆炎與移速減半；候選去掉法術/技能及攻擊/普攻的泛稱。',
 'emfr.ex':'反彈魔法傷害轉自身魔力與可累加AP，5秒歸零；未定義超過魔力上限。',
 'emfr.passive':'每秒回復5%最大生命且每秒燒魔；沒有把不明魔力基準補成最大魔力。',
 'emfr.q':'前方直線傷害與1秒移速緩慢；故事威力沒有變成地形破壞能力。',
 'emfr.r':'12秒形態、移速2倍與施放技能後下一次普通攻擊附傷；候選明確保留普通攻擊。',
 'emfr.w':'12秒形態、1.2倍移速、增加攻速與普通攻擊附傷；不可疊形態未被推論為永久。',
 'hapm.e':'每次普通攻擊附傷和0.6秒麻痺；不把麻痺自行改成另一狀態名。',
 'hapm.ex':'指定目標9次斬擊，最後擊退與3秒恐懼；未給逐次加速節奏。',
 'hapm.passive':'12層跨回合共享；致命傷消耗一層、先1.5秒無敵隨後回血與擊退。這裡是原文理解，不等於目前模板時序可實作。',
 'hapm.q':'狂怒攻速/吸血；每承受自身最大生命5%傷害延長2秒；候選消除百分比主體省略。',
 'hapm.r':'吟唱2秒、本人向前衝刺後範圍傷害；恐懼敵人額外傷害按施法者自身最大生命25%。舊問句的自身緊接恐懼目標，需消除指代歧義。',
 'hapm.w':'抓回敵人後丟出，撞击前方直線；施法者狂怒追加恐懼。未定義永久屍體障礙。',
 'edem.e':'吟唱2秒、本人直線衝刺、沿途周圍敵人受傷；未定義穿牆。',
 'edem.ex':'周圍大範圍、每秒燃燒、沉默、降攻擊力，持續10秒。',
 'edem.passive':'魔法傷害反彈機率20%；未把故事的仿冒忍術當成任意技能複製。',
 'edem.q':'初始範圍傷害後3秒燃燒，每秒按當下現存生命1%；不改成最大生命。',
 'edem.r':'指定前置技能命中燃燒目標足以觸發爆炸；未明寫所有其他情況都不触發。舊否定句是否受燃燒影響涉及必要條件，候選直接否認已寫明的觸發情形。',
 'edem.w':'周圍傷害同時讓攻擊速度、移動速度降低50%，持續3秒。',
 'efur.e':'範圍龍形傷害有AP加成；对白說衝刺不加入正文需求。',
 'efur.ex':'致盲目標使用牙突、20%機會、目標最大生命40%追加傷害；不是必定即死。',
 'efur.passive':'每次普通攻擊依序循環四種屬性增益，各自1秒且可同時存在；候選保留普通攻擊範圍。',
 'efur.q':'指定敵人、無視地形碰撞瞬移身旁、致盲1秒；不借目前模板缺點反改原文。',
 'efur.r':'每0.2秒隨機落一顆，共10顆；隨機不保證落點不重疊。',
 'efur.w':'固定傷害加目標最大生命比例並擊退；百分比主體已明寫。',
 'h01u.e':'本人衝刺與直線範圍傷害，破甲目標追加AP傷害；不是只治療自己。',
 'h01u.ex':'吸血和攻速上限提升，防禦及魔抗降低50%；防禦/護甲對應沿用既有用語，非新runtime映射證明。',
 'h01u.passive':'每擊殺敵人永久增加攻速/攻距；永久不代表保存至另一場遊戲。',
 'h01u.q':'每次普通攻擊疊攻速，1秒、不續攻歸零；候選不用一般攻擊掩蓋普攻條件。',
 'h01u.r':'AP/AD暫時提升，攻擊及受傷事件各有機率反擊8秒；候選正例以標籤明寫的普通攻擊和受傷表述，不斷言所有其他攻擊事件也支援。',
 'h01u.w':'周圍傷害、擊退與1秒破甲；不是十秒。',
 'h02k.e':'受傷4%增攻速、2%自爆損失現存生命50%；兩種可能不推論互斥或聯合機率。',
 'h02k.ex':'輪盤有敵死/自死/恐懼；致盲與混亂同時出現的死亡機率合併方式未定義。',
 'h02k.passive':'普攻3%機率999真實傷害與燃燒；燃燒生命基準未明確為當前或最大。候選正例保留普攻限制。',
 'h02k.q':'普攻機率頭槌10倍暴擊與1秒暈眩；燃燒目標加致盲。候選正例保留普攻。',
 'h02k.r':'攻擊時機率抓回；成功物理迴避則擊退並暈眩；兩個不同事件不可反轉。',
 'h02k.w':'敌人攻擊熊貓時機率反彈並對周圍敵人癱瘓/詛咒；不是只影響自己。',
 'h02v.e':'受傷10%觸發前方直線持續傷害和降魔抗3秒；不是只有自己普攻觸發。',
 'h02v.ex':'另一技能期間每秒回復周圍友方魔力且傷害周圍敵人；兩方受益/受害對象不互換。',
 'h02v.passive':'攻擊草泥馬的敵人30%機率被致盲6秒；不是必定或60秒。',
 'h02v.q':'無法移動及攻擊、每秒回血與增防6秒；沒写解除形態時爆炸。',
 'h02v.r':'周圍緩慢與致盲6秒，攻擊致盲敵人額外AP傷害；風景不定義永久碰撞。',
 'h02v.w':'自身生命降低到30%時普攻吞噬低生命敵人並永久加1AP；候選用當…時，避免降至三成後暗示永久解鎖。',
};
export const rewrites={
 'hapm.r-yes':['吟唱兩秒，施法者向前衝刺後造成周圍範圍傷害；若敵人具有恐懼狀態，額外傷害以施法者自身最大生命的25%計算。','percentage-owner-pronoun'],
 'hapm.q-yes':['狂怒提升攻速與吸血；期間每承受施法者自身最大生命5%的傷害，狂怒持續時間延長兩秒。','percentage-owner-omission'],
 'emfr.e-yes':['形態持續十二秒，移速減半；普通攻擊附加火焰傷害，每次技能命中還會引發爆炎標記及周圍範圍傷害。','basic-attack-and-skill-scope'],
 'emfr.r-yes':['十二秒形態使移速加倍，施放技能後的下一次普通攻擊附加雷屬性傷害。','basic-attack-scope'],
 'efur.passive-yes':['每次普通攻擊依照順序循環取得不同屬性加成，每個加成各自持續一秒。','basic-attack-scope'],
 'h01u.q-yes':['每次普通攻擊可疊加攻速；沒有繼續攻擊時，攻速增益會歸零。','basic-attack-scope'],
 'h02k.passive-yes':['普通攻擊有3%機率造成999點真實傷害，並對敵人附帶燃燒狀態。','basic-attack-scope'],
 'h02k.q-yes':['普通攻擊有機率觸發十倍暴擊與一秒暈眩；敵方處於燃燒狀態時額外追加致盲。','basic-attack-scope'],
 'e00w.w-yes':['普通攻擊有10%機率使出1.5倍暴擊傷害，並附加範圍落雷傷害。','basic-attack-scope'],
 'e002.q-yes':['原文列出的物理迴避機率依序為6%、12%、18%、24%。','implicit-rank-convention'],
 'e002.q-no':['原文只給出6%這一個物理迴避機率，沒有列出12%、18%或24%。','implicit-rank-convention'],
 'edem.r-no':['前置技能命中帶有燃燒標記的敵人時，也完全不會引發目標周圍的雷電爆炸傷害。','sufficient-versus-necessary-condition'],
 'h01u.r-yes':['八秒內，普通攻擊與受到傷害兩種事件都有20%機率觸發弒鬼神反擊。','basic-attack-scope'],
 'h02v.w-yes':['當自身生命降低到30%時，普通攻擊可吞噬生命低於原文所列比例的敵方單位，並永久增加1點AP。','threshold-versus-permanent-unlock'],
};
export function build(snapshot,all){
 const old=all.filter(c=>c.split==='train'&&c.task==='owner-mechanism');assert.equal(old.length,120);
 const sourceIds=[...new Set(old.map(c=>c.sourceId))].sort();assert.equal(sourceIds.length,54);
 assert.deepEqual(sourceIds.map(id=>id.slice(6)),Object.keys(sourceNotes).sort(),'REVIEW_COVERAGE');
 const candidate=[],review=[];let edited=0;
 for(const c of old){
  const s=snapshot.sources.find(s=>s.id===c.sourceId);assert(s);const input=JSON.parse(c.messages.at(-1).content);assert.equal(input.source.text,mechanicsText(s.ownerOriginal));
  const key=c.id.replace('owner-mechanism-godie-',''),rewrite=rewrites[key],next=structuredClone(c);
  if(rewrite){input.claim=rewrite[0];next.id=c.id+'-wording-v2';next.messages.at(-1).content=JSON.stringify(input);next.requestDigest=digest(next.messages);next.reviewReason=sourceNotes[c.sourceId.slice(6)];edited++;}
  candidate.push(next);review.push({id:c.id,sourceId:c.sourceId,sourceSha256:digest(s.ownerOriginal),sourceOriginal:s.ownerOriginal,modelVisibleSource:JSON.parse(c.messages.at(-1).content).source.text,originalRequestDigest:c.requestDigest,originalClaim:JSON.parse(c.messages.at(-1).content).claim,originalTarget:c.target,fullSourcePersonallyRead:true,claimPersonallyReviewed:true,sourceReview:sourceNotes[c.sourceId.slice(6)],disposition:rewrite?'rewrite-candidate':'retain-no-new-concern',risk:rewrite?.[1]??null,candidateId:next.id,candidateClaim:input.claim,candidateRequestDigest:next.requestDigest,candidateTarget:next.target,labelChanged:false,oldLabelProvenWrong:false});
 }
 assert.equal(edited,Object.keys(rewrites).length);validateCases(candidate);
 return {candidate,review,counts:{sources:sourceIds.length,claims:old.length,rewritten:edited,unchanged:old.length-edited,labelsChanged:0},sourceIds};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [r3,out]=process.argv.slice(2);for(const p of [r3,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=p=>JSON.parse(fs.readFileSync(p)),data=build(read(path.join(r3,'source-snapshot.json')),read(path.join(r3,'cases.private.json')));fs.mkdirSync(out);
 const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});put('review.json',data.review);put('owner-train-candidate.private.json',data.candidate);
 put('manifest.json',{schema:'ggd-owner-training-wording-review@1',createdAt:new Date().toISOString(),parent:r3,counts:data.counts,sourceIds:data.sourceIds,candidateSha256:digest(data.candidate),reviewSha256:digest(data.review),status:'HOLD_PENDING_R5_RESULTS',trainingStarted:false,oldDataModified:false,oldScoresRewritten:false,ownerGold:false,releaseQualified:false,scope:'Personally reread all 54 historical Owner training sources and all 120 claims. Fourteen wording candidates, not 14 proven wrong labels. Source originals unchanged; no dev/test rows enter training. Not a complete source/hero/mechanism-template corpus quality approval.'});
 const lines=['# Owner 訓練題完整複核與措辭校正候選','','已逐份讀完原 R3 Owner 訓練來源的完整原文及全部120題。這不是固定原始總筆數的背書，也不是Owner Gold。','','- 54份訓練來源／120題：106題未發現新的措辭疑慮，14題提出改寫。','- 原標籤沒有直接更改；14題也不代表14個已證實錯標。','- 來源原文、R3/R5既有資料及分數完全保留；候選尚未進行訓練。','- 僅限原本train切分，沒有將dev/test或新15題澄清診斷搬入訓練。','','| 原題 | 疑慮 | 下一版候選問句 |','| --- | --- | --- |'];
 for(const r of data.review.filter(r=>r.disposition==='rewrite-candidate'))lines.push(`| ${r.id} | ${r.risk} | ${r.candidateClaim} |`);
 lines.push('','完整逐題原文、舊問句、舊答案、來源審查理由與候選問句見 review.json。候選摘要綁定於 manifest.json。','', '## 使用條件','','先看R5原本固定評估及新來源診斷結果，再決定是否建立R6；不得用此改寫回填或美化R5成績。若採用，需重新鎖定資料與訓練暴露紀錄，保留原R3作控制。尚未證明這14項改寫能提升模型。');
 fs.writeFileSync(path.join(out,'REVIEW.md'),lines.join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({out,...data.counts,trainingStarted:false}));
}
