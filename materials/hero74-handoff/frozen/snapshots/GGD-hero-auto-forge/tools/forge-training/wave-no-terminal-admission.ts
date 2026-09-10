/** Authoring-parameter equivalence to the preserved real SimWorld no-terminal arm. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';
async function main(){
 const[repo,probePath,out]=process.argv.slice(2);assert([repo,probePath,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const probe=JSON.parse(fs.readFileSync(probePath,'utf8')),revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,probe.revision);
 for(const p of probe.pins)assert.equal(hash(path.join(repo,p.path)),p.sha256,'RUNTIME_SOURCE_CHANGED');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);const{zTemplateDoc}=await load('content/schema/template.ts'),{zAbilityDoc}=await load('content/schema/ability.ts'),{paramsSchemaFor}=await load('content/templates/paramsSchema.ts'),{expand,mergeExpansion}=await load('content/templates/expand.ts');
 const tpl=zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates/tpl-traveling-wave.json'),'utf8'))),rows=[];
 for(const c of probe.cases){
  const arm=c.arms.find((a:any)=>a.kind==='tpl-traveling-wave'&&a.mutation==='no-terminal');assert(arm);const params=structuredClone(arm.params);delete params.terminalBurst;paramsSchemaFor(tpl).parse(params);
  const expansion=expand(tpl,params);assert(!('finalEffects'in expansion.effects[0]));const a=arm.authored;
  const authored=zAbilityDoc.parse(mergeExpansion({schema:'ability@1',id:a.id,name:a.name,slot:'Q',maxRank:1,cooldown:[0],manaCost:[0],range:20},expansion)),expected=structuredClone(a);delete expected.effects[0].finalEffects;
  assert.deepEqual(authored,expected,'OMITTED_PARAM_NOT_EQUIVALENT_TO_SIMULATED_ARM');
  assert(arm.measured.every((m:any)=>m.events.length===1),'NO_TERMINAL_ARM_NOT_ONE_HIT');
  rows.push({seed:c.seed,scenario:c.scenario,params,authored,completeAuthoredAbilityExactAfterTerminalRemoval:true,measuredTargets:arm.measured.map((m:any)=>({label:m.label,hits:m.events.length})),originalRuntimeEvidence:probePath});
 }
 const report={createdAt:new Date().toISOString(),revision,scriptSha256:hash(process.argv[1]),probeSha256:hash(probePath),newRuntimeSimulation:false,completeAuthoringEquivalence:true,rows,admitted:'Omit terminalBurst explicitly; do not inherit its default. Existing no-terminal SimWorld measurements apply to the exact same authored ability.',notAdmitted:'An independent complete final explosion from traveling-wave. Source bug and frozen scores remain unchanged.',productionChanged:false,trainingChanged:false};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,rows:rows.length,completeAuthoringEquivalence:true,newRuntimeSimulation:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
