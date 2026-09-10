import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
// Preserve Owner text separately; mechanism readers never receive dialogue.
export function mechanicsText(original) {
 let depth=0, result='';
 for(const ch of original){
  if(ch==='「'){depth++;continue;}
  if(ch==='」'){if(!depth)throw Error('UNMATCHED_DIALOGUE_CLOSE');depth--;continue;}
  if(!depth)result+=ch;
 }
 if(depth)throw Error('UNMATCHED_DIALOGUE_OPEN');
 return result;
}
export const writeJSON = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n'); fs.renameSync(tmp,file); };
export const SYSTEM = `你是 GGD 單技能製作提案助手。只輸出 JSON，不寫 Markdown、思考或解釋。
這是受限研究接口，不是任意技能引擎。只可選 tpl-ground-nova：施放時以自身為中心對敵人造成一次範圍傷害；radius 使用 WC3 單位，damage 為單一數值，damageType 為 magic/physical/true。不可新增治療、持續狀態、命中事件或骨頭掛點。
VFX 僅是施放事件的配置，合法 vfxKey、欄位見輸入；只填明確要求的覆寫，0 與省略不同。角色台詞已由前處理排除。
需求無法精確完成則 refused；只有原文明確授權且輸入列出合法 fallback 才 degraded。缺少 radius 或 damage 時 advice，missing 列缺少的欄位，不能猜數值。優先順序：不支援且未授權→refused，其次缺資訊→advice，合法授權替代→degraded，否則 proposed。
輸出固定六個欄位：{"outcome":"proposed|degraded|refused|advice","templateId":"tpl-ground-nova 或 null","params":{"radius":數值,"damage":數值,"damageType":"magic|physical|true"}或null,"vfxLayers":陣列,"missing":陣列,"fallbackId":"cast-nova 或 null"}。refused/advice 的 templateId、params、fallbackId 必須 null 且 vfxLayers 為[]；refused 的 missing 為[]。proposed/degraded 的 missing 為[]。`;

// The family split is declared BEFORE numerical expansion. These are newly
// authored synthetic research specs, NOT owner-confirmed Gold or sealed gold.
const families = [
 ['train','proposed','magic','caster','none','none'],
 ['train','proposed','physical','point','alpha','none'],
 ['train','proposed','true','caster','delay','none'],
 ['train','proposed','magic','point','timeScale','none'],
 ['train','refused','magic','caster','none','onHit'],
 ['train','refused','physical','point','none','bone'],
 ['train','advice','true','caster','alpha','damage'],
 ['train','degraded','physical','point','delay','onHit'],
 ['dev','proposed','physical','caster','timeScale','none'],
 ['dev','proposed','true','point','alpha','none'],
 ['dev','refused','true','caster','delay','bone'],
 ['dev','advice','magic','point','none','radius'],
 ['test','proposed','magic','caster','alpha','none'],
 ['test','proposed','physical','point','timeScale','none'],
 ['test','proposed','true','point','delay','none'],
 ['test','proposed','physical','caster','alpha-delay','none'],
 ['test','refused','physical','caster','alpha','onHit'],
 ['test','refused','magic','point','timeScale','bone'],
 ['test','advice','physical','point','delay','damage'],
 ['test','advice','true','caster','timeScale','radius'],
];

