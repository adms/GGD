import test from 'node:test';import assert from 'node:assert/strict';import {digest} from './dataset.mjs';import {resolveHeroSource,buildHeroClaimRequest} from './hero-source-client.mjs';
function fixture(){const row=(id,name,extra={})=>({id,name,description:'原文設定',descriptionSha256:digest('原文設定'),sourceSha256:'source',setting:{declaredOrigin:'狂戰',effectiveOrigin:'狂戰',derivedWithoutOverride:'鬥士',originAuthority:'explicit-main-origin-override',attackType:'melee',playstyle:['追擊'],pitch:'前排進攻'},roster:{retired:false,hidden:false,transformed:false,baseId:id,manualRepositoryEligible:true,randomRepositoryEligible:true},...extra});return {schema:'ggd-forge-main-hero-source-inventory@2',revision:'pinned',rows:[row('base','同名英雄'),row('alternate','同名英雄',{roster:{transformed:true,manualRepositoryEligible:false,randomRepositoryEligible:false,baseId:'base'}}),row('hidden','隱藏英雄',{roster:{hidden:true,manualRepositoryEligible:false,randomRepositoryEligible:true,baseId:'hidden'}}),row('empty','缺原文英雄',{description:null,descriptionSha256:null})],missingOld:[{id:'retired',name:'已下架英雄',retired:true}]};}
const request=(query,purpose='source-read')=>({query,purpose,version:'pinned',claim:'目前明確出身為狂戰。'});
test('same-name forms cannot be merged; explicit alternate does not become manual choice',()=>{
 const i=fixture();assert.equal(resolveHeroSource(i,request('同名英雄')).status,'ambiguous');
 assert.equal(resolveHeroSource(i,request('alternate','manual-roster')).status,'unavailable-for-purpose');
 assert.equal(resolveHeroSource(i,request('同名英雄','manual-roster')).heroId,'base');
});
test('hidden/random distinction is repository-only and never live-roster approval',()=>{
 const i=fixture();assert.equal(resolveHeroSource(i,request('hidden','manual-roster')).status,'unavailable-for-purpose');
 const r=resolveHeroSource(i,request('hidden','random-roster'));assert.equal(r.status,'resolved');assert.equal(r.liveRosterQualified,false);assert.equal(r.automaticActivation,false);
});
test('retired, missing text and unknown source never create model requests',()=>{
 for(const q of ['retired','empty','unknown'])assert.equal(buildHeroClaimRequest(fixture(),request(q)).request,null);
});
test('current explicit origin is preserved; stale versions and description mutations fail',()=>{
 const i=fixture(),r=buildHeroClaimRequest(i,request('base'));const payload=JSON.parse(r.request.messages[1].content),facts=JSON.parse(payload.source.text);
 assert.equal(facts.currentSetting.origin,'狂戰');assert(!payload.source.text.includes('derivedWithoutOverride'));
 assert.throws(()=>resolveHeroSource(i,{...request('base'),version:'older'}));i.rows[0].description+='改動';assert.throws(()=>resolveHeroSource(i,request('base')));
});
