// Deterministic atomization of the compact ForgePlan teacher projection.
//
// This deliberately creates more *bounded* training decisions without adding
// heroes, paraphrases, repaired teacher data, or hidden teacher retrieval. A
// model only owns a typed semantic decision; JSON structure, IDs, defaults,
// bindings and later materialization remain script-owned.  Every large JSON
// subtree is represented by a small shape/value sequence that can be replayed
// losslessly by the assembler below.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SLOTS} from './hero-distillation-compact.mjs';

const SCRIPT=fileURLToPath(import.meta.url),LIMIT=600;
const sha=value=>createHash('sha256').update(value).digest('hex');
const compact=value=>JSON.stringify(value);
const clone=value=>structuredClone(value);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const exact=(value,keys,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};
const atomAnswer=(slot,product,path,op,value)=>({format:'forge-json-atom@1',slot,product,path,op,value:clone(value)});

export const SYSTEM={
  identity:'只決定英雄身分與出身屬性。不得生成原生 JSON、資產、ID 或未要求欄位；只輸出指定 JSON。',
  selection:'只決定一個技能槽的模板、效果、事件、條件與特效風格候選。不得生成參數或原生 JSON；只輸出指定 JSON。',
  core:'只決定一個技能槽的名稱、覆寫、調校與 product 模板順序。不得填 product 參數、ID 或資產；只輸出指定 JSON。',
  atom:'只決定一個明確 JSON 路徑的 shape 或 value。路徑、槽與 product 編號必須原樣回傳；不得額外欄位、ID、資產或敘述。只輸出指定 JSON。'
};

function setAt(root,path,value){
  if(path.length===0)return clone(value);
  let current=root;
  for(const key of path.slice(0,-1)){
    assert(current&&typeof current==='object','ATOM_PARENT_MISSING');
    assert(Object.hasOwn(current,key),'ATOM_PARENT_PATH_MISSING');current=current[key];
  }
  assert(current&&typeof current==='object','ATOM_CONTAINER_MISSING');current[path.at(-1)]=clone(value);return root;
}

/** Split any value whose serialized form exceeds LIMIT. Shape records come
 * before descendants, so replay can validate paths without a model inventing
 * a JSON skeleton.  Small values stay whole to preserve meaningful local
 * mechanisms (for example one status application). */
export function atomize(value,{slot,product,path=[]}={}){
  const answer=value=>atomAnswer(slot,product,path,'value',value);
  if(compact(answer(value)).length<=LIMIT)return [answer(value)];
  if(Array.isArray(value))return [atomAnswer(slot,product,path,'shape',{kind:'array',length:value.length}),
    ...value.flatMap((item,index)=>atomize(item,{slot,product,path:[...path,index]}))];
  assert(value&&typeof value==='object','UNSPLITTABLE_ATOM_VALUE');
  const keys=Object.keys(value);
  assert(compact(atomAnswer(slot,product,path,'shape',{kind:'object',keys})).length<=LIMIT,'ATOM_SHAPE_TOO_LARGE');
  return [atomAnswer(slot,product,path,'shape',{kind:'object',keys}),
    ...keys.flatMap(key=>atomize(value[key],{slot,product,path:[...path,key]}))];
}

export function replayAtoms(atoms){
  let root;
  for(const atom of atoms){
    exact(atom,['format','slot','product','path','op','value'],'ATOM_KEYS');assert.equal(atom.format,'forge-json-atom@1');
    assert(Array.isArray(atom.path)&&atom.path.every(key=>typeof key==='string'||Number.isInteger(key)),'ATOM_PATH');
    let value;
    if(atom.op==='value')value=atom.value;
    else {assert.equal(atom.op,'shape','ATOM_OPERATION');exact(atom.value,['kind',...(atom.value.kind==='array'?['length']:['keys'])],'ATOM_SHAPE');
      if(atom.value.kind==='array'){assert(Number.isInteger(atom.value.length)&&atom.value.length>=0,'ATOM_ARRAY_LENGTH');value=Array(atom.value.length);}
      else {assert.equal(atom.value.kind,'object','ATOM_SHAPE_KIND');assert(Array.isArray(atom.value.keys)&&atom.value.keys.every(key=>typeof key==='string'),'ATOM_OBJECT_KEYS');value={};}
    }
    root=setAt(root,atom.path,value);
  }
  return root;
}

