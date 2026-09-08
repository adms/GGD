import {isDeepStrictEqual as equal} from 'node:util';
// Independent assertions read the immutable requirement specification, never
// the generated target JSON. This is a synthetic oracle, not a human oracle.
export function score(c,value){
 const errors=[];const fail=e=>errors.push(e);const s=c.spec;
 if(!value||typeof value!=='object'||Array.isArray(value))return{pass:false,critical:true,errors:['not-object']};
 if(!equal(Object.keys(value).sort(),['outcome','templateId','params','vfxLayers','missing','fallbackId'].sort()))fail('root-fields');
 if(value.outcome!==s.outcome)fail('decision');
 const usable=s.outcome==='proposed'||s.outcome==='degraded';
 if(!usable){
  if(value.templateId!==null||value.params!==null||!equal(value.vfxLayers,[])||value.fallbackId!==null)fail('unsafe-proposal');
  if(!equal(value.missing,s.outcome==='advice'?[s.condition]:[]))fail('missing-fields');
 }else{
  if(value.templateId!=='tpl-ground-nova')fail('template');
  const p=value.params;
  if(!p||!equal(Object.keys(p).sort(),['damage','damageType','radius']))fail('param-fields');
  if(p?.radius!==s.radius)fail('radius');
  if(p?.damage!==s.damage)fail('damage');
  if(p?.damageType!==s.damageType)fail('damage-type');
  if(!equal(value.missing,[]))fail('spurious-missing');
  if(value.fallbackId!==(s.outcome==='degraded'?'cast-nova':null))fail('fallback-authorization');
  if(!Array.isArray(value.vfxLayers)||value.vfxLayers.length!==1)fail('layer-count');
  else{
   const layer=value.vfxLayers[0];
   if(!layer||layer.vfxKey!==s.vfxKey||layer.attachTo!==s.attachTo)fail('layer-reference');
   if(!layer||!equal(Object.keys(layer).sort(),['vfxKey','attachTo',...Object.keys(s.overrides)].sort()))fail('unsolicited-override');
   for(const [key,v] of Object.entries(s.overrides))if(layer?.[key]!==v)fail('override-'+key);
  }
 }
 return{pass:errors.length===0,critical:errors.some(e=>['unsafe-proposal','template','radius','damage','damage-type','fallback-authorization'].includes(e))||(!usable&&errors.includes('decision')),errors};
}

export function scorerChecks(cases){
 let positives=0,mutations=0;const failed=[];
 for(const c of cases){if(score(c,c.target).pass)positives++;else failed.push(c.id+':positive');}
 for(const c of cases.filter(x=>x.spec.outcome==='proposed').slice(0,4)){
  for(const change of [x=>{x.params.damage+=1;},x=>{x.params.radius+=1;},x=>{x.outcome='refused';},x=>{x.vfxLayers[0].tint=[1,2,3];},x=>{x.fallbackId='cast-nova';}]){const v=structuredClone(c.target);change(v);if(score(c,v).pass)failed.push(c.id+':mutation');else mutations++;}
 }
 const r=cases.find(x=>x.spec.outcome==='refused');if(score(r,cases[0].target).pass)failed.push('unauthorized');else mutations++;
 return{status:failed.length?'fail':'pass',positives,mutations,failed,oracle:'independent-code-over-synthetic-spec; human anchors absent'};
}
