/** Local user-nominated branch intake. Does not modify the other worktree or call a model. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function main(){
 const[repo,out]=process.argv.slice(2);assert(path.isAbsolute(repo)&&path.isAbsolute(out));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const git=(args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim(),revision=git(['rev-parse','HEAD']),branch=git(['branch','--show-current']);
 const source='packages/shared/src/content/heroForge/communityExamples.ts';
 const pinPaths=[source,'packages/shared/src/content/heroForge/communityExamples.test.ts','packages/shared/src/content/heroForge/communityPassives.test.ts','packages/shared/src/content/import/heroPackage.ts','packages/shared/src/content/heroForge/generator.ts','packages/shared/src/content/templates/expand.ts','packages/shared/testkit/heroPackageFixture.ts','docs/_reports/community-hero-forge/community-concepts/deterministic/proof.json'];
 const originals=new Map(pinPaths.map(p=>[p,fs.readFileSync(path.join(repo,p))]));
 const load=(p:string)=>import(pathToFileURL(path.join(repo,p)).href);
 const{COMMUNITY_HERO_EXAMPLES,createCommunityHeroExample}=await load(source),{shippedHeroCatalog}=await load('packages/shared/testkit/heroPackageFixture.ts'),{compileHeroPackageProject}=await load('packages/shared/src/content/import/heroPackage.ts');
 const expected=['warwick','karthus','lux','yasuo','missfortune','leesin','xerath'];assert.deepEqual(COMMUNITY_HERO_EXAMPLES.map((x:any)=>x.id),expected);
 const catalog=shippedHeroCatalog(),templates=[...catalog.documents.entries()].filter(([k]:[string,unknown])=>k.startsWith('ability-templates/')).map(([,d]:[string,unknown])=>d);
 const catalogDigest=hash(JSON.stringify([...catalog.documents].sort(([a],[b])=>a.localeCompare(b))));
 // Split solely by seeded identity before any claim authoring or model measurement.
 const order=expected.slice().sort((a,b)=>hash('20260906-community-source-v1:'+a).localeCompare(hash('20260906-community-source-v1:'+b)));
 const split=Object.fromEntries(order.map((id,i)=>[id,i<4?'train':i<5?'dev':'test']));
 const rows=COMMUNITY_HERO_EXAMPLES.map((recipe:any)=>{
  const project=createCommunityHeroExample(recipe.id,'finetune-source-'+recipe.id,templates),{compiled}=compileHeroPackageProject(project,catalog,false);
  assert.deepEqual(Object.keys(compiled.abilityDrafts),['PASSIVE','Q','W','E','R','EX']);
  assert.equal(project.brief.name,recipe.name);
  for(const[slot,def]of Object.entries(recipe.moves)as[string,any][]){assert.equal(compiled.abilityDrafts[slot].description,def.purpose);assert.equal(project.acceptedPlan.slots[slot].products[0].template.ref,def.ref);}
  return{id:recipe.id,split:split[recipe.id],recipe:structuredClone(recipe),project,compiled:structuredClone(compiled),templates:templates.filter((t:any)=>Object.values(recipe.moves).some((d:any)=>d.ref===t.id)),sourceText:[`角色：${recipe.name}`,`出身：${recipe.origin}`,recipe.summary,'GGD改編設定：',...recipe.adaptations,...Object.entries(recipe.moves).map(([slot,def]:[string,any])=>`${slot} ${def.name}：${def.purpose}`)].join('\n')};
 });
 for(const[p,bytes]of originals)assert(fs.readFileSync(path.join(repo,p)).equals(bytes),'SOURCE_CHANGED_DURING_SNAPSHOT:'+p);assert.equal(git(['rev-parse','HEAD']),revision,'REVISION_CHANGED');
 const manifest={schema:'ggd-community-training-source-intake@1',createdAt:new Date().toISOString(),repo,branch,revision,sourceSha256:hash(originals.get(source)!),workingTreePatch:git(['diff','--',source]),pins:[...originals].map(([p,b])=>({path:p,sha256:hash(b)})),catalogDigest,splitOrder:order,split,heroCount:rows.length,slotCount:rows.reduce((s:number,r:any)=>s+Object.keys(r.recipe.moves).length,0),sourceAuthority:'User-nominated branch-authored GGD adaptations; not Riot canonical abilities or independent latest Owner Gold.',compileChecked:true,newRuntimeSimulationPerformed:false,oldRuntimeProof:'snapshots/docs/_reports/community-hero-forge/community-concepts/deterministic/proof.json',dataAdmission:'pending personal per-claim review and version/capability checks; this snapshot does not authorize training itself',networkCalls:0,trainingCalls:0,releaseQualified:false};
 fs.mkdirSync(out,{recursive:true});for(const[p,bytes]of originals){const target=path.join(out,'snapshots',p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
 for(const[n,v]of [['manifest.json',manifest],['heroes.json',rows]])fs.writeFileSync(path.join(out,n as string),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 const lines=['# 七位GGD改編角色：完整來源快照','','逐角色切分在出題／模型評估前由固定seed決定；相同角色六槽不跨split。來源是支線改編稿，不以LoL記憶或網頁補完設定。compile成功不是每句機制已被runtime驗證。','',...rows.flatMap((r:any)=>[`## ${r.recipe.name} (${r.id}) — ${r.split}`,'',r.sourceText,'','模板與作者額外效果：',...Object.entries(r.recipe.moves).map(([s,d]:[string,any])=>`- ${s}: ${d.ref}; params=${JSON.stringify(d.params)}; authorEffects=${JSON.stringify(d.effects??[])}`),''])];
 fs.writeFileSync(path.join(out,'SOURCE_REVIEW.md'),lines.join('\n'),{flag:'wx'});console.log(JSON.stringify({out,revision,branch,sourceSha256:manifest.sourceSha256,heroCount:manifest.heroCount,slotCount:manifest.slotCount,split,compileChecked:true,newRuntimeSimulationPerformed:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
