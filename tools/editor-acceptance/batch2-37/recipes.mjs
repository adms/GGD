import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designsA } from './designs-a.mjs';
import { designsB } from './designs-b.mjs';

// This is an offline authoring helper, not a new runtime/template registry.
// Every emitted card points to a shipped enabled Main template.
const clone = x => structuredClone(x);
function findNodes(value,predicate,out=[]) {
  if(value && typeof value==='object') {if(predicate(value))out.push(value); for(const child of Object.values(value))findNodes(child,predicate,out);}
  return out;
}

export function shippedStatusPresets(root) {
  // Identity/tag documents have no executable defaults. Reuse actual shipped
  // applyStatus nodes as well, retaining their flag values and durations.
  const choices={curse:['godie-h02k.w','curse'],blind:['godie-efur.q','blind'],confusion:['godie-e007.q','confusion']};
  return Object.fromEntries(Object.entries(choices).map(([key,[ability,id]])=>{
    const path=`content/abilities/${ability}.json`;
    const doc=JSON.parse(readFileSync(resolve(root,path),'utf8'));
    const node=findNodes(doc,x=>x.kind==='applyStatus'&&x.statusId===id&&!x.condition)[0];
    if(!node)throw Error(`Shipped status recipe missing: ${path}:${id}`);
    return [key,{node:clone(node),source:path}];
  }));
}

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
let cachedPresets;
export function designFor(hero,presets=cachedPresets??=shippedStatusPresets(repo)) {
  return designsA(hero,presets)??designsB(hero,presets);
}
export function recipe(move,hero,presets) {
  const d=designFor(hero,presets),m=d?.moves[move.slot];
  if(!m)throw Error(`V2_DESIGN_MISSING:${hero.id}:${move.slot}`);
  return {name:m.name??move.name,purpose:`「${m.name??move.name}！」\n${m.text}\n上述數值以技能等級 1 為準；升級後採正式編譯數值表。\n角色演出：${hero.theme}。GGD 惡搞改編，非原作招式與數值聲明。`,
    templates:m.cards,bands:move.slot==='PASSIVE'?{}:{rangeTier:'中',cooldownTier:['R','EX'].includes(move.slot)?'大':'小',manaCostTier:'小',...m.bands},
    mechanicsText:m.text,visual:m.vfx?{vfxKey:m.vfx,attachTo:'caster'}:null};
}
