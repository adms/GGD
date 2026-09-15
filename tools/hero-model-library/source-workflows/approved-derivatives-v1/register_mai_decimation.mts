import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";
import { uploadedHeroModelDoc, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { fileJson } from "../../../../packages/shared/src/content/node";

const [repoArg, candidateArg, mode] = process.argv.slice(2);
if (!repoArg || !candidateArg || !["--plan", "--apply"].includes(mode)) throw new Error("usage: register_mai_decimation.mts <repo> <candidate.glb> --plan|--apply");
const repo=resolve(repoArg),candidate=resolve(candidateArg),content=join(repo,"content"),heroId="community-review-03-20260907";
const championPath=join(content,"champions",`${heroId}.json`),champion=JSON.parse(readFileSync(championPath,"utf8"));
const previous=champion.modelVersions.find((row:any)=>row.modelKey===champion.modelKey);
assert.equal(previous?.source?.reference,"derivative:mai");
const bytes=new Uint8Array(readFileSync(candidate));
const descriptor={schema:"ggd-uploaded-hero-model@1" as const,sha256:"227cd7fadd66fa7c622f897b13ac6b93471347796034c9af7377f6803e6928e4",byteSize:bytes.length,clipMap:JSON.parse(readFileSync(join(content,"models",`${previous.modelKey}.json`),"utf8")).clipMap,yawOffsetDeg:0};
assert.equal(bytes.length,1149836);await verifyUploadedHeroModel(descriptor,bytes);
const sourceDoc=uploadedHeroModelDoc(descriptor),sourceAsset=join(content,sourceDoc.glbPath),sourceDocPath=join(content,"models",`${sourceDoc.id}.json`);
const source={kind:"style-proxy" as const,character:"不知火舞（獨立副本／真田幸村，7,994 面正式版）",work:"百花繚亂 SAMURAI GIRLS",library:"300heroes",reference:"derivative:mai",tier:"300heroes" as const,selectionClass:"manual" as const,sourceGame:"300英雄",sourcePlatform:"Windows"};
const service=new ModelVersions(content),before=service.state(heroId);
const existing=before.versions.find(row=>row.binarySha256===descriptor.sha256&&row.source.reference==="derivative:mai");
if(existing){console.log(JSON.stringify({status:"already-registered",modelKey:existing.modelKey,activeModelKey:before.activeModelKey}));process.exit(0);}
// ModelVersions needs the source in the content tree.  Plan mode therefore
// reports the deterministic source paths; apply mode stages them without ever
// overwriting existing bytes, then repeats preparation against the staged source.
function publish(path:string,data:Uint8Array){if(existsSync(path)){assert.deepEqual(new Uint8Array(readFileSync(path)),data);return;}mkdirSync(dirname(path),{recursive:true});const tmp=`${path}.${randomUUID()}.tmp`;try{writeFileSync(tmp,data,{flag:"wx"});linkSync(tmp,path);}finally{rmSync(tmp,{force:true});}}
const plan={schema:"ggd.approved-derivative-mai-decimation-registration-plan@1",heroId,sourceModelKey:sourceDoc.id,sourceAsset:sourceDoc.glbPath,sourceSha256:descriptor.sha256,sourceBytes:bytes.length,previousActiveModelKey:before.activeModelKey,selectionMode:before.selectionMode,source,apply:mode==="--apply",productionDeploymentVerified:false};
if(mode==="--plan"){console.log(JSON.stringify(plan,null,2));process.exit(0);}
publish(sourceAsset,bytes);publish(sourceDocPath,new TextEncoder().encode(fileJson(sourceDoc)));
const current=service.state(heroId);
const next=await service.prepare(heroId,zModelVersionCommand.parse({action:"register",expectedHash:current.expectedHash,sourceModelKey:sourceDoc.id,label:source.character,source,automaticEligible:true}));
service.writeArtifacts(next.artifacts);
const raw=readFileSync(championPath,"utf8"),updated=spliceMembers(raw,{modelKey:next.champion.modelKey,modelVersions:next.champion.modelVersions,modelSelectionMode:next.champion.modelSelectionMode}),temporary=`${championPath}.${randomUUID()}.tmp`;
try{writeFileSync(temporary,updated,{flag:"wx"});renameSync(temporary,championPath);}finally{if(existsSync(temporary))unlinkSync(temporary);}
const after=service.state(heroId);for(const version of after.versions)service.verify(version);
assert.equal(after.selectionMode,before.selectionMode);assert.equal(after.activeModelKey,next.artifacts.at(-1)?.version.modelKey);
console.log(JSON.stringify({...plan,status:"registered",afterVersions:after.versions.length,activeModelKey:after.activeModelKey,artifacts:next.artifacts.map(x=>x.version)},null,2));
