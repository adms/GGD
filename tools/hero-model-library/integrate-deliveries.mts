/** Register locally delivered choices through the same validator used by the backend. */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ModelVersions, ModelVersionError } from '../../apps/content-api/src/modelVersions';
import { contentSha256 } from '../../packages/shared/src/content/import/jcs';
import { spliceMembers } from '../../packages/shared/src/content/editModel';
import { zModelVersionCommand } from '../../packages/shared/src/content/schema/championModelVersions';
import { defaultEligible, selectionSource, compareSelection } from './default-policy.mts';

const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const dir=resolve('materials/hero-model-library'), root=resolve('content');
const base=read(dir+'/manifest.json'), workflow=read(dir+'/workflow-model-options.json');
const additions=existsSync(dir+'/priority-runtime-options.json')?read(dir+'/priority-runtime-options.json'):{heroes:[],models:[]};
const aliases=workflow.aliases, heroes=new Map<string,any>();
for(const manifest of [base,workflow,additions])for(const h of manifest.heroes){
  if(!/^(b2-|community-review-|example:)/.test(h.id))continue;
  const previous=heroes.get(h.id)??{id:h.id,runtimeHeroId:aliases[h.id]??h.id,options:[]};
  for(const o of h.options)if(!previous.options.some((x:any)=>contentSha256(x)===contentSha256(o)))previous.options.push(o);
  heroes.set(h.id,previous);
}
// Preflight bytes before changing any champion. A stale delivery cannot become a choice.
for(const manifest of [base,workflow,additions])for(const m of manifest.models){
  for(const [path,digest] of [[m.glbPath,m.sha256],['models/'+m.modelKey+'.json',m.documentSha256]]){
    if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==digest)throw Error('Delivery checksum mismatch: '+path);
  }
}
const service=new ModelVersions(root),report:any={schema:'ggd-priority-registration@1',productionDeployed:false,heroes:[]};
const reportPath=dir+'/priority-registration.json';
for(const h of heroes.values()){
  const result:any={heroId:h.id,runtimeHeroId:h.runtimeHeroId,registered:[],retained:[],failed:[]};report.heroes.push(result);
  if(!existsSync(root+'/champions/'+h.runtimeHeroId+'.json')){result.status='absent';continue;}
  const before=service.state(h.runtimeHeroId);result.before=before;
  for(const input of [...h.options].reverse().sort((a:any,b:any)=>compareSelection(h.id,b,a))){
    const option={...input,source:selectionSource(h.id,input)},automaticEligible=defaultEligible(h.id,option);
    try{
      const state=service.state(h.runtimeHeroId);
      // prepare computes a version key from current bytes AND complete appearance.
      // Matching only the mutable source key would silently discard a corrected delivery.
      const prepared=await service.prepare(h.runtimeHeroId,zModelVersionCommand.parse({action:'register',expectedHash:state.expectedHash,sourceModelKey:option.sourceModelKey,label:option.label,source:option.source,automaticEligible}));
      service.assertCurrent(h.runtimeHeroId,state.expectedHash);service.writeArtifacts(prepared.artifacts);
      const path=root+'/champions/'+h.runtimeHeroId+'.json',raw=readFileSync(path,'utf8');
      service.assertCurrent(h.runtimeHeroId,state.expectedHash);
      const tmp=path+'.'+randomUUID()+'.tmp';
      writeFileSync(tmp,spliceMembers(raw,{modelKey:prepared.champion.modelKey,modelVersions:prepared.champion.modelVersions,modelSelectionMode:prepared.champion.modelSelectionMode}),{flag:'wx'});renameSync(tmp,path);
      result.registered.push(option.sourceId);
    }catch(error){
      if(error instanceof ModelVersionError && error.statusCode===409 && error.message==='相同模型與動作設定已在此英雄的版本清單中，請直接選擇該版本。')result.retained.push(option.sourceId);
      else result.failed.push({sourceId:option.sourceId,error:String(error)});
    }
  }
  const after=service.state(h.runtimeHeroId);result.after=after;
  if(before.versions.some(v=>!after.versions.some(a=>contentSha256(v)===contentSha256(a))))throw Error('History lost: '+h.id);
  if(before.selectionMode==='manual'&&after.activeModelKey!==before.activeModelKey)throw Error('Manual selection changed: '+h.id);
  for(const version of after.versions)service.verify(version);
  result.status=result.failed.length?'partially-blocked':result.registered.length?'registered':'unchanged';
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({heroId:h.id,status:result.status,new:result.registered.length,versions:after.versions.length,failed:result.failed}));
}
if(report.heroes.some((h:any)=>h.failed.length||h.status==='absent'))process.exitCode=1;