function record({hero,stage,system,input,answer,ordinal}){
  const messages=[{role:'system',content:system},{role:'user',content:compact(input)},{role:'assistant',content:compact(answer)}];
  assert(compact(answer).length<=LIMIT,`ATOMIC_OUTPUT_LIMIT:${stage}:${compact(answer).length}`);
  return {id:`${hero.heroId}:${stage}:${ordinal}`,heroId:hero.heroId,groupId:hero.groupId,originalGroupId:hero.originalGroupId,
    slot:stage.includes(':')?stage.split(':')[1]:'HERO',split:hero.split,stage,format:answer.format,
    teacherSha256:hero.teacherSha256,engineRevision:hero.engineRevision,inputSha256:sha(messages[1].content),targetSha256:sha(messages[2].content),messages};
}

function selectionCore(configuration){
  return {format:'forge-slot-core@1',slot:configuration.slot,
    productTemplates:configuration.configuration.products.map(product=>product.template.ref)};
}

function assertReplay(configuration,coreAtoms,atomsByProduct){
  const core=replayAtoms(coreAtoms),rebuilt={format:configuration.format,slot:configuration.slot,configuration:{...core,
    products:configuration.configuration.products.map((product,index)=>({template:{ref:product.template.ref,params:replayAtoms(atomsByProduct[index])}}))}};
  assert.deepEqual(rebuilt,configuration,'ATOMIC_REPLAY_CHANGED_TEACHER');
}

function heroRows(rows){
  const byHero=new Map();
  for(const row of rows){
    const answer=JSON.parse(row.messages[2].content);
    if(!['forge-selection@1','forge-slot-config-delta@1'].includes(answer.format))continue;
    const array=byHero.get(row.heroId)??[];array.push(row);byHero.set(row.heroId,array);
  }
  return [...byHero.values()].map(rows=>{
    const select=rows.find(row=>JSON.parse(row.messages[2].content).format==='forge-selection@1');
    assert(select,'MISSING_HERO_SELECTION');const configs=Object.fromEntries(rows.filter(row=>JSON.parse(row.messages[2].content).format==='forge-slot-config-delta@1').map(row=>[row.slot,row]));
    assert.deepEqual(Object.keys(configs).sort(),[...SLOTS].sort(),'MISSING_SLOT_CONFIG');
    assert.equal(new Set(rows.map(row=>row.split)).size,1,'HERO_SPLIT_DRIFT');
    return {heroId:select.heroId,groupId:select.groupId,originalGroupId:select.originalGroupId??select.groupId,split:select.split,
      teacherSha256:select.teacherSha256,engineRevision:select.engineRevision,select,configs};
  });
}

