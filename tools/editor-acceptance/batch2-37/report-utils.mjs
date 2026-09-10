// Display actual actor/step chains, including defensive event and passive links.
export function comboLabel(c){
 const source=c.sourceSteps??[{kind:'cast',slot:c.source,actor:c.sourceActor??'caster'}];
 const target=c.targetSteps??[{kind:c.target==='ATTACK'?'attack':'cast',slot:c.target,actor:c.targetActor??'caster'}];
 const steps=c.steps??[...source,...target];
 const chain=steps.filter(s=>s.kind!=='wait').map(s=>`${s.actor??'caster'}.${s.slot??s.kind}`).join(' → ');
 return chain+(c.note?`（${c.note}）`:'');
}
