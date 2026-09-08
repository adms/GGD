import {register} from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Read only. Binary assets remain external to this dataset's Git changes.
const assetRoot=resolve(process.argv[2]??resolve(root,'content'));
const [api,zip,reader]=await Promise.all(['heroPackage.ts','packageZip.ts','readPackageZip.ts'].map(p=>import(resolve(root,'packages/shared/src/content/import',p))));
const documents=new Map();
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)documents.set(`${c}/${d.id}`,d);}
const catalog={documents,readAsset:path=>{const full=resolve(assetRoot,path);assert(full.startsWith(assetRoot+sep),'ASSET_PATH_ESCAPE');return existsSync(full)?new Uint8Array(readFileSync(full)):undefined;}};
const build=read('report.json');
// This is an explicitly offline target, not a receipt for any deployed importer.
const target={gameRevision:build.engineCommit,contentVersion:`offline-evaluation:${build.catalogDigest}`,migrationFingerprint:'offline-evaluation-only',processorFingerprint:'offline-evaluation-only'};
const report={schema:'ggd-batch2-package-review@1',buildHash:hash(build),target,heroes:[],limits:['Proxy body only; successful ZIP replay does not certify original-character appearance or production import.','ZIP bytes are produced and reread in memory; only hashes, asset provenance and results enter Git.']};
for(const h of roster){const row={id:h.id,status:'failed'};report.heroes.push(row);try{
  const p=read(`private/teachers/${h.id}.project.json`);assert.equal(hash(p),build.heroes.find(x=>x.id===h.id).projectSha256,'TEACHER_CHANGED');
  const pkg=api.buildHeroImportPackage(p,catalog,target);
  const bytes=(await zip.buildRuntimePackageZip(zip.packageZipInput(pkg,h.id))).bytes;
  const reread=reader.readPackageZip(bytes),checked=api.validateHeroImportPackage(reread,catalog);
  assert.deepEqual(checked.diagnostics,[],'PACKAGE_REPLAY_DIAGNOSTICS');
  assert.deepEqual(checked.result.project,p,'PROJECT_ROUNDTRIP_CHANGED');
  row.packageDigest=pkg.manifest.packageDigest;row.zipSha256=createHash('sha256').update(bytes).digest('hex');row.zipBytes=bytes.length;
  row.assets=pkg.assets.map(a=>({path:a.path,sha256:a.contentSha256,bytes:a.bytes.length}));
  row.status='passed';
}catch(e){row.error=String(e);}
console.log(h.number,h.name,row.status,row.error??'');}
report.passed=report.heroes.filter(h=>h.status==='passed').length;
writeFileSync(resolve(dir,'package-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,total:roster.length}));if(report.passed!==roster.length)process.exitCode=1;
