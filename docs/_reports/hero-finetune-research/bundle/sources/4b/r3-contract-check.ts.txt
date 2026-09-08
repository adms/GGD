/** Thin executable expansion evidence; not SimWorld/production qualification. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {zTemplateDoc} from '../../packages/shared/src/content/schema/template';
import {defaultParamsFor} from '../../packages/shared/src/content/templates/paramsSchema';
import {expand} from '../../packages/shared/src/content/templates/expand';
const root=path.resolve(process.argv[2]!);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const get=(id:string)=>zTemplateDoc.parse(JSON.parse(fs.readFileSync(`content/ability-templates/${id}.json`,'utf8')));
const ex=(id:string,patch:Record<string,unknown>={})=>{const t=get(id);return expand(t,{...defaultParamsFor(t),...patch});};
for(const c of catalog.mechanism){const t=get(c.templateId);assert.equal(t.status,'enabled');ex(c.templateId);}
const blank=ex('tpl-teleport').effects![0] as any;assert.equal(blank.kind,'leap');assert.equal(blank.onLand,undefined);
const damage=ex('tpl-teleport',{damage:{perRank:[70],ratios:[]}}).effects![0] as any;assert(damage.onLand.some((x:any)=>x.kind==='damage'));
const ally=ex('tpl-teleport',{destination:'rallyToCaster'}).effects![0] as any;assert.equal(ally.applyTo,'target');assert.equal(ally.dragToCaster,true);
const mark=ex('tpl-mark-stacks',{resetOn:'match'});assert.equal(mark.marks![0]!.resetOn,'match');
const hit=ex('tpl-proxy-cast',{anchor:'target',statusId:undefined});assert.equal(hit.castType,'targeted');assert.equal(hit.effects!.length,1);assert.equal(hit.effects![0]!.kind,'damage');
const combo=ex('tpl-lock-combo',{trigger:'onDamageTaken'});assert.equal(combo.passive!.ranks[0]!.hooks![0]!.on,'onDamageTaken');
assert(combo.passive!.ranks[0]!.hooks![0]!.effects.some(x=>x.kind==='leap'));
const pull=ex('tpl-charge-push',{pushFrom:'pull'}).effects![0] as any;assert(pull.onLand.some((x:any)=>x.kind==='knockback'&&x.from==='pull'));
const result={status:'pass',enabledCards:catalog.mechanism.length,checks:['all-current-schema-expansions','optional-teleport-damage','ally-rally-direction','cross-round-mark','single-target-proxy','combo-onDamageTaken-is-not-pure-immediate-reaction','charge-inward-pull'],scope:'executable expansion contract only; not full runtime playtest'};
fs.writeFileSync(path.join(root,'contract-check.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
