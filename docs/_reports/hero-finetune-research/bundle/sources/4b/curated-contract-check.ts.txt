/** Thin source-contract assertions; not a claim of visual or full runtime QA. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {zTemplateDoc} from '../../packages/shared/src/content/schema/template';
import {zVfxCollectionDoc} from '../../packages/shared/src/content/schema/vfx';
import {defaultParamsFor} from '../../packages/shared/src/content/templates/paramsSchema';
import {expand} from '../../packages/shared/src/content/templates/expand';
const root=path.resolve(process.argv[2]!);const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const get=(id:string)=>zTemplateDoc.parse(JSON.parse(fs.readFileSync(`content/ability-templates/${id}.json`,'utf8')));
const ex=(id:string,patch:Record<string,unknown>={})=>{const t=get(id);return expand(t,{...defaultParamsFor(t),...patch});};
for(const c of catalog.mechanism){const t=get(c.templateId);assert.equal(t.status,c.status);if(c.status==='enabled')ex(c.templateId);}
for(const c of catalog.vfx){const v=zVfxCollectionDoc.parse(JSON.parse(fs.readFileSync(`content/vfx/${c.id}.json`,'utf8')));assert(v.schema!=='ribbon@1');if(v.schema==='vfx@1')assert(!v.ambient&&!v.anchorBone);}
for(const id of ['tpl-line-sweep','tpl-traveling-wave']){const e=ex(id).effects!;assert.equal(e.length,1);assert.equal(e[0]!.kind,'spawnProjectile');}
assert.deepEqual(ex('tpl-line-sweep',{segmentCount:2}),ex('tpl-line-sweep',{segmentCount:9}));
assert.deepEqual(ex('tpl-orbit-array',{aim:'inward'}),ex('tpl-orbit-array',{aim:'outward'}));
assert(!JSON.stringify(ex('tpl-proxy-cast')).includes('spawnUnit'));
assert(!JSON.stringify(ex('tpl-proxy-fanout')).includes('spawnUnit'));
assert.equal(ex('tpl-ground-nova').castType,'ground');
assert.equal(ex('tpl-instant-blast',{radius:undefined}).castType,'targeted');
const charge=ex('tpl-charge-push').effects![0] as any;assert.equal(charge.kind,'leap');assert(charge.onLand.some((x:any)=>x.kind==='damage'));assert(charge.onLand.some((x:any)=>x.kind==='knockback'));
assert(ex('tpl-random-barrage').effects!.some(x=>x.kind==='dot'));
assert(ex('tpl-random-barrage',{payout:'onceAtCast'}).effects!.every(x=>x.kind==='damage'));
const report={status:'pass',templates:catalog.mechanism.length,vfx:catalog.vfx.length,scope:'schema, selectable registry and explicit expansion assertions; no full visual or runtime semantics proof'};
fs.writeFileSync(path.join(root,'curated-contract-check.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
