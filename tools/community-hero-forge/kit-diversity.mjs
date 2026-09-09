// Reused from batch2-37/diversity.mjs at cd5e98945. Source SHA-256: dcc9f6c09e8a2ee27c766ea27f3445ef98f7dbd60d2447bdaef40b9a1dbd34f2.
// Diagnostic only: a novel fingerprint never establishes fun or correct play.
const cosmetic=new Set(['id','name','description','provenance','schema','template',
  'vfxKey','vfxLayers','vfxScript','modelKey','text','color','damageType',
  'damageTier','radiusTier','cooldownTier','rangeTier','manaCostTier','castTimeTier',
  'stackKey','buffId','sourceId','maxRank','cooldown','manaCost','range','radius','castTimeSec']);
const visualKinds=new Set(['spawnVfx','spawnModelFx','floatingText','screenShake','screenFlash']);

// Keep genuine direction/target/flag/condition differences; collapse magnitudes.
// Slow and haste must not become equivalent merely because both use a number.
function numberShape(value,key){
  if(key.endsWith('Mult'))return value<1?'below-neutral':value>1?'above-neutral':'neutral';
  if(key==='chance'||key==='probability')return value===0?'never':value===1?'always':'chance';
  return value===0?'zero':value<0?'negative':'positive';
}
export function mechanicShape(value,key=''){
  if(value===null||value===undefined)return null;
  if(typeof value==='number')return numberShape(value,key);
  if(typeof value!=='object')return value;
  if(visualKinds.has(value.kind))return null;
  if(Array.isArray(value))return value.map(v=>mechanicShape(v,key)).filter(v=>v!==null);
  const out={};
  for(const k of Object.keys(value).sort()){
    if(cosmetic.has(k))continue;
    const v=mechanicShape(value[k],k);
    if(v!==null)out[k]=v;
  }
  return out;
}

function abilityShape(a){
  return mechanicShape({castType:a.castType,targetsEnemies:a.targetsEnemies,
    effects:a.effects??[],passive:a.passive??null});
}
function multisetSimilarity(a,b){
  const left=new Map(),right=new Map();
  for(const x of a)left.set(x,(left.get(x)??0)+1);
  for(const x of b)right.set(x,(right.get(x)??0)+1);
  let intersection=0,union=0;
  for(const k of new Set([...left.keys(),...right.keys()])){
    intersection+=Math.min(left.get(k)??0,right.get(k)??0);
    union+=Math.max(left.get(k)??0,right.get(k)??0);
  }
  return union?intersection/union:1;
}

export function inspectDiversity(heroes){
  const rows=heroes.map(({id,name,draft})=>{
    draft=normalizePrivateBindings(draft,id);
    const skills=Object.values(draft.abilityDrafts).map(a=>JSON.stringify(abilityShape(a))).sort();
    return {id,name,skills,key:JSON.stringify(skills)};
  });
  const exact=[],near=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j],similarity=multisetSimilarity(a.skills,b.skills);
    if(a.key===b.key)exact.push({heroes:[a.id,b.id],names:[a.name,b.name]});
    else if(similarity>=0.7)near.push({heroes:[a.id,b.id],names:[a.name,b.name],similarity});
  }
  const skillCounts=new Map();
  for(const r of rows)for(const s of new Set(r.skills))skillCounts.set(s,(skillCounts.get(s)??0)+1);
  return {schema:'ggd-batch2-diversity-diagnostic@1',heroCount:rows.length,
    exactDuplicateKitPairs:exact,nearDuplicateKitPairs:near,
    distinctNormalizedKits:new Set(rows.map(r=>r.key)).size,
    distinctNormalizedAbilities:skillCounts.size,
    mostSharedAbilityHeroCount:Math.max(0,...skillCounts.values()),
    signatureCreativityVerified:false,
    limitations:['Not graph-isomorphism complete; recentCast slot changes or alternate effect encodings can evade it.',
      'Private binding names are alpha-normalized across each kit; builtin status semantics still need manual review.',
      'Near-duplicate findings require semantic review; structurally distinct kits can still share the same signature loop.',
      'No claim of gameplay correctness, balance, fun or asset readiness.']};
}


export function normalizePrivateBindings(draft,id) {
  const bindings=new Map();
  const visit=(x,key='')=>{
    if(Array.isArray(x))return x.map(v=>visit(v,key));
    if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,visit(x[k],k)]));
    if(typeof x!=='string')return x;
    if(['statusId','markId'].includes(key)&&x.startsWith(id+'.')) {
      if(!bindings.has(x))bindings.set(x,'private-status-'+bindings.size);
      return bindings.get(x);
    }
    return x.split(id).join('@hero');
  };
  return visit(draft);
}
