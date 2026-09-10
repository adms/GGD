// Runtime half of the bounded JSON-action protocol.  The caller owns the
// queue and never accepts a model-supplied cursor or path.  A value is useful
// only when every preceding shape has made its location reachable.
import assert from 'node:assert/strict';

const SCRIPT_KEYS=new Set(['instanceId','provenance','capabilityIds','directionOptionIds','fallbackOptionIds','modelKey','championIcon','icon','sfxKey','vfxKey','attach','replaces']);
const exact=(value,keys,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};
const clone=value=>structuredClone(value);

function rejectNative(value,allowedKeys){
  if(Array.isArray(value)){value.forEach(item=>rejectNative(item,allowedKeys));return;}
  if(!value||typeof value!=='object'){
    if(typeof value==='string')assert(!value.startsWith('fx.prim.')&&!value.startsWith('assets/')&&!value.startsWith('champ.'),'ACTION_NATIVE_VALUE');
    return;
  }
  for(const [key,item] of Object.entries(value)){assert(!SCRIPT_KEYS.has(key),'ACTION_SCRIPT_FIELD:'+key);assert(!allowedKeys||allowedKeys.has(key),'ACTION_UNKNOWN_KEY:'+key);rejectNative(item,allowedKeys);}
}

function setAt(root,path,value){
  if(path.length===0)return clone(value);let current=root;
  for(const key of path.slice(0,-1)){assert(current&&typeof current==='object'&&Object.hasOwn(current,key),'ACTION_PARENT_MISSING');current=current[key];}
  assert(current&&typeof current==='object','ACTION_CONTAINER_MISSING');current[path.at(-1)]=clone(value);return root;
}

export function newActionState(){return {queue:[[]],root:undefined,accepted:0};}

/** Apply exactly the current queue head.  `allowedKeys` is a script-generated
 * grammar/candidate set, not a model suggestion; malformed or oversized
 * trees fail closed before HeroPlan materialization. */
export function applyAction(state,answer,{allowedKeys,maxArrayLength=32}={}){
  exact(state,['queue','root','accepted'],'ACTION_STATE_KEYS');assert(Array.isArray(state.queue)&&Number.isInteger(state.accepted),'ACTION_STATE');
  const keys=allowedKeys?new Set(allowedKeys):null;const queue=clone(state.queue),cursor=queue.shift();assert(cursor,'ACTION_QUEUE_COMPLETE');
  exact(answer,['format','op','value'],'ACTION_OUTPUT_KEYS');assert.equal(answer.format,'forge-next-json-action@1','ACTION_FORMAT');let value;
  if(answer.op==='value'){value=clone(answer.value);rejectNative(value,keys);}
  else {assert.equal(answer.op,'shape','ACTION_OPERATION');exact(answer.value,['kind',...(answer.value.kind==='array'?['length']:['keys'])],'ACTION_SHAPE_KEYS');
    if(answer.value.kind==='array'){assert(Number.isInteger(answer.value.length)&&answer.value.length>=0&&answer.value.length<=maxArrayLength,'ACTION_ARRAY_LENGTH');value=Array(answer.value.length);queue.unshift(...Array.from({length:value.length},(_,index)=>[...cursor,index]));}
    else {assert.equal(answer.value.kind,'object','ACTION_SHAPE_KIND');assert(Array.isArray(answer.value.keys)&&answer.value.keys.every(key=>typeof key==='string'),'ACTION_OBJECT_KEYS');assert.equal(new Set(answer.value.keys).size,answer.value.keys.length,'ACTION_DUPLICATE_KEYS');assert(answer.value.keys.every(key=>(!keys||keys.has(key))&&!SCRIPT_KEYS.has(key)),'ACTION_OBJECT_KEY_OUTSIDE_GRAMMAR');value={};queue.unshift(...answer.value.keys.map(key=>[...cursor,key]));}
  }
  return {queue,root:setAt(state.root,cursor,value),accepted:state.accepted+1};
}

export function completeActionState(state){exact(state,['queue','root','accepted'],'ACTION_STATE_KEYS');assert.equal(state.queue.length,0,'ACTION_SEQUENCE_INCOMPLETE');assert(state.root!==undefined,'ACTION_EMPTY_ROOT');return clone(state.root);}
