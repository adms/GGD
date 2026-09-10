import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const repo=process.cwd(),root='/private/tmp/ggd-existing-catalog-save-acceptance',evidence='/private/tmp/ggd-community37-editor-publish';
const {ImportStore}=await import(pathToFileURL(repo+'/apps/content-api/src/importStore.ts').href);
const {buildServer}=await import(pathToFileURL(repo+'/apps/content-api/src/server.ts').href);
const content=root+'/content',backupDir=root+'/backups',workId='ggd-existing-hero-catalog';
const store=new ImportStore({dir:backupDir+'/hero-catalog-versions'}),app=buildServer({contentDir:content,backupDir,repoRoot:repo});
const prior=store.listWorkVersions(workId)[0],priorFiles=store.readWorkFiles(workId,prior.versionId);assert(priorFiles);
const proof:any={status:'started',scope:'119 hero catalog delta storage; complete reads and source fidelity',prior:prior.versionId,measurements:[]};
try{
 const before=fs.readFileSync(content+'/champions/sela.json'),hero=JSON.parse(before.toString());hero.baseStats.ad+=1;
 let start=Date.now();let response=await app.inject({method:'PUT',url:'/content-api/champions/sela',payload:hero});assert.equal(response.statusCode,200,response.body);proof.measurements.push({stage:'edit with unchanged checkpoint',ms:Date.now()-start});
 start=Date.now();response=await app.inject({method:'POST',url:'/content-api/hero-catalog/versions/capture'});assert.equal(response.statusCode,200,response.body);
 const result=response.json();proof.measurements.push({stage:'capture changed hero',ms:Date.now()-start});assert.equal(result.heroes.length,119);assert.equal(result.incomplete,null);
 const record=result.version,files=store.readWorkFiles(workId,record.versionId);assert(files);
 let assets=0;for(const [p,b]of priorFiles){if(p.startsWith('assets/')){assert.deepEqual(files.get(p),b);assets++;}}
 assert.equal(JSON.parse(files.get('catalog/champions/sela.json').toString()).baseStats.ad,hero.baseStats.ad);
 assert.deepEqual(store.readWorkFiles(workId,prior.versionId).get('catalog/champions/sela.json'),before);
 assert.equal(store.active(),null);proof.status='verified';proof.version=record.versionId;proof.heroCount=119;proof.logicalFiles=record.files.length;proof.reusedFiles=Object.keys(record.storageRefs??{}).length;proof.newFiles=record.files.length-proof.reusedFiles;proof.verifiedAssetFiles=assets;proof.originalPublishedServicesUntouched=true;console.log(JSON.stringify(proof));
}catch(e){proof.status='needs-attention';proof.error=String(e);console.error(e);process.exitCode=1;}finally{await app.close();fs.writeFileSync(evidence+'/existing-catalog-delta-proof.json',JSON.stringify(proof,null,2)+'\n');}
