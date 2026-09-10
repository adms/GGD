// Teacher projection for a genuinely autoregressive, bounded JSON-action
// protocol.  Unlike cursor-labelled atom supervision, the next cursor is
// never supplied by a teacher at runtime: the script derives it solely from
// previously accepted shape actions and a deterministic depth-first queue.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SLOTS} from './hero-distillation-compact.mjs';

const SCRIPT=fileURLToPath(import.meta.url),LIMIT=600,MAX_ACTION_SEQUENCE=512;
const sha=value=>createHash('sha256').update(value).digest('hex');
const compact=value=>JSON.stringify(value);
const clone=value=>structuredClone(value);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const exact=(value,keys,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};
const actionAnswer=(op,value)=>({format:'forge-next-json-action@1',op,value:clone(value)});

export const SYSTEM={
  identity:'只決定英雄身分與出身屬性。不得生成原生 JSON、資產、ID 或未要求欄位；只輸出指定 JSON。',
  selection:'只決定一個技能槽的模板、效果、事件、條件與特效風格候選。不得生成參數或原生 JSON；只輸出指定 JSON。',
  core:'只決定一個技能槽的 product 模板順序。不得填名稱、參數、ID 或資產；只輸出指定 JSON。',
  action:'只處理 script 提供的目前 frontier。容器只能輸出 `shape`，葉節點只能輸出一個 scalar `value`（字串、數字、布林或 null）；不得在 value 內藏物件或陣列、不得指定 path、不得跳過 queue、不得生成 ID、資產或敘述。只輸出指定 JSON。'
};

function setAt(root,path,value){
  if(path.length===0)return clone(value);
  let current=root;
  for(const key of path.slice(0,-1)){assert(current&&typeof current==='object'&&Object.hasOwn(current,key),'ACTION_PARENT_PATH_MISSING');current=current[key];}
  assert(current&&typeof current==='object','ACTION_CONTAINER_MISSING');current[path.at(-1)]=clone(value);return root;
}

/** The path is retained only in the local trace. It is deliberately absent
 * from the assistant answer: at runtime it comes from the queue. */
export function actionize(value,path=[]){
  // Do not let a small nested object bypass the frontier.  It made the old
  // protocol nominally bounded while still asking the model to produce an
  // arbitrary config subtree in one reply.  Every container is now owned by a
  // deterministic shape action; only scalar leaves remain model values.
  if(value===null||['string','number','boolean'].includes(typeof value)){
    const small=actionAnswer('value',value);
    assert(compact(small).length<=LIMIT,'ACTION_SCALAR_TOO_LARGE');
    return [{path,answer:small}];
  }
  if(Array.isArray(value))return [{path,answer:actionAnswer('shape',{kind:'array',length:value.length})},...value.flatMap((item,index)=>actionize(item,[...path,index]))];
  assert(value&&typeof value==='object','UNSPLITTABLE_ACTION_VALUE');
  const keys=Object.keys(value),shape=actionAnswer('shape',{kind:'object',keys});
  assert(compact(shape).length<=LIMIT,'ACTION_SHAPE_TOO_LARGE');
  return [{path,answer:shape},...keys.flatMap(key=>actionize(value[key],[...path,key]))];
}

function decodeAction(answer){
  exact(answer,['format','op','value'],'ACTION_OUTPUT_KEYS');assert.equal(answer.format,'forge-next-json-action@1','ACTION_FORMAT');
  if(answer.op==='value')return clone(answer.value);
  assert.equal(answer.op,'shape','ACTION_OPERATION');exact(answer.value,['kind',...(answer.value.kind==='array'?['length']:['keys'])],'ACTION_SHAPE_KEYS');
  if(answer.value.kind==='array'){assert(Number.isInteger(answer.value.length)&&answer.value.length>=0,'ACTION_ARRAY_LENGTH');return Array(answer.value.length);}
  assert.equal(answer.value.kind,'object','ACTION_SHAPE_KIND');assert(Array.isArray(answer.value.keys)&&answer.value.keys.every(key=>typeof key==='string'),'ACTION_OBJECT_KEYS');return {};
}

/** Replays the same queue a production decoder uses.  The trace path is only
 * an audit assertion; it does not control the cursor. */
