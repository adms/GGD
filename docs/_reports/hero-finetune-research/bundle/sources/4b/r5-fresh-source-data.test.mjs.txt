import test from 'node:test';import assert from 'node:assert/strict';
import {buildFresh,seeds} from './r5-fresh-source-data.mjs';import {sourceGroup} from './r3-data.mjs';
test('fresh diagnostics preserve full source, separate tiers and reject prior source exposure',()=>{
 const sources=seeds.map(([short,anchor])=>({id:'godie-'+short,name:short,description:anchor+'\n「台詞」',provenance:'fixture-not-semantic-proof'}));
 const splits=Object.fromEntries(sources.map(s=>[sourceGroup(s.id),'test']));
 const {cases,review}=buildFresh(sources,[],splits);assert.equal(cases.length,seeds.length*3);
 assert(cases.every(c=>!c.trainingApproved&&c.split==='test'&&c.messages[0].role==='system'));
 assert(review.every(r=>r.source.description.endsWith('「台詞」')&&!r.input.source.text.includes('台詞')&&!r.ownerGold));
 assert.throws(()=>buildFresh(sources,[{sourceId:sources[0].id}],splits),/PREVIOUS_SOURCE_EXPOSURE/);
 assert.throws(()=>buildFresh(sources,[],{...splits,[sourceGroup(sources[0].id)]:'train'}),/FAMILY_NOT_HELD_OUT/);
});
