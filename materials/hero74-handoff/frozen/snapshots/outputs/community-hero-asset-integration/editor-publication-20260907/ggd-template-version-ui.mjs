import { writeFileSync } from 'node:fs';
import { connect } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const parent = await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const {targetId} = await parent.call('Target.createTarget', {url:'http://127.0.0.1:5201/editor/hero-forge'});
parent.close();
writeFileSync('/private/tmp/ggd-template-version-ui-target.json', JSON.stringify({targetId}));
const tab = await connect(targetId);
for(let i=0;i<40;i++) {
  if(await tab.evaluate('!!document.querySelector("input[aria-label=英雄名稱]")')) break;
  await new Promise(r=>setTimeout(r,250));
}
console.log(JSON.stringify({targetId, text:await tab.evaluate('document.body.innerText')}));
tab.close();
