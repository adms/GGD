import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { hash } from './ir-compiler.mts';
import { shortJSONSchema } from './ir3-json-schema.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));
const base=path.join(here,'ir3-smoke-v1');
const old=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const previous=JSON.parse(fs.readFileSync(path.join(base,'requests.json'),'utf8'));
assert.equal(hash(JSON.stringify(previous)),old.requestSha256);
const schema=shortJSONSchema();
const header=`回傳的是符合 responseSchema 的資料，不是schema本身。根必填 schema:"hero-mechanism-plan@3"。
enum是單一字串的選項，不是輸出陣列；type/optional/nullable/constant/number/array都不是答案欄位。
actions每項直接寫 {"op":"damage"} 這樣的物件，不外包 {"damage":...}。這只是格式示例，不是任何英雄的答案。
沒有來源數值時可選nullable欄位直接省略；非optional欄位仍依原文填。原文沒寫傷害類型，不得擅自填true（真實傷害）。
sourceReferences只用作identityRefs和relations.ref的行ID，不能是null；沒有明示跨槽關係就relations:[]。
`;
const requests=previous.map((r:any)=>{const {contract,...input}=JSON.parse(r.messages[1].content);
  const messages=[{role:'system',content:header+r.messages[0].content.replace('依 contract 的型別與欄位','依 responseSchema 的型別與欄位')},
    {role:'user',content:JSON.stringify({...input,responseSchema:schema})}];
  return {id:r.id,messages,requestDigest:hash(JSON.stringify(messages))};});
const checkerFiles=[...old.checkerFiles,'ir3-json-schema.mts'];
const p={...old,schema:'ggd-hero12b-short-jsonschema-protocol@1',createdAt:new Date().toISOString(),
  requestSha256:hash(JSON.stringify(requests)),responseSchemaSha256:hash(JSON.stringify(schema)),checkerFiles,
  checkerPins:Object.fromEntries(checkerFiles.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  generatorSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  purpose:'same short IR3 validator with exact generated JSON Schema; excludes ambiguous catalog notation; NOT finetune',
  grammarConstrainedDecoding:false};
fs.mkdirSync(out);
for(const [f,v] of Object.entries({'manifest.json':p,'requests.json':requests,'response-schema.json':schema}))
  fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({requestSha256:p.requestSha256,schemaSha256:p.responseSchemaSha256},null,2));
