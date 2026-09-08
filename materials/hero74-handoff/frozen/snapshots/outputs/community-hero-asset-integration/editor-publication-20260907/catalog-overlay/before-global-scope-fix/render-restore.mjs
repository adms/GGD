import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const out='/private/tmp/ggd-catalog-overlay-proof',bundle=JSON.parse(readFileSync(out+'/ui-restored.json')),hero=bundle.docs['champions/sela'],model=bundle.docs['models/'+hero.modelKey];
const c=await connect('A8875AD362B661AE26D4DB0D3957A18C'); await c.call('Network.enable');await c.call('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});
const shots=[];
try {
 for(const [cam,clip] of [['select','idle'],...Object.keys(model.clipMap).map(x=>['combat',x])]) {
  await c.call('Page.navigate',{url:'http://127.0.0.1:5208/champion-model-audition.html?'+new URLSearchParams({model:hero.modelKey,champion:hero.id,cam,clip,step:'600',hud:'0'})});
  const until=Date.now()+60000;let probe;
  while(Date.now()<until){const value=await c.evaluate('({done:window.__settled,probe:window.__probe?.()})');if(value.done){probe=value.probe;break;}await new Promise(r=>setTimeout(r,180));}
  assert.ok(probe,'Model audition did not settle');assert.equal(probe.error,undefined);assert.equal(probe.glbPath,model.glbPath);assert.ok(probe.meshCount>0);assert.ok(probe.renderedHeight>0);
  const boot=await c.evaluate(`import('/src/content/bootContent.ts').then(x=>x.getContentBootSnapshot())`);assert.equal(boot.result.ok,true);assert.equal(boot.result.overlayGeneration,12);assert.equal(boot.result.overlayError,undefined);
  const name='render-'+cam+'-'+clip;writeFileSync(out+'/'+name+'.json',JSON.stringify({probe,boot},null,2));const png=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(png.data,'base64'));shots.push({cam,clip,probe,boot});
 }
 writeFileSync(out+'/render-proof.json',JSON.stringify({schema:'ggd-restored-hero-render-proof@1',status:'passed',heroId:hero.id,model,shots,scope:'Existing audition runs the same validated model resolver, StorePreview, AssetManager and ClipAnimator as the player; no actual match is asserted.'},null,2));console.log(JSON.stringify({status:'passed',shots:shots.length,modelKey:hero.modelKey}));
}finally{writeFileSync(out+'/render-network.json',JSON.stringify(c.events.filter(x=>x.method==='Network.responseReceived').map(x=>({url:x.params.response.url,status:x.params.response.status})).filter(x=>x.url.includes('content-overlay')||x.url.includes('hero-instances')),null,2));c.close();}
