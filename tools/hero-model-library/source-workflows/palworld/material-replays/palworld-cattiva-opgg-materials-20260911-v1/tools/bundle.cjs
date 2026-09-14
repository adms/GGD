const {createRequire}=require('node:module');
const {resolve,join}=require('node:path');
const {realpathSync}=require('node:fs');
const [repoArg,entryArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node bundle.cjs <repo> <render.mjs> <new-bundle.js>');
const repo=resolve(repoArg),tsx=createRequire(realpathSync(join(repo,'node_modules/tsx/package.json')));
const esbuild=tsx('esbuild');
esbuild.buildSync({entryPoints:[resolve(entryArg)],outfile:resolve(outArg),bundle:true,format:'esm',platform:'browser',nodePaths:[join(repo,'apps/client/node_modules')],minify:false});
