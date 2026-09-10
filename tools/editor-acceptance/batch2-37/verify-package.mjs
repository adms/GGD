import {register} from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,dirname,sep,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
import {verifyProjectUploadedBody} from './assets.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Sources are read-only; each actual ZIP carries the exact referenced bytes.
const assetRoots=[resolve(root,'content'),resolve(process.argv[2]??resolve(root,'../GGD-community-hero-forge/content'))];
const [api,zip,reader]=await Promise.all(['heroPackage.ts','packageZip.ts','readPackageZip.ts'].map(p=>import(resolve(root,'packages/shared/src/content/import',p))));
const documents=new Map(),documentSources=new Map();
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const full=resolve(root,'content',c,f),raw=readFileSync(full),d=JSON.parse(raw);if(d.id){documents.set(`${c}/${d.id}`,d);documentSources.set(`${c}/${d.id}`,{path:relative(root,full),sha256:createHash('sha256').update(raw).digest('hex'),bytes:raw.length});}}
const build=read('report.json');
// This is an explicitly offline target, not a receipt for any deployed importer.
const target={gameRevision:build.engineCommit,contentVersion:`offline-evaluation:${build.catalogDigest}`,migrationFingerprint:'offline-evaluation-only',processorFingerprint:'offline-evaluation-only'};
const report={schema:'ggd-batch2-package-review@1',buildHash:hash(build),target,assetRoots:assetRoots.map(path=>relative(root,path)),heroes:[],limits:['36 heroes use explicitly declared approved proxy bodies; Kisaragi uses an original tram GLB reverified from real bytes.','ZIPs are persisted under data/private/packages and reread from disk. Successful offline ZIP replay does not certify deployed importer, game rendering or arena play.','Champion and ability icons use the existing UI fallback; no original-character icon fidelity is claimed.','Uploaded-body collision radius remains 0.6; the long tram mesh needs live-game hitbox review.']};
const packageDir=resolve(dir,'private/packages');mkdirSync(packageDir,{recursive:true});
for(const h of roster){const row={id:h.id,status:'failed'};report.heroes.push(row);try{
  const p=read(`private/teachers/${h.id}.project.json`);assert.equal(hash(p),build.heroes.find(x=>x.id===h.id).projectSha256,'TEACHER_CHANGED');
  const body=await verifyProjectUploadedBody(p,documents),assetSources=new Map();
  if(h.id==='b2-kisaragi')assert(body,'KISARAGI_REQUIRES_ACTUAL_TRAM_BODY');
  const catalog={documents,readAsset:path=>{
    if(body&&path===body.document.glbPath){assetSources.set(path,{path:relative(root,body.path),origin:'original-procedural-tram',sha256:body.model.sha256,bytes:body.bytes.length});return body.bytes;}
    for(const assetRoot of assetRoots){const full=resolve(assetRoot,path);assert(full.startsWith(assetRoot+sep),'ASSET_PATH_ESCAPE');if(!existsSync(full))continue;const real=realpathSync(full);assert(real.startsWith(realpathSync(assetRoot)+sep),'ASSET_SYMLINK_ESCAPE');const bytes=readFileSync(real);assetSources.set(path,{path:relative(root,real),origin:'read-only-shipping-content',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});return new Uint8Array(bytes);}
    return undefined;
  },...(body?{validatedUploadedModel:{projectId:body.projectId,model:body.model}}:{})};
  if(body){
    assert.throws(()=>api.buildHeroImportPackage(p,{...catalog,validatedUploadedModel:undefined},target),/上傳模型尚未通過/,'DESCRIPTOR_MUST_NOT_GRANT_APPROVAL');
    const modelApi=await import(resolve(root,'packages/shared/src/content/modelUpload/heroModel.ts'));
    const tampered=body.bytes.slice();tampered[tampered.length-1]^=1;
    await assert.rejects(()=>modelApi.verifyUploadedHeroModel(body.model,tampered),undefined,'TAMPERED_BYTES_MUST_FAIL');
    row.bodyVerification={metadata:body.metadata,unverifiedDescriptorRejected:true,tamperedBytesRejected:true};
  }
  const pkg=api.buildHeroImportPackage(p,catalog,target);
  const bytes=(await zip.buildRuntimePackageZip(zip.packageZipInput(pkg,h.id))).bytes;
  const zipPath=resolve(packageDir,h.id+'.zip');writeFileSync(zipPath,bytes);
  const onDisk=new Uint8Array(readFileSync(zipPath));assert.deepEqual(onDisk,bytes,'DISK_BYTES_CHANGED');
  const reread=reader.readPackageZip(onDisk),checked=api.validateHeroImportPackage(reread,catalog);
  assert.deepEqual(checked.diagnostics,[],'PACKAGE_REPLAY_DIAGNOSTICS');
  assert.deepEqual(checked.result.project,p,'PROJECT_ROUNDTRIP_CHANGED');
  row.packageDigest=pkg.manifest.packageDigest;row.zipPath=relative(dir,zipPath);row.zipSha256=createHash('sha256').update(onDisk).digest('hex');row.zipBytes=onDisk.length;
  row.assets=pkg.assets.map(a=>{const source=assetSources.get(a.path);assert(source,'ASSET_SOURCE_UNRECORDED');const sha256='sha256:'+createHash('sha256').update(a.bytes).digest('hex');assert.equal(sha256,'sha256:'+source.sha256,'ASSET_SOURCE_CHANGED');assert.equal(pkg.manifest.entries.find(e=>e.path===a.path)?.contentSha256,sha256,'MANIFEST_ASSET_HASH_CHANGED');return {path:a.path,sha256,bytes:a.bytes.length,source};});
  row.dependencies=pkg.documents.filter(d=>d.path.startsWith('authoring/')&&!d.path.startsWith('authoring/hero-projects/')).map(d=>({path:d.path,packageSha256:pkg.manifest.entries.find(e=>e.path===d.path)?.contentSha256,source:documentSources.get(d.path.slice('authoring/'.length,-'.json'.length))??{origin:body&&d.document.id===body.document.id?'verified-original-tram-document':'generated-pinned-template-instance'}}));
  row.model={key:p.presentation.modelKey,kind:body?'original-tram-body':'explicit-proxy',animationBindings:body?.model.clipMap??documents.get('models/'+p.presentation.modelKey)?.clipMap,liveGameVerified:false};
  row.status='passed';
}catch(e){row.error=String(e);}
console.log(h.number,h.name,row.status,row.error??'');}
report.passed=report.heroes.filter(h=>h.status==='passed').length;
writeFileSync(resolve(dir,'package-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,total:roster.length}));if(report.passed!==roster.length)process.exitCode=1;
