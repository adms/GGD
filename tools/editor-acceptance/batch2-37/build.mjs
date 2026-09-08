import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { roster } from './roster.mjs';
import { recipe,shippedStatusPresets } from './recipes.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const write=(path,value)=>{const full=resolve(output,path);mkdirSync(dirname(full),{recursive:true});if(path==='report.json'&&existsSync(full)){const old=readFileSync(full);const history=resolve(output,'build-history');mkdirSync(history,{recursive:true});writeFileSync(resolve(history,sha(old)+'.json'),old);}writeFileSync(full,JSON.stringify(value,null,2)+'\n');};
const [planApi,projectApi,gen,versions,presentation,forge,ability,baselineApi,scenario] = await Promise.all([
  'heroForge/plan.ts','heroForge/schema.ts','heroForge/generator.ts','heroForge/templateVersions.ts',
  'heroForge/presentation.ts','heroForge.ts','schema/ability.ts','heroForge/simulationBaseline.ts','heroForge/scenario.ts'
].map(path=>import(resolve(root,'packages/shared/src/content',path))));
const decisions=read('tools/editor-acceptance/batch2-37/decisions.json');
const sources=readdirSync(resolve(root,'tools/editor-acceptance/batch2-37')).filter(f=>/\.(mjs|json)$/.test(f)).sort();
const sourceHashes=Object.fromEntries(sources.map(f=>[f,sha(readFileSync(resolve(root,'tools/editor-acceptance/batch2-37',f)))]));
// A docs-only commit must not invalidate otherwise identical runtime evidence.
const engineCommit=execFileSync('git',['log','-1','--format=%H','--','packages/shared/src'],{cwd:root,encoding:'utf8'}).trim();
const documents=new Map();
for(const collection of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name)) {
  for(const name of readdirSync(resolve(root,'content',collection))) {
    if(!name.endsWith('.json')||name.startsWith('_'))continue;
    const doc=read(`content/${collection}/${name}`);
    if(doc.id)documents.set(`${collection}/${doc.id}`,doc);
  }
}
const templates=[...documents].filter(([key])=>key.startsWith('ability-templates/')).map(([,d])=>d);
const configs=[...documents].filter(([key])=>key.startsWith('config/')).map(([,d])=>d);
const presets=shippedStatusPresets(root);
assert.equal(roster.length,37);assert.equal(new Set(roster.map(h=>h.id)).size,37);
const templateById=new Map(templates.map(t=>[t.id,t]));
const slots=['PASSIVE','Q','W','E','R','EX'];
const sections=['identity','attributes','skills','mechanics','presentation','validation','package'];
const report={schema:'ggd-batch2-37-build-report@1',engineCommit,sourceHashes,
  catalogDigest:sha([...documents].sort(([a],[b])=>a.localeCompare(b,'en'))),
  partition:'external-evaluation-only',trainEligible:false,heroCount:37,slotCount:222,
  limits:['Compilation and basic scenarios do not prove full semantics, balance, asset readiness or live game acceptance.',
    'No custom status documents, registered templates, engine mechanics or resource systems are added.',
    'Teacher self-review, cross-slot behavior, packaging and asset review remain separate admission gates.'],heroes:[],failures:[]};
let baseline;
try {baseline=baselineApi.createHeroSimulationBaseline(documents);report.baseline={digest:baseline.digest,counts:baseline.counts};}
catch(error){report.baselineError=String(error);}
const authoringCatalog={schema:'ggd-batch2-public-catalog@1',engineCommit,
  templates:templates.filter(t=>t.status==='enabled'),statuses:[...documents].filter(([key])=>key.startsWith('status-effects/')).map(([,d])=>d),
  presetSources:presets,origins:planApi.ORIGINS,archetypes:planApi.ARCHETYPES,
  proxyModels:['champ.sela','champ.thorne'].map(id=>documents.get(`models/${id}`)),
  vfx:['fx.prim.arcane.slash','fx.prim.arcane.bolt','fx.prim.arcane.dash','fx.prim.arcane.nova','fx.prim.wind.pulse-sm','fx.prim.void.nova','fx.prim.arcane.pulse-sm'].map(id=>documents.get(`vfx/${id}`)),
  rules:'只能重用已提供的合法模板、狀態與參數；VFX 只做模板選用，不調微粒參數。代理模型不能宣稱是原作外觀或電車。'};
