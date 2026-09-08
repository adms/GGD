/** Explicit source reannotation for IR5; old recipes and raw answers stay unchanged. */
import {wholePlan} from './whole-plan-seeds-v1.mts';
import {SLOTS} from './intake.mjs';
export function wholePlan5(id:string){
  const f=wholePlan(id),ir=structuredClone(f.ir);ir.schema='hero-semantic-ir@5';
  for(const s of SLOTS){delete ir.slots[s].windup;ir.slots[s].castTiming={requirement:'not_specified',seconds:null,evidence:null};ir.slots[s].tuningNotes=[];}
  if(id==='community7-lux'){
    ir.slots.E.actions[0].radiusTier=null;
    ir.slots.E.actions[0].firstDelay=null; // Interval=1s remains source-specified; preview starts after one interval.
  }else{
    ir.slots.Q.castTiming={requirement:'required',seconds:null,evidence:'吟唱後向前產生四段奧術打擊'};
    ir.slots.Q.actions[0].repeatHits=null;
    Object.assign(ir.slots.R.actions[0],{interval:null,firstDelay:null,radiusTier:null});
    Object.assign(ir.slots.EX.actions[0],{duration:null,stacking:null});
  }
  return {...f,ir,choices:[],priorCandidate:'whole-plan-seeds-v1.mts',
    reannotation:'Source-required windup selector stays explicit; unknown preview values are null. No model output was repaired.',
    trainingAdmitted:false,completeExecutableGold:false};
}
export const WHOLE_PLANS5=['community7-lux','community7-xerath'].map(wholePlan5);
