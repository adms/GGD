/** CPU-only contract reproducer. No source fixes, generated content, GPU or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {register} from 'tsx/esm/api';
const unregister=register();
// Initialize the same entry graph as SimWorld tests before reading cyclic effect handlers.
await import('../../packages/shared/src/sim/SimWorld.ts');
const {randomAreaEffect}=await import('../../packages/shared/src/sim/effects/randomArea.ts');
const {Rng}=await import('../../packages/shared/src/sim/math/rng.ts');
assert.equal(process.argv.length,3,'USAGE: node tools/editor-acceptance/hero-ground-barrage-repro.mjs --expect-source-point|--verify-controls');
const mode=process.argv[2];assert(['--expect-source-point','--verify-controls'].includes(mode),'UNKNOWN_MODE');
const sourceFile=new URL('../../packages/shared/src/sim/effects/randomArea.ts',import.meta.url);
const rows=[];
for(const seed of [20260908,20260909])for(const target of ['empty','entity','self']){
  // Minimal valid scheduler context, not a full SimWorld/game acceptance test.
  const caster={x:0,z:0},requested={x:6,z:0},entity={x:3,z:0};
  const world={tick:0,dt:1/30,randomArea:[],transform:new Map([[1,{pos:caster,zone:0}],[2,{pos:entity,zone:0}]])};
  randomAreaEffect.apply({kind:'randomArea',who:target==='self'?'self':'target',count:[6],intervalSec:0.2,
    scatterRadius:0.5,firstAtCast:true,effects:[]},
  {world,castInstance:1,caster:1,rank:1,origin:'research:barrage-ground-anchor',abilitySlot:'R',
    targets:target==='entity'?[2]:[],point:requested,rng:new Rng(seed)});
  assert.equal(world.randomArea.length,1);const impacts=world.randomArea[0].impacts;
  assert.equal(impacts.length,6);assert.deepEqual(impacts.map(p=>p.atTick),[0,6,12,18,24,30]);
  const inside=p=>impacts.every(s=>Math.hypot(s.pos.x-p.x,s.pos.z-p.z)<=0.500001);
  rows.push({seed,target,requested,caster,entity,impacts,
    insideRequestedPoint:inside(requested),insideCaster:inside(caster),insideEntity:inside(entity)});
}
const controlsPass=rows.filter(r=>r.target!=='empty').every(r=>r.target==='entity'?r.insideEntity:r.insideCaster);
const emptyGroundSourcePass=rows.filter(r=>r.target==='empty').every(r=>r.insideRequestedPoint);
console.log(JSON.stringify({schema:'ggd-ground-barrage-minimal-repro@1',mode,
  randomAreaSourceSha256:createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),
  controlsPass,emptyGroundSourcePass,rows,
  scope:'Unmodified scheduler called with minimal contexts. Full compiled-hero evidence is archived separately.',
  conclusion:emptyGroundSourcePass?'source-point-requirement-met':'who:target does not preserve an empty selected ground point',
  existingSelfOrEntityContractDeclaredRegression:false,modelInference:false,modelTraining:false},null,2));
if(!controlsPass||(mode==='--expect-source-point'&&!emptyGroundSourcePass))process.exitCode=1;
await unregister();
