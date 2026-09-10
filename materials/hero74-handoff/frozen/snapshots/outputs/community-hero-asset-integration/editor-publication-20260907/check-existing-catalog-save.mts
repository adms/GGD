import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const repo=process.cwd(),root='/private/tmp/ggd-existing-catalog-save-acceptance',evidence='/private/tmp/ggd-community37-editor-publish';
const receipt=JSON.parse(fs.readFileSync(evidence+'/existing-catalog-baseline.json','utf8'));
const {ImportStore}=await import(pathToFileURL(repo+'/apps/content-api/src/importStore.ts').href);
const {buildServer}=await import(pathToFileURL(repo+'/apps/content-api/src/server.ts').href);
const saved=new ImportStore({dir:receipt.workspaceStore}),files=saved.readWorkFiles(receipt.workId,receipt.versionId);assert(files);
assert(!fs.existsSync(root),'acceptance directory must be new');fs.mkdirSync(root,{recursive:true});
const content=root+'/content',backups=root+'/backups';
for(const [p,data]of files){if(p==='catalog-version.json'||p==='catalog/overlay.json'||p.startsWith('overlay/'))continue;const rel=p.startsWith('catalog/')?p.slice(8):p;const target=path.join(content,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
const beforeHero=fs.readFileSync(content+'/champions/sela.json'),beforeAbility=fs.readFileSync(content+'/abilities/sela.q.json');
const app=buildServer({contentDir:content,backupDir:backups,repoRoot:repo});const store=new ImportStore({dir:backups+'/hero-catalog-versions'});
const workId='ggd-existing-hero-catalog',proof={status:'started',scope:'Existing catalog automatic before-write retention; no per-hero runtime restore claimed',sourceVersion:receipt.versionId,versions:[]};
try{
 const hero=JSON.parse(beforeHero.toString());hero.name+='（版本驗收）';hero.baseStats.ad+=1;
 let start=Date.now();const update=await app.inject({method:'PUT',url:'/content-api/champions/sela',payload:hero});assert.equal(update.statusCode,200,update.body);
 let rows=store.listWorkVersions(workId);assert.equal(rows.length,1);let version=rows[0];let manifest=JSON.parse(store.readWorkFile(workId,version.versionId,'catalog-version.json').toString());assert.equal(new Set(manifest.heroes.map(h=>h.id)).size,119);assert.deepEqual(store.readWorkFile(workId,version.versionId,'catalog/champions/sela.json'),beforeHero);assert.equal(manifest.incomplete,undefined);
 proof.versions.push({stage:'before hero edit',id:version.versionId,heroes:119,files:version.files.length,ms:Date.now()-start});
 const ability=JSON.parse(beforeAbility.toString());ability.cooldown[0]+=1;start=Date.now();const skill=await app.inject({method:'PATCH',url:'/content-api/abilities/sela.q',payload:{cooldown:ability.cooldown}});assert.equal(skill.statusCode,200,skill.body);
 rows=store.listWorkVersions(workId);assert.equal(rows.length,2);version=rows[0];assert.deepEqual(store.readWorkFile(workId,version.versionId,'catalog/abilities/sela.q.json'),beforeAbility);assert.equal(JSON.parse(store.readWorkFile(workId,version.versionId,'catalog/champions/sela.json').toString()).name,hero.name);
 proof.versions.push({stage:'before skill edit',id:version.versionId,files:version.files.length,ms:Date.now()-start});
 const current=await app.inject({method:'POST',url:'/content-api/hero-catalog/versions/capture'});assert.equal(current.statusCode,200,current.body);assert.equal(current.json().heroes.length,119);assert.equal(current.json().incomplete,null);proof.versions.push({stage:'current',id:current.json().version.versionId,files:current.json().version.files.length});
 const first=store.readWorkFiles(workId,proof.versions[0].id);const assetFacts=receipt.heroes.length;let checkedAssets=0;for(const [p,bytes]of files){if(p.startsWith('assets/')){assert.deepEqual(first.get(p),bytes);checkedAssets++;}}
 assert.equal(store.active(),null);proof.assetFilesIdentical=checkedAssets;proof.sourceAndAbilityBytesPreserved=true;proof.originalPublishedServicesUntouched=true;proof.status='verified';console.log(JSON.stringify(proof));
}catch(error){proof.status='needs-attention';proof.error=String(error);console.error(error);process.exitCode=1;}finally{await app.close();fs.writeFileSync(evidence+'/existing-catalog-save-proof.json',JSON.stringify(proof,null,2)+'\n');}
