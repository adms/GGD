import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { effectiveYawOffsetDeg } from '../../packages/shared/src/content/glbYaw';
import { createHash } from 'node:crypto';
import { inspectModelUpload } from '../../packages/shared/src/content/modelUpload/inspect';
import { prepareUploadedHeroModel, verifyUploadedHeroModel } from '../../packages/shared/src/content/modelUpload/heroModel';
import type { HeroModelSelections } from '../../packages/shared/src/content/modelUpload/heroModelSchema';
const {values}=parseArgs({options:{workspace:{type:'string'},out:{type:'string'}}});
if(!values.workspace||!values.out)throw Error('--workspace and --out required');
const ws=resolve(values.workspace),out=resolve(values.out);mkdirSync(out,{recursive:false});
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const pairs=read(join(ws,'GGD-Asset-Library/intake/batch2-37/visual-pairs.json')).characters;
const selected=new Map<string,any>();
for(const hero of pairs)for(const candidate of [hero.primary,...(hero.additional_components??[])])if(['cloud','bulbasaur','lux','tram'].includes(candidate.id))selected.set(candidate.id,candidate);
const results:any[]=[];
for(const [key,candidate] of selected){
 const d=join(out,key);mkdirSync(d);const result:any={characterId:'existing:'+key,sourceCharacter:candidate.name,sourceWork:candidate.origin??'GGD',directory:d,stage:'validation'};results.push(result);
 try{
  const path=candidate.model.path,originalBytes=new Uint8Array(readFileSync(path));
  let bytes=originalBytes;
  if(key==='cloud'||key==='bulbasaur'||key==='lux'){ const canonical=join(d,'canonical.glb'); execFileSync('python3',[fileURLToPath(new URL('./normalize-existing-glb.py',import.meta.url)),path,canonical]); bytes=new Uint8Array(readFileSync(canonical)); }
  const inspection=await inspectModelUpload(bytes);
  const sourceDoc=key==='cloud'||key==='bulbasaur'?read(join(ws,'GGD-hero-model-options/content/models',`imported.${key}.json`)):null;
  let clipMap=sourceDoc?.clipMap;
  if(key==='tram')clipMap=read(join(ws,'GGD-hero-validation-batch2/docs/_reports/hero-validation-batch2-37/data/private/teachers/b2-kisaragi.project.json')).presentation.uploadedModel.clipMap;
  if(!clipMap){
   const names=inspection.clips.map(c=>c.name);const pick=(pattern:RegExp)=>names.find(n=>pattern.test(n));
   clipMap={idle:pick(/(^|_)(idle|stand)/i),run:pick(/(^|_)(run|walk)/i),attack:pick(/(^|_)attack/i),cast:pick(/(^|_)(spell|cast)/i),hurt:pick(/(^|_)(hurt|hit|idle|stand)/i),death:pick(/(^|_)(death|dead)/i)};
  }
  const selections=Object.fromEntries(Object.entries(clipMap).map(([state,name])=>[state,inspection.clips.findIndex(c=>c.name===name)])) as HeroModelSelections;
  const body=await prepareUploadedHeroModel(bytes,selections,sourceDoc?effectiveYawOffsetDeg(sourceDoc):0);await verifyUploadedHeroModel(body.model,body.bytes);
  const fp=(bytes:Uint8Array)=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  const receipt={schema:'ggd-library-body-ready@1',preparation:{asset:`existing:${key}`,source:{path,...fp(originalBytes)},limitations:['保留借用模型身形；未重製角色專屬外觀或複合身體。']},model:body.model,document:body.document,selectedClips:body.model.clipMap,metrics:{triangles:body.inspected.triangles,drawPrimitives:body.inspected.meshes,textures:body.inspected.textures},warnings:body.warnings,validator:body.inspected.report};
  for(const [file,value] of [['model.json',body.document],['uploaded-model.json',body.model],['receipt.json',receipt]] as const)writeFileSync(join(d,file),JSON.stringify(value,null,2)+'\n');
  writeFileSync(join(d,'body.glb'),body.bytes);result.stage='prepared';result.runtime=d;
 }catch(error){result.error=String(error);}
 writeFileSync(join(out,'summary.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(result));
}
if(results.some(r=>r.error))process.exitCode=1;
