import { describe, expect, it } from 'vitest';
import { inspectDiversity } from './kit-diversity.mjs';
const hero=(id,token,extra={})=>({id,name:id,draft:{abilityDrafts:{
  Q:{castType:'targeted',effects:[{kind:'applyStatus',statusId:`${id}.${token}`,duration:2}]},
  W:{castType:'targeted',effects:[{kind:'consumeStatus',statusId:`${id}.${token}`,count:'all',onConsumed:[{kind:'damage',amount:{flat:100}}],...extra}]}
}}});
describe('cross-batch mechanical duplication diagnostics',()=>{
  it('renaming a private resource or hero does not create a new signature',()=>{
    const r=inspectDiversity([hero('one','breath'),hero('two','energy')]);
    expect(r.exactDuplicateKitPairs).toHaveLength(1); expect(r.signatureCreativityVerified).toBe(false);
  });
  it('different cosmetics and positive damage magnitudes remain the same kit',()=>{
    const a=hero('one','charge'),b=hero('two','stock');
    b.draft.abilityDrafts.W.effects[0].onConsumed[0].amount.flat=900;
    b.draft.abilityDrafts.W.effects.push({kind:'spawnVfx',vfxId:'funny-red'});
    expect(inspectDiversity([a,b]).exactDuplicateKitPairs).toHaveLength(1);
  });
  it('preserves actual target and ownership distinctions',()=>{
    expect(inspectDiversity([hero('one','x'),hero('two','x',{subject:'self',appliedBy:'self'})]).exactDuplicateKitPairs).toHaveLength(0);
  });
  it('a disconnected resource is not disguised as a connected chain',()=>{
    const b=hero('two','x'); b.draft.abilityDrafts.W.effects[0].statusId='two.other';
    expect(inspectDiversity([hero('one','x'),b]).exactDuplicateKitPairs).toHaveLength(0);
  });
});