export function replayActions(actions){
  let root;const queue=[[]];
  for(const item of actions){
    const cursor=queue.shift();assert(cursor,'ACTION_QUEUE_UNDERFLOW');assert.deepEqual(item.path,cursor,'ACTION_CURSOR_NOT_DERIVED');
    const value=decodeAction(item.answer);root=setAt(root,cursor,value);
    if(item.answer.op==='shape'){
      const children=Array.isArray(value)?Array.from({length:value.length},(_,index)=>[...cursor,index]):item.answer.value.keys.map(key=>[...cursor,key]);
      queue.unshift(...children);
    }
  }
  assert.equal(queue.length,0,'ACTION_QUEUE_INCOMPLETE');return root;
}

function record({hero,stage,system,input,answer,ordinal}){
  const messages=[{role:'system',content:system},{role:'user',content:compact(input)},{role:'assistant',content:compact(answer)}];
  assert(messages[2].content.length<=LIMIT,`ACTION_OUTPUT_LIMIT:${stage}:${messages[2].content.length}`);
  return {id:`${hero.heroId}:${stage}:${ordinal}`,heroId:hero.heroId,groupId:hero.groupId,originalGroupId:hero.originalGroupId,
    slot:stage.includes(':')?stage.split(':')[1]:'HERO',split:hero.split,stage,format:answer.format,
    teacherSha256:hero.teacherSha256,engineRevision:hero.engineRevision,inputSha256:sha(messages[1].content),targetSha256:sha(messages[2].content),messages};
}

function heroRows(rows){
  const byHero=new Map();
  for(const row of rows){const answer=JSON.parse(row.messages[2].content);if(!['forge-selection@1','forge-slot-config-delta@1'].includes(answer.format))continue;const a=byHero.get(row.heroId)??[];a.push(row);byHero.set(row.heroId,a);}
  return [...byHero.values()].map(rows=>{const select=rows.find(row=>JSON.parse(row.messages[2].content).format==='forge-selection@1');assert(select,'MISSING_HERO_SELECTION');
    const configs=Object.fromEntries(rows.filter(row=>JSON.parse(row.messages[2].content).format==='forge-slot-config-delta@1').map(row=>[row.slot,row]));assert.deepEqual(Object.keys(configs).sort(),[...SLOTS].sort(),'MISSING_SLOT_CONFIG');assert.equal(new Set(rows.map(row=>row.split)).size,1,'HERO_SPLIT_DRIFT');
    return {heroId:select.heroId,groupId:select.groupId,originalGroupId:select.originalGroupId??select.groupId,split:select.split,teacherSha256:select.teacherSha256,engineRevision:select.engineRevision,select,configs};});
}

function assertReplay(configuration,coreActions,products){
  const core=replayActions(coreActions),rebuilt={format:configuration.format,slot:configuration.slot,configuration:{...core,
    products:configuration.configuration.products.map((product,index)=>({template:{ref:product.template.ref,params:replayActions(products[index])}}))}};
  assert.deepEqual(rebuilt,configuration,'ACTION_REPLAY_CHANGED_TEACHER');
}

