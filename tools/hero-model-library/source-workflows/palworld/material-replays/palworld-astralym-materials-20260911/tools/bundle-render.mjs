import{createRequire}from'node:module';import{resolve,join}from'node:path';import{readdirSync}from'node:fs';
const [r,o]=process.argv.slice(2),repo=resolve(r),out=resolve(o),req=createRequire(join(repo,'package.json')),pnpm=join(repo,'node_modules/.pnpm'),esbuild=req(join(pnpm,'esbuild@0.28.1/node_modules/esbuild')); 
const core=join(pnpm,readdirSync(pnpm).find(n=>n.startsWith('@babylonjs+core@')),'node_modules/@babylonjs/core'),loaders=join(pnpm,readdirSync(pnpm).find(n=>n.startsWith('@babylonjs+loaders@')),'node_modules/@babylonjs/loaders');
await esbuild.build({entryPoints:[join(out,'tools/render.mjs')],outfile:join(out,'validation/render-bundle.js'),bundle:true,platform:'browser',format:'esm',alias:{'@babylonjs/core':core,'@babylonjs/loaders':loaders}});
