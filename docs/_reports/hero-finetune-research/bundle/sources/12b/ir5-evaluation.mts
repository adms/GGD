/** Fixed engineering facets; never equate bounded checks with full source fidelity. */
import {normalizeFinal} from './normalize.mjs';
import {resolveIR5,compileIR5} from './ir-v5.mts';
import {contrastHero} from './contrast-heroes-v1.mts';
import {wholePlan5} from './whole-plan-seeds-v2.mts';
import {contrastProbes} from './contrast-probes-v1.mts';
import {wholePlanProbes5} from './whole-plan-probes-ir5.mts';
import {wholePlanPolicyProbes} from './whole-plan-policy-probes.mts';
import {SLOTS} from './intake.mjs';
export function engineeringControl(id:string):any{
  if(id.startsWith('community7-'))return wholePlan5(id);
  const m=/^synthetic-spatial-([1-6])-(required|none)$/.exec(id);if(!m)throw new Error('UNKNOWN_CONTROL');
  return contrastHero(Number(m[1])-1,m[2] as 'required'|'none');
}
export function sourceFacets(actual:any,expected:any){
  const rows:any[]=[];const check=(path:string,a:any,e:any)=>rows.push({path,expected:e,actual:a??null,passed:JSON.stringify(a)===JSON.stringify(e)});
  const known=(a:any,e:any,path:string)=>{
    if(e===null)return; // Unknown previews are not uniquely source-specified answers.
    if(Array.isArray(e)){check(path+'.length',Array.isArray(a)?a.length:null,e.length);e.forEach((v,i)=>known(a?.[i],v,`${path}.${i}`));}
    else if(typeof e==='object'){for(const [k,v] of Object.entries(e))if(k!=='evidence')known(a?.[k],v,`${path}.${k}`);}
    else check(path,a,e);
  };
  check('hero.origin',actual?.hero?.origin,expected.hero.origin);check('relations.length',actual?.relations?.length,expected.relations.length);
  for(const s of SLOTS){const a=actual?.slots?.[s],e=expected.slots[s];
    check(`${s}.delivery`,a?.delivery,e.delivery);if(e.rangeTier!==null)check(`${s}.rangeTier`,a?.rangeTier,e.rangeTier);
    check(`${s}.castTiming.requirement`,a?.castTiming?.requirement,e.castTiming.requirement);
    known(a?.actions,e.actions,`${s}.actions`);check(`${s}.mechanismGaps.length`,a?.mechanismGaps?.length,e.mechanismGaps.length);
    check(`${s}.cost`,a?.cost,e.cost);
  }
  return {passed:rows.filter(r=>r.passed).length,total:rows.length,rows,identityProseAndFullSourceEntailmentNotGraded:true};
}
export function evaluateIR5Output(request:any,result:any,catalog:any){
  const f=engineeringControl(request.id),input=JSON.parse(request.messages[1].content);
  const source={id:request.id,hero:input.source,slots:input.slots,sources:input.sources};
  const n=normalizeFinal(result.envelope),row:any={id:request.id,synthetic:f.synthetic===true,jsonValid:n.ok,irValid:false,compiled:false,
    automaticallyAccepted:false,fullHeroQualified:false,sourceEntailmentVerified:false};
  let artifact:any=null;
  if(!n.ok)row.error=n.error;else{
    row.sourceFacets=sourceFacets(n.value,f.ir);
    try{const v=resolveIR5(n.value,source);row.irValid=true;row.gaps=v.gaps;}catch(e){row.irError=String(e);}
    if(row.irValid)try{
      const built=compileIR5(n.value,source,catalog);row.compiled=true;
      const behavior=f.synthetic?contrastProbes(built.compiled,f,catalog):wholePlanProbes5(built.compiled,f.id,catalog);
      const policy=wholePlanPolicyProbes(built.compiled,catalog);
      const summary=(p:any)=>({passed:p.passed,total:p.total,failures:p.rows.filter((r:any)=>!r.passed).map((r:any)=>({name:r.name,error:r.error}))});
      row.behavior=summary(behavior);row.policy=summary(policy);
      artifact={id:request.id,...built,behavior,policy};
    }catch(e){row.compilerOrHarnessError=String(e);}
  }
  row.allPredeclaredEngineeringChecksPassed=Boolean(row.irValid&&row.compiled&&row.gaps.length===0&&row.sourceFacets.passed===row.sourceFacets.total&&
    !row.compilerOrHarnessError&&row.behavior?.total>0&&row.policy?.total>0&&row.behavior.passed===row.behavior.total&&row.policy.passed===row.policy.total);
  return {row,artifact};
}