export function actionizeCompact(source,out){
  source=path.resolve(source);out=path.resolve(out);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const manifest=read(path.join(source,'manifest.json'));
  for(const name of ['examples.json','train.jsonl','dev.jsonl','decision-space.json','parameter-catalog.json','asset-bindings.json'])assert.equal(sha(fs.readFileSync(path.join(source,name))),manifest.outputs[name],'COMPACT_SOURCE_DRIFT:'+name);
  assert.equal(manifest.schema,'ggd-distillation-compact-frozen-data@1','COMPACT_SOURCE_SCHEMA');
  const heroes=heroRows(read(path.join(source,'examples.json')));assert.equal(heroes.length,74,'EXPECTED_74_HEROES');const records=[],metrics=[];
  for(const hero of heroes){
    const selectInput=JSON.parse(hero.select.messages[1].content),selection=JSON.parse(hero.select.messages[2].content),common={heroId:hero.heroId,groupId:hero.groupId,originalGroupId:hero.originalGroupId,split:hero.split,teacherSha256:hero.teacherSha256,engineRevision:hero.engineRevision};
    records.push(record({hero:common,stage:'identity',system:SYSTEM.identity,input:{request:selectInput.request,decisionSpace:selectInput.decisionSpace,outputContract:{format:'forge-identity@1'}},answer:{format:'forge-identity@1',identity:selection.identity},ordinal:0}));
    for(const slot of SLOTS){
      const slotSelection=selection.slots[slot],config=JSON.parse(hero.configs[slot].messages[2].content),core={format:'forge-slot-core@1',slot,productTemplates:config.configuration.products.map(product=>product.template.ref)};
      records.push(record({hero:common,stage:`selection:${slot}`,system:SYSTEM.selection,input:{request:selectInput.request,identity:selection.identity,slot,decisionSpace:selectInput.decisionSpace,outputContract:{format:'forge-slot-selection@1',slot}},answer:{format:'forge-slot-selection@1',slot,selection:slotSelection},ordinal:0}));
      records.push(record({hero:common,stage:`core:${slot}`,system:SYSTEM.core,input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,outputContract:{format:'forge-slot-core@1',slot}},answer:core,ordinal:0}));
      const coreValue={name:config.configuration.name,abilityOverrides:config.configuration.abilityOverrides,tuning:config.configuration.tuning},coreActions=actionize(coreValue),productActions=[];
      for(const [ordinal,item] of coreActions.entries())records.push(record({hero:common,stage:`core-action:${slot}`,system:SYSTEM.action,input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,core,cursor:{path:item.path,ordinal},outputContract:{format:'forge-next-json-action@1'}},answer:item.answer,ordinal}));
      for(const [product,entry] of config.configuration.products.entries()){
        const actions=actionize(entry.template.params);productActions.push(actions);
        for(const [ordinal,item] of actions.entries())records.push(record({hero:common,stage:`action:${slot}:${product}`,system:SYSTEM.action,input:{request:selectInput.request,identity:selection.identity,slot,selection:slotSelection,core,product:{index:product,templateRef:entry.template.ref},cursor:{path:item.path,ordinal},outputContract:{format:'forge-next-json-action@1'}},answer:item.answer,ordinal}));
      }
      assertReplay(config,coreActions,productActions);
    }
  }
  assert.equal(new Set(records.map(row=>row.id)).size,records.length,'DUPLICATE_ACTION_TASK');
  const train=records.filter(row=>row.split==='train'),dev=records.filter(row=>row.split==='dev');assert(![...new Set(train.map(row=>row.groupId))].some(group=>new Set(dev.map(row=>row.groupId)).has(group)),'GROUP_LEAKAGE');assert(new Set(train.map(row=>row.heroId)).size===59&&new Set(dev.map(row=>row.heroId)).size===15,'HERO_SPLIT_CHANGED');
  for(const row of records)metrics.push({id:row.id,stage:row.stage,inputChars:row.messages[1].content.length,outputChars:row.messages[2].content.length});
  fs.mkdirSync(out,{recursive:true});const outputs={},save=(name,value,jsonl=false)=>{const text=jsonl?value.map(compact).join('\n')+'\n':JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(out,name),text,{flag:'wx'});outputs[name]=sha(text);};save('examples.json',records);save('train.jsonl',train,true);save('dev.jsonl',dev,true);save('metrics.json',metrics);
  const sequenceCounts=new Map();for(const row of records)if(row.stage.startsWith('core-action:')||row.stage.startsWith('action:')){const key=`${row.heroId}:${row.stage}`;sequenceCounts.set(key,(sequenceCounts.get(key)??0)+1);}const maxActionsPerSequence=Math.max(...sequenceCounts.values());assert(maxActionsPerSequence<=MAX_ACTION_SEQUENCE,'ACTION_SEQUENCE_LIMIT');
  const counts={train:{tasks:train.length,heroes:new Set(train.map(row=>row.heroId)).size},dev:{tasks:dev.length,heroes:new Set(dev.map(row=>row.heroId)).size},all:{tasks:records.length,heroes:new Set(records.map(row=>row.heroId)).size}},report={schema:'ggd-action-forge-projection@1',source,sourceManifestSha256:sha(fs.readFileSync(path.join(source,'manifest.json'))),counts,actionProtocol:'scalar-leaves@1',outputLimitChars:LIMIT,maxOutputChars:Math.max(...metrics.map(row=>row.outputChars)),maxActionsPerSequence,maximumActionSequenceLimit:MAX_ACTION_SEQUENCE,allTeacherConfigurationsReplayed:true,sequenceProtocol:'At runtime script exposes the depth-first frontier derived from accepted prior actions. Every object and array is a script-owned shape action; every model value is one scalar leaf. Teacher future paths are never an input. Semantic candidates are catalog-bounded; JSON field validity is fail-closed by the authoritative final schema/compiler.',noNewHeroes:true,noTeacherRepair:true,scriptSha256:sha(fs.readFileSync(SCRIPT))};save('projection-report.json',report);save('manifest.json',{schema:'ggd-distillation-action-frozen-data@1',counts,outputs,projectionReport:report,releaseQualified:false});return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===SCRIPT){assert.equal(process.argv.length,4,'USAGE: COMPACT_SOURCE OUTPUT');console.log(JSON.stringify(actionizeCompact(process.argv[2],process.argv[3])));}
