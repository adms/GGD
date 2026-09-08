/** Personal reread of all 30 historical hero train sources and all 90 claims.
 * Candidate wording only. No training, old-data mutation, or test relabelling.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {validateCases} from './r3-data.mjs';
export const sourceNotes={
 e001:'雛見澤與喜歡帶可愛物品回家均明寫；厭惡且從不帶回家相反；操縱時間未提。',
 e002:'女性SERVANT及與士郎契約明寫；男性且無契約相反；黑化版本未指定，不用作品記憶補入。',
 e008:'火霧戰士明寫，否認身分相反；十九歲未提供。',
 e00w:'混血、白翅膀、逐出村莊明寫；純血黑翼受表揚相反；唯一掌門未提。',
 edem:'想殺哥哥與咒印明寫，否認兩者相反；成人特定篇章沒有明示。',
 efur:'奇犽祖父與殺手家族明寫；改為奇犽兒子逆轉親屬；時間回溯未提。',
 emfr:'十歲與首席畢業明寫；三十歲相反；精確身高未提供，候選改成直接屬性敘述。',
 etyr:'魔力與成為頂級治癒術師的可能性明寫，正例保留潛力；沒有魔力相反；復活一天以上未提。',
 h01u:'字奉先、善戰且勢利多變明寫；孔明及不善戰相反；操縱時間未提。',
 h02k:'修正紀錄明写模擬器確定性及取中點；每級必須擲骰相反；二十歲未提供。這是來源判讀，不是新runtime證據。',
 h02v:'網民惡搞的十大神獸明寫；希臘聖杯來源與給定來源不同；復活全部友軍未提。',
 hapm:'半神半人及依利亞明寫；無半神血統相反；十二功績內容未列，候選改問未提供的確切年齡。',
 hart:'為朋友重提大刀明寫；拒為朋友且從不用刀相反；重製終章版本未指定。',
 hblm:'清人持紅書並肩作戰明寫；互不相識且無關相反；競逐寶座不等於已登基，不推論故事後續。',
 hgam:'出生負種子、營養與一同長大明寫；無營養永不長大相反；二十五級未提供。',
 hvsh:'只有梅杜莎具人類身軀明寫；三姐妹都有人類身軀相反；主要坐騎是摩托車未提。',
 n003:'真祖與只有夜晚自動回血明寫；只有白天相反；解除全部封印未提。',
 n00b:'本遊戲來源明寫21世紀，保留而不以外部常識改成別世紀；23世紀相反；所有道具無需能源未提。',
 nbbc:'神魔人混血龍騎士明寫；純人無神魔血統相反；生日未提，候選改直接詢問出生月份。',
 nplh:'安娜授予超占事略決明寫；舊否定只換授予者未排除多次授予，候選明確否認安娜；通靈王結果未提。',
 nsjs:'妖魔轉生人類與控制植物明寫；完全不能控制植物相反；一年壽命未提。',
 o00k:'SATO X PICA與傲嬌明寫；來源欄的Fate與指定來源不同；人鼠形態自由切換未提。',
 ofar:'國際巨星及使喚小智明寫；從不認識小智相反；性別未提供，候選直接問雄性而非說來源已確認。',
 orkn:'去死團怨念支柱及老頭明寫；愛與和平治癒公主換了身分；精確年齡未提供，候選直接問六十歲。',
 u00j:'父母姓名明寫；父親換克勞德相反；毀掉尼布爾罕不是已毀全世界，後者未提。',
 ubal:'精神轉老身體、年輕肉體封印與重要戰役才有機會使用明寫；正例需保留有機會，不能改成必定實際使用；毀掉且永不可能使用相反。永久恢復有時態疑慮，另提無歧義未知屬性候選。',
 ucrl:'鯨魚島與尋父明寫；沙漠與尋子相反；技能名傑桑不證明永久成年狀態，候選直接寫待判屬性。',
 umal:'北斗神拳唯一傳人及秘穴拳法明寫；舊神鳴流問句未明確否認北斗，候選直接否認；185公分未提供。',
 uvng:'拳術與劍術高手、尋妹明寫；不會劍術且從不尋妹相反；唯一統治者未提。',
 zombiex:'黑泥受肉與爆發來自吞噬而非隱形高成長明寫；反轉設計理由相反；倒轉時間未提。',
};
export const rewrites={
 'ubal-yes':['巴恩封印年輕肉體，精神轉移到老頭身體；只有重要戰役才有機會再使用年輕肉體。','preserve-possibility-not-guaranteed-action'],
 'ubal-unknown':['此版本巴恩的年輕肉體身高是兩公尺。','replace-temporally-ambiguous-unknown'],
 'nplh-no':['麻倉葉沒有得到安娜授予的超占事略決。','explicit-denial-not-assumed-exclusive-grantor'],
 'umal-no':['拳四郎不是北斗神拳的傳人，也不會使用秘穴拳法。','explicit-denial-not-assumed-exclusive-style'],
 'emfr-unknown':['此版本涅吉的身高是一百四十公分。','direct-unknown-attribute-not-meta-source-claim'],
 'nbbc-unknown':['此版本小呆的生日在十二月。','direct-unknown-attribute-not-meta-source-claim'],
 'ofar-unknown':['此版本皮卡丘的性別為雄性。','direct-unknown-attribute-not-meta-source-claim'],
 'orkn-unknown':['此版本臭作的年齡是六十歲。','direct-unknown-attribute-not-meta-source-claim'],
 'hapm-unknown':['此版本海克力斯的確切年齡是三十歲。','direct-unknown-attribute-not-meta-source-claim'],
 'ucrl-unknown':['此版本的傑永遠維持成年強制成長狀態。','direct-unknown-attribute-not-meta-source-claim'],
};
export function build(snapshot,all){
 const old=all.filter(c=>c.split==='train'&&c.task==='hero-source');assert.equal(old.length,90);
 const sourceIds=[...new Set(old.map(c=>c.sourceId))].sort();assert.equal(sourceIds.length,30);
 assert.deepEqual(sourceIds.map(id=>id.slice(6)),Object.keys(sourceNotes).sort(),'REVIEW_COVERAGE');
 const candidate=[],review=[];let edited=0;
 for(const c of old){
  const s=snapshot.heroes.find(s=>s.id===c.sourceId);assert(s);const input=JSON.parse(c.messages.at(-1).content),originalClaim=input.claim;
  assert.equal(input.source.text,s.descriptionOriginal,'SOURCE_DRIFT');assert.equal(input.source.snapshot,digest(s.descriptionOriginal));assert.equal(c.sourceSha256,digest(s.descriptionOriginal));
  const rewrite=rewrites[c.id.replace('hero-source-godie-','')],next=structuredClone(c);
  if(rewrite){input.claim=rewrite[0];next.id=c.id+'-wording-v2';next.messages.at(-1).content=JSON.stringify(input);next.requestDigest=digest(next.messages);next.reviewReason=sourceNotes[c.sourceId.slice(6)];edited++;}
  candidate.push(next);review.push({id:c.id,sourceId:c.sourceId,sourceOriginal:s.descriptionOriginal,sourceSha256:digest(s.descriptionOriginal),sourceAuthority:'locked-repository-description-not-external-canon-or-owner-gold',fullSourcePersonallyRead:true,claimPersonallyReviewed:true,originalClaim,originalTarget:c.target,originalRequestDigest:c.requestDigest,sourceReview:sourceNotes[c.sourceId.slice(6)],disposition:rewrite?'rewrite-candidate':'retain-no-new-concern',risk:rewrite?.[1]??null,candidateId:next.id,candidateClaim:input.claim,candidateRequestDigest:next.requestDigest,candidateTarget:next.target,labelChanged:false,oldLabelProvenWrong:false,semanticEquivalenceGuaranteed:false});
 }
 assert.equal(edited,10);validateCases(candidate);return {candidate,review,sourceIds,counts:{sources:30,claims:90,rewritten:edited,unchanged:90-edited,labelsChanged:0}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [r3,out]=process.argv.slice(2);for(const p of [r3,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=p=>JSON.parse(fs.readFileSync(p)),data=build(read(path.join(r3,'source-snapshot.json')),read(path.join(r3,'cases.private.json')));fs.mkdirSync(out);
 const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});put('review.json',data.review);put('hero-train-candidate.private.json',data.candidate);
 put('manifest.json',{schema:'ggd-hero-training-wording-review@1',createdAt:new Date().toISOString(),parent:r3,counts:data.counts,sourceIds:data.sourceIds,candidateSha256:digest(data.candidate),reviewSha256:digest(data.review),status:'HOLD_PENDING_R5_RESULTS',trainingStarted:false,oldDataModified:false,oldScoresRewritten:false,ownerGold:false,releaseQualified:false,scope:'All 30 historical hero training source texts and all 90 claims reread. Ten candidate rewrites, not ten proven wrong labels. Some change the tested proposition, not equivalent paraphrases. No dev/test rows enter training. Does not certify all heroes, versions, mechanics or external canon.'});
 const lines=['# 英雄設定訓練題全量複核','','30份完整來源／90題已再次親自閱讀；80題保留，10題提出措辭候選。原文、標籤、system與train切分不變，沒有改R3/R5、回填舊分數或搬入dev/test。','','這不是10個已證實錯標；部分候選改了待判命題，不能當舊題等價改寫。未知生日／性別／身高僅表示給定來源沒提供，不能用外部作品知識判真偽。所有候選HOLD，未訓練、未證明收益。','','| 原題 | 疑慮 | 候選 |','| --- | --- | --- |'];
 for(const r of data.review.filter(r=>r.risk))lines.push(`| ${r.id} | ${r.risk} | ${r.candidateClaim} |`);
 lines.push('','逐題完整來源、原問句、舊答案與個別審查理由見review.json。先看R5固定結果及追加診斷，才決定是否另建R6訓練。');fs.writeFileSync(path.join(out,'REVIEW.md'),lines.join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({out,...data.counts,trainingStarted:false}));
}
