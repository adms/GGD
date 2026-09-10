import { pathToFileURL } from 'node:url';
const repo=process.cwd();
const { readHeroCatalog }=await import(pathToFileURL(repo+'/apps/content-api/src/catalogVersions.ts').href);
const { projectCatalogHero, catalogHeroes }=await import(pathToFileURL(repo+'/apps/content-api/src/catalogHero.ts').href);
const snapshot=readHeroCatalog('/private/tmp/ggd-existing-catalog-save-acceptance/content',{gameRevision:'unversioned-local-authoring',allowIncomplete:true});
const heroes=catalogHeroes(snapshot.files);const result=heroes.map(h=>{const p=projectCatalogHero(snapshot.files,h.path);return {id:h.id,catalog:h.catalog,files:p.files.size,issues:p.issues};});
console.log(JSON.stringify({heroes:result.length,withIssues:result.filter(x=>x.issues.length).length,sela:result.find(x=>x.id==='sela'),firstIssues:result.filter(x=>x.issues.length).slice(0,3)}));
