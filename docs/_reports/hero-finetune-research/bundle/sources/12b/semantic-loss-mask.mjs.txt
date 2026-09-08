/** Exact JSON-pointer value spans; UTF-8 bytes are portable across JS/Python. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const digest=s=>createHash('sha256').update(s).digest('hex');
const escape=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
export function serializeWithSpans(value){
  const chunks=[],spans={};let length=0,nodes=0;
  const push=s=>{chunks.push(s);length+=Buffer.byteLength(s,'utf8');};
  function visit(v,pointer='',depth=0){
    assert(++nodes<=10000&&depth<=24,'JSON_SIZE_DEPTH');const startByte=length;
    if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'){
      assert(typeof v!=='number'||Number.isFinite(v),'NONFINITE_JSON');push(JSON.stringify(v));
    }else if(Array.isArray(v)){
      push('[');for(let i=0;i<v.length;i++){if(i)push(',');visit(v[i],pointer+'/'+i,depth+1);}push(']');
    }else{
      assert(v&&Object.getPrototypeOf(v)===Object.prototype,'PLAIN_JSON_ONLY');push('{');
      Object.keys(v).forEach((k,i)=>{if(i)push(',');push(JSON.stringify(k)+':');visit(v[k],pointer+'/'+escape(k),depth+1);});push('}');
    }
    spans[pointer]={startByte,endByte:length};
  }
  visit(value);const text=chunks.join('');assert.equal(text,JSON.stringify(value));
  return {text,spans,encoding:'utf8-byte-half-open',textSha256:digest(text)};
}
export function maskValues(value,requests){
  const serialized=serializeWithSpans(value),seen=new Set();
  const excluded=requests.map(({pointer,reason})=>{
    assert(typeof pointer==='string'&&pointer!==''&&serialized.spans[pointer],'MISSING_OR_ROOT_MASK_POINTER');
    assert(!seen.has(pointer),'DUPLICATE_MASK_POINTER');seen.add(pointer);
    assert(typeof reason==='string'&&reason.length>0,'MASK_REASON_REQUIRED');
    const span=serialized.spans[pointer];
    return {pointer,reason,...span,valueSha256:digest(Buffer.from(serialized.text).subarray(span.startByte,span.endByte))};
  }).sort((a,b)=>a.startByte-b.startByte);
  for(let i=1;i<excluded.length;i++)assert(excluded[i].startByte>=excluded[i-1].endByte,'OVERLAPPING_MASK_POINTERS');
  const maskedBytes=excluded.reduce((n,s)=>n+s.endByte-s.startByte,0),totalBytes=Buffer.byteLength(serialized.text);
  assert(maskedBytes<totalBytes,'NO_TARGET_REMAINS');
  return {...serialized,excluded,maskedBytes,totalBytes,
    policy:'Exclude direct next-token labels intersecting value spans. Keep prompt and excluded values as context; indirect conditioning is NOT eliminated.'};
}
