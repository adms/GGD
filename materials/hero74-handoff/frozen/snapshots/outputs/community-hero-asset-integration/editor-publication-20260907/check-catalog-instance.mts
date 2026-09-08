import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const repo=process.cwd(),root='/private/tmp/ggd-existing-catalog-save-acceptance',evidence='/private/tmp/ggd-community37-editor-publish';
const {ImportStore}=await import(pathToFileURL(repo+'/apps/content-api/src/importStore.ts').href);
const {buildServer}=await import(pathToFileURL(repo+'/apps/content-api/src/server.ts').href);
const {readHeroCatalog}=await import(pathToFileURL(repo+'/apps/content-api/src/catalogVersions.ts').href);
const {projectCatalogHero}=await import(pathToFileURL(repo+'/apps/content-api/src/catalogHero.ts').href);
const content=root+'/content',backupDir=root+'/backups',workId='ggd-existing-hero-catalog';
const store=new ImportStore({dir:backupDir+'/hero-catalog-versions'}),app=buildServer({contentDir:content,backupDir,repoRoot:repo});
const baseline=JSON.parse(fs.readFileSync(evidence+'/existing-catalog-save-proof.json','utf8')).versions[0].id,heroPath='catalog/champions/sela.json';
const before=readHeroCatalog(content,{gameRevision:'unversioned-local-authoring',allowIncomplete:true}),original=store.readWorkFiles(workId,baseline);assert(original);
const proof:any={status:'started',scope:'Existing hero independent instantiation and restore; no UI/gameplay proof',hero:'sela',sourceVersion:baseline,beforeVersion:before.versionId};
try{
 const previewResponse=await app.inject({method:'POST',url:'/content-api/hero-catalog/preview',payload:{heroPath,versionId:baseline}});assert.equal(previewResponse.statusCode,200,previewResponse.body);
 const plan=previewResponse.json();assert.deepEqual(plan.issues,[]);assert.deepEqual(plan.blockedSources,[]);assert.deepEqual(plan.affected.map(h=>h.id),['sela']);
 const start=Date.now(),response=await app.inject({method:'POST',url:'/content-api/hero-catalog/restore',payload:{heroPath,versionId:baseline,expectedCurrentVersion:plan.currentVersion,planDigest:plan.planDigest}});assert.equal(response.statusCode,200,response.body);proof.ms=Date.now()-start;
 const after=readHeroCatalog(content,{gameRevision:'unversioned-local-authoring',allowIncomplete:true});let unchanged=0;
 for(const [path,bytes]of before.files){if(path===heroPath||path==='catalog-version.json'||path==='catalog/manifest.json'||path==='catalog/assets-manifest.json'||path.endsWith('/_index.json'))continue;
  if(path==='catalog/config/audio-map.json'){const a=JSON.parse(Buffer.from(bytes).toString()),b=JSON.parse(Buffer.from(after.files.get(path)).toString());for(const [key,value]of Object.entries(a.sfx))assert.deepEqual(b.sfx[key],value);continue;}
  assert.deepEqual(after.files.get(path),bytes,'other existing file changed: '+path);unchanged++;
 }
 const hero=JSON.parse(Buffer.from(after.files.get(heroPath)).toString()),oldHero=JSON.parse(Buffer.from(original.get(heroPath)).toString());
 assert.equal(hero.id,oldHero.id);assert.equal(hero.name,oldHero.name);assert.deepEqual(hero.baseStats,oldHero.baseStats);assert.deepEqual(hero.attributes,oldHero.attributes);
 for(const slot of ['Q','W','E','R']){assert.equal(hero.abilities[slot].name,oldHero.abilities[slot].name);assert.equal(hero.abilities[slot].description,oldHero.abilities[slot].description);assert.notEqual(hero.abilities[slot].id,oldHero.abilities[slot].id);assert(after.files.has('catalog/abilities/'+hero.abilities[slot].id+'.json'));}
 assert.notEqual(hero.modelKey,oldHero.modelKey);const model=JSON.parse(Buffer.from(after.files.get('catalog/models/'+hero.modelKey+'.json')).toString()),oldModel=JSON.parse(Buffer.from(original.get('catalog/models/'+oldHero.modelKey+'.json')).toString());assert.deepEqual(model.clipMap,oldModel.clipMap);assert.deepEqual(after.files.get(model.glbPath),original.get(oldModel.glbPath));
 assert.deepEqual(projectCatalogHero(after.files,heroPath).issues,[]);assert.equal(store.active(),null);
 proof.status='verified';proof.resultVersion=response.json().versionId;proof.unchangedExistingFiles=unchanged;proof.privateModel=hero.modelKey;proof.privateAbilities=Object.values(hero.abilities).map((a:any)=>a.id);proof.heroNameAndDescriptionsPreserved=true;proof.sourceTemplatesAndOtherHeroesUntouched=true;proof.assetsAndAnimationBindingsMatchSource=true;proof.changedFiles=plan.changes.length;console.log(JSON.stringify(proof));
}catch(e){proof.status='needs-attention';proof.error=String(e);console.error(e);process.exitCode=1;}finally{await app.close();fs.writeFileSync(evidence+'/existing-catalog-instance-proof.json',JSON.stringify(proof,null,2)+'\n');}
