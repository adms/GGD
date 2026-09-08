/** Read a pinned independent main checkout; never mutate its content. */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
async function main(){
 const [repoArg,outArg]=process.argv.slice(2);if(!repoArg||!outArg)throw Error('usage: main-template-inventory.ts PINNED_MAIN NEW_OUTPUT');
 const repo=path.resolve(repoArg),out=path.resolve(outArg);if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(revision!=='4793eaaaf2775b2081f5eca5881db32e0aab0ea8')throw Error('UNREVIEWED_REVISION');
 const load=(name:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src/content',name)).href);
 const {zTemplateDoc}=await load('schema/template.ts'),{defaultParamsFor}=await load('templates/paramsSchema.ts'),{expand}=await load('templates/expand.ts');
 const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
 const docs=fs.readdirSync(path.join(repo,'content/ability-templates')).filter(n=>n.endsWith('.json')&&n!=='_index.json').sort();
 const rows=docs.map(n=>{const rel='content/ability-templates/'+n,raw=fs.readFileSync(path.join(repo,rel),'utf8');const doc=zTemplateDoc.parse(JSON.parse(raw));let defaults,expansion,error;
  if(doc.status==='enabled')try{defaults=defaultParamsFor(doc);expansion=expand(doc,defaults);}catch(e){error=String(e);}
  return{id:doc.id,family:doc.family,status:doc.status,sourcePath:rel,sha256:sha(raw),doc,defaults,expansion,error:error??null,reviewStatus:'pending-personal-effective-behavior-review',trainingEligible:false};
 });
 const contract=JSON.parse(fs.readFileSync(path.join(repo,'docs/editor-contract/ggd-bricks.json'),'utf8'));
 const result={revision,repository:'adms/GGD',createdAt:new Date().toISOString(),checkout:repo,counts:{total:rows.length,enabled:rows.filter(r=>r.status==='enabled').length,defaultExpansionPassed:rows.filter(r=>r.expansion&&!r.error).length,errors:rows.filter(r=>r.error).length},sourcePins:['packages/shared/src/content/templates/expand.ts','packages/shared/src/content/templates/paramsSchema.ts','packages/shared/src/content/schema/template.ts','docs/editor-contract/ggd-bricks.json'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(repo,p)))})),rows,contract,scope:'current main default expansion plus raw params; not full runtime or semantic approval'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({revision,counts:result.counts,out,errors:rows.filter(r=>r.error).map(r=>({id:r.id,error:r.error}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
