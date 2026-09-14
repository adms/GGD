const path=require('path');
const fs=require('fs');
const ROOT='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT';
const intake=path.join(ROOT,'GGD-Asset-Library/intake/public-models-20260910/parallel-community-lina-ggd-compatibility');
const p=path.join(ROOT,'GGD-hero-model-options/node_modules/.pnpm');
const r=require(path.join(p,'esbuild@0.21.5/node_modules/esbuild')).buildSync({entryPoints:[path.join(intake,'scripts/ggd-lina-compat-runtime.mjs')],bundle:true,outfile:'/private/tmp/ggd-lina-compat-runtime-bundle.js',format:'esm',platform:'browser',nodePaths:[path.join(p,'@babylonjs+core@7.54.3/node_modules')],define:{'process.env.NODE_ENV':'"development"'},metafile:true});
// Reproduction should use a new evidence directory; do not overwrite the frozen batch.
fs.writeFileSync('/private/tmp/ggd-lina-compat-runtime-build-metafile.json',JSON.stringify(r.metafile,null,2)+'\n');
