// Build real requests without access to training answers. No renderer edits or activation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';
import {elements,shapes,namedVfx} from './reviewed-curriculum.mjs';
export function buildRequest(catalog,input){
 if(!input||!['vfx','mechanism'].includes(input.task)||typeof input.request!=='string'||input.request.length>4000)throw Error('INPUT_REQUIRES_TASK_AND_REQUEST');
 const request=mechanicsText(input.request);if(!request.trim())throw Error('EMPTY_MECHANICS_REQUEST');
 const vfx=input.task==='vfx';let choices=catalog[vfx?'vfx':'mechanism'];
 if(vfx){
  const aliases=[[/氣功|氣功砲|氣功炮|鬥氣/,'ki'],[/火焰|火球|烈焰|火柱/,'fire'],[/冰|寒霜|凍/,'ice'],[/雷|電/,'lightning'],[/光明|聖光|神聖/,'holy'],[/暗|虛空|黑洞/,'void'],[/奧術|魔力|魔法/,'arcane'],[/風|旋風/,'wind'],[/毒|腐蝕/,'poison'],[/血|吸血/,'blood'],[/自然|樹|藤/,'nature'],[/氣功砲|氣功炮|光束|能量束|射線|雷射/,'beam'],[/震波|衝擊波/,'shockwave'],[/環形|周圍.*爆|擴散/,'nova'],[/斬|劍氣|刀光/,'slash'],[/爆炸|引爆/,'explosion'],[/護盾|屏障/,'shield'],[/治療|回血/,'heal']];
  const cues=[...new Set([...aliases.filter(([re])=>re.test(request)).map(([,word])=>word),...Object.entries({...elements,...shapes}).filter(([,terms])=>terms.some(t=>request.includes(t))).map(([key])=>key)])];
  const named=Object.entries(namedVfx).filter(([,terms])=>terms.some(t=>request.includes(t))).map(([id])=>id);
  // Retrieval narrows a large registry; it does not decide the final template.
  choices=choices.map(c=>({c,rank:(named.includes(c.id)?3:0)+cues.reduce((n,cue)=>n+(c.id.split(/[.\-]/).includes(cue)?1:0),0)})).sort((a,b)=>b.rank-a.rank||a.c.id.localeCompare(b.c.id)).slice(0,24).map(x=>x.c);
 }
 const content={task:vfx?'vfx-semantic':'mechanism-template',request,catalog:choices,instruction:vfx?'只輸出 {decision,suggestedTemplateIds,reasonCode}；無合適模板時 refuse。只可推薦 usable=true；同系列大小版本先推薦標準版。不得輸出特效參數。':'只輸出 {decision,templateId}；draft 不可直接使用；不合適時 refuse，templateId=null。不要輸出參數。'};
 const messages=[{role:'system',content:catalog.system},{role:'user',content:JSON.stringify(content)}];
 return{id:input.id??'interactive-classification',messages,requestDigest:digest(messages),task:input.task,candidates:choices,sourceRequest:input.request,mechanicsRequest:request};
}
export function validateRecommendation(request,value){
 if(!value||typeof value!=='object'||Array.isArray(value))return{pass:false,error:'NOT_OBJECT'};
 const vfx=request.task==='vfx',allowed=vfx?['decision','suggestedTemplateIds','reasonCode']:['decision','templateId'];
 if(Object.keys(value).sort().join()!==allowed.sort().join()||!['accept','refuse'].includes(value.decision))return{pass:false,error:'OUTPUT_CONTRACT'};
 const ids=vfx?value.suggestedTemplateIds:value.templateId===null?[]:[value.templateId];
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>4||(value.decision==='refuse'&&ids.length)||(value.decision==='accept'&&!ids.length))return{pass:false,error:'INVALID_SELECTION'};
 if(ids.some(id=>!request.candidates.some(c=>(c.id??c.templateId)===id&&(vfx?c.usable:c.status==='enabled'))))return{pass:false,error:'UNKNOWN_OR_UNSUPPORTED_TEMPLATE'};
 if(vfx&&value.reasonCode!==(value.decision==='accept'?'matching-template':'no-supported-template'))return{pass:false,error:'REASON_CODE'};
 return{pass:true,classification:value,manualParameterTuning:true,activation:false,warning:'Contract validation only; semantic recommendation still requires review until qualified.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='validate'){
  const [requestPath,resultPath,outPath]=process.argv.slice(3);if(![requestPath,resultPath,outPath].every(Boolean))throw Error('usage: classification-client.mjs validate REQUEST RAW_RESULT NEW_VALIDATED_RESULT');
  const request=JSON.parse(fs.readFileSync(requestPath,'utf8')),raw=JSON.parse(fs.readFileSync(resultPath,'utf8'));
  if(request.requestDigest!==raw.requestDigest)throw Error('REQUEST_DIGEST_MISMATCH');
  const validated=validateRecommendation(request,raw.value);fs.writeFileSync(outPath,JSON.stringify({...validated,requestDigest:request.requestDigest},null,2)+'\n',{flag:'wx'});
  if(!validated.pass)throw Error(validated.error);console.log(JSON.stringify(validated));
 }else{
 const [catalogPath,inputPath,outPath]=process.argv.slice(2);if(![catalogPath,inputPath,outPath].every(Boolean))throw Error('usage: classification-client.mjs CATALOG INPUT NEW_REQUEST');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const request=buildRequest(read(catalogPath),read(inputPath));fs.writeFileSync(outPath,JSON.stringify(request,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({id:request.id,candidates:request.candidates.length,requestDigest:request.requestDigest}));
 }
}