export function prepare(root, snapshot) {
 const cases=[];
 for (const [fi,f] of families.entries()) {
  const [split,outcome,damageType,attachTo,override,condition]=f;
  for(let i=0;i<(split==='train'?18:6);i++){
   const radius=400+((i*7+fi)%9)*40, damage=70+((i*13+fi*3)%19)*10;
   const vfxKey=snapshot.vfxKeys[(i+fi)%snapshot.vfxKeys.length];
   const overrides={}; if(override.includes('alpha'))overrides.alpha=i%3===0?0.1:0.5;
   if(override.includes('delay'))overrides.delayMs=100+(i%5)*100;
   if(override==='timeScale')overrides.timeScale=i%2?2:0.5;
   const spec={outcome,damageType,attachTo,override,condition,radius,damage,vfxKey,overrides};
   const radiusText=condition==='radius'?'半徑尚未決定':`半徑 ${radius} WC3 單位`;
   const damageText=condition==='damage'?'傷害數值尚未決定':`造成 ${damage} 點${{magic:'魔法',physical:'物理',true:'真實'}[damageType]}傷害`;
   const extra=condition==='onHit'?'必須等投射物命中才產生震波，未命中不能發動。':condition==='bone'?'特效必須綁定右手骨頭並持續跟隨。':'';
   const fallback=outcome==='degraded'?'我明確同意將命中觸發替換成施放時立刻發動的原地震波（cast-nova）。':'';
   const fieldText=Object.entries(overrides).map(([k,v])=>`${k}=${v}`).join('，');
   const request=`「${i%2?'我會治療所有同伴！':'讓時間停止，世界臣服！'}」只是角色台詞。\n${i%2?'製作一招':'需要以下技能：'}自身中心環形震波，${radiusText}，${damageText}；只影響敵人。${extra}${fallback}\n施放特效只要 ${vfxKey}，attachTo=${attachTo}${fieldText?'，'+fieldText:''}。不要任何其他圖層或覆寫。${attachTo==='point'?'沒有落點時接受引擎原有 caster fallback，但請保留 point 設定。':''}`;
   const usable=['proposed','degraded'].includes(outcome);
   const target={outcome,templateId:usable?'tpl-ground-nova':null,params:usable?{radius,damage,damageType}:null,vfxLayers:usable?[{vfxKey,attachTo,...overrides}]:[],missing:outcome==='advice'?[condition]:[],fallbackId:outcome==='degraded'?'cast-nova':null};
   cases.push({id:`${split}-${fi}-${i}`,familyId:`family-${fi}`,familyFingerprint:digest(f.slice(1)),split,spec,request,mechanicsText:mechanicsText(request),target,qualityTier:'synthetic-research',humanConfirmed:false,source:{kind:'new-scripted-spec',ownerTextSha256:digest(request),license:'project-research-fixture',notFromReleaseCorpus:true}});
  }
 }
 const train=cases.filter(c=>c.split==='train');
 for(const c of cases){
  // Retrieval uses two fixed train examples, never dev/test targets.
  const examples=[train[0],train.find(x=>x.target.outcome==='refused')];
  c.retrievalIds=examples.map(x=>x.id);
  c.messages=[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({examples:examples.map(x=>({request:x.mechanicsText,answer:x.target})),request:c.mechanicsText,context:{templateId:'tpl-ground-nova',vfxKeys:snapshot.vfxKeys,allowedVfxFields:snapshot.vfxFields,legalFallbackIds:c.spec.outcome==='degraded'?['cast-nova']:[]}})}];
  c.requestDigest=digest(c.messages);
 }
 const splitReport={status:'pass',counts:Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.split===s).length])),families:Object.fromEntries(['train','dev','test'].map(s=>[s,new Set(cases.filter(c=>c.split===s).map(c=>c.familyId)).size])),humanConfirmed:0,qualification:'synthetic-diagnostic-only',limitations:['All share one authored grammar and one engine template; compositional family separation is not independent owner-source generalization.','No human-confirmed gold; no effectiveness or release qualification.','Test is a frozen synthetic holdout, not an unseen natural-language gold benchmark.']};
 const seen=new Map();for(const c of cases){for(const key of [c.familyId,c.familyFingerprint,digest(c.request)]){if(seen.has(key)&&seen.get(key)!==c.split)throw Error('SPLIT_LEAK');seen.set(key,c.split);}if(!c.retrievalIds.every(id=>train.some(t=>t.id===id)))throw Error('RETRIEVAL_LEAK');}
 writeJSON(path.join(root,'cases.private.json'),cases);
 writeJSON(path.join(root,'split-report.json'),splitReport);
 for(const split of ['train','dev','test']){
  const rows=cases.filter(c=>c.split===split);
  writeJSON(path.join(root,`${split}-requests.json`),rows.map(({id,requestDigest,messages})=>({id,requestDigest,messages})));
 }
 fs.writeFileSync(path.join(root,'train.jsonl'),train.map(c=>JSON.stringify({id:c.id,messages:c.messages,target:c.target})).join('\n')+'\n');
 writeJSON(path.join(root,'dataset-manifest.json'),{schema:'ggd-forge-dataset@1',casesDigest:digest(cases),sourceDigest:digest(fs.readFileSync(new URL(import.meta.url),'utf8')),sourceEngineDigest:snapshot.digest,...splitReport});
 return cases;
}