write('public/catalog.json',authoringCatalog);
report.publicCatalogSha256=sha(authoringCatalog);
write('decisions.json',decisions);
for(const hero of roster) {
  const result={number:hero.number,id:hero.id,name:hero.name,schema:false,compile:false,basicKit:false,admitted:false};
  report.heroes.push(result);
  try {
    const sourceLock={canonicalId:null,versionId:null};
    const pres=presentation.defaultHeroPresentation();
    pres.modelKey=['法師','軟輔','法鬥'].includes(hero.origin)?'champ.sela':'champ.thorne';
    const slotPlans=Object.fromEntries(hero.moves.map(move=>{
      const r=recipe(move,hero,presets),tpl=templateById.get(r.template.ref);
      assert.equal(tpl?.status,'enabled',`Template unavailable: ${r.template.ref}`);
      if(move.slot!=='PASSIVE') {
        assert(documents.has(`vfx/${r.visual.vfxKey}`),'VFX_NOT_IN_CATALOG');
        pres.slots[move.slot].vfxLayers=[r.visual];
        const aid=`${hero.id}.${move.slot.toLowerCase()}`;
        pres.slots[move.slot].script={schema:'vfx-script@1',id:aid,abilityId:aid,segments:[{kind:'anim',on:'castStart',at:'caster',pulse:'cast'}]};
      }
      return [move.slot,{slot:move.slot,name:r.name,purpose:r.purpose,maxRank:ability.defaultAbilityMaxRank(move.slot),
        products:[{instanceId:`${hero.id}.${move.slot.toLowerCase()}.main`,template:r.template}],
        abilityOverrides:{provenance:'editor-json',...r.bands},templateConflictPolicy:'reject',
        tuning:{cooldownSec:move.slot==='PASSIVE'?0:10,manaCost:move.slot==='PASSIVE'?0:40,range:move.slot==='PASSIVE'?0:6},
        capabilityIds:[],directionOptionIds:[],fallbackOptionIds:[]}];
    }));
    const plan=versions.pinHeroPlanTemplates(planApi.zHeroPlan.parse({schema:'ggd-hero-plan@2',planId:`${hero.id}.plan`,
      title:hero.name,summary:`${hero.work}｜${hero.theme}。GGD 惡搞改編，角色辨識元素與招式創編分開。`,sourceLock,
      origin:hero.origin,archetype:forge.archetypeForOrigin(hero.origin),attackType:forge.ORIGIN_ATTACK_TYPE[hero.origin]??(['軟輔'].includes(hero.origin)?'ranged':'melee'),
      budget:{power:60,complexity:35},statOverrides:{},slots:slotPlans}),templates);
    const project=projectApi.zHeroProject.parse({schema:'ggd-hero-project@2',projectId:hero.id,revision:1,sourceLock,
      brief:{name:hero.name,concept:plan.summary,moveNames:Object.fromEntries(hero.moves.map(m=>[m.slot,m.name]))},acceptedPlan:plan,presentation:pres,
      sections:Object.fromEntries(sections.map(s=>[s,{revision:1,state:'draft',fieldOwnership:{}}])),
      validationState:Object.fromEntries(sections.map(s=>[s,{revision:1,status:'idle',diagnosticCodes:[]}])),receipts:[]});
    result.schema=true;
    const generated=gen.generateHeroDraft(plan,{heroId:hero.id,heroName:hero.name,presentation:pres});
    const compiled=gen.compileGeneratedHeroDraft(generated,templates,configs);
    assert(compiled.ok,JSON.stringify(compiled.failures));
    result.compile=true;
    // Tier resolution is authoritative. Keep the editable numeric mirrors in
    // the teacher consistent with the actual compiler, not generic UI defaults.
    for(const slot of slots){const a=compiled.draft.abilityDrafts[slot];project.acceptedPlan.slots[slot].tuning={cooldownSec:a.cooldown[0]??0,manaCost:a.manaCost[0]??0,range:a.range};}
    projectApi.zHeroProject.parse(project);
    const roundtrip=gen.compileGeneratedHeroDraft(gen.generateHeroDraft(project.acceptedPlan,{heroId:hero.id,heroName:hero.name,presentation:pres}),templates,configs);
    assert(roundtrip.ok);assert.equal(sha(roundtrip.draft),sha(compiled.draft),'TUNING_MIRROR_CHANGED_RUNTIME');
    const prompts={id:hero.id,name:hero.name,work:hero.work,theme:hero.theme,origin:hero.origin,
      task:'產生一名完整可執行英雄：出身屬性、PASSIVE/Q/W/E/R/EX、機制／特效模板綁定。大膽惡搞、符合定位、至少兩條簡單有條件連動；只用附帶目錄，不新增標籤／模板／引擎功能。',
      evaluation:'允許不同招式名稱與合理等效組合，不要求猜中教師私有設計。完整英雄按需求與真實行為評分；語意與趣味另行審查。',
      outputSchema:'ggd-hero-project@2',
      appearancePolicy:'可使用目錄內核准代理本體進行機制驗證，但必須明列外觀尚未完成；不得杜撰資產路徑。',
      ...(hero.id==='b2-kisaragi'?{requirements:decisions.trainUltimate}:{}),catalog:'../catalog.json'};
    write(`public/prompts/${hero.id}.json`,prompts);
    result.promptSha256=sha(prompts);
    write(`private/teachers/${hero.id}.project.json`,project);
    write(`private/compiled/${hero.id}.json`,compiled.draft);
    result.projectSha256=sha(project);result.compiledSha256=sha(compiled.draft);
    result.model={key:pres.modelKey,kind:'explicit-proxy',characterAppearanceVerified:false};
    result.review={status:'pending',reason:'Full per-hero reading and cross-slot evidence not yet completed.'};
    if(baseline) {
      const kit=scenario.runHeroKitScenario(compiled.draft.champion,compiled.draft.abilityDrafts,{baseline,seed:1234,ticksPerStep:120});
      result.basicKit=kit.status==='accepted';
      write(`private/evidence/${hero.id}.basic-kit.json`,kit);
      if(!result.basicKit)result.kitRejections=kit.rejectionReasonsBySlot;
    }
    console.log(`${hero.number.toString().padStart(2,'0')} ${hero.name}: schema=${result.schema} compile=${result.compile} basicKit=${result.basicKit}`);
  }catch(error){result.error=String(error);report.failures.push({id:hero.id,error:result.error});console.error(hero.id,result.error);}
}
report.counts={schema:report.heroes.filter(h=>h.schema).length,compile:report.heroes.filter(h=>h.compile).length,
  basicKit:report.heroes.filter(h=>h.basicKit).length,admitted:report.heroes.filter(h=>h.admitted).length};
write('report.json',report);
console.log(JSON.stringify(report.counts));
if(report.failures.length||!baseline||report.counts.basicKit!==37)process.exitCode=1;
