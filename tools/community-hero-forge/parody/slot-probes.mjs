import {runSequence,hash} from './sim-harness.mjs';
const cast=(slot,extra={})=>({kind:'cast',slot,waitSec:.8,...extra});
const breakShield=[cast('W',{waitSec:.2}),...Array.from({length:5},()=>cast('Q',{actor:'foe',target:'caster',waitSec:.2}))];
const prerequisites={
 '05':{W:[cast('Q')],E:[cast('W')]},
 '06':{W:[cast('Q')],EX:[cast('Q')]},
 '07':{W:[cast('Q')]},'14':{W:[cast('Q')]},
 '10':{R:[cast('W')]},
 '11':{Q:[cast('E',{actor:'foe',target:'caster'})],E:[cast('W',{actor:'foe',target:'caster'})],R:[cast('W',{actor:'foe',target:'caster'}),cast('E',{actor:'foe',target:'caster'})]},
 '12':{EX:breakShield},'16':{EX:[cast('W')]},'17':{EX:[cast('W',{waitSec:.3})]},
 '25':{EX:[cast('W')]},'33':{EX:[cast('E')]},
};
// Compare gameplay state at every matched tick. Text/VFX/animation differences are excluded.
const state=s=>Object.fromEntries(Object.entries(s).map(([a,v])=>[a,{hp:v.hp,mana:v.mana,x:v.x,z:v.z,alive:v.alive,shield:v.shield,statuses:v.statuses,stats:v.stats,summons:v.summons,form:v.inAlternateForm}]));
export function probeSlots(number,draft,options){
 return ['Q','W','E','R','EX'].map(slot=>{
  const prefix=prerequisites[number]?.[slot]??[];
  const a=draft.abilityDrafts[slot],steps=[...prefix,cast(slot,{waitSec:Math.max(3.5,(a.castTimeSec??0)+2)})];
  const disabled=structuredClone(draft);
  // Keep the cast, payment and timing, replacing only the active payload in a test copy.
  disabled.abilityDrafts[slot].effects=[{kind:'floatingText',shape:'single',text:'evaluation control',applyTo:'self'}];
  if(['Q','W','E','R'].includes(slot))disabled.champion.abilities[slot]=disabled.abilityDrafts[slot];
  const normal=runSequence(draft,{...options,setup:{caster:{hpPct:.4,manaPct:.4},foe:{hpPct:1},ally:{hpPct:.4}},steps});
  const control=runSequence(disabled,{...options,setup:{caster:{hpPct:.4,manaPct:.4},foe:{hpPct:1},ally:{hpPct:.4}},steps});
  const index=prefix.length,start=normal.steps[index].startTick;
  const normalFrames=normal.frames.filter(f=>f.tick>start),controlFrames=control.frames.filter(f=>f.tick>start);
  const differences=normalFrames.filter((f,i)=>hash(state(f.actors))!==hash(state(controlFrames[i].actors))).map(f=>f.tick);
  const sourceAccepted=normal.steps.every(s=>s.step.kind!=='cast'||s.accepted);
  const controlAccepted=control.steps.every(s=>s.step.kind!=='cast'||s.accepted);
  return {slot,status:sourceAccepted&&controlAccepted&&differences.length?'passed':'failed',sourceAccepted,controlAccepted,differingTicks:differences.length,firstDifferentTick:differences[0]??null,preparation:prefix,normal,control};
 });
}
