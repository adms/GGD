import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){
  const result=nextLoad(url,context);
  if(!url.endsWith('/apps/editor-desktop/scripts/build-main.mjs'))return result;
  const source=String(result.source);
  const old='await build({ bundle: true, platform: "node", format: "cjs", entryPoints: ["src/preload.ts"]';
  if(!source.includes(old))throw Error('preload mutation target missing');
  return {...result,source:source.replace(old,'await build({ ...common, entryPoints: ["src/preload.ts"]')};
}});
