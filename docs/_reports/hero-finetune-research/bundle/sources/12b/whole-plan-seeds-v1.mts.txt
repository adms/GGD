/** Full-source reviewed mechanism-plan candidates. No old recipe is copied.
 * Unspecified design choices stay explicit; not auto-admitted or blind data.
 */
import fs from 'node:fs';
import {SLOTS,sha} from './intake.mjs';
import assert from 'node:assert/strict';
const sources=JSON.parse(fs.readFileSync(new URL('./source-review-v1/model-inputs.json',import.meta.url),'utf8'));
export function wholePlan(id:string){
  assert(['community7-lux','community7-xerath'].includes(id));
  const source=sources.find((s:any)=>s.id===id);assert(source);
  assert.equal(sha(source.hero.originalText),source.hero.sourceSha256);
  for(const s of source.slots)assert.equal(sha(s.originalText),s.sourceSha256);
  const original=Object.fromEntries(source.slots.map((s:any)=>[s.slot,s.originalText]));
  const action=(s:string,op:string,fields:any)=>({op,evidence:original[s],...fields});
  const hit=(s:string,damageType:string|null=null,tier:string|null=null)=>action(s,'damage',{damageType,tier});
  const control=(s:string,kind:string)=>action(s,'control',{control:kind,duration:0.8,slowPct:null});
  const shield=(s:string,absorbs:string,stacking='replace')=>action(s,'shield_self',{duration:3,amount:null,absorbs,stacking});
  const slots:any=Object.fromEntries(SLOTS.map((s:string)=>[s,{delivery:s==='PASSIVE'?'passive':'targeted',rangeTier:null,
    windup:null,actions:[],cost:null,mechanismGaps:[],tuningNotes:[]}]));
  const set=(s:string,delivery:string,actions:any[],extra={})=>Object.assign(slots[s],{delivery,actions,...extra});
  const identity=id==='community7-lux'?'結合光束、短效束縛與護盾，以清楚的施法提示協助隊伍創造進攻空間。'
    :'以蓄能光路、落點爆破與定身咒彈控制距離，施放有限次數的奧術轟擊。';
  const ir:any={schema:'hero-semantic-ir@4',hero:{origin:id==='community7-lux'?'軟輔':'法師',originBasis:'source',
    identitySummary:identity,identityEvidence:[identity]},relations:[],slots};
  set('PASSIVE','passive',[action('PASSIVE','attack_proc',{damageType:'magic',tier:'極小',cooldown:2,targetHpBelow:null})]);
  const line=(s:string,repeatHits:string)=>action(s,'line_sequence',{count:4,direction:'cast_facing',repeatHits,
    interval:null,firstDelay:null,stepDistance:null,radius:null,damageType:null,tier:null});
  const choices:any[]=[];
  if(id==='community7-lux'){
    set('Q','targeted',[control('Q','root')],{tuningNotes:['原文未明說Q造成傷害，僅實作指定一人的鎖足；不得從LoL常識或舊模板補傷害。']});
    set('W','self',[shield('W','all','keep_larger')]);
    set('E','ground',[action('E','area_pulses',{damageType:'magic',tier:'極小',count:3,interval:1,firstDelay:1,radiusTier:'小',anchor:'point'})],
      {tuningNotes:['小級範圍是可調研究提案，不是原文明示值；1/2/3秒各一次，保留每秒極小級傷害。']});
    set('R','ground',[line('R','per_segment')]);
    set('EX','self',[action('EX','buff_self',{duration:3,moveSpeedTier:'極小',attackSpeedPct:null}),action('EX','heal_self',{amount:null})]);
    choices.push({path:'slots.E.actions.0.radiusTier',value:'小',basis:'bounded-preview-proposal-not-source',affectsMechanicClassification:false});
  }else{
    set('Q','ground',[line('Q','once_per_cast')],{rangeTier:'大',windup:0.3,
      tuningNotes:['吟唱0.3秒為有界研究提案，原文只明示先吟唱。','同目標四段只傷一次為研究選擇，來源沒有指定重複命中政策；不得作來源分類正解。']});
    set('W','ground',[hit('W','magic','小')]);
    set('E','targeted',[hit('E'),control('E','stun')]);
    set('R','ground',[action('R','area_pulses',{damageType:null,tier:null,count:3,interval:0.4,firstDelay:0.1,radiusTier:'小',anchor:'point'})],
      {rangeTier:'極大',tuningNotes:['0.1秒第一發、間隔0.4秒及小級半徑為有界研究提案；原文明示三發、固定落點、不可重瞄準。']});
    set('EX','self',[shield('EX','magic'),action('EX','restore_mana',{target:'self',basis:'maximum_mana',mode:'add',fraction:0.15})],
      {tuningNotes:['護盾3秒與replace是短效護盾的研究選擇，原文未指定秒數或疊加政策。']});
    choices.push({path:'slots.Q.actions.0.repeatHits',value:'once_per_cast',basis:'source-unspecified-gameplay-choice',affectsMechanicClassification:true,
      trainingLabelEligible:false,reason:'Cannot teach this as the uniquely correct source interpretation.'},
      ...['slots.Q.windup','slots.R.actions.0.interval','slots.R.actions.0.firstDelay','slots.R.actions.0.radiusTier','slots.EX.actions.0.duration','slots.EX.actions.0.stacking']
        .map(path=>({path,basis:'bounded-preview-proposal-not-source',affectsMechanicClassification:false})));
  }
  return {id,source,ir,choices,fullSourceReadByAssistant:true,ownerApproved:false,historicallyExposed:true,
    completeExecutableGold:false,trainingAdmitted:false,freshBlind:false,
    caveat:'Compile/runtime checks and full-source negative tests must finish before any training admission. Source-unspecified gameplay choices are not source classification labels.'};
}
export const WHOLE_PLANS=['community7-lux','community7-xerath'].map(wholePlan);