export function atomizeCompact(source,out){
  source=path.resolve(source);out=path.resolve(out);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const manifest=read(path.join(source,'manifest.json'));
  for(const name of ['examples.json','train.jsonl','dev.jsonl','decision-space.json','parameter-catalog.json','asset-bindings.json'])
    assert.equal(sha(fs.readFileSync(path.join(source,name))),manifest.outputs[name],'COMPACT_SOURCE_DRIFT:'+name);
  assert.equal(manifest.schema,'ggd-distillation-compact-frozen-data@1','COMPACT_SOURCE_SCHEMA');
  const heroes=heroRows(read(path.join(source,'examples.json')));assert.equal(heroes.length,74,'EXPECTED_74_HEROES');
  const records=[],metrics=[];
  for(const hero of heroes){
    const selectInput=JSON.parse(hero.select.messages[1].content),selection=JSON.parse(hero.select.messages[2].content);
    const common={heroId:hero.heroId,groupId:hero.groupId,originalGroupId:hero.originalGroupId,split:hero.split,teacherSha256:hero.teacherSha256,engineRevision:hero.engineRevision};
    records.push(record({hero:common,stage:'identity',system:SYSTEM.identity,input:{request:selectInput.request,decisionSpace:selectInput.decisionSpace,
      outputContract:{format:'forge-identity@1'}},answer:{format:'forge-identity@1',identity:selection.identity},ordinal:0}));
    for(const slot of SLOTS){
      const slotSelection=selection.slots[slot],config=JSON.parse(hero.configs[slot].messages[2].content),core=selectionCore(config);
      records.push(record({hero:common,stage:`selection:${slot}`,system:SYSTEM.selection,input:{request:selectInput.request,identity:selection.identity,slot,
        decisionSpace:selectInput.decisionSpace,outputContract:{format:'forge-slot-selection@1',slot}},answer:{format:'forge-slot-selection@1',slot,selection:slotSelection},ordinal:0}));
      records.push(record({hero:common,stage:`core:${slot}`,system:SYSTEM.core,input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,
        outputContract:{format:'forge-slot-core@1',slot}},answer:core,ordinal:0}));
      const coreValue={name:config.configuration.name,abilityOverrides:config.configuration.abilityOverrides,tuning:config.configuration.tuning},
        coreAtoms=atomize(coreValue,{slot,product:'core',path:[]});
      for(const [ordinal,answer] of coreAtoms.entries())records.push(record({hero:common,stage:`core-atom:${slot}`,system:SYSTEM.atom,
        input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,core,
          product:{index:'core',templateRef:null},cursor:{path:answer.path,operation:answer.op},outputContract:{format:'forge-json-atom@1',slot,product:'core'}},answer,ordinal}));
      const atomsByProduct=[];
      for(const [product,entry] of config.configuration.products.entries()){
        const atoms=atomize(entry.template.params,{slot,product,path:[]});atomsByProduct.push(atoms);
        for(const [ordinal,answer] of atoms.entries())records.push(record({hero:common,stage:`atom:${slot}:${product}`,system:SYSTEM.atom,
          input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,core,
            product:{index:product,templateRef:entry.template.ref},cursor:{path:answer.path,operation:answer.op},outputContract:{format:'forge-json-atom@1',slot,product}},answer,ordinal}));
      }
      assertReplay(config,coreAtoms,atomsByProduct);
    }
  }
  assert.equal(new Set(records.map(row=>row.id)).size,records.length,'DUPLICATE_ATOMIC_TASK');
  const train=records.filter(row=>row.split==='train'),dev=records.filter(row=>row.split==='dev');
  assert(![...new Set(train.map(row=>row.groupId))].some(group=>new Set(dev.map(row=>row.groupId)).has(group)),'GROUP_LEAKAGE');
  assert(new Set(train.map(row=>row.heroId)).size===59&&new Set(dev.map(row=>row.heroId)).size===15,'HERO_SPLIT_CHANGED');
  for(const row of records)metrics.push({id:row.id,stage:row.stage,inputChars:row.messages[1].content.length,outputChars:row.messages[2].content.length});
  const outputs={},save=(name,value,jsonl=false)=>{const text=jsonl?value.map(compact).join('\n')+'\n':JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(out,name),text,{flag:'wx'});outputs[name]=sha(text);};
  fs.mkdirSync(out,{recursive:true});save('examples.json',records);save('train.jsonl',train,true);save('dev.jsonl',dev,true);save('metrics.json',metrics);
  const counts={train:{tasks:train.length,heroes:new Set(train.map(row=>row.heroId)).size},dev:{tasks:dev.length,heroes:new Set(dev.map(row=>row.heroId)).size},all:{tasks:records.length,heroes:new Set(records.map(row=>row.heroId)).size}};
  const report={schema:'ggd-atomic-forge-projection@1',source,sourceManifestSha256:sha(fs.readFileSync(path.join(source,'manifest.json'))),counts,
    outputLimitChars:LIMIT,maxOutputChars:Math.max(...metrics.map(row=>row.outputChars)),allTeacherConfigurationsReplayed:true,
    stages:['identity','selection:<slot>','core:<slot>','atom:<slot>'],noNewHeroes:true,noTeacherRepair:true,scriptSha256:sha(fs.readFileSync(SCRIPT))};
  save('projection-report.json',report);save('manifest.json',{schema:'ggd-distillation-atomic-frozen-data@1',counts,outputs,projectionReport:report,releaseQualified:false});
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===SCRIPT){assert.equal(process.argv.length,4,'USAGE: COMPACT_SOURCE OUTPUT');console.log(JSON.stringify(atomizeCompact(process.argv[2],process.argv[3])));}
