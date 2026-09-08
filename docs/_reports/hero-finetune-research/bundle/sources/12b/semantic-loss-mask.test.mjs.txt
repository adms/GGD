import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeWithSpans,maskValues,digest} from './semantic-loss-mask.mjs';
test('exact JSON roundtrip and byte spans include quotes and escaped content',()=>{
  const input={hero:'拉克絲✨',text:'a"b\nc',array:[null,0,false,'😀']},s=serializeWithSpans(input);
  assert.deepEqual(JSON.parse(s.text),input);const bytes=Buffer.from(s.text);
  for(const [p,v] of [['/hero',input.hero],['/text',input.text],['/array/3','😀'],['/array/0',null]]){
    const span=s.spans[p];assert.equal(bytes.subarray(span.startByte,span.endByte).toString(),JSON.stringify(v));}
});
test('JSON pointer escaping is exact, not ambiguous dotted paths',()=>{
  const s=serializeWithSpans({'a/b':{'c~d':'x'},'a.b':2});assert(s.spans['/a~1b/c~0d']);assert(s.spans['/a.b']);
});
test('only requested values are excluded; neighboring mechanic labels remain',()=>{
  const v={op:'line_sequence',count:4,repeatHits:'once_per_cast',evidence:'四段'},s=maskValues(v,[{pointer:'/repeatHits',reason:'unspecified'}]);
  assert.equal(s.excluded.length,1);assert.equal(s.excluded[0].valueSha256,digest('"once_per_cast"'));
  assert(s.spans['/count'].endByte<=s.excluded[0].startByte);assert(s.maskedBytes<s.totalBytes);
});
for(const [label,requests] of [
  ['root',[{pointer:'',reason:'bad'}]],['missing',[{pointer:'/no',reason:'bad'}]],
  ['duplicate',[{pointer:'/a',reason:'bad'},{pointer:'/a',reason:'bad'}]],
  ['overlap',[{pointer:'/a',reason:'bad'},{pointer:'/a/b',reason:'bad'}]],
  ['no reason',[{pointer:'/a',reason:''}]],
])test(`reject ${label}`,()=>assert.throws(()=>maskValues({a:{b:1}},requests)));
test('undefined, nonfinite, functions, sparse arrays and excessive depth fail closed',()=>{
  for(const v of [{x:undefined},{x:NaN},{x:()=>1},[,,,]])assert.throws(()=>serializeWithSpans(v));
  const v={};let p=v;for(let i=0;i<30;i++)p=p.x={};assert.throws(()=>serializeWithSpans(v),/JSON_SIZE_DEPTH/);
});
