import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const repo='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge';
const proof='/private/tmp/ggd-desktop-publication-proof';
const require=createRequire(repo+'/apps/editor-desktop/package.json');
const builder=createRequire(require.resolve('electron-builder'));
const asar=createRequire(builder.resolve('app-builder-lib'))('@electron/asar');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir,prefix='') {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name),prefix+d.name+'/'):[prefix+d.name]).sort();}
const results=[];
for(const [platform,resources] of [
  ['mac',proof+'/dist/mac-universal/GGD Ability & VFX Editor.app/Contents/Resources'],
  ['win',proof+'/win-dist/win-unpacked/resources']
]) {
  const entries=[];
  for(const name of ['main.cjs','preload.cjs','heroPackageWorker.cjs']) {
    const expected=fs.readFileSync(repo+'/apps/editor-desktop/dist/'+name);
    const actual=name==='heroPackageWorker.cjs'?fs.readFileSync(resources+'/'+name):asar.extractFile(resources+'/app.asar','dist/'+name);
    assert.deepEqual(actual,expected,platform+': '+name);
    entries.push({path:name,bytes:actual.length,sha256:digest(actual)});
  }
  for(const renderer of ['editor','admin']) {
    const source=repo+'/apps/editor-desktop/dist/renderer/'+renderer;
    const target=resources+'/'+renderer;
    assert.deepEqual(files(target),files(source),platform+': '+renderer+' paths');
    for(const name of files(source)) {
      const actual=fs.readFileSync(target+'/'+name);
      assert.deepEqual(actual,fs.readFileSync(source+'/'+name),platform+': '+renderer+'/'+name);
      entries.push({path:renderer+'/'+name,bytes:actual.length,sha256:digest(actual)});
    }
  }
  results.push({platform,resources,entries});
}
fs.writeFileSync(proof+'/packaged-bytes-proof.json',JSON.stringify({scope:'Shipping payload byte comparison, not Windows runtime verification',results},null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({platform:r.platform,files:r.entries.length}))));
