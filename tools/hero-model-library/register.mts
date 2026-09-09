/** Apply validated library choices, preserving existing bytes, versions and manual overrides. */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';
import { writeDocAtomic, rebuildAllIndexes } from '../../packages/shared/src/content/node';
import { zModelVersionCommand } from '../../packages/shared/src/content/schema/championModelVersions';
const {values}=parseArgs({options:{release:{type:'string'},content:{type:'string'},report:{type:'string'}}});
if(!values.release||!values.content||!values.report)throw Error('--release, --content and --report required');
const release=resolve(values.release),root=resolve(values.content),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read(join(release,'manifest.json'));
if(manifest.schema!=='ggd-hero-model-library@1')throw Error('Unknown release manifest');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const within=(base:string,p:string)=>{const file=resolve(base,p);if(!file.startsWith(base+sep))throw Error('Escaping path');return file;};
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
   const state=service.state(hero.id);
   if(state.versions.some(v=>v.sourceModelKey===option.sourceModelKey&&v.source.tier===option.source.tier)){continue;}
   const command=zModelVersionCommand.parse({action:'register',expectedHash:state.expectedHash,sourceModelKey:option.sourceModelKey,label:option.label,source:option.source});
   const prepared=await service.prepare(hero.id,command);service.assertCurrent(hero.id,state.expectedHash);service.writeArtifacts(prepared.artifacts);
   writeDocAtomic(root,'champions',prepared.champion);result.registered.push(option.sourceId);
  }
  result.state=service.state(hero.id);result.status='registered';
 }catch(error){result.status='failed';result.error=String(error);}
 writeFileSync(values.report,JSON.stringify(report,null,2)+'\n');
}
rebuildAllIndexes(root);
writeFileSync(values.report,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({registered:report.heroes.filter((r:any)=>r.status==='registered').length,absent:report.heroes.filter((r:any)=>r.status==='hero-not-in-target-catalog').length,failed:report.heroes.filter((r:any)=>r.status==='failed').length}));
if(report.heroes.some((r:any)=>r.status==='failed'))process.exitCode=1;
