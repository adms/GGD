// Only this allowlist may be supplied to an evaluated model. Never copy data/.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const build=read('report.json'),identities=JSON.parse(readFileSync(resolve(root,'tools/editor-acceptance/batch2-37/identity-sources.json'),'utf8'));
const bodies=read('public/catalog.json').availableOriginalBodies??[];
for(const body of bodies)assert(/^assets\/[a-f0-9]{64}\.glb$/.test(body.publicBytes),'UNSAFE_PUBLIC_BODY_PATH');
const publicFiles=['catalog.json',...roster.map(h=>`prompts/${h.id}.json`),...bodies.map(x=>x.publicBytes)];
const promptKeys=new Set(['id','name','work','theme','origin','task','evaluation','outputSchema','appearancePolicy','requirements','catalog']);
const groups=roster.map(h=>{
 const identity=identities.heroes.find(x=>x.id===h.id);assert(identity,'MISSING_IDENTITY');
 const prompt=read(`public/prompts/${h.id}.json`);
 assert(Object.keys(prompt).every(k=>promptKeys.has(k)),`TEACHER_FIELD_IN_PUBLIC:${h.id}`);
 assert(!Object.values(prompt).some(v=>typeof v==='string'&&/private\/(teachers|compiled|evidence)/.test(v)),'PRIVATE_REFERENCE');
 return {groupId:h.id,partition:'external-evaluation-only',trainEligible:false,aliases:[...new Set([h.id,h.name,identity.canonicalName])],
  aliasScope:'Known identity spellings only; not a complete historical alias census.',
  sameGroupRequired:['all-six-slots','paraphrases','counterpart-forms','teacher-answers','future-aliases'],
  publicPrompt:`public/prompts/${h.id}.json`,privateTeacher:`private/teachers/${h.id}.project.json`,privateCompiled:`private/compiled/${h.id}.json`};
});
const result={schema:'ggd-batch2-partition@2',buildHash:hash(build),partition:'external-evaluation-only',trainEligible:false,groups,
 publicFiles:publicFiles.map(path=>({path,sha256:hash(readFileSync(resolve(dir,'public',path)))})),
 isolation:'allowlisted-model-input-export',historicalTrainingExposure:'not-certified',blindAdmission:false,
 restrictions:['Do not mount this repository or the private directory into the evaluated model workspace.','Do not select models or prompts on this batch and then label it blind testing.','No training data or model weights are modified.','Existing exposure-report.json is a historical partial snapshot, not a fresh training-manifest attestation.','Equivalent legal designs are valid; exact teacher skill names and card order are not the scoring key.']};
writeFileSync(resolve(dir,'partition-report.json'),JSON.stringify(result,null,2)+'\n');
const outArg=process.argv.find(x=>x.startsWith('--export='));
if(outArg){
 const out=resolve(outArg.slice('--export='.length));assert(!existsSync(out),'EXPORT_DESTINATION_MUST_BE_NEW');
 for(const file of publicFiles){const dst=resolve(out,file);mkdirSync(dirname(dst),{recursive:true});copyFileSync(resolve(dir,'public',file),dst);}
 writeFileSync(resolve(out,'INPUT-ONLY.json'),JSON.stringify({schema:'ggd-batch2-model-input-only@1',partition:result.partition,trainEligible:false,publicFiles:result.publicFiles,rules:result.restrictions},null,2)+'\n');
}
console.log(JSON.stringify({groups:groups.length,publicFiles:publicFiles.length,trainEligible:false,blindAdmission:false,exported:!!outArg}));
