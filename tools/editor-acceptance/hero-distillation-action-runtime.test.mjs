import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newActionState,applyAction,completeActionState} from './hero-distillation-action-runtime.mjs';

test('runtime derives the next cursor from accepted shapes and rejects native fields',()=>{
  const grammar=['hooks','on','effects','kind','duration'],options={allowedKeys:grammar,maxArrayLength:4};let state=newActionState();
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['hooks']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'array',length:1}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['on','effects']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:'onDamage'},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'array',length:1}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['kind','duration']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:'damage'},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:4},options);
  assert.deepEqual(completeActionState(state),{hooks:[{on:'onDamage',effects:[{kind:'damage',duration:4}]}]});
  assert.throws(()=>applyAction(newActionState(),{format:'forge-next-json-action@1',op:'value',value:{instanceId:'bad'}},options),/ACTION_SCRIPT_FIELD/);
});
