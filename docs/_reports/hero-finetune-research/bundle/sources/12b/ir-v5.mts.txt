/** IR5 separates source-required cast timing from optional numeric tuning.
 * A versioned input contract, NOT a repair pass over old model answers.
 */
import assert from 'node:assert/strict';
import {z} from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import {ACTIONS4,zIR4,validateIR4,zLegacyAction} from './ir-v4.mts';
import {compileIR4} from './ir4-compiler.mts';
import {SLOTS} from './intake.mjs';
export {zLegacyAction};
export const zCastTiming=z.object({requirement:z.enum(['required','none','not_specified']),
  seconds:z.number().finite().min(0).max(10).nullable(),evidence:z.string().min(2).max(1000).nullable()}).strict();
export const ACTIONS5={...ACTIONS4,
  shield_self:ACTIONS4.shield_self.extend({duration:ACTIONS4.shield_self.shape.duration.nullable(),stacking:ACTIONS4.shield_self.shape.stacking.nullable()}).strict(),
  area_pulses:ACTIONS4.area_pulses.extend({interval:ACTIONS4.area_pulses.shape.interval.nullable(),radiusTier:ACTIONS4.area_pulses.shape.radiusTier.nullable()}).strict(),
  line_sequence:ACTIONS4.line_sequence.extend({repeatHits:ACTIONS4.line_sequence.shape.repeatHits.nullable()}).strict(),
};
export const zAction5:any=z.lazy(()=>z.discriminatedUnion('op',Object.values(ACTIONS5) as any));
const slot=zIR4.shape.slots.shape.PASSIVE.omit({windup:true}).extend({castTiming:zCastTiming,actions:z.array(zAction5).max(16)}).strict();
export const zIR5=zIR4.extend({schema:z.literal('hero-semantic-ir@5'),slots:z.object(Object.fromEntries(SLOTS.map(s=>[s,slot]))).strict()}).strict();
const zPreview=z.object({windupSeconds:z.number().finite().min(1/30).max(10),shieldDuration:z.number().finite().min(1/30).max(60),
  shieldStacking:z.enum(['keep_larger','replace']),areaInterval:z.number().finite().min(1/30).max(60),
  areaRadiusTier:z.enum(['極小','小','中','大','極大']),lineRepeatHits:z.enum(['per_segment','once_per_cast'])}).strict();
export const IR5_PREVIEW=Object.freeze({windupSeconds:0.3,shieldDuration:3,shieldStacking:'replace',areaInterval:0.4,areaRadiusTier:'小',lineRepeatHits:'once_per_cast'});
export function resolveIR5(input:unknown,source:any,preview:any=IR5_PREVIEW){
  let count=0;const bound=(v:any,depth=0)=>{assert(++count<=10000&&depth<=24,'IR_SIZE_DEPTH');
    if(v&&typeof v==='object')for(const c of Object.values(v))bound(c,depth+1);};bound(input);
  const ir5=zIR5.parse(input),p=zPreview.parse(preview),proposals:any[]=[],unresolvedChoices:any[]=[];
  const supplement=(source.supplements??source.sources?.filter((s:any)=>s.id!=='hero-original')??[]).map((s:any)=>s.text).join('\n');
  const proposal=(location:string,field:string,value:any,classificationChoice=false)=>{
    const item={location,field,value,basis:'script-preview-not-source',requiresTuning:true,sourceValueSpecified:false};
    proposals.push(item);if(classificationChoice)unresolvedChoices.push({...item,uniqueSourceLabel:false});return value;
  };
  const ir4={...ir5,schema:'hero-semantic-ir@4',slots:Object.fromEntries(SLOTS.map(s=>{
    const value=ir5.slots[s],{castTiming,...rest}=value,t=castTiming;
    if(s==='PASSIVE')assert(t.requirement==='not_specified'&&t.seconds===null&&t.evidence===null,'PASSIVE_CAST_TIMING');
    const original=source.slots.find((x:any)=>x.slot===s)?.originalText;assert(typeof original==='string','MISSING_SOURCE_SLOT');
    let windup:number|null=null;
    if(t.requirement==='not_specified')assert(t.seconds===null&&t.evidence===null,'UNSPECIFIED_TIMING_HAS_FACTS');
    else{
      assert(t.evidence!==null&&(original+'\n'+supplement).includes(t.evidence),'UNANCHORED_CAST_TIMING');
      if(t.requirement==='none'){assert(t.seconds===null||t.seconds===0,'NO_WINDUP_CONTRADICTION');windup=0;}
      else{assert(t.seconds===null||t.seconds>=1/30,'REQUIRED_WINDUP_CANNOT_BE_ZERO');
        windup=t.seconds??proposal(`${s}.castTiming`,'seconds',p.windupSeconds);}
    }
    const actions=value.actions.map((originalAction:any,i:number)=>{
      const a=structuredClone(originalAction),loc=`${s}.${i}`;
      if(a.op==='shield_self'){
        if(a.duration===null)a.duration=proposal(loc,'duration',p.shieldDuration);
        if(a.stacking===null)a.stacking=proposal(loc,'stacking',p.shieldStacking,true);
      }
      if(a.op==='area_pulses'){
        if(a.interval===null)a.interval=proposal(loc,'interval',p.areaInterval);
        if(a.radiusTier===null)a.radiusTier=proposal(loc,'radiusTier',p.areaRadiusTier);
      }
      if(a.op==='line_sequence'&&a.repeatHits===null)a.repeatHits=proposal(loc,'repeatHits',p.lineRepeatHits,true);
      return a;
    });
    return[s,{...rest,windup,actions}];
  }))};
  const checked=validateIR4(ir4,source);
  return {...checked,ir5,ir4,previewProposals:proposals,unresolvedSourceChoices:unresolvedChoices,
    sourceEntailmentVerified:false,automaticAccept:false,releaseQualified:false};
}
export const validateIR5=resolveIR5;
export function compileIR5(input:unknown,source:any,catalog:any,preview:any=IR5_PREVIEW){
  const resolved=resolveIR5(input,source,preview),built=compileIR4(resolved.ir4,source,catalog);
  return {...built,ir5:resolved.ir5,previewProposals:[...resolved.previewProposals,...built.lowered.proposals],
    unresolvedSourceChoices:resolved.unresolvedSourceChoices,sourceEntailmentVerified:false,automaticAccept:false,releaseQualified:false};
}
