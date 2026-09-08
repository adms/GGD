/** Versioned IR2-style contract plus three source-reviewed native actions.
 * No old answer is repaired; original IR2/IR3 validators remain frozen.
 */
import assert from 'node:assert/strict';
import {z} from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import {ACTIONS,zAction} from './semantic-ir.mts';
import {zIR2,validateIR2} from './ir-v2.mts';
import {NATIVE_ACTIONS,lowerNativeAction} from './native-mechanism-actions.mts';
import {SLOTS} from './intake.mjs';
export const ACTIONS4={...ACTIONS,...Object.fromEntries(Object.entries(NATIVE_ACTIONS).map(([op,s])=>
  [op,s.extend({evidence:z.string().min(2).max(1000)}).strict()]))};
// Native extensions are top-level only. Existing child schemas still refer to
// the original 19 actions; a nested native action is rejected, never ignored.
export const zAction4:any=z.lazy(()=>z.discriminatedUnion('op',Object.values(ACTIONS4) as any));
const slot=zIR2.shape.slots.shape.PASSIVE.extend({actions:z.array(zAction4).max(16)}).strict();
export const zIR4=zIR2.extend({schema:z.literal('hero-semantic-ir@4'),
  slots:z.object(Object.fromEntries(SLOTS.map((s:string)=>[s,slot]))).strict()}).strict();
const INTERNAL='[internal: native-only slot checked separately; never an output gap]';
export function validateIR4(input:unknown,source:any){
  let nodes=0;
  const visit=(v:any,depth=0)=>{if(++nodes>10000||depth>24)throw new Error('IR_SIZE_DEPTH');
    if(v&&typeof v==='object')for(const child of Object.values(v))visit(child,depth+1);};
  visit(input);const ir=zIR4.parse(input),nativeLimitations:any[]=[];
  const supplement=(source.supplements??source.sources?.filter((s:any)=>s.id!=='hero-original')??[]).map((s:any)=>s.text).join('\n');
  // Reuse existing evidence/header/dependency checks over the legacy portion.
  // A native-only slot gets a private validation marker so the legacy checker
  // need not invent a legacy action. This view is NEVER lowered or compiled.
  const legacyView={...ir,schema:'hero-semantic-ir@2',slots:Object.fromEntries(SLOTS.map((s:string)=>{
    const value=ir.slots[s],legacy:any[]=[];
    assert(!value.mechanismGaps.includes(INTERNAL),'RESERVED_GAP');
    for(const [index,a] of value.actions.entries()){
      if(!Object.hasOwn(NATIVE_ACTIONS,a.op)){legacy.push(a);continue;}
      assert.notEqual(s,'PASSIVE','NATIVE_PASSIVE_NOT_SUPPORTED');
      const text=source.slots.find((x:any)=>x.slot===s)?.originalText;assert(typeof text==='string','MISSING_SOURCE_SLOT');
      assert((text+'\n'+supplement).includes(a.evidence),'UNANCHORED_NATIVE_EVIDENCE');
      const {evidence,...semantic}=a,result=lowerNativeAction(semantic,value.delivery,`${s}.${index}`);
      nativeLimitations.push({slot:s,index,op:a.op,limitations:result.limitations});
    }
    return [s,{...value,actions:legacy,mechanismGaps:!legacy.length&&value.actions.length
      ?[...value.mechanismGaps,INTERNAL]:value.mechanismGaps}];
  }))};
  const checked=validateIR2(legacyView,source),gaps=checked.gaps.filter(g=>g.reason!==INTERNAL);
  return {ir,gaps,nativeLimitations,completeMechanismClaim:gaps.length===0,
    semanticQualified:false,sourceEntailmentVerified:false,automaticAccept:false,releaseQualified:false};
}
export {zAction as zLegacyAction};
