import fs from 'node:fs';
import path from 'node:path';
import { zAbilityDoc } from '../../../packages/shared/src/content/schema/ability.ts';
import { zChampionDoc } from '../../../packages/shared/src/content/schema/champion.ts';
import { readStarterRoster } from '../../../packages/shared/testkit/starterRoster.ts';
const repo=process.cwd();
const roster=new Set(readStarterRoster(repo));const heroes=[];
for (const filename of fs.readdirSync(path.join(repo,'content/champions')).filter(x=>x.endsWith('.json')).sort()) {
 const file=path.join(repo,'content/champions',filename);const d=JSON.parse(fs.readFileSync(file,'utf8'));if(typeof d.id!=='string'||!d.name)continue;
 const refs={...(d.abilities??{}),...(d.exAbility?{EX:d.exAbility}:{}),...(d.passiveAbility?{PASSIVE:d.passiveAbility}:{})};const checks=[];
 for(const slot of new Set(['Q','W','E','R',...Object.keys(refs)])) {
  const ref=refs[slot];const id=typeof ref==='string'?ref:ref?.id;const f=id?path.join(repo,'content/abilities',`${id}.json`):null;let parsed=null;let errors=[];
  if(f&&fs.existsSync(f)){try{parsed=JSON.parse(fs.readFileSync(f,'utf8'));const validation=zAbilityDoc.safeParse(parsed);if(!validation.success)errors=validation.error.issues.map(i=>({path:i.path,message:i.message}));}catch(e){errors=[{message:String(e)}]}}
  checks.push({slot,id:id??null,path:f,exists:!!f&&fs.existsSync(f),idMatches:parsed?.id===id&&!!id,schemaValid:!!parsed&&!errors.length,errors,hasEffects:!!parsed?.effects?.length,hasTemplate:!!parsed?.template?.ref});
 }
 const champ=zChampionDoc.safeParse(d);heroes.push({id:d.id,name:d.name,path:file,inStarterRoster:roster.has(d.id),championSchemaValid:champ.success,championSchemaErrors:champ.success?[]:champ.error.issues.map(i=>({path:i.path,message:i.message})),abilityChecks:checks,validAbilityRefs:checks.every(c=>c.exists&&c.idMatches&&c.schemaValid)});
}
fs.writeFileSync((process.argv[2] ?? '/private/tmp/ggd-undesigned-hero-ability-checks.json'),JSON.stringify({heroes},null,2)+'\n');console.log(JSON.stringify({heroes:heroes.length,withValidRefs:heroes.filter(x=>x.validAbilityRefs).length,invalidRefs:heroes.filter(x=>!x.validAbilityRefs).map(x=>x.id),invalidChampionSchemas:heroes.filter(x=>!x.championSchemaValid).map(x=>x.id)}));
