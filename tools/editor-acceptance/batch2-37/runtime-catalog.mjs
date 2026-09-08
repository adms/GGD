// A read-only, provenance-bearing census. Presence is not runtime/asset proof.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const defaultRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const lineOf=(text,needle)=>text.slice(0,text.indexOf(needle)).split('\n').length;
const escape=s=>s.replaceAll('~','~0').replaceAll('/','~1');

export function inspectRuntimeCatalog(root=defaultRoot){
  const sourceHashes={};
  const read=path=>{const text=readFileSync(resolve(root,path),'utf8');sourceHashes[path]=sha(text);return{text,doc:JSON.parse(text)};};
  const collection=name=>readdirSync(resolve(root,'content',name)).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).sort().map(f=>{
    const path=`content/${name}/${f}`;return{path,...read(path)};
  });
  const templates=collection('ability-templates'),statuses=collection('status-effects'),vfx=collection('vfx'),abilities=collection('abilities');
  const payloads=new Map(statuses.map(({doc})=>[doc.id,[]]));
  const collect=(x,path,pointer)=>{
    if(!x||typeof x!=='object')return;
    if(x.kind==='applyStatus'&&payloads.has(x.statusId))payloads.get(x.statusId).push({source:path,pointer,payload:structuredClone(x)});
    for(const [key,value]of Object.entries(x))collect(value,path,`${pointer}/${escape(key)}`);
  };
  for(const {doc,path}of abilities)collect(doc,path,'');
  const capability=read('docs/editor-contract/ggd-runtime-capabilities.json').doc;
  for(const path of ['sim/effects/variants/applyStatus.ts','sim/effects/heal.ts','sim/effects/restore.ts','sim/combat/restore.ts','content/templates/expand.ts','sim/systems/WorldHookSystem.ts','sim/effects/summon.ts','sim/effects/modifyCooldown.ts','content/heroForge/scenario.ts','sim/combat/damage.ts']){
    const file=`packages/shared/src/${path}`;sourceHashes[file]=sha(readFileSync(resolve(root,file),'utf8'));
  }
  return{schema:'ggd-batch2-runtime-catalog-audit@1',
    counts:{templates:templates.length,enabledTemplates:templates.filter(t=>t.doc.status==='enabled').length,statusDocuments:statuses.length,vfxDocuments:vfx.length},
    templates:templates.map(({doc,path,text})=>({id:doc.id,family:doc.family,status:doc.status,source:path,line:lineOf(text,'"status"'),params:doc.params})),
    statuses:statuses.map(({doc,path})=>({id:doc.id,source:path,polarity:doc.polarity,tags:doc.tags,
      meaning:'Identity and semantic tags only; executable behavior comes from the applyStatus/buff payload at each authoring site.',
      shippedAbilityPayloads:payloads.get(doc.id)})),
    vfx:{ids:vfx.map(v=>v.doc.id),meaning:'Document/reference census only; no claim that all models/textures/renderers have been loaded or visually verified.'},
    reviewedRuntimeFacts:[
      {topic:'status-flags',source:'packages/shared/src/sim/effects/variants/applyStatus.ts:59',fact:'slow requires moveSpeedMult; root/stun/silenced/disarmed are separate flags. confusion requires berserk+targetsAllies; curse/blind missChance is carried by the affected attacker.'},
      {topic:'healing',source:'packages/shared/src/sim/effects/heal.ts:22',fact:'heal.applyTo omitted means resolved targets; self is explicit. tpl-heal target ally is targeted and rejects enemies.'},
      {topic:'restore-documentation-mismatch',source:'packages/shared/src/sim/effects/restore.ts:24',fact:'Although template prose says restore TO a percentage, runtime calls healTarget/restoreMana with amount=max*pct; combat/restore.ts adds and caps it. Author descriptions must follow runtime.'},
      {topic:'drain-leech',source:'packages/shared/src/content/templates/expand.ts:1475',fact:'Initial damage plus DoT; explicit optional leechFlat gives one flat self-heal, not damage-proportional life steal and not a heal on every tick.'},
      {topic:'counterattack',source:'packages/shared/src/content/templates/expand.ts:1636',fact:'tpl-on-hit-react is fixed damage against the event attacker on damage taken. reflectRadius is not read by the expander; it is not incoming-damage reflection or an area counter.'},
      {topic:'recipient-hooks',source:'packages/shared/src/sim/systems/WorldHookSystem.ts:195',fact:'onShieldGained and onHeal (line 277) belong to the recipient, not provider. onShieldBroken is damage-driven guardBreak, not expiration or shieldBreak effect removal.'},
      {topic:'control-hook-classification',source:'packages/shared/src/sim/systems/WorldHookSystem.ts:134',fact:'onCrowdControlApplied/Received classify the status document by its cc tag, not the applyStatus flags. magic-break has no cc tag; numbness/paralysis do. Identity tags therefore influence triggers even when the payload is only a named marker.'},
      {topic:'effective-shield-expiry',source:'packages/shared/src/sim/combat/damage.ts:672',fact:'Effective shield queries ignore expired or empty pools. Raw health.shields can retain expired entries until the next hit removes them at line 1164; raw array presence is not shield protection.'},
      {topic:'summon',source:'packages/shared/src/sim/effects/summon.ts:92',fact:'body:self creates a real summon. killCredit:owner throws as unsupported; omitted killCredit gives no owner payout. maxAlive recasts replace older owned summons.'},
      {topic:'periodic-field',source:'packages/shared/src/content/templates/expand.ts:2579',fact:'A repeated area damage sequence; applyTo:allies selects allies but does not turn damage into healing. Count is rounded duration/interval and bounded by DELAYED_MAX_COUNT.'},
      {topic:'cooldown',source:'packages/shared/src/sim/effects/modifyCooldown.ts:157',fact:'modifyCooldown defaults to self and abilitySlot; hookInternalCooldown is a distinct target. Passive-only slot cooldown is always zero and cannot test hook ICD reset.'},
      {topic:'units',source:'packages/shared/src/content/templates/expand.ts:91',fact:'Template wc3u fields convert by 11/600; wc3h fields use a separate vertical scale. effect-sequence numbers are already GGD world units.'},
      {topic:'single-slot-scenario-limits',source:'packages/shared/src/content/heroForge/scenario.ts:27',fact:'The built-in compact state has HP/mana/positions and target status/shield counts, not shield amount, all actors, cooldowns, summon state or per-status flags. This batch harness records those fields directly from SimWorld.'}
    ],
    availableCausalMeasurements:[
      {family:'healing',pair:'self outputHealingPct buff -> ally tpl-heal',metric:'actual ally HP restored / heal event amount; unrelated enemy HP must not increase'},
      {family:'shield',pair:'outputShieldPct buff -> shield, or shield -> incoming basic/spell attack',metric:'shield pool sum, target HP retained, shield damage-type filter, guardBreak only after depletion'},
      {family:'mobility',pair:'blink/charge/throw -> short-range or position-conditioned follow-up',metric:'actual landing x/z/distance and subsequent accepted or failed hit; include empty preparation'},
      {family:'counter',pair:'temporary applyBuff hooks -> enemy spell/basic attack',metric:'hook response count/HP/mana/cooldown, with missed trigger and expired window'},
      {family:'summon',pair:'cast tpl-summon-agent -> recast with maxAlive, or support aura -> summoned attacker',metric:'live owned entity count, replaced entity IDs, expiry/owner-death cleanup; no imaginary owner kill credit'},
      {family:'resources',pair:'resource recovery -> manaBarrier or costly cast',metric:'mana spent/remaining, HP protection, insufficient-resource rejection; restore uses additive max-percentage runtime'},
      {family:'timing',pair:'control/position preparation -> delayed, periodic-field or projectile response',metric:'per-tick status flags, hit arrival and target inclusion; source residual damage cancels in matched ablation controls'}
    ],
    declaredSimCapabilities:capability.simCapabilities,declaredUnsupported:capability.unsupported,declaredKnownBroken:capability.knownBroken,
    sourceHashes,sourceDigest:sha(sourceHashes),
    limits:['Catalog presence and enabled status are not universal runtime certification. Reviewed facts are source inspection; per-hero executable receipts are separate.',
      'Existing status documents without a shipped ability applyStatus occurrence remain identity/tag references; this report does not manufacture a payload for them.',
      'No registered template, status, VFX document or engine feature is created by this census.']};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=inspectRuntimeCatalog();
  const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
  if(output)writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({counts:result.counts,statusesWithShippedPayload:result.statuses.filter(s=>s.shippedAbilityPayloads.length).length,sourceDigest:result.sourceDigest,...(output?{output}:{} )}));
}
