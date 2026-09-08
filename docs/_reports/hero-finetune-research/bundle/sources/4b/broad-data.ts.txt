/** Catalog-backed curriculum. Owner prose is never silently paired with legacy JSON. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {zTemplateDoc} from '../../packages/shared/src/content/schema/template';
import {zAbilityDoc} from '../../packages/shared/src/content/schema/ability';
import {zVfxCollectionDoc} from '../../packages/shared/src/content/schema/vfx';
import {defaultParamsFor,paramsSchemaFor} from '../../packages/shared/src/content/templates/paramsSchema';
import {createDeterministicHeroPlans,templateFitsHeroSlot} from '../../packages/shared/src/content/heroForge/planner';
import {compileGeneratedHeroDraft,generateHeroDraft} from '../../packages/shared/src/content/heroForge/generator';
import {runHeroAbilityScenario} from '../../packages/shared/src/content/heroForge/scenario';
import {buildCapabilityManifest} from '../../packages/shared/src/content/editorCapabilities';
import {mechanicsText} from './dataset.mjs';
const repo=path.resolve(import.meta.dirname,'../..');
const out=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(out))throw Error('NEW_OUTPUT_REQUIRED');
const sha=(x:any)=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const pins:any[]=[];const rejected:any[]=[];const cases:any[]=[];const evidence:any[]=[];
const load=(rel:string)=>{const raw=fs.readFileSync(path.join(repo,rel),'utf8');pins.push({path:rel,sha256:sha(raw)});return raw;};
const docs=(dir:string)=>fs.readdirSync(path.join(repo,'content',dir)).filter(x=>x.endsWith('.json')&&x!=='_index.json').sort().map(n=>JSON.parse(load(`content/${dir}/${n}`)));
const templates=docs('ability-templates').map(x=>zTemplateDoc.parse(x));
const enabled=templates.filter(x=>x.status==='enabled');
const vfx=docs('vfx').map(x=>zVfxCollectionDoc.parse(x));
const abilities=docs('abilities').flatMap(x=>{const p=zAbilityDoc.safeParse(x);if(!p.success){rejected.push({id:x.id,stage:'ability-schema',errors:p.error.issues});return [];}return[p.data];});
const projectiles=docs('projectiles');
const caps=buildCapabilityManifest();
const defaults=Object.fromEntries(enabled.map(t=>[t.id,defaultParamsFor(t)]));
const base=createDeterministicHeroPlans({projectId:'broad-curriculum',brief:{name:'技能模板驗證',concept:'所有現行模板',moveNames:{}},sourceLock:{canonicalId:null,versionId:null},origin:'鬥士',availableTemplateIds:enabled.map(t=>t.id),availableTemplates:enabled})[0]!;
const system='你是 GGD 技能分類與模板推薦助手。只輸出要求的 JSON，不推理、不寫 Markdown。依輸入目錄選模板，不捏造 ID；draft 不可套用。decision 只能是 accept（可用）或 refuse（不可用）；refuse 時 templateId=null、templateIds/suggestedTemplateIds=[]。特效 reasonCode 只能是 matching-template（有相符模板）或 no-supported-template（無可用模板），不可自創。模板組合 onConflict 固定為已授權的 lastWins。能力狀態任務使用 state=supported/partial/unsupported，不使用 decision。所有任務僅分類與推薦，禁止輸出任何參數或修改遊戲機制。角色台詞已移除。';
function add(id:string,task:string,split:string,lineage:string,input:any,target:any,proof:any){
 const clean=(x:any):any=>typeof x==='string'?mechanicsText(x):Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clean(v)])):x;
 const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(clean({task,...input}))}];
 cases.push({id,task,split,lineage,originalInput:input,messages,target,requestDigest:sha(messages),quality:'program-validated-not-human-gold',proof});
}
function compile(cards:any[],id:string){
 const selected=cards.map(c=>enabled.find(t=>t.id===c.templateId)!);
 if(selected.some(t=>!t))throw Error('NOT_ENABLED');
 const slot=selected.every(t=>templateFitsHeroSlot(t,'PASSIVE'))?'PASSIVE':'Q';
 if(!selected.every(t=>templateFitsHeroSlot(t,slot)))throw Error('INCOMPATIBLE_SLOT');
 for(const c of cards){const t=selected.find(t=>t.id===c.templateId)!;paramsSchemaFor(t).strict().parse(c.params);}
 const plan=structuredClone(base);plan.slots[slot]={...plan.slots[slot],templateIds:cards.map(c=>c.templateId),templateParamsById:Object.fromEntries(cards.map(c=>[c.templateId,c.params])),templateConflictPolicy:'lastWins',capabilityIds:[...new Set(selected.flatMap(t=>t.requires))]};
 const compiled=compileGeneratedHeroDraft(generateHeroDraft(plan,{heroId:id,heroName:'模板訓練',templateParamsById:defaults}),enabled);
 if(!compiled.ok)throw Error(JSON.stringify(compiled.failures));
 const sim=runHeroAbilityScenario(compiled.draft.champion,compiled.draft.abilityDrafts[slot],{ticks:180,rank:1,seed:20260906,relatedAbilities:Object.values(compiled.draft.abilityDrafts),relatedProjectiles:projectiles});
 if(sim.status==='rejected'||sim.assertions.some(a=>a.status==='fail'))throw Error('SCENARIO:'+JSON.stringify(sim));
 return{slot,compiled:true,scenario:sim.status,eventCounts:sim.eventCounts,warning:sim.assertions.filter(a=>a.status==='warning'),scope:'schema/compiler/live scenario; not exhaustive behavioral or natural-language proof'};
}
const options=(ids:string[])=>templates.filter(t=>ids.includes(t.id)).map(t=>({templateId:t.id,name:t.name,description:t.description,status:t.status}));
// Every current enabled template receives training coverage; held-out values are disjoint.
for(const [ti,t] of templates.entries())for(let variant=0;variant<8;variant++){
 const split=variant<5?'train':variant===5?'dev':'test';const id=`template-${ti}-${variant}`;
 const params=defaultParamsFor(t);const numeric=Object.entries(t.params).filter(([k,v])=>v.type==='number'&&!v.inert&&typeof params[k]==='number');
 // This curriculum now prioritizes classification. Defaults are compiler probes,
 // not a parameter-generation target or a contribution to classification score.
 const edits:any={};
 let proof:any={schema:true,state:t.status};
 if(t.status==='enabled'){try{proof=compile([{templateId:t.id,params}],id);evidence.push({id,...proof});}catch(e){rejected.push({id,stage:'template-runtime',error:String(e)});continue;}}
 const selected=t.status==='enabled';
 const request=[`請製作：${t.description}`,`需要${t.name}這一類的機制。`,`${t.description} 請建議對應模板。`,`以${t.name}為技能核心。`,`目標行為為：${t.description}`,`設計師希望做到以下行為，應使用哪張現有卡？${t.description}`,`從候選中挑出能描述此招的模板：${t.description}`,`對於${t.name}的構想，請判斷本版能否直接套用。`][variant];
 add(id,'mechanism-template',split,`template-variant-${ti}-${variant}`,{request:mechanicsText(request),catalog:options([t.id,...templates.filter(x=>x.id!==t.id).slice((ti+variant)%24,(ti+variant)%24+3).map(x=>x.id)]).sort((a,b)=>sha(id+a.templateId).localeCompare(sha(id+b.templateId))),instruction:'僅分類選模板，輸出 {decision,templateId}。draft 請 refuse，templateId=null。不輸出參數。'}, {decision:selected?'accept':'refuse',templateId:selected?t.id:null},proof);
}
// Every compatible ordered pair, grouped by unordered pair to prevent reverse-order leakage.
for(const a of enabled)for(const b of enabled){if(a.id===b.id)continue;const key=[a.id,b.id].sort().join('|');const bucket=parseInt(sha(key).slice(0,4),16)%10;const split=bucket<8?'train':bucket===8?'dev':'test';const id=`pair-${a.id}-${b.id}`;
 const cards=[a,b].map(t=>({templateId:t.id,params:defaults[t.id]}));
 try{const proof=compile(cards,id);evidence.push({id,...proof});add(id,'mechanism-stack',split,key,{request:`依序組合${a.name}，然後${b.name}。重疊欄位以後者為準，不是所有效果相加。`,catalog:options([a.id,b.id]),instruction:'只選模板順序，輸出 {decision,templateIds,onConflict}，不輸出參數。'}, {decision:'accept',templateIds:cards.map(c=>c.templateId),onConflict:'lastWins'},proof);}catch(e){rejected.push({id,stage:'pair-runtime',error:String(e)});}}
// Full VFX catalog: recommendation only. No renderer parameters enter model targets.
const palette:any={ki:'氣功',fire:'火焰',ice:'冰霜',lightning:'雷電',arcane:'奧術',holy:'神聖',void:'虛空',blood:'鮮血',wind:'風',physical:'物理',nature:'自然',poison:'毒'};
const shape:any={beam:'光束砲',nova:'環形震波',shockwave:'衝擊波',slash:'斬擊',explosion:'爆炸',pulse:'脈衝',aura:'光環',projectile:'飛彈',bolt:'飛射',burst:'爆發',shield:'護盾',heal:'治療'};
const vfxMeta=vfx.map(v=>{const parts=v.id.replace(/^fx\./,'').split('.');const label=parts.map(p=>palette[p]??(p.endsWith('-lg')?'大型 '+(shape[p.slice(0,-3)]??p.slice(0,-3)):shape[p]?'標準 '+shape[p]:p)).join(' ');return{id:v.id,label,usable:v.schema!=='ribbon@1'&&!(v.schema==='vfx@1'&&(v.ambient===true||v.anchorBone!==undefined))};});
for(const [i,v] of vfxMeta.entries()){
 const family=v.id.replace(/\.p\d+$/,'').replace(/-lg$/,'');
 // Catalog knowledge is train; entirely new descriptions/combos are evaluated separately.
 const candidates=[v,...[1,7,19].map(n=>vfxMeta[(i+n)%vfxMeta.length]!)].sort((a,b)=>sha(v.id+a.id).localeCompare(sha(v.id+b.id)));
 add(`vfx-catalog-${i}`,'vfx-recommendation','train',family,{request:`需要${v.label}風格的現成技能特效，請從候選推薦相符的模板；所有其他參數由人工微調。`,catalog:candidates,instruction:'輸出 {decision,suggestedTemplateIds,reasonCode}；僅可推薦 usable=true。不可輸出特效參數。'}, {decision:v.usable?'accept':'refuse',suggestedTemplateIds:v.usable?[v.id]:[],reasonCode:v.usable?'matching-template':'no-supported-template'},{schema:true,registry:true,applicationChannel:v.usable?'cast-template':'preview-only'});
}
// Existing per-skill VFX bindings: preserve names for recommendation, not source-to-mechanics truth.
for(const a of abilities){const ids=[...new Set([a.vfxKey,...(a.vfxLayers??[]).map(l=>l.vfxKey)].filter(Boolean))] as string[];if(!ids.length)continue;
 const selected=ids.map(id=>vfxMeta.find(v=>v.id===id)).filter(Boolean) as typeof vfxMeta;
 if(selected.length!==ids.length){rejected.push({id:a.id,stage:'vfx-reference'});continue;}
 const lineage='hero-source-'+(a.name.match(/^(\d+)-/)?.[1]??a.id.split('.')[0]);const n=parseInt(sha(lineage).slice(0,4),16)%10;const split=n<8?'train':n===8?'dev':'test';
 const usable=selected.every(v=>v.usable);
 add(`ability-vfx-${a.id}`,'vfx-recommendation',split,lineage,{request:`參考既有技能 ${a.name} 的特效模板綁定，建議沿用相同模板，不新增或修改參數。`,referenceBindings:ids,catalog:selected,instruction:'輸出 {decision,suggestedTemplateIds,reasonCode}；任一模板不可用則 refuse，不擅自取代。'},{decision:usable?'accept':'refuse',suggestedTemplateIds:usable?ids:[],reasonCode:usable?'matching-template':'no-supported-template'},{schema:true,reference:true,source:a.id,scope:'binding reuse, not independent aesthetic judgment'});
}
// Natural-language recommendation probes are separate from binding-copy tasks.
for(const [element,label] of Object.entries(palette))for(const [form,meaning] of Object.entries(shape)){
 const id=`fx.prim.${element}.${form}`;const v=vfxMeta.find(x=>x.id===id&&x.usable);if(!v)continue;
 const candidates=[v,...vfxMeta.filter(x=>x.id.startsWith('fx.prim.')&&x.id!==id).filter((_,i)=>i%31===0).slice(0,4)].sort((a,b)=>sha(id+a.id).localeCompare(sha(id+b.id)));
 for(let variant=0;variant<3;variant++){const split=variant===0?'train':variant===1?'dev':'test';
 const phrases=[`做一個${label}屬性的${meaning}，請推薦現成特效。`,`招式要呈現${meaning}的形態，主題是${label}。選哪個模板合適？`,`我只要${label}風格，外觀是${meaning}，先幫我挑模板，細節我自己調。`];
 add(`vfx-language-${element}-${form}-${variant}`,'vfx-semantic',split,`vfx-language-${element}-${form}-${variant}`,{request:phrases[variant],catalog:candidates,instruction:'只輸出 {decision,suggestedTemplateIds,reasonCode}；同系列有大小版本時，先推薦標準模板，不輸出參數。'},{decision:'accept',suggestedTemplateIds:[id],reasonCode:'matching-template'},{registry:true,scope:'scripted phrasing with registered element/shape taxonomy; not human aesthetic Gold'});
 }}
// Runtime capability decisions cover the whole maintained capability inventory.
for(const [i,c] of caps.planned.entries())for(let v=0;v<3;v++){
 add(`cap-${i}-${v}`,'capability-policy',v===0?'train':v===1?'dev':'test',`cap-context-${i}-${v}`,{request:[`請判斷 ${c.key} 是否能直接使用。`,`這個需求依賴 ${c.key}，可以無條件套用嗎？`,`需要能力 ${c.key}；不能悄悄換成相似機制。`][v],capability:c,instruction:'輸出 {state,capabilityId}；state 僅可為 supported/partial/unsupported，忠實保留能力契約狀態。'},{state:c.state,capabilityId:c.key},{capabilityFingerprint:caps.fingerprint,scope:'contract decision, not new runtime behavior'});
}
// Existing full behavior taxonomy, not a claim that legacy implementations match Owner prose.
function csv(text:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows;}
const table=csv(load('docs/ability-templates.csv').replace(/^\uFEFF/,''));const header=table.shift()!;
const taxonomyRows=table.filter(r=>r.length===header.length).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]])));
const families=[...new Set(taxonomyRows.map(r=>r['JASS行為模板']).filter(Boolean))].sort();
for(const [i,r] of taxonomyRows.entries()){
 const family=r['JASS行為模板'];if(!family)continue;
 const lineage='hero-source-'+(r['技能名'].match(/^(\d+)-/)?.[1]??r['實例ID'].split(/[.;]/)[0]??`legacy-${i}`);const n=parseInt(sha(lineage).slice(0,4),16)%10;const split=n<8?'train':n===8?'dev':'test';
 const record={name:r['技能名'],geometry:r['行為幾何'],timing:r['行為時序'],displacement:r['位移語意'],mechanics:r['特殊機制'],castType:r['施放型'],jassTriggers:r['JASS觸發器'],wc3Base:r['WC3基底']};
 // Empty historical evidence is quarantined, not labeled from a name alone.
 if(!record.geometry&&!record.timing&&!record.displacement&&family!=='物件資料技能(無觸發)'){rejected.push({id:`taxonomy-${i}`,stage:'taxonomy-missing-behavior-evidence',family});continue;}
 add(`taxonomy-${i}`,'behavior-classification',split,lineage,{request:'依既有行為稽核紀錄分類，不代表新版 Owner 設計或現行模板支援。',record,candidateFamilies:families,instruction:'只輸出 {family}，不可生成或更改機制參數。'},{family},{source:'docs/ability-templates.csv',evidence:r['行為證據'],scope:'existing historical classification; not source-to-runtime equivalence'});
}
// Keep all classified hero records as context-backed taxonomy training (not role inference Gold).
const heroes=JSON.parse(load('docs/hero-archetypes.json')).champions;
for(const h of heroes){const lineage=[h.id,h.counterpartId].filter(Boolean).sort().join('|');const n=parseInt(sha(lineage).slice(0,4),16)%10;const split=n<8?'train':n===8?'dev':'test';
 add(`hero-${h.id}`,'hero-classification',split,lineage,{request:`請依已核對分類記錄，回傳 ${h.name} 的出身與定位。`,record:{name:h.name,origin:h['出身'],role:h['定位'],attackType:h.attackType},instruction:'輸出 {origin,role}，不要改變已有分類。'},{origin:h['出身'],role:h['定位']},{source:'docs/hero-archetypes.json',scope:'taxonomy retrieval, not unseen role inference'});
}
for(const p of pins)if(sha(fs.readFileSync(path.join(repo,p.path),'utf8'))!==p.sha256)throw Error('SOURCE_DRIFT');
if(!cases.length)throw Error('EMPTY');
for(const c of cases.filter(c=>c.task.startsWith('vfx-')))if(Object.keys(c.target).sort().join()!=='decision,reasonCode,suggestedTemplateIds')throw Error('VFX_PARAMETER_LEAK');
const seen=new Map();for(const c of cases){if(seen.has(c.requestDigest)&&seen.get(c.requestDigest)!==c.split)throw Error('EXACT_SPLIT_LEAK:'+c.id);seen.set(c.requestDigest,c.split);}
fs.mkdirSync(out,{recursive:true});
const put=(name:string,v:any)=>fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n');
put('cases.private.json',cases);put('validation.json',{evidence,rejected});put('source-pins.json',pins);put('capabilities.json',caps);
for(const split of ['train','dev','test']){const rows=cases.filter(c=>c.split===split);put(`${split}-requests.json`,rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));if(split==='train')fs.writeFileSync(path.join(out,'train.jsonl'),rows.map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n');}
const summary={schema:'ggd-forge-broad-curriculum@1',createdAt:new Date().toISOString(),templates:templates.length,enabled:enabled.length,vfx:vfx.length,abilities:abilities.length,capabilities:caps.planned.length,heroRecords:heroes.length,taxonomyRecords:taxonomyRows.length,taxonomyFamilies:families.length,counts:Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.split===s).length])),tasks:Object.fromEntries([...new Set(cases.map(c=>c.task))].map(t=>[t,cases.filter(c=>c.task===t).length])),rejected:rejected.length,casesSha256:sha(cases),sourceSha256:sha(fs.readFileSync(import.meta.filename,'utf8')),primaryMetric:'classification and template selection, macro averaged by task; parameters excluded',vfxScope:'template recommendation only; zero generated parameter overrides',humanGold:false,limitations:['Catalog entries are context, not unseen knowledge. Capability paraphrases share a contract across splits.','Template compositional generalization is synthetic; no freeform human Gold.','Existing ability VFX bindings only teach reuse, not semantic beauty.','Not all runtime scenarios prove effect-specific behavior.','Owner descriptions and legacy JSON are not automatically paired.']};put('dataset-manifest.json',summary);console.log(JSON.stringify(summary,null,2));
