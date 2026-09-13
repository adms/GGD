#!/usr/bin/env node
/** Read-only audit of every immutable champion model-version reference. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {parseArgs} from 'node:util';
import {contentSha256} from '../../packages/shared/src/content/import/jcs';
import {zChampionDoc} from '../../packages/shared/src/content/schema/champion';
import {zModelDoc} from '../../packages/shared/src/content/schema/model';

const {values}=parseArgs({options:{content:{type:'string',default:'content'},out:{type:'string'}}});
const root=resolve(values.content!),champions=join(root,'champions'),rows:any[]=[],failures:any[]=[];
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
for(const name of readdirSync(champions).filter(name=>name.endsWith('.json')&&!name.startsWith('_')).sort()){
 let champion;
 try{champion=zChampionDoc.parse(JSON.parse(readFileSync(join(champions,name),'utf8')))}catch(error){failures.push({championFile:name,error:String(error)});continue}
 const versions=champion.modelVersions??[];
 if(versions.length)assert.ok(versions.some(version=>version.modelKey===champion.modelKey),`${champion.id}: active model is absent from immutable history`);
 for(const version of versions){
  try{
   const docPath=join(root,'models',version.modelKey+'.json'),docBytes=readFileSync(docPath),doc=zModelDoc.parse(JSON.parse(docBytes.toString('utf8')));
   assert.equal(doc.id,version.modelKey);const modelSha=contentSha256(doc).slice(7);assert.equal(modelSha,version.modelSha256);
   const glbPath=join(root,doc.glbPath),glb=readFileSync(glbPath),binarySha=sha(glb);assert.equal(binarySha,version.binarySha256);
   rows.push({championId:champion.id,active:champion.modelKey===version.modelKey,versionModelKey:version.modelKey,sourceModelKey:version.sourceModelKey,modelSha256:modelSha,modelDocumentPath:docPath,modelDocumentBytes:docBytes.length,modelDocumentFileSha256:sha(docBytes),binarySha256:binarySha,glbPath,glbBytes:statSync(glbPath).size});
  }catch(error){failures.push({championId:champion.id,versionModelKey:version.modelKey,error:String(error)})}
 }
}
const result={schema:'ggd-all-model-version-integrity@1',contentRoot:root,championsWithVersions:new Set(rows.map(row=>row.championId)).size,versionReferences:rows.length,verified:rows.length,failed:failures.length,allVerified:failures.length===0,rows,failures};
if(values.out)writeFileSync(resolve(values.out),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({championsWithVersions:result.championsWithVersions,versionReferences:result.versionReferences,verified:result.verified,failed:result.failed,allVerified:result.allVerified}));
if(failures.length)process.exitCode=1;
