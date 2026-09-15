import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=process.cwd();
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
// Pin before loading repository code or parsing content. Resolver/schema imports
// reach the effect registry, so the shared source tree is a deliberate superset.
const inputScopes=[
 ...['content/ability-templates','content/abilities','content/champions'].map(path=>({path,recursive:false,extensions:['.json'],excludeUnderscore:true})),
 {path:'packages/shared/src',recursive:true,extensions:['.ts','.mts','.json'],excludeUnderscore:false},
];
const inputExtraFiles=['package.json','pnpm-lock.yaml',relative(repo,fileURLToPath(import.meta.url))];
const filesInScope=(scope:typeof inputScopes[number],dir=scope.path):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const path=dir+'/'+entry.name;
 if(entry.isDirectory())return scope.recursive?filesInScope(scope,path):[];
 return entry.isFile()&&(!scope.excludeUnderscore||!entry.name.startsWith('_'))&&scope.extensions.some(ext=>entry.name.endsWith(ext))?[path]:[];
});
const currentInputPaths=()=>[...new Set([...inputScopes.flatMap(scope=>filesInScope(scope)),...inputExtraFiles])].sort();
const inputFiles=currentInputPaths().map(path=>{const bytes=readFileSync(path);return{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
const assertInputSnapshot=(stage:string)=>{
 const changed=inputFiles.filter(pin=>!existsSync(pin.path)||hash(pin.path)!==pin.sha256).map(pin=>pin.path);
 if(JSON.stringify(currentInputPaths())!==JSON.stringify(inputFiles.map(pin=>pin.path)))changed.push('(input file membership changed)');
 if(changed.length)throw Error('Analysis inputs changed '+stage+'; rerun analysis: '+changed.slice(0,12).join(', '));
};
const {resolveTemplateExpansion}=await import(pathToFileURL(resolve(repo,'packages/shared/src/content/templates/resolve.ts')).href);
const {zChampionDoc}=await import(pathToFileURL(resolve(repo,'packages/shared/src/content/schema/champion.ts')).href);
const {zAbilityDoc}=await import(pathToFileURL(resolve(repo,'packages/shared/src/content/schema/ability.ts')).href);
const {REFERENCES}=await import(pathToFileURL(resolve(repo,'packages/shared/src/content/refs.ts')).href);
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const templates=new Map(readdirSync('content/ability-templates').filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>{const d=load('content/ability-templates/'+f);return[d.id,d]}));
const rows=[];
for(const file of readdirSync('content/abilities').filter(f=>f.endsWith('.json')&&!f.startsWith('_')).sort()){
 const path='content/abilities/'+file,raw=load(path);let expanded=raw;let expansion:any={required:false,ok:true,refs:[]};
 if(raw.template){const r=resolveTemplateExpansion(raw,templates);expansion={required:true,ok:r.ok,refs:r.ok?r.refs:r.failure.refs,...(!r.ok?{failure:r.failure}:{})};if(r.ok)expanded=r.merged;}
 const schema=zAbilityDoc.safeParse(expanded);
 const effects:{path:string,kind:string}[]=[];const hooks:any[]=[];const modifiers:any[]=[];const marks:any[]=[];const augments:any[]=[];
 const walk=(v:any,path:string)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path+'.'+i));return;}if(typeof v.kind==='string')effects.push({path,kind:v.kind});if(typeof v.on==='string')hooks.push({path,event:v.on});if(typeof v.stat==='string'&&typeof v.op==='string')modifiers.push({path,stat:v.stat,op:v.op,...('value'in v?{value:v.value}:{})});if(v.markId)marks.push({path,markId:v.markId,initial:v.initial,max:v.max,hasLethalResponse:!!v.lethal});if(v.abilityId&&v.ops)augments.push({path,abilityId:v.abilityId,opCount:v.ops.length});for(const [k,x]of Object.entries(v))walk(x,path?path+'.'+k:k);};
 for(const field of ['effects','passive','marks','augment','toggle','innateActivePassive'])if(expanded[field])walk(expanded[field],field);
 const passivePayloads=(expanded.passive?.ranks??[]).flatMap((rank:any,i:number)=>Object.entries(rank).filter(([key,value])=>!['whileForm','whileStatus'].includes(key)&&value!==null&&value!==undefined&&(Array.isArray(value)?value.length>0:typeof value==='object'?Object.keys(value).length>0:true)).map(([key,value])=>({path:'passive.ranks.'+i+'.'+key,field:key,value})));
 const refs=(REFERENCES.abilities(expanded) as any[]).filter(x=>x.targetCollection==='abilities').map(x=>({...x,path:'content/abilities/'+x.targetId+'.json',exists:existsSync('content/abilities/'+x.targetId+'.json')}));
 const templateRefs=expansion.refs.map((id:string)=>({id,path:'content/ability-templates/'+id+'.json',exists:templates.has(id),status:templates.get(id)?.status}));
 rows.push({id:raw.id,path,sha256:hash(path),name:raw.name,slot:raw.slot,provenance:raw.provenance,description:raw.description??null,rawEffectsCount:raw.effects?.length??0,templateExpansion:expansion,templateRefs,schemaPass:schema.success,schemaErrors:schema.success?[]:schema.error.issues.map((x:any)=>({path:x.path,message:x.message})),actualMechanics:{kindNodesIncludeConditions:true,effectKinds:[...new Set(effects.map(x=>x.kind))].sort(),effectNodes:effects,hookEvents:hooks,statModifiers:modifiers,passivePayloads,marks,augmentTargets:augments,toggle:expanded.toggle??null,hasMechanicDefinition:effects.length>0||hooks.length>0||modifiers.length>0||marks.length>0||augments.length>0||passivePayloads.length>0||!!expanded.toggle},abilityRefs:refs});
}
const champions=readdirSync('content/champions').filter(f=>f.endsWith('.json')&&!f.startsWith('_')).sort().map(file=>{const path='content/champions/'+file,d=load(path),result=zChampionDoc.safeParse(d);return{id:d.id,path,sha256:hash(path),schemaPass:result.success,schemaErrors:result.success?[]:result.error.issues.map((x:any)=>({path:x.path,message:x.message}))};});
assertInputSnapshot('during Node analysis');
const out=process.argv[2];if(!out)throw Error('Output analysis JSON path required');writeFileSync(out,JSON.stringify({repo,inputFiles,inputScopes,inputExtraFiles,inputSnapshotVerified:true,templateCount:templates.size,abilities:rows,champions},null,2)+'\n');console.log(JSON.stringify({out,abilities:rows.length,expansionFailure:rows.filter(r=>!r.templateExpansion.ok).map(r=>r.id),schemaFailure:rows.filter(r=>!r.schemaPass).map(r=>r.id),empty:rows.filter(r=>!r.actualMechanics.hasMechanicDefinition).map(r=>r.id)}));
