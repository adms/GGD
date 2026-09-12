import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const [repoArg,outArg]=process.argv.slice(2);if(!repoArg||!outArg)throw Error('usage: node check_khronos.mjs <GGD repo> <new receipt directory>');
const repo=resolve(repoArg),out=resolve(outArg),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');mkdirSync(out,{recursive:false});
const req=createRequire(join(repo,'package.json'));const validator=req(join(repo,'node_modules/.pnpm/gltf-validator@2.0.0-dev.3.10/node_modules/gltf-validator'));
for(const name of ['native-res','256']) {const p=join(root,'models',`jetragon-materials-${name}.glb`);const r=await validator.validateBytes(new Uint8Array(readFileSync(p)),{uri:p,maxIssues:50000});writeFileSync(join(out,`khronos-${name}.json`),JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(name,r.issues.numErrors,r.issues.numWarnings);}
