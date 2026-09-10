import { defaultEligible } from './default-policy.mts';
import { contentSha256 } from '../../packages/shared/src/content/import/jcs';
import { spliceMembers } from "../../packages/shared/src/content/editModel";
/** Apply validated library choices, preserving existing bytes, versions and manual overrides. */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';
import { rebuildAllIndexes } from '../../packages/shared/src/content/node';
import { zModelVersionCommand, modelVersionAutomaticEligible } from '../../packages/shared/src/content/schema/championModelVersions';
const {values}=parseArgs({options:{release:{type:'string'},content:{type:'string'},report:{type:'string'}}});
if(!values.release||!values.content||!values.report)throw Error('--release, --content and --report required');
const release=resolve(values.release),root=resolve(values.content),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read(join(release,'manifest.json'));
if(manifest.schema!=='ggd-hero-model-library@1')throw Error('Unknown release manifest');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const within=(base:string,p:string)=>{const file=resolve(base,p);if(!file.startsWith(base+sep))throw Error('Escaping path');let ancestor=file;while(!existsSync(ancestor))ancestor=dirname(ancestor);const real=realpathSync(ancestor);if(real!==realpathSync(base)&&!real.startsWith(realpathSync(base)+sep))throw Error('Escaping symlink');return file;};
const copies=new Map<string,string>();
// Check every source and collision before importing any byte.
for(const model of manifest.models){
 for(const [rel,digest] of [[model.glbPath,model.sha256],[`models/${model.modelKey}.json`,model.documentSha256]]){
  const source=within(release,rel),dest=within(root,rel);
  if(sha(source)!==digest)throw Error('Release hash mismatch: '+rel);
  if(existsSync(dest)&&sha(dest)!==digest)throw Error('Existing file collision: '+rel);
  copies.set(dest,source);
 }
}
for(const [dest,source] of copies)if(!existsSync(dest)){mkdirSync(dirname(dest),{recursive:true});copyFileSync(source,dest);}
const service=new ModelVersions(root),report:any={schema:'ggd-model-library-registration@1',releaseSha256:sha(join(release,'manifest.json')),heroes:[],productionDeployed:false};
for(const hero of manifest.heroes){
 const result:any={id:hero.id,name:hero.name,registered:[],pending:hero.pending??[]};report.heroes.push(result);
 if(!existsSync(join(root,'champions',hero.id+'.json'))){result.status='hero-not-in-target-catalog';continue;}
 try{
  // Import lower tiers first; automatic mode still always chooses the highest available tier.
  for(const option of [...hero.options].reverse()){
   const automaticEligible=defaultEligible(hero.id,option);
   const state=service.state(hero.id);
   if(state.versions.some(v=>v.sourceModelKey===option.sourceModelKey&&v.label===option.label&&contentSha256(v.source)===contentSha256(option.source)&&modelVersionAutomaticEligible(v)===automaticEligible)){continue;}
   const command=zModelVersionCommand.parse({action:'register',expectedHash:state.expectedHash,sourceModelKey:option.sourceModelKey,label:option.label,source:option.source,automaticEligible});
   const prepared=await service.prepare(hero.id,command);service.assertCurrent(hero.id,state.expectedHash);service.writeArtifacts(prepared.artifacts);
   const file=join(root,'champions',hero.id+'.json'),before=readFileSync(file,'utf8');
   service.assertCurrent(hero.id,state.expectedHash);
   const after=spliceMembers(before,{modelKey:prepared.champion.modelKey,modelVersions:prepared.champion.modelVersions,modelSelectionMode:prepared.champion.modelSelectionMode});
   const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,after,{flag:'wx'});renameSync(temporary,file);
   result.registered.push(option.sourceId);
   if(!automaticEligible)(result.manualOnly??=[]).push(option.sourceId);
  }
  result.state=service.state(hero.id);result.status=result.registered.length?'registered':'unchanged';
 }catch(error){result.status='failed';result.error=String(error);}
 writeFileSync(values.report,JSON.stringify(report,null,2)+'\n');
}
rebuildAllIndexes(root);
writeFileSync(values.report,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({registered:report.heroes.filter((r:any)=>r.status==='registered').length,unchanged:report.heroes.filter((r:any)=>r.status==='unchanged').length,absent:report.heroes.filter((r:any)=>r.status==='hero-not-in-target-catalog').length,failed:report.heroes.filter((r:any)=>r.status==='failed').length}));
if(report.heroes.some((r:any)=>r.status==='failed'))process.exitCode=1;
